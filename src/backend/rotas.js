const express = require('express');
const router = express.Router();
const multer = require('multer');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { admin, db, bucket } = require('./firebase');

// Configuração do Multer (Upload em memória até 10MB)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }
});

// Helper de Envio de E-mail Transacional (Instanciação Dinâmica e Limpeza de Espaços)
async function enviarEmailNotificacao({ para, assunto, html }) {
    if (!para || para === 'Não informado' || !para.includes('@')) return;

    // Obtém as variáveis em tempo real e limpa espaços acidentais (.trim())
    const usuarioSmtp = (process.env.SMTP_USER || 'dehonsilva2@gmail.com').trim();
    const senhaSmtp = (process.env.SMTP_PASS || '').trim();
    const hostSmtp = (process.env.SMTP_HOST || 'smtp.gmail.com').trim();
    const portaSmtp = Number(process.env.SMTP_PORT) || 587;

    if (!senhaSmtp) {
        console.error('❌ [ERRO ENVIO E-MAIL]: A variável SMTP_PASS não foi encontrada no ambiente.');
        return;
    }

    console.log(`📧 [DIAGNÓSTICO SMTP] A tentar disparar e-mail via: ${usuarioSmtp}`);

    const transporter = nodemailer.createTransport({
        host: hostSmtp,
        port: portaSmtp,
        secure: false,
        auth: {
            user: usuarioSmtp,
            pass: senhaSmtp
        }
    });

    try {
        const info = await transporter.sendMail({
            from: `"Mychat Lello" <${usuarioSmtp}>`,
            to: para,
            subject: assunto,
            html: html
        });
        console.log('✅ [E-MAIL ENVIADO COM SUCESSO]:', para, '| MessageID:', info.messageId);
    } catch (erro) {
        console.error('❌ [ERRO ENVIO E-MAIL]:', erro.message);
    }
}

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

