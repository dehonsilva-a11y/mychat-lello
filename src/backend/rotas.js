const express = require('express');
const router = express.Router();
const multer = require('multer');
const crypto = require('crypto');
const { admin, db, bucket } = require('./firebase');

// Configuração do Multer (Upload em memória até 10MB)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }
});

// --- ROTA DE UPLOAD DE ARQUIVOS / IMAGENS ---

router.post('/upload', upload.single('arquivo'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ erro: 'Nenhum arquivo foi enviado.' });
        }

        const nomeOriginal = req.file.originalname;
        const mimeType = req.file.mimetype;
        const nomeUnico = `${Date.now()}_${nomeOriginal.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        const file = bucket.file(`anexos/${nomeUnico}`);

        // Gera token único de download do Firebase Storage
        const token = crypto.randomUUID();

        await file.save(req.file.buffer, {
            metadata: { 
                contentType: mimeType,
                metadata: {
                    firebaseStorageDownloadTokens: token
                }
            },
            resumable: false
        });

        // URL pública com token nativo do Firebase
        const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(file.name)}?alt=media&token=${token}`;
        const ehImagem = mimeType.startsWith('image/');
        const tipo = ehImagem ? 'imagem' : 'arquivo';

        res.json({
            sucesso: true,
            url,
            nomeArquivo: nomeOriginal,
            tipo
        });
    } catch (erro) {
        console.error('[ERRO upload arquivo]', erro);
        res.status(500).json({ erro: 'Erro ao fazer upload do arquivo: ' + erro.message });
    }
});

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

// Iniciar Chat com Protocolo Automático & Mensagem Inicial
router.post('/iniciar', async (req, res) => {
    try {
        const { nome, email, telefone, assunto, verificado, clienteId, contrato, imovel, origemUrl } = req.body;
        const id = clienteId ? String(clienteId).trim() : ('cliente_' + Math.floor(Math.random() * 90000 + 10000));
        const isVerificado = Boolean(verificado && verificado !== 'false' && verificado !== false);
        const rotuloModo = isVerificado ? '[Verificado]' : '[Declarado]';

        // Geração do Número de Protocolo (Formato: AAAAMMDDXXXX)
        const agora = new Date();
        const ano = agora.getFullYear();
        const mes = String(agora.getMonth() + 1).padStart(2, '0');
        const dia = String(agora.getDate()).padStart(2, '0');
        const aleatorio = Math.floor(1000 + Math.random() * 9000);
        const protocolo = `${ano}${mes}${dia}${aleatorio}`;

        const chatRef = db.collection('chats').doc(id);
        const doc = await chatRef.get();

        if (!doc.exists) {
            await chatRef.set({
                id,
                protocolo,
                nome: `${nome || 'Cliente'} ${rotuloModo}`,
                email: email || 'Não informado',
                telefone: telefone || 'Não informado',
                origem: assunto || 'Geral',
                verificado: isVerificado,
                contexto: {
                    contrato: contrato || 'Não informado',
                    imovel: imovel || 'Não informado',
                    origemUrl: origemUrl || 'Acesso Direto'
                },
                status: 'Aguardando',
                atendente: null,
                mensagens: [
                    { de: 'sistema', texto: '👋 Olá! Seja bem-vindo ao nosso atendimento.' },
                    { de: 'sistema', texto: `📋 O número do seu protocolo é: ${protocolo}` }
                ],
                criadoEm: admin.firestore.FieldValue.serverTimestamp()
            });
        }

        const snapshot = await db.collection('chats').where('status', '==', 'Aguardando').get();
        const posicao = snapshot.size;

        const chatData = doc.exists ? doc.data() : null;
        const protocoloRetorno = chatData?.protocolo || protocolo;

        res.json({ 
            status: 'Na fila', 
            posicao: posicao > 0 ? posicao : 1, 
            tempoEstimado: '1 min',
            chatId: id,
            protocolo: protocoloRetorno
        });
    } catch (erro) {
        console.error('[ERRO iniciar]', erro);
        res.status(500).json({ erro: 'Erro interno ao iniciar chat' });
    }
});

