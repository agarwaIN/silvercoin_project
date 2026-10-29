const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const db = require('../services/mongoService');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleCheck');
const { auditLog } = require('../middleware/auditMiddleware');
const { generateTempPassword } = require('../utils/password');
const { mobileField } = require('../utils/phoneValidator');
const { sendCredentials } = require('../services/emailService');
const multer = require('multer');
const { uploadBuffer, getPresignedUrl, deleteFile } = require('../services/localFileStorageService');
const { ensureEmiSchedule, updateEmiScheduleDates, rescheduleEmis, closeEmisForForeclosure, buildLoanRecoveryItems, recordLoanPayment, hasFirstEmiBeenCollected, calculateForeclosureDetails } = require('../services/emiService');
const notificationService = require('../services/notificationService');

const employeeNameCache = new Map();

async function enrichLoanWithEmployeeName(loan) {
  if (!loan) return loan;
  let employeeName = loan.employeeName || loan.submittedByEmployeeName;
  if (!employeeName && loan.employeeId) {
    if (employeeNameCache.has(loan.employeeId)) {
      employeeName = employeeNameCache.get(loan.employeeId);
    } else {
      try {
        const emp = await db.getUserById(loan.employeeId);
        if (emp) {
          employeeName = emp.name || emp.email;
          employeeNameCache.set(loan.employeeId, employeeName);
        }
      } catch (e) {}
    }
  }
  const submittedAt = loan.submittedAt || (loan.status !== 'draft' ? (loan.createdAt || loan.updatedAt) : null);
  return { ...loan, employeeName: employeeName || null, submittedAt };
}


const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 150 * 1024 * 1024 },
});

const router = express.Router();
router.use(verifyToken, requireRole('admin'), auditLog);

function notImplemented(res) {
  return res.status(501).json({ message: 'Not implemented yet' });
}

router.get('/employees', async (req, res) => {
  const users = await db.listUsersByCreator(req.user.userId);
  res.json(users.filter((u) => u.role === 'employee'));
});

