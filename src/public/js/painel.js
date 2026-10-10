let chatSelecionadoId = null;
let chatSelecionadoStatus = null;
let quantidadeFilaAnterior = 0;
let ultimasMensagensCount = 0;
let listaHistoricoCache = [];
let operadorPerfilCache = null;
let tabulacaoResolvido = null;
let listaAssuntosCache = [];
let modoFiltroFila = 'minhas'; 

// PROTEÇÃO DE ROTA & CAPTURA DO PERFIL DO OPERADOR VIA BACKEND
auth.onAuthStateChanged(async user => {
    if (!user) {
        window.location.href = (window.prefixoApp || '') + '/login.html';
    } else {
        await carregarPerfilOperador(user.email);
        alterarStatusOperador('disponivel');
    }
});

async function carregarPerfilOperador(email) {
    const prefixo = window.prefixoApp || '';
    try {
        const res = await fetch(prefixo + `/api/operador/perfil?email=${encodeURIComponent(email)}`);
        operadorPerfilCache = await res.json();

        const nomeDisplay = document.getElementById('nome-operador-display');
        if (nomeDisplay) {
            nomeDisplay.innerText = operadorPerfilCache.nome || email;
        }

        const btnGestao = document.getElementById('btn-acesso-gestao');
        if (btnGestao) {
            btnGestao.style.display = operadorPerfilCache.funcao === 'admin' ? 'inline-block' : 'none';
        }

        carregarListaAtendimentos();
        carregarMeusTickets();
    } catch (erro) {
        console.error('Erro ao carregar perfil do operador:', erro);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    carregarListaAtendimentos();
    carregarHistoricoAtendimentos();
    carregarRespostasRapidas();
    carregarAssuntosSelect();
    carregarMotivosTabulacao();

    setInterval(carregarListaAtendimentos, 2000);
    setInterval(carregarMeusTickets, 2500); 
    setInterval(carregarMensagensChatAtivo, 1500);
});

async function fazerLogout() {
    try {
        await auth.signOut();
        window.location.href = (window.prefixoApp || '') + '/login.html';
    } catch (erro) {
        console.error('Erro ao efetuar logout:', erro);
    }
}

function obterNomeOperador() {
    if (operadorPerfilCache && operadorPerfilCache.nome) {
        return operadorPerfilCache.nome;
    }
    if (auth.currentUser) {
        return auth.currentUser.displayName || auth.currentUser.email || 'Atendente Lello';
    }
    return 'Atendente Lello';
}

async function alterarStatusOperador(novoStatus) {
    if (!auth.currentUser) return;
    const prefixo = window.prefixoApp || '';
    try {
        await fetch(prefixo + '/api/operador/status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: auth.currentUser.email,
                nome: obterNomeOperador(),
                status: novoStatus
            })
        });
    } catch (erro) {
        console.error('Erro ao atualizar status do operador:', erro);
    }
}

function alterarFiltroFila(novoModo) {
    modoFiltroFila = novoModo;
    carregarListaAtendimentos();
}

async function carregarAssuntosSelect() {
    const prefixo = window.prefixoApp || '';
    try {
        const res = await fetch(prefixo + '/api/assuntos');
        const dados = await res.json();
        listaAssuntosCache = dados.assuntos || [];
        
        const selectTag = document.getElementById('origem-cliente-ativo');
        if (selectTag) {
            selectTag.innerHTML = '';
            listaAssuntosCache.forEach(assunto => {
                const opt = document.createElement('option');
                opt.value = assunto;
                opt.innerText = assunto;
                selectTag.appendChild(opt);
            });
        }
    } catch (erro) {
        console.error('Erro ao carregar assuntos para o select:', erro);
    }
}

async function alterarTagChat() {
    if (!chatSelecionadoId) return;
    const selectTag = document.getElementById('origem-cliente-ativo');
    const novoAssunto = selectTag ? selectTag.value : '';
    if (!novoAssunto) return;

    const prefixo = window.prefixoApp || '';
    try {
        await fetch(prefixo + '/api/atendimento/alterar-assunto', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chatId: chatSelecionadoId,
                novoAssunto,
                operador: obterNomeOperador()
            })
        });
        carregarMensagensChatAtivo();
        carregarListaAtendimentos();
    } catch (erro) {
        console.error('Erro ao alterar assunto/tag:', erro);
    }
}

