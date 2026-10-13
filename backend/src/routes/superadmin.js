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

const { ensureEmiSchedule, hasFirstEmiBeenCollected } = require('../services/emiService');

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
      const submittedAt = loan.submittedAt || (loan.status !== 'draft' ? (loan.createdAt || loan.updatedAt) : null);
      return {
        ...loan,
        submittedAt,
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

    const firstEmiCollected = !!(loan.firstEmiCollected || (emis || []).some(e => e.status === 'paid' || e.status === 'partial' || Number(e.paidAmount || 0) > 0));
    const submittedAt = loan.submittedAt || (loan.status !== 'draft' ? (loan.createdAt || loan.updatedAt) : null);

    const enriched = {
      ...loan,
      emis: emis || [],
      firstEmiCollected,
      submittedAt,
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
    console.error('Error in /superadmin/loans/:loanId/media-preview:', err);
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

    const hasFirstEmi = await hasFirstEmiBeenCollected(loan.loanId);
    if (hasFirstEmi) {
      return res.status(400).json({ message: 'Loan application details and dates cannot be edited after first EMI has been collected.' });
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
    console.error('Error in /superadmin/loans/:loanId/update-dates:', err);
    res.status(500).json({ message: err.message || 'Failed to update dates' });
  }
});

const handleDeleteDocument = async (req, res) => {
  try {
    const loan = await db.getLoanById(req.params.loanId);
    if (!loan) return res.status(404).json({ message: 'Loan not found' });

    const { deleteFile } = require('../services/localFileStorageService');
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
    console.error('Error deleting document:', err);
    res.status(500).json({ message: 'Failed to delete document', error: err.message });
  }
};

router.post('/loans/:loanId/delete-document', handleDeleteDocument);
router.delete('/loans/:loanId/documents', handleDeleteDocument);

module.exports = router;



