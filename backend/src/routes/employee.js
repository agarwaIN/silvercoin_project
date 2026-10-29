const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const db = require('../services/mongoService');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleCheck');
const { auditLog } = require('../middleware/auditMiddleware');
const { generateAppId } = require('../services/loanIdService');
const multer = require('multer');
const { uploadBuffer, getPresignedUrl, deleteFile } = require('../services/localFileStorageService');
const { ensureEmiSchedule, buildLoanRecoveryItems, recordLoanPayment, hasFirstEmiBeenCollected } = require('../services/emiService');
const notificationService = require('../services/notificationService');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 150 * 1024 * 1024 },
});

const router = express.Router();
router.use(verifyToken, requireRole('employee'), auditLog);

function isLoanProcessed(loan) {
  if (!loan) return false;
  return ['processing', 'initially_approved', 'agreement_submitted', 'approved', 'active', 'completed'].includes(loan.status);
}

function isLoanDisbursed(loan) {
  if (!loan) return false;
  return Boolean(
    (Array.isArray(loan.disbursements) && loan.disbursements.length > 0) ||
    loan.disbursementDate ||
    loan.status === 'active' ||
    loan.status === 'completed'
  );
}

function notImplemented(res) {
  return res.status(501).json({ message: 'Not implemented yet' });
}

router.get('/profile', async (req, res) => {
  const user = await db.getUserById(req.user.userId);
  const admin = user?.createdBy ? await db.getUserById(user.createdBy) : null;
  res.json({
    name: user.name,
    email: user.email,
    mobile: user.mobile,
    tenantLogoUrl: null,
    adminName: admin?.name || null,
  });
});

router.patch('/profile', (req, res) => notImplemented(res));

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
  const loans = await db.listLoansByEmployee(req.user.userId);
  const enriched = (loans || []).map(l => ({
    ...l,
    employeeName: l.employeeName || req.user.name,
    submittedAt: l.submittedAt || (l.status !== 'draft' ? (l.createdAt || l.updatedAt) : null),
  }));
  enriched.sort((a, b) => {
    const aRet = a.status === 'returned';
    const bRet = b.status === 'returned';
    if (aRet && !bRet) return -1;
    if (!aRet && bRet) return 1;
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
});

router.post('/loans', async (req, res) => {
  const user = await db.getUserById(req.user.userId);
  const appId = await generateAppId();
  const now = new Date().toISOString();
  const loan = {
    loanId: appId,
    applicationNumber: appId,
    displayLoanId: null,
    employeeId: user.userId,
    employeeName: user.name || req.user.name,
    adminId: user.createdBy,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  };
  await db.createLoan(loan);
  res.status(201).json(loan);
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
      });
    }
    return res.json({ exists: false });
  } catch (err) {
    console.error('Employee Check Aadhaar Error:', err);
    res.json({ exists: false });
  }
});

router.get('/loans/:loanId', async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  const isEmp = loan && (String(loan.employeeId || '') === String(req.user.userId) || String(loan.assignedEmployeeId || '') === String(req.user.userId));
  if (!loan || !isEmp) {
    return res.status(404).json({ message: 'Loan not found' });
  }
  const emis = await ensureEmiSchedule(loan);
  const firstEmiCollected = !!(loan.firstEmiCollected || (emis || []).some(e => e.status === 'paid' || e.status === 'partial' || Number(e.paidAmount || 0) > 0));
  const submittedAt = loan.submittedAt || (loan.status !== 'draft' ? (loan.createdAt || loan.updatedAt) : null);
  res.json({ ...loan, employeeName: loan.employeeName || req.user.name, emis, firstEmiCollected, submittedAt });
});

