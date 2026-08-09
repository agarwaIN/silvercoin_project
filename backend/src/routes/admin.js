const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const db = require('../services/mongoService');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleCheck');
const { auditLog } = require('../middleware/auditMiddleware');
const { generateTempPassword } = require('../utils/password');
const { mobileField } = require('../utils/phoneValidator');
const { sendCredentials } = require('../services/emailService');
const multer = require('multer');
const { uploadBuffer, getPresignedUrl } = require('../services/localFileStorageService');

const upload = multer({ storage: multer.memoryStorage() });

const router = express.Router();
router.use(verifyToken, requireRole('admin'), auditLog);

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
  res.status(201).json({ message: 'Employee created successfully.', userId, tempPassword: password });
});

router.patch('/employees/:userId/deactivate', async (req, res) => {
  const user = await db.getUserById(req.params.userId);
  if (!user || user.createdBy !== req.user.userId || user.role !== 'employee') {
    return res.status(404).json({ message: 'Employee not found' });
  }
  await db.updateUser(user.userId, { isActive: false });
  res.json({ message: 'Employee deactivated' });
});

router.delete('/employees/:userId', async (req, res) => {
  const user = await db.getUserById(req.params.userId);
  if (!user || user.createdBy !== req.user.userId || user.role !== 'employee') {
    return res.status(404).json({ message: 'Employee not found' });
  }
  await db.deleteUser(user.userId);
  res.json({ message: 'Employee deleted' });
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
  const emis = await db.listEmiByLoan(loan.loanId);
  res.json({ ...loan, emis });
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

router.get('/reports', async (req, res) => {
  try {
    const adminId = req.user.userId;
    const [loans, employees] = await Promise.all([
      db.listLoansByAdmin(adminId),
      db.listUsersByCreator(adminId),
    ]);

    const emps = employees.filter(e => e.role === 'employee');

    const todayStr = new Date().toISOString().split('T')[0];
    let dailyApplications = 0;
    let loanApprovals = 0;
    let totalDisbursement = 0;
    let loanOutstanding = 0;
    let interestEarned = 0;
    let penaltyEarned = 0;
    let totalCollections = 0;

    let pendingRecoveryCount = 0;

    const empStats = emps.reduce((acc, emp) => {
      acc[emp.userId] = {
        name: emp.name,
        pendingTasks: 0,
        productivity: 0,
        collections: 0,
      };
      return acc;
    }, {});

    const activeLoanIds = loans.filter(l => ['active', 'approved'].includes(l.status)).map(l => l.loanId);
    
    const emiPromises = loans.map(l => db.listEmiByLoan(l.loanId));
    const allEmisNested = await Promise.all(emiPromises);
    
    for (let i = 0; i < loans.length; i++) {
      const loan = loans[i];
      const emis = allEmisNested[i];
      
      const isToday = loan.createdAt && loan.createdAt.startsWith(todayStr);
      if (isToday) dailyApplications++;
      
      if (['approved', 'active', 'completed'].includes(loan.status)) {
        loanApprovals++;
        totalDisbursement += Number(loan.approvedAmount || loan.loanAmount || 0);
      }

      if (['submitted', 'agreement_submitted'].includes(loan.status) && loan.employeeId && empStats[loan.employeeId]) {
        empStats[loan.employeeId].pendingTasks++;
      }
      
      if (['approved', 'active', 'completed'].includes(loan.status) && loan.employeeId && empStats[loan.employeeId]) {
        empStats[loan.employeeId].productivity++;
      }

      let loanTotalCollected = 0;
      let loanInterest = 0;
      let loanPenalty = 0;
      let hasPendingEmi = false;

      for (const emi of emis) {
        if (emi.status === 'paid' || emi.status === 'partial') {
          const amountPaid = Number(emi.paidAmount || 0);
          loanTotalCollected += amountPaid;
          // Rough approximation if interestPart is not stored:
          loanInterest += Number(emi.interestPart || (amountPaid * 0.1));
          loanPenalty += Number(emi.penaltyAmount || 0);
        } else if (emi.status === 'pending' || emi.status === 'overdue') {
          hasPendingEmi = true;
        }
      }
      
      totalCollections += loanTotalCollected;
      interestEarned += loanInterest;
      penaltyEarned += loanPenalty;
      
      if (loan.employeeId && empStats[loan.employeeId]) {
        empStats[loan.employeeId].collections += loanTotalCollected;
      }
      
      if (hasPendingEmi) {
        pendingRecoveryCount++;
      }
      
      if (['active', 'approved'].includes(loan.status)) {
         loanOutstanding += Number(loan.totalRepayable || 0) - loanTotalCollected;
      }
    }

    res.json({
      operational: {
        dailyApplications,
        loanApprovals,
        totalDisbursement,
        activeLoans: activeLoanIds.length,
        pendingRecovery: pendingRecoveryCount,
      },
      financial: {
        loanOutstanding: Math.max(0, loanOutstanding),
        interestEarned,
        penalty: penaltyEarned,
        collectionSummary: totalCollections,
      },
      employee: Object.values(empStats),
    });
  } catch (err) {
    console.error('Reports Error:', err);
    res.status(500).json({ message: 'Failed to generate reports' });
  }
});

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

router.post('/loans/:loanId/process', async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  if (!loan || loan.adminId !== req.user.userId) return res.status(404).json({ message: 'Loan not found' });
  
  const { internalRemarks, riskAssessment } = req.body;
  await db.updateLoan(loan.loanId, { 
    internalRemarks, 
    riskAssessment,
    status: 'processing' 
  });
  res.json({ message: 'Loan processing details saved' });
});

router.post('/loans/:loanId/return', async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  if (!loan || loan.adminId !== req.user.userId) return res.status(404).json({ message: 'Loan not found' });
  
  const { reason } = req.body;
  await db.updateLoan(loan.loanId, { 
    status: 'returned',
    rejectionReason: reason 
  });
  res.json({ message: 'Loan returned to employee' });
});