router.post('/create-employee', [
  body('name').trim().notEmpty(),
  body('email').isEmail().normalizeEmail(),
  mobileField('mobile'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { name, email, mobile, accessRights } = req.body;
  const [existingEmail, existingMobile] = await Promise.all([
    db.getUserByEmail(email),
    db.getUserByMobile(mobile),
  ]);
  if (existingEmail) return res.status(409).json({ message: 'Email already registered' });
  if (existingMobile) return res.status(409).json({ message: 'Mobile number already registered' });

  const password = generateTempPassword();
  const passwordHash = await bcrypt.hash(password, 12);
  const userId = uuidv4();
  const now = new Date().toISOString();
  const defaultRights = ['loan_creation', 'doc_verification', 'emi_collection'];
  const user = {
    userId,
    name,
    email,
    mobile,
    passwordHash,
    role: 'employee',
    accessRights: Array.isArray(accessRights) && accessRights.length > 0 ? accessRights : defaultRights,
    isFirstLogin: true,
    isActive: true,
    createdBy: req.user.userId,
    createdAt: now,
  };
  await db.createUser(user);
  await sendCredentials({ name, email, password, role: 'employee' });
  console.log(`[credentials] employee ${email} temp password: ${password}`);
  res.status(201).json({ message: 'Employee created successfully.', userId, tempPassword: password, accessRights: user.accessRights });
});

router.patch('/employees/:userId/access-rights', async (req, res) => {
  const user = await db.getUserById(req.params.userId);
  if (!user || user.createdBy !== req.user.userId || user.role !== 'employee') {
    return res.status(404).json({ message: 'Employee not found' });
  }
  const { accessRights } = req.body;
  if (!Array.isArray(accessRights)) {
    return res.status(400).json({ message: 'accessRights must be an array' });
  }
  await db.updateUser(user.userId, { accessRights });
  res.json({ message: 'Employee access rights updated', accessRights });
});

router.patch('/employees/:userId/deactivate', async (req, res) => {
  const user = await db.getUserById(req.params.userId);
  if (!user || user.createdBy !== req.user.userId || user.role !== 'employee') {
    return res.status(404).json({ message: 'Employee not found' });
  }
  await db.updateUser(user.userId, { isActive: false });
  res.json({ message: 'Employee deactivated' });
});

router.delete('/employees/:userId', async (req, res) => {
  const user = await db.getUserById(req.params.userId);
  if (!user || user.createdBy !== req.user.userId || user.role !== 'employee') {
    return res.status(404).json({ message: 'Employee not found' });
  }
  await db.deleteUser(user.userId);
  res.json({ message: 'Employee deleted' });
});

function getLoanSubmissionTime(loan) {
  if (!loan) return 0;
  if (loan.submittedAt) {
    const t = new Date(loan.submittedAt).getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  if (loan.submissionDate) {
    const t = new Date(loan.submissionDate).getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  if (loan.status === 'draft') {
    const t = new Date(loan.createdAt || loan.updatedAt || 0).getTime();
    return isNaN(t) ? 0 : t;
  }
  if (loan.status === 'submitted' && loan.updatedAt) {
    const t = new Date(loan.updatedAt).getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  const c = new Date(loan.createdAt || 0).getTime();
  if (!isNaN(c) && c > 0) return c;
  const u = new Date(loan.updatedAt || 0).getTime();
  return isNaN(u) ? 0 : u;
}

function getNumericSeq(loan) {
  if (!loan) return 0;
  const str = String(loan.applicationNumber || loan.displayLoanId || loan.loanId || '');
  const m = str.match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
}

router.get('/loans', async (req, res) => {
  try {
    const loans = await db.listLoansByAdmin(req.user.userId);
    const enriched = await Promise.all((loans || []).map(l => enrichLoanWithEmployeeName(l)));
    enriched.sort((a, b) => {
      const bTime = getLoanSubmissionTime(b);
      const aTime = getLoanSubmissionTime(a);
      if (bTime !== aTime) {
        return bTime - aTime;
      }
      const bAlt = new Date(b.createdAt || b.updatedAt || 0).getTime();
      const aAlt = new Date(a.createdAt || a.updatedAt || 0).getTime();
      if (bAlt !== aAlt) {
        return bAlt - aAlt;
      }
      return getNumericSeq(b) - getNumericSeq(a);
    });
    res.json(enriched);
  } catch (err) {
    console.error('Error fetching admin loans:', err);
    res.status(500).json({ message: 'Failed to fetch loans' });
  }
});

router.get('/loans/:loanId', async (req, res) => {
  try {
    const loan = await db.getLoanById(req.params.loanId);
    if (!loan || (loan.adminId && loan.adminId !== req.user.userId)) {
      return res.status(404).json({ message: 'Loan not found' });
    }
    const emis = await ensureEmiSchedule(loan);
    const enriched = await enrichLoanWithEmployeeName(loan);
    const firstEmiCollected = !!(loan.firstEmiCollected || (emis || []).some(e => e.status === 'paid' || e.status === 'partial' || Number(e.paidAmount || 0) > 0));
    res.json({ ...enriched, emis, firstEmiCollected });
  } catch (err) {
    console.error('Error fetching loan details in /admin/loans/:loanId:', err);
    res.status(500).json({ message: err.message || 'Failed to fetch loan details' });
  }
});

router.get('/profile', async (req, res) => {
  const user = await db.getUserById(req.user.userId);
  res.json({
    name: user.name,
    email: user.email,
    mobile: user.mobile,
    organizationLogoUrl: null,
  });
});

router.patch('/profile', async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ message: 'Name is required' });
  await db.updateUser(req.user.userId, { name });
  res.json({ message: 'Profile updated' });
});

router.get('/emi-this-month', async (req, res) => {
  try {
    const loans = await db.listLoansByAdmin(req.user.userId);
    const now = new Date();
    const currentMonth = now.toISOString().slice(0, 7); // YYYY-MM
    let totalCount = 0;
    let totalAmount = 0;

    const allEmisArrays = await Promise.all(
      (loans || []).map(l => db.listEmiByLoan(l.loanId).catch(() => []))
    );

    for (const emis of allEmisArrays) {
      for (const emi of (emis || [])) {
        if ((emi.status === 'paid' || emi.status === 'partial') && emi.paidDate && emi.paidDate.startsWith(currentMonth)) {
          totalCount++;
          totalAmount += Number(emi.paidAmount || 0);
        }
      }
    }
    res.json({ count: totalCount, totalAmount });
  } catch (err) {
    res.json({ count: 0, totalAmount: 0 });
  }
});

router.get('/recovery', async (req, res) => {
  try {
    const loans = await db.listLoansByAdmin(req.user.userId);
    const recoveryItems = await buildLoanRecoveryItems(loans || []);
    res.json(recoveryItems);
  } catch (err) {
    console.error('Recovery Fetch Error:', err);
    res.status(500).json({ message: 'Failed to fetch recovery items' });
  }
});

router.post('/loans/:loanId/pay-emi', async (req, res) => {
  try {
    const loan = await db.getLoanById(req.params.loanId);
    if (!loan || (loan.adminId && loan.adminId !== req.user.userId)) return res.status(404).json({ message: 'Loan not found' });

    const isDisbursed = Boolean(
      loan.status === 'active' ||
      loan.status === 'completed' ||
      (Array.isArray(loan.disbursements) && loan.disbursements.length > 0) ||
      loan.disbursementDate
    );
    if (!isDisbursed) {
      return res.status(400).json({ message: 'EMI collection is not allowed until the loan has been disbursed.' });
    }

    const { paymentId, amount, paymentMode, transactionRef, txnRef, paymentDate, date, penaltyAmount, collectPenalty, customPenalty, waivePenalty } = req.body;
    const result = await recordLoanPayment(loan.loanId, paymentId, amount, req.user.userId, {
      paymentMode,
      transactionRef: transactionRef || txnRef,
      txnRef: txnRef || transactionRef,
      paymentDate: paymentDate || date,
      date: paymentDate || date,
      penaltyAmount: penaltyAmount !== undefined ? penaltyAmount : customPenalty,
      collectPenalty: collectPenalty !== undefined ? collectPenalty : true,
      waivePenalty: Boolean(waivePenalty),
    });
    res.json({ message: 'Payment recorded successfully', ...result });
  } catch (err) {
    console.error('Pay EMI Error:', err);
    res.status(400).json({ message: err.message || 'Failed to record payment' });
  }
});

router.post('/loans/:loanId/emis/:paymentId/waive-penalty', async (req, res) => {
  try {
    const loan = await db.getLoanById(req.params.loanId);
    if (!loan || (loan.adminId && loan.adminId !== req.user.userId)) return res.status(404).json({ message: 'Loan not found' });

    const { paymentId } = req.params;
    const { reason } = req.body;

    await db.updateEmiPayment(paymentId, {
      penaltyAmount: 0,
      penaltyWaived: true,
      penaltyLocked: true,
      penaltyWaivedBy: req.user.userId,
      penaltyWaivedAt: new Date().toISOString(),
      penaltyWaiveReason: reason || 'Waived by admin',
    });

    res.json({ success: true, message: 'Penalty waived off successfully' });
  } catch (err) {
    console.error('Waive Penalty Error:', err);
    res.status(500).json({ message: err.message || 'Failed to waive penalty' });
  }
});

router.post('/loans/:loanId/emis/:paymentId/update-penalty', async (req, res) => {
  try {
    const loan = await db.getLoanById(req.params.loanId);
    if (!loan || (loan.adminId && loan.adminId !== req.user.userId)) return res.status(404).json({ message: 'Loan not found' });

    const { paymentId } = req.params;
    const { penaltyAmount } = req.body;

    const newPenalty = Math.max(0, Number(penaltyAmount || 0));
    const isWaived = newPenalty === 0;

    await db.updateEmiPayment(paymentId, {
      penaltyAmount: newPenalty,
      penaltyWaived: isWaived,
      penaltyLocked: true,
      penaltyUpdatedAt: new Date().toISOString(),
      penaltyUpdatedBy: req.user.userId,
    });

    res.json({ success: true, penaltyAmount: newPenalty, message: isWaived ? 'Penalty waived off' : 'Penalty updated successfully' });
  } catch (err) {
    console.error('Update Penalty Error:', err);
    res.status(500).json({ message: err.message || 'Failed to update penalty' });
  }
});

router.get('/loans/check-aadhaar', async (req, res) => {
  try {
    const { aadhaar, excludeLoanId } = req.query;
    if (!aadhaar) return res.json({ exists: false });
    const existing = await db.findLoanByAadhaar(aadhaar, excludeLoanId);
    if (existing) {
      return res.json({
        exists: true,
        loanId: existing.displayLoanId || existing.applicationNumber || existing.loanId,
        ownerName: existing.ownerName,
        status: existing.status,
      });
    }
    return res.json({ exists: false });
  } catch (err) {
    console.error('Check Aadhaar Error:', err);
    res.json({ exists: false });
  }
});

router.get('/recovery-agents', async (req, res) => {
  const users = await db.listUsersByCreator(req.user.userId);
  const recoveryEmps = users.filter(u => u.role === 'employee' && (u.accessRights?.includes('emi_collection') || !u.accessRights));
  res.json(recoveryEmps);
});

router.get('/reports', async (req, res) => {
  try {
    const adminId = req.user.userId;
    const [rawLoans, employees] = await Promise.all([
      db.listLoansByAdmin(adminId),
      db.listUsersByCreator(adminId),
    ]);
    const loans = rawLoans || [];

    const emps = employees.filter(e => e.role === 'employee');

    const todayStr = new Date().toISOString().split('T')[0];
    let dailyApplications = 0;
    let loanApprovals = 0;
    let totalDisbursement = 0;
    let loanOutstanding = 0;
    let interestEarned = 0;
    let penaltyEarned = 0;
    let totalCollections = 0;

    let pendingRecoveryCount = 0;

    const empStats = emps.reduce((acc, emp) => {
      acc[emp.userId] = {
        name: emp.name,
        pendingTasks: 0,
        productivity: 0,
        collections: 0,
      };
      return acc;
    }, {});

    const activeLoanIds = loans.filter(l => l.status === 'active' || (Array.isArray(l.disbursements) && l.disbursements.length > 0)).map(l => l.loanId);
    
    const emiPromises = loans.map(l => db.listEmiByLoan(l.loanId));
    const allEmisNested = await Promise.all(emiPromises);
    
    for (let i = 0; i < loans.length; i++) {
      const loan = loans[i];
      const emis = allEmisNested[i];
      
      const isToday = loan.createdAt && loan.createdAt.startsWith(todayStr);
      if (isToday) dailyApplications++;
      
      if (['approved', 'active', 'completed'].includes(loan.status)) {
        loanApprovals++;
      }
      if (loan.status === 'active' || loan.status === 'completed' || (Array.isArray(loan.disbursements) && loan.disbursements.length > 0)) {
        totalDisbursement += Number(loan.approvedAmount || loan.loanAmount || 0);
      }

      if (['submitted', 'agreement_submitted'].includes(loan.status) && loan.employeeId && empStats[loan.employeeId]) {
        empStats[loan.employeeId].pendingTasks++;
      }
      
      if (['approved', 'active', 'completed'].includes(loan.status) && loan.employeeId && empStats[loan.employeeId]) {
        empStats[loan.employeeId].productivity++;
      }

      let loanTotalCollected = 0;
      let loanInterest = 0;
      let loanPenalty = 0;
      let hasPendingEmi = false;

      for (const emi of emis) {
        if (emi.status === 'paid' || emi.status === 'partial') {
          const amountPaid = Number(emi.paidAmount || 0);
          loanTotalCollected += amountPaid;
          // Rough approximation if interestPart is not stored:
          loanInterest += Number(emi.interestPart || (amountPaid * 0.1));
          loanPenalty += Number(emi.penaltyAmount || 0);
        } else if (emi.status === 'pending' || emi.status === 'overdue') {
          hasPendingEmi = true;
        }
      }
      
      totalCollections += loanTotalCollected;
      interestEarned += loanInterest;
      penaltyEarned += loanPenalty;
      
      if (loan.employeeId && empStats[loan.employeeId]) {
        empStats[loan.employeeId].collections += loanTotalCollected;
      }
      
      if (hasPendingEmi) {
        pendingRecoveryCount++;
      }
      
      if (['active', 'approved'].includes(loan.status)) {
         loanOutstanding += Number(loan.totalRepayable || 0) - loanTotalCollected;
      }
    }

    res.json({
      operational: {
        dailyApplications,
        loanApprovals,
        totalDisbursement,
        activeLoans: activeLoanIds.length,
        pendingRecovery: pendingRecoveryCount,
      },
      financial: {
        loanOutstanding: Math.max(0, loanOutstanding),
        interestEarned,
        penalty: penaltyEarned,
        collectionSummary: totalCollections,
      },
      employee: Object.values(empStats),
    });
  } catch (err) {
    console.error('Reports Error:', err);
    res.status(500).json({ message: 'Failed to generate reports' });
  }
});

router.post('/create-recovery-agent', (req, res) => {
  res.status(201).json({ message: 'Agent created' });
});

router.get('/loans/:loanId/media-preview', async (req, res) => {
  try {
    const loan = await db.getLoanById(req.params.loanId);
    if (!loan) return res.status(404).json({ message: 'Loan not found' });
    
    const urls = [];
    const seenKeys = new Set();

    const addMediaUrl = async (type, name, uri, extra = {}) => {
      let rawUri = uri;
      if (typeof uri === 'object' && uri !== null) {
        rawUri = uri.uri || uri.url || uri.key || '';
      }
      if (!rawUri || typeof rawUri !== 'string') return;
      const cleanUri = rawUri.trim();
      if (!cleanUri || cleanUri.startsWith('file:') || cleanUri.startsWith('content:') || cleanUri.startsWith('blob:')) return;

      const dedupeKey = `${type}_${cleanUri}`;
      if (seenKeys.has(dedupeKey)) return;

      try {
        const url = await getPresignedUrl(cleanUri);
        if (url) {
          urls.push({ type, name, url, key: cleanUri, uri: cleanUri, ...extra });
          seenKeys.add(dedupeKey);
        }
      } catch (e) {
        console.warn('Failed to generate presigned URL for', cleanUri, e.message);
      }
    };

    if (loan.videoUri) await addMediaUrl('video', 'Owner Verification Video', loan.videoUri, { videoType: 'owner' });
    if (loan.houseVideoUri) await addMediaUrl('video', 'House / Property Video', loan.houseVideoUri, { videoType: 'house' });
    if (Array.isArray(loan.videos)) {
      for (const v of loan.videos) {
        if (v) {
          const vUri = typeof v === 'string' ? v : (v.uri || v.url || v.key);
          const vLabel = (typeof v === 'object' && v.name) || (v.videoType === 'house' ? 'House / Property Video' : 'Owner Verification Video');
          await addMediaUrl('video', vLabel, vUri, { videoType: (typeof v === 'object' && v.videoType) || (vLabel.toLowerCase().includes('house') ? 'house' : 'owner') });
        }
      }
    }
    if (Array.isArray(loan.propertyPhotos)) {
      for (let idx = 0; idx < loan.propertyPhotos.length; idx++) {
        const p = loan.propertyPhotos[idx];
        if (p) {
          const pUri = typeof p === 'string' ? p : (p.uri || p.url || p.key);
          const isVid = (typeof p === 'object' && p.type === 'video') || (typeof pUri === 'string' && (pUri.toLowerCase().endsWith('.mp4') || pUri.toLowerCase().includes('video')));
          const pLabel = (typeof p === 'object' && p.name) || (isVid ? 'House / Property Video' : (loan.propertyPhotos.length > 1 ? `Property Photo ${idx + 1}` : 'Property Photo'));
          await addMediaUrl(isVid ? 'video' : 'photo', pLabel, pUri, { mimeType: isVid ? 'video/mp4' : 'image/jpeg' });
        }
      }
    }
    if (Array.isArray(loan.propertyDocs)) {
      for (const d of loan.propertyDocs) {
        if (d) {
          const dUri = typeof d === 'string' ? d : (d.uri || d.url || d.key);
          await addMediaUrl('document', (typeof d === 'object' && (d.name || d.docType)) || 'Property Document', dUri, {
            docType: typeof d === 'object' ? d.docType : 'Document',
            date: typeof d === 'object' ? d.date : null,
            mimeType: typeof d === 'object' ? d.mimeType : null,
            id: typeof d === 'object' ? d.id : null,
          });
        }
      }
    }
    if (loan.agreementUri) await addMediaUrl('document', 'Loan Agreement', loan.agreementUri, { docType: 'Loan Agreement' });
    res.json(urls);
  } catch (err) {
    console.error('Error in /admin/loans/:loanId/media-preview:', err);
    res.json([]);
  }
});

function parseDateInput(str) {
  if (!str) return null;
  let s = String(str).trim();
  if (!s) return null;
  if (s.includes('T')) s = s.split('T')[0];
  const ddmmyyyyMatch = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if (ddmmyyyyMatch) {
    const day = String(ddmmyyyyMatch[1]).padStart(2, '0');
    const month = String(ddmmyyyyMatch[2]).padStart(2, '0');
    const year = ddmmyyyyMatch[3];
    return `${year}-${month}-${day}`;
  }
  const yyyymmddMatch = s.match(/^(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})$/);
  if (yyyymmddMatch) {
    const year = yyyymmddMatch[1];
    const month = String(yyyymmddMatch[2]).padStart(2, '0');
    const day = String(yyyymmddMatch[3]).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return s.slice(0, 10);
}

router.post('/loans/:loanId/update-dates', async (req, res) => {
  try {
    const loan = await db.getLoanById(req.params.loanId);
    if (!loan) return res.status(404).json({ message: 'Loan not found' });
    if (loan.adminId && loan.adminId !== req.user.userId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { disbursementDate, emiStartDate } = req.body;
    const parsedDisbDate = parseDateInput(disbursementDate);
    const parsedEmiDate = parseDateInput(emiStartDate);
    const updates = {};

    if (parsedDisbDate) {
      updates.disbursementDate = parsedDisbDate;
      const disbursements = Array.isArray(loan.disbursements) ? [...loan.disbursements] : [];
      if (disbursements.length > 0) {
        disbursements[0] = { ...disbursements[0], date: parsedDisbDate };
      } else {
        disbursements.push({
          date: parsedDisbDate,
          amount: loan.approvedAmount || loan.loanAmount || 0,
          bankName: 'N/A',
          transactionNumber: 'N/A',
        });
      }
      updates.disbursements = disbursements;
    }

    if (parsedEmiDate) {
      updates.emiStartDate = parsedEmiDate;
      updates.loanStartDate = parsedEmiDate;
    }

    if (Object.keys(updates).length > 0) {
      await db.updateLoan(loan.loanId, updates);
      if (parsedEmiDate) {
        await updateEmiScheduleDates(loan.loanId, parsedEmiDate);
      }
    }

    const updatedLoan = await db.getLoanById(loan.loanId);
    const enriched = await enrichLoanWithEmployeeName(updatedLoan);
    res.json({ message: 'Dates updated successfully', loan: enriched });
  } catch (err) {
    console.error('Error in /admin/loans/:loanId/update-dates:', err);
    res.status(500).json({ message: err.message || 'Failed to update dates' });
  }
});


router.post('/loans/:loanId/initial-approve', async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  if (!loan) return res.status(404).json({ message: 'Loan not found' });
  await db.updateLoan(loan.loanId, { status: 'initially_approved', approvedAmount: req.body.approvedAmount });
  db.getLoanById(loan.loanId).then(l => {
    if (l) notificationService.notifyLoanInitiallyApproved(l, req.user).catch(() => {});
  }).catch(() => {});
  res.json({ message: 'Loan initially approved' });
});

router.post('/loans/:loanId/process', async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  if (!loan) return res.status(404).json({ message: 'Loan not found' });
  
  const { internalRemarks, riskAssessment } = req.body;
  await db.updateLoan(loan.loanId, { 
    internalRemarks, 
    riskAssessment,
    status: 'processing' 
  });
  res.json({ message: 'Loan processing details saved' });
});

