const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const db = require('../services/mongoService');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleCheck');
const { generateTempPassword } = require('../utils/password');
const { mobileField } = require('../utils/phoneValidator');
const { sendCredentials } = require('../services/emailService');
const multer = require('multer');
const { uploadBuffer, getPresignedUrl } = require('../services/localFileStorageService');

const upload = multer({ storage: multer.memoryStorage() });

const router = express.Router();
router.use(verifyToken, requireRole('admin'));

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

  const { name, email, mobile } = req.body;
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
  const user = {
    userId,
    name,
    email,
    mobile,
    passwordHash,
    role: 'employee',
    isFirstLogin: true,
    isActive: true,
    createdBy: req.user.userId,
    createdAt: now,
  };
  await db.createUser(user);
  await sendCredentials({ name, email, password, role: 'employee' });
  console.log(`[credentials] employee ${email} temp password: ${password}`);
  res.status(201).json({ message: 'Employee created successfully.', userId });
});

router.patch('/employees/:userId/deactivate', async (req, res) => {
  const user = await db.getUserById(req.params.userId);
  if (!user || user.createdBy !== req.user.userId || user.role !== 'employee') {
    return res.status(404).json({ message: 'Employee not found' });
  }
  await db.updateUser(user.userId, { isActive: false });
  res.json({ message: 'Employee deactivated' });
});

router.get('/loans', async (req, res) => {
  const loans = await db.listLoansByAdmin(req.user.userId);
  res.json(loans);
});

router.get('/loans/:loanId', async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  if (!loan || loan.adminId !== req.user.userId) {
    return res.status(404).json({ message: 'Loan not found' });
  }
  res.json(loan);
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

router.get('/emi-this-month', (req, res) => res.json({ count: 0, emis: [] }));
router.get('/recovery', (req, res) => res.json([]));
router.get('/recovery-agents', (req, res) => res.json([]));

router.post('/create-recovery-agent', (req, res) => {
  res.status(201).json({ message: 'Agent created' });
});

router.get('/loans/:loanId/media-preview', async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  if (!loan || loan.adminId !== req.user.userId) return res.status(404).json({ message: 'Loan not found' });
  
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
  if (loan.agreementUri) {
    urls.push({ type: 'document', name: 'Agreement', url: await getPresignedUrl(loan.agreementUri) });
  }
  res.json(urls);
});

router.post('/loans/:loanId/initial-approve', async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  if (!loan || loan.adminId !== req.user.userId) return res.status(404).json({ message: 'Loan not found' });
  await db.updateLoan(loan.loanId, { status: 'initially_approved', approvedAmount: req.body.approvedAmount });
  res.json({ message: 'Loan initially approved' });
});

router.post('/loans/:loanId/approve', async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  if (!loan || loan.adminId !== req.user.userId) return res.status(404).json({ message: 'Loan not found' });
  await db.updateLoan(loan.loanId, { status: 'approved', loanStartDate: req.body.loanStartDate });
  res.json({ message: 'Loan fully approved' });
});

router.post('/loans/:loanId/reject', async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  if (!loan || loan.adminId !== req.user.userId) return res.status(404).json({ message: 'Loan not found' });
  await db.updateLoan(loan.loanId, { status: 'rejected', rejectReason: req.body.reason });
  res.json({ message: 'Loan rejected' });
});

router.post('/loans/:loanId/send-qr', (req, res) => res.json({ message: 'QR sent' }));
router.post('/loans/:loanId/mark-emi-paid', (req, res) => res.json({ message: 'EMI marked paid' }));
router.post('/loans/:loanId/reject-proof', (req, res) => res.json({ message: 'Proof rejected' }));
router.post('/loans/:loanId/assign-recovery-agent', (req, res) => res.json({ message: 'Agent assigned' }));
router.post('/loans/:loanId/send-qr-to-agent', (req, res) => res.json({ message: 'QR sent to agent' }));

router.post('/profile/organization-logo', upload.single('logo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
  const key = `users/${req.user.userId}/logo_${Date.now()}`;
  await uploadBuffer(key, req.file.buffer);
  await db.updateUser(req.user.userId, { organizationLogoKey: key });
  res.json({ message: 'Logo uploaded' });
});

module.exports = router;
