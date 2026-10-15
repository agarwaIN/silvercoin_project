const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();
let db;
try {
  db = require('./mongoService');
} catch (err) {
  db = {};
}

// In-memory fallback / cache for fast access & local resilience
const memoryNotifications = [];
const readNotificationIdsByUser = new Map(); // userId -> Set of read notificationIds

function normalizeLoanDisplay(loan) {
  if (!loan) return 'Loan Application';
  return loan.displayLoanId || loan.officialLoanId || loan.applicationNumber || loan.loanId || 'Loan Application';
}

/**
 * Robust argument unpacker so helpers work whether called as:
 * helper(loan, actor, extra1, extra2) OR helper({ loan, employee/admin, ... })
 */
function unpackLoanAndActor(arg1, arg2, arg3, arg4) {
  if (arg1 && typeof arg1 === 'object' && arg1.loan) {
    return {
      loan: arg1.loan,
      actor: arg1.actor || arg1.employee || arg1.admin,
      extra1: arg1.extra1 !== undefined ? arg1.extra1 : (arg1.amount !== undefined ? arg1.amount : (arg1.reason !== undefined ? arg1.reason : arg1.approvedAmount)),
      extra2: arg1.extra2 !== undefined ? arg1.extra2 : (arg1.transactionNumber || arg1.emiChangeRequest || arg1.receiptNumber),
    };
  }
  return {
    loan: arg1,
    actor: arg2,
    extra1: arg3,
    extra2: arg4,
  };
}

/**
 * Creates and persists a notification strictly bound to recipient, adminId, and employeeId.
 */
async function createNotification({
  recipientId,
  recipientRole,
  adminId = null,
  employeeId = null,
  title,
  body,
  type,
  loanId = null,
  displayLoanId = null,
  ownerName = null,
  actorId = null,
  actorName = null,
  actorRole = null,
  metadata = {},
}) {
  if (!recipientId) {
    console.warn('[NotificationService] Refusing to create notification with null recipientId');
    return null;
  }

  const notification = {
    notificationId: `notif_${Date.now()}_${uuidv4().slice(0, 8)}`,
    recipientId,
    recipientRole: recipientRole || (recipientId.startsWith('emp') ? 'employee' : 'admin'),
    adminId: adminId || null,
    employeeId: employeeId || null,
    title: title || 'Loan Notification',
    body: body || '',
    type: type || 'general',
    loanId: loanId || null,
    displayLoanId: displayLoanId || null,
    ownerName: ownerName || null,
    actorId: actorId || null,
    actorName: actorName || null,
    actorRole: actorRole || null,
    metadata: metadata || {},
    isRead: false,
    createdAt: new Date().toISOString(),
  };

  memoryNotifications.unshift(notification);
  if (memoryNotifications.length > 500) {
    memoryNotifications.pop();
  }

  try {
    if (db.createNotification) {
      await db.createNotification(notification);
    }
  } catch (err) {
    // Non-fatal, in-memory cache maintains notification
    console.warn('[NotificationService] DynamoDB store warning:', err.message);
  }

  return notification;
}

/**
 * Helper: Employee actions -> Notify the loan's own Admin only
 */
async function notifyLoanSubmitted(arg1, arg2) {
  const { loan, actor: employee } = unpackLoanAndActor(arg1, arg2);
  if (!loan) return null;
  const adminId = loan.adminId || employee?.createdBy;
  if (!adminId) return null;

  const displayId = normalizeLoanDisplay(loan);
  const empName = employee?.name || loan.employeeName || 'Employee';
  const owner = loan.ownerName || 'Customer';
  const amountStr = loan.loanAmount || loan.approvedAmount ? ` (₹${Number(loan.loanAmount || loan.approvedAmount).toLocaleString('en-IN')})` : '';

  return createNotification({
    recipientId: adminId,
    recipientRole: 'admin',
    adminId: adminId,
    employeeId: loan.employeeId || employee?.userId,
    title: 'New Loan Application Submitted',
    body: `${empName} submitted loan application ${displayId} for ${owner}${amountStr}.`,
    type: 'loan_submitted',
    loanId: loan.loanId,
    displayLoanId: displayId,
    ownerName: owner,
    actorId: employee?.userId || loan.employeeId,
    actorName: empName,
    actorRole: 'employee',
    metadata: { loanAmount: loan.loanAmount, status: 'submitted' },
  });
}