router.post('/loans/:loanId/return', async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  if (!loan) return res.status(404).json({ message: 'Loan not found' });
  
  const { reason } = req.body;
  await db.updateLoan(loan.loanId, { 
    status: 'returned',
    rejectionReason: reason,
    returnReason: reason,
    rejectReason: reason,
    remark: reason,
  });
  db.getLoanById(loan.loanId).then(l => {
    if (l) notificationService.notifyLoanReturned(l, req.user, reason).catch(() => {});
  }).catch(() => {});
  res.json({ message: 'Loan returned to employee' });
});

router.post('/loans/:loanId/disburse', async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  if (!loan) return res.status(404).json({ message: 'Loan not found' });
  if (loan.status !== 'approved' && loan.status !== 'active') {
    return res.status(400).json({ message: 'Loan must be approved to disburse' });
  }

  const { date, amount, bankName, transactionNumber, remark } = req.body;
  if (!date || !amount || !bankName || !transactionNumber) {
    return res.status(400).json({ message: 'Missing disbursement details' });
  }

  const isDup = db.findTransactionRefExists ? await db.findTransactionRefExists(transactionNumber) : false;
  if (isDup) {
    return res.status(400).json({ message: `Transaction number "${transactionNumber}" has already been used in the system.` });
  }

  const disbursements = loan.disbursements || [];
  const normalizedDate = parseDateInput(date) || date;
  disbursements.push({ date: normalizedDate, amount, bankName, transactionNumber, remark: remark ? remark.trim() : '' });

  const updates = { 
    disbursements, 
    status: 'active', 
    disbursementDate: normalizedDate,
    ...(remark ? { disbursementRemark: remark.trim() } : {})
  };
  
  // Generate displayLoanId on first disbursement if not exists
  if (!loan.displayLoanId && !loan.officialLoanId) {
    const { generateDisplayLoanId } = require('../services/loanIdService');
    updates.displayLoanId = await generateDisplayLoanId();
  } else if (!loan.displayLoanId && loan.officialLoanId) {
    updates.displayLoanId = loan.officialLoanId;
  }

  await db.updateLoan(loan.loanId, updates);
  const updatedLoan = await db.getLoanById(loan.loanId);
  await ensureEmiSchedule(updatedLoan);
  notificationService.notifyLoanDisbursed(updatedLoan, req.user, amount).catch(err => {
    console.warn('[Notification] Failed to emit loan disbursed notification:', err.message);
  });
  res.json({ message: 'Disbursement recorded', displayLoanId: updates.displayLoanId || loan.displayLoanId });
});

