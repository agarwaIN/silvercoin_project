const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();
const db = require('./mongoService');

// In-memory fallback / cache for fast access & local resilience
const memoryNotifications = [];
const readNotificationIdsByUser = new Map(); // userId -> Set of read notificationIds

function normalizeLoanDisplay(loan) {
  if (!loan) return 'Loan Application';
  return loan.displayLoanId || loan.officialLoanId || loan.applicationNumber || loan.loanId || 'Loan Application';
}

/**
 * Creates and persists a notification
 */
async function createNotification({
  recipientId,
  recipientRole,
  title,
  body,
  type,
  loanId = null,
  displayLoanId = null,
  ownerName = null,
  actorName = null,
  actorRole = null,
  metadata = {},
}) {
  const notification = {
    notificationId: `notif_${Date.now()}_${uuidv4().slice(0, 8)}`,
    recipientId: recipientId || (recipientRole === 'admin' ? 'admin' : null),
    recipientRole: recipientRole || 'admin',
    title: title || 'Loan Notification',
    body: body || '',
    type: type || 'general',
    loanId: loanId || null,
    displayLoanId: displayLoanId || null,
    ownerName: ownerName || null,
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
 * Helper: Employee actions -> Notify Admin
 */
async function notifyLoanSubmitted({ loan, employee }) {
  const displayId = normalizeLoanDisplay(loan);
  const empName = employee?.name || loan?.employeeName || 'Employee';
  const owner = loan?.ownerName || 'Customer';
  const amountStr = loan?.loanAmount || loan?.approvedAmount ? ` (₹${Number(loan.loanAmount || loan.approvedAmount).toLocaleString('en-IN')})` : '';

  return createNotification({
    recipientId: loan?.adminId || 'admin',
    recipientRole: 'admin',
    title: 'New Loan Application Submitted',
    body: `${empName} submitted loan application ${displayId} for ${owner}${amountStr}.`,
    type: 'loan_submitted',
    loanId: loan?.loanId,
    displayLoanId: displayId,
    ownerName: owner,
    actorName: empName,
    actorRole: 'employee',
    metadata: { loanAmount: loan?.loanAmount, status: 'submitted' },
  });
}

async function notifyAgreementSubmitted({ loan, employee }) {
  const displayId = normalizeLoanDisplay(loan);
  const empName = employee?.name || loan?.employeeName || 'Employee';
  const owner = loan?.ownerName || 'Customer';

  return createNotification({
    recipientId: loan?.adminId || 'admin',
    recipientRole: 'admin',
    title: 'Agreement Uploaded',
    body: `${empName} uploaded signed agreement for loan ${displayId} (${owner}).`,
    type: 'agreement_submitted',
    loanId: loan?.loanId,
    displayLoanId: displayId,
    ownerName: owner,
    actorName: empName,
    actorRole: 'employee',
  });
}

async function notifyOwnerNotInterested({ loan, employee }) {
  const displayId = normalizeLoanDisplay(loan);
  const empName = employee?.name || loan?.employeeName || 'Employee';
  const owner = loan?.ownerName || 'Customer';

  return createNotification({
    recipientId: loan?.adminId || 'admin',
    recipientRole: 'admin',
    title: 'Application Cancelled',
    body: `${empName} marked loan ${displayId} (${owner}) as Owner Not Interested.`,
    type: 'owner_not_interested',
    loanId: loan?.loanId,
    displayLoanId: displayId,
    ownerName: owner,
    actorName: empName,
    actorRole: 'employee',
  });
}

async function notifyEmiPaymentCollected({ loan, employee, amount, receiptNumber }) {
  const displayId = normalizeLoanDisplay(loan);
  const empName = employee?.name || 'Employee';
  const owner = loan?.ownerName || 'Customer';

  return createNotification({
    recipientId: loan?.adminId || 'admin',
    recipientRole: 'admin',
    title: 'EMI Payment Collected',
    body: `${empName} collected ₹${Number(amount || 0).toLocaleString('en-IN')} for loan ${displayId} (${owner}). Ref: ${receiptNumber || 'Cash'}`,
    type: 'emi_collected',
    loanId: loan?.loanId,
    displayLoanId: displayId,
    ownerName: owner,
    actorName: empName,
    actorRole: 'employee',
    metadata: { amount, receiptNumber },
  });
}

async function notifyEmiChangeRequested({ loan, employee, emiChangeRequest }) {
  const displayId = normalizeLoanDisplay(loan);
  const empName = employee?.name || loan?.employeeName || 'Employee';
  const owner = loan?.ownerName || 'Customer';
  const newEmi = emiChangeRequest?.emiAmount ? ` (New EMI: ₹${Number(emiChangeRequest.emiAmount).toLocaleString('en-IN')})` : '';

  return createNotification({
    recipientId: loan?.adminId || 'admin',
    recipientRole: 'admin',
    title: 'EMI Schedule Change Requested',
    body: `${empName} requested change in EMI terms for loan ${displayId} (${owner})${newEmi}.`,
    type: 'emi_change_requested',
    loanId: loan?.loanId,
    displayLoanId: displayId,
    ownerName: owner,
    actorName: empName,
    actorRole: 'employee',
  });
}

/**
 * Helper: Admin actions -> Notify Employee
 */
async function notifyLoanApproved({ loan, admin }) {
  if (!loan?.employeeId) return null;
  const displayId = normalizeLoanDisplay(loan);
  const adminName = admin?.name || 'Admin';
  const owner = loan?.ownerName || 'Customer';
  const amountStr = loan?.approvedAmount ? `₹${Number(loan.approvedAmount).toLocaleString('en-IN')}` : 'approved';
  const emiStr = loan?.emiAmount ? `, EMI: ₹${Number(loan.emiAmount).toLocaleString('en-IN')}` : '';

  return createNotification({
    recipientId: loan.employeeId,
    recipientRole: 'employee',
    title: 'Loan Terms Approved',
    body: `Admin ${adminName} approved terms for loan ${displayId} (${owner}) for ${amountStr}${emiStr}.`,
    type: 'loan_approved',
    loanId: loan?.loanId,
    displayLoanId: displayId,
    ownerName: owner,
    actorName: adminName,
    actorRole: 'admin',
  });
}

async function notifyLoanInitiallyApproved({ loan, admin, approvedAmount }) {
  if (!loan?.employeeId) return null;
  const displayId = normalizeLoanDisplay(loan);
  const adminName = admin?.name || 'Admin';
  const owner = loan?.ownerName || 'Customer';

  return createNotification({
    recipientId: loan.employeeId,
    recipientRole: 'employee',
    title: 'Loan Initially Approved',
    body: `Admin ${adminName} initially approved loan ${displayId} (${owner}) for ₹${Number(approvedAmount || 0).toLocaleString('en-IN')}. Please upload agreement.`,
    type: 'loan_initially_approved',
    loanId: loan?.loanId,
    displayLoanId: displayId,
    ownerName: owner,
    actorName: adminName,
    actorRole: 'admin',
  });
}

async function notifyLoanRejected({ loan, admin, reason }) {
  if (!loan?.employeeId) return null;
  const displayId = normalizeLoanDisplay(loan);
  const adminName = admin?.name || 'Admin';
  const owner = loan?.ownerName || 'Customer';
  const reasonStr = reason ? `: "${reason}"` : '';

  return createNotification({
    recipientId: loan.employeeId,
    recipientRole: 'employee',
    title: 'Loan Application Rejected',
    body: `Admin ${adminName} rejected loan ${displayId} (${owner})${reasonStr}.`,
    type: 'loan_rejected',
    loanId: loan?.loanId,
    displayLoanId: displayId,
    ownerName: owner,
    actorName: adminName,
    actorRole: 'admin',
    metadata: { reason },
  });
}

async function notifyLoanReturned({ loan, admin, reason }) {
  if (!loan?.employeeId) return null;
  const displayId = normalizeLoanDisplay(loan);
  const adminName = admin?.name || 'Admin';
  const owner = loan?.ownerName || 'Customer';
  const remarkStr = reason ? `: "${reason}"` : '';

  return createNotification({
    recipientId: loan.employeeId,
    recipientRole: 'employee',
    title: 'Loan Application Returned',
    body: `Admin ${adminName} returned loan ${displayId} (${owner}) for corrections${remarkStr}. Action required.`,
    type: 'loan_returned',
    loanId: loan?.loanId,
    displayLoanId: displayId,
    ownerName: owner,
    actorName: adminName,
    actorRole: 'admin',
    metadata: { reason },
  });
}

async function notifyLoanDisbursed({ loan, admin, amount, transactionNumber }) {
  if (!loan?.employeeId) return null;
  const displayId = normalizeLoanDisplay(loan);
  const adminName = admin?.name || 'Admin';
  const owner = loan?.ownerName || 'Customer';

  return createNotification({
    recipientId: loan.employeeId,
    recipientRole: 'employee',
    title: 'Loan Disbursed & Active',
    body: `Admin ${adminName} recorded disbursement of ₹${Number(amount || 0).toLocaleString('en-IN')} for loan ${displayId} (${owner}). Loan is now Active!`,
    type: 'loan_disbursed',
    loanId: loan?.loanId,
    displayLoanId: displayId,
    ownerName: owner,
    actorName: adminName,
    actorRole: 'admin',
    metadata: { amount, transactionNumber },
  });
}

async function notifyEmiChangeApproved({ loan, admin }) {
  if (!loan?.employeeId) return null;
  const displayId = normalizeLoanDisplay(loan);
  const adminName = admin?.name || 'Admin';
  const owner = loan?.ownerName || 'Customer';

  return createNotification({
    recipientId: loan.employeeId,
    recipientRole: 'employee',
    title: 'EMI Change Request Approved',
    body: `Admin ${adminName} approved the EMI schedule change for loan ${displayId} (${owner}).`,
    type: 'emi_change_approved',
    loanId: loan?.loanId,
    displayLoanId: displayId,
    ownerName: owner,
    actorName: adminName,
    actorRole: 'admin',
  });
}

async function notifyEmiChangeRejected({ loan, admin }) {
  if (!loan?.employeeId) return null;
  const displayId = normalizeLoanDisplay(loan);
  const adminName = admin?.name || 'Admin';
  const owner = loan?.ownerName || 'Customer';

  return createNotification({
    recipientId: loan.employeeId,
    recipientRole: 'employee',
    title: 'EMI Change Request Rejected',
    body: `Admin ${adminName} rejected the EMI schedule change for loan ${displayId} (${owner}).`,
    type: 'emi_change_rejected',
    loanId: loan?.loanId,
    displayLoanId: displayId,
    ownerName: owner,
    actorName: adminName,
    actorRole: 'admin',
  });
}

async function notifyLoanForeclosed({ loan, admin }) {
  if (!loan?.employeeId) return null;
  const displayId = normalizeLoanDisplay(loan);
  const adminName = admin?.name || 'Admin';
  const owner = loan?.ownerName || 'Customer';

  return createNotification({
    recipientId: loan.employeeId,
    recipientRole: 'employee',
    title: 'Loan Foreclosed & Settled',
    body: `Admin ${adminName} approved foreclosure settlement for loan ${displayId} (${owner}). Loan is now fully completed.`,
    type: 'loan_foreclosed',
    loanId: loan?.loanId,
    displayLoanId: displayId,
    ownerName: owner,
    actorName: adminName,
    actorRole: 'admin',
  });
}

/**
 * Synthesizes historical notifications from existing loans if DB has very few
 */
async function deriveHistoricalNotifications(user) {
  try {
    const isEmp = user.role === 'employee';
    let loans = [];
    if (isEmp) {
      loans = await db.listLoansByEmployee(user.userId).catch(() => []);
    } else {
      loans = await db.listAllLoans().catch(() => []);
    }

    if (!Array.isArray(loans)) return [];

    const historical = [];
    for (const loan of loans) {
      const displayId = normalizeLoanDisplay(loan);
      const owner = loan.ownerName || 'Customer';
      const empName = loan.employeeName || 'Employee';

      if (isEmp) {
        // Employee gets notifications of what Admin did
        if (loan.status === 'rejected') {
          historical.push({
            notificationId: `hist_rej_${loan.loanId}`,
            recipientId: user.userId,
            recipientRole: 'employee',
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
        // Admin gets notifications of what Employee did
        if (['submitted', 'initially_approved', 'agreement_submitted', 'approved', 'active', 'completed', 'returned', 'rejected'].includes(loan.status)) {
          historical.push({
            notificationId: `hist_sub_${loan.loanId}`,
            recipientId: user.userId,
            recipientRole: 'admin',
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
 * Fetch all notifications for a specific user
 */
async function getNotificationsForUser(user) {
  const userId = user.userId;
  const role = user.role;

  let storedDb = [];
  try {
    if (db.listNotificationsForRecipient) {
      storedDb = await db.listNotificationsForRecipient(userId);
      if (role === 'admin') {
        const adminGeneric = await db.listNotificationsForRecipient('admin').catch(() => []);
        storedDb = [...storedDb, ...adminGeneric];
      }
    }
  } catch (e) {
    storedDb = [];
  }

  // Combine DB notifications + in-memory notifications
  const combinedMap = new Map();

  for (const n of storedDb) {
    combinedMap.set(n.notificationId, n);
  }

  for (const n of memoryNotifications) {
    const isTarget = n.recipientId === userId || n.recipientRole === role || (role === 'admin' && n.recipientId === 'admin');
    if (isTarget) {
      combinedMap.set(n.notificationId, n);
    }
  }

  // If fewer than 5 notifications, seed historical notifications from actual loan activity
  if (combinedMap.size < 5) {
    const historical = await deriveHistoricalNotifications(user);
    for (const h of historical) {
      if (!combinedMap.has(h.notificationId)) {
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
async function markNotificationAsRead(notificationId, user) {
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
    if (m.recipientId === userId || m.recipientRole === user.role || (user.role === 'admin' && m.recipientId === 'admin')) {
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