// Envio de mensagem pelo Cliente (Com Suporte a Anexos/Imagens)
router.post('/mensagem', async (req, res) => {
    try {
        const { mensagem, chatId, tipo, url, nomeArquivo } = req.body;
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

        if (mensagem || url) {
            const objetoMensagem = {
                de: 'cliente',
                texto: mensagem || '',
                tipo: tipo || 'texto',
                url: url || null,
                nomeArquivo: nomeArquivo || null,
                criadoEm: new Date().toISOString()
            };

            await chatRef.update({
                mensagens: admin.firestore.FieldValue.arrayUnion(objetoMensagem)
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
            return res.json({ 
                mensagens: data.mensagens || [], 
                status: data.status,
                subStatusTicket: data.subStatusTicket || null,
                nps: data.nps || null, 
                origem: data.origem,
                protocolo: data.protocolo || null
            });
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

// --- ROTAS DO PAINEL DO COLABORADOR / MODO ESPIÃO ---

router.get('/atendimento/lista', async (req, res) => {
    try {
        const { inicio, fim } = req.query;
        let queryRef = db.collection('chats');

        if (inicio && fim) {
            const inicioDate = new Date(`${inicio}T00:00:00.000Z`);
            const fimDate = new Date(`${fim}T23:59:59.999Z`);
            queryRef = queryRef.where('criadoEm', '>=', inicioDate).where('criadoEm', '<=', fimDate);
        }

        const snapshot = await queryRef.get();
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

// ROTA TICKETS: Listar tickets de um operador ou todos
router.get('/tickets/lista', async (req, res) => {
    try {
        const { atendente } = req.query;
        let queryRef = db.collection('chats').where('status', '==', 'Ticket');
        
        if (atendente) {
            queryRef = queryRef.where('atendente', '==', atendente);
        }

        const snapshot = await queryRef.get();
        const tickets = [];

        snapshot.forEach(doc => {
            tickets.push(doc.data());
        });

        res.json({ tickets });
    } catch (erro) {
        console.error('[ERRO buscar tickets]', erro);
        res.status(500).json({ tickets: [] });
    }
});

// ROTA HISTÓRICO: Filtra por datas no banco e valida status em memória
router.get('/atendimento/historico', async (req, res) => {
    try {
        const { inicio, fim } = req.query;
        let queryRef = db.collection('chats');

        if (inicio && fim) {
            const inicioDate = new Date(`${inicio}T00:00:00.000Z`);
            const fimDate = new Date(`${fim}T23:59:59.999Z`);
            queryRef = queryRef.where('criadoEm', '>=', inicioDate).where('criadoEm', '<=', fimDate);
        }

        const snapshot = await queryRef.get();
        const historico = [];

        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.status === 'Encerrado' || data.status === 'encerrado') {
                historico.push(data);
            }
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

// Resposta do Operador / Gestor (Com Suporte a Anexos/Imagens)
router.post('/atendimento/responder', async (req, res) => {
    try {
        const { chatId, mensagem, atendente, tipo, url, nomeArquivo } = req.body;
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

        if (mensagem || url) {
            const nomeAtendente = atendente || 'Atendente Lello';
            const objetoMensagem = {
                de: 'atendente',
                texto: mensagem || '',
                autor: nomeAtendente,
                tipo: tipo || 'texto',
                url: url || null,
                nomeArquivo: nomeArquivo || null,
                criadoEm: new Date().toISOString()
            };

            await chatRef.update({
                mensagens: admin.firestore.FieldValue.arrayUnion(objetoMensagem)
            });
            return res.json({ sucesso: true });
        }

        res.status(400).json({ sucesso: false, erro: 'Mensagem vazia' });
    } catch (erro) {
        console.error('[ERRO responder]', erro);
        res.status(500).json({ sucesso: false });
    }
});

// CONVERTER CHAT SÍNCRONO EM TICKET
router.post('/atendimento/converter-ticket', async (req, res) => {
    try {
        const { chatId, atendente, previsaoResposta, motivoTicket } = req.body;
        const idLimpo = String(chatId).trim();
        const chatRef = db.collection('chats').doc(idLimpo);
        const doc = await chatRef.get();

        if (doc.exists) {
            const dataAtual = doc.data();
            
            await chatRef.update({
                status: 'Ticket',
                subStatusTicket: 'Aberto',
                tipoAtendimento: 'ticket',
                previsaoResposta: previsaoResposta || '24h',
                motivoTicket: motivoTicket || 'Análise Adicional',
                mensagens: admin.firestore.FieldValue.arrayUnion({
                    de: 'sistema',
                    texto: `🎫 Este atendimento foi convertido num Ticket de Acompanhamento (Protocolo: ${dataAtual.protocolo}).<br><b>Motivo:</b> ${motivoTicket || 'Análise Adicional'}<br><b>Previsão de Retorno:</b> ${previsaoResposta || '24h'}.<br>O operador ${atendente || 'responsável'} continuará o acompanhamento por aqui.`
                })
            });
            return res.json({ sucesso: true });
        }
        res.status(404).json({ sucesso: false, erro: 'Chat não encontrado' });
    } catch (erro) {
        console.error('[ERRO converter ticket]', erro);
        res.status(500).json({ sucesso: false });
    }
});

// ATUALIZAR STATUS DO TICKET
router.post('/tickets/atualizar-status', async (req, res) => {
    try {
        const { chatId, novoStatus, atendente, motivoConclusao } = req.body;
        const idLimpo = String(chatId).trim();
        const chatRef = db.collection('chats').doc(idLimpo);
        const doc = await chatRef.get();

        if (doc.exists) {
            let updateData = {
                subStatusTicket: novoStatus,
                mensagens: admin.firestore.FieldValue.arrayUnion({
                    de: 'sistema',
                    texto: `🔄 Status do Ticket alterado para <b>${novoStatus}</b> por ${atendente}.`
                })
            };

            if (novoStatus === 'Resolvido') {
                updateData.status = 'Encerrado';
                updateData.encerradoEm = admin.firestore.FieldValue.serverTimestamp();
                updateData.tabulacao = {
                    resolvido: true,
                    motivoNaoResolvido: motivoConclusao || 'Ticket Concluído',
                    encerradoEm: admin.firestore.FieldValue.serverTimestamp()
                };
                updateData.mensagens = admin.firestore.FieldValue.arrayUnion({
                    de: 'sistema',
                    texto: `✅ Ticket Concluído por ${atendente}. Motivo: ${motivoConclusao || 'Resolvido'}.`
                });
            }

            await chatRef.update(updateData);
            return res.json({ sucesso: true });
        }
        res.status(404).json({ sucesso: false, erro: 'Ticket não encontrado' });
    } catch (erro) {
        console.error('[ERRO atualizar status ticket]', erro);
        res.status(500).json({ sucesso: false });
    }
});

// Encerrar atendimento com Tabulação
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

// --- ROTAS EXCLUSIVAS DO PAINEL ADMIN (GESTÃO & METRICAS DISCRIMINADAS) ---

router.get('/admin/metrics', async (req, res) => {
    try {
        const { inicio, fim } = req.query;
        let queryRef = db.collection('chats');

        if (inicio && fim) {
            const inicioDate = new Date(`${inicio}T00:00:00.000Z`);
            const fimDate = new Date(`${fim}T23:59:59.999Z`);
            queryRef = queryRef.where('criadoEm', '>=', inicioDate).where('criadoEm', '<=', fimDate);
        }

        const snapshot = await queryRef.get();

        // 1. Operação em Tempo Real (Em Aberto)
        let filaChat = 0;
        let emAtendimentoChat = 0;
        let ticketsAbertos = 0;
        let ticketsEmAndamento = 0;

        // 2. Indicadores de Chat Síncrono
        let totalChats = 0;
        let encerradosChat = 0;
        let resolvidosChat = 0;
        let naoResolvidosChat = 0;
        let somaNpsChat = 0, qtdNpsChat = 0;
        let somaDuracaoSegundosChat = 0, qtdDuracaoChat = 0;

        // 3. Indicadores de Tickets
        let totalTickets = 0;
        let ticketsConcluidos = 0;

        const opMap = {};
        const assuntoMap = {};
        const motivoNaoResolvidoMap = {};

        snapshot.forEach(doc => {
            const data = doc.data();
            const ehTicket = data.status === 'Ticket' || data.tipoAtendimento === 'ticket' || Boolean(data.subStatusTicket);

            // --- CONTAGEM OPERACIONAL EM TEMPO REAL ---
            if (data.status === 'Aguardando') filaChat++;
            else if (data.status === 'Em Atendimento') emAtendimentoChat++;
            else if (data.status === 'Ticket') {
                if (data.subStatusTicket === 'Aberto') ticketsAbertos++;
                else ticketsEmAndamento++;
            }

            // --- PROCESSAMENTO DISCRIMINADO ---
            if (ehTicket) {
                totalTickets++;
                if (data.status === 'Encerrado') {
                    ticketsConcluidos++;
                }
            } else {
                totalChats++;
                if (data.status === 'Encerrado') {
                    encerradosChat++;
                    if (data.tabulacao) {
                        if (data.tabulacao.resolvido === true) resolvidosChat++;
                        else if (data.tabulacao.resolvido === false) {
                            naoResolvidosChat++;
                            const motivo = data.tabulacao.motivoNaoResolvido || 'Não informado';
                            motivoNaoResolvidoMap[motivo] = (motivoNaoResolvidoMap[motivo] || 0) + 1;
                        }
                    }

                    // TMA exclusivo para Chat Síncrono
                    if (data.criadoEm && data.encerradoEm) {
                        const dtInicio = data.criadoEm.toDate ? data.criadoEm.toDate().getTime() : new Date(data.criadoEm).getTime();
                        const dtFim = data.encerradoEm.toDate ? data.encerradoEm.toDate().getTime() : new Date(data.encerradoEm).getTime();
                        if (dtFim > dtInicio) {
                            somaDuracaoSegundosChat += (dtFim - dtInicio) / 1000;
                            qtdDuracaoChat++;
                        }
                    }
                }

                // NPS exclusivo de Chat Síncrono
                if (data.nps && typeof data.nps.nota === 'number') {
                    somaNpsChat += data.nps.nota;
                    qtdNpsChat++;
                }
            }

            // Assuntos gerais
            const assunto = data.origem || 'Geral';
            assuntoMap[assunto] = (assuntoMap[assunto] || 0) + 1;

            // Performance por Operador
            if (data.atendente) {
                if (!opMap[data.atendente]) {
                    opMap[data.atendente] = { atendimentos: 0, encerrados: 0, somaNps: 0, qtdNps: 0 };
                }
                opMap[data.atendente].atendimentos++;
                if (data.status === 'Encerrado') opMap[data.atendente].encerrados++;
                if (data.nps && typeof data.nps.nota === 'number') {
                    opMap[data.atendente].somaNps += data.nps.nota;
                    opMap[data.atendente].qtdNps++;
                }
            }
        });

        const mediaNpsChat = qtdNpsChat > 0 ? (somaNpsChat / qtdNpsChat).toFixed(1) : '-';
        const tmaMinutosChat = qtdDuracaoChat > 0 ? (somaDuracaoSegundosChat / qtdDuracaoChat / 60).toFixed(1) : '0';
        const totalAbertoOperacao = filaChat + emAtendimentoChat + ticketsAbertos + ticketsEmAndamento;

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

        const porMotivoNaoResolvido = Object.keys(motivoNaoResolvidoMap).map(motivo => ({
            motivo,
            quantidade: motivoNaoResolvidoMap[motivo]
        }));

        res.json({
            totalAbertoOperacao,
            filaChat,
            emAtendimentoChat,
            ticketsAbertos,
            ticketsEmAndamento,

            totalChats,
            encerradosChat,
            resolvidosChat,
            naoResolvidosChat,
            npsMediaChat: mediaNpsChat,
            qtdNpsChat,
            tmaMinutosChat,

            totalTickets,
            ticketsConcluidos,

            porMotivoNaoResolvido,
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