async function carregarRespostasRapidas() {
    const prefixo = window.prefixoApp || '';
    try {
        const resposta = await fetch(prefixo + '/api/atendimento/respostas-rapidas');
        const dados = await resposta.json();
        renderizarRespostasRapidas(dados.respostas || []);
    } catch (erro) {
        console.error('Erro ao carregar respostas rápidas:', erro);
    }
}

function renderizarRespostasRapidas(lista) {
    const container = document.getElementById('lista-respostas-rapidas');
    if (!container) return;

    container.innerHTML = '';
    lista.forEach(item => {
        const chip = document.createElement('div');
        chip.className = 'chip-rr';
        chip.innerText = item.titulo;
        chip.title = item.texto;
        chip.onclick = () => {
            const input = document.getElementById('input-resposta-operador');
            if (input) {
                input.value = item.texto;
                input.focus();
            }
        };
        container.appendChild(chip);
    });
}

async function abrirModalTransferir() {
    if (!chatSelecionadoId) return;
    const prefixo = window.prefixoApp || '';
    const select = document.getElementById('select-operador-transferencia');
    const modal = document.getElementById('modal-transferir');

    if (select) select.innerHTML = '<option value="">A carregar...</option>';
    if (modal) modal.style.display = 'flex';

    try {
        const resposta = await fetch(prefixo + '/api/operadores/lista');
        const dados = await resposta.json();
        const operadores = dados.operadores || [];

        if (select) {
            select.innerHTML = '<option value="">Selecione um operador...</option>';
            const atualEmail = auth.currentUser ? auth.currentUser.email : '';

            operadores.forEach(op => {
                if (op.email !== atualEmail) {
                    const statusEmoji = op.status === 'disponivel' ? '🟢' : (op.status === 'pausa' ? '🟡' : '🔴');
                    const option = document.createElement('option');
                    option.value = op.nome || op.email;
                    option.innerText = `${statusEmoji} ${op.nome || op.email} (${op.status || 'offline'})`;
                    select.appendChild(option);
                }
            });
        }
    } catch (erro) {
        console.error('Erro ao carregar lista de operadores:', erro);
    }
}

function fecharModalTransferir() {
    const modal = document.getElementById('modal-transferir');
    if (modal) modal.style.display = 'none';
}

async function confirmarTransferencia() {
    const select = document.getElementById('select-operador-transferencia');
    const novoAtendente = select ? select.value : '';

    if (!novoAtendente || !chatSelecionadoId) {
        alert('Selecione um operador para transferir.');
        return;
    }

    const prefixo = window.prefixoApp || '';
    try {
        const resposta = await fetch(prefixo + '/api/atendimento/transferir', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chatId: chatSelecionadoId,
                novoAtendente,
                antigoAtendente: obterNomeOperador()
            })
        });
        const dados = await resposta.json();

        if (dados.sucesso) {
            fecharModalTransferir();
            chatSelecionadoId = null;
            document.getElementById('chat-vazio').style.display = 'flex';
            document.getElementById('chat-ativo-container').style.display = 'none';
            carregarListaAtendimentos();
        }
    } catch (erro) {
        console.error('Erro ao transferir atendimento:', erro);
    }
}

function emitirBeepSonoro() {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, ctx.currentTime);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start();
        osc.stop(ctx.currentTime + 0.2);
    } catch (e) {}
}

async function carregarListaAtendimentos() {
    const prefixo = window.prefixoApp || '';
    try {
        const url = prefixo + `/api/atendimento/lista?_t=${Date.now()}`;
        const resposta = await fetch(url, { cache: 'no-store' });
        const dados = await resposta.json();

        const fila = dados.fila || [];
        const ativos = dados.emAtendimento || [];

        if (fila.length > quantidadeFilaAnterior) {
            emitirBeepSonoro();
        }
        quantidadeFilaAnterior = fila.length;

        renderizarFila(fila);
        renderizarAtivos(ativos);
    } catch (erro) {
        console.error('Erro ao carregar lista de atendimentos:', erro);
    }
}

async function carregarMeusTickets() {
    const prefixo = window.prefixoApp || '';
    const meuNome = obterNomeOperador();
    if (!meuNome || meuNome === 'Atendente Lello') return;

    try {
        const url = prefixo + `/api/tickets/lista?atendente=${encodeURIComponent(meuNome)}&_t=${Date.now()}`;
        const resposta = await fetch(url, { cache: 'no-store' });
        const dados = await resposta.json();

        renderizarTickets(dados.tickets || []);
    } catch (erro) {
        console.error('Erro ao carregar tickets:', erro);
    }
}