router.post('/loans/:loanId/approve', async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  if (!loan) return res.status(404).json({ message: 'Loan not found' });
  
  const { loanStartDate, approvedAmount, interestRate, penaltyRate, tenureMonths, emiAmount, totalInterest, totalRepayable } = req.body;
  
  await db.updateLoan(loan.loanId, { 
    status: 'approved', 
    loanStartDate, 
    approvedAmount, 
    interestRate, 
    penaltyRate, 
    tenureMonths, 
    emiAmount, 
    totalInterest, 
    totalRepayable,
    changedFields: null 
  });
  const updatedLoan = await db.getLoanById(loan.loanId);
  await ensureEmiSchedule(updatedLoan);
  notificationService.notifyLoanApproved(updatedLoan, req.user).catch(err => {
    console.warn('[Notification] Failed to emit loan approved notification:', err.message);
  });
  res.json({ message: 'Loan fully approved' });
});

router.post('/loans/:loanId/reject', async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  if (!loan) return res.status(404).json({ message: 'Loan not found' });
  const reason = req.body.reason || '';
  await db.updateLoan(loan.loanId, { 
    status: 'rejected', 
    rejectReason: reason,
    rejectionReason: reason,
    returnReason: reason,
    remark: reason,
    changedFields: null 
  });
  db.getLoanById(loan.loanId).then(l => {
    if (l) notificationService.notifyLoanRejected(l, req.user, reason).catch(() => {});
  }).catch(() => {});
  res.json({ message: 'Loan rejected' });
});

