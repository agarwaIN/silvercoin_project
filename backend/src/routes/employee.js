const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const db = require('../services/mongoService');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleCheck');
const { auditLog } = require('../middleware/auditMiddleware');
const { generateAppId } = require('../services/loanIdService');
const multer = require('multer');
const { uploadBuffer, getPresignedUrl } = require('../services/localFileStorageService');
const { ensureEmiSchedule, buildLoanRecoveryItems, recordLoanPayment } = require('../services/emiService');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 150 * 1024 * 1024 },
});

const router = express.Router();
router.use(verifyToken, requireRole('employee'), auditLog);

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
  const enriched = (loans || []).map(l => ({ ...l, employeeName: l.employeeName || req.user.name }));
  res.json(enriched);
});

router.post('/loans', async (req, res) => {
  const user = await db.getUserById(req.user.userId);
  const appId = await generateAppId();
  const now = new Date().toISOString();
  const loan = {
    loanId: appId,
    applicationNumber: appId,
    displayLoanId: null,
    employeeId: user.userId,
    employeeName: user.name || req.user.name,
    adminId: user.createdBy,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  };
  await db.createLoan(loan);
  res.status(201).json(loan);
});

router.get('/loans/check-aadhaar', async (req, res) => {
  try {
    const { aadhaar, excludeLoanId } = req.query;
    if (!aadhaar) return res.json({ exists: false });
    const existing = await db.findLoanByAadhaar(aadhaar, excludeLoanId);
    if (existing) {
      return res.json({
        exists: true,
        loanId: existing.displayLoanId || existing.applicationNumber || existing.loanId,
        ownerName: existing.ownerName,
      });
    }
    return res.json({ exists: false });
  } catch (err) {
    console.error('Employee Check Aadhaar Error:', err);
    res.json({ exists: false });
  }
});

router.get('/loans/:loanId', async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  const isEmp = loan && (String(loan.employeeId || '') === String(req.user.userId) || String(loan.assignedEmployeeId || '') === String(req.user.userId));
  if (!loan || !isEmp) {
    return res.status(404).json({ message: 'Loan not found' });
  }
  const emis = await ensureEmiSchedule(loan);
  res.json({ ...loan, employeeName: loan.employeeName || req.user.name, emis });
});

function sanitizeMediaList(incomingList, existingList) {
  if (!Array.isArray(incomingList)) return incomingList;
  const existingMap = new Map();
  if (Array.isArray(existingList)) {
    for (const item of existingList) {
      if (!item) continue;
      if (item.id) existingMap.set(String(item.id), item);
      if (item.uri && !item.uri.startsWith('file:') && !item.uri.startsWith('content:')) {
        existingMap.set(String(item.uri), item);
      }
    }
  }

  const result = [];
  for (const item of incomingList) {
    if (!item || typeof item !== 'object') continue;
    const existing = (item.id && existingMap.get(String(item.id))) || (item.uri && existingMap.get(String(item.uri)));

    let effectiveUri = item.serverKey || item.key || item.uri || '';
    if (typeof effectiveUri === 'string' && (effectiveUri.startsWith('file:') || effectiveUri.startsWith('content:') || effectiveUri.startsWith('blob:'))) {
      if (existing && existing.uri && !existing.uri.startsWith('file:') && !existing.uri.startsWith('content:')) {
        effectiveUri = existing.uri;
      } else {
        effectiveUri = null;
      }
    }

    if (effectiveUri) {
      result.push({
        ...item,
        uri: effectiveUri,
        uploaded: true,
      });
    }
  }
  return result;
}

