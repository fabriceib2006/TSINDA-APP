import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import axios from 'axios';
import * as crypto from 'crypto';

admin.initializeApp();

const databaseId = process.env.FIRESTORE_DATABASE_ID || 'ai-studio-6f0c13d4-6a9f-45c4-9fe8-a73b160765fe';
const db = getFirestore(databaseId);

const PAYPACK_BASE_URL = 'https://payments.paypack.rw/api';
const SECRETS = ['PAYPACK_CLIENT_ID', 'PAYPACK_CLIENT_SECRET', 'PAYPACK_WEBHOOK_SECRET'];

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
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Paypack credentials (PAYPACK_CLIENT_ID, PAYPACK_CLIENT_SECRET) are not configured or are placeholders.'
    );
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

// Helpers to normalize phone number, validate, and detect network
function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  let cleaned = input.replace(/[\s\-\.\(\)\[\]]/g, '');
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  } else if (cleaned.startsWith('00')) {
    cleaned = cleaned.substring(2);
  }
  if (cleaned.startsWith('0')) {
    cleaned = '250' + cleaned.substring(1);
  } else if (cleaned.startsWith('7') && cleaned.length === 9) {
    cleaned = '250' + cleaned;
  }
  if (/^250\d{9}$/.test(cleaned)) {
    return cleaned;
  }
  return null;
}

function validatePhone(input: string | null | undefined): boolean {
  const normalized = normalizePhone(input);
  if (!normalized) return false;
  const digitsAfter250 = normalized.substring(3);
  const prefix = digitsAfter250.substring(0, 2);
  return prefix === '78' || prefix === '79' || prefix === '72' || prefix === '73';
}

function detectNetwork(input: string | null | undefined): 'MTN' | 'Airtel' | null {
  if (!input) return null;
  const normalized = input.startsWith('250') && input.length === 12 ? input : normalizePhone(input);
  if (!normalized) return null;
  const prefix = normalized.substring(3, 5);
  if (prefix === '78' || prefix === '79') {
    return 'MTN';
  }
  if (prefix === '72' || prefix === '73') {
    return 'Airtel';
  }
  return null;
}

function parseRwandanPhone(phone: string): { normalizedPhone: string; network: 'MTN' | 'Airtel' } {
  const normalized = normalizePhone(phone);
  if (!normalized || !validatePhone(normalized)) {
    throw new functions.https.HttpsError('invalid-argument', 'Please enter a valid Rwandan MTN (078/079) or Airtel (072/073) phone number.');
  }

  const network = detectNetwork(normalized);
  if (!network) {
    throw new functions.https.HttpsError('invalid-argument', 'Phone number must be an MTN (078/079) or Airtel (072/073) number.');
  }

  return {
    normalizedPhone: normalized,
    network,
  };
}

