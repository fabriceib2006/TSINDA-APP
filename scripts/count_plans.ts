import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import config from '../firebase-applet-config.json';
const app = initializeApp(config);
const db = getFirestore(app);
async function run() {
    try {
        const snap = await getDocs(collection(db, 'plans'));
        console.log(JSON.stringify({ count: snap.size }));
    } catch (e) {
        console.error(e);
    }
}
run();
