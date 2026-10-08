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
                atendente: null,
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
        if (!chatId) return res.json({ mensagens: [], status: null });

        const doc = await db.collection('chats').doc(String(chatId).trim()).get();
        if (doc.exists) {
            const data = doc.data();
            return res.json({ mensagens: data.mensagens || [], status: data.status, nps: data.nps || null });
        }
        res.json({ mensagens: [], status: null });
    } catch (erro) {
        console.error('[ERRO buscar mensagens]', erro);
        res.status(500).json({ mensagens: [], status: null });
    }
});

// NOVA ROTA: Envio de Avaliação NPS do Cliente
router.post('/atendimento/nps', async (req, res) => {
    try {
        const { chatId, nota, comentario } = req.body;
        const idLimpo = String(chatId).trim();
        const chatRef = db.collection('chats').doc(idLimpo);
        const doc = await chatRef.get();

        if (doc.exists) {
            await chatRef.update({
                nps: {
                    nota: Number(nota),
                    comentario: comentario || '',
                    avaliadoEm: admin.firestore.FieldValue.serverTimestamp()
                },
                mensagens: admin.firestore.FieldValue.arrayUnion({ 
                    de: 'sistema', 
                    texto: `⭐ Cliente avaliou o atendimento com nota ${nota}/5.` 
                })
            });
            return res.json({ sucesso: true });
        }
        res.status(404).json({ sucesso: false, erro: 'Chat não encontrado' });
    } catch (erro) {
        console.error('[ERRO nps]', erro);
        res.status(500).json({ sucesso: false });
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

router.get('/atendimento/historico', async (req, res) => {
    try {
        const snapshot = await db.collection('chats').where('status', '==', 'Encerrado').get();
        const historico = [];

        snapshot.forEach(doc => {
            historico.push(doc.data());
        });

        res.json({ historico });
    } catch (erro) {
        console.error('[ERRO buscar historico]', erro);
        res.status(500).json({ historico: [] });
    }
});

router.post('/atendimento/assumir', async (req, res) => {
    try {
        const { chatId, atendente } = req.body;
        const idLimpo = String(chatId).trim();
        const chatRef = db.collection('chats').doc(idLimpo);
        const doc = await chatRef.get();

        if (doc.exists) {
            const nomeAtendente = atendente || 'Atendente Lello';
            await chatRef.update({ 
                status: 'Em Atendimento',
                atendente: nomeAtendente
            });
            const conversaAtualizada = (await chatRef.get()).data();
            return res.json({ sucesso: true, conversa: conversaAtualizada });
        }

        res.status(404).json({ sucesso: false, erro: 'Chat não encontrado' });
    } catch (erro) {
        console.error('[ERRO assumir]', erro);
        res.status(500).json({ sucesso: false });
    }
});

// NOVA ROTA: Transferir Atendimento para outro Operador
router.post('/atendimento/transferir', async (req, res) => {
    try {
        const { chatId, novoAtendente, antigoAtendente } = req.body;
        const idLimpo = String(chatId).trim();
        const chatRef = db.collection('chats').doc(idLimpo);
        const doc = await chatRef.get();

        if (doc.exists) {
            await chatRef.update({ 
                atendente: novoAtendente,
                mensagens: admin.firestore.FieldValue.arrayUnion({ 
                    de: 'sistema', 
                    texto: `🔄 Atendimento transferido por ${antigoAtendente || 'Operador'} para ${novoAtendente}.` 
                })
            });
            return res.json({ sucesso: true });
        }

        res.status(404).json({ sucesso: false, erro: 'Chat não encontrado' });
    } catch (erro) {
        console.error('[ERRO transferir]', erro);
        res.status(500).json({ sucesso: false });
    }
});

router.post('/atendimento/responder', async (req, res) => {
    try {
        const { chatId, mensagem, atendente } = req.body;
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
            const nomeAtendente = atendente || 'Atendente Lello';
            await chatRef.update({
                mensagens: admin.firestore.FieldValue.arrayUnion({ 
                    de: 'atendente', 
                    texto: mensagem,
                    autor: nomeAtendente 
                })
            });
            return res.json({ sucesso: true });
        }

        res.status(400).json({ sucesso: false, erro: 'Mensagem vazia' });
    } catch (erro) {
        console.error('[ERRO responder]', erro);
        res.status(500).json({ sucesso: false });
    }
});

router.post('/atendimento/encerrar', async (req, res) => {
    try {
        const { chatId } = req.body;
        const idLimpo = String(chatId).trim();
        const chatRef = db.collection('chats').doc(idLimpo);
        const doc = await chatRef.get();

        if (doc.exists) {
            await chatRef.update({ 
                status: 'Encerrado',
                encerradoEm: admin.firestore.FieldValue.serverTimestamp(),
                mensagens: admin.firestore.FieldValue.arrayUnion({ 
                    de: 'sistema', 
                    texto: 'Atendimento encerrado pelo operador.' 
                })
            });
            return res.json({ sucesso: true });
        }

        res.status(404).json({ sucesso: false, erro: 'Chat não encontrado' });
    } catch (erro) {
        console.error('[ERRO encerrar]', erro);
        res.status(500).json({ sucesso: false });
    }
});

// NOVAS ROTAS: Status de Presença do Operador & Lista para Transferência
router.post('/operador/status', async (req, res) => {
    try {
        const { email, nome, status } = req.body;
        if (!email) return res.status(400).json({ erro: 'Email do operador é obrigatório' });

        const opRef = db.collection('operadores').doc(String(email).trim());
        await opRef.set({
            email,
            nome: nome || email,
            status: status || 'disponivel',
            atualizadoEm: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        res.json({ sucesso: true });
    } catch (erro) {
        console.error('[ERRO status operador]', erro);
        res.status(500).json({ erro: 'Erro ao atualizar status' });
    }
});

router.get('/operadores/lista', async (req, res) => {
    try {
        const snapshot = await db.collection('operadores').get();
        const operadores = [];
        snapshot.forEach(doc => operadores.push(doc.data()));
        res.json({ operadores });
    } catch (erro) {
        console.error('[ERRO buscar operadores]', erro);
        res.status(500).json({ operadores: [] });
    }
});

// NOVA ROTA: Obter Respostas Rápidas (Templates)
router.get('/atendimento/respostas-rapidas', (req, res) => {
    const respostas = [
        { id: 1, titulo: '👋 Boas-vindas', texto: 'Olá! Sou o atendente responsável pelo seu atendimento. Como posso te ajudar hoje?' },
        { id: 2, titulo: '⏳ Aguarde', texto: 'Estou consultando as informações no sistema, um momento por favor.' },
        { id: 3, titulo: '📄 2ª Via Boleto', texto: 'Para baixar a 2ª via atualizada do boleto, acesse a área do cliente no portal Lello.' },
        { id: 4, titulo: '✅ Encerramento', texto: 'Foi um prazer te atender! Se precisar de algo mais, estamos à disposição. Tenha um excelente dia!' }
    ];
    res.json({ respostas });
});

module.exports = router;