router.post('/loans/:loanId/send-qr', (req, res) => res.json({ message: 'QR sent' }));
router.post('/loans/:loanId/reject-proof', (req, res) => res.json({ message: 'Proof rejected' }));
router.post('/loans/:loanId/assign-recovery-agent', (req, res) => res.json({ message: 'Agent assigned' }));
router.post('/loans/:loanId/send-qr-to-agent', (req, res) => res.json({ message: 'QR sent to agent' }));

router.post('/loans/:loanId/approve-emi-change', async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  if (!loan) return res.status(404).json({ message: 'Loan not found' });
  if (!loan.emiChangeRequest) return res.status(400).json({ message: 'No pending EMI change request' });

  const {
    approvedAmount,
    tenureMonths,
    interestRate,
    penaltyRate,
    emiAmount,
    totalInterest,
    totalRepayable
  } = loan.emiChangeRequest;

  await db.updateLoan(loan.loanId, {
    approvedAmount,
    tenureMonths,
    interestRate,
    penaltyRate,
    emiAmount,
    totalInterest,
    totalRepayable,
    emiChangeRequest: {
      ...loan.emiChangeRequest,
      status: 'approved'
    }
  });

  const freshLoan = await db.getLoanById(loan.loanId);
  await rescheduleEmis(freshLoan, freshLoan.emiChangeRequest);
  db.getLoanById(loan.loanId).then(l => {
    if (l) notificationService.notifyEmiChangeApproved(l, req.user).catch(() => {});
  }).catch(() => {});

  res.json({ message: 'EMI change request approved' });
});

router.post('/loans/:loanId/reject-emi-change', async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  if (!loan) return res.status(404).json({ message: 'Loan not found' });
  if (!loan.emiChangeRequest) return res.status(400).json({ message: 'No pending EMI change request' });

  await db.updateLoan(loan.loanId, { 
    emiChangeRequest: {
      ...loan.emiChangeRequest,
      status: 'rejected'
    }
  });
  db.getLoanById(loan.loanId).then(l => {
    if (l) notificationService.notifyEmiChangeRejected(l, req.user).catch(() => {});
  }).catch(() => {});
  res.json({ message: 'EMI change request rejected' });
});