function renderizarFila(fila) {
    const container = document.getElementById('lista-fila');
    const countElement = document.getElementById('count-fila');

    let filaExibida = fila;
    if (modoFiltroFila === 'minhas' && operadorPerfilCache && Array.isArray(operadorPerfilCache.assuntos) && operadorPerfilCache.assuntos.length > 0) {
        filaExibida = fila.filter(chat => {
            const assuntoChat = chat.origem || 'Geral';
            return operadorPerfilCache.assuntos.includes(assuntoChat);
        });
    }

    if (countElement) countElement.innerText = filaExibida.length;
    if (!container) return;

    container.innerHTML = '';

    if (filaExibida.length === 0) {
        const textoVazio = (modoFiltroFila === 'minhas' && operadorPerfilCache && operadorPerfilCache.assuntos && operadorPerfilCache.assuntos.length > 0)
            ? 'Nenhum chamado para suas competências'
            : 'Nenhum cliente na fila';
        container.innerHTML = `<div style="font-size: 11px; color: #94a3b8; text-align: center; padding: 12px;">${textoVazio}</div>`;
        return;
    }

    filaExibida.forEach(chat => {
        const div = document.createElement('div');
        div.className = 'card-chat';
        div.innerHTML = `
            <div class="header-card">
                <strong>${chat.nome}</strong>
            </div>
            <div style="font-size: 11px; color: #64748b; margin-bottom: 2px;">Assunto: ${chat.origem || 'Geral'}</div>
            <div style="font-size: 10px; color: #94a3b8; font-family: monospace; margin-bottom: 6px;">Prot: ${chat.protocolo || '-'}</div>
            <button class="btn-assumir" onclick="assumirChat('${chat.id}')">Assumir Atendimento</button>
        `;
        container.appendChild(div);
    });
}

function renderizarAtivos(ativos) {
    const container = document.getElementById('lista-ativos');
    const countElement = document.getElementById('count-ativos');
    const meuNome = obterNomeOperador();

    const meusAtendimentos = ativos.filter(chat => chat.atendente === meuNome);

    if (countElement) countElement.innerText = meusAtendimentos.length;
    if (!container) return;

    if (chatSelecionadoId && chatSelecionadoStatus === 'Em Atendimento') {
        const aindaMeu = meusAtendimentos.some(c => c.id === chatSelecionadoId);
        if (!aindaMeu) {
            chatSelecionadoId = null;
            const chatVazio = document.getElementById('chat-vazio');
            const chatAtivoContainer = document.getElementById('chat-ativo-container');
            if (chatVazio) chatVazio.style.display = 'flex';
            if (chatAtivoContainer) chatAtivoContainer.style.display = 'none';
        }
    }

    container.innerHTML = '';

    if (meusAtendimentos.length === 0) {
        container.innerHTML = '<div style="font-size: 11px; color: #94a3b8; text-align: center; padding: 12px;">Nenhum atendimento em andamento</div>';
        return;
    }

    meusAtendimentos.forEach(chat => {
        const div = document.createElement('div');
        div.className = `card-chat ${chatSelecionadoId === chat.id ? 'ativo' : ''}`;
        div.onclick = () => selecionarChat(chat);
        div.innerHTML = `
            <div class="header-card">
                <strong>${chat.nome}</strong>
                <span class="badge-origem">${chat.origem || 'Geral'}</span>
            </div>
            <div style="font-size: 10px; color: #94a3b8; font-family: monospace;">Prot: ${chat.protocolo || '-'}</div>
        `;
        container.appendChild(div);
    });
}

function renderizarTickets(tickets) {
    const container = document.getElementById('lista-tickets');
    const countElement = document.getElementById('count-tickets');

    if (countElement) countElement.innerText = tickets.length;
    if (!container) return;

    container.innerHTML = '';

    if (tickets.length === 0) {
        container.innerHTML = '<div style="font-size: 11px; color: #94a3b8; text-align: center; padding: 12px;">Nenhum ticket pendente</div>';
        return;
    }

    tickets.forEach(chat => {
        const statusTicket = chat.subStatusTicket || 'Aberto';
        const colorClass = statusTicket === 'Aberto' ? 'aberto' : (statusTicket === 'Resolvido' ? 'resolvido' : 'andamento');
        
        const div = document.createElement('div');
        div.className = `card-chat ticket-card ${chatSelecionadoId === chat.id ? 'ativo' : ''}`;
        div.onclick = () => selecionarChat(chat);
        div.innerHTML = `
            <div class="header-card">
                <strong>${chat.nome}</strong>
                <span class="badge-substatus ${colorClass}">${statusTicket}</span>
            </div>
            <div style="font-size: 11px; color: #64748b; margin-bottom: 2px;">🎫 ${chat.motivoTicket || 'Acompanhamento'}</div>
            <div style="font-size: 10px; color: #94a3b8; font-family: monospace;">Prot: ${chat.protocolo || '-'}</div>
        `;
        container.appendChild(div);
    });
}

