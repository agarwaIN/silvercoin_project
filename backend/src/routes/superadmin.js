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
router.use(verifyToken, requireRole('superadmin'));

function notImplemented(res) {
  return res.status(501).json({ message: 'Not implemented yet' });
}

router.get('/users', async (req, res) => {
  const users = await db.listAllUsers();
  res.json(users);
});

router.get('/admins', async (req, res) => {
  const users = await db.listUsersByRole('admin');
  res.json(users);
});

router.get('/employees', async (req, res) => {
  const users = await db.listUsersByRole('employee');
  res.json(users);
});

router.get('/loans', async (req, res) => {
  const loans = await db.listAllLoans();
  res.json(loans);
});

router.get('/loans/:loanId', async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  if (!loan) return res.status(404).json({ message: 'Loan not found' });
  res.json(loan);
});

router.post('/create-user', [
  body('name').trim().notEmpty(),
  body('email').isEmail().normalizeEmail(),
  body('role').isIn(['admin', 'employee']),
  mobileField('mobile'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { name, email, mobile, role } = req.body;
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
    role,
    isFirstLogin: true,
    isActive: true,
    createdBy: req.user.userId,
    createdAt: now,
  };
  await db.createUser(user);
  await sendCredentials({ name, email, password, role });
  console.log(`[credentials] ${role} ${email} temp password: ${password}`);
  res.status(201).json({ message: 'User created successfully.', userId, tempPassword: password });
});

router.patch('/users/:userId/deactivate', async (req, res) => {
  const user = await db.getUserById(req.params.userId);
  if (!user || user.role === 'superadmin') {
    return res.status(404).json({ message: 'User not found' });
  }
  await db.updateUser(user.userId, { isActive: false });
  res.json({ message: 'User deactivated' });
});

router.get('/recovery', (req, res) => res.json([]));
router.get('/loans/:loanId/media-preview', (req, res) => notImplemented(res));

module.exports = router;
