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
    throw new functions.https.HttpsError('invalid-argument', 'Phone number must be a valid 9-digit Rwandan number (e.g. 078XXXXXXX).');
  }

  const prefix = clean.slice(0, 2);
  let network: 'MTN' | 'Airtel';
  if (prefix === '78' || prefix === '79') {
    network = 'MTN';
  } else if (prefix === '72' || prefix === '73') {
    network = 'Airtel';
  } else {
    throw new functions.https.HttpsError('invalid-argument', 'Phone number must be an MTN (078/079) or Airtel (072/073) number.');
  }

  return {
    normalizedPhone: `0${clean}`,
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

    const planDoc = await transaction.get(db.collection('plans').doc(paymentData.planId));
    if (!planDoc.exists) {
      console.error(`Plan ${paymentData.planId} not found when activating payment ${curDoc.id}`);
      return;
    }
    const plan = planDoc.data()!;

    // Check amount matches plan price
    const expectedPrice = Number(plan.price);
    const paidAmount = Number(paymentData.amount);
    if (reportedAmount && Number(reportedAmount) !== expectedPrice) {
      console.warn(`Amount mismatch for payment ${curDoc.id}: reported ${reportedAmount}, expected ${expectedPrice}`);
    }

    const durationDays = Number(plan.durationDays) || 30;
    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + durationDays * 24 * 60 * 60 * 1000);

    const subRef = db.collection('subscriptions').doc();
    const subData = {
      id: subRef.id,
      userId: paymentData.userId,
      planId: paymentData.planId,
      planName: paymentData.planName,
      price: paidAmount,
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
      status: 'successful',
      subscriptionId: subRef.id,
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

  // Prevent double charges: reject if user already has a pending payment for the same plan in the last 3 minutes
  const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000);
  const pendingQuery = await db
    .collection('payments')
    .where('userId', '==', userId)
    .where('planId', '==', planId)
    .where('status', '==', 'pending')
    .where('createdAt', '>=', Timestamp.fromDate(threeMinutesAgo))
    .limit(1)
    .get();

  if (!pendingQuery.empty) {
    throw new functions.https.HttpsError(
      'already-exists',
      'You already have a pending payment request for this plan within the last 3 minutes. Please check your phone for the USSD prompt.'
    );
  }

  // Authenticate with Paypack
  const token = await getPaypackToken();

  // Call Paypack cashin
  let cashinRes;
  try {
    cashinRes = await axios.post(
      `${PAYPACK_BASE_URL}/transactions/cashin`,
      {
        amount: planPrice,
        number: normalizedPhone,
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

  let cleaned = phone.replace(/[\\s\\-\\(\\)]/g, '');
  if (cleaned.startsWith('+250')) cleaned = cleaned.substring(1);
  if (cleaned.startsWith('0')) cleaned = '250' + cleaned.substring(1);
  if (cleaned.length === 9 && cleaned.startsWith('7')) cleaned = '250' + cleaned;
  const normalizedPhone = cleaned;

  if (!/^2507\\d{8}$/.test(normalizedPhone)) {
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