async function assumirChat(chatId) {
    const prefixo = window.prefixoApp || '';
    try {
        const resposta = await fetch(prefixo + '/api/atendimento/assumir', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatId, atendente: obterNomeOperador() })
        });
        const dados = await resposta.json();
        
        if (dados.sucesso) {
            selecionarChat(dados.conversa);
            carregarListaAtendimentos();
        }
    } catch (erro) {
        console.error('Erro ao assumir chat:', erro);
    }
}

function selecionarChat(chat) {
    chatSelecionadoId = chat.id;
    chatSelecionadoStatus = chat.status;
    ultimasMensagensCount = 0;

    const chatVazio = document.getElementById('chat-vazio');
    const chatAtivoContainer = document.getElementById('chat-ativo-container');
    const nomeClienteAtivo = document.getElementById('nome-cliente-ativo');
    const selectTag = document.getElementById('origem-cliente-ativo');
    const badgeNps = document.getElementById('badge-nps-ativo');
    const badgeProtocoloHeader = document.getElementById('protocolo-cliente-ativo');
    const areaResposta = document.getElementById('area-resposta-operador');
    const areaRR = document.getElementById('area-respostas-rapidas');
    const btnEncerrar = document.getElementById('btn-encerrar-chat');
    const btnTransferir = document.getElementById('btn-transferir-chat');
    const btnConverter = document.getElementById('btn-converter-ticket');

    if (chatVazio) chatVazio.style.display = 'none';
    if (chatAtivoContainer) chatAtivoContainer.style.display = 'flex';

    // Badge Ticket Visual
    const badgeSubstatusHeader = document.getElementById('badge-ticket-header');
    if (chat.status === 'Ticket') {
        const sts = chat.subStatusTicket || 'Aberto';
        const colorClass = sts === 'Aberto' ? 'aberto' : (sts === 'Resolvido' ? 'resolvido' : 'andamento');
        if (badgeSubstatusHeader) {
            badgeSubstatusHeader.innerText = `🎫 TICKET: ${sts}`;
            badgeSubstatusHeader.className = `badge-substatus ${colorClass}`;
            badgeSubstatusHeader.style.display = 'inline-block';
        }
        if (btnConverter) btnConverter.style.display = 'none'; // Já é ticket
        if (btnTransferir) btnTransferir.style.display = 'none'; // Transferência de tickets não permitida por padrão aqui
        
        // Em vez de "Encerrar Atendimento" padrão, muda para "Concluir Ticket"
        if (btnEncerrar) {
            btnEncerrar.innerText = '✅ Concluir Ticket';
            btnEncerrar.onclick = abrirModalTabulacaoTicket;
            btnEncerrar.style.display = 'block';
        }
    } else {
        if (badgeSubstatusHeader) badgeSubstatusHeader.style.display = 'none';
        if (btnConverter) btnConverter.style.display = 'block';
        if (btnTransferir) btnTransferir.style.display = 'block';
        
        if (btnEncerrar) {
            btnEncerrar.innerText = 'Encerrar Atendimento';
            btnEncerrar.onclick = abrirModalTabulacao;
            btnEncerrar.style.display = 'block';
        }
    }

    if (nomeClienteAtivo) nomeClienteAtivo.innerText = chat.nome;
    if (selectTag) selectTag.value = chat.origem || 'Geral';

    if (badgeProtocoloHeader) {
        if (chat.protocolo) {
            badgeProtocoloHeader.innerText = `Protocolo: ${chat.protocolo}`;
            badgeProtocoloHeader.style.display = 'inline-block';
        } else {
            badgeProtocoloHeader.style.display = 'none';
        }
    }

    // PREENCHIMENTO DO CARTÃO DE CONTEXTO ERP
    const protocoloElem = document.getElementById('ctx-protocolo');
    const seloElem = document.getElementById('ctx-selo-verificado');
    const emailElem = document.getElementById('ctx-email');
    const telefoneElem = document.getElementById('ctx-telefone');
    const contratoElem = document.getElementById('ctx-contrato');
    const imovelElem = document.getElementById('ctx-imovel');
    const origemUrlElem = document.getElementById('ctx-origem-url');

    if (protocoloElem) protocoloElem.innerText = chat.protocolo || 'Não gerado';
    if (seloElem) {
        seloElem.innerText = chat.verificado ? '🟢 Verificado via Portal' : '⚪ Declarado';
        seloElem.style.color = chat.verificado ? '#16a34a' : '#64748b';
    }
    if (emailElem) emailElem.innerText = chat.email || 'Não informado';
    if (telefoneElem) telefoneElem.innerText = chat.telefone || 'Não informado';
    if (contratoElem) contratoElem.innerText = (chat.contexto && chat.contexto.contrato) || 'Não informado';
    if (imovelElem) imovelElem.innerText = (chat.contexto && chat.contexto.imovel) || 'Não informado';
    if (origemUrlElem) origemUrlElem.innerText = (chat.contexto && chat.contexto.origemUrl) || 'Acesso Direto';

    if (chat.nps && chat.nps.nota) {
        if (badgeNps) {
            badgeNps.innerText = `⭐ Nota: ${chat.nps.nota}/5`;
            badgeNps.style.display = 'inline-block';
        }
    } else {
        if (badgeNps) badgeNps.style.display = 'none';
    }

    if (chatSelecionadoStatus === 'Encerrado') {
        if (areaResposta) areaResposta.style.display = 'none';
        if (areaRR) areaRR.style.display = 'none';
        if (btnEncerrar) btnEncerrar.style.display = 'none';
        if (btnTransferir) btnTransferir.style.display = 'none';
        if (btnConverter) btnConverter.style.display = 'none';
    } else {
        if (areaResposta) areaResposta.style.display = 'flex';
        if (areaRR) areaRR.style.display = 'flex';
    }

    document.getElementById('painel-messages').innerHTML = '';
    carregarMensagensChatAtivo();
}

