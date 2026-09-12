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
const { uploadBuffer, getPresignedUrl } = require('../services/localFileStorageService');
const { ensureEmiSchedule, rescheduleEmis, closeEmisForForeclosure, buildLoanRecoveryItems, recordLoanPayment } = require('../services/emiService');

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

router.get('/loans', async (req, res) => {
  try {
    const loans = await db.listLoansByAdmin(req.user.userId);
    res.json(loans || []);
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
    res.json({ ...loan, emis });
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
    let totalCount = 0;
    let totalAmount = 0;
    const now = new Date();
    const currentMonth = now.toISOString().slice(0, 7); // YYYY-MM

    for (const loan of (loans || [])) {
      const emis = await db.listEmiByLoan(loan.loanId);
      for (const emi of emis) {
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

    const { paymentId, amount, paymentMode, transactionRef, txnRef } = req.body;
    const result = await recordLoanPayment(loan.loanId, paymentId, amount, req.user.userId, { paymentMode, transactionRef, txnRef });
    res.json({ message: 'Payment recorded successfully', ...result });
  } catch (err) {
    console.error('Pay EMI Error:', err);
    res.status(400).json({ message: err.message || 'Failed to record payment' });
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

    const activeLoanIds = loans.filter(l => ['active', 'approved'].includes(l.status)).map(l => l.loanId);
    
    const emiPromises = loans.map(l => db.listEmiByLoan(l.loanId));
    const allEmisNested = await Promise.all(emiPromises);
    
    for (let i = 0; i < loans.length; i++) {
      const loan = loans[i];
      const emis = allEmisNested[i];
      
      const isToday = loan.createdAt && loan.createdAt.startsWith(todayStr);
      if (isToday) dailyApplications++;
      
      if (['approved', 'active', 'completed'].includes(loan.status)) {
        loanApprovals++;
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
      if (!uri || seenKeys.has(`${type}_${uri}`)) return;
      try {
        const url = await getPresignedUrl(uri);
        if (url) {
          urls.push({ type, name, url, ...extra });
          seenKeys.add(`${type}_${uri}`);
        }
      } catch (e) {
        console.warn('Failed to generate presigned URL for', uri, e.message);
      }
    };

    if (loan.videoUri) await addMediaUrl('video', 'Owner Verification Video', loan.videoUri, { videoType: 'owner' });
    if (loan.houseVideoUri) await addMediaUrl('video', 'House / Property Video', loan.houseVideoUri, { videoType: 'house' });
    if (Array.isArray(loan.videos)) {
      for (const v of loan.videos) {
        if (v && v.uri) {
          const vLabel = v.name || (v.videoType === 'house' ? 'House / Property Video' : 'Owner Verification Video');
          await addMediaUrl('video', vLabel, v.uri, { videoType: v.videoType || (vLabel.toLowerCase().includes('house') ? 'house' : 'owner') });
        }
      }
    }
    if (Array.isArray(loan.propertyPhotos)) {
      for (let idx = 0; idx < loan.propertyPhotos.length; idx++) {
        const p = loan.propertyPhotos[idx];
        if (p && p.uri) {
          const isVid = p.type === 'video' || (typeof p.uri === 'string' && (p.uri.toLowerCase().endsWith('.mp4') || p.uri.toLowerCase().includes('video')));
          const pLabel = p.name || (isVid ? 'House / Property Video' : (loan.propertyPhotos.length > 1 ? `Property Photo ${idx + 1}` : 'Property Photo'));
          await addMediaUrl(isVid ? 'video' : 'photo', pLabel, p.uri, { mimeType: isVid ? 'video/mp4' : 'image/jpeg' });
        }
      }
    }
    if (Array.isArray(loan.propertyDocs)) {
      for (const d of loan.propertyDocs) {
        if (d && d.uri) {
          await addMediaUrl('document', d.name || d.docType || 'Property Document', d.uri, {
            docType: d.docType,
            date: d.date,
            mimeType: d.mimeType,
            id: d.id,
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

router.post('/loans/:loanId/initial-approve', async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  if (!loan) return res.status(404).json({ message: 'Loan not found' });
  await db.updateLoan(loan.loanId, { status: 'initially_approved', approvedAmount: req.body.approvedAmount });
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
    rejectionReason: reason 
  });
  res.json({ message: 'Loan returned to employee' });
});

router.post('/loans/:loanId/disburse', async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  if (!loan) return res.status(404).json({ message: 'Loan not found' });
  if (loan.status !== 'approved' && loan.status !== 'active') {
    return res.status(400).json({ message: 'Loan must be approved to disburse' });
  }

  const { date, amount, bankName, transactionNumber } = req.body;
  if (!date || !amount || !bankName || !transactionNumber) {
    return res.status(400).json({ message: 'Missing disbursement details' });
  }

  const disbursements = loan.disbursements || [];
  disbursements.push({ date, amount, bankName, transactionNumber });

  const updates = { disbursements, status: 'active' };
  
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
  res.json({ message: 'Loan fully approved' });
});

router.post('/loans/:loanId/reject', async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  if (!loan) return res.status(404).json({ message: 'Loan not found' });
  await db.updateLoan(loan.loanId, { status: 'rejected', rejectReason: req.body.reason, changedFields: null });
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

  await rescheduleEmis(loan, loan.emiChangeRequest);

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
  res.json({ message: 'EMI change request rejected' });
});

router.post('/loans/:loanId/approve-foreclosure', async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  if (!loan) return res.status(404).json({ message: 'Loan not found' });
  
  if (!loan.foreclosureRequest || loan.foreclosureRequest.status !== 'pending') {
    return res.status(400).json({ message: 'No pending foreclosure request' });
  }

  // Update loan status to completed (foreclosed)
  await db.updateLoan(loan.loanId, {
    status: 'completed',
    foreclosureRequest: {
      ...loan.foreclosureRequest,
      status: 'approved',
      approvedAt: new Date().toISOString()
    }
  });

  await closeEmisForForeclosure(loan.loanId);

  res.json({ message: 'Foreclosure approved and loan completed' });
});

router.post('/loans/:loanId/registry-document', upload.single('document'), async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  if (!loan || loan.adminId !== req.user.userId) return res.status(404).json({ message: 'Loan not found' });
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

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

router.post('/profile/organization-logo', upload.single('logo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
  const key = `users/${req.user.userId}/logo_${Date.now()}`;
  await uploadBuffer(key, req.file.buffer);
  await db.updateUser(req.user.userId, { organizationLogoKey: key });
  res.json({ message: 'Logo uploaded' });
});

module.exports = router;