router.patch('/loans/:loanId', async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  const isEmp = loan && (String(loan.employeeId || '') === String(req.user.userId) || String(loan.assignedEmployeeId || '') === String(req.user.userId));
  if (!loan || !isEmp) {
    return res.status(404).json({ message: 'Loan not found' });
  }
  if (['approved'].includes(loan.status)) {
    return res.status(400).json({ message: 'Approved loans cannot be edited' });
  }

  // Validate that Aadhaar is unique across all loan applications
  if (req.body.aadhaar) {
    const cleanAadhaar = String(req.body.aadhaar).replace(/\D/g, '');
    if (cleanAadhaar.length === 12) {
      const existing = await db.findLoanByAadhaar(cleanAadhaar, loan.loanId);
      if (existing) {
        const existingId = existing.displayLoanId || existing.applicationNumber || existing.loanId;
        return res.status(400).json({
          message: `A loan application already exists with Aadhaar ending in ${cleanAadhaar.slice(-4)} (${existingId}). Only one loan application can be created for 1 Aadhaar number.`,
        });
      }
    }
  }

  const updates = { ...req.body, updatedAt: new Date().toISOString() };
  delete updates.loanId;
  delete updates.employeeId;
  delete updates.adminId;
  delete updates.status;

  if (updates.videoUri && (updates.videoUri.startsWith('file:') || updates.videoUri.startsWith('content:'))) {
    delete updates.videoUri;
  }
  if (updates.houseVideoUri && (updates.houseVideoUri.startsWith('file:') || updates.houseVideoUri.startsWith('content:'))) {
    delete updates.houseVideoUri;
  }

  if (Array.isArray(updates.propertyDocs)) {
    updates.propertyDocs = sanitizeMediaList(updates.propertyDocs, loan.propertyDocs);
  }
  if (Array.isArray(updates.propertyPhotos)) {
    updates.propertyPhotos = sanitizeMediaList(updates.propertyPhotos, loan.propertyPhotos);
  }
  if (Array.isArray(updates.videos)) {
    updates.videos = sanitizeMediaList(updates.videos, loan.videos);
  }

  const existingChangedFields = loan.changedFields || [];
  const newChangedFields = Object.keys(updates).filter(key => {
    if (key === 'updatedAt') return false;
    return JSON.stringify(loan[key]) !== JSON.stringify(updates[key]);
  });
  updates.changedFields = [...new Set([...existingChangedFields, ...newChangedFields])];

  await db.updateLoan(loan.loanId, updates);
  res.json({ ...(await db.getLoanById(loan.loanId)) });
});

router.post('/loans/:loanId/submit', async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  const isEmp = loan && (String(loan.employeeId || '') === String(req.user.userId) || String(loan.assignedEmployeeId || '') === String(req.user.userId));
  if (!loan || !isEmp) {
    return res.status(404).json({ message: 'Loan not found' });
  }

  // Enforce unique Aadhaar before final submission
  const targetAadhaar = (req.body && req.body.aadhaar) || loan.aadhaar;
  if (targetAadhaar) {
    const cleanAadhaar = String(targetAadhaar).replace(/\D/g, '');
    if (cleanAadhaar.length === 12) {
      const existing = await db.findLoanByAadhaar(cleanAadhaar, loan.loanId);
      if (existing) {
        const existingId = existing.displayLoanId || existing.applicationNumber || existing.loanId;
        return res.status(400).json({
          message: `Cannot submit: A loan application already exists with Aadhaar ending in ${cleanAadhaar.slice(-4)} (${existingId}). Only one loan application can be created for 1 Aadhaar number.`,
        });
      }
    }
  }

  const updates = { status: 'submitted', updatedAt: new Date().toISOString() };

  if (req.body) {
    const isValidKey = (u) => typeof u === 'string' && u.trim() && !u.startsWith('file:') && !u.startsWith('content:');
    if (req.body.videoUri && isValidKey(req.body.videoUri)) {
      updates.videoUri = req.body.videoUri;
    }
    if (req.body.houseVideoUri && isValidKey(req.body.houseVideoUri)) {
      updates.houseVideoUri = req.body.houseVideoUri;
    }

    const existingDocs = Array.isArray(loan.propertyDocs) ? [...loan.propertyDocs] : [];
    if (Array.isArray(req.body.propertyDocs) && req.body.propertyDocs.length > 0) {
      const sanitized = sanitizeMediaList(req.body.propertyDocs, existingDocs);
      for (const d of sanitized) {
        const idx = existingDocs.findIndex(ed => {
          if (ed.id && d.id && String(ed.id) === String(d.id)) return true;
          if (ed.uri && d.uri && ed.uri === d.uri) return true;
          return false;
        });
        if (idx >= 0) {
          existingDocs[idx] = { ...existingDocs[idx], ...d };
        } else {
          existingDocs.push(d);
        }
      }
      updates.propertyDocs = existingDocs;
    }

    const existingPhotos = Array.isArray(loan.propertyPhotos) ? [...loan.propertyPhotos] : [];
    if (Array.isArray(req.body.propertyPhotos) && req.body.propertyPhotos.length > 0) {
      const sanitized = sanitizeMediaList(req.body.propertyPhotos, existingPhotos);
      for (const p of sanitized) {
        const idx = existingPhotos.findIndex(ep => {
          if (ep.id && p.id && String(ep.id) === String(p.id)) return true;
          if (ep.uri && p.uri && ep.uri === p.uri) return true;
          return false;
        });
        if (idx >= 0) {
          existingPhotos[idx] = { ...existingPhotos[idx], ...p };
        } else {
          existingPhotos.push(p);
        }
      }
      updates.propertyPhotos = existingPhotos;
    }
  }

  await db.updateLoan(loan.loanId, updates);
  res.json(await db.getLoanById(loan.loanId));
});