async function carregarMensagensChatAtivo() {
    if (!chatSelecionadoId) return;

    const prefixo = window.prefixoApp || '';
    try {
        const url = prefixo + `/api/mensagem/cliente?chatId=${chatSelecionadoId}&_t=${Date.now()}`;
        const resposta = await fetch(url, { cache: 'no-store' });
        const dados = await resposta.json();

        const mensagens = dados.mensagens || [];
        const nps = dados.nps || null;
        chatSelecionadoStatus = dados.status;

        const badgeNps = document.getElementById('badge-nps-ativo');
        if (nps && nps.nota) {
            if (badgeNps) {
                badgeNps.innerText = `⭐ Nota: ${nps.nota}/5`;
                badgeNps.style.display = 'inline-block';
            }
        } else {
            if (badgeNps) badgeNps.style.display = 'none';
        }

        if (mensagens.length > ultimasMensagensCount) {
            const ultimaMsg = mensagens[mensagens.length - 1];
            if (ultimaMsg && ultimaMsg.de === 'cliente' && ultimasMensagensCount > 0) {
                emitirBeepSonoro();
            }
            ultimasMensagensCount = mensagens.length;
        }

        const container = document.getElementById('painel-messages');
        if (!container) return;

        container.innerHTML = '';
        mensagens.forEach(msg => {
            desenharBalao(msg, container); 
        });

        container.scrollTop = container.scrollHeight;
    } catch (erro) {
        console.error("❌ ERRO NO PAINEL:", erro);
    }
}

async function enviarRespostaOperador() {
    const input = document.getElementById('input-resposta-operador');
    if (!input) return;

    const texto = input.value.trim();
    if (!texto || !chatSelecionadoId) return;

    input.value = '';
    const prefixo = window.prefixoApp || '';

    try {
        await fetch(prefixo + '/api/atendimento/responder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                chatId: chatSelecionadoId, 
                mensagem: texto,
                atendente: obterNomeOperador() 
            })
        });
        
        // Se for Ticket, mudar automaticamente de "Aberto" para "Em Andamento" ao responder
        if (chatSelecionadoStatus === 'Ticket') {
            await fetch(prefixo + '/api/tickets/atualizar-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chatId: chatSelecionadoId,
                    novoStatus: 'Em Andamento',
                    atendente: obterNomeOperador()
                })
            });
            carregarMeusTickets();
        }

        carregarMensagensChatAtivo();
    } catch (erro) {
        console.error('Erro ao responder:', erro);
    }
}

