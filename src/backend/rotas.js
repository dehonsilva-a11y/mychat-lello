const express = require('express');
const router = express.Router();
const { admin, db } = require('./firebase');

// --- ROTAS DO CLIENTE (WIDGET) ---

router.post('/iniciar', async (req, res) => {
    try {
        const { nome, email, assunto, verificado, clienteId } = req.body;
        const id = clienteId ? String(clienteId).trim() : ('cliente_' + Math.floor(Math.random() * 90000 + 10000));
        const rotuloModo = verificado ? '[Verificado]' : '[Declarado]';

        const chatRef = db.collection('chats').doc(id);
        const doc = await chatRef.get();

        if (!doc.exists) {
            await chatRef.set({
                id,
                nome: `${nome || 'Cliente'} ${rotuloModo}`,
                email: email || 'Não informado',
                origem: assunto || 'Geral',
                status: 'Aguardando',
                mensagens: [],
                criadoEm: admin.firestore.FieldValue.serverTimestamp()
            });
        }

        const snapshot = await db.collection('chats').where('status', '==', 'Aguardando').get();
        const posicao = snapshot.size;

        res.json({ 
            status: 'Na fila', 
            posicao: posicao > 0 ? posicao : 1, 
            tempoEstimado: '1 min',
            chatId: id
        });
    } catch (erro) {
        console.error('[ERRO iniciar]', erro);
        res.status(500).json({ erro: 'Erro interno ao iniciar chat' });
    }
});

router.post('/mensagem', async (req, res) => {
    try {
        const { mensagem, chatId } = req.body;
        const idLimpo = String(chatId).trim();
        const chatRef = db.collection('chats').doc(idLimpo);
        const doc = await chatRef.get();

        if (!doc.exists) {
            await chatRef.set({
                id: idLimpo,
                nome: 'Cliente (Sessão Restaurada)',
                origem: 'Recuperação Automática',
                status: 'Em Atendimento',
                mensagens: [],
                criadoEm: admin.firestore.FieldValue.serverTimestamp()
            });
        }

        if (mensagem) {
            await chatRef.update({
                mensagens: admin.firestore.FieldValue.arrayUnion({ de: 'cliente', texto: mensagem })
            });
        }

        res.json({ sucesso: true });
    } catch (erro) {
        console.error('[ERRO mensagem cliente]', erro);
        res.status(500).json({ erro: 'Erro ao enviar mensagem' });
    }
});

router.get('/mensagem/cliente', async (req, res) => {
    try {
        const { chatId } = req.query;
        if (!chatId) return res.json({ mensagens: [] });

        const doc = await db.collection('chats').doc(String(chatId).trim()).get();
        res.json({ mensagens: doc.exists ? doc.data().mensagens : [] });
    } catch (erro) {
        console.error('[ERRO buscar mensagens]', erro);
        res.status(500).json({ mensagens: [] });
    }
});

// --- ROTAS DO PAINEL DO COLABORADOR ---

router.get('/atendimento/lista', async (req, res) => {
    try {
        const snapshot = await db.collection('chats').get();
        const fila = [];
        const emAtendimento = [];

        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.status === 'Aguardando') fila.push(data);
            if (data.status === 'Em Atendimento') emAtendimento.push(data);
        });

        res.json({ fila, emAtendimento });
    } catch (erro) {
        console.error('[ERRO buscar lista]', erro);
        res.status(500).json({ fila: [], emAtendimento: [] });
    }
});

router.post('/atendimento/assumir', async (req, res) => {
    try {
        const { chatId } = req.body;
        const idLimpo = String(chatId).trim();
        const chatRef = db.collection('chats').doc(idLimpo);
        const doc = await chatRef.get();

        if (doc.exists) {
            await chatRef.update({ status: 'Em Atendimento' });
            const conversaAtualizada = (await chatRef.get()).data();
            return res.json({ sucesso: true, conversa: conversaAtualizada });
        }

        res.status(404).json({ sucesso: false, erro: 'Chat não encontrado' });
    } catch (erro) {
        console.error('[ERRO assumir]', erro);
        res.status(500).json({ sucesso: false });
    }
});

router.post('/atendimento/responder', async (req, res) => {
    try {
        const { chatId, mensagem } = req.body;
        const idLimpo = String(chatId).trim();
        const chatRef = db.collection('chats').doc(idLimpo);
        const doc = await chatRef.get();

        if (!doc.exists) {
            await chatRef.set({
                id: idLimpo,
                nome: 'Cliente (Sessão Restaurada)',
                origem: 'Recuperação Automática',
                status: 'Em Atendimento',
                mensagens: [],
                criadoEm: admin.firestore.FieldValue.serverTimestamp()
            });
        }

        if (mensagem) {
            await chatRef.update({
                mensagens: admin.firestore.FieldValue.arrayUnion({ de: 'atendente', texto: mensagem })
            });
            return res.json({ sucesso: true });
        }

        res.status(400).json({ sucesso: false, erro: 'Mensagem vazia' });
    } catch (erro) {
        console.error('[ERRO responder]', erro);
        res.status(500).json({ sucesso: false });
    }
});

module.exports = router;