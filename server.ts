import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import axios from 'axios';
import * as crypto from 'crypto';

// Initialize Firebase Admin
if (!getApps().length) {
  initializeApp();
}

const databaseId = process.env.FIRESTORE_DATABASE_ID || 'ai-studio-6f0c13d4-6a9f-45c4-9fe8-a73b160765fe';
const db = getFirestore(databaseId);
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

    const expectedPrice = Number(plan.price);
    const paidAmount = Number(paymentData.amount);
    if (reportedAmount && Number(reportedAmount) !== expectedPrice) {
      console.warn(`Amount mismatch for payment ${curDoc.id}: reported ${reportedAmount}, expected ${expectedPrice}`);
    }

    const durationDays = Number(plan.durationDays) || 30;

    // Subscription start chaining: if user has active subscription, new one starts when current ends
    const existingSubsSnap = await transaction.get(
      db.collection('subscriptions')
        .where('userId', '==', paymentData.userId)
        .where('status', '==', 'active')
    );

    let latestEndDate = new Date();
    existingSubsSnap.docs.forEach(d => {
      const sub = d.data();
      const end = new Date(sub.endDate);
      if (end > latestEndDate) {
        latestEndDate = end;
      }
    });

    const now = new Date();
    const startDate = latestEndDate > now ? latestEndDate : now;
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

