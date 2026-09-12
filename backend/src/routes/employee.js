const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const db = require('../services/mongoService');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleCheck');
const { auditLog } = require('../middleware/auditMiddleware');
const { generateAppId } = require('../services/loanIdService');
const multer = require('multer');
const { uploadBuffer, getPresignedUrl } = require('../services/localFileStorageService');
const { ensureEmiSchedule, buildLoanRecoveryItems, recordLoanPayment } = require('../services/emiService');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 150 * 1024 * 1024 },
});

const router = express.Router();
router.use(verifyToken, requireRole('employee'), auditLog);

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

router.get('/loans', async (req, res) => {
  const loans = await db.listLoansByEmployee(req.user.userId);
  res.json(loans);
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
    adminId: user.createdBy,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  };
  await db.createLoan(loan);
  res.status(201).json(loan);
});

router.get('/loans/:loanId', async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  const isEmp = loan && (String(loan.employeeId || '') === String(req.user.userId) || String(loan.assignedEmployeeId || '') === String(req.user.userId));
  if (!loan || !isEmp) {
    return res.status(404).json({ message: 'Loan not found' });
  }
  const emis = await ensureEmiSchedule(loan);
  res.json({ ...loan, emis });
});

router.patch('/loans/:loanId', async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  const isEmp = loan && (String(loan.employeeId || '') === String(req.user.userId) || String(loan.assignedEmployeeId || '') === String(req.user.userId));
  if (!loan || !isEmp) {
    return res.status(404).json({ message: 'Loan not found' });
  }
  if (['approved'].includes(loan.status)) {
    return res.status(400).json({ message: 'Approved loans cannot be edited' });
  }
  const updates = { ...req.body, updatedAt: new Date().toISOString() };
  delete updates.loanId;
  delete updates.employeeId;
  delete updates.adminId;
  delete updates.status;

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
  await db.updateLoan(loan.loanId, { status: 'submitted', updatedAt: new Date().toISOString() });
  res.json(await db.getLoanById(loan.loanId));
});

router.get('/emi-this-month', async (req, res) => {
  try {
    const loans = await db.listLoansByEmployee(req.user.userId);
    let totalCount = 0;
    let totalAmount = 0;
    const currentMonth = new Date().toISOString().slice(0, 7);

    for (const loan of loans) {
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

    const { paymentId, amount, paymentMode, transactionRef, txnRef } = req.body;
    const result = await recordLoanPayment(loan.loanId, paymentId, amount, req.user.userId, { paymentMode, transactionRef, txnRef });
    res.json({ message: 'Payment recorded successfully', ...result });
  } catch (err) {
    console.error('Employee Pay EMI Error:', err);
    res.status(400).json({ message: err.message || 'Failed to record payment' });
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
      if (!uri || seenKeys.has(uri)) return;
      try {
        const url = await getPresignedUrl(uri);
        if (url) {
          urls.push({ type, name, url, ...extra });
          seenKeys.add(uri);
        }
      } catch (err) {
        console.warn('Error generating presigned url for', uri, err);
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
          const isDocVid = (d.docType && d.docType.toLowerCase().includes('video')) ||
                           (d.name && d.name.toLowerCase().includes('video')) ||
                           (d.mimeType && d.mimeType.toLowerCase().includes('video')) ||
                           (typeof d.uri === 'string' && d.uri.toLowerCase().endsWith('.mp4'));
          if (isDocVid) {
            await addMediaUrl('video', d.name || 'House / Property Video', d.uri, { videoType: 'house' });
          } else {
            await addMediaUrl('document', d.name || d.docType || 'Property Document', d.uri, {
              docType: d.docType,
              date: d.date,
              mimeType: d.mimeType,
              id: d.id,
            });
          }
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
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

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

  // If this docType is a standard doc, replace only prior entry with identical standard docType, else append
  const isStd = docType && docType !== 'Custom Document';
  const filtered = isStd
    ? existingDocs.filter(d => (d.docType || '').trim().toLowerCase() !== docType.trim().toLowerCase())
    : existingDocs;
  filtered.push(newDocEntry);

  await db.updateLoan(loan.loanId, { propertyDocs: filtered });
  res.json({ message: 'Document uploaded', key, doc: newDocEntry });
});

router.post('/loans/:loanId/upload-photo', upload.array('photos', 15), async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  const isEmp = loan && (String(loan.employeeId || '') === String(req.user.userId) || String(loan.assignedEmployeeId || '') === String(req.user.userId));
  if (!loan || !isEmp) return res.status(404).json({ message: 'Loan not found' });
  if (!req.files || !req.files.length) return res.status(400).json({ message: 'No photos uploaded' });

  const newItems = [];
  for (let i = 0; i < req.files.length; i++) {
    const file = req.files[i];
    const isVid = (file.mimetype || '').startsWith('video/') || (file.originalname || '').toLowerCase().endsWith('.mp4');
    const ext = isVid ? '.mp4' : '.jpg';
    const key = `loans/${loan.loanId}/photo_${Date.now()}_${i}${ext}`;
    await uploadBuffer(key, file.buffer);
    newItems.push({ uri: key, type: isVid ? 'video' : 'image', name: file.originalname || 'Property Photo' });
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
  res.json({ message: 'Photos uploaded', count: req.files.length, photos: updatedPhotos });
});

router.post('/loans/:loanId/upload-video', upload.single('video'), async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  const isEmp = loan && (String(loan.employeeId || '') === String(req.user.userId) || String(loan.assignedEmployeeId || '') === String(req.user.userId));
  if (!loan || !isEmp) return res.status(404).json({ message: 'Loan not found' });
  if (!req.file) return res.status(400).json({ message: 'No video uploaded' });

  const rawType = (req.query.videoType || req.body.videoType || '').toLowerCase();
  const rawName = (req.query.name || req.body.name || req.file.originalname || '').toLowerCase();
  const isHouse = rawType === 'house' || rawType.includes('property') || rawType.includes('walkthrough') || rawName.includes('house') || rawName.includes('property');
  const videoType = isHouse ? 'house' : 'owner';
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
  } else {
    updates.videoUri = key;
  }

  await db.updateLoan(loan.loanId, updates);
  res.json({ message: 'Video uploaded', key, videoType, name: label });
});

router.post('/loans/:loanId/agreement', upload.single('agreement'), async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  if (!loan || loan.employeeId !== req.user.userId) return res.status(404).json({ message: 'Loan not found' });
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

  const key = `loans/${loan.loanId}/agreement_${Date.now()}`;
  await uploadBuffer(key, req.file.buffer);
  
  await db.updateLoan(loan.loanId, { agreementUri: key, status: 'agreement_submitted' });
  res.json({ message: 'Agreement uploaded', key });
});

router.post('/loans/:loanId/owner-not-interested', async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  if (!loan || loan.employeeId !== req.user.userId) return res.status(404).json({ message: 'Loan not found' });
  
  await db.updateLoan(loan.loanId, { status: 'owner_not_interested' });
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
  
  res.json({ message: 'EMI change request submitted for approval' });
});

router.post('/loans/:loanId/request-foreclosure', async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  if (!loan || loan.employeeId !== req.user.userId) return res.status(404).json({ message: 'Loan not found' });
  
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

module.exports = router;
