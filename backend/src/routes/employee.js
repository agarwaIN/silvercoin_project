const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../services/mongoService');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleCheck');
const { generateLoanId } = require('../services/loanIdService');
const multer = require('multer');
const { uploadBuffer, getPresignedUrl } = require('../services/localFileStorageService');

const upload = multer({ storage: multer.memoryStorage() });

const router = express.Router();
router.use(verifyToken, requireRole('employee'));

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
  const loanId = await generateLoanId();
  const now = new Date().toISOString();
  const loan = {
    loanId,
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
  res.json(loan);
});

router.patch('/loans/:loanId', async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  if (!loan || loan.employeeId !== req.user.userId) {
    return res.status(404).json({ message: 'Loan not found' });
  }
  if (['approved', 'rejected'].includes(loan.status)) {
    return res.status(400).json({ message: 'Approved or rejected loans cannot be edited' });
  }
  const updates = { ...req.body, updatedAt: new Date().toISOString() };
  delete updates.loanId;
  delete updates.employeeId;
  delete updates.adminId;
  delete updates.status;
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

router.get('/emi-this-month', (req, res) => res.json({ count: 0, emis: [] }));
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
      urls.push({ type: 'document', name: d.name, url: await getPresignedUrl(d.uri) });
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
  
  const docs = loan.propertyDocs || [];
  docs.push({
    id: Date.now().toString(),
    uri: key,
    name: req.file.originalname,
    uploaded: true,
    mimeType: req.file.mimetype
  });
  
  await db.updateLoan(loan.loanId, { propertyDocs: docs });
  res.json({ message: 'Document uploaded', key });
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

module.exports = router;