async function notifyAgreementSubmitted(arg1, arg2) {
  const { loan, actor: employee } = unpackLoanAndActor(arg1, arg2);
  if (!loan) return null;
  const adminId = loan.adminId || employee?.createdBy;
  if (!adminId) return null;

  const displayId = normalizeLoanDisplay(loan);
  const empName = employee?.name || loan.employeeName || 'Employee';
  const owner = loan.ownerName || 'Customer';

  return createNotification({
    recipientId: adminId,
    recipientRole: 'admin',
    adminId: adminId,
    employeeId: loan.employeeId || employee?.userId,
    title: 'Agreement Uploaded',
    body: `${empName} uploaded signed agreement for loan ${displayId} (${owner}).`,
    type: 'agreement_submitted',
    loanId: loan.loanId,
    displayLoanId: displayId,
    ownerName: owner,
    actorId: employee?.userId || loan.employeeId,
    actorName: empName,
    actorRole: 'employee',
  });
}

async function notifyOwnerNotInterested(arg1, arg2) {
  const { loan, actor: employee } = unpackLoanAndActor(arg1, arg2);
  if (!loan) return null;
  const adminId = loan.adminId || employee?.createdBy;
  if (!adminId) return null;

  const displayId = normalizeLoanDisplay(loan);
  const empName = employee?.name || loan.employeeName || 'Employee';
  const owner = loan.ownerName || 'Customer';

  return createNotification({
    recipientId: adminId,
    recipientRole: 'admin',
    adminId: adminId,
    employeeId: loan.employeeId || employee?.userId,
    title: 'Application Cancelled',
    body: `${empName} marked loan ${displayId} (${owner}) as Owner Not Interested.`,
    type: 'owner_not_interested',
    loanId: loan.loanId,
    displayLoanId: displayId,
    ownerName: owner,
    actorId: employee?.userId || loan.employeeId,
    actorName: empName,
    actorRole: 'employee',
  });
}

async function notifyEmiPaymentCollected(arg1, arg2, arg3, arg4) {
  const { loan, actor: employee, extra1: amount, extra2: receiptNumber } = unpackLoanAndActor(arg1, arg2, arg3, arg4);
  if (!loan) return null;
  const adminId = loan.adminId || employee?.createdBy;
  if (!adminId) return null;

  const displayId = normalizeLoanDisplay(loan);
  const empName = employee?.name || loan.employeeName || 'Employee';
  const owner = loan.ownerName || 'Customer';
  const refStr = typeof receiptNumber === 'object' ? (receiptNumber?.transactionRef || receiptNumber?.emiNumber ? `EMI #${receiptNumber.emiNumber}` : 'Payment') : (receiptNumber || 'Payment');

  return createNotification({
    recipientId: adminId,
    recipientRole: 'admin',
    adminId: adminId,
    employeeId: loan.employeeId || employee?.userId,
    title: 'EMI Payment Collected',
    body: `${empName} collected ₹${Number(amount || 0).toLocaleString('en-IN')} for loan ${displayId} (${owner}). Ref: ${refStr}`,
    type: 'emi_payment_collected',
    loanId: loan.loanId,
    displayLoanId: displayId,
    ownerName: owner,
    actorId: employee?.userId || loan.employeeId,
    actorName: empName,
    actorRole: 'employee',
    metadata: { amount, receiptNumber: refStr },
  });
}

async function notifyEmiChangeRequested(arg1, arg2, arg3) {
  const { loan, actor: employee, extra1: emiChangeRequest } = unpackLoanAndActor(arg1, arg2, arg3);
  if (!loan) return null;
  const adminId = loan.adminId || employee?.createdBy;
  if (!adminId) return null;

  const displayId = normalizeLoanDisplay(loan);
  const empName = employee?.name || loan.employeeName || 'Employee';
  const owner = loan.ownerName || 'Customer';
  const newEmi = emiChangeRequest?.emiAmount ? ` (New EMI: ₹${Number(emiChangeRequest.emiAmount).toLocaleString('en-IN')})` : '';

  return createNotification({
    recipientId: adminId,
    recipientRole: 'admin',
    adminId: adminId,
    employeeId: loan.employeeId || employee?.userId,
    title: 'EMI Schedule Change Requested',
    body: `${empName} requested change in EMI terms for loan ${displayId} (${owner})${newEmi}.`,
    type: 'emi_change_request',
    loanId: loan.loanId,
    displayLoanId: displayId,
    ownerName: owner,
    actorId: employee?.userId || loan.employeeId,
    actorName: empName,
    actorRole: 'employee',
  });
}

