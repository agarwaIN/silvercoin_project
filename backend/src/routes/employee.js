const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../services/mongoService');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleCheck');
const { generateLoanId } = require('../services/loanIdService');

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
  if (loan.status !== 'draft') {
    return res.status(400).json({ message: 'Only draft loans can be edited' });
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
router.get('/loans/:loanId/media-preview', (req, res) => notImplemented(res));
router.get('/loans/:loanId/pdf', (req, res) => notImplemented(res));
router.post('/loans/:loanId/registry-document', (req, res) => notImplemented(res));
router.post('/loans/:loanId/upload-photo', (req, res) => notImplemented(res));
router.post('/loans/:loanId/upload-video', (req, res) => notImplemented(res));
router.post('/loans/:loanId/agreement', (req, res) => notImplemented(res));
router.post('/loans/:loanId/owner-not-interested', (req, res) => notImplemented(res));
router.post('/loans/:loanId/assign-recovery-agent', (req, res) => notImplemented(res));
router.post('/loans/:loanId/send-qr-to-agent', (req, res) => notImplemented(res));

module.exports = router;
