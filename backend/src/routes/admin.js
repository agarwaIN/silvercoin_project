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

router.patch('/profile', (req, res) => notImplemented(res));
router.get('/emi-this-month', (req, res) => res.json({ count: 0, emis: [] }));
router.get('/recovery', (req, res) => res.json([]));
router.get('/recovery-agents', (req, res) => res.json([]));
router.post('/create-recovery-agent', (req, res) => notImplemented(res));
router.get('/loans/:loanId/media-preview', (req, res) => notImplemented(res));
router.post('/loans/:loanId/initial-approve', (req, res) => notImplemented(res));
router.post('/loans/:loanId/approve', (req, res) => notImplemented(res));
router.post('/loans/:loanId/reject', (req, res) => notImplemented(res));
router.post('/loans/:loanId/send-qr', (req, res) => notImplemented(res));
router.post('/loans/:loanId/mark-emi-paid', (req, res) => notImplemented(res));
router.post('/loans/:loanId/reject-proof', (req, res) => notImplemented(res));
router.post('/loans/:loanId/assign-recovery-agent', (req, res) => notImplemented(res));
router.post('/loans/:loanId/send-qr-to-agent', (req, res) => notImplemented(res));
router.post('/profile/organization-logo', (req, res) => notImplemented(res));

module.exports = router;