/**
 * Helper: Admin actions -> Notify the loan's own Employee only
 */
async function notifyLoanApproved(arg1, arg2) {
  const { loan, actor: admin } = unpackLoanAndActor(arg1, arg2);
  const employeeId = loan?.employeeId || loan?.assignedEmployeeId;
  if (!employeeId) return null;
  const adminId = loan?.adminId || admin?.userId;

  const displayId = normalizeLoanDisplay(loan);
  const adminName = admin?.name || 'Admin';
  const owner = loan?.ownerName || 'Customer';
  const amountStr = loan?.approvedAmount ? `₹${Number(loan.approvedAmount).toLocaleString('en-IN')}` : 'approved';
  const emiStr = loan?.emiAmount ? `, EMI: ₹${Number(loan.emiAmount).toLocaleString('en-IN')}` : '';

  return createNotification({
    recipientId: employeeId,
    recipientRole: 'employee',
    adminId: adminId,
    employeeId: employeeId,
    title: 'Loan Terms Approved',
    body: `Admin ${adminName} approved terms for loan ${displayId} (${owner}) for ${amountStr}${emiStr}.`,
    type: 'loan_approved',
    loanId: loan.loanId,
    displayLoanId: displayId,
    ownerName: owner,
    actorId: admin?.userId,
    actorName: adminName,
    actorRole: 'admin',
  });
}

async function notifyLoanInitiallyApproved(arg1, arg2, arg3) {
  const { loan, actor: admin, extra1: approvedAmount } = unpackLoanAndActor(arg1, arg2, arg3);
  const employeeId = loan?.employeeId || loan?.assignedEmployeeId;
  if (!employeeId) return null;
  const adminId = loan?.adminId || admin?.userId;

  const displayId = normalizeLoanDisplay(loan);
  const adminName = admin?.name || 'Admin';
  const owner = loan?.ownerName || 'Customer';
  const amt = approvedAmount || loan?.approvedAmount || loan?.loanAmount || 0;

  return createNotification({
    recipientId: employeeId,
    recipientRole: 'employee',
    adminId: adminId,
    employeeId: employeeId,
    title: 'Loan Initially Approved',
    body: `Admin ${adminName} initially approved loan ${displayId} (${owner}) for ₹${Number(amt).toLocaleString('en-IN')}. Please upload agreement.`,
    type: 'loan_initially_approved',
    loanId: loan.loanId,
    displayLoanId: displayId,
    ownerName: owner,
    actorId: admin?.userId,
    actorName: adminName,
    actorRole: 'admin',
  });
}

async function notifyLoanRejected(arg1, arg2, arg3) {
  const { loan, actor: admin, extra1: reason } = unpackLoanAndActor(arg1, arg2, arg3);
  const employeeId = loan?.employeeId || loan?.assignedEmployeeId;
  if (!employeeId) return null;
  const adminId = loan?.adminId || admin?.userId;

  const displayId = normalizeLoanDisplay(loan);
  const adminName = admin?.name || 'Admin';
  const owner = loan?.ownerName || 'Customer';
  const reasonStr = reason ? `: "${reason}"` : '';

  return createNotification({
    recipientId: employeeId,
    recipientRole: 'employee',
    adminId: adminId,
    employeeId: employeeId,
    title: 'Loan Application Rejected',
    body: `Admin ${adminName} rejected loan ${displayId} (${owner})${reasonStr}.`,
    type: 'loan_rejected',
    loanId: loan.loanId,
    displayLoanId: displayId,
    ownerName: owner,
    actorId: admin?.userId,
    actorName: adminName,
    actorRole: 'admin',
    metadata: { reason },
  });
}

