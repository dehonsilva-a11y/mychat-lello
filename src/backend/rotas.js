const express = require('express');
const router = express.Router();
const { admin, db } = require('./firebase');

// --- ROTAS DE CONFIGURAÇÃO & PERFIL ---

// Obter perfil do operador (Admin vs Colaborador)
router.get('/operador/perfil', async (req, res) => {
    try {
        const { email } = req.query;
        if (!email) return res.status(400).json({ erro: 'Email não informado' });

        const emailLimpo = String(email).trim().toLowerCase();
        const doc = await db.collection('operadores').doc(emailLimpo).get();

        if (doc.exists) {
            return res.json(doc.data());
        }

        // Perfil padrão se ainda não estiver cadastrado no banco
        const perfilPadrao = {
            email: emailLimpo,
            nome: emailLimpo.split('@')[0],
            funcao: 'colaborador',
            status: 'disponivel',
            assuntos: []
        };

        res.json(perfilPadrao);
    } catch (erro) {
        console.error('[ERRO obter perfil]', erro);
        res.status(500).json({ erro: 'Erro ao buscar perfil' });
    }
});

// --- ROTAS DO CLIENTE (WIDGET) ---

// Obter assuntos dinâmicos para a triagem do widget
router.get('/assuntos', async (req, res) => {
    try {
        const doc = await db.collection('configuracoes').doc('assuntos').get();
        if (doc.exists && doc.data().lista && doc.data().lista.length > 0) {
            return res.json({ assuntos: doc.data().lista });
        }
        // Lista padrão de contingência
        const listaPadrao = [
            'Geral',
            'Financeiro / Boletos',
            'Manutenção / Ocorrências',
            'Condomínio / Cadastro'
        ];
        res.json({ assuntos: listaPadrao });
    } catch (erro) {
        console.error('[ERRO buscar assuntos]', erro);
        res.status(500).json({ assuntos: ['Geral', 'Financeiro / Boletos'] });
    }
});

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
            return res.json({ mensagens: data.mensagens || [], status: data.status, nps: data.nps || null, origem: data.origem });
        }
        res.json({ mensagens: [], status: null });
    } catch (erro) {
        console.error('[ERRO buscar mensagens]', erro);
        res.status(500).json({ mensagens: [], status: null });
    }
});

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