router.get('/loans/:loanId/foreclosure-quote', async (req, res) => {
  try {
    const loan = await db.getLoanById(req.params.loanId);
    if (!loan) return res.status(404).json({ message: 'Loan not found' });
    const quote = await calculateForeclosureDetails(loan, req.query.date);
    res.json(quote);
  } catch (err) {
    console.error('Error calculating foreclosure quote:', err);
    res.status(500).json({ message: 'Failed to calculate foreclosure quote' });
  }
});

router.post('/loans/:loanId/approve-foreclosure', async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  if (!loan) return res.status(404).json({ message: 'Loan not found' });
  
  if (!loan.foreclosureRequest || loan.foreclosureRequest.status !== 'pending') {
    return res.status(400).json({ message: 'No pending foreclosure request' });
  }

  const effectiveCloseDate = req.body.foreclosureDate || new Date().toISOString().slice(0, 10);
  const totalAmount = Number(req.body.totalAmount || loan.foreclosureRequest.foreclosureAmount || 0);

  // Update loan status to completed (foreclosed)
  await db.updateLoan(loan.loanId, {
    status: 'completed',
    isForeclosed: true,
    foreclosureDate: effectiveCloseDate,
    foreclosureRequest: {
      ...loan.foreclosureRequest,
      status: 'approved',
      approvedAt: new Date().toISOString()
    }
  });

  await closeEmisForForeclosure(loan.loanId, effectiveCloseDate, loan.foreclosureRequest.reason);

  res.json({ message: 'Foreclosure approved and loan completed' });
});

router.post('/loans/:loanId/foreclose', async (req, res) => {
  try {
    const loan = await db.getLoanById(req.params.loanId);
    if (!loan) return res.status(404).json({ message: 'Loan not found' });
    if (loan.status === 'completed') {
      return res.status(400).json({ message: 'Loan is already completed/foreclosed' });
    }

    const {
      foreclosureDate,
      principalAmount,
      interestAmount,
      penaltyAmount,
      totalAmount,
      penaltyApplicable,
      monthsElapsed,
      daysInterestCalculated,
      lastCoveredDate,
      paymentModes,
      reason
    } = req.body;

    const principal = Math.round(Number(principalAmount || 0));
    const interest = Math.round(Number(interestAmount || 0));
    const penalty = Math.round(Number(penaltyAmount || 0));
    const total = Math.round(Number(totalAmount !== undefined ? totalAmount : (principal + interest + penalty)));

    if (principal < 0 || interest < 0 || penalty < 0 || total <= 0) {
      return res.status(400).json({ message: 'Invalid foreclosure settlement amount breakdown' });
    }

    // Validate payment modes
    const modes = Array.isArray(paymentModes) && paymentModes.length > 0 ? paymentModes : [
      { mode: 'Cash', amount: total, txnRef: req.body.txnRef || `FC-${Date.now()}` }
    ];

    let allocatedTotal = 0;
    const cleanPaymentModes = [];

    for (let i = 0; i < modes.length; i++) {
      const p = modes[i];
      const pAmt = Number(p.amount || 0);
      const pRef = String(p.txnRef || p.reference || '').trim();
      const pMode = String(p.mode || 'Cash').trim();
      const pBank = p.bankName ? String(p.bankName).trim() : null;
      const pDate = p.date || foreclosureDate || new Date().toISOString().slice(0, 10);

      if (isNaN(pAmt) || pAmt <= 0) {
        return res.status(400).json({ message: `Payment mode #${i + 1} has an invalid amount: ₹${p.amount}` });
      }
      if (!pRef) {
        return res.status(400).json({ message: `Receipt / Reference number is required for payment mode #${i + 1} (${pMode})` });
      }

      allocatedTotal += pAmt;
      cleanPaymentModes.push({
        mode: pMode,
        amount: pAmt,
        txnRef: pRef,
        bankName: pBank,
        date: pDate,
      });
    }

    // Check if total allocated matches total settlement amount (allow ₹1 rounding margin)
    if (Math.abs(allocatedTotal - total) > 1) {
      return res.status(400).json({
        message: `Sum of payment modes (₹${allocatedTotal.toLocaleString('en-IN')}) does not match total settlement amount (₹${total.toLocaleString('en-IN')})`
      });
    }

    const effectiveCloseDate = foreclosureDate || new Date().toISOString().slice(0, 10);
    const foreclosureDetails = {
      foreclosureDate: effectiveCloseDate,
      principalAmount: principal,
      interestAmount: interest,
      penaltyAmount: penalty,
      totalAmount: total,
      penaltyApplicable: Boolean(penaltyApplicable),
      monthsElapsed: Number(monthsElapsed || 0),
      daysInterestCalculated: Number(daysInterestCalculated || 0),
      lastCoveredDate: lastCoveredDate || null,
      paymentModes: cleanPaymentModes,
      reason: reason ? String(reason).trim() : 'Loan foreclosed by admin',
      foreclosedBy: req.user.userId,
      foreclosedByName: req.user.name,
      foreclosedAt: new Date().toISOString()
    };

    await db.updateLoan(loan.loanId, {
      status: 'completed',
      isForeclosed: true,
      foreclosureDate: effectiveCloseDate,
      foreclosureDetails,
      foreclosureRequest: {
        status: 'approved',
        foreclosureAmount: total,
        reason: reason || 'Admin direct foreclosure',
        approvedBy: req.user.userId,
        approvedAt: new Date().toISOString()
      }
    });

    await closeEmisForForeclosure(loan.loanId, effectiveCloseDate, reason);
    db.getLoanById(loan.loanId).then(l => {
      if (l) notificationService.notifyLoanForeclosed(l, req.user, total).catch(() => {});
    }).catch(() => {});

    res.json({
      message: 'Loan foreclosed and settled successfully',
      foreclosureDetails
    });
  } catch (err) {
    console.error('Error foreclosing loan:', err);
    res.status(500).json({ message: err.message || 'Failed to foreclose loan' });
  }
});