async function notifyLoanReturned(arg1, arg2, arg3) {
  const { loan, actor: admin, extra1: reason } = unpackLoanAndActor(arg1, arg2, arg3);
  const employeeId = loan?.employeeId || loan?.assignedEmployeeId;
  if (!employeeId) return null;
  const adminId = loan?.adminId || admin?.userId;

  const displayId = normalizeLoanDisplay(loan);
  const adminName = admin?.name || 'Admin';
  const owner = loan?.ownerName || 'Customer';
  const remarkStr = reason ? `: "${reason}"` : '';

  return createNotification({
    recipientId: employeeId,
    recipientRole: 'employee',
    adminId: adminId,
    employeeId: employeeId,
    title: 'Loan Application Returned',
    body: `Admin ${adminName} returned loan ${displayId} (${owner}) for corrections${remarkStr}. Action required.`,
    type: 'loan_returned',
    loanId: loan.loanId,
    displayLoanId: displayId,
    ownerName: owner,
    actorId: admin?.userId,
    actorName: adminName,
    actorRole: 'admin',
    metadata: { reason },
  });
}

async function notifyLoanDisbursed(arg1, arg2, arg3, arg4) {
  const { loan, actor: admin, extra1: amount, extra2: transactionNumber } = unpackLoanAndActor(arg1, arg2, arg3, arg4);
  const employeeId = loan?.employeeId || loan?.assignedEmployeeId;
  if (!employeeId) return null;
  const adminId = loan?.adminId || admin?.userId;

  const displayId = normalizeLoanDisplay(loan);
  const adminName = admin?.name || 'Admin';
  const owner = loan?.ownerName || 'Customer';

  return createNotification({
    recipientId: employeeId,
    recipientRole: 'employee',
    adminId: adminId,
    employeeId: employeeId,
    title: 'Loan Disbursed & Active',
    body: `Admin ${adminName} recorded disbursement of ₹${Number(amount || 0).toLocaleString('en-IN')} for loan ${displayId} (${owner}). Loan is now Active!`,
    type: 'loan_disbursed',
    loanId: loan.loanId,
    displayLoanId: displayId,
    ownerName: owner,
    actorId: admin?.userId,
    actorName: adminName,
    actorRole: 'admin',
    metadata: { amount, transactionNumber },
  });
}

async function notifyEmiChangeApproved(arg1, arg2) {
  const { loan, actor: admin } = unpackLoanAndActor(arg1, arg2);
  const employeeId = loan?.employeeId || loan?.assignedEmployeeId;
  if (!employeeId) return null;
  const adminId = loan?.adminId || admin?.userId;

  const displayId = normalizeLoanDisplay(loan);
  const adminName = admin?.name || 'Admin';
  const owner = loan?.ownerName || 'Customer';

  return createNotification({
    recipientId: employeeId,
    recipientRole: 'employee',
    adminId: adminId,
    employeeId: employeeId,
    title: 'EMI Change Request Approved',
    body: `Admin ${adminName} approved the EMI schedule change for loan ${displayId} (${owner}).`,
    type: 'emi_change_approved',
    loanId: loan.loanId,
    displayLoanId: displayId,
    ownerName: owner,
    actorId: admin?.userId,
    actorName: adminName,
    actorRole: 'admin',
  });
}

async function notifyEmiChangeRejected(arg1, arg2) {
  const { loan, actor: admin } = unpackLoanAndActor(arg1, arg2);
  const employeeId = loan?.employeeId || loan?.assignedEmployeeId;
  if (!employeeId) return null;
  const adminId = loan?.adminId || admin?.userId;

  const displayId = normalizeLoanDisplay(loan);
  const adminName = admin?.name || 'Admin';
  const owner = loan?.ownerName || 'Customer';

  return createNotification({
    recipientId: employeeId,
    recipientRole: 'employee',
    adminId: adminId,
    employeeId: employeeId,
    title: 'EMI Change Request Rejected',
    body: `Admin ${adminName} rejected the EMI schedule change for loan ${displayId} (${owner}).`,
    type: 'emi_change_rejected',
    loanId: loan.loanId,
    displayLoanId: displayId,
    ownerName: owner,
    actorId: admin?.userId,
    actorName: adminName,
    actorRole: 'admin',
  });
}