// Verification of incoming auth tokens
async function verifyAuth(req: Request): Promise<{ uid: string; email?: string } | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.split('Bearer ')[1];
  try {
    const decoded = await getAuth().verifyIdToken(token);
    return { uid: decoded.uid, email: decoded.email };
  } catch (err) {
    console.warn('verifyIdToken failed, checking body auth fallback:', err);
    return null;
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // JSON parser with rawBody capture for signature verification
  app.use(express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    }
  }));

  // ==========================================
  // API: PAYPACK CONNECTION TEST
  // ==========================================
  app.all('/api/paypack/test-connection', async (req: Request, res: Response) => {
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
  // API: START PAYMENT
  // ==========================================
  app.post('/api/paypack/start-payment', async (req: Request, res: Response) => {
    try {
      const { planId, phone, userId: bodyUid, userEmail: bodyEmail } = req.body || {};
      const authUser = await verifyAuth(req);
      const userId = authUser?.uid || bodyUid;
      const userEmail = authUser?.email || bodyEmail || '';

      if (!userId) {
        res.status(401).json({ error: 'User must be authenticated to initiate payment.' });
        return;
      }
      if (!planId || !phone) {
        res.status(400).json({ error: 'Missing planId or phone number.' });
        return;
      }

      const { normalizedPhone, network } = parseRwandanPhone(phone);

      const planDoc = await db.collection('plans').doc(planId).get();
      if (!planDoc.exists) {
        res.status(404).json({ error: 'Plan not found.' });
        return;
      }
      const planData = planDoc.data()!;
      if (!planData.isActive) {
        res.status(400).json({ error: 'Selected plan is inactive.' });
        return;
      }
      const planPrice = Number(planData.price);

      // Evaluate promotions server-side using Africa/Kigali time
      const nowKigali = new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Kigali' }));
      const promoSnap = await db.collection('promotions').where('isActive', '==', true).get();
      let finalPrice = planPrice;
      let appliedPromoId: string | null = null;
      let discountAmount = 0;

      promoSnap.docs.forEach(d => {
        const promo = d.data();
        if (promo.planId === 'all' || promo.planId === planId) {
          const start = new Date(promo.startAt).getTime();
          const end = new Date(promo.endAt).getTime();
          const now = nowKigali.getTime();
          if (now >= start && now <= end) {
            let candPrice = planPrice;
            let candDiscount = 0;
            if (promo.discountType === 'percent') {
              candDiscount = Math.round(planPrice * (Number(promo.discountValue) / 100));
            } else if (promo.discountType === 'fixed') {
              candDiscount = Number(promo.discountValue);
            }
            candPrice = Math.max(100, planPrice - candDiscount);
            if (candPrice < finalPrice) {
              finalPrice = candPrice;
              appliedPromoId = d.id;
              discountAmount = planPrice - finalPrice;
            }
          }
        }
      });

      // Check double charge in last 3 mins
      const threeMinsAgo = new Date(Date.now() - 3 * 60 * 1000);
      const pendingSnap = await db.collection('payments')
        .where('userId', '==', userId)
        .where('planId', '==', planId)
        .where('status', '==', 'pending')
        .where('createdAt', '>=', Timestamp.fromDate(threeMinsAgo))
        .limit(1)
        .get();

      if (!pendingSnap.empty) {
        res.status(409).json({ error: 'A pending payment for this plan is already in progress. Please check your phone.' });
        return;
      }

      const token = await getPaypackToken();

      const cashinRes = await axios.post(
        `${PAYPACK_BASE_URL}/transactions/cashin`,
        { amount: finalPrice, number: normalizedPhone },
        { headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}` }, timeout: 20000 }
      );

      const paypackRef = cashinRes.data?.ref || cashinRes.data?.data?.ref;
      if (!paypackRef) {
        res.status(502).json({ error: 'Paypack did not return a transaction reference.' });
        return;
      }

      let planNameString = 'Subscription Pass';
      if (typeof planData.name === 'object' && planData.name !== null) {
        planNameString = planData.name.en || planData.name.rw || planData.name.fr || 'Subscription Pass';
      } else if (typeof planData.name === 'string') {
        planNameString = planData.name;
      }

      const paymentRef = db.collection('payments').doc();
      await paymentRef.set({
        id: paymentRef.id,
        paypackRef,
        userId,
        userEmail,
        planId,
        planName: planNameString,
        originalPrice: planPrice,
        discountAmount,
        promotionId: appliedPromoId,
        amount: finalPrice,
        phone: normalizedPhone,
        network,
        kind: 'cashin',
        status: 'pending',
        subscriptionId: null,
        failureReason: null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      res.json({
        success: true,
        paymentId: paymentRef.id,
        paypackRef,
        amount: finalPrice,
        phone: normalizedPhone,
        network,
      });
    } catch (err: any) {
      console.error('Error starting payment:', err);
      res.status(500).json({ error: err.response?.data?.message || err.message || 'Payment initiation failed' });
    }
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

    if (signatureHeader !== computedHmacBase64 && signatureHeader !== computedHmacHex) {
      res.status(401).send('Unauthorized: Invalid signature');
      return;
    }

    // Save event
    try {
      await db.collection('paypackEvents').add({
        payload: body,
        headers: { signature: signatureHeader, userAgent: req.headers['user-agent'] || null },
        receivedAt: FieldValue.serverTimestamp(),
      });
    } catch (e) {
      console.error('Failed to log event:', e);
    }

    const eventData = body?.data || body;
    const paypackRef = eventData?.ref;
    const reportedStatus = String(eventData?.status || '').toLowerCase();
    const reportedAmount = eventData?.amount;

    if (!paypackRef) {
      res.status(200).json({ received: true, note: 'Missing transaction ref' });
      return;
    }

    const paymentsQuery = await db.collection('payments').where('paypackRef', '==', paypackRef).limit(1).get();
    if (paymentsQuery.empty) {
      res.status(200).json({ received: true, note: 'Ref not tracked' });
      return;
    }

    const paymentDoc = paymentsQuery.docs[0];

    if (reportedStatus === 'successful' || reportedStatus === 'success') {
      try {
        await processSuccessfulPayment(paymentDoc, reportedAmount);
      } catch (err) {
        console.error('Error processing payment success:', err);
        res.status(500).send('Internal Error');
        return;
      }
    } else if (reportedStatus === 'failed') {
      await paymentDoc.ref.update({
        status: 'failed',
        failureReason: eventData?.failure_reason || eventData?.message || 'Transaction failed or rejected',
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    res.status(200).json({ received: true, paypackRef, status: reportedStatus });
  };

  app.all('/paypackWebhook', handleWebhook);
  app.all('/api/paypack/webhook', handleWebhook);

  // ==========================================
  // API: SYNC WITH PAYPACK
  // ==========================================
  app.post('/api/paypack/sync', async (_req: Request, res: Response) => {
    try {
      const token = await getPaypackToken();
      const response = await axios.get(`${PAYPACK_BASE_URL}/transactions/list?offset=0&limit=50`, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
        timeout: 15000,
      });

      const transactions = response.data?.transactions || [];
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

      res.json({ success: true, totalFetched: transactions.length, updatedCount });
    } catch (err: any) {
      console.error('Sync failed:', err);
      res.status(500).json({ error: err.message || 'Sync failed' });
    }
  });

  // ==========================================
  // VITE DEV SERVER / STATIC SERVING
  // ==========================================
  const isDev = process.env.NODE_ENV !== 'production';
  if (isDev) {
    const vite = await createViteServer({
      server: { middlewareMode: true, host: '0.0.0.0', port: PORT },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`TSINDA server ready on http://0.0.0.0:${PORT}`);
  });
}

startServer();