// Helper to complete successful payment and create subscription in one transaction
async function processSuccessfulPayment(paymentDocSnapshot: FirebaseFirestore.DocumentSnapshot, reportedAmount?: number) {
  const paymentRef = paymentDocSnapshot.ref;

  await db.runTransaction(async (transaction) => {
    const curDoc = await transaction.get(paymentRef);
    const paymentData = curDoc.data();
    if (!paymentData) return;

    // Idempotency: a payment that already created a subscription must never create a second one
    if (paymentData.status === 'successful' && paymentData.subscriptionId) {
      console.log(`Payment ${curDoc.id} already processed with subscription ${paymentData.subscriptionId}. Skipping.`);
      return;
    }

    // Blocking amount check: compare Paypack's reported amount with amount recorded in payment record
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

    const planDoc = await transaction.get(db.collection('plans').doc(paymentData.planId));
    if (!planDoc.exists) {
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

    const durationDays = Number(plan.durationDays) || 30;
    const serverNow = new Date();

    // Check if user has an active unexpired subscription
    const existingSubsSnap = await transaction.get(
      db.collection('subscriptions')
        .where('userId', '==', paymentData.userId)
        .where('status', '==', 'active')
    );

    let latestEndDate = serverNow;
    let hasActivePlan = false;
    existingSubsSnap.docs.forEach(d => {
      const sub = d.data();
      const end = new Date(sub.endDate);
      if (end > serverNow) {
        hasActivePlan = true;
        if (end > latestEndDate) {
          latestEndDate = end;
        }
      }
    });

    let startDate: Date;
    let endDate: Date;
    let needsReview = false;
    let reviewReason: string | null = null;

    if (hasActivePlan) {
      // Chaining after an active plan is only a safety net and must set needsReview true
      startDate = latestEndDate;
      endDate = new Date(startDate.getTime() + durationDays * 24 * 60 * 60 * 1000);
      needsReview = true;
      reviewReason = `Chained after active subscription ending at ${latestEndDate.toISOString()}`;
    } else {
      startDate = serverNow;
      endDate = new Date(startDate.getTime() + durationDays * 24 * 60 * 60 * 1000);
    }

    const subRef = db.collection('subscriptions').doc();
    const subData = {
      id: subRef.id,
      userId: paymentData.userId,
      planId: paymentData.planId,
      planName: paymentData.planName,
      price: recordedAmount,
      durationDays,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      access: {
        trafficRules: Boolean(plan.access?.trafficRules),
        lessonVideos: Boolean(plan.access?.lessonVideos),
        exams: Boolean(plan.access?.exams),
      },
      examLimit: plan.examLimit ?? null,
      examsUsed: 0,
      status: 'active',
      source: 'payment',
      paymentId: curDoc.id,
      paypackRef: paymentData.paypackRef,
      grantedBy: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    transaction.set(subRef, subData);
    transaction.update(paymentRef, {
      status: needsReview ? 'needsReview' : 'successful',
      subscriptionId: subRef.id,
      needsReview,
      reviewReason,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

// 1. PAYMENT START (Callable Cloud Function)
export const startPayment = functions.runWith({ secrets: SECRETS }).https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be signed in to initiate payment.');
  }
  const userId = context.auth.uid;
  const userEmail = context.auth.token.email || '';
  const { planId, phone } = data || {};

  if (!planId || typeof planId !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'Missing or invalid planId.');
  }
  if (!phone || typeof phone !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'Missing or invalid phone number.');
  }

  const { normalizedPhone, network } = parseRwandanPhone(phone);

  // Fetch plan from Firestore to verify and read price on server (browser amount ignored)
  const planDoc = await db.collection('plans').doc(planId).get();
  if (!planDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Selected subscription plan does not exist.');
  }
  const planData = planDoc.data()!;
  if (!planData.isActive) {
    throw new functions.https.HttpsError('failed-precondition', 'Selected subscription plan is currently inactive.');
  }
  const planPrice = Number(planData.price);
  if (!planPrice || planPrice <= 0) {
    throw new functions.https.HttpsError('failed-precondition', 'Invalid plan price configured in Firestore.');
  }

  // 1. BLOCK DOUBLE PLANS: reject if user has any subscription with status "active" and endDate in the future
  const serverNow = new Date();
  const activeSubsQuery = await db
    .collection('subscriptions')
    .where('userId', '==', userId)
    .where('status', '==', 'active')
    .get();

  const activeSubDoc = activeSubsQuery.docs.find(d => {
    const end = new Date(d.data().endDate);
    return end > serverNow;
  });

  if (activeSubDoc) {
    const activeSub = activeSubDoc.data();
    throw new functions.https.HttpsError(
      'already-exists',
      'ACTIVE_PLAN_EXISTS',
      {
        code: 'ACTIVE_PLAN_EXISTS',
        endDate: activeSub.endDate,
        planName: activeSub.planName || 'Active Plan',
      }
    );
  }

  // 2. Reject if user already has a pending payment newer than 3 minutes
  const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000);
  const pendingQuery = await db
    .collection('payments')
    .where('userId', '==', userId)
    .where('status', '==', 'pending')
    .where('createdAt', '>=', Timestamp.fromDate(threeMinutesAgo))
    .limit(1)
    .get();

  if (!pendingQuery.empty) {
    throw new functions.https.HttpsError(
      'already-exists',
      'PENDING_PAYMENT_EXISTS',
      {
        code: 'PENDING_PAYMENT_EXISTS',
      }
    );
  }

  // Authenticate with Paypack
  const token = await getPaypackToken();

  // Paypack expects 07XXXXXXXX format for cashin (convert from stored 250 format)
  const paypackNumber = '0' + normalizedPhone.substring(3);

  // Call Paypack cashin
  let cashinRes;
  try {
    cashinRes = await axios.post(
      `${PAYPACK_BASE_URL}/transactions/cashin`,
      {
        amount: planPrice,
        number: paypackNumber,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
        timeout: 20000,
      }
    );
  } catch (err: any) {
    console.error('Paypack cashin API error:', err?.response?.data || err?.message);
    const apiError = err?.response?.data?.message || err?.response?.data?.description || 'Failed to initiate cash-in with Paypack.';
    throw new functions.https.HttpsError('internal', apiError);
  }

  const paypackRef = cashinRes.data?.ref || cashinRes.data?.data?.ref;
  if (!paypackRef) {
    throw new functions.https.HttpsError('internal', 'Paypack response did not include a valid transaction reference.');
  }

  let planNameString = 'Subscription Pass';
  if (typeof planData.name === 'object' && planData.name !== null) {
    planNameString = planData.name.en || planData.name.rw || planData.name.fr || 'Subscription Pass';
  } else if (typeof planData.name === 'string') {
    planNameString = planData.name;
  }

  // Save to Firestore "payments" collection
  const paymentRef = db.collection('payments').doc();
  const paymentRecord = {
    id: paymentRef.id,
    paypackRef,
    userId,
    userEmail,
    planId,
    planName: planNameString,
    amount: planPrice,
    phone: normalizedPhone,
    network,
    kind: 'cashin',
    status: 'pending',
    subscriptionId: null,
    failureReason: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  await paymentRef.set(paymentRecord);

  return {
    success: true,
    paymentId: paymentRef.id,
    paypackRef,
    amount: planPrice,
    phone: normalizedPhone,
    network,
  };
});

// 2. CONFIRMATION WEBHOOK (HTTP Cloud Function - Publicly Reachable)
export const paypackWebhook = functions.runWith({ secrets: SECRETS }).https.onRequest(async (req, res) => {
  // 1. Immediately respond HTTP 200 to GET, HEAD, and OPTIONS validation pings
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    res.status(200).send('OK');
    return;
  }

  // 2. Respond HTTP 200 to POST requests that are pings or have no valid payload
  const body = req.body;
  const isPingOrEmpty =
    !body ||
    (typeof body === 'object' && Object.keys(body).length === 0) ||
    body.event === 'ping' ||
    body.type === 'ping' ||
    body.action === 'ping';

  if (isPingOrEmpty) {
    res.status(200).json({ status: 'ok', message: 'Webhook validation ping acknowledged.' });
    return;
  }

  const webhookSecret = getSecret('PAYPACK_WEBHOOK_SECRET');

  // 3. If PAYPACK_WEBHOOK_SECRET is missing or still a placeholder, still return 200 for pings,
  // but do NOT process or change any payment or subscription.
  if (!isSecretConfigured(webhookSecret)) {
    console.log('PAYPACK_WEBHOOK_SECRET is missing or placeholder. Returning 200 for ping, skipping payment processing.');
    res.status(200).json({
      received: true,
      note: 'PAYPACK_WEBHOOK_SECRET is not yet configured or is a placeholder. Ping acknowledged without payment processing.',
    });
    return;
  }

  // 4. When secret IS configured, verify signature of every real event using Paypack documentation
  const signatureHeader = (req.headers['x-paypack-signature'] || req.headers['X-Paypack-Signature']) as string;
  if (!signatureHeader) {
    console.warn('Webhook rejected: Missing x-paypack-signature header.');
    res.status(401).send('Unauthorized: Missing signature header');
    return;
  }

  const rawBody = (req as any).rawBody ? (req as any).rawBody.toString('utf8') : JSON.stringify(body);
  const computedHmacBase64 = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('base64');
  const computedHmacHex = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');

  const isValid = signatureHeader === computedHmacBase64 || signatureHeader === computedHmacHex;
  if (!isValid) {
    console.warn('Webhook rejected: Invalid Paypack webhook signature.');
    res.status(401).send('Unauthorized: Invalid signature');
    return;
  }

  // Save raw event in Firestore "paypackEvents" collection
  try {
    await db.collection('paypackEvents').add({
      payload: body,
      headers: {
        signature: signatureHeader,
        userAgent: req.headers['user-agent'] || null,
      },
      receivedAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error('Error saving paypackEvent:', err);
  }

  const eventData = body?.data || body;
  const paypackRef = eventData?.ref;
  const reportedStatus = String(eventData?.status || '').toLowerCase();
  const reportedAmount = eventData?.amount;

  if (!paypackRef) {
    // Valid event without ref (e.g. test notification)
    res.status(200).json({ received: true, note: 'Missing transaction ref' });
    return;
  }

  // Find payment by paypackRef
  const paymentsQuery = await db.collection('payments').where('paypackRef', '==', paypackRef).limit(1).get();
  if (paymentsQuery.empty) {
    console.warn(`Webhook received for untracked paypackRef: ${paypackRef}`);
    res.status(200).json({ received: true, note: 'Ref not tracked in system' });
    return;
  }

  const paymentDoc = paymentsQuery.docs[0];

  // 5. Processing stays strictly idempotent: never create two subscriptions for one payment
  if (reportedStatus === 'successful' || reportedStatus === 'success') {
    try {
      await processSuccessfulPayment(paymentDoc, reportedAmount);
    } catch (err) {
      console.error('Error activating subscription for payment:', err);
      res.status(500).send('Internal Error during subscription creation');
      return;
    }
  } else if (reportedStatus === 'failed') {
    const failureReason = eventData?.failure_reason || eventData?.message || 'Transaction failed or rejected by user';
    await paymentDoc.ref.update({
      status: 'failed',
      failureReason,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  res.status(200).json({ received: true, paypackRef, status: reportedStatus });
});

// 3. SCHEDULED PENDING CHECK (Runs every 1 minute)
export const scheduledPendingCheck = functions.runWith({ secrets: SECRETS }).pubsub.schedule('every 1 minutes').onRun(async () => {
  const nowMs = Date.now();
  const ninetySecondsAgo = new Date(nowMs - 90 * 1000);

  const pendingPayments = await db
    .collection('payments')
    .where('status', '==', 'pending')
    .where('createdAt', '<=', Timestamp.fromDate(ninetySecondsAgo))
    .limit(30)
    .get();

  if (pendingPayments.empty) {
    return null;
  }

  let token: string | null = null;
  try {
    token = await getPaypackToken();
  } catch (err) {
    console.error('Could not authenticate with Paypack for scheduled check:', err);
    return null;
  }

  for (const docSnap of pendingPayments.docs) {
    const payment = docSnap.data();
    const createdTimestamp = payment.createdAt?.toDate ? payment.createdAt.toDate().getTime() : nowMs;
    const elapsedSeconds = Math.floor((nowMs - createdTimestamp) / 1000);

    try {
      // Query Paypack by ref using events endpoint
      const res = await axios.get(`${PAYPACK_BASE_URL}/events/transactions?ref=${payment.paypackRef}`, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
        timeout: 10000,
      });

      const transactions = res.data?.transactions || res.data?.data || [];
      const match = Array.isArray(transactions)
        ? transactions.find((t: any) => t.data?.ref === payment.paypackRef || t.ref === payment.paypackRef)
        : null;

      const txStatus = String(match?.data?.status || match?.status || '').toLowerCase();

      if (txStatus === 'successful' || txStatus === 'success') {
        await processSuccessfulPayment(docSnap, match?.data?.amount || match?.amount);
        continue;
      } else if (txStatus === 'failed') {
        await docSnap.ref.update({
          status: 'failed',
          failureReason: match?.data?.failure_reason || match?.message || 'Transaction reported failed by Paypack',
          updatedAt: FieldValue.serverTimestamp(),
        });
        continue;
      }
    } catch (apiErr: any) {
      console.warn(`Could not verify ref ${payment.paypackRef} with Paypack:`, apiErr?.message);
    }

    // If still pending after 10 minutes (600s), mark timeout
    if (elapsedSeconds >= 600) {
      await docSnap.ref.update({
        status: 'failed',
        failureReason: 'timeout',
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  }

  return null;
});

// 4. SYNC WITH PAYPACK (Callable Cloud Function - Admin only)
export const syncPaypack = functions.runWith({ secrets: SECRETS }).https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Admin authentication required.');
  }
  const isAdmin = context.auth.token.email === 'fabriceib2006@gmail.com';
  if (!isAdmin) {
    const userDoc = await db.collection('users').doc(context.auth.uid).get();
    if (userDoc.data()?.role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Only administrators can run Paypack synchronization.');
    }
  }

  const token = await getPaypackToken();

  const response = await axios.get(`${PAYPACK_BASE_URL}/transactions/list?offset=0&limit=50`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
    timeout: 15000,
  });

  const transactions = response.data?.transactions || response.data?.data || [];
  let updatedCount = 0;

  for (const item of transactions) {
    const ref = item.ref || item.data?.ref;
    const status = String(item.status || item.data?.status || '').toLowerCase();
    if (!ref) continue;

    const query = await db.collection('payments').where('paypackRef', '==', ref).limit(1).get();
    if (!query.empty) {
      const pDoc = query.docs[0];
      const pData = pDoc.data();
      if (pData.status !== 'successful' && (status === 'successful' || status === 'success')) {
        await processSuccessfulPayment(pDoc, item.amount);
        updatedCount++;
      } else if (pData.status === 'pending' && status === 'failed') {
        await pDoc.ref.update({
          status: 'failed',
          failureReason: item.failure_reason || 'Failed in Paypack',
          updatedAt: FieldValue.serverTimestamp(),
        });
        updatedCount++;
      }
    }
  }

  return {
    success: true,
    totalFetched: Array.isArray(transactions) ? transactions.length : 0,
    updatedCount,
  };
});

// 5. TEST CONNECTION (Callable Cloud Function - Admin only)
export const testPaypackConnection = functions.runWith({ secrets: SECRETS }).https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Admin authentication required.');
  }
  const isAdmin = context.auth.token.email === 'fabriceib2006@gmail.com';
  if (!isAdmin) {
    const userDoc = await db.collection('users').doc(context.auth.uid).get();
    if (userDoc.data()?.role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Only administrators can run Paypack connection tests.');
    }
  }

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
        : 'One or more secrets are missing in Secret Manager / environment configuration.',
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

  // Check 1: Secrets
  if (!allSecretsPresent) {
    return result;
  }

  // Check 2: Paypack Authentication
  let token = '';
  try {
    const authRes = await axios.post(
      `${PAYPACK_BASE_URL}/auth/agents/authorize`,
      {
        client_id: clientId,
        client_secret: clientSecret,
      },
      {
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        timeout: 10000,
      }
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
    return result;
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
    const headRes = await axios.get(webhookUrl, {
      validateStatus: () => true,
      timeout: 10000,
    });
    // Cloud Function responds 200 for GET validation ping
    if (headRes.status === 200) {
      result.webhookReachability = {
        passed: true,
        message: `Webhook endpoint is live and returned HTTP 200 to validation ping.`,
      };
    } else if (headRes.status === 405 || headRes.status === 401) {
      result.webhookReachability = {
        passed: true,
        message: `Webhook endpoint is reachable (HTTP ${headRes.status}).`,
      };
    } else {
      result.webhookReachability = {
        passed: false,
        message: `Webhook returned HTTP ${headRes.status}`,
      };
    }
  } catch (err: any) {
    result.webhookReachability = {
      passed: false,
      message: `Webhook ping error: ${err?.message}`,
    };
  }

  result.allPassed =
    result.secrets.passed &&
    result.auth.passed &&
    result.transactionsRead.passed &&
    result.webhookReachability.passed;

  return result;
});

// Request Password Reset Cloud Function (email only, no SMS)
export const requestPasswordReset = functions.https.onCall(async (data, context) => {
  const phone = data.phone;
  if (!phone) {
    throw new functions.https.HttpsError('invalid-argument', 'Phone number is required.');
  }

  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone || !validatePhone(normalizedPhone)) {
    return { success: true, message: "If this number is registered, a reset link was sent to its email" };
  }

  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;
  const attemptsRef = db.collection('passwordResetAttempts').doc(normalizedPhone);
  const attemptDoc = await attemptsRef.get();

  let timestamps: number[] = [];
  if (attemptDoc.exists) {
    timestamps = attemptDoc.data()?.timestamps || [];
  }
  timestamps = timestamps.filter((t: number) => t > oneHourAgo);

  if (timestamps.length >= 5) {
    throw new functions.https.HttpsError('resource-exhausted', 'Too many password reset requests. Please try again later.');
  }

  timestamps.push(now);
  await attemptsRef.set({ timestamps });

  const usersSnap = await db.collection('users').where('phone', '==', normalizedPhone).limit(1).get();
  if (!usersSnap.empty) {
    const userDoc = usersSnap.docs[0];
    const userData = userDoc.data();
    const realEmail = userData.email;

    if (realEmail) {
      const internalEmail = `${normalizedPhone}@students.tsinda.app`;
      try {
        const link = await admin.auth().generatePasswordResetLink(internalEmail);
        
        const apiKey = process.env.EMAIL_API_KEY || '';
        const emailFrom = process.env.EMAIL_FROM || 'support@tsinda.app';

        if (apiKey) {
          await axios.post('https://api.resend.com/emails', {
            from: emailFrom,
            to: realEmail,
            subject: 'Password Reset - TSINDA Rwanda Driving Theory',
            html: `<p>Hello ${userData.name || 'Student'},</p><p>You requested to reset your password for TSINDA. Click the link below to reset your password:</p><p><a href="${link}">Reset Password</a></p><p>If you did not request this, please ignore this email.</p>`
          }, {
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json'
            }
          });
        } else {
          console.warn('EMAIL_API_KEY secret is not set. Reset link generated:', link);
        }
      } catch (err) {
        console.error('Error generating/sending password reset link:', err);
      }
    }
  }

  return { success: true, message: "If this number is registered, a reset link was sent to its email" };
});