function acionarInputAnexo() {
    document.getElementById('input-anexo-operador').click();
}

async function enviarAnexoOperador(event) {
    const file = event.target.files[0];
    if (!file || !chatSelecionadoId) return;

    event.target.value = '';
    const prefixo = window.prefixoApp || '';
    const formData = new FormData();
    formData.append('arquivo', file);

    const container = document.getElementById('painel-messages');

    try {
        if (container) {
            const loadingDiv = document.createElement('div');
            loadingDiv.id = 'loading-anexo';
            loadingDiv.style.cssText = 'align-self: flex-end; color: #94a3b8; font-size: 11px; margin-bottom: 8px; font-weight: bold;';
            loadingDiv.innerText = 'A enviar anexo... ⏳';
            container.appendChild(loadingDiv);
            container.scrollTop = container.scrollHeight;
        }

        const resUpload = await fetch(prefixo + '/api/upload', {
            method: 'POST',
            body: formData
        });
        
        const dadosUpload = await resUpload.json();

        if (dadosUpload.sucesso) {
            await fetch(prefixo + '/api/atendimento/responder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    chatId: chatSelecionadoId, 
                    mensagem: '', 
                    atendente: obterNomeOperador(),
                    tipo: dadosUpload.tipo,
                    url: dadosUpload.url,
                    nomeArquivo: dadosUpload.nomeArquivo
                })
            });

            // Se for Ticket, mudar status para "Em Andamento" ao enviar arquivo
            if (chatSelecionadoStatus === 'Ticket') {
                await fetch(prefixo + '/api/tickets/atualizar-status', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chatId: chatSelecionadoId,
                        novoStatus: 'Em Andamento',
                        atendente: obterNomeOperador()
                    })
                });
                carregarMeusTickets();
            }
            carregarMensagensChatAtivo();
        } else {
            alert('Erro ao enviar o anexo: ' + (dadosUpload.erro || 'Desconhecido'));
            const el = document.getElementById('loading-anexo');
            if (el) el.remove();
        }
    } catch (erro) {
        console.error('Erro no upload de anexo:', erro);
        alert('Ocorreu um erro ao enviar o anexo. Tente novamente.');
        const el = document.getElementById('loading-anexo');
        if (el) el.remove();
    }
}

// ==========================================
// MÓDULO DE TICKETS
// ==========================================
function abrirModalConverterTicket() {
    if (!chatSelecionadoId) return;
    const modal = document.getElementById('modal-converter-ticket');
    if (modal) modal.style.display = 'flex';
}

function fecharModalConverterTicket() {
    const modal = document.getElementById('modal-converter-ticket');
    if (modal) modal.style.display = 'none';
}

async function confirmarConversaoTicket() {
    const motivoTicket = document.getElementById('motivo-abertura-ticket').value;
    const previsaoResposta = document.getElementById('previsao-ticket').value;

    if (!motivoTicket || !previsaoResposta) {
        alert("Preencha o motivo e a previsão de retorno.");
        return;
    }

    const prefixo = window.prefixoApp || '';
    try {
        const res = await fetch(prefixo + '/api/atendimento/converter-ticket', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chatId: chatSelecionadoId,
                atendente: obterNomeOperador(),
                motivoTicket,
                previsaoResposta
            })
        });

        const dados = await res.json();
        if (dados.sucesso) {
            fecharModalConverterTicket();
            chatSelecionadoId = null;
            document.getElementById('chat-vazio').style.display = 'flex';
            document.getElementById('chat-ativo-container').style.display = 'none';
            carregarListaAtendimentos();
            carregarMeusTickets();
        }
    } catch (erro) {
        console.error("Erro ao converter para ticket:", erro);
    }
}

function abrirModalTabulacaoTicket() {
    if (!chatSelecionadoId) return;
    const modal = document.getElementById('modal-concluir-ticket');
    if (modal) modal.style.display = 'flex';
}

function fecharModalConcluirTicket() {
    const modal = document.getElementById('modal-concluir-ticket');
    if (modal) modal.style.display = 'none';
}

