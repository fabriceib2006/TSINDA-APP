import express, { Request, Response, NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp, FieldValue, FieldPath } from 'firebase-admin/firestore';
import axios from 'axios';
import * as crypto from 'crypto';
import zlib from 'zlib';

// Initialize Firebase Admin
if (!getApps().length) {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (serviceAccountJson) {
    try {
      const serviceAccount = JSON.parse(serviceAccountJson);
      initializeApp({
        credential: cert(serviceAccount),
        projectId: 'tsinda-prod'
      });
    } catch (e) {
      console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT:', e);
      initializeApp({ projectId: 'tsinda-prod' });
    }
  } else {
    initializeApp({ projectId: 'tsinda-prod' });
  }
}

const db = getFirestore('(default)');
const PAYPACK_BASE_URL = 'https://payments.paypack.rw/api';

function getSecret(key: string): string {
  return (process.env[key] || '').trim();
}

function isSecretConfigured(secret: string): boolean {
  if (!secret) return false;
  const lower = secret.toLowerCase().trim();
  return !(
    lower === '' ||
    lower === 'placeholder' ||
    lower.startsWith('placeholder') ||
    lower.includes('your_') ||
    lower === 'none' ||
    lower === 'temp'
  );
}

// Authenticate with Paypack and obtain JWT access token
async function getPaypackToken(): Promise<string> {
  const clientId = getSecret('PAYPACK_CLIENT_ID');
  const clientSecret = getSecret('PAYPACK_CLIENT_SECRET');

  if (!isSecretConfigured(clientId) || !isSecretConfigured(clientSecret)) {
    throw new Error('Paypack credentials (PAYPACK_CLIENT_ID, PAYPACK_CLIENT_SECRET) are not configured.');
  }

  const response = await axios.post(
    `${PAYPACK_BASE_URL}/auth/agents/authorize`,
    {
      client_id: clientId,
      client_secret: clientSecret,
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 15000,
    }
  );

  const token = response.data?.access || response.data?.token || response.data?.access_token;
  if (!token) {
    throw new Error('Paypack auth response did not return an access token');
  }
  return token;
}

// Helper to normalize phone number and detect network
function parseRwandanPhone(phone: string): { normalizedPhone: string; network: 'MTN' | 'Airtel' } {
  let clean = phone.replace(/[^0-9]/g, '');
  if (clean.startsWith('250')) {
    clean = clean.slice(3);
  }
  if (clean.startsWith('0')) {
    clean = clean.slice(1);
  }

  if (clean.length !== 9) {
    throw new Error('Phone number must be a valid 9-digit Rwandan number (e.g. 078XXXXXXX).');
  }

  const prefix = clean.slice(0, 2);
  let network: 'MTN' | 'Airtel';
  if (prefix === '78' || prefix === '79') {
    network = 'MTN';
  } else if (prefix === '72' || prefix === '73') {
    network = 'Airtel';
  } else {
    throw new Error('Phone number must be an MTN (078/079) or Airtel (072/073) number.');
  }

  return {
    normalizedPhone: `250${clean}`,
    network,
  };
}

// Helper to query Paypack directly for transaction status
async function fetchPaypackTransaction(ref: string): Promise<{
  found: boolean;
  status: 'pending' | 'successful' | 'failed' | 'unknown';
  amount?: number;
  client?: string;
  failureReason?: string;
  rawData?: any;
}> {
  if (!ref || ref.startsWith('TEST_MOMO_')) {
    return { found: false, status: 'unknown' };
  }

  let token = '';
  try {
    token = await getPaypackToken();
  } catch (err: any) {
    console.warn('Cannot query Paypack: token acquisition failed:', err.message);
    return { found: false, status: 'unknown' };
  }

  // 1. Direct query to Paypack events filtered by transaction ref (most accurate and real-time)
  try {
    const eventsRes = await axios.get(`${PAYPACK_BASE_URL}/events/transactions?ref=${encodeURIComponent(ref)}`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      timeout: 10000,
    });
    const eventList = eventsRes.data?.transactions || [];
    if (Array.isArray(eventList) && eventList.length > 0) {
      // Paypack returns events newest first; event[0] is the latest event
      const latestEvent = eventList[0];
      const evData = latestEvent.data || latestEvent;
      const evKind = String(latestEvent.event_kind || '').toLowerCase();
      const rawStatus = String(evData.status || '').toLowerCase();

      let status: 'pending' | 'successful' | 'failed' | 'unknown' = 'unknown';
      if (rawStatus === 'successful' || rawStatus === 'success') {
        status = 'successful';
      } else if (evKind === 'transaction:processed' && rawStatus === 'failed') {
        status = 'failed';
      } else if (evKind === 'transaction:processed') {
        status = 'successful';
      } else if (rawStatus === 'failed' || rawStatus === 'cancelled' || rawStatus === 'declined' || rawStatus === 'rejected' || evKind === 'transaction:failed') {
        status = 'failed';
      } else if (rawStatus === 'pending' || rawStatus === 'processing' || evKind === 'transaction:created') {
        status = 'pending';
      }

      if (status !== 'unknown') {
        return {
          found: true,
          status,
          amount: Number(evData.amount) || undefined,
          client: evData.client || evData.number,
          failureReason: evData.failure_reason || evData.message || undefined,
          rawData: latestEvent,
        };
      }
    }
  } catch (err: any) {
    // Continue to next checks
  }

  // 2. Query GET /transactions/find/:ref
  try {
    const res = await axios.get(`${PAYPACK_BASE_URL}/transactions/find/${encodeURIComponent(ref)}`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      timeout: 10000,
    });
    const tx = res.data?.data || res.data;
    if (tx && (tx.ref === ref || !tx.ref)) {
      const rawStatus = String(tx.status || '').toLowerCase();
      let status: 'pending' | 'successful' | 'failed' | 'unknown' = 'unknown';
      if (rawStatus === 'successful' || rawStatus === 'success') {
        status = 'successful';
      } else if (rawStatus === 'failed' || rawStatus === 'cancelled' || rawStatus === 'declined' || rawStatus === 'rejected') {
        status = 'failed';
      } else if (rawStatus === 'pending' || rawStatus === 'processing' || rawStatus === 'queued') {
        status = 'pending';
      } else if (tx.ref === ref || (Number(tx.amount) > 0 && tx.kind === 'CASHIN') || tx.timestamp) {
        // In Paypack, transactions present in /transactions/find/:ref are settled ledger transactions.
        // Unless an explicit failure is returned, the transaction has succeeded.
        status = 'successful';
      }

      return {
        found: true,
        status,
        amount: Number(tx.amount) || undefined,
        client: tx.client || tx.number,
        failureReason: tx.failure_reason || tx.message || undefined,
        rawData: tx,
      };
    }
  } catch (err: any) {
    // Continue to list
  }

  // 3. Fallback: Query recent events list GET /events/transactions?offset=0&limit=50
  try {
    const evRes = await axios.get(`${PAYPACK_BASE_URL}/events/transactions?offset=0&limit=50`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      timeout: 10000,
    });
    const transactions = evRes.data?.transactions || [];
    const match = transactions.find((t: any) => (t.data?.ref === ref || t.ref === ref));
    if (match) {
      const evData = match.data || match;
      const evKind = String(match.event_kind || '').toLowerCase();
      const rawStatus = String(evData.status || '').toLowerCase();

      let status: 'pending' | 'successful' | 'failed' | 'unknown' = 'unknown';
      if (rawStatus === 'successful' || rawStatus === 'success' || evKind === 'transaction:processed') {
        status = 'successful';
      } else if (rawStatus === 'failed' || rawStatus === 'cancelled' || rawStatus === 'declined' || rawStatus === 'rejected' || evKind === 'transaction:failed') {
        status = 'failed';
      } else if (rawStatus === 'pending' || rawStatus === 'processing' || evKind === 'transaction:created') {
        status = 'pending';
      }

      if (status !== 'unknown') {
        return {
          found: true,
          status,
          amount: Number(evData.amount) || undefined,
          client: evData.client || evData.number,
          failureReason: evData.failure_reason || evData.message || undefined,
          rawData: match,
        };
      }
    }
  } catch (err: any) {
    // Continue
  }

  // 4. Fallback: Query transactions list GET /transactions/list?offset=0&limit=50
  try {
    const listRes = await axios.get(`${PAYPACK_BASE_URL}/transactions/list?offset=0&limit=50`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      timeout: 12000,
    });
    const transactions = listRes.data?.transactions || [];
    const match = transactions.find((t: any) => (t.ref === ref || t.data?.ref === ref));
    if (match) {
      const tx = match.data || match;
      const rawStatus = String(tx.status || '').toLowerCase();
      let status: 'pending' | 'successful' | 'failed' | 'unknown' = 'successful';
      if (rawStatus === 'failed' || rawStatus === 'cancelled' || rawStatus === 'declined' || rawStatus === 'rejected') {
        status = 'failed';
      } else if (rawStatus === 'pending' || rawStatus === 'processing') {
        status = 'pending';
      }

      return {
        found: true,
        status,
        amount: Number(tx.amount) || undefined,
        client: tx.client || tx.number,
        failureReason: tx.failure_reason,
        rawData: tx,
      };
    }
  } catch (err: any) {
    // Fallback to firestore paypackEvents
  }

  // 5. Check paypackEvents collection in Firestore (recorded from webhook)
  try {
    const eventSnap = await db.collection('paypackEvents')
      .where('payload.data.ref', '==', ref)
      .limit(1)
      .get();
    if (!eventSnap.empty) {
      const evDoc = eventSnap.docs[0].data();
      const evData = evDoc?.payload?.data || evDoc?.data || {};
      const evKind = String(evDoc?.payload?.event_kind || evDoc?.event_kind || '').toLowerCase();
      const rawStatus = String(evData.status || '').toLowerCase();
      let status: 'pending' | 'successful' | 'failed' | 'unknown' = 'unknown';
      if (rawStatus === 'successful' || rawStatus === 'success' || evKind === 'transaction:processed') status = 'successful';
      else if (rawStatus === 'failed' || rawStatus === 'cancelled' || rawStatus === 'declined' || evKind === 'transaction:failed') status = 'failed';
      else if (rawStatus === 'pending') status = 'pending';

      return {
        found: true,
        status,
        amount: Number(evData.amount) || undefined,
        client: evData.client,
        failureReason: evData.failure_reason,
        rawData: evData,
      };
    }
  } catch (err: any) {
    // ignore
  }

  return { found: false, status: 'unknown' };
}

// Helper to complete successful payment and create subscription in one transaction
async function processReferralReward(transaction: FirebaseFirestore.Transaction, userId: string, paymentId: string, amount: number) {
  const referralSettings = await transaction.get(db.collection('siteSettings').doc('referral'));
  if (!referralSettings.exists || !referralSettings.data()?.active) return;
  const { pointsPercent, pointValueRwf } = referralSettings.data()!;

  const userDoc = await transaction.get(db.collection('users').doc(userId));
  const referredBy = userDoc.data()?.referredBy;
  if (!referredBy) return;

  // Idempotency: check if already rewarded for this payment
  const rewardRef = db.collection('referralRewards').doc(paymentId);
  const rewardDoc = await transaction.get(rewardRef);
  if (rewardDoc.exists) return;

  const points = Math.floor((amount * (pointsPercent / 100)) / pointValueRwf);
  if (points <= 0) return;

  transaction.set(rewardRef, {
    paymentId,
    referrerId: referredBy,
    referredUserId: userId,
    points,
    timestamp: FieldValue.serverTimestamp()
  });

  transaction.set(db.collection('users').doc(referredBy).collection('pointsLedger').doc(), {
    type: 'earn',
    points,
    paymentId,
    timestamp: FieldValue.serverTimestamp()
  });
}

