const admin = require('firebase-admin');

// Garante que o Firebase é inicializado apenas uma vez no ambiente Serverless da Vercel
if (!admin.apps || admin.apps.length === 0) {
    try {
        if (!process.env.FIREBASE_CREDENTIALS) {
            throw new Error("A variável FIREBASE_CREDENTIALS não foi encontrada nas variáveis de ambiente.");
        }

        const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);

        // Corrige a formatação das quebras de linha da private_key na Vercel
        if (serviceAccount.private_key) {
            serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
        }

        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            // Adicionado suporte ao Storage (Insira o link do seu bucket nas variáveis de ambiente)
            storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${serviceAccount.project_id}.appspot.com` 
        });
        
        console.log('✅ Firebase Admin ligado com sucesso (Firestore + Storage)!');
    } catch (error) {
        console.error('❌ Erro de inicialização do Firebase:', error.message);
        throw error;
    }
}

const db = admin.firestore();
const bucket = admin.storage().bucket(); // Instância do Storage Bucket

module.exports = { admin, db, bucket };