// Helper to calculate exam score and finalize attempt document
async function calculateAndFinalizeAttempt(
  attemptRef: FirebaseFirestore.DocumentReference,
  attempt: FirebaseFirestore.DocumentData,
  expired: boolean
) {
  const questionIds: string[] = Array.isArray(attempt.questionIds) ? attempt.questionIds : [];
  const questionDocs = await Promise.all(
    questionIds.map(id => db.collection('questions').doc(id).get())
  );

  let score = 0;
  const savedAnswers = attempt.userAnswers || {};
  const review = questionDocs.map((docSnap, idx) => {
    const qData = docSnap.exists ? docSnap.data() : null;
    const correctIndex = typeof qData?.correctIndex === 'number' ? qData.correctIndex : -1;
    const studentAnswer =
      savedAnswers[idx] !== undefined && savedAnswers[idx] !== null
        ? Number(savedAnswers[idx])
        : null;
    const isCorrect = studentAnswer !== null && studentAnswer === correctIndex;
    if (isCorrect) {
      score++;
    }
    return {
      questionId: docSnap.id,
      questionIndex: idx,
      correctIndex,
      studentAnswer,
      isCorrect,
    };
  });

  const passMark = Number(attempt.passMark) || 12;
  const passed = score >= passMark;
  const total = questionIds.length;

  await attemptRef.update({
    status: 'completed',
    finishedAt: new Date().toISOString(),
    score,
    passed,
    total,
    passMark,
    expired: Boolean(expired),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return {
    score,
    passed,
    total,
    passMark,
    expired: Boolean(expired),
    review,
  };
}

// 7. START EXAM (Callable Cloud Function)
export const startExam = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be signed in to start an exam.');
  }
  const userId = context.auth.uid;
  const { questionIds } = data || {};

  const serverNow = new Date();

  // 1. Fetch examSettings to copy settings at start time
  const settingsSnap = await db.collection('examSettings').limit(1).get();
  let numQuestions = 20;
  let durationMinutes = 20;
  let passMark = 12;
  if (!settingsSnap.empty) {
    const s = settingsSnap.docs[0].data();
    if (typeof s.numQuestions === 'number' && s.numQuestions > 0) numQuestions = s.numQuestions;
    if (typeof s.durationMinutes === 'number' && s.durationMinutes > 0) durationMinutes = s.durationMinutes;
    if (typeof s.passMark === 'number' && s.passMark > 0) passMark = s.passMark;
  }

  const startedAt = serverNow.toISOString();
  const expiresAt = new Date(serverNow.getTime() + durationMinutes * 60 * 1000).toISOString();

  // 2. Check if user already has an in_progress attempt that has not expired
  const inProgressQuery = await db
    .collection('examAttempts')
    .where('userId', '==', userId)
    .where('status', '==', 'in_progress')
    .get();

  for (const docSnap of inProgressQuery.docs) {
    const attempt = docSnap.data();
    const expTime = attempt.expiresAt
      ? new Date(attempt.expiresAt).getTime()
      : (attempt.startedAt ? new Date(attempt.startedAt).getTime() + (Number(attempt.durationMinutes) || 20) * 60 * 1000 : 0);
    if (serverNow.getTime() < expTime) {
      // Unexpired in_progress attempt found! Return that attempt and do NOT increase count.
      return {
        resumed: true,
        attemptId: docSnap.id,
        attempt: { id: docSnap.id, ...attempt },
        startedAt: attempt.startedAt,
        expiresAt: attempt.expiresAt || new Date(expTime).toISOString(),
        durationMinutes: Number(attempt.durationMinutes) || durationMinutes,
        numQuestions: Number(attempt.numQuestions) || numQuestions,
        passMark: Number(attempt.passMark) || passMark,
      };
    }
  }

  // 3. Find active subscription with exam access
  const activeSubsQuery = await db
    .collection('subscriptions')
    .where('userId', '==', userId)
    .where('status', '==', 'active')
    .get();

  const validSubs = activeSubsQuery.docs.filter(d => {
    const sub = d.data();
    const end = new Date(sub.endDate);
    return end > serverNow && sub.access?.exams === true;
  });

  if (validSubs.length === 0) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'NO_ACTIVE_EXAM_SUBSCRIPTION'
    );
  }

  // Find a subscription that hasn't reached its exam limit
  const chosenSubDoc = validSubs.find(d => {
    const sub = d.data();
    if (sub.examLimit === null || sub.examLimit === undefined) return true;
    return (sub.examsUsed || 0) < sub.examLimit;
  });

  if (!chosenSubDoc) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'EXAM_LIMIT_REACHED'
    );
  }

  const subRef = chosenSubDoc.ref;
  const attemptRef = db.collection('examAttempts').doc();

  // 4. In ONE transaction, create the examAttempt (startedAt = server time) and increase examsUsed by 1
  await db.runTransaction(async (transaction) => {
    const subDoc = await transaction.get(subRef);
    if (!subDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Subscription not found.');
    }
    const subData = subDoc.data()!;
    const currentUsed = subData.examsUsed || 0;
    const limit = subData.examLimit;
    if (limit !== null && limit !== undefined && currentUsed >= limit) {
      throw new functions.https.HttpsError('failed-precondition', 'EXAM_LIMIT_REACHED');
    }

    transaction.update(subRef, {
      examsUsed: currentUsed + 1,
      updatedAt: FieldValue.serverTimestamp(),
    });

    const attemptData = {
      id: attemptRef.id,
      userId,
      subscriptionId: subRef.id,
      startedAt,
      expiresAt,
      durationMinutes,
      numQuestions,
      passMark,
      finishedAt: null,
      score: 0,
      passed: false,
      status: 'in_progress',
      questionIds: Array.isArray(questionIds) ? questionIds : [],
      userAnswers: {},
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    transaction.set(attemptRef, attemptData);
  });

  return {
    resumed: false,
    attemptId: attemptRef.id,
    startedAt,
    expiresAt,
    durationMinutes,
    numQuestions,
    passMark,
  };
});