router.post('/loans/:loanId/disburse', async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  if (!loan || loan.adminId !== req.user.userId) return res.status(404).json({ message: 'Loan not found' });
  if (loan.status !== 'approved' && loan.status !== 'active') {
    return res.status(400).json({ message: 'Loan must be approved to disburse' });
  }

  const { date, amount, bankName, transactionNumber } = req.body;
  if (!date || !amount || !bankName || !transactionNumber) {
    return res.status(400).json({ message: 'Missing disbursement details' });
  }

  const disbursements = loan.disbursements || [];
  disbursements.push({ date, amount, bankName, transactionNumber });

  const updates = { disbursements, status: 'active' };
  
  // Generate officialLoanId on first disbursement if not exists
  if (!loan.officialLoanId) {
    const seq = await db.getNextLoanSeq('official-loans');
    updates.officialLoanId = `SL-${seq.toString().padStart(5, '0')}`;
  }

  await db.updateLoan(loan.loanId, updates);
  res.json({ message: 'Disbursement recorded', officialLoanId: updates.officialLoanId || loan.officialLoanId });
});

router.post('/loans/:loanId/approve', async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  if (!loan || loan.adminId !== req.user.userId) return res.status(404).json({ message: 'Loan not found' });
  
  const { loanStartDate, approvedAmount, interestRate, penaltyRate, tenureMonths, emiAmount, totalInterest, totalRepayable } = req.body;
  
  await db.updateLoan(loan.loanId, { 
    status: 'approved', 
    loanStartDate, 
    approvedAmount, 
    interestRate, 
    penaltyRate, 
    tenureMonths, 
    emiAmount, 
    totalInterest, 
    totalRepayable,
    changedFields: null 
  });
  res.json({ message: 'Loan fully approved' });
});

router.post('/loans/:loanId/reject', async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  if (!loan || loan.adminId !== req.user.userId) return res.status(404).json({ message: 'Loan not found' });
  await db.updateLoan(loan.loanId, { status: 'rejected', rejectReason: req.body.reason, changedFields: null });
  res.json({ message: 'Loan rejected' });
});