function sanitizeMediaList(incomingList, existingList) {
  if (!Array.isArray(incomingList)) return incomingList;
  const existingMap = new Map();
  if (Array.isArray(existingList)) {
    for (const item of existingList) {
      if (!item) continue;
      if (item.id) existingMap.set(String(item.id), item);
      if (item.uri && !item.uri.startsWith('file:') && !item.uri.startsWith('content:')) {
        existingMap.set(String(item.uri), item);
      }
    }
  }

  const result = [];
  for (const item of incomingList) {
    if (!item || typeof item !== 'object') continue;
    const existing = (item.id && existingMap.get(String(item.id))) || (item.uri && existingMap.get(String(item.uri)));

    let effectiveUri = item.serverKey || item.key || item.uri || '';
    if (typeof effectiveUri === 'string' && (effectiveUri.startsWith('file:') || effectiveUri.startsWith('content:') || effectiveUri.startsWith('blob:'))) {
      if (existing && existing.uri && !existing.uri.startsWith('file:') && !existing.uri.startsWith('content:')) {
        effectiveUri = existing.uri;
      } else {
        effectiveUri = null;
      }
    }

    if (effectiveUri) {
      result.push({
        ...item,
        uri: effectiveUri,
        uploaded: true,
      });
    }
  }
  return result;
}

router.patch('/loans/:loanId', async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  const isEmp = loan && (String(loan.employeeId || '') === String(req.user.userId) || String(loan.assignedEmployeeId || '') === String(req.user.userId));
  if (!loan || !isEmp) {
    return res.status(404).json({ message: 'Loan not found' });
  }
  if (isLoanDisbursed(loan) || isLoanProcessed(loan)) {
    return res.status(400).json({ message: 'Loan application details cannot be edited once the loan has been processed or disbursement has been recorded.' });
  }
  const hasFirstEmi = await hasFirstEmiBeenCollected(loan.loanId);
  if (hasFirstEmi) {
    return res.status(400).json({ message: 'Loan application details cannot be edited after first EMI has been collected.' });
  }

  // Validate that Aadhaar is unique across active loan applications
  if (req.body.aadhaar) {
    const cleanAadhaar = String(req.body.aadhaar).replace(/\D/g, '');
    if (cleanAadhaar.length === 12) {
      const existing = await db.findLoanByAadhaar(cleanAadhaar, loan.loanId);
      if (existing) {
        const existingId = existing.displayLoanId || existing.applicationNumber || existing.loanId;
        return res.status(400).json({
          message: `An active loan application already exists with Aadhaar ending in ${cleanAadhaar.slice(-4)} (${existingId}). Only one active loan can exist for 1 Aadhaar number.`,
        });
      }
    }
  }

  const updates = { ...req.body, updatedAt: new Date().toISOString() };
  delete updates.loanId;
  delete updates.employeeId;
  delete updates.adminId;
  delete updates.status;

  if (updates.videoUri && (updates.videoUri.startsWith('file:') || updates.videoUri.startsWith('content:'))) {
    delete updates.videoUri;
  }
  if (updates.houseVideoUri && (updates.houseVideoUri.startsWith('file:') || updates.houseVideoUri.startsWith('content:'))) {
    delete updates.houseVideoUri;
  }

  if (Array.isArray(updates.propertyDocs)) {
    const existingDocs = Array.isArray(loan.propertyDocs) ? loan.propertyDocs : [];
    const sanitized = sanitizeMediaList(updates.propertyDocs, existingDocs);
    const keptKeys = new Set(sanitized.map(d => d.serverKey || d.uri).filter(Boolean));
    for (const ed of existingDocs) {
      const k = ed.serverKey || ed.uri;
      if (k && !keptKeys.has(k)) {
        deleteFile(k).catch(() => {});
      }
    }
    updates.propertyDocs = sanitized;
  }
  if (Array.isArray(updates.propertyPhotos)) {
    const existingPhotos = Array.isArray(loan.propertyPhotos) ? loan.propertyPhotos : [];
    const sanitized = sanitizeMediaList(updates.propertyPhotos, existingPhotos);
    const keptKeys = new Set(sanitized.map(p => p.serverKey || p.uri).filter(Boolean));
    for (const ep of existingPhotos) {
      const k = ep.serverKey || ep.uri;
      if (k && !keptKeys.has(k)) {
        deleteFile(k).catch(() => {});
      }
    }
    updates.propertyPhotos = sanitized;
  }
  if (Array.isArray(updates.videos)) {
    updates.videos = sanitizeMediaList(updates.videos, loan.videos);
  }

  const existingChangedFields = loan.changedFields || [];
  const newChangedFields = Object.keys(updates).filter(key => {
    if (key === 'updatedAt') return false;
    return JSON.stringify(loan[key]) !== JSON.stringify(updates[key]);
  });
  updates.changedFields = [...new Set([...existingChangedFields, ...newChangedFields])];

  await db.updateLoan(loan.loanId, updates);
  res.json({ ...(await db.getLoanById(loan.loanId)) });
});