async function confirmarConclusaoTicket() {
    const motivoConclusao = document.getElementById('motivo-conclusao-ticket').value;
    if (!motivoConclusao) {
        alert("Descreva o motivo da conclusão.");
        return;
    }

    const prefixo = window.prefixoApp || '';
    try {
        const res = await fetch(prefixo + '/api/tickets/atualizar-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chatId: chatSelecionadoId,
                novoStatus: 'Resolvido',
                atendente: obterNomeOperador(),
                motivoConclusao
            })
        });

        const dados = await res.json();
        if (dados.sucesso) {
            fecharModalConcluirTicket();
            chatSelecionadoId = null;
            document.getElementById('chat-vazio').style.display = 'flex';
            document.getElementById('chat-ativo-container').style.display = 'none';
            carregarMeusTickets();
            carregarHistoricoAtendimentos();
        }
    } catch (erro) {
        console.error("Erro ao concluir ticket:", erro);
    }
}

// TABULAÇÃO PADRÃO
async function carregarMotivosTabulacao() {
    const prefixo = window.prefixoApp || '';
    try {
        const res = await fetch(prefixo + '/api/admin/motivos');
        const dados = await res.json();
        const selectMotivo = document.getElementById('select-motivo-tabulacao');
        if (selectMotivo) {
            selectMotivo.innerHTML = '<option value="">Selecione o motivo...</option>';
            (dados.motivos || []).forEach(m => {
                const opt = document.createElement('option');
                opt.value = m;
                opt.innerText = m;
                selectMotivo.appendChild(opt);
            });
        }
    } catch (erro) {
        console.error('Erro ao carregar motivos para tabulação:', erro);
    }
}

function abrirModalTabulacao() {
    if (!chatSelecionadoId) return;
    tabulacaoResolvido = null;
    
    const modal = document.getElementById('modal-tabulacao');
    const btnSim = document.getElementById('btn-resolvido-sim');
    const btnNao = document.getElementById('btn-resolvido-nao');
    const boxMotivo = document.getElementById('box-motivo-nao-resolvido');

    if (btnSim) {
        btnSim.style.background = 'white';
        btnSim.style.borderColor = '#cbd5e1';
        btnSim.style.color = '#475569';
    }
    if (btnNao) {
        btnNao.style.background = 'white';
        btnNao.style.borderColor = '#cbd5e1';
        btnNao.style.color = '#475569';
    }
    if (boxMotivo) boxMotivo.style.display = 'none';

    if (modal) modal.style.display = 'flex';
}

function fecharModalTabulacao() {
    const modal = document.getElementById('modal-tabulacao');
    if (modal) modal.style.display = 'none';
}

function selecionarResolvidoTab(isResolvido) {
    tabulacaoResolvido = isResolvido;
    const btnSim = document.getElementById('btn-resolvido-sim');
    const btnNao = document.getElementById('btn-resolvido-nao');
    const boxMotivo = document.getElementById('box-motivo-nao-resolvido');

    if (isResolvido) {
        btnSim.style.background = '#dcfce7';
        btnSim.style.borderColor = '#16a34a';
        btnSim.style.color = '#15803d';

        btnNao.style.background = 'white';
        btnNao.style.borderColor = '#cbd5e1';
        btnNao.style.color = '#475569';

        if (boxMotivo) boxMotivo.style.display = 'none';
    } else {
        btnNao.style.background = '#fee2e2';
        btnNao.style.borderColor = '#dc2626';
        btnNao.style.color = '#b91c1c';

        btnSim.style.background = 'white';
        btnSim.style.borderColor = '#cbd5e1';
        btnSim.style.color = '#475569';

        if (boxMotivo) boxMotivo.style.display = 'flex';
    }
}

async function confirmarEncerramentoTabulado() {
    if (tabulacaoResolvido === null) {
        alert('Por favor, indique se o atendimento foi resolvido ou não.');
        return;
    }

    const selectMotivo = document.getElementById('select-motivo-tabulacao');
    const motivoNaoResolvido = selectMotivo ? selectMotivo.value : '';

    if (!tabulacaoResolvido && !motivoNaoResolvido) {
        alert('Por favor, selecione o motivo da não-resolução.');
        return;
    }

    const prefixo = window.prefixoApp || '';
    try {
        const resposta = await fetch(prefixo + '/api/atendimento/encerrar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chatId: chatSelecionadoId,
                resolvido: tabulacaoResolvido,
                motivoNaoResolvido: tabulacaoResolvido ? null : motivoNaoResolvido
            })
        });
        const dados = await resposta.json();

        if (dados.sucesso) {
            fecharModalTabulacao();
            chatSelecionadoId = null;
            document.getElementById('chat-vazio').style.display = 'flex';
            document.getElementById('chat-ativo-container').style.display = 'none';

            carregarListaAtendimentos();
            carregarHistoricoAtendimentos();
        }
    } catch (erro) {
        console.error('Erro ao encerrar atendimento tabulado:', erro);
    }
}