router.post('/loans/:loanId/change-emi', async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  if (!loan) return res.status(404).json({ message: 'Loan not found' });

  const {
    approvedAmount,
    tenureMonths,
    interestRate,
    penaltyRate,
    emiAmount,
    totalInterest,
    totalRepayable
  } = req.body;

  const updates = {
    approvedAmount: Number(approvedAmount) || loan.approvedAmount,
    tenureMonths: parseInt(tenureMonths, 10) || loan.tenureMonths,
    interestRate: Number(interestRate) || loan.interestRate,
    penaltyRate: Number(penaltyRate) || loan.penaltyRate,
    emiAmount: Number(emiAmount) || loan.emiAmount,
    totalInterest: Number(totalInterest) || loan.totalInterest,
    totalRepayable: Number(totalRepayable) || loan.totalRepayable,
    emiChangeRequest: {
      approvedAmount: Number(approvedAmount) || loan.approvedAmount,
      tenureMonths: parseInt(tenureMonths, 10) || loan.tenureMonths,
      interestRate: Number(interestRate) || loan.interestRate,
      penaltyRate: Number(penaltyRate) || loan.penaltyRate,
      emiAmount: Number(emiAmount) || loan.emiAmount,
      totalInterest: Number(totalInterest) || loan.totalInterest,
      totalRepayable: Number(totalRepayable) || loan.totalRepayable,
      status: 'approved',
      requestedBy: req.user.userId,
      approvedAt: new Date().toISOString()
    }
  };

  await db.updateLoan(loan.loanId, updates);
  const freshLoan = await db.getLoanById(loan.loanId);
  await rescheduleEmis(freshLoan, updates);

  res.json({ message: 'Loan EMI terms updated and schedule recalculated successfully' });
});

router.post('/loans/:loanId/registry-document', upload.single('document'), async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  if (!loan || loan.adminId !== req.user.userId) return res.status(404).json({ message: 'Loan not found' });
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

  const fileMime = (req.file.mimetype || '').toLowerCase();
  const fileOrigName = (req.file.originalname || '').toLowerCase();
  if (fileMime.startsWith('video/') || fileOrigName.match(/\.(mp4|mov|avi|mkv|webm|3gp|m4v)$/)) {
    return res.status(400).json({ message: 'Videos cannot be uploaded in the document section. Please upload a PDF or image document.' });
  }

  const docType = req.query.docType || req.body.docType || 'Custom Document';
  const name = req.query.name || req.body.name || req.file.originalname || 'Document';
  const docDate = req.query.date || req.body.date || new Date().toISOString().split('T')[0];

  const ext = (req.file.originalname && path.extname(req.file.originalname)) || (req.file.mimetype === 'application/pdf' ? '.pdf' : '.jpg');
  const key = `loans/${loan.loanId}/registry_${Date.now()}${ext}`;
  await uploadBuffer(key, req.file.buffer);

  // Reload fresh loan state before updating
  const freshLoan = (await db.getLoanById(loan.loanId)) || loan;
  const existingDocs = Array.isArray(freshLoan.propertyDocs) ? [...freshLoan.propertyDocs] : [];

  const newDocEntry = {
    id: Date.now().toString(),
    uri: key,
    docType,
    name,
    date: docDate,
    uploaded: true,
    mimeType: req.file.mimetype || 'application/octet-stream'
  };

  // Smart slotting & deduplication:
  // If the same standard docType already exists (e.g. two "Property Registry - 1"),
  // automatically advance to "Property Registry - 2" (or "Property Registry - 3") so no uploaded document is ever overwritten or lost!
  let assignedDocType = docType;
  if (docType === 'Property Registry - 1' && existingDocs.some(d => d.docType === 'Property Registry - 1')) {
    if (!existingDocs.some(d => d.docType === 'Property Registry - 2')) {
      assignedDocType = 'Property Registry - 2';
    } else if (!existingDocs.some(d => d.docType === 'Property Registry - 3')) {
      assignedDocType = 'Property Registry - 3';
    }
  } else if (docType === 'Property Registry - 2' && existingDocs.some(d => d.docType === 'Property Registry - 2')) {
    if (!existingDocs.some(d => d.docType === 'Property Registry - 3')) {
      assignedDocType = 'Property Registry - 3';
    }
  }

  newDocEntry.docType = assignedDocType;

  // Append new document without deleting any other document!
  const filtered = existingDocs.filter(d => d.uri !== key);
  filtered.push(newDocEntry);

  await db.updateLoan(loan.loanId, { propertyDocs: filtered });
  res.json({ message: 'Document uploaded', key, doc: newDocEntry });
});