router.post('/loans/:loanId/submit', async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  const isEmp = loan && (String(loan.employeeId || '') === String(req.user.userId) || String(loan.assignedEmployeeId || '') === String(req.user.userId));
  if (!loan || !isEmp) {
    return res.status(404).json({ message: 'Loan not found' });
  }

  if (isLoanDisbursed(loan) || isLoanProcessed(loan)) {
    return res.status(400).json({ message: 'Cannot edit or resubmit: Loan application has already been processed or disbursement has been recorded.' });
  }
  const hasFirstEmi = await hasFirstEmiBeenCollected(loan.loanId);
  if (hasFirstEmi) {
    return res.status(400).json({ message: 'Cannot edit or resubmit loan application after first EMI has been collected.' });
  }

  // Enforce unique Aadhaar before final submission across active loan applications
  const targetAadhaar = (req.body && req.body.aadhaar) || loan.aadhaar;
  if (targetAadhaar) {
    const cleanAadhaar = String(targetAadhaar).replace(/\D/g, '');
    if (cleanAadhaar.length === 12) {
      const existing = await db.findLoanByAadhaar(cleanAadhaar, loan.loanId);
      if (existing) {
        const existingId = existing.displayLoanId || existing.applicationNumber || existing.loanId;
        return res.status(400).json({
          message: `Cannot submit: An active loan application already exists with Aadhaar ending in ${cleanAadhaar.slice(-4)} (${existingId}). Only one active loan can exist for 1 Aadhaar number.`,
        });
      }
    }
  }

  const now = new Date().toISOString();
  const updates = {
    status: 'submitted',
    updatedAt: now,
    submittedAt: loan.submittedAt || now,
    submittedByEmployeeName: loan.employeeName || req.user.name,
  };

  if (req.body) {
    const isValidKey = (u) => typeof u === 'string' && u.trim() && !u.startsWith('file:') && !u.startsWith('content:');
    if (req.body.videoUri && isValidKey(req.body.videoUri)) {
      updates.videoUri = req.body.videoUri;
    }
    if (req.body.houseVideoUri && isValidKey(req.body.houseVideoUri)) {
      updates.houseVideoUri = req.body.houseVideoUri;
    }

    const existingDocs = Array.isArray(loan.propertyDocs) ? [...loan.propertyDocs] : [];
    if (Array.isArray(req.body.propertyDocs)) {
      const sanitized = sanitizeMediaList(req.body.propertyDocs, existingDocs);
      const keptKeys = new Set(sanitized.map(d => d.serverKey || d.uri).filter(Boolean));
      for (const ed of existingDocs) {
        const k = ed.serverKey || ed.uri;
        if (k && !keptKeys.has(k)) {
          deleteFile(k).catch(() => {});
        }
      }
      updates.propertyDocs = sanitized;
    }

    const existingPhotos = Array.isArray(loan.propertyPhotos) ? [...loan.propertyPhotos] : [];
    if (Array.isArray(req.body.propertyPhotos)) {
      const sanitized = sanitizeMediaList(req.body.propertyPhotos, existingPhotos);
      const keptKeys = new Set(sanitized.map(p => p.serverKey || p.uri).filter(Boolean));
      for (const ep of existingPhotos) {
        const k = ep.serverKey || ep.uri;
        if (k && !keptKeys.has(k)) {
          deleteFile(k).catch(() => {});
        }
      }
      updates.propertyPhotos = sanitized;
    }
  }

  await db.updateLoan(loan.loanId, updates);
  const updatedLoan = await db.getLoanById(loan.loanId);
  notificationService.notifyLoanSubmitted(updatedLoan, req.user).catch(err => {
    console.warn('[Notification] Failed to emit loan submitted notification:', err.message);
  });
  res.json(updatedLoan);
});


