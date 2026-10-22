import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

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

async function migrate() {
    console.log("Starting migration (Admin SDK)...");
    
    // 1. Update Plans
    const plansSnap = await db.collection('plans').get();
    for (const pDoc of plansSnap.docs) {
        const data = pDoc.data();
        const isStudyPlan = Boolean(data.access?.trafficRules || data.access?.lessonVideos);
        if (!isStudyPlan && data.durationDays !== 0) {
            console.log(`Fixing plan ${pDoc.id}: durationDays -> 0`);
            await pDoc.ref.update({ durationDays: 0 });
        }
    }

    // 2. Update Subscriptions
    const subsSnap = await db.collection('subscriptions').get();
    const farFuture = new Date(3000, 0, 1).toISOString();
    for (const sDoc of subsSnap.docs) {
        const data = sDoc.data();
        const isStudyPlan = Boolean(data.access?.trafficRules || data.access?.lessonVideos);
        if (!isStudyPlan && data.endDate !== farFuture) {
            console.log(`Fixing subscription ${sDoc.id}: endDate -> far future`);
            await sDoc.ref.update({ endDate: farFuture });
        }
    }
    
    console.log("Migration complete.");
}

migrate().catch(console.error);