router.get('/emi-this-month', async (req, res) => {
  try {
    const loans = await db.listLoansByEmployee(req.user.userId);
    let totalCount = 0;
    let totalAmount = 0;
    const currentMonth = new Date().toISOString().slice(0, 7);

    for (const loan of loans) {
      const emis = await db.listEmiByLoan(loan.loanId);
      for (const emi of emis) {
        if ((emi.status === 'paid' || emi.status === 'partial') && emi.paidDate && emi.paidDate.startsWith(currentMonth)) {
          totalCount++;
          totalAmount += Number(emi.paidAmount || 0);
        }
      }
    }
    res.json({ count: totalCount, totalAmount });
  } catch (err) {
    res.json({ count: 0, totalAmount: 0 });
  }
});

router.get('/recovery', async (req, res) => {
  try {
    const loans = await db.listLoansByEmployee(req.user.userId);
    const recoveryItems = await buildLoanRecoveryItems(loans);
    res.json(recoveryItems);
  } catch (err) {
    console.error('Employee Recovery Fetch Error:', err);
    res.status(500).json({ message: 'Failed to fetch recovery items' });
  }
});

router.post('/loans/:loanId/pay-emi', async (req, res) => {
  try {
    const loan = await db.getLoanById(req.params.loanId);
    const isEmp = loan && (String(loan.employeeId || '') === String(req.user.userId) || String(loan.assignedEmployeeId || '') === String(req.user.userId));
    if (!loan || !isEmp) return res.status(404).json({ message: 'Loan not found' });

    const { paymentId, amount, paymentMode, transactionRef, txnRef, paymentDate, date } = req.body;
    const result = await recordLoanPayment(loan.loanId, paymentId, amount, req.user.userId, {
      paymentMode,
      transactionRef: transactionRef || txnRef,
      txnRef: txnRef || transactionRef,
      paymentDate: paymentDate || date,
      date: paymentDate || date,
    });
    res.json({ message: 'Payment recorded successfully', ...result });
  } catch (err) {
    console.error('Employee Pay EMI Error:', err);
    res.status(400).json({ message: err.message || 'Failed to record payment' });
  }
});

router.get('/recovery-agents', (req, res) => res.json([]));
router.get('/loans/:loanId/media-preview', async (req, res) => {
  try {
    const loan = await db.getLoanById(req.params.loanId);
    const isEmp = loan && (String(loan.employeeId || '') === String(req.user.userId) || String(loan.assignedEmployeeId || '') === String(req.user.userId));
    if (!loan || !isEmp) {
      return res.status(404).json({ message: 'Loan not found' });
    }
    
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
          urls.push({ type, name, url, ...extra });
          seenKeys.add(dedupeKey);
        }
      } catch (err) {
        console.warn('Error generating presigned url for', cleanUri, err);
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

    if (loan.agreementUri) {
      await addMediaUrl('document', 'Loan Agreement', loan.agreementUri, { docType: 'Loan Agreement' });
    }
    res.json(urls);
  } catch (err) {
    console.error('Error fetching employee loan media preview:', err);
    res.status(500).json({ message: 'Failed to load media preview' });
  }
});

router.get('/loans/:loanId/pdf', async (req, res) => {
  res.json({ pdfUrl: 'https://example.com/dummy.pdf' });
});