router.get('/emi-this-month', async (req, res) => {
  try {
    const loans = await db.listLoansByEmployee(req.user.userId);
    const currentMonth = new Date().toISOString().slice(0, 7);
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
    const loans = await db.listLoansByEmployee(req.user.userId);
    const recoveryItems = await buildLoanRecoveryItems(loans);
    res.json(recoveryItems);
  } catch (err) {
    console.error('Employee Recovery Fetch Error:', err);
    res.status(500).json({ message: 'Failed to fetch recovery items' });
  }
});

router.post('/loans/:loanId/pay-emi', async (req, res) => {
  try {
    const loan = await db.getLoanById(req.params.loanId);
    const isEmp = loan && (String(loan.employeeId || '') === String(req.user.userId) || String(loan.assignedEmployeeId || '') === String(req.user.userId));
    if (!loan || !isEmp) return res.status(404).json({ message: 'Loan not found' });

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
    db.getLoanById(loan.loanId).then(l => {
      if (l) notificationService.notifyEmiPaymentCollected(l, req.user, amount, result?.emi || { emiNumber: req.body?.emiNumber }).catch(() => {});
    }).catch(() => {});
    res.json({ message: 'Payment recorded successfully', ...result });
  } catch (err) {
    console.error('Employee Pay EMI Error:', err);
    res.status(400).json({ message: err.message || 'Failed to record payment' });
  }
});

router.post('/loans/:loanId/emis/:paymentId/waive-penalty', async (req, res) => {
  try {
    const loan = await db.getLoanById(req.params.loanId);
    const isEmp = loan && (String(loan.employeeId || '') === String(req.user.userId) || String(loan.assignedEmployeeId || '') === String(req.user.userId));
    if (!loan || !isEmp) return res.status(404).json({ message: 'Loan not found' });

    const { paymentId } = req.params;
    const { reason } = req.body;

    await db.updateEmiPayment(paymentId, {
      penaltyAmount: 0,
      penaltyWaived: true,
      penaltyLocked: true,
      penaltyWaivedBy: req.user.userId,
      penaltyWaivedAt: new Date().toISOString(),
      penaltyWaiveReason: reason || 'Waived by employee',
    });

    res.json({ success: true, message: 'Penalty waived off successfully' });
  } catch (err) {
    console.error('Employee Waive Penalty Error:', err);
    res.status(500).json({ message: err.message || 'Failed to waive penalty' });
  }
});

router.post('/loans/:loanId/emis/:paymentId/update-penalty', async (req, res) => {
  try {
    const loan = await db.getLoanById(req.params.loanId);
    const isEmp = loan && (String(loan.employeeId || '') === String(req.user.userId) || String(loan.assignedEmployeeId || '') === String(req.user.userId));
    if (!loan || !isEmp) return res.status(404).json({ message: 'Loan not found' });

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
    console.error('Employee Update Penalty Error:', err);
    res.status(500).json({ message: err.message || 'Failed to update penalty' });
  }
});

router.get('/recovery-agents', (req, res) => res.json([]));
router.get('/loans/:loanId/media-preview', async (req, res) => {
  try {
    const loan = await db.getLoanById(req.params.loanId);
    const isEmp = loan && (String(loan.employeeId || '') === String(req.user.userId) || String(loan.assignedEmployeeId || '') === String(req.user.userId));
    if (!loan || !isEmp) {
      return res.status(404).json({ message: 'Loan not found' });
    }
    
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
      } catch (err) {
        console.warn('Error generating presigned url for', cleanUri, err);
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

    if (loan.agreementUri) {
      await addMediaUrl('document', 'Loan Agreement', loan.agreementUri, { docType: 'Loan Agreement' });
    }
    res.json(urls);
  } catch (err) {
    console.error('Error fetching employee loan media preview:', err);
    res.status(500).json({ message: 'Failed to load media preview' });
  }
});

router.get('/loans/:loanId/pdf', async (req, res) => {
  res.json({ pdfUrl: 'https://example.com/dummy.pdf' });
});

