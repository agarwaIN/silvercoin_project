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

const { ensureEmiSchedule } = require('../services/emiService');

router.get('/users', async (req, res) => {
  try {
    const users = await db.listAllUsers();
    const userMap = new Map(users.map(u => [u.userId, u]));
    const enriched = users.map(u => {
      const creator = u.createdBy ? userMap.get(u.createdBy) : null;
      return {
        ...u,
        creatorName: creator ? creator.name : null,
        creatorRole: creator ? creator.role : null,
      };
    });
    res.json(enriched);
  } catch (err) {
    console.error('Error fetching superadmin users:', err);
    res.status(500).json({ message: 'Failed to fetch users' });
  }
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
  try {
    const loans = await db.listAllLoans();
    const allUsers = await db.listAllUsers();
    const userMap = new Map(allUsers.map(u => [u.userId, u]));

    const enriched = loans.map(loan => {
      const admin = userMap.get(loan.adminId);
      const emp = userMap.get(loan.employeeId);
      return {
        ...loan,
        adminName: admin ? admin.name : null,
        adminEmail: admin ? admin.email : null,
        adminMobile: admin ? admin.mobile : null,
        employeeName: emp ? emp.name : null,
        employeeEmail: emp ? emp.email : null,
        employeeMobile: emp ? emp.mobile : null,
      };
    });
    res.json(enriched);
  } catch (err) {
    console.error('Error fetching superadmin loans:', err);
    res.status(500).json({ message: 'Failed to fetch loans' });
  }
});

router.get('/loans/:loanId', async (req, res) => {
  try {
    const loan = await db.getLoanById(req.params.loanId);
    if (!loan) return res.status(404).json({ message: 'Loan not found' });
    
    const [admin, emp, emis] = await Promise.all([
      loan.adminId ? db.getUserById(loan.adminId) : null,
      loan.employeeId ? db.getUserById(loan.employeeId) : null,
      ensureEmiSchedule(loan),
    ]);

    const enriched = {
      ...loan,
      emis: emis || [],
      adminName: admin ? admin.name : null,
      adminEmail: admin ? admin.email : null,
      adminMobile: admin ? admin.mobile : null,
      employeeName: emp ? emp.name : null,
      employeeEmail: emp ? emp.email : null,
      employeeMobile: emp ? emp.mobile : null,
    };
    res.json(enriched);
  } catch (err) {
    console.error('Error fetching superadmin loan details:', err);
    res.status(500).json({ message: 'Failed to fetch loan details' });
  }
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

router.patch('/users/:userId/activate', async (req, res) => {
  try {
    const user = await db.getUserById(req.params.userId);
    if (!user || user.role === 'superadmin') {
      return res.status(404).json({ message: 'User not found' });
    }
    await db.updateUser(user.userId, { isActive: true });
    res.json({ message: 'User activated successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to activate user' });
  }
});

router.patch('/users/:userId/deactivate', async (req, res) => {
  try {
    const user = await db.getUserById(req.params.userId);
    if (!user || user.role === 'superadmin') {
      return res.status(404).json({ message: 'User not found' });
    }
    await db.updateUser(user.userId, { isActive: false });
    res.json({ message: 'User deactivated successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to deactivate user' });
  }
});

router.delete('/users/:userId', async (req, res) => {
  try {
    const user = await db.getUserById(req.params.userId);
    if (!user || user.role === 'superadmin') {
      return res.status(404).json({ message: 'User not found or cannot delete superadmin' });
    }
    await db.deleteUser(user.userId);
    res.json({ message: `${user.role === 'admin' ? 'Admin' : 'Employee'} deleted successfully` });
  } catch (err) {
    console.error('Error deleting user:', err);
    res.status(500).json({ message: 'Failed to delete user' });
  }
});

router.get('/recovery', async (req, res) => {
  try {
    const loans = await db.listAllLoans();
    const { buildLoanRecoveryItems } = require('../services/emiService');
    const recoveryItems = await buildLoanRecoveryItems(loans || []);
    res.json(recoveryItems);
  } catch (err) {
    console.error('Superadmin recovery fetch error:', err);
    res.status(500).json({ message: 'Failed to fetch recovery items' });
  }
});

router.get('/loans/:loanId/media-preview', async (req, res) => {
  try {
    const loan = await db.getLoanById(req.params.loanId);
    if (!loan) return res.status(404).json({ message: 'Loan not found' });
    
    const { getPresignedUrl } = require('../services/localFileStorageService');
    const urls = [];
    const seenKeys = new Set();

    const addMediaUrl = async (type, name, uri, extra = {}) => {
      if (!uri || seenKeys.has(uri)) return;
      const url = await getPresignedUrl(uri);
      if (url) {
        urls.push({ type, name, url, ...extra });
        seenKeys.add(uri);
      }
    };

    if (loan.videoUri) await addMediaUrl('video', 'Owner Verification Video', loan.videoUri);
    if (loan.houseVideoUri) await addMediaUrl('video', 'House / Property Video', loan.houseVideoUri);
    if (Array.isArray(loan.videos)) {
      for (const v of loan.videos) {
        if (v && v.uri) {
          const vLabel = v.name || (v.videoType === 'house' ? 'House / Property Video' : 'Owner Verification Video');
          await addMediaUrl('video', vLabel, v.uri);
        }
      }
    }
    if (Array.isArray(loan.propertyPhotos)) {
      for (const p of loan.propertyPhotos) {
        if (p && p.uri) {
          const isVid = p.type === 'video' || (typeof p.uri === 'string' && (p.uri.toLowerCase().endsWith('.mp4') || p.uri.toLowerCase().includes('video')));
          await addMediaUrl(isVid ? 'video' : 'photo', isVid ? 'House / Property Video' : 'Property Photo', p.uri);
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
            await addMediaUrl('video', d.name || 'House / Property Video', d.uri);
          } else {
            await addMediaUrl('document', d.name || d.docType || 'Property Document', d.uri, { docType: d.docType, date: d.date });
          }
        }
      }
    }
    if (loan.agreementUri) await addMediaUrl('document', 'Loan Agreement', loan.agreementUri);
    res.json(urls);
  } catch (err) {
    console.error('Error in /superadmin/loans/:loanId/media-preview:', err);
    res.json([]);
  }
});

module.exports = router;