// 8. SAVE ANSWER (Callable Cloud Function)
export const saveAnswer = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be signed in.');
  }
  const userId = context.auth.uid;
  const { attemptId, questionIndex, optionIndex } = data || {};

  if (!attemptId || typeof attemptId !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'Missing or invalid attemptId.');
  }
  const qIdx = Number(questionIndex);
  const optIdx = Number(optionIndex);
  if (!Number.isInteger(qIdx) || qIdx < 0) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid questionIndex.');
  }
  if (!Number.isInteger(optIdx) || optIdx < 0) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid optionIndex.');
  }

  const attemptRef = db.collection('examAttempts').doc(attemptId);
  const attemptSnap = await attemptRef.get();
  if (!attemptSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Exam attempt not found.');
  }
  const attempt = attemptSnap.data()!;
  if (attempt.userId !== userId) {
    throw new functions.https.HttpsError('permission-denied', 'Not your exam attempt.');
  }
  if (attempt.status !== 'in_progress') {
    throw new functions.https.HttpsError('failed-precondition', 'Exam attempt is not in progress.');
  }

  const now = Date.now();
  const expiresAtMs = attempt.expiresAt
    ? new Date(attempt.expiresAt).getTime()
    : (attempt.startedAt ? new Date(attempt.startedAt).getTime() + (Number(attempt.durationMinutes) || 20) * 60 * 1000 : 0);
  if (now >= expiresAtMs) {
    throw new functions.https.HttpsError('deadline-exceeded', 'Exam time has expired.');
  }

  const questionIds: string[] = Array.isArray(attempt.questionIds) ? attempt.questionIds : [];
  if (qIdx >= questionIds.length) {
    throw new functions.https.HttpsError('invalid-argument', 'questionIndex out of bounds.');
  }

  const targetQuestionId = questionIds[qIdx];
  const questionSnap = await db.collection('questions').doc(targetQuestionId).get();
  if (!questionSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Question not found.');
  }
  const qData = questionSnap.data()!;
  const options = Array.isArray(qData.options) ? qData.options : [];
  if (optIdx >= options.length) {
    throw new functions.https.HttpsError('invalid-argument', 'optionIndex out of range.');
  }

  await attemptRef.update({
    [`userAnswers.${qIdx}`]: optIdx,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { success: true };
});