router.post('/loans/:loanId/registry-document', upload.single('document'), async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  const isEmp = loan && (String(loan.employeeId || '') === String(req.user.userId) || String(loan.assignedEmployeeId || '') === String(req.user.userId));
  if (!loan || !isEmp) return res.status(404).json({ message: 'Loan not found' });
  const hasFirstEmi = await hasFirstEmiBeenCollected(loan.loanId);
  if (isLoanDisbursed(loan) || hasFirstEmi) {
    return res.status(400).json({ message: 'Document upload is disabled once disbursement has been recorded.' });
  }
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

  // Reload fresh loan state right before updating to avoid overwriting concurrent uploads
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
    const isEmp = loan && (
      String(loan.employeeId || '') === String(req.user.userId) ||
      String(loan.assignedEmployeeId || '') === String(req.user.userId) ||
      (loan.adminId && req.user.creatorId && String(loan.adminId) === String(req.user.creatorId)) ||
      (loan.adminId && req.user.adminId && String(loan.adminId) === String(req.user.adminId))
    );
    if (!loan || !isEmp) return res.status(404).json({ message: 'Loan not found' });

    const hasFirstEmi = await hasFirstEmiBeenCollected(loan.loanId);
    if (isLoanDisbursed(loan) || hasFirstEmi) {
      return res.status(400).json({ message: 'Document deletion is disabled once disbursement has been recorded.' });
    }

    const targetKey = (req.body?.key || req.body?.uri || req.query?.key || req.query?.uri || '').trim();
    const targetId = (req.body?.id || req.query?.id || '').toString().trim();
    const targetDocType = (req.body?.docType || req.query?.docType || '').trim();
    const targetName = (req.body?.name || req.query?.name || '').trim();

    if (!targetKey && !targetId && !targetDocType && !targetName) {
      return res.status(400).json({ message: 'Document identifier (key, id, docType, or name) is required' });
    }

    // Reload fresh loan state right before updating to avoid race conditions
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

    // 1. Match by ID if provided
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
    console.error('Error deleting employee document:', err);
    res.status(500).json({ message: 'Failed to delete document', error: err.message });
  }
};

router.post('/loans/:loanId/delete-document', handleDeleteDocument);
router.delete('/loans/:loanId/documents', handleDeleteDocument);


router.post('/loans/:loanId/upload-photo', upload.array('photos', 15), async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  const isEmp = loan && (String(loan.employeeId || '') === String(req.user.userId) || String(loan.assignedEmployeeId || '') === String(req.user.userId));
  if (!loan || !isEmp) return res.status(404).json({ message: 'Loan not found' });
  const hasFirstEmi = await hasFirstEmiBeenCollected(loan.loanId);
  if (isLoanDisbursed(loan) || hasFirstEmi) {
    return res.status(400).json({ message: 'Photo upload is disabled once disbursement has been recorded.' });
  }
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

  // Reload fresh loan state right before updating to avoid overwriting concurrent uploads
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
  const isEmp = loan && (String(loan.employeeId || '') === String(req.user.userId) || String(loan.assignedEmployeeId || '') === String(req.user.userId));
  if (!loan || !isEmp) return res.status(404).json({ message: 'Loan not found' });
  const hasFirstEmi = await hasFirstEmiBeenCollected(loan.loanId);
  if (isLoanDisbursed(loan) || hasFirstEmi) {
    return res.status(400).json({ message: 'Video upload is disabled once disbursement has been recorded.' });
  }
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

  // Reload fresh loan state before updating to prevent overwriting concurrent uploads
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

router.post('/loans/:loanId/agreement', upload.single('agreement'), async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  if (!loan || loan.employeeId !== req.user.userId) return res.status(404).json({ message: 'Loan not found' });
  const hasFirstEmi = await hasFirstEmiBeenCollected(loan.loanId);
  if (isLoanDisbursed(loan) || hasFirstEmi) {
    return res.status(400).json({ message: 'Agreement upload is disabled once disbursement has been recorded.' });
  }
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

  const key = `loans/${loan.loanId}/agreement_${Date.now()}`;
  await uploadBuffer(key, req.file.buffer);
  
  await db.updateLoan(loan.loanId, { agreementUri: key, status: 'agreement_submitted' });
  db.getLoanById(loan.loanId).then(l => {
    if (l) notificationService.notifyAgreementSubmitted(l, req.user).catch(() => {});
  }).catch(() => {});
  res.json({ message: 'Agreement uploaded', key });
});

