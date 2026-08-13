const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../services/mongoService');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleCheck');
const { auditLog } = require('../middleware/auditMiddleware');
const { generateAppId } = require('../services/loanIdService');
const multer = require('multer');
const { uploadBuffer, getPresignedUrl } = require('../services/localFileStorageService');

const upload = multer({ storage: multer.memoryStorage() });

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
  if (!loan || loan.employeeId !== req.user.userId) {
    return res.status(404).json({ message: 'Loan not found' });
  }
  const emis = await db.listEmiByLoan(loan.loanId);
  res.json({ ...loan, emis });
});

router.patch('/loans/:loanId', async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  if (!loan || loan.employeeId !== req.user.userId) {
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
  if (!loan || loan.employeeId !== req.user.userId) {
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
    const recoveryItems = [];

    for (const loan of loans) {
      if (!['active', 'approved'].includes(loan.status)) continue;
      const emis = await db.listEmiByLoan(loan.loanId);
      for (const emi of emis) {
        if (emi.status !== 'paid') {
          const totalDue = Number(emi.amount || 0) + Number(emi.penaltyAmount || 0);
          const remainingDue = totalDue - Number(emi.paidAmount || 0);
          recoveryItems.push({
            paymentId: emi.paymentId,
            loanId: loan.loanId,
            displayLoanId: loan.displayLoanId || loan.applicationNumber || loan.loanId,
            borrowerName: loan.ownerName || 'Borrower',
            borrowerMobile: loan.ownerMobile || '',
            borrowerAddress: loan.ownerAddress || loan.propertyAddress || '',
            dueDate: emi.dueDate,
            amount: Number(emi.amount || 0),
            paidAmount: Number(emi.paidAmount || 0),
            penaltyAmount: Number(emi.penaltyAmount || 0),
            dueAmount: Math.max(0, remainingDue),
            status: emi.status || 'pending',
            employeeId: loan.employeeId,
          });
        }
      }
    }

    res.json(recoveryItems.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate)));
  } catch (err) {
    console.error('Employee Recovery Fetch Error:', err);
    res.status(500).json({ message: 'Failed to fetch recovery items' });
  }
});

router.post('/loans/:loanId/pay-emi', async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  if (!loan || loan.employeeId !== req.user.userId) return res.status(404).json({ message: 'Loan not found' });

  const { paymentId, amount } = req.body;
  if (!paymentId || amount == null || amount <= 0) {
    return res.status(400).json({ message: 'Invalid payment details' });
  }

  const emis = await db.listEmiByLoan(loan.loanId);
  const emi = emis.find(e => e.paymentId === paymentId);
  if (!emi) return res.status(404).json({ message: 'EMI not found' });

  const totalRequired = Number(emi.amount || 0) + Number(emi.penaltyAmount || 0);
  const previouslyPaid = Number(emi.paidAmount || 0);
  const newPaidAmount = previouslyPaid + Number(amount);

  let newStatus = emi.status;
  if (newPaidAmount >= totalRequired) {
    newStatus = 'paid';
  } else if (newPaidAmount > 0) {
    newStatus = 'partial';
  }

  await db.updateEmiPayment(paymentId, {
    paidAmount: newPaidAmount,
    status: newStatus,
    paidDate: new Date().toISOString(),
    markedBy: req.user.userId
  });

  const allEmis = await db.listEmiByLoan(loan.loanId);
  const allPaid = allEmis.every(e => e.status === 'paid');
  if (allPaid && loan.status !== 'completed') {
    await db.updateLoan(loan.loanId, { status: 'completed' });
  }

  res.json({ message: 'Payment recorded', status: newStatus, loanCompleted: allPaid });
});

router.get('/recovery-agents', (req, res) => res.json([]));
router.get('/loans/:loanId/media-preview', async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  if (!loan || loan.employeeId !== req.user.userId) return res.status(404).json({ message: 'Loan not found' });
  
  const urls = [];
  if (loan.videoUri) {
    urls.push({ type: 'video', url: await getPresignedUrl(loan.videoUri) });
  }
  if (loan.propertyPhotos) {
    for (const p of loan.propertyPhotos) {
      urls.push({ type: 'photo', url: await getPresignedUrl(p.uri) });
    }
  }
  if (loan.propertyDocs) {
    for (const d of loan.propertyDocs) {
      urls.push({ type: 'document', name: d.name, docType: d.docType, date: d.date, url: await getPresignedUrl(d.uri) });
    }
  }
  res.json(urls);
});

router.get('/loans/:loanId/pdf', async (req, res) => {
  res.json({ pdfUrl: 'https://example.com/dummy.pdf' });
});

router.post('/loans/:loanId/registry-document', upload.single('document'), async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  if (!loan || loan.employeeId !== req.user.userId) return res.status(404).json({ message: 'Loan not found' });
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

  const key = `loans/${loan.loanId}/registry_${Date.now()}`;
  await uploadBuffer(key, req.file.buffer);
  
  const docType = req.body.docType || 'Custom Document';
  const name = req.body.name || req.file.originalname;
  const docDate = req.body.date || new Date().toISOString().split('T')[0];

  const docs = loan.propertyDocs || [];
  docs.push({
    id: Date.now().toString(),
    uri: key,
    docType,
    name,
    date: docDate,
    uploaded: true,
    mimeType: req.file.mimetype
  });
  
  await db.updateLoan(loan.loanId, { propertyDocs: docs });
  res.json({ message: 'Document uploaded', key, doc: docs[docs.length - 1] });
});

router.post('/loans/:loanId/upload-photo', upload.array('photos', 15), async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  if (!loan || loan.employeeId !== req.user.userId) return res.status(404).json({ message: 'Loan not found' });
  if (!req.files || !req.files.length) return res.status(400).json({ message: 'No photos uploaded' });

  const photos = loan.propertyPhotos || [];
  for (let i = 0; i < req.files.length; i++) {
    const file = req.files[i];
    const key = `loans/${loan.loanId}/photo_${Date.now()}_${i}.jpg`;
    await uploadBuffer(key, file.buffer);
    photos.push({ uri: key, type: 'image' });
  }
  
  await db.updateLoan(loan.loanId, { propertyPhotos: photos });
  res.json({ message: 'Photos uploaded', count: req.files.length });
});

router.post('/loans/:loanId/upload-video', upload.single('video'), async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  if (!loan || loan.employeeId !== req.user.userId) return res.status(404).json({ message: 'Loan not found' });
  if (!req.file) return res.status(400).json({ message: 'No video uploaded' });

  const key = `loans/${loan.loanId}/video_${Date.now()}.mp4`;
  await uploadBuffer(key, req.file.buffer);
  
  await db.updateLoan(loan.loanId, { videoUri: key });
  res.json({ message: 'Video uploaded', key });
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