async function notifyLoanForeclosed(arg1, arg2, arg3) {
  const { loan, actor: admin, extra1: totalAmount } = unpackLoanAndActor(arg1, arg2, arg3);
  const employeeId = loan?.employeeId || loan?.assignedEmployeeId;
  if (!employeeId) return null;
  const adminId = loan?.adminId || admin?.userId;

  const displayId = normalizeLoanDisplay(loan);
  const adminName = admin?.name || 'Admin';
  const owner = loan?.ownerName || 'Customer';
  const amtStr = totalAmount ? ` for ₹${Number(totalAmount).toLocaleString('en-IN')}` : '';

  return createNotification({
    recipientId: employeeId,
    recipientRole: 'employee',
    adminId: adminId,
    employeeId: employeeId,
    title: 'Loan Foreclosed & Settled',
    body: `Admin ${adminName} settled foreclosure for loan ${displayId} (${owner})${amtStr}. Loan is now closed.`,
    type: 'loan_foreclosed',
    loanId: loan.loanId,
    displayLoanId: displayId,
    ownerName: owner,
    actorId: admin?.userId,
    actorName: adminName,
    actorRole: 'admin',
  });
}

/**
 * Synthesizes historical notifications ONLY from existing loans belonging strictly to this user
 */
async function deriveHistoricalNotifications(user) {
  try {
    const isEmp = user.role === 'employee';
    let loans = [];
    if (isEmp) {
      if (db.listLoansByEmployee) {
        loans = await db.listLoansByEmployee(user.userId).catch(() => []);
      }
      loans = (loans || []).filter(l => l && (String(l.employeeId || '') === String(user.userId) || String(l.assignedEmployeeId || '') === String(user.userId)));
    } else {
      if (db.listLoansByAdmin) {
        loans = await db.listLoansByAdmin(user.userId).catch(() => []);
      }
      loans = (loans || []).filter(l => l && String(l.adminId || '') === String(user.userId));
    }

    if (!Array.isArray(loans)) return [];

    const historical = [];
    for (const loan of loans) {
      const displayId = normalizeLoanDisplay(loan);
      const owner = loan.ownerName || 'Customer';
      const empName = loan.employeeName || 'Employee';

      if (isEmp) {
        // Employee gets notifications of what their Admin did on their loans
        if (loan.status === 'rejected') {
          historical.push({
            notificationId: `hist_rej_${loan.loanId}`,
            recipientId: user.userId,
            recipientRole: 'employee',
            adminId: loan.adminId,
            employeeId: user.userId,
            title: 'Loan Application Rejected',
            body: `Admin rejected loan ${displayId} (${owner}). Remark: "${loan.rejectionReason || loan.rejectReason || loan.remark || 'Rejected'}"`,
            type: 'loan_rejected',
            loanId: loan.loanId,
            displayLoanId: displayId,
            ownerName: owner,
            actorName: 'Admin',
            actorRole: 'admin',
            isRead: false,
            createdAt: loan.rejectedAt || loan.updatedAt || loan.createdAt || new Date().toISOString(),
          });
        }
        if (loan.status === 'returned') {
          historical.push({
            notificationId: `hist_ret_${loan.loanId}`,
            recipientId: user.userId,
            recipientRole: 'employee',
            adminId: loan.adminId,
            employeeId: user.userId,
            title: 'Loan Application Returned',
            body: `Admin returned loan ${displayId} (${owner}) for corrections. Remark: "${loan.returnReason || loan.remark || 'Corrections needed'}"`,
            type: 'loan_returned',
            loanId: loan.loanId,
            displayLoanId: displayId,
            ownerName: owner,
            actorName: 'Admin',
            actorRole: 'admin',
            isRead: false,
            createdAt: loan.updatedAt || loan.createdAt || new Date().toISOString(),
          });
        }
        if (['active', 'completed'].includes(loan.status) && loan.disbursements?.length > 0) {
          historical.push({
            notificationId: `hist_disb_${loan.loanId}`,
            recipientId: user.userId,
            recipientRole: 'employee',
            adminId: loan.adminId,
            employeeId: user.userId,
            title: 'Loan Disbursed & Active',
            body: `Admin recorded disbursement for loan ${displayId} (${owner}). Loan is now Active.`,
            type: 'loan_disbursed',
            loanId: loan.loanId,
            displayLoanId: displayId,
            ownerName: owner,
            actorName: 'Admin',
            actorRole: 'admin',
            isRead: false,
            createdAt: loan.disbursements[0]?.date || loan.updatedAt || new Date().toISOString(),
          });
        } else if (['approved', 'active', 'completed'].includes(loan.status)) {
          historical.push({
            notificationId: `hist_appr_${loan.loanId}`,
            recipientId: user.userId,
            recipientRole: 'employee',
            adminId: loan.adminId,
            employeeId: user.userId,
            title: 'Loan Terms Approved',
            body: `Admin approved loan ${displayId} (${owner}) for ₹${Number(loan.approvedAmount || loan.loanAmount || 0).toLocaleString('en-IN')}.`,
            type: 'loan_approved',
            loanId: loan.loanId,
            displayLoanId: displayId,
            ownerName: owner,
            actorName: 'Admin',
            actorRole: 'admin',
            isRead: false,
            createdAt: loan.approvedAt || loan.updatedAt || new Date().toISOString(),
          });
        }
      } else {
        // Admin gets notifications of what THEIR Employees did on their loans
        if (['submitted', 'initially_approved', 'agreement_submitted', 'approved', 'active', 'completed', 'returned', 'rejected'].includes(loan.status)) {
          historical.push({
            notificationId: `hist_sub_${loan.loanId}`,
            recipientId: user.userId,
            recipientRole: 'admin',
            adminId: user.userId,
            employeeId: loan.employeeId,
            title: 'Loan Application Submitted',
            body: `${empName} submitted loan application ${displayId} for ${owner} (₹${Number(loan.loanAmount || loan.approvedAmount || 0).toLocaleString('en-IN')}).`,
            type: 'loan_submitted',
            loanId: loan.loanId,
            displayLoanId: displayId,
            ownerName: owner,
            actorName: empName,
            actorRole: 'employee',
            isRead: false,
            createdAt: loan.submittedAt || loan.createdAt || new Date().toISOString(),
          });
        }
        if (loan.status === 'agreement_submitted' || loan.agreementUri) {
          historical.push({
            notificationId: `hist_agr_${loan.loanId}`,
            recipientId: user.userId,
            recipientRole: 'admin',
            adminId: user.userId,
            employeeId: loan.employeeId,
            title: 'Agreement Uploaded',
            body: `${empName} uploaded signed agreement for loan ${displayId} (${owner}).`,
            type: 'agreement_submitted',
            loanId: loan.loanId,
            displayLoanId: displayId,
            ownerName: owner,
            actorName: empName,
            actorRole: 'employee',
            isRead: false,
            createdAt: loan.updatedAt || new Date().toISOString(),
          });
        }
        if (loan.status === 'owner_not_interested') {
          historical.push({
            notificationId: `hist_oni_${loan.loanId}`,
            recipientId: user.userId,
            recipientRole: 'admin',
            adminId: user.userId,
            employeeId: loan.employeeId,
            title: 'Application Cancelled',
            body: `${empName} marked loan ${displayId} (${owner}) as Owner Not Interested.`,
            type: 'owner_not_interested',
            loanId: loan.loanId,
            displayLoanId: displayId,
            ownerName: owner,
            actorName: empName,
            actorRole: 'employee',
            isRead: false,
            createdAt: loan.updatedAt || new Date().toISOString(),
          });
        }
      }
    }

    return historical;
  } catch (e) {
    console.warn('[NotificationService] Error deriving historical notifications:', e.message);
    return [];
  }
}