async function carregarHistoricoAtendimentos() {
    const prefixo = window.prefixoApp || '';
    try {
        const url = prefixo + `/api/atendimento/historico?_t=${Date.now()}`;
        const resposta = await fetch(url, { cache: 'no-store' });
        const dados = await resposta.json();

        listaHistoricoCache = dados.historico || [];
        renderizarHistorico(listaHistoricoCache);
    } catch (erro) {
        console.error('Erro ao carregar histórico:', erro);
    }
}

function renderizarHistorico(lista) {
    const container = document.getElementById('lista-historico');
    if (!container) return;

    container.innerHTML = '';
    if (lista.length === 0) {
        container.innerHTML = '<div style="font-size: 11px; color: #94a3b8; text-align: center; padding: 8px;">Nenhum histórico encontrado</div>';
        return;
    }

    lista.forEach(chat => {
        const div = document.createElement('div');
        div.className = `card-chat ${chatSelecionadoId === chat.id ? 'ativo' : ''}`;
        div.style.opacity = '0.85';
        div.onclick = () => selecionarChat(chat);
        div.innerHTML = `
            <div class="header-card">
                <strong>${chat.nome}</strong>
                <span style="font-size: 10px; color: #dc2626; font-weight: bold;">Encerrado</span>
            </div>
            <div style="font-size: 10px; color: #64748b; font-family: monospace;">${chat.protocolo ? 'Prot: ' + chat.protocolo : 'E-mail: ' + (chat.email || 'Não informado')}</div>
        `;
        container.appendChild(div);
    });
}

function filtrarHistorico() {
    const termo = document.getElementById('filtro-historico')?.value.toLowerCase() || '';
    const filtrados = listaHistoricoCache.filter(item => 
        (item.nome && item.nome.toLowerCase().includes(termo)) ||
        (item.email && item.email.toLowerCase().includes(termo)) ||
        (item.protocolo && item.protocolo.toLowerCase().includes(termo))
    );
    renderizarHistorico(filtrados);
}

function tratarKeyPressOperador(event) {
    if (event.key === 'Enter') {
        enviarRespostaOperador();
    }
}

function desenharBalao(msg, container) {
    const isCliente = msg.de === 'cliente';
    const isSistema = msg.de === 'sistema';
    const texto = msg.texto || '';

    if (isSistema) {
        const div = document.createElement('div');
        div.style.cssText = 'align-self: center; background: #e0f2fe; color: #0369a1; padding: 6px 12px; border-radius: 6px; font-size: 11px; font-weight: 600; text-align: center; margin: 4px 0;';
        div.innerHTML = texto; // Usar innerHTML para permitir tags <b> e <br> do sistema
        container.appendChild(div);
        return;
    }

    const wrapper = document.createElement('div');
    wrapper.className = `msg-wrapper ${isCliente ? 'cliente' : 'atendente'}`;

    const autorTexto = isCliente ? '👤 Cliente' : `👨‍💼 ${msg.autor || 'Atendente Lello'}`;
    
    let conteudoHTML = '';

    if (msg.tipo === 'imagem' && msg.url) {
        conteudoHTML = `<img src="${msg.url}" alt="Imagem anexa" class="msg-img-conteudo" onclick="window.open('${msg.url}', '_blank')">`;
        if (texto) conteudoHTML += `<div style="margin-top: 8px;">${texto}</div>`;
    } else if (msg.tipo === 'arquivo' && msg.url) {
        conteudoHTML = `
            <a href="${msg.url}" target="_blank" class="msg-arquivo-card">
                <div class="msg-arquivo-icone">📄</div>
                <div class="msg-arquivo-info">
                    <span class="msg-arquivo-nome">${msg.nomeArquivo || 'Documento Anexo'}</span>
                    <span class="msg-arquivo-baixar">Clique para baixar</span>
                </div>
            </a>
        `;
        if (texto) conteudoHTML += `<div style="margin-top: 8px;">${texto}</div>`;
    } else {
        conteudoHTML = texto;
    }

    wrapper.innerHTML = `
        <div class="msg-meta">
            <span class="msg-autor">${autorTexto}</span>
        </div>
        <div class="msg-bubble">${conteudoHTML}</div>
    `;
    container.appendChild(wrapper);
}