// 9. SUBMIT EXAM (Callable Cloud Function)
export const submitExam = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be signed in.');
  }
  const userId = context.auth.uid;
  const { attemptId } = data || {};

  if (!attemptId || typeof attemptId !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'Missing or invalid attemptId.');
  }

  const attemptRef = db.collection('examAttempts').doc(attemptId);
  const attemptSnap = await attemptRef.get();
  if (!attemptSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Exam attempt not found.');
  }
  const attempt = attemptSnap.data()!;
  if (attempt.userId !== userId) {
    throw new functions.https.HttpsError('permission-denied', 'Not your exam attempt.');
  }

  const questionIds: string[] = Array.isArray(attempt.questionIds) ? attempt.questionIds : [];

  // Idempotent: If the attempt is already completed, return stored result and change nothing
  if (attempt.status === 'completed') {
    const questionDocs = await Promise.all(
      questionIds.map(id => db.collection('questions').doc(id).get())
    );
    const savedAnswers = attempt.userAnswers || {};
    const review = questionDocs.map((docSnap, idx) => {
      const qData = docSnap.exists ? docSnap.data() : null;
      const correctIndex = typeof qData?.correctIndex === 'number' ? qData.correctIndex : -1;
      const studentAnswer =
        savedAnswers[idx] !== undefined && savedAnswers[idx] !== null
          ? Number(savedAnswers[idx])
          : null;
      const isCorrect = studentAnswer !== null && studentAnswer === correctIndex;
      return {
        questionId: docSnap.id,
        questionIndex: idx,
        correctIndex,
        studentAnswer,
        isCorrect,
      };
    });

    return {
      success: true,
      attemptId,
      score: attempt.score || 0,
      passed: Boolean(attempt.passed),
      total: attempt.total || questionIds.length,
      passMark: attempt.passMark || 12,
      expired: Boolean(attempt.expired),
      review,
    };
  }

  const now = Date.now();
  const expiresAtMs = attempt.expiresAt
    ? new Date(attempt.expiresAt).getTime()
    : (attempt.startedAt ? new Date(attempt.startedAt).getTime() + (Number(attempt.durationMinutes) || 20) * 60 * 1000 : 0);
  const isExpired = now >= expiresAtMs;

  const result = await calculateAndFinalizeAttempt(attemptRef, attempt, isExpired);

  return {
    success: true,
    attemptId,
    ...result,
  };
});