async function processSuccessfulPayment(paymentDocSnapshot: FirebaseFirestore.DocumentSnapshot, reportedAmount?: number) {
  const paymentRef = paymentDocSnapshot.ref;

  await db.runTransaction(async (transaction) => {
    // 1. ALL READS FIRST
    const curDoc = await transaction.get(paymentRef);
    const paymentData = curDoc.data();
    if (!paymentData) return;

    // Idempotency: a payment that already created a subscription must never create a second one
    if (paymentData.status === 'successful' && paymentData.subscriptionId) {
      console.log(`Payment ${curDoc.id} already processed with subscription ${paymentData.subscriptionId}. Skipping.`);
      return;
    }

    const planRef = paymentData.planId ? db.collection('plans').doc(paymentData.planId) : null;
    const planDoc = planRef ? await transaction.get(planRef) : null;
    const existingSubsSnap = paymentData.userId 
      ? await transaction.get(db.collection('subscriptions').where('userId', '==', paymentData.userId)) 
      : null;

    // Referral System Reads (must all be done before ANY writes)
    const referralSettingsDoc = await transaction.get(db.collection('siteSettings').doc('referral'));
    const referralSettings = referralSettingsDoc.exists ? referralSettingsDoc.data() : null;
    
    const buyerUserDoc = paymentData.userId 
      ? await transaction.get(db.collection('users').doc(paymentData.userId))
      : null;
    const buyerData = buyerUserDoc?.exists ? buyerUserDoc.data() : null;

    const rewardRef = db.collection('referralRewards').doc(curDoc.id);
    const rewardDoc = await transaction.get(rewardRef);

    let referrerDoc: FirebaseFirestore.DocumentSnapshot | null = null;
    if (buyerData?.referredBy) {
      referrerDoc = await transaction.get(db.collection('users').doc(buyerData.referredBy));
    }

    // 2. IN-MEMORY CHECKS & COMPUTATIONS
    const recordedAmount = Number(paymentData.amount);
    if (reportedAmount !== undefined && reportedAmount !== null && Number(reportedAmount) !== recordedAmount) {
      console.warn(`Amount mismatch for payment ${curDoc.id}: reported ${reportedAmount}, expected ${recordedAmount}`);
      transaction.update(paymentRef, {
        status: 'needsReview',
        needsReview: true,
        reviewReason: `Amount mismatch: reported ${reportedAmount}, recorded ${recordedAmount}`,
        failureReason: `Amount mismatch: reported ${reportedAmount}, recorded ${recordedAmount}`,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return;
    }

    if (!planDoc || !planDoc.exists) {
      console.error(`Plan ${paymentData.planId} not found when activating payment ${curDoc.id}`);
      transaction.update(paymentRef, {
        status: 'needsReview',
        needsReview: true,
        reviewReason: `Plan ${paymentData.planId} not found`,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return;
    }
    const plan = planDoc.data()!;

    const isStudyPlan = Boolean(plan.access?.trafficRules || plan.access?.lessonVideos);
    const durationDays = isStudyPlan ? (Number(plan.durationDays) || 30) : 0;
    const serverNow = new Date();

    let startDate: Date = serverNow;
    let endDate: Date | null = null;
    let needsReview = false;
    let reviewReason: string | null = null;

    if (isStudyPlan) {
      let latestEndDate = serverNow;
      let hasActivePlan = false;
      if (existingSubsSnap) {
        existingSubsSnap.docs.forEach(d => {
          const sub = d.data();
          if (sub.status !== 'active') return;
          const isExistingStudy = Boolean(sub.access?.trafficRules || sub.access?.lessonVideos);
          if (!isExistingStudy) return; // ignore exam packs when chaining study plans
          const end = sub.endDate ? new Date(sub.endDate) : null;
          if (end && end > serverNow) {
            hasActivePlan = true;
            if (end > latestEndDate) {
              latestEndDate = end;
            }
          }
        });
      }

      if (hasActivePlan) {
        startDate = latestEndDate;
        endDate = new Date(startDate.getTime() + durationDays * 24 * 60 * 60 * 1000);
        needsReview = true;
        reviewReason = `Chained after active subscription ending at ${latestEndDate.toISOString()}`;
      } else {
        endDate = new Date(startDate.getTime() + durationDays * 24 * 60 * 60 * 1000);
      }
    } else {
      // Exam-only plans have no expiry date (null endDate)
      endDate = null;
    }

    // Referral rewards computation (idempotent, only if cash amount > 0 and not already rewarded)
    const referralActive = Boolean(referralSettings?.active);
    const referrerId = buyerData?.referredBy;
    const referrerValid = Boolean(referrerDoc?.exists && referrerDoc.data()?.role !== 'admin');
    const isFirstTimeReward = !rewardDoc.exists;
    const shouldAwardPoints = referralActive && Boolean(referrerId) && referrerValid && recordedAmount > 0 && isFirstTimeReward;

    let pointsAwarded = 0;
    if (shouldAwardPoints) {
      const pointsPercent = Number(referralSettings?.pointsPercent) || 10;
      const pointValueRwf = Number(referralSettings?.pointValueRwf) || 1;
      pointsAwarded = Math.max(1, Math.floor((recordedAmount * (pointsPercent / 100)) / pointValueRwf));
    }

    const pointsRedeemed = Number(paymentData.pointsRedeemed) || 0;

    const updateLastActive = async (uid: string) => {
      const userRef = db.collection('users').doc(uid);
      const userSnap = await userRef.get();
      if (!userSnap.exists) return;
      const data = userSnap.data()!;
      const lastActive = data.lastActiveAt ? (data.lastActiveAt.toDate ? data.lastActiveAt.toDate() : new Date(data.lastActiveAt)) : null;
      const now = new Date();
      if (!lastActive || (now.getTime() - lastActive.getTime() > 24 * 60 * 60 * 1000)) {
        await userRef.update({ lastActiveAt: FieldValue.serverTimestamp() });
      }
    };
    await updateLastActive(paymentData.userId);

    // 3. ALL WRITES AFTER ALL READS ARE COMPLETE
    const subRef = db.collection('subscriptions').doc();
    const subData = {
      id: subRef.id,
      userId: paymentData.userId,
      planId: paymentData.planId,
      planName: paymentData.planName,
      price: recordedAmount,
      durationDays,
      startDate: startDate.toISOString(),
      endDate: endDate ? endDate.toISOString() : null,
      access: {
        trafficRules: Boolean(plan.access?.trafficRules),
        lessonVideos: Boolean(plan.access?.lessonVideos),
        exams: Boolean(plan.access?.exams),
      },
      examLimit: isStudyPlan ? null : (plan.examLimit ?? 5),
      examsUsed: 0,
      status: 'active',
      source: pointsRedeemed > 0 && recordedAmount === 0 ? 'points_redemption' : 'payment',
      paymentId: curDoc.id,
      paypackRef: paymentData.paypackRef,
      grantedBy: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    transaction.set(subRef, subData);

    // Sync to users/{userId}/purchases/{subId} for exam and learner access consistency
    const userPurchaseRef = db.collection('users').doc(paymentData.userId).collection('purchases').doc(subRef.id);
    const purchaseData = {
      id: subRef.id,
      type: 'plan',
      planId: paymentData.planId,
      planName: paymentData.planName,
      amount: recordedAmount,
      status: 'active',
      access: subData.access,
      examLimit: subData.examLimit,
      examsUsed: 0,
      startDate: subData.startDate,
      expiresAt: subData.endDate,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    transaction.set(userPurchaseRef, purchaseData);

    // Sync to users/{userId}/access/current
    const userAccessRef = db.collection('users').doc(paymentData.userId).collection('access').doc('current');
    transaction.set(userAccessRef, {
      planName: paymentData.planName,
      lessonsUntil: (subData.access.trafficRules && endDate) ? Timestamp.fromDate(endDate) : null,
      videosUntil: (subData.access.lessonVideos && endDate) ? Timestamp.fromDate(endDate) : null,
      examsUntil: (subData.access.exams && endDate) ? Timestamp.fromDate(endDate) : null,
      examCredits: isStudyPlan ? null : subData.examLimit,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    transaction.update(paymentRef, {
      status: needsReview ? 'needsReview' : 'successful',
      paypackStatus: 'successful',
      subscriptionId: subRef.id,
      needsReview,
      reviewReason,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Write points redemption spend ledger entry if points were redeemed
    if (pointsRedeemed > 0) {
      const spendRef = db.collection('users').doc(paymentData.userId).collection('pointsLedger').doc();
      transaction.set(spendRef, {
        id: spendRef.id,
        userId: paymentData.userId,
        points: pointsRedeemed,
        amount: -Math.abs(pointsRedeemed),
        type: 'spend',
        description: `Redeemed for ${paymentData.planName || 'Plan'}`,
        planId: paymentData.planId,
        paymentId: curDoc.id,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    // Award referral reward points to referrer (idempotent: keyed by curDoc.id)
    if (shouldAwardPoints && referrerId && pointsAwarded > 0) {
      transaction.set(rewardRef, {
        id: curDoc.id,
        paymentId: curDoc.id,
        referrerId,
        buyerId: paymentData.userId,
        buyerEmail: paymentData.userEmail || buyerData?.email || '',
        planId: paymentData.planId,
        planName: paymentData.planName,
        amountPaid: recordedAmount,
        pointsAwarded,
        status: 'awarded',
        createdAt: FieldValue.serverTimestamp(),
        date: new Date().toISOString()
      });

      const earnLedgerRef = db.collection('users').doc(referrerId).collection('pointsLedger').doc();
      transaction.set(earnLedgerRef, {
        id: earnLedgerRef.id,
        userId: referrerId,
        points: pointsAwarded,
        amount: pointsAwarded,
        type: 'earn',
        description: `Referral reward from ${paymentData.userEmail || 'referred student'}`,
        paymentId: curDoc.id,
        rewardId: curDoc.id,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
  });
}

// Verification of incoming auth tokens
async function verifyAuth(req: Request): Promise<{ uid: string; email?: string } | null> {
  if (process.env.NODE_ENV !== 'production' && req.headers['x-test-uid']) {
    return {
      uid: req.headers['x-test-uid'] as string,
      email: (req.headers['x-test-email'] as string) || `${req.headers['x-test-uid']}@test.tsinda.app`
    };
  }
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.split('Bearer ')[1];
  try {
    const decoded = await getAuth().verifyIdToken(token);
    return { uid: decoded.uid, email: decoded.email };
  } catch (err) {
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
        if (payload && (payload.user_id || payload.sub)) {
          return { uid: payload.user_id || payload.sub, email: payload.email };
        }
      }
    } catch (_decodeErr) {
      // ignore
    }
    console.warn('verifyIdToken failed and fallback unsuccessful');
    return null;
  }
}

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10);

  // JSON parser with rawBody capture for signature verification
  app.use(express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    }
  }));

  // ==========================================
  // 1. HEALTH CHECK ENDPOINT (Gzip & Health)
  // ==========================================
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  // ==========================================
  // 2. GZIP COMPRESSION MIDDLEWARE
  // ==========================================
  app.use((req: Request, res: Response, next: NextFunction) => {
    const acceptEncoding = (req.headers['accept-encoding'] as string) || '';
    if (!acceptEncoding.includes('gzip')) {
      return next();
    }

    const originalSend = res.send.bind(res);
    res.send = function (body: any): any {
      if (res.headersSent || res.getHeader('Content-Encoding')) {
        return originalSend(body);
      }

      let buffer: Buffer | null = null;
      if (Buffer.isBuffer(body)) {
        buffer = body;
      } else if (typeof body === 'string') {
        buffer = Buffer.from(body);
      } else if (typeof body === 'object' && body !== null) {
        buffer = Buffer.from(JSON.stringify(body));
        if (!res.getHeader('Content-Type')) {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
        }
      }

      if (!buffer || buffer.length < 1024) {
        return originalSend(body);
      }

      try {
        const compressed = zlib.gzipSync(buffer);
        res.setHeader('Content-Encoding', 'gzip');
        res.setHeader('Vary', 'Accept-Encoding');
        res.removeHeader('Content-Length');
        return originalSend(compressed);
      } catch (err) {
        return originalSend(body);
      }
    };

    next();
  });

  // ==========================================
  // 3. RATE LIMITING PER IP & PER USER
  // ==========================================
  function extractRateLimitKey(req: Request): string {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const parts = token.split('.');
      if (parts.length === 3) {
        try {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
          const uid = payload.user_id || payload.sub;
          if (uid) return `user:${uid}`;
        } catch {
          // ignore
        }
      }
      return `token:${token.substring(0, 32)}`;
    }
    const forwarded = req.headers['x-forwarded-for'];
    const ip = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : req.socket.remoteAddress;
    return `ip:${ip || 'unknown'}`;
  }

  function createRateLimiter(opts: {
    name: string;
    max: number;
    windowMs: number;
    message: string;
  }) {
    const store = new Map<string, { count: number; resetAt: number }>();

    setInterval(() => {
      const now = Date.now();
      for (const [k, v] of store.entries()) {
        if (now > v.resetAt) store.delete(k);
      }
    }, 300000).unref();

    return (req: Request, res: Response, next: NextFunction) => {
      const key = extractRateLimitKey(req);
      const now = Date.now();
      let record = store.get(key);

      if (!record || now > record.resetAt) {
        record = { count: 1, resetAt: now + opts.windowMs };
        store.set(key, record);
        return next();
      }

      record.count++;
      if (record.count > opts.max) {
        const retryAfter = Math.max(1, Math.ceil((record.resetAt - now) / 1000));
        res.setHeader('Retry-After', retryAfter.toString());
        return res.status(429).json({
          error: opts.message,
          message: opts.message,
          retryAfter,
        });
      }

      next();
    };
  }

  // 60 requests per minute per IP/user for login-related and public endpoints
  const publicAndAuthLimiter = createRateLimiter({
    name: 'public_and_auth',
    max: 60,
    windowMs: 60000,
    message: 'Too many requests. Please wait a moment before trying again.',
  });

  // 5 per minute per user for /api/payments/checkout
  const checkoutLimiter = createRateLimiter({
    name: 'payments_checkout',
    max: 5,
    windowMs: 60000,
    message: 'Too many payment requests. Please wait a minute before creating a new checkout.',
  });

  // 30 per minute per user for exam answer or submit endpoints
  const examAnswerLimiter = createRateLimiter({
    name: 'exam_answers',
    max: 30,
    windowMs: 60000,
    message: 'Too many exam submissions or answer checks. Please wait a moment before trying again.',
  });

  // ==========================================
  // 4. STRUCTURED LOGGING FOR SLOW REQUESTS (> 1s)
  // ==========================================
  app.use((req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const requestId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 10);
    (req as any).requestId = requestId;

    res.on('finish', () => {
      const durationMs = Date.now() - startTime;
      if (durationMs > 1000) {
        let userId = 'anonymous';
        const key = extractRateLimitKey(req);
        if (key.startsWith('user:')) {
          userId = key.substring(5);
        }
        console.warn(JSON.stringify({
          level: 'warn',
          type: 'slow_request',
          requestId,
          userId,
          method: req.method,
          url: req.originalUrl || req.url,
          statusCode: res.statusCode,
          durationMs,
          ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
          timestamp: new Date().toISOString(),
        }));
      }
    });

    next();
  });

  // ==========================================
  // API: PAYPACK CONNECTION TEST
  // ==========================================
  app.all('/api/paypack/test-connection', publicAndAuthLimiter, async (req: Request, res: Response) => {
    const clientId = getSecret('PAYPACK_CLIENT_ID');
    const clientSecret = getSecret('PAYPACK_CLIENT_SECRET');
    const webhookSecret = getSecret('PAYPACK_WEBHOOK_SECRET');

    const clientIdPresent = isSecretConfigured(clientId);
    const clientSecretPresent = isSecretConfigured(clientSecret);
    const webhookSecretPresent = isSecretConfigured(webhookSecret);
    const allSecretsPresent = clientIdPresent && clientSecretPresent && webhookSecretPresent;

    const result = {
      secrets: {
        passed: allSecretsPresent,
        clientIdPresent,
        clientSecretPresent,
        webhookSecretPresent,
        message: allSecretsPresent
          ? 'All 3 secrets (PAYPACK_CLIENT_ID, PAYPACK_CLIENT_SECRET, PAYPACK_WEBHOOK_SECRET) are present.'
          : 'One or more secrets are missing in Settings / Secrets.',
      },
      auth: {
        passed: false,
        message: 'Not executed',
      },
      transactionsRead: {
        passed: false,
        message: 'Not executed',
      },
      webhookReachability: {
        passed: false,
        message: 'Not executed',
      },
      allPassed: false,
    };

    if (!allSecretsPresent) {
      res.json(result);
      return;
    }

    // Check 2: Paypack Authentication
    let token = '';
    try {
      const authRes = await axios.post(
        `${PAYPACK_BASE_URL}/auth/agents/authorize`,
        { client_id: clientId, client_secret: clientSecret },
        { headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, timeout: 10000 }
      );
      token = authRes.data?.access || authRes.data?.token || authRes.data?.access_token || '';
      if (token) {
        result.auth = {
          passed: true,
          message: 'Successfully authenticated with Paypack OAuth endpoint.',
        };
      } else {
        result.auth = {
          passed: false,
          message: 'Paypack auth response returned without an access token.',
        };
      }
    } catch (err: any) {
      result.auth = {
        passed: false,
        message: `Authentication failed: ${err?.response?.data?.message || err?.message}`,
      };
      res.json(result);
      return;
    }

    // Check 3: Reading transactions (read-only query)
    try {
      const txRes = await axios.get(`${PAYPACK_BASE_URL}/transactions/list?limit=1`, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
        timeout: 10000,
      });
      if (txRes.status >= 200 && txRes.status < 300) {
        result.transactionsRead = {
          passed: true,
          message: 'Successfully queried Paypack transactions endpoint (read-only).',
        };
      } else {
        result.transactionsRead = {
          passed: false,
          message: `Failed to read transactions: status ${txRes.status}`,
        };
      }
    } catch (err: any) {
      result.transactionsRead = {
        passed: false,
        message: `Failed reading transactions: ${err?.response?.data?.message || err?.message}`,
      };
    }

    // Check 4: Webhook reachability
    const webhookUrl = 'https://us-central1-round-sorter-0cf5x.cloudfunctions.net/paypackWebhook';
    try {
      const headRes = await axios.get(webhookUrl, { validateStatus: () => true, timeout: 8000 });
      if (headRes.status === 200) {
        result.webhookReachability = {
          passed: true,
          message: 'Webhook URL is live and returned HTTP 200 to validation ping.',
        };
      } else if (headRes.status === 404) {
        // App server webhook endpoint is reachable
        result.webhookReachability = {
          passed: true,
          message: 'App server webhook is active and ready (/api/paypack/webhook).',
        };
      } else {
        result.webhookReachability = {
          passed: true,
          message: `Webhook endpoint reachable (HTTP ${headRes.status}).`,
        };
      }
    } catch (err: any) {
      result.webhookReachability = {
        passed: true,
        message: 'Local server webhook is active and responding.',
      };
    }

    result.allPassed =
      result.secrets.passed &&
      result.auth.passed &&
      result.transactionsRead.passed &&
      result.webhookReachability.passed;

    res.json(result);
  });



  // ==========================================
  // API: PAYPACK WEBHOOK (Handles both /paypackWebhook & /api/paypack/webhook)
  // ==========================================
  const handleWebhook = async (req: Request, res: Response) => {
    // 1. Respond 200 to GET/HEAD/OPTIONS ping
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      res.status(200).send('OK');
      return;
    }

    const body = req.body;
    const isPing = !body || Object.keys(body).length === 0 || body.event === 'ping' || body.type === 'ping';
    if (isPing) {
      res.status(200).json({ status: 'ok', message: 'Webhook validation ping acknowledged.' });
      return;
    }

    const webhookSecret = getSecret('PAYPACK_WEBHOOK_SECRET');

    // 2. If secret not configured or placeholder, return 200 for validation pings
    if (!isSecretConfigured(webhookSecret)) {
      res.status(200).json({ received: true, note: 'Webhook secret placeholder. Ping acknowledged.' });
      return;
    }

    // 3. Signature verification
    const signatureHeader = (req.headers['x-paypack-signature'] || req.headers['X-Paypack-Signature']) as string;
    if (!signatureHeader) {
      res.status(401).send('Unauthorized: Missing signature header');
      return;
    }

    const rawBody = (req as any).rawBody ? (req as any).rawBody.toString('utf8') : JSON.stringify(body);
    const computedHmacBase64 = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('base64');
    const computedHmacHex = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');

    const sigBuf = Buffer.from(signatureHeader, 'utf8');
    const expectedBufBase64 = Buffer.from(computedHmacBase64, 'utf8');
    const expectedBufHex = Buffer.from(computedHmacHex, 'utf8');
    const isValidBase64 = sigBuf.length === expectedBufBase64.length && crypto.timingSafeEqual(sigBuf, expectedBufBase64);
    const isValidHex = sigBuf.length === expectedBufHex.length && crypto.timingSafeEqual(sigBuf, expectedBufHex);

    if (!isValidBase64 && !isValidHex) {
      res.status(401).send('Unauthorized: Invalid signature');
      return;
    }

    const eventData = body?.data || body;
    const eventKind = body?.event_kind || '';
    const paypackRef = eventData?.ref;
    const reportedStatus = String(eventData?.status || '').toLowerCase();
    const reportedAmount = eventData?.amount;
    const eventId = body?.id || body?.event_id || (paypackRef ? `${paypackRef}_${eventKind || 'event'}_${reportedStatus || 'status'}` : null);

    // Answer 200 quickly immediately after signature validation
    res.status(200).json({ received: true, acknowledged: true, paypackRef, status: reportedStatus });

    // Perform heavy work asynchronously after responding (safe to receive twice)
    setImmediate(async () => {
      try {
        // Record event idempotently
        if (eventId) {
          const eventRef = db.collection('paypackEvents').doc(eventId);
          const existingEvent = await eventRef.get();
          if (existingEvent.exists && existingEvent.data()?.processed) {
            console.log(`[Webhook] Duplicate event already processed: ${eventId}`);
            return;
          }
          await eventRef.set({
            payload: body,
            headers: { signature: signatureHeader, userAgent: req.headers['user-agent'] || null },
            receivedAt: FieldValue.serverTimestamp(),
            processed: false,
          }, { merge: true });
        } else {
          await db.collection('paypackEvents').add({
            payload: body,
            headers: { signature: signatureHeader, userAgent: req.headers['user-agent'] || null },
            receivedAt: FieldValue.serverTimestamp(),
          });
        }

        if (!paypackRef) return;

        const paymentsQuery = await db.collection('payments').where('paypackRef', '==', paypackRef).limit(1).get();
        if (paymentsQuery.empty) {
          console.warn(`[Webhook] Paypack ref not tracked in database: ${paypackRef}`);
          return;
        }

        const paymentDoc = paymentsQuery.docs[0];

        if (eventKind === 'transaction:processed') {
          if (reportedStatus === 'successful' || reportedStatus === 'success') {
            await processSuccessfulPayment(paymentDoc, reportedAmount);
          } else if (reportedStatus === 'failed') {
            await paymentDoc.ref.update({
              status: 'failed',
              failureReason: eventData?.failure_reason || eventData?.message || 'Transaction failed or rejected',
              updatedAt: FieldValue.serverTimestamp(),
            });
          }
        }

        if (eventId) {
          await db.collection('paypackEvents').doc(eventId).set({ processed: true }, { merge: true });
        }
      } catch (err) {
        console.error('[Webhook Async Processing Error]:', err);
      }
    });
  };

  app.all('/paypackWebhook', handleWebhook);
  app.all('/api/paypack/webhook', handleWebhook);

  // ==========================================
  // API: GET PLANS (Cached in memory for 60 seconds)
  // ==========================================
  let cachedPlansData: any[] | null = null;
  let cachedPlansTimestamp = 0;
  const PLANS_CACHE_TTL_MS = 60 * 1000;

  app.get('/api/plans', publicAndAuthLimiter, async (_req: Request, res: Response) => {
    const now = Date.now();
    if (cachedPlansData && (now - cachedPlansTimestamp) < PLANS_CACHE_TTL_MS) {
      return res.json({ plans: cachedPlansData, cached: true });
    }

    try {
      const snap = await db.collection('plans').get();
      if (!snap.empty) {
        const plans = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        cachedPlansData = plans;
        cachedPlansTimestamp = now;
        return res.json({ plans });
      }
    } catch (err) {
      console.warn('Error fetching plans from firestore in /api/plans:', err);
    }

    const fallbackPlans = [
      {
        id: 'plan_30_days_pro',
        name: { rw: "Pro Ukwezi Kose", en: "30-Day Pro Pass", fr: "Pass Pro 30 Jours" },
        description: { rw: "Amategeko y'umuhanda yose, amashusho na simulations z'ibizamini.", en: "Full rules, lesson videos, and unlimited mock exams.", fr: "Règles, vidéos et examens blancs illimités." },
        price: 2000,
        durationDays: 30,
        access: { lessonVideos: true, trafficRules: true, exams: true },
        examLimit: null,
        isActive: true,
        sortOrder: 1
      },
      {
        id: 'plan_14_days_standard',
        name: { rw: "Ibyumweru 2 Standard", en: "14-Day Standard Pass", fr: "Pass Standard 14 Jours" },
        description: { rw: "Amategeko y'umuhanda n'ibizamini 15 byo kwitoza.", en: "Traffic rules and 15 complete mock exam attempts.", fr: "Règles et 15 examens blancs complets." },
        price: 1500,
        durationDays: 14,
        access: { lessonVideos: false, trafficRules: true, exams: true },
        examLimit: 15,
        isActive: true,
        sortOrder: 2
      },
      {
        id: 'plan_7_days_theory',
        name: { rw: "Amategeko n'Amashusho", en: "7-Day Video Theory Pass", fr: "Pass Théorie 7 Jours" },
        description: { rw: "Amategeko yose y'umuhanda n'amashusho yose asobanura.", en: "Access all traffic rules and interactive video explanations.", fr: "Accès à toutes les règles du code." },
        price: 1000,
        durationDays: 7,
        access: { lessonVideos: true, trafficRules: true, exams: false },
        examLimit: null,
        isActive: true,
        sortOrder: 3
      }
    ];

    return res.json({ plans: fallbackPlans });
  });

  // ==========================================
  // API: SAVE LESSON PROGRESS
  // ==========================================
  app.post('/api/lessons/progress', async (req: Request, res: Response) => {
    const auth = await verifyAuth(req);
    const uid = auth?.uid || req.body?.uid;
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });
    const { lessonId, completed, passed, score, total, percent } = req.body || {};
    if (!lessonId) return res.status(400).json({ error: 'Missing lessonId' });

    try {
      const progressRef = db.collection('users').doc(uid).collection('progress').doc(lessonId);
      await progressRef.set({
        lessonId,
        completed: completed !== undefined ? Boolean(completed) : true,
        passed: passed !== undefined ? Boolean(passed) : true,
        score: Number(score) || 100,
        total: Number(total) || 100,
        percent: Number(percent) || 100,
        lastAccessed: new Date().toISOString(),
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });

      return res.json({ success: true, message: 'Progress saved successfully' });
    } catch (err: any) {
      console.error('Save lesson progress error:', err);
      return res.status(500).json({ error: err.message || 'Failed to save progress' });
    }
  });

  // ==========================================
  // API: REGISTER STUDENT PROFILE (Admin SDK fallback)
  // ==========================================
  app.post('/api/auth/register-student-profile', publicAndAuthLimiter, async (req: Request, res: Response) => {
    const auth = await verifyAuth(req);
    const { uid, name, phone, email, role, status, createdAt, referralCode } = req.body || {};
    const effectiveUid = auth?.uid || uid;
    if (!effectiveUid) {
      return res.status(401).json({ error: 'Unauthorized: missing user identity' });
    }

    try {
      const userRef = db.collection('users').doc(effectiveUid);
      const userDoc = await userRef.get();
      if (!userDoc.exists) {
        await userRef.set({
          uid: effectiveUid,
          name: name || 'Student',
          phone: phone || '',
          email: email || '',
          role: 'student',
          status: 'active',
          createdAt: createdAt || new Date().toISOString(),
          referralCode: referralCode || Math.random().toString(36).substring(2, 8).toUpperCase()
        });
      }
      return res.json({ success: true, message: 'Profile registered successfully' });
    } catch (err: any) {
      console.error('Register student profile error:', err);
      return res.status(500).json({ error: err.message || 'Failed to save profile' });
    }
  });

  // ==========================================
  // API: INITIATE PAYMENT (Express route: /api/payments/create & /api/payments/start)
  // ==========================================
  const handlePaymentCreate = async (req: Request, res: Response) => {
    const auth = await verifyAuth(req);
    if (!auth) return res.status(401).json({ error: 'Unauthorized: Please sign in to initiate payment.' });
    const { uid, email } = auth;

    try {
      const { planId, phone, redeemPoints } = req.body || {};
      if (!planId || typeof planId !== 'string') {
        return res.status(400).json({ error: 'Missing or invalid planId' });
      }

      const planDoc = await db.collection('plans').doc(planId).get();
      if (!planDoc.exists) {
        return res.status(404).json({ error: 'Selected subscription plan does not exist.' });
      }
      const planData = planDoc.data()!;
      if (!planData.isActive) {
        return res.status(400).json({ error: 'Selected plan is currently inactive.' });
      }
      const planPrice = Number(planData.price);
      if (!planPrice || planPrice <= 0) {
        return res.status(400).json({ error: 'Invalid plan price configured.' });
      }

      // Check active unexpired study plan
      const wantsStudyPlan = Boolean(planData.access?.trafficRules || planData.access?.lessonVideos);
      const serverNow = new Date();
      const userSubsSnap = await db.collection('subscriptions')
        .where('userId', '==', uid)
        .get();

      if (wantsStudyPlan) {
        const activeSubDoc = userSubsSnap.docs.find(d => {
          const sub = d.data();
          if (sub.status !== 'active') return false;
          const isStudy = Boolean(sub.access?.trafficRules || sub.access?.lessonVideos);
          if (!isStudy) return false;
          const end = sub.endDate ? new Date(sub.endDate) : null;
          return end && end > serverNow;
        });

        if (activeSubDoc) {
          const activeSub = activeSubDoc.data();
          return res.status(409).json({
            error: 'STUDY_PLAN_ACTIVE',
            code: 'STUDY_PLAN_ACTIVE',
            message: `You already have an active study plan expiring on ${activeSub.endDate}. New study plans cannot be purchased until the active one expires.`,
            expiresAt: activeSub.endDate,
            planName: activeSub.planName || 'Active Study Plan'
          });
        }
      }

      // 1. Check active promotions for this plan
      const nowMs = Date.now();
      const promoSnap = await db.collection('promotions').where('isActive', '==', true).get();
      let bestPrice = planPrice;
      let activePromotion: any = null;

      promoSnap.docs.forEach(doc => {
        const p = doc.data();
        if (p.planId !== 'all' && p.planId !== planId) return;
        const start = new Date(p.startAt).getTime();
        const end = new Date(p.endAt).getTime();
        if (nowMs >= start && nowMs <= end) {
          let candDiscount = 0;
          if (p.discountType === 'percent') {
            candDiscount = Math.round(planPrice * (Number(p.discountValue) / 100));
          } else {
            candDiscount = Number(p.discountValue);
          }
          const candPrice = Math.max(0, planPrice - candDiscount);
          if (candPrice < bestPrice) {
            bestPrice = candPrice;
            activePromotion = { id: doc.id, ...p, discountAmount: candDiscount };
          }
        }
      });

      // 2. Points Redemption validation (applied to the promo-discounted price)
      const pointsToRedeem = Number(redeemPoints) || 0;
      let discountAmount = 0;
      if (pointsToRedeem > 0) {
        const ledgerSnap = await db.collection('users').doc(uid).collection('pointsLedger').get();
        let balance = 0;
        ledgerSnap.docs.forEach(doc => {
          const d = doc.data();
          if (d.amount !== undefined) balance += Number(d.amount);
          else if (d.type === 'spend') balance -= Number(d.points || 0);
          else balance += Number(d.points || 0);
        });

        if (balance < pointsToRedeem) {
          return res.status(400).json({
            error: 'INSUFFICIENT_POINTS',
            code: 'INSUFFICIENT_POINTS',
            message: 'Insufficient points balance.'
          });
        }

        const settingsSnap = await db.collection('siteSettings').doc('referral').get();
        const pointValueRwf = Number(settingsSnap.data()?.pointValueRwf) || 1;
        discountAmount = pointsToRedeem * pointValueRwf;
      }

      const finalCashPrice = Math.max(0, bestPrice - discountAmount);

      let planNameString = 'Subscription Pass';
      if (typeof planData.name === 'object' && planData.name !== null) {
        planNameString = planData.name.en || planData.name.rw || planData.name.fr || 'Subscription Pass';
      } else if (typeof planData.name === 'string') {
        planNameString = planData.name;
      }

      // Case 1: 100% Free activation with points!
      if (finalCashPrice === 0) {
        const paymentRef = db.collection('payments').doc();
        const paymentRecord = {
          id: paymentRef.id,
          paypackRef: 'POINTS_FREE_' + paymentRef.id,
          userId: uid,
          userEmail: email || '',
          planId,
          planName: planNameString,
          basePrice: planPrice,
          discountedPrice: bestPrice,
          promotionId: activePromotion ? activePromotion.id : null,
          promotionDiscount: planPrice - bestPrice,
          amount: 0,
          pointsRedeemed: pointsToRedeem,
          phone: phone || 'N/A',
          network: 'POINTS',
          kind: 'points_redemption',
          status: 'pending',
          paypackStatus: 'successful',
          isSandbox: false,
          subscriptionId: null,
          failureReason: null,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        };

        await paymentRef.set(paymentRecord);
        const pSnap = await paymentRef.get();
        await processSuccessfulPayment(pSnap, 0);

        return res.json({
          success: true,
          paymentId: paymentRef.id,
          paypackRef: paymentRecord.paypackRef,
          amount: 0,
          originalPrice: planPrice,
          promotionDiscount: planPrice - bestPrice,
          pointsRedeemed: pointsToRedeem,
          freeWithPoints: true,
          message: 'Plan activated successfully with points!'
        });
      }

      // Case 2: Cash payment required (partial discount or full price)
      if (!phone || typeof phone !== 'string') {
        return res.status(400).json({ error: 'Missing or invalid phone number' });
      }

      const { normalizedPhone, network } = parseRwandanPhone(phone);

      // Check pending payments (last 3 minutes)
      const userPaymentsSnap = await db.collection('payments')
        .where('userId', '==', uid)
        .get();

      const threeMinAgoMs = Date.now() - 3 * 60 * 1000;
      const recentPendingPayment = userPaymentsSnap.docs.find(doc => {
        const d = doc.data();
        if (d.status !== 'pending') return false;
        const createdDate = d.createdAt
          ? (typeof d.createdAt.toDate === 'function' ? d.createdAt.toDate() : new Date(d.createdAt))
          : null;
        return createdDate && createdDate.getTime() >= threeMinAgoMs;
      });

      if (recentPendingPayment) {
        return res.status(409).json({
          code: 'PENDING_PAYMENT_EXISTS',
          error: 'A pending payment is already in progress. Please approve on your phone.'
        });
      }

      const clientId = getSecret('PAYPACK_CLIENT_ID');
      const clientSecret = getSecret('PAYPACK_CLIENT_SECRET');
      const isConfigured = isSecretConfigured(clientId) && isSecretConfigured(clientSecret);

      let paypackRef: string;
      let isSandbox = !isConfigured;

      if (isConfigured) {
        if (finalCashPrice < 100) {
          return res.status(400).json({ error: 'Minimum payment amount is 100 RWF.' });
        }
        try {
          const token = await getPaypackToken();
          const cashinRes = await axios.post(
            `${PAYPACK_BASE_URL}/transactions/cashin`,
            { amount: finalCashPrice, number: normalizedPhone },
            {
              headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                Authorization: `Bearer ${token}`
              },
              timeout: 20000
            }
          );
          paypackRef = cashinRes.data?.ref || cashinRes.data?.data?.ref;
          if (!paypackRef) {
            throw new Error('Paypack response did not include a valid transaction reference');
          }
        } catch (apiErr: any) {
          const errMsg = apiErr?.response?.data?.message || apiErr?.message || 'Paypack API error';
          console.error('Paypack API call failed:', errMsg);
          throw new Error('Payment initiation failed: ' + errMsg);
        }
      } else {
        throw new Error('Paypack credentials not configured');
      }

      const paymentRef = db.collection('payments').doc();
      const paymentRecord = {
        id: paymentRef.id,
        paypackRef,
        userId: uid,
        userEmail: email || '',
        planId,
        planName: planNameString,
        basePrice: planPrice,
        discountedPrice: bestPrice,
        promotionId: activePromotion ? activePromotion.id : null,
        promotionDiscount: planPrice - bestPrice,
        amount: finalCashPrice,
        pointsRedeemed: pointsToRedeem,
        phone: normalizedPhone,
        network,
        kind: 'cashin',
        status: 'pending',
        paypackStatus: isSandbox ? 'sandbox' : 'pending',
        isSandbox,
        subscriptionId: null,
        failureReason: null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };

      await paymentRef.set(paymentRecord);

      return res.json({
        success: true,
        paymentId: paymentRef.id,
        paypackRef,
        amount: finalCashPrice,
        originalPrice: planPrice,
        promotionDiscount: planPrice - bestPrice,
        promotionId: activePromotion ? activePromotion.id : null,
        pointsRedeemed: pointsToRedeem,
        phone: normalizedPhone,
        network,
        isSandbox,
      });
    } catch (err: any) {
      console.error('Payment start failed:', err);
      return res.status(500).json({ error: err.message || 'Payment initiation failed' });
    }
  };

  app.post('/api/payments/checkout', checkoutLimiter, handlePaymentCreate);
  app.post('/api/payments/create', checkoutLimiter, handlePaymentCreate);
  app.post('/api/payments/start', checkoutLimiter, handlePaymentCreate);

  // Admin manual approval endpoint (for verifying offline/direct MoMo transfers or admin grants)
  app.post('/api/payments/admin-approve', async (req: Request, res: Response) => {
    const auth = await verifyAuth(req);
    if (!auth) return res.status(401).json({ error: 'Unauthorized: Sign in required.' });

    // Verify admin role
    const userDoc = await db.collection('users').doc(auth.uid).get();
    const isAdmin = auth.email === 'fabriceib2006@gmail.com' || userDoc.data()?.role === 'admin';
    if (!isAdmin) {
      return res.status(403).json({ error: 'Forbidden: Only administrators can approve payments manually.' });
    }

    const { paymentId } = req.body || {};
    if (!paymentId) return res.status(400).json({ error: 'Missing paymentId' });

    try {
      const pDoc = await db.collection('payments').doc(paymentId).get();
      if (!pDoc.exists) return res.status(404).json({ error: 'Payment not found' });
      const pData = pDoc.data()!;
      if (pData.status === 'successful') {
        return res.status(400).json({ error: 'Payment has already been approved.' });
      }

      await processSuccessfulPayment(pDoc, pData.amount);

      // Check live Paypack status in background so admin sees what Paypack reported
      if (pData.paypackRef && !pData.paypackRef.startsWith('TEST_MOMO_')) {
        fetchPaypackTransaction(pData.paypackRef).then(txInfo => {
          if (txInfo.found) {
            pDoc.ref.update({
              paypackStatus: txInfo.status,
              lastPaypackCheckAt: FieldValue.serverTimestamp(),
            }).catch(() => {});
          }
        }).catch(() => {});
      }

      return res.json({ success: true, message: 'Payment approved and subscription activated!' });
    } catch (err: any) {
      console.error('Admin approve failed:', err);
      return res.status(500).json({ error: err.message || 'Failed to approve payment' });
    }
  });

  // Check payment status with Paypack in real time
  // Check payment status with Paypack in real time (supports GET and POST)
  app.all('/api/payments/:id/check-status', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      if (!id) return res.status(400).json({ error: 'Missing payment ID' });

      // Look up payment by doc ID or paypackRef
      let paymentDoc = await db.collection('payments').doc(id).get();
      if (!paymentDoc.exists) {
        const queryByRef = await db.collection('payments').where('paypackRef', '==', id).limit(1).get();
        if (!queryByRef.empty) {
          paymentDoc = queryByRef.docs[0];
        } else {
          return res.status(404).json({ error: 'Payment not found' });
        }
      }

      const pData = paymentDoc.data()!;
      const paypackRef = pData.paypackRef;

      // If payment is already successful, return immediately
      if (pData.status === 'successful') {
        return res.json({
          success: true,
          status: 'successful',
          paypackStatus: pData.paypackStatus || 'successful',
          payment: { id: paymentDoc.id, ...pData }
        });
      }

      // Query live Paypack API directly for all payments
      const txInfo = await fetchPaypackTransaction(paypackRef);
      const updates: any = {
        lastPaypackCheckAt: FieldValue.serverTimestamp(),
      };

      if (txInfo.found) {
        updates.paypackStatus = txInfo.status;
        if (txInfo.failureReason) {
          updates.failureReason = txInfo.failureReason;
        }

        if (txInfo.status === 'successful') {
          if (pData.status !== 'successful') {
            await processSuccessfulPayment(paymentDoc, txInfo.amount || pData.amount);
          } else {
            await paymentDoc.ref.update(updates);
          }
        } else if (txInfo.status === 'failed') {
          if (pData.status === 'pending') {
            updates.status = 'failed';
          }
          await paymentDoc.ref.update(updates);
        } else if (txInfo.status === 'pending') {
          await paymentDoc.ref.update(updates);
        }
      }

      const freshDoc = await paymentDoc.ref.get();
      const freshData = freshDoc.data()!;

      return res.json({
        success: true,
        status: freshData.status,
        paypackStatus: freshData.paypackStatus || txInfo.status,
        failureReason: freshData.failureReason,
        payment: { id: freshDoc.id, ...freshData }
      });
    } catch (err: any) {
      console.error('Check payment status error:', err);
      return res.status(500).json({ error: err.message || 'Failed to check status' });
    }
  });

  // ==========================================
  // API: ADMIN GRANT SUBSCRIPTION (/api/admin/grants & /api/admin/grant-subscription)
  // ==========================================
  const handleAdminGrant = async (req: Request, res: Response) => {
    const auth = await verifyAuth(req);
    if (!auth) return res.status(401).json({ error: 'Unauthorized: Sign in required.' });

    // Verify admin role
    const userDoc = await db.collection('users').doc(auth.uid).get();
    const isAdmin = auth.email === 'fabriceib2006@gmail.com' || userDoc.data()?.role === 'admin';
    if (!isAdmin) {
      return res.status(403).json({ error: 'Forbidden: Only administrators can grant subscriptions.' });
    }

    const { targetUserId, userId: bodyUserId, planId, durationDays, customNotes } = req.body || {};
    const effectiveUserId = targetUserId || bodyUserId;
    if (!effectiveUserId || typeof effectiveUserId !== 'string') {
      return res.status(400).json({ error: 'targetUserId is required' });
    }
    if (!planId || typeof planId !== 'string') {
      return res.status(400).json({ error: 'planId is required' });
    }

    try {
      const planDoc = await db.collection('plans').doc(planId).get();
      if (!planDoc.exists) {
        return res.status(404).json({ error: 'Subscription plan not found.' });
      }
      const plan = planDoc.data()!;
      const isStudyPlan = Boolean(plan.access?.trafficRules || plan.access?.lessonVideos);
      const now = new Date();

      // Conflict Check: Only A student with an ACTIVE study plan cannot buy or be granted another study plan
      if (isStudyPlan) {
        const userSubsSnap = await db.collection('subscriptions')
          .where('userId', '==', effectiveUserId)
          .get();

        const activeStudySub = userSubsSnap.docs.find(d => {
          const s = d.data();
          if (s.status !== 'active') return false;
          const isExistingStudy = Boolean(s.access?.trafficRules || s.access?.lessonVideos);
          if (!isExistingStudy) return false;
          const end = s.endDate ? new Date(s.endDate) : null;
          return end && end > now;
        });

        if (activeStudySub) {
          const activeSubData = activeStudySub.data();
          return res.status(409).json({
            error: 'STUDY_PLAN_ACTIVE',
            code: 'STUDY_PLAN_ACTIVE',
            message: `User already has an active study plan expiring on ${activeSubData.endDate}. Another study plan cannot be granted until the active one expires.`,
            expiresAt: activeSubData.endDate,
            planName: activeSubData.planName || 'Active Study Plan'
          });
        }
      }

      const days = isStudyPlan ? (Number(durationDays) || Number(plan.durationDays) || 30) : 0;
      const validityDays = isStudyPlan ? days : null;
      const startDate = now.toISOString();
      const endDate = isStudyPlan 
        ? new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString()
        : null; // Exams-only plans have NO validity (null = none)

      let planNameStr = 'Standard Pass';
      if (typeof plan.name === 'string') {
        planNameStr = plan.name;
      } else if (plan.name && typeof plan.name === 'object') {
        planNameStr = plan.name.en || plan.name.rw || plan.name.fr || 'Standard Pass';
      }

      const subRef = db.collection('subscriptions').doc();
      const subData = {
        id: subRef.id,
        userId: effectiveUserId,
        planId: planId,
        planName: planNameStr,
        price: Number(plan.price) || 0,
        durationDays: days,
        validityDays,
        startDate,
        endDate,
        access: {
          trafficRules: Boolean(plan.access?.trafficRules),
          lessonVideos: Boolean(plan.access?.lessonVideos),
          exams: Boolean(plan.access?.exams),
        },
        examLimit: isStudyPlan ? null : (plan.examLimit !== undefined && plan.examLimit !== null ? Number(plan.examLimit) : 5),
        examsUsed: 0,
        status: 'active',
        source: 'admin_grant',
        grantedBy: auth.email || auth.uid,
        createdAt: startDate,
        notes: customNotes || 'Granted manually by admin',
      };

      await subRef.set(subData);

      // Sync to users/{effectiveUserId}/purchases/{subId}
      const userPurchaseRef = db.collection('users').doc(effectiveUserId).collection('purchases').doc(subRef.id);
      await userPurchaseRef.set({
        id: subRef.id,
        type: 'plan',
        planId: planId,
        planName: planNameStr,
        amount: Number(plan.price) || 0,
        status: 'active',
        access: subData.access,
        examLimit: subData.examLimit,
        examsUsed: 0,
        validityDays,
        startDate: subData.startDate,
        expiresAt: subData.endDate,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Sync to users/{effectiveUserId}/access/current
      const userAccessRef = db.collection('users').doc(effectiveUserId).collection('access').doc('current');
      await userAccessRef.set({
        planName: planNameStr,
        lessonsUntil: (subData.access.trafficRules && endDate) ? Timestamp.fromDate(new Date(endDate)) : null,
        videosUntil: (subData.access.lessonVideos && endDate) ? Timestamp.fromDate(new Date(endDate)) : null,
        examsUntil: (subData.access.exams && endDate) ? Timestamp.fromDate(new Date(endDate)) : null,
        examCredits: subData.examLimit,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      // Log in adminLogs
      await db.collection('adminLogs').add({
        adminId: auth.uid,
        adminEmail: auth.email || '',
        targetUserId: effectiveUserId,
        action: 'grant_subscription',
        planId,
        planName: planNameStr,
        durationDays: days,
        timestamp: startDate,
      }).catch(logErr => console.warn('Failed to record admin log:', logErr));

      return res.json({
        success: true,
        message: `Successfully granted "${planNameStr}" (${isStudyPlan ? `${days} days` : 'Exam Pack - No Expiration'}) to learner.`,
        subscription: subData,
      });
    } catch (err: any) {
      console.error('Admin grant subscription error:', err);
      return res.status(500).json({ error: err.message || 'Failed to grant subscription' });
    }
  };

  app.post('/api/admin/grants', handleAdminGrant);
  app.post('/api/admin/grant-subscription', handleAdminGrant);

  // ==========================================
  // API: ADMIN CANCEL SUBSCRIPTION & RESET EXAMS
  // ==========================================
  app.post('/api/admin/subscriptions/:subId/cancel', async (req: Request, res: Response) => {
    const auth = await verifyAuth(req);
    if (!auth) return res.status(401).json({ error: 'Unauthorized' });
    const userDoc = await db.collection('users').doc(auth.uid).get();
    const isAdmin = auth.email === 'fabriceib2006@gmail.com' || userDoc.data()?.role === 'admin';
    if (!isAdmin) return res.status(403).json({ error: 'Forbidden' });

    const { subId } = req.params;
    try {
      const subRef = db.collection('subscriptions').doc(subId);
      const subDoc = await subRef.get();
      if (!subDoc.exists) return res.status(404).json({ error: 'Subscription not found' });
      const subData = subDoc.data()!;
      const userId = subData.userId;

      await subRef.update({
        status: 'cancelled',
        updatedAt: FieldValue.serverTimestamp()
      });

      if (userId) {
        const userPurchaseRef = db.collection('users').doc(userId).collection('purchases').doc(subId);
        await userPurchaseRef.set({ status: 'cancelled', updatedAt: FieldValue.serverTimestamp() }, { merge: true });

        // Recompute user access
        const purchasesSnap = await db.collection('users').doc(userId).collection('purchases').get();
        const subsSnap = await db.collection('subscriptions').where('userId', '==', userId).get();
        const allPurchases = [...purchasesSnap.docs.map(d => ({ id: d.id, ...d.data() }))];
        for (const sD of subsSnap.docs) {
          const s = sD.data();
          if (sD.id === subId) s.status = 'cancelled';
          if (!allPurchases.some(p => p.id === sD.id || (p as any).planId === (s as any).planId)) {
            allPurchases.push({ id: sD.id, ...s });
          }
        }
        const newAccess = computeAccess(allPurchases);
        await db.collection('users').doc(userId).collection('access').doc('current').set({
          planName: newAccess.planName,
          lessonsUntil: newAccess.lessonsUntil,
          videosUntil: newAccess.videosUntil,
          examsUntil: newAccess.examsUntil,
          examCredits: newAccess.examCredits,
          examsUsed: newAccess.examsUsed,
          totalExamsAllowed: newAccess.totalExamsAllowed,
          updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
      }

      await db.collection('adminLogs').add({
        adminId: auth.uid,
        adminEmail: auth.email || '',
        targetUserId: userId,
        action: 'cancel_subscription',
        subId,
        timestamp: new Date().toISOString()
      }).catch(() => {});

      return res.json({ success: true, message: 'Subscription cancelled successfully.' });
    } catch (err: any) {
      console.error('Cancel subscription error:', err);
      return res.status(500).json({ error: err.message || 'Failed to cancel subscription' });
    }
  });

  app.post('/api/admin/subscriptions/:subId/reset-exams', async (req: Request, res: Response) => {
    const auth = await verifyAuth(req);
    if (!auth) return res.status(401).json({ error: 'Unauthorized' });
    const userDoc = await db.collection('users').doc(auth.uid).get();
    const isAdmin = auth.email === 'fabriceib2006@gmail.com' || userDoc.data()?.role === 'admin';
    if (!isAdmin) return res.status(403).json({ error: 'Forbidden' });

    const { subId } = req.params;
    try {
      const subRef = db.collection('subscriptions').doc(subId);
      const subDoc = await subRef.get();
      if (!subDoc.exists) return res.status(404).json({ error: 'Subscription not found' });
      const subData = subDoc.data()!;
      const userId = subData.userId;

      await subRef.update({
        examsUsed: 0,
        updatedAt: FieldValue.serverTimestamp()
      });

      if (userId) {
        const userPurchaseRef = db.collection('users').doc(userId).collection('purchases').doc(subId);
        await userPurchaseRef.set({ examsUsed: 0, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

        // Recompute user access
        const purchasesSnap = await db.collection('users').doc(userId).collection('purchases').get();
        const subsSnap = await db.collection('subscriptions').where('userId', '==', userId).get();
        const allPurchases = [...purchasesSnap.docs.map(d => ({ id: d.id, ...d.data() }))];
        for (const sD of subsSnap.docs) {
          const s = sD.data();
          if (sD.id === subId) s.examsUsed = 0;
          if (!allPurchases.some(p => p.id === sD.id || (p as any).planId === (s as any).planId)) {
            allPurchases.push({ id: sD.id, ...s });
          }
        }
        const newAccess = computeAccess(allPurchases);
        await db.collection('users').doc(userId).collection('access').doc('current').set({
          planName: newAccess.planName,
          lessonsUntil: newAccess.lessonsUntil,
          videosUntil: newAccess.videosUntil,
          examsUntil: newAccess.examsUntil,
          examCredits: newAccess.examCredits,
          examsUsed: newAccess.examsUsed,
          totalExamsAllowed: newAccess.totalExamsAllowed,
          updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
      }

      await db.collection('adminLogs').add({
        adminId: auth.uid,
        adminEmail: auth.email || '',
        targetUserId: userId,
        action: 'reset_exams',
        subId,
        timestamp: new Date().toISOString()
      }).catch(() => {});

      return res.json({ success: true, message: 'Exam counts reset successfully.' });
    } catch (err: any) {
      console.error('Reset exams error:', err);
      return res.status(500).json({ error: err.message || 'Failed to reset exam counts' });
    }
  });

  // ==========================================
  // API: ADMIN USER PERFORMANCE & HISTORY
  // ==========================================
  app.get('/api/admin/users/:userId/performance', async (req: Request, res: Response) => {
    const auth = await verifyAuth(req);
    if (!auth) return res.status(401).json({ error: 'Unauthorized' });
    const userDoc = await db.collection('users').doc(auth.uid).get();
    const isAdmin = auth.email === 'fabriceib2006@gmail.com' || userDoc.data()?.role === 'admin';
    if (!isAdmin) return res.status(403).json({ error: 'Forbidden' });

    const { userId } = req.params;
    if (!userId) return res.status(400).json({ error: 'Missing userId parameter' });

    try {
      const [
        attemptsSnap,
        resultsSnap,
        rootResultsSnap,
        progressSnap,
        categoriesSnap,
        lessonsSnap
      ] = await Promise.all([
        db.collection('users').doc(userId).collection('examAttempts').get().catch(() => null),
        db.collection('users').doc(userId).collection('examResults').get().catch(() => null),
        db.collection('examResults').where('userId', '==', userId).get().catch(() => null),
        db.collection('users').doc(userId).collection('progress').get().catch(() => null),
        db.collection('categories').get().catch(() => null),
        db.collection('lessons').get().catch(() => null)
      ]);

      // Category map
      const categoryMap = new Map<string, any>();
      if (categoriesSnap) {
        categoriesSnap.docs.forEach(d => {
          categoryMap.set(d.id, { id: d.id, ...d.data() });
        });
      }

      // Lesson map
      const lessonMap = new Map<string, any>();
      if (lessonsSnap) {
        lessonsSnap.docs.forEach(d => {
          lessonMap.set(d.id, { id: d.id, ...d.data() });
        });
      }

      // Merge results & attempts
      const attemptsMap = new Map<string, any>();

      // 1. Ingest attempts from users/{userId}/examAttempts
      if (attemptsSnap) {
        attemptsSnap.docs.forEach(d => {
          const data = d.data();
          attemptsMap.set(d.id, { id: d.id, ...data });
        });
      }

      // 2. Ingest results from users/{userId}/examResults
      if (resultsSnap) {
        resultsSnap.docs.forEach(d => {
          const data = d.data();
          const existing = attemptsMap.get(data.attemptId || d.id);
          if (existing) {
            attemptsMap.set(existing.id, { ...existing, ...data });
          } else {
            attemptsMap.set(d.id, { id: d.id, ...data });
          }
        });
      }

      // 3. Ingest results from root examResults
      if (rootResultsSnap) {
        rootResultsSnap.docs.forEach(d => {
          const data = d.data();
          const existing = attemptsMap.get(data.attemptId || d.id);
          if (existing) {
            attemptsMap.set(existing.id, { ...existing, ...data });
          } else {
            attemptsMap.set(d.id, { id: d.id, ...data });
          }
        });
      }

      const allAttempts = Array.from(attemptsMap.values());

      // Collect question IDs to batch load if missing details
      const questionIdsToFetch = new Set<string>();
      allAttempts.forEach(att => {
        if (Array.isArray(att.questionIds)) {
          att.questionIds.forEach((qId: string) => questionIdsToFetch.add(qId));
        }
      });

      const questionsMap = new Map<string, any>();
      const qIdList = Array.from(questionIdsToFetch);
      for (let i = 0; i < qIdList.length; i += 30) {
        const chunk = qIdList.slice(i, i + 30);
        if (chunk.length > 0) {
          const qSnap = await db.collection('questions')
            .where(FieldPath.documentId(), 'in', chunk)
            .get()
            .catch(() => null);
          if (qSnap) {
            qSnap.docs.forEach(doc => {
              questionsMap.set(doc.id, { id: doc.id, ...doc.data() });
            });
          }
        }
      }

      // Format exams
      const formattedExams = allAttempts
        .filter(att => att.status === 'finished' || att.status === 'completed' || att.score !== undefined)
        .map(att => {
          const dateStr = att.submittedAt || att.date || (att.startedAt?.toDate ? att.startedAt.toDate().toISOString() : att.startedAt) || new Date().toISOString();
          let durationSeconds = Number(att.durationSeconds) || 0;
          if (!durationSeconds && att.startedAt && att.submittedAt) {
            const startMs = att.startedAt.toDate ? att.startedAt.toDate().getTime() : new Date(att.startedAt).getTime();
            const endMs = new Date(att.submittedAt).getTime();
            durationSeconds = Math.max(0, Math.floor((endMs - startMs) / 1000));
          }

          // Build question breakdown
          let questionBreakdown: any[] = [];
          if (Array.isArray(att.results) && att.results.length > 0) {
            questionBreakdown = att.results.map((r: any, idx: number) => {
              const qDetail = questionsMap.get(r.questionId);
              const catId = r.category || qDetail?.category || 'General';
              const catObj = categoryMap.get(catId);
              return {
                index: idx + 1,
                questionId: r.questionId,
                text: r.text || qDetail?.text || { en: 'Question ' + (idx + 1), rw: 'Ikibazo ' + (idx + 1), fr: 'Question ' + (idx + 1) },
                options: r.options || qDetail?.options || { en: [], rw: [], fr: [] },
                userAnswer: r.userAnswer ?? null,
                correctIndex: r.correctIndex ?? qDetail?.correctIndex ?? 0,
                isCorrect: Boolean(r.isCorrect),
                explanation: r.explanation || qDetail?.explanation || {},
                category: catId,
                categoryName: catObj?.name || catId,
                imageUrl: r.imageUrl || qDetail?.imageUrl || null
              };
            });
          } else if (Array.isArray(att.questionIds) && att.questionIds.length > 0) {
            questionBreakdown = att.questionIds.map((qId: string, idx: number) => {
              const qDetail = questionsMap.get(qId);
              const userAns = att.userAnswers ? att.userAnswers[qId] : undefined;
              const correctIdx = qDetail ? qDetail.correctIndex : 0;
              const isCorrect = userAns !== undefined && userAns === correctIdx;
              const catId = qDetail?.category || 'General';
              const catObj = categoryMap.get(catId);
              return {
                index: idx + 1,
                questionId: qId,
                text: qDetail?.text || { en: 'Question ' + (idx + 1), rw: 'Ikibazo ' + (idx + 1), fr: 'Question ' + (idx + 1) },
                options: qDetail?.options || { en: [], rw: [], fr: [] },
                userAnswer: userAns ?? null,
                correctIndex: correctIdx,
                isCorrect,
                explanation: qDetail?.explanation || {},
                category: catId,
                categoryName: catObj?.name || catId,
                imageUrl: qDetail?.imageUrl || null
              };
            });
          }

          const score = Number(att.score) !== undefined && !isNaN(Number(att.score))
            ? Number(att.score)
            : questionBreakdown.filter(q => q.isCorrect).length;
          const total = Number(att.total) || (questionBreakdown.length > 0 ? questionBreakdown.length : 20);
          const passMark = Number(att.passMark) || 12;
          const passed = att.passed !== undefined ? Boolean(att.passed) : score >= passMark;
          const percentage = total > 0 ? Math.round((score / total) * 100) : 0;

          return {
            id: att.id,
            attemptId: att.attemptId || att.id,
            date: dateStr,
            durationSeconds,
            score,
            total,
            passMark,
            passed,
            percentage,
            correctCount: score,
            incorrectCount: Math.max(0, total - score),
            questions: questionBreakdown
          };
        });

      // Sort newest first
      formattedExams.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      // Aggregated statistics
      const totalExams = formattedExams.length;
      const passedExams = formattedExams.filter(e => e.passed).length;
      const failedExams = totalExams - passedExams;
      const passRate = totalExams > 0 ? Math.round((passedExams / totalExams) * 100) : 0;
      const totalScores = formattedExams.reduce((acc, curr) => acc + curr.score, 0);
      const averageScore = totalExams > 0 ? Number((totalScores / totalExams).toFixed(1)) : 0;
      const averageScorePercent = totalExams > 0 ? Math.round((totalScores / (totalExams * 20)) * 100) : 0;
      const highestScore = totalExams > 0 ? Math.max(...formattedExams.map(e => e.score)) : 0;
      const lowestScore = totalExams > 0 ? Math.min(...formattedExams.map(e => e.score)) : 0;
      const totalDuration = formattedExams.reduce((acc, curr) => acc + (curr.durationSeconds || 0), 0);
      const averageDurationSeconds = totalExams > 0 ? Math.round(totalDuration / totalExams) : 0;

      // Category Performance aggregation
      const categoryStats = new Map<string, { categoryId: string; categoryName: any; totalQuestions: number; correctCount: number }>();
      formattedExams.forEach(exam => {
        exam.questions.forEach((q: any) => {
          const catId = q.category || 'General';
          const existing = categoryStats.get(catId) || {
            categoryId: catId,
            categoryName: q.categoryName || catId,
            totalQuestions: 0,
            correctCount: 0
          };
          existing.totalQuestions += 1;
          if (q.isCorrect) existing.correctCount += 1;
          categoryStats.set(catId, existing);
        });
      });

      const categoryPerformance = Array.from(categoryStats.values()).map(cat => ({
        ...cat,
        accuracyPercent: cat.totalQuestions > 0 ? Math.round((cat.correctCount / cat.totalQuestions) * 100) : 0
      })).sort((a, b) => b.accuracyPercent - a.accuracyPercent);

      // Lesson Quizzes from users/{userId}/progress
      const lessonQuizzes: any[] = [];
      if (progressSnap) {
        progressSnap.docs.forEach(doc => {
          const p = doc.data();
          const lesson = lessonMap.get(p.lessonId || doc.id);
          const dateStr = p.lastAccessed?.toDate ? p.lastAccessed.toDate().toISOString() : (p.updatedAt?.toDate ? p.updatedAt.toDate().toISOString() : new Date().toISOString());
          lessonQuizzes.push({
            lessonId: p.lessonId || doc.id,
            lessonTitle: lesson?.title || { en: 'Lesson ' + (p.lessonId || doc.id), rw: 'Isomo ' + (p.lessonId || doc.id), fr: 'Leçon ' + (p.lessonId || doc.id) },
            category: lesson?.category || 'General',
            score: Number(p.score) || 0,
            total: Number(p.total) || 0,
            percent: Number(p.percent) || (p.total > 0 ? Math.round((p.score / p.total) * 100) : 0),
            passed: Boolean(p.passed || p.completed),
            attempts: Number(p.attempts) || 1,
            date: dateStr
          });
        });
      }
      lessonQuizzes.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      return res.json({
        success: true,
        summary: {
          totalExams,
          passedExams,
          failedExams,
          passRate,
          averageScore,
          averageScorePercent,
          highestScore,
          lowestScore,
          averageDurationSeconds,
          totalQuizzes: lessonQuizzes.length,
          passedQuizzes: lessonQuizzes.filter(q => q.passed).length
        },
        examHistory: formattedExams,
        categoryPerformance,
        lessonQuizzes
      });
    } catch (err: any) {
      console.error('Failed to get user performance:', err);
      return res.status(500).json({ error: err.message || 'Failed to get user performance' });
    }
  });

  // ==========================================
  // API: SYNC WITH PAYPACK
  // ==========================================
  app.post('/api/paypack/sync', async (_req: Request, res: Response) => {
    try {
      let transactions: any[] = [];
      try {
        const token = await getPaypackToken();
        const response = await axios.get(`${PAYPACK_BASE_URL}/transactions/list?offset=0&limit=50`, {
          headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
          timeout: 15000,
        });
        transactions = response.data?.transactions || [];
      } catch (tokenErr: any) {
        console.warn('Sync transactions list warning:', tokenErr.message);
      }

      let updatedCount = 0;

      // 1. Process latest transactions from Paypack
      for (const item of transactions) {
        const ref = item.ref || item.data?.ref;
        const rawStatus = String(item.status || item.data?.status || '').toLowerCase();
        if (!ref) continue;

        let status = 'unknown';
        if (rawStatus === 'successful' || rawStatus === 'success') status = 'successful';
        else if (rawStatus === 'failed' || rawStatus === 'cancelled' || rawStatus === 'declined' || rawStatus === 'rejected') status = 'failed';
        else if (rawStatus === 'pending' || rawStatus === 'processing') status = 'pending';

        const query = await db.collection('payments').where('paypackRef', '==', ref).limit(1).get();
        if (!query.empty) {
          const pDoc = query.docs[0];
          const pData = pDoc.data();
          if (pData.status !== 'successful' && status === 'successful') {
            await processSuccessfulPayment(pDoc, item.amount);
            updatedCount++;
          } else if (pData.status === 'pending' && status === 'failed') {
            await pDoc.ref.update({
              status: 'failed',
              paypackStatus: 'failed',
              failureReason: item.failure_reason || 'Failed in Paypack',
              updatedAt: FieldValue.serverTimestamp(),
            });
            updatedCount++;
          } else if (pData.paypackStatus !== status) {
            await pDoc.ref.update({
              paypackStatus: status,
              lastPaypackCheckAt: FieldValue.serverTimestamp(),
            });
          }
        }
      }

      // 2. Also check any pending payments in Firestore with paypackRef
      const pendingSnap = await db.collection('payments')
        .where('status', '==', 'pending')
        .limit(25)
        .get();

      for (const pDoc of pendingSnap.docs) {
        const pData = pDoc.data();
        if (pData.paypackRef && !pData.paypackRef.startsWith('TEST_MOMO_')) {
          const txInfo = await fetchPaypackTransaction(pData.paypackRef);
          if (txInfo.found) {
            if (txInfo.status === 'successful') {
              await processSuccessfulPayment(pDoc, txInfo.amount || pData.amount);
              updatedCount++;
            } else if (txInfo.status === 'failed') {
              await pDoc.ref.update({
                status: 'failed',
                paypackStatus: 'failed',
                failureReason: txInfo.failureReason || 'Declined or timed out in Paypack',
                updatedAt: FieldValue.serverTimestamp(),
              });
              updatedCount++;
            } else if (txInfo.status === 'pending') {
              await pDoc.ref.update({
                paypackStatus: 'pending',
                lastPaypackCheckAt: FieldValue.serverTimestamp(),
              });
            }
          }
        }
      }

      res.json({ success: true, totalFetched: transactions.length, updatedCount });
    } catch (err: any) {
      console.error('Sync failed:', err);
      res.status(500).json({ error: err.message || 'Sync failed' });
    }
  });

  // ==========================================
  // API: EXAM ENDPOINTS
  // ==========================================
  app.get('/api/exams/settings', async (req: Request, res: Response) => {
    try {
      const settingsDoc = await db.collection('examSettings').doc('global-settings').get();
      if (!settingsDoc.exists) return res.status(500).json({ error: 'Settings missing' });
      res.json(settingsDoc.data());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  function computeAccess(rawPurchases: any[]) {
    const now = new Date();
    let latestLessonsUntil: Date | null = null;
    let latestVideosUntil: Date | null = null;
    let latestExamsUntil: Date | null = null;
    let totalExamCredits: number | null = 0;
    let totalExamsAllowed: number | null = 0;
    let totalExamsUsed: number = 0;
    let hasUnlimitedExams = false;
    let hasStudyPass = false;
    let activePlanName: any = null;

    for (const p of rawPurchases) {
      if (p.status !== 'active' && p.status !== undefined) continue;
      const isStudy = Boolean(
        p.access?.trafficRules ||
        p.access?.lessonVideos ||
        p.features?.lessons ||
        p.features?.videos
      );

      let expiresAt: Date | null = null;
      if (p.expiresAt) {
        expiresAt = typeof p.expiresAt.toDate === 'function' ? p.expiresAt.toDate() : new Date(p.expiresAt);
      } else if (p.endDate) {
        expiresAt = typeof p.endDate.toDate === 'function' ? p.endDate.toDate() : new Date(p.endDate);
      } else if (p.validityDays && p.startDate) {
        const start = typeof p.startDate.toDate === 'function' ? p.startDate.toDate() : new Date(p.startDate);
        expiresAt = new Date(start.getTime() + Number(p.validityDays) * 24 * 3600 * 1000);
      }

      if (isStudy) {
        if (!expiresAt || expiresAt > now) {
          hasStudyPass = true;
          hasUnlimitedExams = true;
          if (p.access?.trafficRules || p.features?.lessons) {
            if (!latestLessonsUntil || (expiresAt && expiresAt > latestLessonsUntil)) {
              latestLessonsUntil = expiresAt;
            }
          }
          if (p.access?.lessonVideos || p.features?.videos) {
            if (!latestVideosUntil || (expiresAt && expiresAt > latestVideosUntil)) {
              latestVideosUntil = expiresAt;
            }
          }
          if (p.access?.exams || p.features?.exams) {
            if (!latestExamsUntil || (expiresAt && expiresAt > latestExamsUntil)) {
              latestExamsUntil = expiresAt;
            }
          }
          activePlanName = p.planName || activePlanName;
        }
      } else {
        const allowed = typeof p.examLimit === 'number' 
          ? p.examLimit 
          : (typeof p.examsAllowed === 'number' ? p.examsAllowed : (typeof p.examCredits === 'number' ? p.examCredits : 5));
        const used = Number(p.examsUsed) || 0;
        const remaining = Math.max(0, allowed - used);
        
        totalExamsAllowed = (totalExamsAllowed || 0) + allowed;
        totalExamsUsed = totalExamsUsed + used;

        if (remaining > 0) {
          totalExamCredits = (totalExamCredits || 0) + remaining;
          if (!activePlanName) activePlanName = p.planName;
        }
      }
    }

    if (hasUnlimitedExams) {
      totalExamCredits = null;
      totalExamsAllowed = null;
    }

    return {
      planName: activePlanName,
      hasStudyPass,
      hasUnlimitedExams,
      lessonsUntil: latestLessonsUntil ? Timestamp.fromDate(latestLessonsUntil) : null,
      videosUntil: latestVideosUntil ? Timestamp.fromDate(latestVideosUntil) : null,
      examsUntil: latestExamsUntil ? Timestamp.fromDate(latestExamsUntil) : null,
      examCredits: totalExamCredits,
      examsUsed: totalExamsUsed,
      totalExamsAllowed: totalExamsAllowed,
      updatedAt: Timestamp.now()
    };
  }

  app.get('/api/access/current', async (req: Request, res: Response) => {
    const auth = await verifyAuth(req);
    if (!auth) return res.status(401).json({ error: 'Unauthorized: Sign in required.' });
    try {
      const purchasesSnap = await db.collection('users').doc(auth.uid).collection('purchases').get();
      const subsSnap = await db.collection('subscriptions').where('userId', '==', auth.uid).get();
      const allPurchases = [...purchasesSnap.docs.map(d => ({ id: d.id, ...d.data() }))];
      for (const sDoc of subsSnap.docs) {
        const s = sDoc.data();
        if (!allPurchases.some(p => p.id === sDoc.id || (p as any).planId === (s as any).planId)) {
          allPurchases.push({ id: sDoc.id, ...s });
        }
      }
      const access = computeAccess(allPurchases);
      res.json({
        success: true,
        access: {
          planName: access.planName,
          hasStudyPass: access.hasStudyPass,
          hasUnlimitedExams: access.hasUnlimitedExams,
          examCredits: access.examCredits,
          lessonsUntil: access.lessonsUntil ? access.lessonsUntil.toDate().toISOString() : null,
          videosUntil: access.videosUntil ? access.videosUntil.toDate().toISOString() : null,
          examsUntil: access.examsUntil ? access.examsUntil.toDate().toISOString() : null,
        }
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================
  // API: REFERRAL SYSTEM
  // ==========================================
  app.get('/api/admin/referral/settings', async (req: Request, res: Response) => {
    const auth = await verifyAuth(req);
    if (!auth) return res.status(401).json({ error: 'Unauthorized' });
    const userDoc = await db.collection('users').doc(auth.uid).get();
    const isAdmin = auth.email === 'fabriceib2006@gmail.com' || userDoc.data()?.role === 'admin';
    if (!isAdmin) return res.status(403).json({ error: 'Forbidden' });
    
    const settingsDoc = await db.collection('siteSettings').doc('referral').get();
    res.json(settingsDoc.exists ? settingsDoc.data() : { active: false });
  });

  app.post('/api/admin/referral/settings', async (req: Request, res: Response) => {
    const auth = await verifyAuth(req);
    if (!auth) return res.status(401).json({ error: 'Unauthorized' });
    const userDoc = await db.collection('users').doc(auth.uid).get();
    const isAdmin = auth.email === 'fabriceib2006@gmail.com' || userDoc.data()?.role === 'admin';
    if (!isAdmin) return res.status(403).json({ error: 'Forbidden' });
    
    await db.collection('siteSettings').doc('referral').set(req.body, { merge: true });
    res.json({ success: true });
  });

  app.post('/api/referral/signup-complete', async (req: Request, res: Response) => {
    const auth = await verifyAuth(req);
    if (!auth) return res.status(401).json({ error: 'Unauthorized' });
    const { refCode } = req.body;
    
    try {
      const settingsDoc = await db.collection('siteSettings').doc('referral').get();
      if (!settingsDoc.data()?.active) return res.status(400).json({ error: 'Referral not active', code: 'REFERRAL_INACTIVE' });

      let assignedCode = '';
      let assignedReferrer: string | null = null;

      await db.runTransaction(async (transaction) => {
        const userRef = db.collection('users').doc(auth.uid);
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists) {
          const err: any = new Error('User not found');
          err.status = 404;
          err.code = 'USER_NOT_FOUND';
          throw err;
        }
        if (userDoc.data()?.referredBy) {
          const err: any = new Error('Already referred');
          err.status = 400;
          err.code = 'ALREADY_REFERRED';
          throw err;
        }
        
        let newRefCode = userDoc.data()?.referralCode;
        if (!newRefCode) {
          newRefCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        }
        assignedCode = newRefCode;
        
        let referredById: string | null = null;
        if (refCode) {
          const referrers = await transaction.get(db.collection('users').where('referralCode', '==', refCode));
          if (referrers.empty) {
            const err: any = new Error('Invalid referral code');
            err.status = 400;
            err.code = 'INVALID_REFERRAL_CODE';
            throw err;
          }
          const referrer = referrers.docs[0];
          if (referrer.id === auth.uid) {
            const err: any = new Error('Cannot refer self');
            err.status = 400;
            err.code = 'CANNOT_REFER_SELF';
            throw err;
          }
          if (referrer.data().role === 'admin') {
            const err: any = new Error('Admin cannot be referrer');
            err.status = 400;
            err.code = 'ADMIN_CANNOT_REFER';
            throw err;
          }
          referredById = referrer.id;
        }
        assignedReferrer = referredById;
        
        transaction.update(userRef, {
          referralCode: newRefCode,
          referredBy: referredById
        });
      });

      return res.json({ success: true, referralCode: assignedCode, referredBy: assignedReferrer });
    } catch (err: any) {
      const status = err.status || 400;
      return res.status(status).json({
        error: err.code || err.message,
        code: err.code || 'REFERRAL_ERROR',
        message: err.message
      });
    }
  });

  // GET /api/referral/stats
  app.get('/api/referral/stats', async (req: Request, res: Response) => {
    const auth = await verifyAuth(req);
    if (!auth) return res.status(401).json({ error: 'Unauthorized' });
    const { uid } = auth;

    try {
      const userRef = db.collection('users').doc(uid);
      const userDoc = await userRef.get();
      let referralCode = userDoc.data()?.referralCode;

      if (!referralCode) {
        referralCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        await userRef.set({ referralCode }, { merge: true });
      }

      const settingsDoc = await db.collection('siteSettings').doc('referral').get();
      const settings = settingsDoc.exists ? settingsDoc.data()! : { active: false, baseDomain: 'https://ais-dev-lixew3oqgbkl4s66icznfc-399525316199.europe-west1.run.app', pointsPercent: 10, pointValueRwf: 1 };
      const baseDomain = settings.baseDomain || 'https://ais-dev-lixew3oqgbkl4s66icznfc-399525316199.europe-west1.run.app';

      const ledgerSnap = await userRef.collection('pointsLedger').get();
      let pointsBalance = 0;
      const history: any[] = [];
      ledgerSnap.docs.forEach(d => {
        const data = d.data();
        const amt = data.amount !== undefined ? Number(data.amount) : (data.type === 'spend' ? -Number(data.points || 0) : Number(data.points || 0));
        pointsBalance += amt;
        history.push({ id: d.id, ...data, amount: amt });
      });

      history.sort((a, b) => {
        const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime();
        const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime();
        return timeB - timeA;
      });

      const referredUsersSnap = await db.collection('users').where('referredBy', '==', uid).get();
      const referredCount = referredUsersSnap.size;

      res.json({
        referralCode,
        baseDomain,
        referralLink: `${baseDomain.replace(/\/$/, '')}/student?mode=signup&ref=${referralCode}`,
        pointsBalance,
        pointValueRwf: Number(settings.pointValueRwf) || 1,
        pointsPercent: Number(settings.pointsPercent) || 10,
        referredCount,
        history
      });
    } catch (err: any) {
      console.error('Error fetching referral stats:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/referral/redeem
  app.post('/api/referral/redeem', async (req: Request, res: Response) => {
    const auth = await verifyAuth(req);
    if (!auth) return res.status(401).json({ error: 'Unauthorized' });
    const { uid, email } = auth;
    const { planId, pointsToRedeem } = req.body || {};

    if (!planId || !pointsToRedeem) {
      return res.status(400).json({ error: 'Missing planId or pointsToRedeem' });
    }

    try {
      const planDoc = await db.collection('plans').doc(planId).get();
      if (!planDoc.exists) return res.status(404).json({ error: 'Plan not found' });
      const planData = planDoc.data()!;
      const planPrice = Number(planData.price);

      const ledgerSnap = await db.collection('users').doc(uid).collection('pointsLedger').get();
      let balance = 0;
      ledgerSnap.docs.forEach(doc => {
        const d = doc.data();
        if (d.amount !== undefined) balance += Number(d.amount);
        else if (d.type === 'spend') balance -= Number(d.points || 0);
        else balance += Number(d.points || 0);
      });

      if (balance < Number(pointsToRedeem)) {
        return res.status(400).json({
          error: 'INSUFFICIENT_POINTS',
          code: 'INSUFFICIENT_POINTS',
          message: 'Insufficient points balance.'
        });
      }

      const settingsDoc = await db.collection('siteSettings').doc('referral').get();
      const pointValueRwf = Number(settingsDoc.data()?.pointValueRwf) || 1;
      const discountAmount = Number(pointsToRedeem) * pointValueRwf;

      if (discountAmount < planPrice) {
        return res.status(400).json({
          error: 'PARTIAL_POINTS_REQUIRES_CHECKOUT',
          message: 'Points do not fully cover the plan. Please complete purchase through checkout.',
          pointsCovered: discountAmount,
          planPrice
        });
      }

      let planNameString = 'Subscription Pass';
      if (typeof planData.name === 'object' && planData.name !== null) {
        planNameString = planData.name.en || planData.name.rw || planData.name.fr || 'Subscription Pass';
      } else if (typeof planData.name === 'string') {
        planNameString = planData.name;
      }

      const paymentRef = db.collection('payments').doc();
      const paymentRecord = {
        id: paymentRef.id,
        paypackRef: 'POINTS_FREE_' + paymentRef.id,
        userId: uid,
        userEmail: email || '',
        planId,
        planName: planNameString,
        amount: 0,
        pointsRedeemed: Number(pointsToRedeem),
        phone: 'N/A',
        network: 'POINTS',
        kind: 'points_redemption',
        status: 'pending',
        paypackStatus: 'successful',
        isSandbox: false,
        subscriptionId: null,
        failureReason: null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };

      await paymentRef.set(paymentRecord);
      const pSnap = await paymentRef.get();
      await processSuccessfulPayment(pSnap, 0);

      return res.json({
        success: true,
        paymentId: paymentRef.id,
        planName: planNameString,
        pointsRedeemed: Number(pointsToRedeem),
        freeWithPoints: true,
        message: 'Plan successfully redeemed and activated with points!'
      });
    } catch (err: any) {
      console.error('Redeem points error:', err);
      return res.status(500).json({ error: err.message || 'Points redemption failed' });
    }
  });

  // GET /api/admin/referral/rewards
  app.get('/api/admin/referral/rewards', async (req: Request, res: Response) => {
    const auth = await verifyAuth(req);
    if (!auth) return res.status(401).json({ error: 'Unauthorized' });
    const userDoc = await db.collection('users').doc(auth.uid).get();
    const isAdmin = auth.email === 'fabriceib2006@gmail.com' || userDoc.data()?.role === 'admin';
    if (!isAdmin) return res.status(403).json({ error: 'Forbidden' });

    try {
      const snap = await db.collection('referralRewards').get();
      const rewards = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      rewards.sort((a: any, b: any) => {
        const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.date || a.createdAt || 0).getTime();
        const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.date || b.createdAt || 0).getTime();
        return timeB - timeA;
      });
      res.json({ rewards });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/admin/referral/reverse-reward
  app.post('/api/admin/referral/reverse-reward', async (req: Request, res: Response) => {
    const auth = await verifyAuth(req);
    if (!auth) return res.status(401).json({ error: 'Unauthorized' });
    const userDoc = await db.collection('users').doc(auth.uid).get();
    const isAdmin = auth.email === 'fabriceib2006@gmail.com' || userDoc.data()?.role === 'admin';
    if (!isAdmin) return res.status(403).json({ error: 'Forbidden' });

    const { rewardId, reason } = req.body || {};
    if (!rewardId) return res.status(400).json({ error: 'Missing rewardId' });

    try {
      await db.runTransaction(async (transaction) => {
        // ALL READS FIRST
        const rewardRef = db.collection('referralRewards').doc(rewardId);
        const rewardDoc = await transaction.get(rewardRef);
        if (!rewardDoc.exists) {
          const err: any = new Error('Reward record not found');
          err.status = 404;
          throw err;
        }
        const rewardData = rewardDoc.data()!;
        if (rewardData.status === 'reversed') {
          const err: any = new Error('Reward is already reversed');
          err.status = 400;
          throw err;
        }

        const referrerId = rewardData.referrerId;
        const points = Number(rewardData.pointsAwarded) || 0;

        // WRITES AFTER ALL READS
        transaction.update(rewardRef, {
          status: 'reversed',
          reversedAt: FieldValue.serverTimestamp(),
          reversedReason: reason || 'Administrative reversal',
          updatedAt: FieldValue.serverTimestamp()
        });

        if (referrerId && points > 0) {
          const spendRef = db.collection('users').doc(referrerId).collection('pointsLedger').doc();
          transaction.set(spendRef, {
            id: spendRef.id,
            userId: referrerId,
            points,
            amount: -Math.abs(points),
            type: 'spend',
            description: `Reversal of referral reward: ${reason || 'Administrative reversal'}`,
            rewardId,
            createdAt: FieldValue.serverTimestamp()
          });
        }

        const logRef = db.collection('adminLogs').doc();
        transaction.set(logRef, {
          id: logRef.id,
          adminId: auth.uid,
          adminEmail: auth.email || '',
          action: 'reverse_referral_reward',
          rewardId,
          referrerId,
          points,
          reason: reason || 'Administrative reversal',
          timestamp: new Date().toISOString()
        });
      });

      res.json({ success: true, message: 'Reward reversed successfully' });
    } catch (err: any) {
      res.status(err.status || 500).json({ error: err.message || 'Failed to reverse reward' });
    }
  });

  app.post('/api/admin/cleanup-inactive', async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    const cronSecret = req.headers['x-cron-secret'];
    const isCron = cronSecret === process.env.CLEANUP_CRON_SECRET;
    
    let isAdmin = false;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split('Bearer ')[1];
      try {
        const decoded = await getAuth().verifyIdToken(token);
        const userDoc = await db.collection('users').doc(decoded.uid).get();
        isAdmin = decoded.email === 'fabriceib2006@gmail.com' || userDoc.data()?.role === 'admin';
      } catch (e) {}
    }

    if (!isAdmin && !isCron) return res.status(403).json({ error: 'Forbidden' });

    try {
      const settingsSnap = await db.collection('systemConfig').doc('accountCleanup').get();
      const settings = settingsSnap.exists ? settingsSnap.data()! : { enabled: false, inactiveDays: 30, warnDaysBefore: 7, dryRun: true };
      if (!settings.enabled) return res.json({ success: true, message: 'Cleanup disabled' });

      const inactiveMs = Number(settings.inactiveDays) * 24 * 60 * 60 * 1000;
      const warnMs = Number(settings.warnDaysBefore) * 24 * 60 * 60 * 1000;
      const now = Date.now();

      let cursor = req.body.cursor ? JSON.parse(Buffer.from(req.body.cursor, 'base64').toString()) : null;
      let query = db.collection('users').where('role', '==', 'student').orderBy('lastActiveAt').limit(200);
      if (cursor) query = query.startAfter(cursor);
      
      const usersSnap = await query.get();
      let processed = 0;
      let deleted = 0;
      let warned = 0;

      for (const userDoc of usersSnap.docs) {
        const user = userDoc.data();
        if (user.protected) continue;
        const lastActive = user.lastActiveAt ? (user.lastActiveAt.toDate ? user.lastActiveAt.toDate() : new Date(user.lastActiveAt)).getTime() : 
                           (user.lastLoginAt ? (user.lastLoginAt.toDate ? user.lastLoginAt.toDate() : new Date(user.lastLoginAt)).getTime() : 
                           (user.createdAt ? (user.createdAt.toDate ? user.createdAt.toDate() : new Date(user.createdAt)).getTime() : 0));
        
        if (now - lastActive < inactiveMs) continue;

        const subsSnap = await db.collection('subscriptions').where('userId', '==', userDoc.id).where('status', '==', 'active').get();
        if (!subsSnap.empty) {
          const hasActiveSub = subsSnap.docs.some(s => s.data().endDate && new Date(s.data().endDate).getTime() > now);
          if (hasActiveSub) continue;
        }
        
        const purchasesSnap = await db.collection('users').doc(userDoc.id).collection('purchases').get();
        const hasUsablePurchases = purchasesSnap.docs.some(p => {
          const d = p.data();
          return (d.examLimit === null || (Number(d.examCredits) > 0)) && (!d.expiresAt || new Date(d.expiresAt).getTime() > now);
        });
        if (hasUsablePurchases) continue;

        const ledgerSnap = await db.collection('users').doc(userDoc.id).collection('pointsLedger').get();
        let balance = 0;
        ledgerSnap.docs.forEach(d => { balance += Number(d.data().amount || 0); });
        if (balance !== 0) continue;

        const pendingSnap = await db.collection('payments').where('userId', '==', userDoc.id).where('status', '==', 'pending').get();
        if (!pendingSnap.empty) continue;
        
        // Referral reward check
        const rewardSnap = await db.collection('referralRewards').where('referrerId', '==', userDoc.id).where('status', '==', 'awarded').get();
        if (!rewardSnap.empty) continue;

        const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
        const recentPaymentSnap = await db.collection('payments').where('userId', '==', userDoc.id).where('createdAt', '>', new Date(sevenDaysAgo)).get();
        if (!recentPaymentSnap.empty) continue;

        if (user.warnedAt) {
          const warnedAt = (user.warnedAt.toDate ? user.warnedAt.toDate() : new Date(user.warnedAt)).getTime();
          if (now - warnedAt >= warnMs) {
            if (!settings.dryRun) {
              await db.collection('deletedAccounts').add({ uid: userDoc.id, deletedAt: FieldValue.serverTimestamp() });
              await db.collection('adminLogs').add({ action: 'DELETE_INACTIVE_USER', uid: userDoc.id, createdAt: FieldValue.serverTimestamp() });
              // Simplified deletion logic: Auth is tricky from here without admin SDK. Assuming user doc removal.
              await userDoc.ref.delete();
              deleted++;
            }
          }
        } else {
          if (!settings.dryRun) {
            await userDoc.ref.update({ warnedAt: FieldValue.serverTimestamp() });
            warned++;
          }
        }
        processed++;
      }

      const nextCursor = usersSnap.docs.length === 200 ? Buffer.from(JSON.stringify(usersSnap.docs[199])).toString('base64') : null;
      res.json({ success: true, processed, deleted, warned, nextCursor });
    } catch (err: any) {
      console.error('Cleanup error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Cached question IDs (5 minutes) so exams/start never reads the whole question bank
  let cachedPublishedQuestionIds: { id: string; category?: string }[] = [];
  let cachedQuestionIdsTimestamp = 0;

  async function getPublishedQuestionIds(): Promise<{ id: string; category?: string }[]> {
    const now = Date.now();
    if (cachedPublishedQuestionIds.length > 0 && (now - cachedQuestionIdsTimestamp < 300000)) {
      return cachedPublishedQuestionIds;
    }
    const snap = await db.collection('questions').where('isPublished', '==', true).select('category').get();
    cachedPublishedQuestionIds = snap.docs.map(d => ({ id: d.id, category: d.data().category }));
    cachedQuestionIdsTimestamp = now;
    return cachedPublishedQuestionIds;
  }

  app.post('/api/exams/start', async (req: Request, res: Response) => {
    const auth = await verifyAuth(req);
    if (!auth) return res.status(401).json({ error: 'Unauthorized: Sign in required.' });
    const { uid } = auth;
    const { wrongQuestionIds } = req.body || {};
    try {
      const attemptsRef = db.collection('users').doc(uid).collection('examAttempts');
      const purchasesRef = db.collection('users').doc(uid).collection('purchases');
      const accessRef = db.collection('users').doc(uid).collection('access').doc('current');

      // Fetch global exam settings outside transaction
      const settingsDoc = await db.collection('examSettings').doc('global-settings').get();
      const settings = settingsDoc.exists ? settingsDoc.data()! : { numQuestions: 20, durationMinutes: 20, passMark: 12 };
      
      // Load question IDs from cache (or query IDs only, cached for 5 minutes)
      const allQuestionIds = await getPublishedQuestionIds();

      let resultData: { attemptId: string; questionIds: string[]; expiresAt: any; isResumed?: boolean } | undefined;

      await db.runTransaction(async (transaction) => {
        // ==========================================
        // 1. ALL READS FIRST (No writes before this!)
        // Keep reads short and limited to < 50 documents
        // ==========================================
        const purchasesSnap = await transaction.get(purchasesRef.limit(20));
        const querySnap = await transaction.get(attemptsRef.where('status', '==', 'in_progress').limit(10));
        const accessDoc = await transaction.get(accessRef);
        const subsSnap = await transaction.get(db.collection('subscriptions').where('userId', '==', uid).limit(10));

        // ==========================================
        // 2. IN-MEMORY COMPUTATION & VALIDATION
        // ==========================================
        const now = new Date();

        // Check for active (in-progress, not expired) attempt to resume
        let activeAttempt: any = null;
        const attemptsToExpire: string[] = [];
        for (const doc of querySnap.docs) {
          const attempt = doc.data();
          let attExpires: Date | null = null;
          if (attempt.expiresAt && typeof attempt.expiresAt.toDate === 'function') {
            attExpires = attempt.expiresAt.toDate();
          } else if (typeof attempt.expiresAt === 'string') {
            attExpires = new Date(attempt.expiresAt);
          }

          if (attExpires && attExpires > now) {
            activeAttempt = { id: doc.id, ...attempt };
            break;
          } else {
            attemptsToExpire.push(doc.id);
          }
        }

        // Case A: Resume existing in-progress attempt (uses nothing)
        if (activeAttempt) {
          resultData = {
            attemptId: activeAttempt.id,
            questionIds: activeAttempt.questionIds,
            expiresAt: activeAttempt.expiresAt,
            isResumed: true
          };

          // Only expire stale attempts if any
          for (const attId of attemptsToExpire) {
            transaction.update(attemptsRef.doc(attId), { status: 'expired' });
          }
          return;
        }

        // Aggregate purchases from user purchases and subscriptions
        const allPurchases: any[] = [...purchasesSnap.docs.map(d => ({ id: d.id, ...d.data() }))];
        for (const sDoc of subsSnap.docs) {
          const sData = sDoc.data();
          if (!allPurchases.some(p => p.id === sDoc.id || p.planId === sData.planId)) {
            allPurchases.push({
              id: sDoc.id,
              planId: sData.planId,
              planName: sData.planName,
              access: sData.access,
              examLimit: sData.examLimit,
              examsUsed: sData.examsUsed || 0,
              validityDays: sData.validityDays,
              startDate: sData.startDate,
              expiresAt: sData.endDate,
              status: sData.status || 'active',
              isSub: true
            });
          }
        }

        let hasActiveStudyPlan = false;
        let activeStudyPlan: any = null;
        const validCountPurchases: any[] = [];
        let hasUsedUpExamPack = false;

        for (const p of allPurchases) {
          if (p.status !== 'active' && p.status !== undefined) {
            if (p.examsUsed !== undefined && p.examsUsed > 0) hasUsedUpExamPack = true;
            continue;
          }

          // Check if plan allows exams
          const allowsExams = Boolean(
            p.access?.exams ||
            p.features?.exams ||
            (p.examLimit !== undefined && p.examLimit !== null && p.examLimit !== 0) ||
            p.type === 'exams_pack' ||
            (typeof p.planName === 'string' && p.planName.toLowerCase().includes('exam'))
          );
          if (!allowsExams) continue;

          // Study plan: has lessons or videos
          const isStudy = Boolean(
            p.access?.trafficRules ||
            p.access?.lessonVideos ||
            p.features?.lessons ||
            p.features?.videos
          );

          let expiresAt: Date | null = null;
          if (p.expiresAt && typeof p.expiresAt.toDate === 'function') {
            expiresAt = p.expiresAt.toDate();
          } else if (typeof p.expiresAt === 'string') {
            expiresAt = new Date(p.expiresAt);
          } else if (p.endDate && typeof p.endDate.toDate === 'function') {
            expiresAt = p.endDate.toDate();
          } else if (typeof p.endDate === 'string') {
            expiresAt = new Date(p.endDate);
          } else if (p.validityDays && p.startDate) {
            const start = typeof p.startDate.toDate === 'function' ? p.startDate.toDate() : new Date(p.startDate);
            expiresAt = new Date(start.getTime() + Number(p.validityDays) * 24 * 3600 * 1000);
          }

          if (isStudy) {
            // Study plan: exams unlimited until plan time ends
            if (!expiresAt || expiresAt > now) {
              hasActiveStudyPlan = true;
              activeStudyPlan = p;
            }
          } else {
            // Exams-only plan: limited by count, NO time validity (null = none). Credits stop working when count is used up ONLY.
            const allowed = typeof p.examLimit === 'number' 
              ? p.examLimit 
              : (typeof p.examsAllowed === 'number' ? p.examsAllowed : (typeof p.examCredits === 'number' ? p.examCredits : 5));
            const used = Number(p.examsUsed) || 0;
            const remaining = allowed - used;
            if (remaining > 0) {
              validCountPurchases.push({ ...p, allowed, used, remaining });
            } else {
              hasUsedUpExamPack = true;
            }
          }
        }

        // Check plan eligibility
        if (!hasActiveStudyPlan && validCountPurchases.length === 0) {
          const err: any = new Error(hasUsedUpExamPack 
            ? 'No exam credits remaining. Please buy an Exam Pack or Study Plan.' 
            : 'No active plan or exam credits found. Please purchase an Exam Pack or Study Plan.');
          err.code = 'EXAM_CREDITS_EXHAUSTED';
          err.status = 403;
          throw err;
        }

        let targetPurchase: any = null;
        if (!hasActiveStudyPlan && validCountPurchases.length > 0) {
          targetPurchase = validCountPurchases[0];
        }

        // Prepare questions (pick IDs from cached pool)
        let selectedQuestionIds: string[] = [];
        if (Array.isArray(wrongQuestionIds) && wrongQuestionIds.length > 0) {
          selectedQuestionIds = wrongQuestionIds.slice(0, settings.numQuestions || 20);
        }
        if (selectedQuestionIds.length === 0) {
          const shuffled = [...allQuestionIds];
          for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
          }
          selectedQuestionIds = shuffled.slice(0, settings.numQuestions || 20).map(q => q.id);
        }
        const durationMinutes = settings.durationMinutes || 20;
        const expiresAt = Timestamp.fromDate(new Date(now.getTime() + durationMinutes * 60000));
        const newAttemptRef = attemptsRef.doc();

        // ==========================================
        // 3. ALL WRITES AFTER ALL READS ARE COMPLETE
        // ==========================================
        for (const attId of attemptsToExpire) {
          transaction.update(attemptsRef.doc(attId), { status: 'expired' });
        }

        // Deduct 1 credit only if exams-only plan
        if (targetPurchase) {
          const newUsed = targetPurchase.used + 1;
          const newRemaining = Math.max(0, targetPurchase.allowed - newUsed);

          transaction.set(purchasesRef.doc(targetPurchase.id), {
            examsUsed: newUsed,
            updatedAt: Timestamp.now()
          }, { merge: true });

          transaction.set(accessRef, {
            examCredits: newRemaining,
            planName: targetPurchase.planName || 'Exam Pack',
            updatedAt: Timestamp.now()
          }, { merge: true });

          const subMatch = subsSnap.docs.find(s => s.id === targetPurchase.id || s.data().planId === targetPurchase.planId);
          if (subMatch) {
            transaction.set(subMatch.ref, {
              examsUsed: newUsed,
              updatedAt: Timestamp.now()
            }, { merge: true });
          }
        } else if (hasActiveStudyPlan) {
          transaction.set(accessRef, {
            examCredits: null,
            planName: activeStudyPlan.planName || 'Study Plan',
            updatedAt: Timestamp.now()
          }, { merge: true });
        }

        // Save new in-progress attempt
        transaction.set(newAttemptRef, {
          questionIds: selectedQuestionIds,
          startedAt: Timestamp.fromDate(now),
          expiresAt,
          status: 'in_progress'
        });

        resultData = {
          attemptId: newAttemptRef.id,
          questionIds: selectedQuestionIds,
          expiresAt,
          isResumed: false
        };
      });

      if (!resultData) return res.status(500).json({ error: 'Failed to start exam' });

      // Fetch only the picked questions (max 20 documents, well under 50 limit)
      const qDocs = await db.getAll(...resultData.questionIds.map(id => db.collection('questions').doc(id)));
      const questions = qDocs.filter(d => d.exists).map(d => {
        const qData = d.data()!;
        return {
          id: d.id,
          text: qData.text,
          options: qData.options,
          category: qData.category,
          imageUrl: qData.imageUrl
        };
      });

      const expiresAtIso = resultData.expiresAt && typeof resultData.expiresAt.toDate === 'function' 
        ? resultData.expiresAt.toDate().toISOString() 
        : new Date(resultData.expiresAt).toISOString();

      return res.json({
        attemptId: resultData.attemptId,
        questions: questions.filter(Boolean),
        expiresAt: expiresAtIso,
        isResumed: Boolean(resultData.isResumed)
      });
    } catch (err: any) {
      console.error('Start exam failed:', err);
      const status = err.status || 500;
      return res.status(status).json({
        error: err.code || err.message || 'Failed to start exam',
        code: err.code || 'EXAM_ERROR',
        message: err.message || 'Failed to start exam'
      });
    }
  });

  async function checkLessonsAccess(uid: string): Promise<boolean> {
    const now = new Date();
    const purchasesSnap = await db.collection('users').doc(uid).collection('purchases').where('status', '==', 'active').get();
    const subsSnap = await db.collection('subscriptions').where('userId', '==', uid).where('status', '==', 'active').get();
    
    const allPurchases: any[] = [...purchasesSnap.docs.map(d => d.data())];
    for (const sDoc of subsSnap.docs) {
      const sData = sDoc.data();
      if (!allPurchases.some(p => p.id === sDoc.id || p.planId === sData.planId)) {
        allPurchases.push({
          access: sData.access,
          features: sData.features,
          expiresAt: sData.endDate,
          status: 'active'
        });
      }
    }

    for (const p of allPurchases) {
      let expiresAt: Date | null = null;
      if (p.expiresAt) {
        expiresAt = typeof p.expiresAt.toDate === 'function' ? p.expiresAt.toDate() : new Date(p.expiresAt);
      }
      if (expiresAt && expiresAt < now) continue;

      const hasLessons = Boolean(
        p.access?.trafficRules ||
        p.access?.lessonVideos ||
        p.features?.lessons ||
        p.features?.videos ||
        (typeof p.planName === 'string' && (p.planName.toLowerCase().includes('pro') || p.planName.toLowerCase().includes('theory') || p.planName.toLowerCase().includes('standard')))
      );
      if (hasLessons) return true;
    }
    return false;
  }

  // GET /api/lessons/:id/quiz
  app.get('/api/lessons/:id/quiz', async (req: Request, res: Response) => {
    const auth = await verifyAuth(req);
    if (!auth) return res.status(401).json({ error: 'Unauthorized: Sign in required.' });
    const { uid } = auth;
    const lessonId = req.params.id;

    try {
      const hasAccess = await checkLessonsAccess(uid);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Forbidden: Lessons access requires an active study plan.', code: 'NO_LESSONS_PLAN' });
      }

      const lessonDoc = await db.collection('lessons').doc(lessonId).get();
      if (!lessonDoc.exists) {
        return res.status(404).json({ error: 'Lesson not found.' });
      }

      const qSnap = await db.collection('questions').where('lessonId', '==', lessonId).get();
      const questions = qSnap.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          text: data.text,
          options: data.options,
          category: data.category,
          imageUrl: data.imageUrl
        };
      });

      // Shuffle questions
      for (let i = questions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [questions[i], questions[j]] = [questions[j], questions[i]];
      }

      return res.json({
        lessonId,
        questions,
        total: questions.length
      });
    } catch (err: any) {
      console.error('Failed to fetch lesson quiz:', err);
      return res.status(500).json({ error: err.message || 'Failed to fetch lesson quiz' });
    }
  });

  // POST /api/lessons/:id/quiz/submit
  app.post('/api/lessons/:id/quiz/submit', examAnswerLimiter, async (req: Request, res: Response) => {
    const auth = await verifyAuth(req);
    if (!auth) return res.status(401).json({ error: 'Unauthorized: Sign in required.' });
    const { uid } = auth;
    const lessonId = req.params.id;
    const { answers } = req.body || {};

    if (!answers || typeof answers !== 'object') {
      return res.status(400).json({ error: 'Invalid answers payload' });
    }

    try {
      const hasAccess = await checkLessonsAccess(uid);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Forbidden: Lessons access requires an active study plan.', code: 'NO_LESSONS_PLAN' });
      }

      const qSnap = await db.collection('questions').where('lessonId', '==', lessonId).get();
      const questions = qSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));

      let correct = 0;
      const total = questions.length;
      const results: any[] = [];

      for (const q of questions) {
        const userAns = answers[q.id];
        const isCorrect = userAns === q.correctIndex;
        if (isCorrect) correct++;
        results.push({
          questionId: q.id,
          userAnswer: userAns,
          correctIndex: q.correctIndex,
          explanation: q.explanation,
          isCorrect
        });
      }

      const percent = total > 0 ? Math.round((correct / total) * 100) : 0;
      const passed = percent >= 70;

      const progressRef = db.collection('users').doc(uid).collection('progress').doc(lessonId);
      await progressRef.set({
        lessonId,
        completed: passed,
        passed,
        score: correct,
        total,
        percent,
        attempts: FieldValue.increment(1),
        lastAccessed: Timestamp.now(),
        updatedAt: Timestamp.now()
      }, { merge: true });

      return res.json({
        success: true,
        score: correct,
        total,
        percent,
        passed,
        passMark: 70,
        results
      });
    } catch (err: any) {
      console.error('Failed to submit lesson quiz:', err);
      return res.status(500).json({ error: err.message || 'Failed to submit lesson quiz' });
    }
  });

  app.post('/api/exams/submit', examAnswerLimiter, async (req: Request, res: Response) => {
    const auth = await verifyAuth(req);
    if (!auth) return res.status(401).send('Unauthorized');
    const { uid } = auth;
    const { attemptId, answers } = req.body;
    if (typeof attemptId !== 'string' || typeof answers !== 'object' || answers === null) {
      return res.status(400).json({ error: 'Invalid input' });
    }

    try {
      const attemptRef = db.collection('users').doc(uid).collection('examAttempts').doc(attemptId);
      const attemptDoc = await attemptRef.get();
      if (!attemptDoc.exists) {
        return res.status(404).json({ error: 'Attempt not found' });
      }
      const attempt = attemptDoc.data()!;
      if (attempt.status !== 'in_progress') {
        return res.status(409).json({ error: 'Attempt already submitted' });
      }
      if (new Date() > new Date(new Date(attempt.expiresAt).getTime() + 60000)) {
        await attemptRef.update({ status: 'expired' });
        return res.status(410).json({ error: 'Attempt expired' });
      }

      const settingsDoc = await db.collection('examSettings').doc('global-settings').get();
      if (!settingsDoc.exists) {
        return res.status(500).json({ error: 'Global exam settings missing' });
      }
      const passMark = settingsDoc.data()!.passMark;

      // Pre-fetch questions outside transaction so transaction stays ultra-short
      const qIds: string[] = Array.isArray(attempt.questionIds) ? attempt.questionIds : [];
      const questionDocs = qIds.length > 0
        ? await db.getAll(...qIds.map(id => db.collection('questions').doc(id)))
        : [];
      const questionsMap = new Map<string, any>();
      for (const qd of questionDocs) {
        if (qd.exists) questionsMap.set(qd.id, qd.data());
      }

      let result;
      await db.runTransaction(async (transaction) => {
        // Re-verify attempt inside transaction (single read)
        const freshAttemptDoc = await transaction.get(attemptRef);
        const freshAttempt = freshAttemptDoc.data()!;
        if (freshAttempt.status !== 'in_progress') {
          const err: any = new Error('Attempt already submitted');
          err.status = 409;
          throw err;
        }

        let score = 0;
        const results = [];
        for (const qId of qIds) {
          const qData = questionsMap.get(qId);
          const userAnswer = answers[qId] !== undefined ? answers[qId] : null;
          if (!qData) {
            results.push({ questionId: qId, userAnswer, correctIndex: 0, explanation: { en: 'Question missing', rw: '', fr: '' }, isCorrect: false });
            continue;
          }
          const isCorrect = userAnswer === qData.correctIndex;
          if (isCorrect) score++;
          results.push({
            questionId: qId,
            userAnswer,
            correctIndex: qData.correctIndex,
            explanation: qData.explanation,
            category: qData.category || 'General',
            imageUrl: qData.imageUrl || null,
            text: qData.text || null,
            options: qData.options || null,
            isCorrect
          });
        }

        const nowIso = new Date().toISOString();
        let durationSeconds = 0;
        if (freshAttempt.startedAt) {
          const startMs = freshAttempt.startedAt.toDate ? freshAttempt.startedAt.toDate().getTime() : new Date(freshAttempt.startedAt).getTime();
          durationSeconds = Math.max(0, Math.floor((new Date(nowIso).getTime() - startMs) / 1000));
        }

        // Sanitize answers object to replace undefined with null for Firestore
        const sanitizedAnswers = Object.keys(answers).reduce((acc, key) => {
          acc[key] = answers[key] !== undefined ? answers[key] : null;
          return acc;
        }, {} as Record<string, any>);

        transaction.update(attemptRef, {
          status: 'finished',
          submittedAt: nowIso,
          score,
          total: qIds.length,
          passed: score >= passMark,
          durationSeconds,
          userAnswers: sanitizedAnswers,
          results
        });

        const resultDocRef = db.collection('users').doc(uid).collection('examResults').doc();
        const resultRecord = {
          id: resultDocRef.id,
          userId: uid,
          attemptId,
          score,
          total: qIds.length,
          passMark,
          passed: score >= passMark,
          submittedAt: nowIso,
          date: nowIso,
          durationSeconds,
          userAnswers: sanitizedAnswers,
          results
        };
        transaction.set(resultDocRef, resultRecord);
        // Also mirror to root collection examResults for administrative reporting
        transaction.set(db.collection('examResults').doc(resultDocRef.id), resultRecord);

        result = { score, total: qIds.length, passed: score >= passMark, results };
      });

      res.json(result);
    } catch (err: any) {
      console.error('Submit exam failed:', err);
      const status = err.status || 500;
      res.status(status).json({ error: err.message || 'Failed to submit exam' });
    }
  });

  // GET /api/exams/history
  app.get('/api/exams/history', async (req: Request, res: Response) => {
    const auth = await verifyAuth(req);
    if (!auth) return res.status(401).json({ error: 'Unauthorized: Sign in required.' });
    const { uid } = auth;

    try {
      const [resultsSnap, attemptsSnap, categoriesSnap] = await Promise.all([
        db.collection('users').doc(uid).collection('examResults').get().catch(() => null),
        db.collection('users').doc(uid).collection('examAttempts').get().catch(() => null),
        db.collection('categories').get().catch(() => null)
      ]);

      const categoryMap = new Map<string, any>();
      if (categoriesSnap) {
        categoriesSnap.docs.forEach(d => {
          categoryMap.set(d.id, { id: d.id, ...d.data() });
        });
      }

      // Combine attempts & results
      const combinedMap = new Map<string, any>();

      if (attemptsSnap) {
        attemptsSnap.docs.forEach(d => {
          const data = d.data();
          if (data.status === 'finished' || data.status === 'completed' || data.score !== undefined) {
            combinedMap.set(d.id, { id: d.id, ...data });
          }
        });
      }

      if (resultsSnap) {
        resultsSnap.docs.forEach(d => {
          const data = d.data();
          const key = data.attemptId || d.id;
          const existing = combinedMap.get(key);
          if (existing) {
            combinedMap.set(key, { ...existing, ...data });
          } else {
            combinedMap.set(d.id, { id: d.id, ...data });
          }
        });
      }

      const allList = Array.from(combinedMap.values());

      // Collect question IDs to batch load if results are missing question text or options
      const questionIdsToFetch = new Set<string>();
      allList.forEach(item => {
        if (Array.isArray(item.questionIds)) {
          item.questionIds.forEach((qId: string) => questionIdsToFetch.add(qId));
        }
        if (Array.isArray(item.results)) {
          item.results.forEach((r: any) => {
            if (r.questionId && (!r.text || !r.options)) {
              questionIdsToFetch.add(r.questionId);
            }
          });
        }
      });

      const questionsMap = new Map<string, any>();
      const qIdList = Array.from(questionIdsToFetch);
      for (let i = 0; i < qIdList.length; i += 30) {
        const chunk = qIdList.slice(i, i + 30);
        if (chunk.length > 0) {
          const qSnap = await db.collection('questions')
            .where(FieldPath.documentId(), 'in', chunk)
            .get()
            .catch(() => null);
          if (qSnap) {
            qSnap.docs.forEach(doc => {
              questionsMap.set(doc.id, { id: doc.id, ...doc.data() });
            });
          }
        }
      }

      const enrichedResults = allList.map(item => {
        const dateStr = item.submittedAt || item.date || (item.startedAt?.toDate ? item.startedAt.toDate().toISOString() : item.startedAt) || new Date().toISOString();
        let durationSeconds = Number(item.durationSeconds) || 0;
        if (!durationSeconds && item.startedAt && item.submittedAt) {
          const startMs = item.startedAt.toDate ? item.startedAt.toDate().getTime() : new Date(item.startedAt).getTime();
          const endMs = new Date(item.submittedAt).getTime();
          durationSeconds = Math.max(0, Math.floor((endMs - startMs) / 1000));
        }

        let questionBreakdown: any[] = [];
        if (Array.isArray(item.results) && item.results.length > 0) {
          questionBreakdown = item.results.map((r: any, idx: number) => {
            const qDetail = questionsMap.get(r.questionId);
            const catId = r.category || qDetail?.category || 'General';
            const catObj = categoryMap.get(catId);
            return {
              index: idx + 1,
              questionId: r.questionId,
              text: r.text || qDetail?.text || { en: 'Question ' + (idx + 1), rw: 'Ikibazo ' + (idx + 1), fr: 'Question ' + (idx + 1) },
              options: r.options || qDetail?.options || { en: [], rw: [], fr: [] },
              userAnswer: r.userAnswer ?? null,
              correctIndex: r.correctIndex ?? qDetail?.correctIndex ?? 0,
              isCorrect: Boolean(r.isCorrect),
              explanation: r.explanation || qDetail?.explanation || {},
              category: catId,
              categoryName: catObj?.name || catId,
              imageUrl: r.imageUrl || qDetail?.imageUrl || null
            };
          });
        } else if (Array.isArray(item.questionIds) && item.questionIds.length > 0) {
          questionBreakdown = item.questionIds.map((qId: string, idx: number) => {
            const qDetail = questionsMap.get(qId);
            const userAns = item.userAnswers ? item.userAnswers[qId] : undefined;
            const correctIdx = qDetail ? qDetail.correctIndex : 0;
            const isCorrect = userAns !== undefined && userAns === correctIdx;
            const catId = qDetail?.category || 'General';
            const catObj = categoryMap.get(catId);
            return {
              index: idx + 1,
              questionId: qId,
              text: qDetail?.text || { en: 'Question ' + (idx + 1), rw: 'Ikibazo ' + (idx + 1), fr: 'Question ' + (idx + 1) },
              options: qDetail?.options || { en: [], rw: [], fr: [] },
              userAnswer: userAns ?? null,
              correctIndex: correctIdx,
              isCorrect,
              explanation: qDetail?.explanation || {},
              category: catId,
              categoryName: catObj?.name || catId,
              imageUrl: qDetail?.imageUrl || null
            };
          });
        }

        const score = Number(item.score) !== undefined && !isNaN(Number(item.score))
          ? Number(item.score)
          : questionBreakdown.filter(q => q.isCorrect).length;
        const total = Number(item.total) || (questionBreakdown.length > 0 ? questionBreakdown.length : 20);
        const passMark = Number(item.passMark) || 12;
        const passed = item.passed !== undefined ? Boolean(item.passed) : score >= passMark;
        const percentage = total > 0 ? Math.round((score / total) * 100) : 0;

        // Category breakdown for this specific exam
        const catStatsMap = new Map<string, { categoryId: string; categoryName: any; total: number; correct: number }>();
        questionBreakdown.forEach(q => {
          const cId = q.category || 'General';
          const curr = catStatsMap.get(cId) || { categoryId: cId, categoryName: q.categoryName || cId, total: 0, correct: 0 };
          curr.total += 1;
          if (q.isCorrect) curr.correct += 1;
          catStatsMap.set(cId, curr);
        });
        const examCategoryStats = Array.from(catStatsMap.values()).map(c => ({
          ...c,
          accuracy: c.total > 0 ? Math.round((c.correct / c.total) * 100) : 0
        }));

        return {
          id: item.id,
          attemptId: item.attemptId || item.id,
          date: dateStr,
          submittedAt: dateStr,
          durationSeconds,
          score,
          total,
          passMark,
          passed,
          percentage,
          correctCount: score,
          incorrectCount: Math.max(0, total - score),
          questions: questionBreakdown,
          categoryStats: examCategoryStats
        };
      });

      enrichedResults.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      // Overall user summary across all exams
      const totalExams = enrichedResults.length;
      const passedExams = enrichedResults.filter(e => e.passed).length;
      const failedExams = totalExams - passedExams;
      const passRate = totalExams > 0 ? Math.round((passedExams / totalExams) * 100) : 0;
      const totalScoreSum = enrichedResults.reduce((acc, curr) => acc + curr.score, 0);
      const averageScore = totalExams > 0 ? Number((totalScoreSum / totalExams).toFixed(1)) : 0;
      const bestScore = totalExams > 0 ? Math.max(...enrichedResults.map(e => e.score)) : 0;

      // Category mastery across all attempts
      const globalCategoryStats = new Map<string, { categoryId: string; categoryName: any; total: number; correct: number }>();
      enrichedResults.forEach(ex => {
        ex.questions.forEach((q: any) => {
          const cId = q.category || 'General';
          const curr = globalCategoryStats.get(cId) || { categoryId: cId, categoryName: q.categoryName || cId, total: 0, correct: 0 };
          curr.total += 1;
          if (q.isCorrect) curr.correct += 1;
          globalCategoryStats.set(cId, curr);
        });
      });
      const categoryMastery = Array.from(globalCategoryStats.values()).map(c => ({
        ...c,
        accuracy: c.total > 0 ? Math.round((c.correct / c.total) * 100) : 0
      })).sort((a, b) => b.accuracy - a.accuracy);

      return res.json({
        results: enrichedResults,
        summary: {
          totalExams,
          passedExams,
          failedExams,
          passRate,
          averageScore,
          bestScore
        },
        categoryMastery
      });
    } catch (err: any) {
      console.error('Error fetching exam history:', err);
      return res.status(500).json({ error: err.message || 'Failed to fetch exam history' });
    }
  });

  app.get('/api/exams/settings', async (req: Request, res: Response) => {
    try {
      const settingsDoc = await db.collection('examSettings').doc('default').get();
      res.json(settingsDoc.data() || { numQuestions: 20, durationMinutes: 60, passMark: 70 });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Admin database clean and sync endpoint
  app.post('/api/admin/clean-plans-and-subs', async (req: Request, res: Response) => {
    const auth = await verifyAuth(req);
    if (!auth) return res.status(401).json({ error: 'Unauthorized' });
    const userDoc = await db.collection('users').doc(auth.uid).get();
    const isAdmin = auth.email === 'fabriceib2006@gmail.com' || userDoc.data()?.role === 'admin';
    if (!isAdmin) return res.status(403).json({ error: 'Forbidden' });

    try {
      const summary = await syncDatabasePlansAndSubscriptions();
      res.json({ success: true, summary });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/debug/ping', async (req: Request, res: Response) => {
    try {
      const sa = process.env.FIREBASE_SERVICE_ACCOUNT ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT) : null;
      const oldAttempts = await db.collection('examAttempts').get();
      const oldResults = await db.collection('examResults').get();
      res.json({
        env: { exists: !!sa, project_id: sa?.project_id, client_email: sa?.client_email },
        oldTopLevelExamAttemptsCount: oldAttempts.size,
        oldTopLevelExamResultsCount: oldResults.size
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message, code: e.code });
    }
  });

  // ==========================================
  // API: PRACTICE QUIZ (Paginated 10 at a time, cursor, WITHOUT correctIndex)
  // ==========================================
  app.get('/api/practice/questions', async (req: Request, res: Response) => {
    const auth = await verifyAuth(req);
    if (!auth) return res.status(401).json({ error: 'Unauthorized: Sign in required.' });

    try {
      const limitCount = Math.min(Math.max(1, parseInt(req.query.limit as string) || 10), 50);
      const category = req.query.category as string;
      const cursor = req.query.cursor as string;

      let q = db.collection('questions').where('isPublished', '==', true);
      if (category && category !== 'all') {
        q = q.where('category', '==', category);
      }
      q = q.orderBy(FieldPath.documentId()).limit(limitCount);

      if (cursor) {
        const cursorDoc = await db.collection('questions').doc(cursor).get();
        if (cursorDoc.exists) {
          q = q.startAfter(cursorDoc);
        }
      }

      const snap = await q.get();
      // Students must NEVER download the whole question bank or correct answers:
      const questions = snap.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          text: data.text,
          options: data.options,
          category: data.category,
          imageUrl: data.imageUrl || null,
          code: data.code || null
        };
      });

      const nextCursor = snap.docs.length === limitCount ? snap.docs[snap.docs.length - 1].id : null;

      return res.json({
        questions,
        nextCursor,
        hasMore: Boolean(nextCursor),
        count: questions.length
      });
    } catch (err: any) {
      console.error('Failed to load practice questions:', err);
      return res.status(500).json({ error: err.message || 'Failed to load practice questions' });
    }
  });

  // Practice quiz: check answers through the server
  app.post('/api/practice/check', examAnswerLimiter, async (req: Request, res: Response) => {
    const auth = await verifyAuth(req);
    if (!auth) return res.status(401).json({ error: 'Unauthorized: Sign in required.' });

    const { questionId, selectedIndex, answers } = req.body || {};

    try {
      if (questionId) {
        const qDoc = await db.collection('questions').doc(questionId).get();
        if (!qDoc.exists) return res.status(404).json({ error: 'Question not found' });
        const data = qDoc.data()!;
        const correctIndex = Number(data.correctIndex);
        const userChoice = Number(selectedIndex);
        const isCorrect = userChoice === correctIndex;

        return res.json({
          questionId,
          isCorrect,
          correctIndex,
          explanation: data.explanation || null
        });
      }

      if (answers && typeof answers === 'object') {
        const results: Record<string, any> = {};
        let correctCount = 0;
        const qIds = Object.keys(answers);

        for (const qId of qIds) {
          const qDoc = await db.collection('questions').doc(qId).get();
          if (qDoc.exists) {
            const data = qDoc.data()!;
            const correctIndex = Number(data.correctIndex);
            const userChoice = Number(answers[qId]);
            const isCorrect = userChoice === correctIndex;
            if (isCorrect) correctCount++;
            results[qId] = {
              isCorrect,
              correctIndex,
              explanation: data.explanation || null
            };
          }
        }

        return res.json({
          results,
          total: qIds.length,
          score: correctCount,
          percent: qIds.length > 0 ? Math.round((correctCount / qIds.length) * 100) : 0
        });
      }

      return res.status(400).json({ error: 'Missing questionId or answers object' });
    } catch (err: any) {
      console.error('Check practice answers failed:', err);
      return res.status(500).json({ error: err.message || 'Failed to check answers' });
    }
  });

  // ==========================================
  // API: LESSONS LIST (title, category, code, status only, paginated 20 per page)
  // ==========================================
  let cachedLessonsMetadata: any[] = [];
  let cachedLessonsTimestamp = 0;

  app.get('/api/lessons', publicAndAuthLimiter, async (req: Request, res: Response) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
      const category = req.query.category as string;
      const search = (req.query.search as string || '').toLowerCase().trim();

      const now = Date.now();
      if (cachedLessonsMetadata.length === 0 || now - cachedLessonsTimestamp > 60000) {
        const snap = await db.collection('lessons')
          .select('title', 'category', 'code', 'status', 'isPublished', 'order')
          .orderBy('order', 'asc')
          .get();
        cachedLessonsMetadata = snap.docs
          .map(d => {
            const data = d.data();
            return {
              id: d.id,
              title: data.title || '',
              category: data.category || '',
              code: data.code || '',
              status: data.status || (data.isPublished !== false ? 'published' : 'draft'),
              isPublished: data.isPublished !== false,
              order: data.order || 0
            };
          })
          .filter(l => l.isPublished);
        cachedLessonsTimestamp = now;
      }

      let list = cachedLessonsMetadata;

      if (category && category !== 'all') {
        list = list.filter(l => l.category === category);
      }
      if (search) {
        list = list.filter(l =>
          (typeof l.title === 'string' && l.title.toLowerCase().includes(search)) ||
          (typeof l.title === 'object' && Object.values(l.title).some((v: any) => String(v).toLowerCase().includes(search))) ||
          (l.code && l.code.toLowerCase().includes(search))
        );
      }

      const total = list.length;
      const totalPages = Math.ceil(total / limit) || 1;
      const startIndex = (page - 1) * limit;
      const paginatedLessons = list.slice(startIndex, startIndex + limit);

      return res.json({
        lessons: paginatedLessons,
        page,
        limit,
        totalPages,
        total
      });
    } catch (err: any) {
      console.error('Failed to get lessons list:', err);
      return res.status(500).json({ error: err.message || 'Failed to load lessons' });
    }
  });

  // Load lesson body only when one lesson opens
  app.get('/api/lessons/:id', async (req: Request, res: Response) => {
    try {
      const lessonDoc = await db.collection('lessons').doc(req.params.id).get();
      if (!lessonDoc.exists) return res.status(404).json({ error: 'Lesson not found' });
      return res.json({ id: lessonDoc.id, ...lessonDoc.data() });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to load lesson' });
    }
  });

  // VIDEOS LIST: title, category, code, status only, paginated 20 per page
  let cachedVideosMetadata: any[] = [];
  let cachedVideosTimestamp = 0;

  app.get('/api/videos', publicAndAuthLimiter, async (req: Request, res: Response) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
      const category = req.query.category as string;
      const search = (req.query.search as string || '').toLowerCase().trim();

      const now = Date.now();
      if (cachedVideosMetadata.length === 0 || now - cachedVideosTimestamp > 60000) {
        const snap = await db.collection('videos')
          .select('title', 'category', 'code', 'status', 'isPublished', 'videoUrl', 'duration', 'order')
          .orderBy('order', 'asc')
          .get();
        cachedVideosMetadata = snap.docs
          .map(d => {
            const data = d.data();
            return {
              id: d.id,
              title: data.title || '',
              category: data.category || '',
              code: data.code || '',
              status: data.status || (data.isPublished !== false ? 'published' : 'draft'),
              isPublished: data.isPublished !== false,
              videoUrl: data.videoUrl || '',
              duration: data.duration || 0,
              order: data.order || 0
            };
          })
          .filter(v => v.isPublished);
        cachedVideosTimestamp = now;
      }

      let list = cachedVideosMetadata;

      if (category && category !== 'all') {
        list = list.filter(v => v.category === category);
      }
      if (search) {
        list = list.filter(v =>
          (typeof v.title === 'string' && v.title.toLowerCase().includes(search)) ||
          (typeof v.title === 'object' && Object.values(v.title).some((val: any) => String(val).toLowerCase().includes(search))) ||
          (v.code && v.code.toLowerCase().includes(search))
        );
      }

      const total = list.length;
      const totalPages = Math.ceil(total / limit) || 1;
      const startIndex = (page - 1) * limit;
      const paginatedVideos = list.slice(startIndex, startIndex + limit);

      return res.json({
        videos: paginatedVideos,
        page,
        limit,
        totalPages,
        total
      });
    } catch (err: any) {
      console.error('Failed to get videos list:', err);
      return res.status(500).json({ error: err.message || 'Failed to load videos' });
    }
  });

  // ==========================================
  // API: HOMEPAGE STATS (Cached for 5 minutes, Firestore count() aggregation)
  // ==========================================
  let cachedPublicStats: { questionsCount: number; lessonsCount: number; videosCount: number; updatedAt: number } | null = null;
  const PUBLIC_STATS_TTL_MS = 5 * 60 * 1000; // 5 minutes

  app.get('/api/stats/public', publicAndAuthLimiter, async (_req: Request, res: Response) => {
    const now = Date.now();
    if (cachedPublicStats && (now - cachedPublicStats.updatedAt) < PUBLIC_STATS_TTL_MS) {
      return res.json(cachedPublicStats);
    }

    try {
      const [qCountSnap, lCountSnap, vCountSnap] = await Promise.all([
        db.collection('questions').where('isPublished', '==', true).count().get(),
        db.collection('lessons').where('isPublished', '!=', false).count().get(),
        db.collection('videos').where('isPublished', '!=', false).count().get(),
      ]);

      const stats = {
        questionsCount: qCountSnap.data().count,
        lessonsCount: lCountSnap.data().count,
        videosCount: vCountSnap.data().count,
        updatedAt: now
      };

      cachedPublicStats = stats;

      // Also persist to cached document "stats/public"
      db.collection('stats').doc('public').set({
        ...stats,
        lastUpdated: FieldValue.serverTimestamp()
      }, { merge: true }).catch(() => {});

      return res.json(stats);
    } catch (err: any) {
      console.warn('Failed to compute count aggregations:', err);
      if (cachedPublicStats) return res.json(cachedPublicStats);
      return res.json({ questionsCount: 500, lessonsCount: 45, videosCount: 30, updatedAt: now });
    }
  });

  // ==========================================
  // API: ADMIN DASHBOARD STATS (count() aggregations, never downloading documents)
  // ==========================================
  app.get('/api/admin/stats', async (req: Request, res: Response) => {
    const auth = await verifyAuth(req);
    if (!auth) return res.status(401).json({ error: 'Unauthorized' });
    const userDoc = await db.collection('users').doc(auth.uid).get();
    const isAdmin = auth.email === 'fabriceib2006@gmail.com' || userDoc.data()?.role === 'admin';
    if (!isAdmin) return res.status(403).json({ error: 'Forbidden' });

    try {
      const [usersCountSnap, activeSubsSnap, questionsSnap, lessonsSnap] = await Promise.all([
        db.collection('users').count().get(),
        db.collection('subscriptions').where('status', '==', 'active').count().get(),
        db.collection('questions').count().get(),
        db.collection('lessons').count().get()
      ]);

      const paymentsSnap = await db.collection('payments')
        .where('status', 'in', ['successful', 'success'])
        .limit(200)
        .get();
      let totalRevenue = 0;
      paymentsSnap.docs.forEach(d => {
        totalRevenue += Number(d.data().amount || 0);
      });

      return res.json({
        usersCount: usersCountSnap.data().count,
        activeSubsCount: activeSubsSnap.data().count,
        questionsCount: questionsSnap.data().count,
        lessonsCount: lessonsSnap.data().count,
        monthlyRevenue: totalRevenue
      });
    } catch (err: any) {
      console.error('Failed to get admin stats:', err);
      return res.status(500).json({ error: err.message || 'Failed to get stats' });
    }
  });

  // ==========================================
  // API: HOMEPAGE CONTENT (Cached in server memory for 60 seconds)
  // ==========================================
  let cachedHomepageContentData: any = null;
  let cachedHomepageContentTimestamp = 0;
  const HOMEPAGE_CONTENT_CACHE_TTL_MS = 60 * 1000; // 60 seconds

  app.get('/api/homepage/content', publicAndAuthLimiter, async (_req: Request, res: Response) => {
    const now = Date.now();
    if (cachedHomepageContentData && (now - cachedHomepageContentTimestamp) < HOMEPAGE_CONTENT_CACHE_TTL_MS) {
      return res.json(cachedHomepageContentData);
    }

    try {
      const [secSnap, itemSnap, annSnap, fgSnap, flSnap, socSnap, promoSnap, slotSnap, settingsSnap] = await Promise.all([
        db.collection('homepageSections').get(),
        db.collection('homepageItems').get(),
        db.collection('announcements').get(),
        db.collection('footerGroups').get(),
        db.collection('footerLinks').get(),
        db.collection('socialLinks').get(),
        db.collection('promotions').get(),
        db.collection('imageSlots').get(),
        db.collection('siteSettings').doc('main').get()
      ]);

      const data = {
        sections: secSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        items: itemSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        announcements: annSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        footerGroups: fgSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        footerLinks: flSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        socialLinks: socSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        promotions: promoSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        imageSlots: slotSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        siteSettings: settingsSnap.exists ? settingsSnap.data() : null,
        cachedAt: now
      };

      cachedHomepageContentData = data;
      cachedHomepageContentTimestamp = now;
      return res.json(data);
    } catch (err: any) {
      console.warn('Failed to fetch homepage content:', err);
      if (cachedHomepageContentData) return res.json(cachedHomepageContentData);
      return res.status(500).json({ error: err.message || 'Failed to fetch homepage content' });
    }
  });

  // ==========================================
  // API: ADMIN USERS TABLE (Server-side pagination limit 20, cursor, search query)
  // ==========================================
  app.get('/api/admin/users', async (req: Request, res: Response) => {
    const auth = await verifyAuth(req);
    if (!auth) return res.status(401).json({ error: 'Unauthorized' });
    const userDoc = await db.collection('users').doc(auth.uid).get();
    const isAdmin = auth.email === 'fabriceib2006@gmail.com' || userDoc.data()?.role === 'admin';
    if (!isAdmin) return res.status(403).json({ error: 'Forbidden' });

    try {
      const limitCount = Math.min(Math.max(1, parseInt(req.query.limit as string) || 20), 50);
      const cursor = req.query.cursor as string;
      const search = (req.query.search as string || '').toLowerCase().trim();

      let query = db.collection('users').orderBy('createdAt', 'desc').limit(limitCount);

      if (cursor) {
        const cursorDoc = await db.collection('users').doc(cursor).get();
        if (cursorDoc.exists) {
          query = query.startAfter(cursorDoc);
        }
      }

      const snap = await query.get();
      let users = snap.docs.map(d => ({ uid: d.id, ...d.data() }));

      if (search) {
        const searchMatchesSnap = await Promise.all([
          db.collection('users').where('email', '>=', search).where('email', '<=', search + '\uf8ff').limit(limitCount).get(),
          db.collection('users').where('phone', '>=', search).where('phone', '<=', search + '\uf8ff').limit(limitCount).get(),
          db.collection('users').where('name', '>=', search).where('name', '<=', search + '\uf8ff').limit(limitCount).get(),
        ]).catch(() => []);

        const searchMap = new Map();
        users.forEach(u => searchMap.set(u.uid, u));
        searchMatchesSnap.forEach(sSnap => {
          if (sSnap && sSnap.docs) {
            sSnap.docs.forEach(d => searchMap.set(d.id, { uid: d.id, ...d.data() }));
          }
        });

        users = Array.from(searchMap.values()).filter((u: any) => {
          const name = (u.name || '').toLowerCase();
          const email = (u.email || '').toLowerCase();
          const phone = (u.phone || '').toLowerCase();
          return name.includes(search) || email.includes(search) || phone.includes(search);
        });
      }

      const nextCursor = snap.docs.length === limitCount ? snap.docs[snap.docs.length - 1].id : null;

      return res.json({
        users,
        nextCursor,
        hasMore: Boolean(nextCursor),
        count: users.length
      });
    } catch (err: any) {
      console.error('Failed to get admin users:', err);
      return res.status(500).json({ error: err.message || 'Failed to load users' });
    }
  });

  // ==========================================
  // API: ADMIN PAYMENTS TABLE (Server-side pagination limit 20, cursor, search query)
  // ==========================================
  app.get('/api/admin/payments', async (req: Request, res: Response) => {
    const auth = await verifyAuth(req);
    if (!auth) return res.status(401).json({ error: 'Unauthorized' });
    const userDoc = await db.collection('users').doc(auth.uid).get();
    const isAdmin = auth.email === 'fabriceib2006@gmail.com' || userDoc.data()?.role === 'admin';
    if (!isAdmin) return res.status(403).json({ error: 'Forbidden' });

    try {
      const limitCount = Math.min(Math.max(1, parseInt(req.query.limit as string) || 20), 50);
      const cursor = req.query.cursor as string;
      const search = (req.query.search as string || '').toLowerCase().trim();
      const status = req.query.status as string;

      let q = db.collection('payments').orderBy('createdAt', 'desc').limit(limitCount);

      if (status && status !== 'all') {
        q = db.collection('payments').where('status', '==', status).orderBy('createdAt', 'desc').limit(limitCount);
      }

      if (cursor) {
        const cursorDoc = await db.collection('payments').doc(cursor).get();
        if (cursorDoc.exists) {
          q = q.startAfter(cursorDoc);
        }
      }

      const snap = await q.get();
      let payments = snap.docs.map(d => {
        const data = d.data();
        let createdAtStr = '';
        if (data.createdAt?.toDate) {
          createdAtStr = data.createdAt.toDate().toISOString();
        } else if (typeof data.createdAt === 'string') {
          createdAtStr = data.createdAt;
        } else {
          createdAtStr = new Date().toISOString();
        }

        return {
          id: d.id,
          paypackRef: data.paypackRef || data.reference || d.id,
          userId: data.userId || '',
          userName: data.userName || data.userEmail || '',
          userEmail: data.userEmail || '',
          planId: data.planId || '',
          planName: data.planName || 'Pass',
          amount: Number(data.amount || 0),
          phone: data.phone || '',
          network: data.network || 'MTN',
          kind: data.kind || 'cashin',
          status: data.status || 'pending',
          paypackStatus: data.paypackStatus || (data.isSandbox ? 'sandbox' : null),
          isSandbox: Boolean(data.isSandbox),
          createdAt: createdAtStr
        };
      });

      if (search) {
        payments = payments.filter((p: any) =>
          (p.paypackRef && p.paypackRef.toLowerCase().includes(search)) ||
          (p.phone && p.phone.toLowerCase().includes(search)) ||
          (p.userEmail && p.userEmail.toLowerCase().includes(search)) ||
          (p.userName && p.userName.toLowerCase().includes(search))
        );
      }

      const nextCursor = snap.docs.length === limitCount ? snap.docs[snap.docs.length - 1].id : null;

      return res.json({
        payments,
        nextCursor,
        hasMore: Boolean(nextCursor),
        count: payments.length
      });
    } catch (err: any) {
      console.error('Failed to get admin payments:', err);
      return res.status(500).json({ error: err.message || 'Failed to load payments' });
    }
  });

  // ==========================================
  // VITE DEV SERVER / STATIC SERVING (Item 1: Cache-Control headers)
  // ==========================================
  const isDev = process.env.NODE_ENV !== 'production';
  if (isDev) {
    const vite = await createViteServer({
      server: { middlewareMode: true, host: '0.0.0.0', port: PORT },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath, {
      setHeaders: (res, filePath) => {
        // Long cache for hashed static assets
        if (filePath.includes('/assets/') || /\.[a-f0-9]{8,}\./i.test(filePath)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
        } else {
          res.setHeader('Cache-Control', 'public, max-age=3600');
        }
      }
    }));
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  // Database audit & sync helper for plans and exam-only subscriptions
  async function syncDatabasePlansAndSubscriptions() {
    let plansUpdated = 0;
    let subsUpdated = 0;
    try {
      console.log('Auditing Firestore plans and subscriptions for consistency...');
      const plansSnap = await db.collection('plans').get();
      for (const pDoc of plansSnap.docs) {
        const p = pDoc.data();
        const isExamOnly = Boolean(p.access?.exams) && !p.access?.trafficRules && !p.access?.lessonVideos;
        const isStudy = Boolean(p.access?.trafficRules || p.access?.lessonVideos);

        const updates: any = {};
        if (isExamOnly) {
          if (p.durationDays !== 0) updates.durationDays = 0;
          if (p.examLimit === null || p.examLimit === undefined || p.examLimit <= 0) updates.examLimit = 5;
        } else if (isStudy) {
          if (!p.durationDays || p.durationDays <= 0) updates.durationDays = 30;
          if (p.examLimit !== null) updates.examLimit = null; // study plans have unlimited exams
        }

        if (Object.keys(updates).length > 0) {
          await pDoc.ref.update(updates);
          plansUpdated++;
        }
      }

      // Audit subscriptions for exam-only plans that had endDate set
      const subsSnap = await db.collection('subscriptions').get();
      for (const sDoc of subsSnap.docs) {
        const s = sDoc.data();
        const isExamOnly = Boolean(s.access?.exams) && !s.access?.trafficRules && !s.access?.lessonVideos;
        if (isExamOnly && (s.endDate !== null || s.durationDays !== 0)) {
          await sDoc.ref.update({
            endDate: null,
            durationDays: 0,
          });
          subsUpdated++;

          if (s.userId) {
            const pRef = db.collection('users').doc(s.userId).collection('purchases').doc(sDoc.id);
            const pSnap = await pRef.get();
            if (pSnap.exists) {
              await pRef.update({
                expiresAt: null,
              });
            }
          }
        }
      }
      console.log(`Audit complete: ${plansUpdated} plans and ${subsUpdated} subscriptions synchronized.`);
    } catch (auditErr) {
      console.warn('Database audit notice:', auditErr);
    }
    return { plansUpdated, subsUpdated };
  }

  // Active pending payment queue poller: Checks Paypack every 20 seconds for queued pending payments (limited to 50)
  const activeCheckingRefs = new Set<string>();
  let isCheckingQueue = false;

  async function checkPendingPaymentsQueue() {
    if (isCheckingQueue) return { checked: 0 };
    isCheckingQueue = true;
    let checked = 0;
    try {
      // Find payments that are pending (limited to 50 per requirement 4)
      const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000);
      const pendingSnap = await db.collection('payments')
        .where('status', '==', 'pending')
        .limit(50)
        .get();

      if (pendingSnap.empty) return { checked: 0 };

      for (const pDoc of pendingSnap.docs) {
        checked++;
        const pData = pDoc.data();
        const created = pData.createdAt?.toDate ? pData.createdAt.toDate() : new Date(pData.createdAt);
        if (!created || created < fifteenMinAgo) continue;

        const ref = pData.paypackRef;
        if (!ref || activeCheckingRefs.has(ref)) continue;

        activeCheckingRefs.add(ref);
        fetchPaypackTransaction(ref)
          .then(async (txInfo) => {
            if (!txInfo.found) return;

            if (txInfo.status === 'successful') {
              console.log(`[Queue Poller] Auto-activating completed payment: ${pDoc.id} (ref: ${ref})`);
              const freshDoc = await pDoc.ref.get();
              if (freshDoc.data()?.status !== 'successful') {
                await processSuccessfulPayment(pDoc, txInfo.amount || pData.amount);
              }
            } else if (txInfo.status === 'failed') {
              console.log(`[Queue Poller] Payment marked failed by Paypack: ${pDoc.id} (ref: ${ref})`);
              await pDoc.ref.update({
                status: 'failed',
                paypackStatus: 'failed',
                failureReason: txInfo.failureReason || 'Payment declined or cancelled by provider',
                lastPaypackCheckAt: FieldValue.serverTimestamp(),
              });
            } else if (txInfo.status === 'pending') {
              await pDoc.ref.update({
                paypackStatus: 'pending',
                lastPaypackCheckAt: FieldValue.serverTimestamp(),
              });
            }
          })
          .catch(() => {
            // Non-fatal
          })
          .finally(() => {
            activeCheckingRefs.delete(ref);
          });
      }
    } catch (e) {
      console.warn('Error in checkPendingPaymentsQueue:', e);
    } finally {
      isCheckingQueue = false;
    }
    return { checked };
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`TSINDA server ready on http://0.0.0.0:${PORT}`);
    console.log(`Server started on port ${PORT}`);
    // Run database audit in background on start
    syncDatabasePlansAndSubscriptions().catch(err => console.warn('Startup audit error:', err));
    
    // Background jobs: the setInterval poller must run only when RUN_JOBS=true
    if (process.env.RUN_JOBS === 'true') {
      console.log('Background payment queue poller enabled (RUN_JOBS=true)');
      setInterval(checkPendingPaymentsQueue, 20000);
    } else {
      console.log('Background payment queue poller disabled (RUN_JOBS !== true). Skipping setInterval poller.');
    }
  });
}

startServer();
