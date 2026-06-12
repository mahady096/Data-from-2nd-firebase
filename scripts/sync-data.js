const admin = require('firebase-admin');

// DEBUG: নিশ্চিত হওয়া যে সিক্রেট আছে
if (!process.env.SOURCE_FIREBASE_SA) {
    console.error('❌ SOURCE_FIREBASE_SA সিক্রেট পাওয়া যায়নি!');
    process.exit(1);
}

let sourceServiceAccount;
try {
    sourceServiceAccount = JSON.parse(process.env.SOURCE_FIREBASE_SA);
    console.log('✅ সোর্স প্রোজেক্টের JSON সফলভাবে পার্স হয়েছে।');
} catch (e) {
    console.error('❌ JSON পার্স করতে ব্যর্থ:', e.message);
    process.exit(1);
}

// সোর্স অ্যাপ (যেখান থেকে ডেটা আসবে)
const sourceApp = admin.initializeApp({
    credential: admin.credential.cert(sourceServiceAccount)
}, 'sourceApp');
const sourceDb = sourceApp.firestore();

// টার্গেট অ্যাপ (আপনার বর্তমান প্রোজেক্ট) – লোকাল টেস্টের জন্য ENV সেট করুন
// GitHub Actions-এ DEFAULT অ্যাপ ব্যবহার করতে নিচের লাইনটি আনকমেন্ট করুন
if (admin.apps.length === 0) {
    admin.initializeApp(); // DEFAULT প্রোজেক্ট (যার সাথে firebase init করা আছে)
}
const targetDb = admin.firestore();

async function syncCollection(collectionName) {
    console.log(`⏳ সিঙ্ক শুরু: ${collectionName}`);
    try {
        const snapshot = await sourceDb.collection(collectionName).get();
        console.log(`   ডকুমেন্ট সংখ্যা: ${snapshot.size}`);
        if (snapshot.empty) {
            console.log(`⚠️ ${collectionName} খালি, কিছু করার নেই।`);
            return 0;
        }

        let batch = targetDb.batch();
        let count = 0;
        let batchCount = 0;
        for (const doc of snapshot.docs) {
            const targetRef = targetDb.collection(collectionName).doc(doc.id);
            batch.set(targetRef, doc.data(), { merge: true });
            count++;
            batchCount++;
            if (batchCount === 500) {
                await batch.commit();
                batch = targetDb.batch();
                batchCount = 0;
            }
        }
        if (batchCount > 0) await batch.commit();
        console.log(`✅ ${collectionName}: ${count} টি ডকুমেন্ট সিঙ্ক হয়েছে।`);
        return count;
    } catch (err) {
        console.error(`❌ ${collectionName} সিঙ্ক ব্যর্থ:`, err.message);
        throw err;
    }
}

async function syncAll() {
    console.log('🚀 সিঙ্ক প্রসেস শুরু...');
    const collections = ['cse_detailed_data', 'dse_daily_index', 'dse_dividend_data'];
    let total = 0;
    for (const col of collections) {
        total += await syncCollection(col);
    }
    console.log(`🎉 সমাপ্ত! মোট ${total} ডকুমেন্ট সিঙ্ক হয়েছে।`);
}

syncAll().catch(err => {
    console.error('❌ সিঙ্ক প্রসেস ব্যর্থ:', err);
    process.exit(1);
});