router.post('/loans/:loanId/owner-not-interested', async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  if (!loan || loan.employeeId !== req.user.userId) return res.status(404).json({ message: 'Loan not found' });
  
  await db.updateLoan(loan.loanId, { status: 'owner_not_interested' });
  db.getLoanById(loan.loanId).then(l => {
    if (l) notificationService.notifyOwnerNotInterested(l, req.user).catch(() => {});
  }).catch(() => {});
  res.json({ message: 'Marked as not interested' });
});

router.post('/loans/:loanId/assign-recovery-agent', async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  if (!loan || loan.employeeId !== req.user.userId) return res.status(404).json({ message: 'Loan not found' });
  
  const { recoveryAgentId } = req.body;
  await db.updateLoan(loan.loanId, { recoveryAgentId });
  res.json({ message: 'Agent assigned' });
});

router.post('/loans/:loanId/send-qr-to-agent', async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  if (!loan || loan.employeeId !== req.user.userId) return res.status(404).json({ message: 'Loan not found' });
  
  res.json({ message: 'QR sent to agent' });
});

router.post('/loans/:loanId/emi-change-request', async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  if (!loan || loan.employeeId !== req.user.userId) return res.status(404).json({ message: 'Loan not found' });
  
  const hasFirstEmi = await hasFirstEmiBeenCollected(loan.loanId);
  if (isLoanDisbursed(loan) || hasFirstEmi) {
    return res.status(400).json({ message: 'EMI change requests cannot be submitted once disbursement has been recorded. Only EMI/recovery collection is permitted.' });
  }

  if (!['approved', 'active'].includes(loan.status)) {
    return res.status(400).json({ message: 'Loan is not in a valid status to request EMI changes' });
  }

  const { approvedAmount, tenureMonths, interestRate, penaltyRate, emiAmount, totalInterest, totalRepayable } = req.body;
  
  await db.updateLoan(loan.loanId, {
    emiChangeRequest: {
      approvedAmount,
      tenureMonths,
      interestRate,
      penaltyRate,
      emiAmount,
      totalInterest,
      totalRepayable,
      status: 'pending'
    }
  });

  db.getLoanById(loan.loanId).then(l => {
    if (l) notificationService.notifyEmiChangeRequested(l, req.user, req.body).catch(() => {});
  }).catch(() => {});
  
  res.json({ message: 'EMI change request submitted for approval' });
});

router.post('/loans/:loanId/request-foreclosure', async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  if (!loan || loan.employeeId !== req.user.userId) return res.status(404).json({ message: 'Loan not found' });
  
  const hasFirstEmi = await hasFirstEmiBeenCollected(loan.loanId);
  if (isLoanDisbursed(loan) || hasFirstEmi) {
    return res.status(400).json({ message: 'Foreclosure cannot be requested by employee once disbursement has been recorded. Only EMI/recovery collection is permitted.' });
  }

  if (loan.status !== 'active') {
    return res.status(400).json({ message: 'Only active loans can be foreclosed' });
  }

  const { foreclosureAmount, reason } = req.body;
  await db.updateLoan(loan.loanId, {
    foreclosureRequest: {
      foreclosureAmount,
      reason,
      status: 'pending',
      requestedAt: new Date().toISOString()
    }
  });

  res.json({ message: 'Foreclosure requested successfully' });
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

    const hasFirstEmi = await hasFirstEmiBeenCollected(loan.loanId);
    if (isLoanDisbursed(loan) || hasFirstEmi || isLoanProcessed(loan)) {
      return res.status(400).json({ message: 'Dates cannot be updated by employee once disbursement has been recorded.' });
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
        const { updateEmiScheduleDates } = require('../services/emiService');
        await updateEmiScheduleDates(loan.loanId, parsedEmiDate);
      }
    }

    const updatedLoan = await db.getLoanById(loan.loanId);
    res.json({ message: 'Dates updated successfully', loan: updatedLoan });
  } catch (err) {
    console.error('Error in /employee/loans/:loanId/update-dates:', err);
    res.status(500).json({ message: err.message || 'Failed to update dates' });
  }
});

module.exports = router;