router.get('/operador/perfil', async (req, res) => {
    try {
        const { email } = req.query;
        if (!email) return res.status(400).json({ erro: 'Email não informado' });

        const emailLimpo = String(email).trim().toLowerCase();
        const doc = await db.collection('operadores').doc(emailLimpo).get();

        if (doc.exists) {
            return res.json(doc.data());
        }

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

router.get('/assuntos', async (req, res) => {
    try {
        const doc = await db.collection('configuracoes').doc('assuntos').get();
        if (doc.exists && doc.data().lista && doc.data().lista.length > 0) {
            return res.json({ assuntos: doc.data().lista });
        }
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
        const { nome, email, telefone, assunto, verificado, clienteId, contrato, imovel, origemUrl } = req.body;
        const id = clienteId ? String(clienteId).trim() : ('cliente_' + Math.floor(Math.random() * 90000 + 10000));
        const isVerificado = Boolean(verificado && verificado !== 'false' && verificado !== false);
        const rotuloModo = isVerificado ? '[Verificado]' : '[Declarado]';

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

// Envio de mensagem pelo Cliente (GATILHO: E-mail de Alerta para o Colaborador)
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

            if (doc.exists) {
                const chatData = doc.data();
                // Notifica o colaborador responsável quando o morador responde no Ticket
                if (chatData.status === 'Ticket' && chatData.atendente) {
                    const opSnapshot = await db.collection('operadores').where('nome', '==', chatData.atendente).get();
                    if (!opSnapshot.empty) {
                        const emailColaborador = opSnapshot.docs[0].data().email;
                        enviarEmailNotificacao({
                            para: emailColaborador,
                            assunto: `🔔 [Mychat] Resposta do Morador no Ticket #${chatData.protocolo || idLimpo}`,
                            html: `
                                <div style="font-family: sans-serif; padding: 20px; background: #f8fafc; color: #1e293b;">
                                    <div style="max-width: 500px; margin: auto; background: white; border-radius: 8px; padding: 20px; border: 1px solid #e2e8f0;">
                                        <h3 style="color: #A00028; margin-top: 0;">O morador respondeu ao Ticket!</h3>
                                        <p><strong>Cliente:</strong> ${chatData.nome}</p>
                                        <p><strong>Protocolo:</strong> ${chatData.protocolo}</p>
                                        <div style="background: #f1f5f9; padding: 12px; border-radius: 6px; border-left: 4px solid #7c3aed; margin: 16px 0;">
                                            ${mensagem || '<i>[Anexo Enviado]</i>'}
                                        </div>
                                        <p style="font-size: 12px; color: #64748b;">Acesse o Cockpit do Mychat para dar andamento ao atendimento.</p>
                                    </div>
                                </div>
                            `
                        });
                    }
                }
            }
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

// Resposta do Operador / Gestor (GATILHO: E-mail de Atualização do Ticket para o Morador)
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
            const chatData = doc.exists ? doc.data() : {};
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

            // Se for Ticket, envia e-mail de atualização para o Morador
            if (chatData.status === 'Ticket') {
                const hostUrl = `${req.protocol}://${req.get('host')}`;
                const linkWidget = `${hostUrl}/index.html?chatId=${idLimpo}`;

                let blocoAnexoHtml = '';
                if (url) {
                    blocoAnexoHtml = `
                        <div style="margin-top: 12px; padding: 10px; background: #f1f5f9; border-radius: 6px; font-size: 13px;">
                            📄 <strong>Anexo enviado:</strong> ${nomeArquivo || 'Documento'}<br>
                            <a href="${url}" target="_blank" style="color: #7c3aed; font-weight: bold; text-decoration: none;">Clique aqui para baixar/visualizar</a>
                        </div>
                    `;
                }

                enviarEmailNotificacao({
                    para: chatData.email,
                    assunto: `🎫 Atualização no seu Ticket #${chatData.protocolo || idLimpo} - Lello`,
                    html: `
                        <div style="font-family: sans-serif; background-color: #f8fafc; padding: 24px; color: #1e293b;">
                            <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 24px; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
                                <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #A00028; padding-bottom: 12px; margin-bottom: 20px;">
                                    <h2 style="color: #A00028; margin: 0; font-size: 20px;">Mychat Lello</h2>
                                    <span style="font-size: 12px; font-family: monospace; color: #64748b;">Prot: ${chatData.protocolo || '-'}</span>
                                </div>

                                <p style="font-size: 15px;">Olá, <strong>${chatData.nome ? chatData.nome.split(' ')[0] : 'Cliente'}</strong>!</p>
                                <p style="font-size: 14px; color: #475569;">O seu ticket recebeu uma nova resposta da nossa equipe de atendimento:</p>

                                <div style="background: #faf5ff; border-left: 4px solid #7c3aed; padding: 16px; border-radius: 6px; font-size: 14px; color: #334155; margin: 20px 0;">
                                    <strong>${nomeAtendente}:</strong><br>
                                    <p style="margin: 8px 0 0 0; white-space: pre-wrap;">${mensagem || ''}</p>
                                    ${blocoAnexoHtml}
                                </div>

                                <div style="text-align: center; margin: 28px 0 16px 0;">
                                    <a href="${linkWidget}" target="_blank" style="background: #A00028; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 14px; display: inline-block;">
                                        💬 Abrir e Responder no Chat
                                    </a>
                                </div>

                                <p style="font-size: 11px; color: #94a3b8; text-align: center; margin-top: 20px; border-top: 1px solid #f1f5f9; padding-top: 12px;">
                                    Lello Condomínios e Imóveis • Central de Atendimento
                                </p>
                            </div>
                        </div>
                    `
                });
            }

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

            // Notifica o morador da conversão por e-mail
            const hostUrl = `${req.protocol}://${req.get('host')}`;
            const linkWidget = `${hostUrl}/index.html?chatId=${idLimpo}`;

            enviarEmailNotificacao({
                para: dataAtual.email,
                assunto: `🎫 Atendimento Convertido em Ticket (Protocolo #${dataAtual.protocolo})`,
                html: `
                    <div style="font-family: sans-serif; background-color: #f8fafc; padding: 24px; color: #1e293b;">
                        <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 24px; border: 1px solid #e2e8f0;">
                            <h2 style="color: #7c3aed; margin-top: 0;">🎫 Seu atendimento virou um Ticket</h2>
                            <p>Olá, <strong>${dataAtual.nome ? dataAtual.nome.split(' ')[0] : 'Cliente'}</strong>!</p>
                            <p>O seu atendimento de protocolo <strong>#${dataAtual.protocolo}</strong> foi transformado num Ticket para acompanhamento especializado.</p>
                            <ul style="background: #f1f5f9; padding: 16px 24px; border-radius: 8px; font-size: 13px;">
                                <li><strong>Motivo:</strong> ${motivoTicket || 'Análise Técnica'}</li>
                                <li><strong>Previsão de Retorno:</strong> ${previsaoResposta || '24h'}</li>
                                <li><strong>Responsável:</strong> ${atendente || 'Equipe Lello'}</li>
                            </ul>
                            <div style="text-align: center; margin-top: 24px;">
                                <a href="${linkWidget}" target="_blank" style="background: #7c3aed; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 14px; display: inline-block;">
                                    Acompanhar Ticket no Portal
                                </a>
                            </div>
                        </div>
                    </div>
                `
            });

            return res.json({ sucesso: true });
        }
        res.status(404).json({ sucesso: false, erro: 'Chat não encontrado' });
    } catch (erro) {
        console.error('[ERRO converter ticket]', erro);
        res.status(500).json({ sucesso: false });
    }
});

// ATUALIZAR STATUS DO TICKET (GATILHO: E-mail de Conclusão do Ticket)
router.post('/tickets/atualizar-status', async (req, res) => {
    try {
        const { chatId, novoStatus, atendente, motivoConclusao } = req.body;
        const idLimpo = String(chatId).trim();
        const chatRef = db.collection('chats').doc(idLimpo);
        const doc = await chatRef.get();

        if (doc.exists) {
            const chatData = doc.data();
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

                const hostUrl = `${req.protocol}://${req.get('host')}`;
                const linkWidget = `${hostUrl}/index.html?chatId=${idLimpo}`;

                enviarEmailNotificacao({
                    para: chatData.email,
                    assunto: `✅ Ticket #${chatData.protocolo || idLimpo} Concluído - Lello`,
                    html: `
                        <div style="font-family: sans-serif; background-color: #f8fafc; padding: 24px; color: #1e293b;">
                            <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 24px; border: 1px solid #e2e8f0;">
                                <div style="border-bottom: 2px solid #16a34a; padding-bottom: 12px; margin-bottom: 20px;">
                                    <h2 style="color: #16a34a; margin: 0; font-size: 20px;">✅ Ticket Concluído</h2>
                                    <span style="font-size: 12px; font-family: monospace; color: #64748b;">Prot: ${chatData.protocolo || '-'}</span>
                                </div>

                                <p style="font-size: 15px;">Olá, <strong>${chatData.nome ? chatData.nome.split(' ')[0] : 'Cliente'}</strong>!</p>
                                <p style="font-size: 14px; color: #475569;">Informamos que a sua solicitação referente ao ticket foi finalizada com sucesso!</p>

                                <div style="background: #f0fdf4; border-left: 4px solid #16a34a; padding: 16px; border-radius: 6px; font-size: 14px; color: #166534; margin: 20px 0;">
                                    <strong>Resumo da Solução:</strong><br>
                                    <p style="margin: 8px 0 0 0;">${motivoConclusao || 'Solicitação atendida com sucesso.'}</p>
                                </div>

                                <p style="font-size: 13px; color: #64748b;">Você pode visualizar o histórico de mensagens clicando no botão abaixo. Este chamado está encerrado para novos envios.</p>

                                <div style="text-align: center; margin: 24px 0 12px 0;">
                                    <a href="${linkWidget}" target="_blank" style="background: #16a34a; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 14px; display: inline-block;">
                                        👁️ Visualizar Histórico do Ticket
                                    </a>
                                </div>
                            </div>
                        </div>
                    `
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

// --- ROTAS EXCLUSIVAS DO PAINEL ADMIN ---

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

        let filaChat = 0;
        let emAtendimentoChat = 0;
        let ticketsAbertos = 0;
        let ticketsEmAndamento = 0;

        let totalChats = 0;
        let encerradosChat = 0;
        let resolvidosChat = 0;
        let naoResolvidosChat = 0;
        let somaNpsChat = 0, qtdNpsChat = 0;
        let somaDuracaoSegundosChat = 0, qtdDuracaoChat = 0;

        let totalTickets = 0;
        let ticketsConcluidos = 0;

        const opMap = {};
        const assuntoMap = {};
        const motivoNaoResolvidoMap = {};

        snapshot.forEach(doc => {
            const data = doc.data();
            const ehTicket = data.status === 'Ticket' || data.tipoAtendimento === 'ticket' || Boolean(data.subStatusTicket);

            if (data.status === 'Aguardando') filaChat++;
            else if (data.status === 'Em Atendimento') emAtendimentoChat++;
            else if (data.status === 'Ticket') {
                if (data.subStatusTicket === 'Aberto') ticketsAbertos++;
                else ticketsEmAndamento++;
            }

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

                    if (data.criadoEm && data.encerradoEm) {
                        const dtInicio = data.criadoEm.toDate ? data.criadoEm.toDate().getTime() : new Date(data.criadoEm).getTime();
                        const dtFim = data.encerradoEm.toDate ? data.encerradoEm.toDate().getTime() : new Date(data.encerradoEm).getTime();
                        if (dtFim > dtInicio) {
                            somaDuracaoSegundosChat += (dtFim - dtInicio) / 1000;
                            qtdDuracaoChat++;
                        }
                    }
                }

                if (data.nps && typeof data.nps.nota === 'number') {
                    somaNpsChat += data.nps.nota;
                    qtdNpsChat++;
                }
            }

            const assunto = data.origem || 'Geral';
            assuntoMap[assunto] = (assuntoMap[assunto] || 0) + 1;

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