const handleDeleteDocument = async (req, res) => {
  try {
    const loan = await db.getLoanById(req.params.loanId);
    if (!loan || (loan.adminId && loan.adminId !== req.user.userId)) {
      return res.status(404).json({ message: 'Loan not found' });
    }

    const targetKey = (req.body?.key || req.body?.uri || req.query?.key || req.query?.uri || '').trim();
    const targetId = (req.body?.id || req.query?.id || '').toString().trim();
    const targetDocType = (req.body?.docType || req.query?.docType || '').trim();
    const targetName = (req.body?.name || req.query?.name || '').trim();

    if (!targetKey && !targetId && !targetDocType && !targetName) {
      return res.status(400).json({ message: 'Document identifier (key, id, docType, or name) is required' });
    }

    const freshLoan = (await db.getLoanById(loan.loanId)) || loan;
    const existingDocs = Array.isArray(freshLoan.propertyDocs) ? [...freshLoan.propertyDocs] : [];

    const getDocKey = (d) => {
      if (!d) return '';
      if (typeof d === 'string') return d.trim();
      return (d.uri || d.key || d.url || '').toString().trim();
    };

    const getDocId = (d) => {
      if (!d || typeof d !== 'object') return '';
      return (d.id || '').toString().trim();
    };

    const cleanPath = (p) => {
      if (!p) return '';
      try {
        const match = p.match(/[?&]key=([^&]+)/);
        if (match) return decodeURIComponent(match[1]);
      } catch (_) {}
      return p.replace(/^[a-zA-Z]+:\/\/[^\/]+/, '').replace(/^\/+/, '');
    };

    const cleanTargetKey = cleanPath(targetKey);

    let matchIndex = -1;

    // 1. Match by ID
    if (targetId) {
      matchIndex = existingDocs.findIndex((d) => getDocId(d) === targetId);
    }

    // 2. Match by clean storage key
    if (matchIndex === -1 && cleanTargetKey) {
      matchIndex = existingDocs.findIndex((d) => {
        const dKey = cleanPath(getDocKey(d));
        return dKey === cleanTargetKey || dKey.endsWith(cleanTargetKey) || cleanTargetKey.endsWith(dKey);
      });
    }

    // 3. Match by docType & name (or docType)
    if (matchIndex === -1 && targetDocType) {
      matchIndex = existingDocs.findIndex((d) => {
        if (typeof d !== 'object' || !d) return false;
        const dType = (d.docType || '').trim().toLowerCase();
        const tType = targetDocType.toLowerCase();
        if (dType === tType) {
          if (targetName && d.name) {
            return d.name.trim().toLowerCase() === targetName.toLowerCase();
          }
          return true;
        }
        return false;
      });
    }

    // 4. Match by name
    if (matchIndex === -1 && targetName) {
      matchIndex = existingDocs.findIndex((d) => {
        if (typeof d !== 'object' || !d) return false;
        return (d.name || '').trim().toLowerCase() === targetName.toLowerCase();
      });
    }

    if (matchIndex === -1) {
      return res.status(404).json({ message: 'Document not found in loan records' });
    }

    const docToDelete = existingDocs[matchIndex];
    const storageKey = cleanPath(getDocKey(docToDelete));

    // Remove document from loan record
    existingDocs.splice(matchIndex, 1);

    await db.updateLoan(loan.loanId, { propertyDocs: existingDocs });

    // Clean physical file if on local storage
    if (storageKey && !storageKey.startsWith('http')) {
      await deleteFile(storageKey).catch(() => {});
    }

    return res.json({
      message: 'Document deleted successfully',
      deletedDoc: docToDelete,
      remainingCount: existingDocs.length,
    });
  } catch (err) {
    console.error('Error deleting document:', err);
    res.status(500).json({ message: 'Failed to delete document', error: err.message });
  }
};

router.post('/loans/:loanId/delete-document', handleDeleteDocument);
router.delete('/loans/:loanId/documents', handleDeleteDocument);


router.post('/loans/:loanId/upload-photo', upload.array('photos', 15), async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  if (!loan || (loan.adminId && loan.adminId !== req.user.userId)) return res.status(404).json({ message: 'Loan not found' });
  if (!req.files || !req.files.length) return res.status(400).json({ message: 'No photos uploaded' });

  const newItems = [];
  const now = Date.now();
  for (let i = 0; i < req.files.length; i++) {
    const file = req.files[i];
    const isVid = (file.mimetype || '').startsWith('video/') || (file.originalname || '').toLowerCase().endsWith('.mp4');
    const ext = isVid ? '.mp4' : '.jpg';
    const key = `loans/${loan.loanId}/photo_${now}_${i}${ext}`;
    await uploadBuffer(key, file.buffer);
    newItems.push({
      id: `${now}_${i}`,
      uri: key,
      type: isVid ? 'video' : 'image',
      name: file.originalname || (isVid ? 'Property Video' : `Property Photo ${i + 1}`)
    });
  }

  const freshLoan = (await db.getLoanById(loan.loanId)) || loan;
  const existingPhotos = Array.isArray(freshLoan.propertyPhotos) ? [...freshLoan.propertyPhotos] : [];
  const updatedPhotos = [...existingPhotos];
  for (const item of newItems) {
    if (!updatedPhotos.some(p => p.uri === item.uri)) {
      updatedPhotos.push(item);
    }
  }

  await db.updateLoan(loan.loanId, { propertyPhotos: updatedPhotos });
  res.json({ message: 'Photos uploaded', count: req.files.length, uploaded: newItems, photos: updatedPhotos });
});

router.post('/loans/:loanId/upload-video', upload.single('video'), async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  if (!loan || (loan.adminId && loan.adminId !== req.user.userId)) return res.status(404).json({ message: 'Loan not found' });
  if (!req.file) return res.status(400).json({ message: 'No video uploaded' });

  const rawType = (req.query.videoType || req.body.videoType || '').toLowerCase().trim();
  const rawName = (req.query.name || req.body.name || req.file.originalname || '').toLowerCase().trim();
  
  let videoType = 'owner';
  if (rawType === 'house' || rawType === 'property') {
    videoType = 'house';
  } else if (rawType === 'owner') {
    videoType = 'owner';
  } else if (rawType.includes('house') || rawType.includes('walkthrough') || rawName.includes('house') || (rawName.includes('property') && !rawName.includes('owner'))) {
    videoType = 'house';
  }
  const isHouse = videoType === 'house';
  const label = isHouse ? 'House / Property Video' : 'Owner Verification Video';

  const key = `loans/${loan.loanId}/${videoType}_video_${Date.now()}.mp4`;
  await uploadBuffer(key, req.file.buffer);

  const freshLoan = (await db.getLoanById(loan.loanId)) || loan;
  const existingVideos = Array.isArray(freshLoan.videos) ? [...freshLoan.videos] : [];
  const entry = {
    id: `${videoType}_${Date.now()}`,
    uri: key,
    videoType,
    name: label,
    uploadedAt: new Date().toISOString(),
    mimeType: req.file.mimetype || 'video/mp4',
  };
  const filtered = existingVideos.filter(v => v.videoType !== videoType);
  filtered.push(entry);

  const updates = {
    videos: filtered,
  };
  if (isHouse) {
    updates.houseVideoUri = key;
    if (freshLoan.videoUri) updates.videoUri = freshLoan.videoUri;
  } else {
    updates.videoUri = key;
    if (freshLoan.houseVideoUri) updates.houseVideoUri = freshLoan.houseVideoUri;
  }

  await db.updateLoan(loan.loanId, updates);
  res.json({ message: 'Video uploaded', key, videoType, name: label });
});

router.post('/profile/organization-logo', upload.single('logo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
  const key = `users/${req.user.userId}/logo_${Date.now()}`;
  await uploadBuffer(key, req.file.buffer);
  await db.updateUser(req.user.userId, { organizationLogoKey: key });
  res.json({ message: 'Logo uploaded' });
});

module.exports = router;