// 10. FINALIZE EXPIRED EXAMS (Scheduled Cloud Function)
export const finalizeExpiredExams = functions.pubsub
  .schedule('every 10 minutes')
  .timeZone('Africa/Kigali')
  .onRun(async () => {
    const serverNowMs = Date.now();
    const inProgressSnap = await db
      .collection('examAttempts')
      .where('status', '==', 'in_progress')
      .get();

    for (const docSnap of inProgressSnap.docs) {
      const attempt = docSnap.data();
      const expiresAtMs = attempt.expiresAt
        ? new Date(attempt.expiresAt).getTime()
        : (attempt.startedAt ? new Date(attempt.startedAt).getTime() + (Number(attempt.durationMinutes) || 20) * 60 * 1000 : 0);

      if (serverNowMs >= expiresAtMs) {
        try {
          await calculateAndFinalizeAttempt(docSnap.ref, attempt, true);
        } catch (err) {
          console.error(`Failed to auto-finalize expired attempt ${docSnap.id}:`, err);
        }
      }
    }
    return null;
  });

// Password hashing and verification helpers
function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, s, 1000, 64, 'sha512').toString('hex');
  return { hash, salt: s };
}

function verifyPassword(password: string, hash: string, salt: string): boolean {
  const h = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return h === hash;
}

