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
            credential: admin.credential.cert(serviceAccount)
        });
        console.log('✅ Firebase Admin ligado com sucesso!');
    } catch (error) {
        console.error('❌ Erro de inicialização do Firebase:', error.message);
        throw error;
    }
}

const db = admin.firestore();

module.exports = { admin, db };