router.post('/loans/:loanId/registry-document', upload.single('document'), async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  const isEmp = loan && (String(loan.employeeId || '') === String(req.user.userId) || String(loan.assignedEmployeeId || '') === String(req.user.userId));
  if (!loan || !isEmp) return res.status(404).json({ message: 'Loan not found' });
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

  const fileMime = (req.file.mimetype || '').toLowerCase();
  const fileOrigName = (req.file.originalname || '').toLowerCase();
  if (fileMime.startsWith('video/') || fileOrigName.match(/\.(mp4|mov|avi|mkv|webm|3gp|m4v)$/)) {
    return res.status(400).json({ message: 'Videos cannot be uploaded in the document section. Please upload a PDF or image document.' });
  }

  const docType = req.query.docType || req.body.docType || 'Custom Document';
  const name = req.query.name || req.body.name || req.file.originalname || 'Document';
  const docDate = req.query.date || req.body.date || new Date().toISOString().split('T')[0];

  const ext = (req.file.originalname && path.extname(req.file.originalname)) || (req.file.mimetype === 'application/pdf' ? '.pdf' : '.jpg');
  const key = `loans/${loan.loanId}/registry_${Date.now()}${ext}`;
  await uploadBuffer(key, req.file.buffer);

  // Reload fresh loan state right before updating to avoid overwriting concurrent uploads
  const freshLoan = (await db.getLoanById(loan.loanId)) || loan;
  const existingDocs = Array.isArray(freshLoan.propertyDocs) ? [...freshLoan.propertyDocs] : [];

  const newDocEntry = {
    id: Date.now().toString(),
    uri: key,
    docType,
    name,
    date: docDate,
    uploaded: true,
    mimeType: req.file.mimetype || 'application/octet-stream'
  };

  // Smart slotting & deduplication:
  // If the same standard docType already exists (e.g. two "Property Registry - 1"),
  // automatically advance to "Property Registry - 2" (or "Property Registry - 3") so no uploaded document is ever overwritten or lost!
  let assignedDocType = docType;
  if (docType === 'Property Registry - 1' && existingDocs.some(d => d.docType === 'Property Registry - 1')) {
    if (!existingDocs.some(d => d.docType === 'Property Registry - 2')) {
      assignedDocType = 'Property Registry - 2';
    } else if (!existingDocs.some(d => d.docType === 'Property Registry - 3')) {
      assignedDocType = 'Property Registry - 3';
    }
  } else if (docType === 'Property Registry - 2' && existingDocs.some(d => d.docType === 'Property Registry - 2')) {
    if (!existingDocs.some(d => d.docType === 'Property Registry - 3')) {
      assignedDocType = 'Property Registry - 3';
    }
  }

  newDocEntry.docType = assignedDocType;

  // Append new document without deleting any other document!
  const filtered = existingDocs.filter(d => d.uri !== key);
  filtered.push(newDocEntry);

  await db.updateLoan(loan.loanId, { propertyDocs: filtered });
  res.json({ message: 'Document uploaded', key, doc: newDocEntry });
});

router.post('/loans/:loanId/upload-photo', upload.array('photos', 15), async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  const isEmp = loan && (String(loan.employeeId || '') === String(req.user.userId) || String(loan.assignedEmployeeId || '') === String(req.user.userId));
  if (!loan || !isEmp) return res.status(404).json({ message: 'Loan not found' });
  if (!req.files || !req.files.length) return res.status(400).json({ message: 'No photos uploaded' });

  const newItems = [];
  const now = Date.now();
  for (let i = 0; i < req.files.length; i++) {
    const file = req.files[i];
    const isVid = (file.mimetype || '').startsWith('video/') || (file.originalname || '').toLowerCase().endsWith('.mp4');
    const ext = isVid ? '.mp4' : '.jpg';
    const key = `loans/${loan.loanId}/photo_${now}_${i}${ext}`;
    await uploadBuffer(key, file.buffer);
    newItems.push({
      id: `${now}_${i}`,
      uri: key,
      type: isVid ? 'video' : 'image',
      name: file.originalname || (isVid ? 'Property Video' : `Property Photo ${i + 1}`)
    });
  }

  // Reload fresh loan state right before updating to avoid overwriting concurrent uploads
  const freshLoan = (await db.getLoanById(loan.loanId)) || loan;
  const existingPhotos = Array.isArray(freshLoan.propertyPhotos) ? [...freshLoan.propertyPhotos] : [];
  const updatedPhotos = [...existingPhotos];
  for (const item of newItems) {
    if (!updatedPhotos.some(p => p.uri === item.uri)) {
      updatedPhotos.push(item);
    }
  }

  await db.updateLoan(loan.loanId, { propertyPhotos: updatedPhotos });
  res.json({ message: 'Photos uploaded', count: req.files.length, uploaded: newItems, photos: updatedPhotos });
});