/**
 * Strict multi-tenant security filter:
 * Checks whether a notification belongs strictly to the authenticated user.
 */
function isNotificationForUser(n, user) {
  if (!n || !user) return false;

  if (user.role === 'admin') {
    if (n.recipientRole && n.recipientRole !== 'admin') return false;
    // If notification has adminId, it must match this admin's userId
    if (n.adminId && String(n.adminId) !== String(user.userId)) return false;
    // If recipientId is not 'admin' and doesn't match this admin, reject
    if (n.recipientId && n.recipientId !== 'admin' && String(n.recipientId) !== String(user.userId)) {
      return false;
    }
    // Must match either recipientId or adminId
    return String(n.recipientId) === String(user.userId) || String(n.adminId) === String(user.userId);
  }

  if (user.role === 'employee') {
    if (n.recipientRole && n.recipientRole !== 'employee') return false;
    // If employeeId is set, must match this employee
    if (n.employeeId && String(n.employeeId) !== String(user.userId)) return false;
    // Recipient must match this employee's userId
    if (n.recipientId && String(n.recipientId) !== String(user.userId)) return false;
    return String(n.recipientId) === String(user.userId) || String(n.employeeId) === String(user.userId);
  }

  return false;
}

/**
 * Fetch notifications strictly isolated for this specific user
 */