export const signUpWithPhone = functions.https.onCall(async (data, context) => {
  const { name, phone, email, password } = data;
  const normalized = normalizePhone(phone);
  const maskedPhone = phone ? phone.replace(/^(\d{3})\d{6}(\d{2})$/, '$1******$2') : 'null';

  if (!normalized || !validatePhone(normalized)) {
    console.warn(`[signUpWithPhone] Invalid phone number provided: ${maskedPhone}`);
    throw new functions.https.HttpsError('invalid-argument', 'Invalid phone number.');
  }
  if (!password || password.length < 8) {
    console.warn(`[signUpWithPhone] Weak password for phone ${maskedPhone}`);
    throw new functions.https.HttpsError('invalid-argument', 'Password must be at least 8 characters.');
  }

  const internalEmail = `${normalized}@students.tsinda.app`;

  let uid: string;
  try {
    const existing = await admin.auth().getUserByEmail(internalEmail).catch(() => null);
    if (existing) {
      console.warn(`[signUpWithPhone] Duplicate registration attempt for ${maskedPhone}`);
      throw new functions.https.HttpsError('already-exists', 'This phone number is already registered.');
    }

    const { hash, salt } = hashPassword(password);

    const userRecord = await admin.auth().createUser({
      email: internalEmail,
      displayName: name,
    });
    uid = userRecord.uid;

    const profile = {
      uid,
      name,
      phone: normalized,
      email: email || '',
      role: 'learner',
      status: 'active',
      passwordHash: hash,
      passwordSalt: salt,
      createdAt: new Date().toISOString()
    };
    await db.collection('users').doc(uid).set(profile);
  } catch (err: any) {
    console.error(`[signUpWithPhone] Error code: ${err.code || 'unknown'}, message: ${err.message || 'none'} for phone ${maskedPhone}`);
    if (err instanceof functions.https.HttpsError) {
      throw err;
    }
    if (err.code === 'auth/operation-not-allowed' || err.message?.includes('operation-not-allowed')) {
      throw new functions.https.HttpsError('permission-denied', 'Email/Password authentication provider is not enabled in Firebase Console.');
    }
    if (err.code === 'already-exists' || err.message?.includes('already registered')) {
      throw new functions.https.HttpsError('already-exists', 'This phone number is already registered.');
    }
    throw new functions.https.HttpsError('internal', 'Could not create account. Please try again.');
  }

  const customToken = await admin.auth().createCustomToken(uid);
  return { customToken };
});

export const signInWithPhone = functions.https.onCall(async (data, context) => {
  const { phone, password } = data;
  const normalized = normalizePhone(phone);
  if (!normalized || !validatePhone(normalized)) {
    throw new functions.https.HttpsError('invalid-argument', 'Please enter a valid Rwandan MTN (078/079) or Airtel (072/073) phone number.');
  }

  const internalEmail = `${normalized}@students.tsinda.app`;

  let userRecord;
  try {
    userRecord = await admin.auth().getUserByEmail(internalEmail);
  } catch (err) {
    throw new functions.https.HttpsError('not-found', 'Invalid phone number or password.');
  }

  const userDoc = await db.collection('users').doc(userRecord.uid).get();
  if (!userDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Invalid phone number or password.');
  }

  const userData = userDoc.data()!;
  if (!userData.passwordHash || !userData.passwordSalt) {
    throw new functions.https.HttpsError('invalid-argument', 'Please reset your password or register.');
  }

  const isValid = verifyPassword(password, userData.passwordHash, userData.passwordSalt);
  if (!isValid) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid phone number or password.');
  }

  const customToken = await admin.auth().createCustomToken(userRecord.uid);
  return { customToken };
});