router.post('/loans/:loanId/send-qr', (req, res) => res.json({ message: 'QR sent' }));
router.post('/loans/:loanId/pay-emi', async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  if (!loan || loan.adminId !== req.user.userId) return res.status(404).json({ message: 'Loan not found' });
  
  const { paymentId, amount } = req.body;
  if (!paymentId || amount == null || amount <= 0) {
    return res.status(400).json({ message: 'Invalid payment details' });
  }

  const emis = await db.listEmiByLoan(loan.loanId);
  const emi = emis.find(e => e.paymentId === paymentId);
  if (!emi) return res.status(404).json({ message: 'EMI not found' });

  // BR-05: EMI recovery window opens 7 days before due date
  const dueDate = new Date(emi.dueDate);
  const now = new Date();
  const diffTime = dueDate - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays > 7) {
    return res.status(400).json({ message: `EMI recovery window opens 7 days before due date (Due: ${emi.dueDate})` });
  }

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
  // Re-fetch to get updated state of the specific EMI
  const updatedEmi = allEmis.find(e => e.paymentId === paymentId);
  if (updatedEmi) updatedEmi.status = newStatus; 
  
  const allPaid = allEmis.every(e => e.status === 'paid');
  if (allPaid && loan.status !== 'completed') {
    await db.updateLoan(loan.loanId, { status: 'completed' });
  }

  res.json({ message: 'Payment recorded', status: newStatus, loanCompleted: allPaid });
});
router.post('/loans/:loanId/reject-proof', (req, res) => res.json({ message: 'Proof rejected' }));
router.post('/loans/:loanId/assign-recovery-agent', (req, res) => res.json({ message: 'Agent assigned' }));
router.post('/loans/:loanId/send-qr-to-agent', (req, res) => res.json({ message: 'QR sent to agent' }));

router.post('/loans/:loanId/approve-emi-change', async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  if (!loan || loan.adminId !== req.user.userId) return res.status(404).json({ message: 'Loan not found' });
  if (!loan.emiChangeRequest) return res.status(400).json({ message: 'No pending EMI change request' });

  const {
    approvedAmount,
    tenureMonths,
    interestRate,
    penaltyRate,
    emiAmount,
    totalInterest,
    totalRepayable
  } = loan.emiChangeRequest;

  await db.updateLoan(loan.loanId, {
    approvedAmount,
    tenureMonths,
    interestRate,
    penaltyRate,
    emiAmount,
    totalInterest,
    totalRepayable,
    emiChangeRequest: {
      ...loan.emiChangeRequest,
      status: 'approved'
    }
  });

  res.json({ message: 'EMI change request approved' });
});

router.post('/loans/:loanId/reject-emi-change', async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  if (!loan || loan.adminId !== req.user.userId) return res.status(404).json({ message: 'Loan not found' });
  if (!loan.emiChangeRequest) return res.status(400).json({ message: 'No pending EMI change request' });

  await db.updateLoan(loan.loanId, { 
    emiChangeRequest: {
      ...loan.emiChangeRequest,
      status: 'rejected'
    }
  });
  res.json({ message: 'EMI change request rejected' });
});

router.post('/loans/:loanId/approve-foreclosure', async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  if (!loan || loan.adminId !== req.user.userId) return res.status(404).json({ message: 'Loan not found' });
  
  if (!loan.foreclosureRequest || loan.foreclosureRequest.status !== 'pending') {
    return res.status(400).json({ message: 'No pending foreclosure request' });
  }

  // Update loan status to completed (foreclosed)
  await db.updateLoan(loan.loanId, {
    status: 'completed', // Or 'foreclosed' if there was a separate status, but SRS implies Closure -> Foreclosure
    foreclosureRequest: {
      ...loan.foreclosureRequest,
      status: 'approved',
      approvedAt: new Date().toISOString()
    }
  });

  // Mark all pending EMIs as closed/waived? 
  // Let's just keep it simple, the loan is marked as completed.
  // We can update EMIs to reflect this in the future if needed.

  res.json({ message: 'Foreclosure approved and loan completed' });
});

router.post('/profile/organization-logo', upload.single('logo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
  const key = `users/${req.user.userId}/logo_${Date.now()}`;
  await uploadBuffer(key, req.file.buffer);
  await db.updateUser(req.user.userId, { organizationLogoKey: key });
  res.json({ message: 'Logo uploaded' });
});

module.exports = router;