router.post('/loans/:loanId/upload-video', upload.single('video'), async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  const isEmp = loan && (String(loan.employeeId || '') === String(req.user.userId) || String(loan.assignedEmployeeId || '') === String(req.user.userId));
  if (!loan || !isEmp) return res.status(404).json({ message: 'Loan not found' });
  if (!req.file) return res.status(400).json({ message: 'No video uploaded' });

  const rawType = (req.query.videoType || req.body.videoType || '').toLowerCase().trim();
  const rawName = (req.query.name || req.body.name || req.file.originalname || '').toLowerCase().trim();
  
  let videoType = 'owner';
  if (rawType === 'house' || rawType === 'property') {
    videoType = 'house';
  } else if (rawType === 'owner') {
    videoType = 'owner';
  } else if (rawType.includes('house') || rawType.includes('walkthrough') || rawName.includes('house') || (rawName.includes('property') && !rawName.includes('owner'))) {
    videoType = 'house';
  }
  const isHouse = videoType === 'house';
  const label = isHouse ? 'House / Property Video' : 'Owner Verification Video';

  const key = `loans/${loan.loanId}/${videoType}_video_${Date.now()}.mp4`;
  await uploadBuffer(key, req.file.buffer);

  // Reload fresh loan state before updating to prevent overwriting concurrent uploads
  const freshLoan = (await db.getLoanById(loan.loanId)) || loan;
  const existingVideos = Array.isArray(freshLoan.videos) ? [...freshLoan.videos] : [];
  const entry = {
    id: `${videoType}_${Date.now()}`,
    uri: key,
    videoType,
    name: label,
    uploadedAt: new Date().toISOString(),
    mimeType: req.file.mimetype || 'video/mp4',
  };
  const filtered = existingVideos.filter(v => v.videoType !== videoType);
  filtered.push(entry);

  const updates = {
    videos: filtered,
  };
  if (isHouse) {
    updates.houseVideoUri = key;
    if (freshLoan.videoUri) updates.videoUri = freshLoan.videoUri;
  } else {
    updates.videoUri = key;
    if (freshLoan.houseVideoUri) updates.houseVideoUri = freshLoan.houseVideoUri;
  }

  await db.updateLoan(loan.loanId, updates);
  res.json({ message: 'Video uploaded', key, videoType, name: label });
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

router.post('/loans/:loanId/emi-change-request', async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  if (!loan || loan.employeeId !== req.user.userId) return res.status(404).json({ message: 'Loan not found' });
  
  if (!['approved', 'active'].includes(loan.status)) {
    return res.status(400).json({ message: 'Loan is not in a valid status to request EMI changes' });
  }

  const { approvedAmount, tenureMonths, interestRate, penaltyRate, emiAmount, totalInterest, totalRepayable } = req.body;
  
  await db.updateLoan(loan.loanId, {
    emiChangeRequest: {
      approvedAmount,
      tenureMonths,
      interestRate,
      penaltyRate,
      emiAmount,
      totalInterest,
      totalRepayable,
      status: 'pending'
    }
  });
  
  res.json({ message: 'EMI change request submitted for approval' });
});

router.post('/loans/:loanId/request-foreclosure', async (req, res) => {
  const loan = await db.getLoanById(req.params.loanId);
  if (!loan || loan.employeeId !== req.user.userId) return res.status(404).json({ message: 'Loan not found' });
  
  if (loan.status !== 'active') {
    return res.status(400).json({ message: 'Only active loans can be foreclosed' });
  }

  const { foreclosureAmount, reason } = req.body;
  await db.updateLoan(loan.loanId, {
    foreclosureRequest: {
      foreclosureAmount,
      reason,
      status: 'pending',
      requestedAt: new Date().toISOString()
    }
  });

  res.json({ message: 'Foreclosure requested successfully' });
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
    console.error('Error in /employee/loans/:loanId/update-dates:', err);
    res.status(500).json({ message: err.message || 'Failed to update dates' });
  }
});

module.exports = router;