async function getNotificationsForUser(user) {
  const userId = user.userId;

  let storedDb = [];
  try {
    if (db.listNotificationsForRecipient) {
      storedDb = await db.listNotificationsForRecipient(userId);
    }
  } catch (e) {
    storedDb = [];
  }

  const combinedMap = new Map();

  for (const n of storedDb) {
    if (isNotificationForUser(n, user)) {
      combinedMap.set(n.notificationId, n);
    }
  }

  for (const n of memoryNotifications) {
    if (isNotificationForUser(n, user)) {
      combinedMap.set(n.notificationId, n);
    }
  }

  // Derive historical notifications strictly from this user's loans if few
  if (combinedMap.size < 5) {
    const historical = await deriveHistoricalNotifications(user);
    for (const h of historical) {
      if (!combinedMap.has(h.notificationId) && isNotificationForUser(h, user)) {
        combinedMap.set(h.notificationId, h);
      }
    }
  }

  const readSet = readNotificationIdsByUser.get(userId) || new Set();

  const list = Array.from(combinedMap.values()).map(item => ({
    ...item,
    isRead: Boolean(item.isRead || readSet.has(item.notificationId)),
  }));

  // Sort newest first
  list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  return list;
}

/**
 * Get count of unread notifications for a user
 */
async function getUnreadCount(user) {
  const notifications = await getNotificationsForUser(user);
  return notifications.filter(n => !n.isRead).length;
}

/**
 * Mark a single notification as read
 */
async function markNotificationAsRead(arg1, arg2) {
  const user = (arg1 && typeof arg1 === 'object' && arg1.userId) ? arg1 : ((arg2 && typeof arg2 === 'object' && arg2.userId) ? arg2 : null);
  const notificationId = typeof arg1 === 'string' ? arg1 : (typeof arg2 === 'string' ? arg2 : null);
  if (!user || !notificationId) return { success: false };

  const userId = user.userId;
  let readSet = readNotificationIdsByUser.get(userId);
  if (!readSet) {
    readSet = new Set();
    readNotificationIdsByUser.set(userId, readSet);
  }
  readSet.add(notificationId);

  // Update in memory array if present
  const mem = memoryNotifications.find(n => n.notificationId === notificationId);
  if (mem) mem.isRead = true;

  try {
    if (db.updateNotification) {
      await db.updateNotification(notificationId, { isRead: true });
    }
  } catch (err) {
    // Non-fatal
  }

  return { success: true, notificationId };
}

/**
 * Mark all notifications as read for a user
 */
async function markAllNotificationsAsRead(user) {
  const list = await getNotificationsForUser(user);
  const userId = user.userId;
  let readSet = readNotificationIdsByUser.get(userId);
  if (!readSet) {
    readSet = new Set();
    readNotificationIdsByUser.set(userId, readSet);
  }

  for (const n of list) {
    readSet.add(n.notificationId);
    if (n.notificationId.startsWith('notif_')) {
      try {
        if (db.updateNotification) {
          await db.updateNotification(n.notificationId, { isRead: true });
        }
      } catch (e) {}
    }
  }

  for (const m of memoryNotifications) {
    if (isNotificationForUser(m, user)) {
      m.isRead = true;
    }
  }

  return { success: true, count: list.length };
}

module.exports = {
  createNotification,
  notifyLoanSubmitted,
  notifyAgreementSubmitted,
  notifyOwnerNotInterested,
  notifyEmiPaymentCollected,
  notifyEmiChangeRequested,
  notifyLoanApproved,
  notifyLoanInitiallyApproved,
  notifyLoanRejected,
  notifyLoanReturned,
  notifyLoanDisbursed,
  notifyEmiChangeApproved,
  notifyEmiChangeRejected,
  notifyLoanForeclosed,
  getNotificationsForUser,
  getUnreadCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
};
