const admin = require('firebase-admin');

// GitHub Secret থেকে অন্য প্রোজেক্টের সার্ভিস অ্যাকাউন্ট লোড
const sourceServiceAccount = JSON.parse(process.env.SOURCE_FIREBASE_SA);

// ============================================
// ১. অন্য প্রোজেক্ট (যেখান থেকে ডেটা আসবে)
// ============================================
const sourceApp = admin.initializeApp({
    credential: admin.credential.cert(sourceServiceAccount)
}, 'sourceApp');
const sourceDb = sourceApp.firestore();

// ============================================
// ২. আপনার বর্তমান প্রোজেক্ট (যেখানে ডেটা সেভ হবে)
// ============================================
// আপনার বর্তমান Firebase প্রোজেক্টের Admin SDK
// লোকালি টেস্ট করতে চাইলে GOOGLE_APPLICATION_CREDENTIALS সেট করুন
// GitHub Actions-এ এটি অটোমেটিক কাজ করে (যদি firebase init করা থাকে)
if (!admin.apps.length) {
    admin.initializeApp();
}
const targetDb = admin.firestore();

// ============================================
// ৩. একটি কালেকশন সিঙ্ক করার ফাংশন
// ============================================
async function syncCollection(collectionName) {
    console.log(`⏳ সিঙ্ক শুরু: ${collectionName}`);
    
    try {
        // সোর্স থেকে সব ডকুমেন্ট পড়ি
        const snapshot = await sourceDb.collection(collectionName).get();
        
        if (snapshot.empty) {
            console.log(`❌ ${collectionName} - কোনো ডকুমেন্ট নেই`);
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
            
            // Firestore batch-এ সর্বোচ্চ 500টি অপারেশন
            if (batchCount === 500) {
                await batch.commit();
                console.log(`   ${collectionName}: ${count} ডকুমেন্ট প্রসেসিং...`);
                batch = targetDb.batch();
                batchCount = 0;
            }
        }
        
        // বাকি ডকুমেন্ট কমিট
        if (batchCount > 0) {
            await batch.commit();
        }
        
        console.log(`✅ ${collectionName}: ${count} টি ডকুমেন্ট সিঙ্ক হয়েছে`);
        return count;
        
    } catch (error) {
        console.error(`❌ ${collectionName} সিঙ্ক ব্যর্থ:`, error.message);
        return 0;
    }
}

// ============================================
// ৪. তিনটি কালেকশন একসাথে সিঙ্ক করা
// ============================================
async function syncAll() {
    console.log('🚀 সিঙ্ক প্রসেস শুরু...');
    console.log(`📅 সময়: ${new Date().toLocaleString('bn-BD', { timeZone: 'Asia/Dhaka' })}`);
    
    const collections = [
        'cse_detailed_data',
        'dse_daily_index', 
        'dse_dividend_data'
    ];
    
    let total = 0;
    for (const col of collections) {
        total += await syncCollection(col);
    }
    
    console.log(`🎉 মোট ${total} টি ডকুমেন্ট সিঙ্ক সম্পন্ন!`);
}

// ============================================
// ৫. স্ক্রিপ্ট রান করা
// ============================================
syncAll().catch((error) => {
    console.error('❌ সিঙ্ক প্রসেস ব্যর্থ:', error);
    process.exit(1);
});