// Assumir atendimento + Mensagem Automática Padrão de Boas-vindas
router.post('/atendimento/assumir', async (req, res) => {
    try {
        const { chatId, atendente } = req.body;
        const idLimpo = String(chatId).trim();
        const chatRef = db.collection('chats').doc(idLimpo);
        const doc = await chatRef.get();

        if (doc.exists) {
            const nomeAtendente = atendente || 'Atendente Lello';
            const mensagemBoasVindas = `Olá! Sou o ${nomeAtendente} responsável pelo seu atendimento. Como posso te ajudar hoje?`;

            await chatRef.update({ 
                status: 'Em Atendimento',
                atendente: nomeAtendente,
                mensagens: admin.firestore.FieldValue.arrayUnion({
                    de: 'atendente',
                    texto: mensagemBoasVindas,
                    autor: nomeAtendente,
                    automatica: true
                })
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

// Alterar Assunto/Tag do Atendimento
router.post('/atendimento/alterar-assunto', async (req, res) => {
    try {
        const { chatId, novoAssunto, operador } = req.body;
        const idLimpo = String(chatId).trim();
        const chatRef = db.collection('chats').doc(idLimpo);
        const doc = await chatRef.get();

        if (doc.exists) {
            const antigoAssunto = doc.data().origem;
            await chatRef.update({
                origem: novoAssunto,
                mensagens: admin.firestore.FieldValue.arrayUnion({
                    de: 'sistema',
                    texto: `🏷️ Assunto alterado de "${antigoAssunto || 'Geral'}" para "${novoAssunto}" por ${operador || 'Operador'}.`
                })
            });
            return res.json({ sucesso: true });
        }
        res.status(404).json({ sucesso: false, erro: 'Chat não encontrado' });
    } catch (erro) {
        console.error('[ERRO alterar assunto]', erro);
        res.status(500).json({ sucesso: false });
    }
});

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

// Encerrar atendimento com Tabulação (Resolvido / Não Resolvido)
router.post('/atendimento/encerrar', async (req, res) => {
    try {
        const { chatId, resolvido, motivoNaoResolvido } = req.body;
        const idLimpo = String(chatId).trim();
        const chatRef = db.collection('chats').doc(idLimpo);
        const doc = await chatRef.get();

        if (doc.exists) {
            const statusResolucao = resolvido ? 'Resolvido' : `Não Resolvido (${motivoNaoResolvido || 'Sem motivo'})`;

            await chatRef.update({ 
                status: 'Encerrado',
                tabulacao: {
                    resolvido: Boolean(resolvido),
                    motivoNaoResolvido: motivoNaoResolvido || null,
                    encerradoEm: admin.firestore.FieldValue.serverTimestamp()
                },
                encerradoEm: admin.firestore.FieldValue.serverTimestamp(),
                mensagens: admin.firestore.FieldValue.arrayUnion({ 
                    de: 'sistema', 
                    texto: `Atendimento encerrado pelo operador. Tabulação: ${statusResolucao}` 
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

// Status de Presença do Operador
router.post('/operador/status', async (req, res) => {
    try {
        const { email, nome, status } = req.body;
        if (!email) return res.status(400).json({ erro: 'Email do operador é obrigatório' });

        const emailLimpo = String(email).trim().toLowerCase();
        const opRef = db.collection('operadores').doc(emailLimpo);

        await opRef.set({
            email: emailLimpo,
            nome: nome || emailLimpo,
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

router.get('/atendimento/respostas-rapidas', (req, res) => {
    const respostas = [
        { id: 1, titulo: '👋 Boas-vindas', texto: 'Olá! Sou o atendente responsável pelo seu atendimento. Como posso te ajudar hoje?' },
        { id: 2, titulo: '⏳ Aguarde', texto: 'Estou consultando as informações no sistema, um momento por favor.' },
        { id: 3, titulo: '📄 2ª Via Boleto', texto: 'Para baixar a 2ª via atualizada do boleto, acesse a área do cliente no portal Lello.' },
        { id: 4, titulo: '✅ Encerramento', texto: 'Foi um prazer te atender! Se precisar de algo mais, estamos à disposição. Tenha um excelente dia!' }
    ];
    res.json({ respostas });
});

// --- ROTAS EXCLUSIVAS DO PAINEL ADMIN (GESTÃO & METRICAS) ---

// Obter Indicadores e Métricas do Dashboard (NPS, TMA, Volumes)
router.get('/admin/metrics', async (req, res) => {
    try {
        const snapshot = await db.collection('chats').get();

        let total = 0;
        let fila = 0;
        let emAtendimento = 0;
        let encerrados = 0;

        let somaNps = 0;
        let qtdNps = 0;

        let somaDuracaoSegundos = 0;
        let qtdDuracao = 0;

        const opMap = {};
        const assuntoMap = {};

        snapshot.forEach(doc => {
            const data = doc.data();
            total++;

            if (data.status === 'Aguardando') fila++;
            else if (data.status === 'Em Atendimento') emAtendimento++;
            else if (data.status === 'Encerrado') encerrados++;

            // Agrupamento por Assunto
            const assunto = data.origem || 'Geral';
            assuntoMap[assunto] = (assuntoMap[assunto] || 0) + 1;

            // Agrupamento por Operador
            if (data.atendente) {
                if (!opMap[data.atendente]) {
                    opMap[data.atendente] = { atendimentos: 0, encerrados: 0, somaNps: 0, qtdNps: 0 };
                }
                opMap[data.atendente].atendimentos++;
                if (data.status === 'Encerrado') {
                    opMap[data.atendente].encerrados++;
                }
            }

            // Cálculo do NPS
            if (data.nps && typeof data.nps.nota === 'number') {
                somaNps += data.nps.nota;
                qtdNps++;

                if (data.atendente && opMap[data.atendente]) {
                    opMap[data.atendente].somaNps += data.nps.nota;
                    opMap[data.atendente].qtdNps++;
                }
            }

            // Cálculo do TMA (Tempo Médio de Atendimento)
            if (data.criadoEm && data.encerradoEm) {
                const inicio = data.criadoEm.toDate ? data.criadoEm.toDate().getTime() : new Date(data.criadoEm).getTime();
                const fim = data.encerradoEm.toDate ? data.encerradoEm.toDate().getTime() : new Date(data.encerradoEm).getTime();

                if (fim > inicio) {
                    somaDuracaoSegundos += (fim - inicio) / 1000;
                    qtdDuracao++;
                }
            }
        });

        const mediaNps = qtdNps > 0 ? (somaNps / qtdNps).toFixed(1) : '-';
        const tmaMinutos = qtdDuracao > 0 ? (somaDuracaoSegundos / qtdDuracao / 60).toFixed(1) : '0';

        const porOperador = Object.keys(opMap).map(nome => ({
            nome,
            atendimentos: opMap[nome].atendimentos,
            encerrados: opMap[nome].encerrados,
            npsMedia: opMap[nome].qtdNps > 0 ? (opMap[nome].somaNps / opMap[nome].qtdNps).toFixed(1) : '-'
        }));

        const porAssunto = Object.keys(assuntoMap).map(assunto => ({
            assunto,
            quantidade: assuntoMap[assunto]
        }));

        res.json({
            total,
            fila,
            emAtendimento,
            encerrados,
            npsMedia: mediaNps,
            qtdNps,
            tmaMinutos,
            porOperador,
            porAssunto
        });
    } catch (erro) {
        console.error('[ERRO metricas]', erro);
        res.status(500).json({ erro: 'Erro ao calcular métricas' });
    }
});

// Cadastrar / Editar Colaborador com Múltiplos Assuntos
router.post('/admin/operadores/salvar', async (req, res) => {
    try {
        const { email, nome, funcao, assuntos } = req.body;
        if (!email) return res.status(400).json({ erro: 'Email é obrigatório' });

        const emailLimpo = String(email).trim().toLowerCase();
        const opRef = db.collection('operadores').doc(emailLimpo);

        await opRef.set({
            email: emailLimpo,
            nome: nome || emailLimpo.split('@')[0],
            funcao: funcao || 'colaborador',
            assuntos: Array.isArray(assuntos) ? assuntos : [],
            atualizadoEm: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        res.json({ sucesso: true });
    } catch (erro) {
        console.error('[ERRO salvar operador]', erro);
        res.status(500).json({ erro: 'Erro ao salvar colaborador' });
    }
});

// Excluir Colaborador
router.delete('/admin/operadores', async (req, res) => {
    try {
        const { email } = req.query;
        if (!email) return res.status(400).json({ erro: 'Email é obrigatório' });

        await db.collection('operadores').doc(String(email).trim().toLowerCase()).delete();
        res.json({ sucesso: true });
    } catch (erro) {
        console.error('[ERRO excluir operador]', erro);
        res.status(500).json({ erro: 'Erro ao excluir colaborador' });
    }
});

// Salvar Lista de Assuntos do Widget
router.post('/admin/assuntos/salvar', async (req, res) => {
    try {
        const { lista } = req.body;
        if (!Array.isArray(lista)) return res.status(400).json({ erro: 'Lista de assuntos inválida' });

        await db.collection('configuracoes').doc('assuntos').set({
            lista,
            atualizadoEm: admin.firestore.FieldValue.serverTimestamp()
        });

        res.json({ sucesso: true });
    } catch (erro) {
        console.error('[ERRO salvar assuntos]', erro);
        res.status(500).json({ erro: 'Erro ao salvar assuntos' });
    }
});

// Obter e Salvar Motivos de Não-Resolução para Tabulação
router.get('/admin/motivos', async (req, res) => {
    try {
        const doc = await db.collection('configuracoes').doc('motivos').get();
        if (doc.exists && doc.data().lista) {
            return res.json({ motivos: doc.data().lista });
        }
        const motivosPadrao = [
            'Documentação Pendente do Cliente',
            'Fora do Escopo de Atendimento',
            'Aguardando Aprovação da Síndica',
            'Problema Técnico no Sistema'
        ];
        res.json({ motivos: motivosPadrao });
    } catch (erro) {
        console.error('[ERRO obter motivos]', erro);
        res.status(500).json({ motivos: [] });
    }
});

router.post('/admin/motivos/salvar', async (req, res) => {
    try {
        const { lista } = req.body;
        if (!Array.isArray(lista)) return res.status(400).json({ erro: 'Lista de motivos inválida' });

        await db.collection('configuracoes').doc('motivos').set({
            lista,
            atualizadoEm: admin.firestore.FieldValue.serverTimestamp()
        });

        res.json({ sucesso: true });
    } catch (erro) {
        console.error('[ERRO salvar motivos]', erro);
        res.status(500).json({ erro: 'Erro ao salvar motivos' });
    }
});

module.exports = router;