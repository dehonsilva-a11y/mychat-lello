let chatSelecionadoId = null;
let chatSelecionadoStatus = null;
let quantidadeFilaAnterior = 0;
let ultimasMensagensCount = 0;
let listaHistoricoCache = [];

document.addEventListener('DOMContentLoaded', () => {
    // Carrega nome do operador guardado no navegador
    const nomeSalvo = localStorage.getItem('nomeOperador');
    if (nomeSalvo) {
        const inputOp = document.getElementById('nome-operador-input');
        if (inputOp) inputOp.value = nomeSalvo;
    }

    document.getElementById('nome-operador-input')?.addEventListener('change', (e) => {
        localStorage.setItem('nomeOperador', e.target.value.trim() || 'Atendente Lello');
    });

    carregarListaAtendimentos();
    carregarHistoricoAtendimentos();

    setInterval(carregarListaAtendimentos, 2000);
    setInterval(carregarMensagensChatAtivo, 1500);
});

// Emissor de Beep Sonoro via Web Audio API (sem precisar de arquivos .mp3)
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
    } catch (e) {
        // Ignora caso o navegador bloqueie áudio automático antes da interação do utilizador
    }
}

function obterNomeOperador() {
    const input = document.getElementById('nome-operador-input');
    return input ? input.value.trim() || 'Atendente Lello' : 'Atendente Lello';
}

async function carregarListaAtendimentos() {
    const prefixo = window.prefixoApp || '';
    try {
        const url = prefixo + `/api/atendimento/lista?_t=${Date.now()}`;
        const resposta = await fetch(url, { cache: 'no-store' });
        const dados = await resposta.json();

        const fila = dados.fila || [];
        const ativos = dados.emAtendimento || [];

        // Notificação sonora se entrar um novo cliente na fila
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

function renderizarFila(fila) {
    const container = document.getElementById('lista-fila');
    const countElement = document.getElementById('count-fila');
    
    if (countElement) countElement.innerText = fila.length;
    if (!container) return;

    container.innerHTML = '';

    if (fila.length === 0) {
        container.innerHTML = '<div style="font-size: 11px; color: #94a3b8; text-align: center; padding: 12px;">Nenhum cliente na fila</div>';
        return;
    }

    fila.forEach(chat => {
        const div = document.createElement('div');
        div.className = 'card-chat';
        div.innerHTML = `
            <div class="header-card">
                <strong>${chat.nome}</strong>
            </div>
            <div style="font-size: 11px; color: #64748b; margin-bottom: 6px;">Assunto: ${chat.origem || 'Geral'}</div>
            <button class="btn-assumir" onclick="assumirChat('${chat.id}')">Assumir Atendimento</button>
        `;
        container.appendChild(div);
    });
}

function renderizarAtivos(ativos) {
    const container = document.getElementById('lista-ativos');
    const countElement = document.getElementById('count-ativos');

    if (countElement) countElement.innerText = ativos.length;
    if (!container) return;

    container.innerHTML = '';

    if (ativos.length === 0) {
        container.innerHTML = '<div style="font-size: 11px; color: #94a3b8; text-align: center; padding: 12px;">Nenhum atendimento em andamento</div>';
        return;
    }

    ativos.forEach(chat => {
        const div = document.createElement('div');
        div.className = `card-chat ${chatSelecionadoId === chat.id ? 'ativo' : ''}`;
        div.onclick = () => selecionarChat(chat);
        div.innerHTML = `
            <div class="header-card">
                <strong>${chat.nome}</strong>
                <span class="badge-origem">${chat.origem || 'Geral'}</span>
            </div>
            <div style="font-size: 11px; color: #64748b;">Atendente: ${chat.atendente || 'Em aberto'}</div>
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
    const origemClienteAtivo = document.getElementById('origem-cliente-ativo');
    const areaResposta = document.getElementById('area-resposta-operador');
    const btnEncerrar = document.getElementById('btn-encerrar-chat');

    if (chatVazio) chatVazio.style.display = 'none';
    if (chatAtivoContainer) chatAtivoContainer.style.display = 'flex';

    if (nomeClienteAtivo) nomeClienteAtivo.innerText = chat.nome;
    if (origemClienteAtivo) origemClienteAtivo.innerText = chat.origem || 'Geral';

    // Se for visualização do histórico (encerrado), oculta botões de envio/encerramento
    if (chatSelecionadoStatus === 'Encerrado') {
        if (areaResposta) areaResposta.style.display = 'none';
        if (btnEncerrar) btnEncerrar.style.display = 'none';
    } else {
        if (areaResposta) areaResposta.style.display = 'flex';
        if (btnEncerrar) btnEncerrar.style.display = 'block';
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

        // Notificação sonora para novas mensagens do cliente
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
            desenharBalao(msg.texto, msg.de, msg.autor, container);
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
        
        carregarMensagensChatAtivo();
    } catch (erro) {
        console.error('Erro ao responder:', erro);
    }
}

async function encerrarAtendimentoAtual() {
    if (!chatSelecionadoId) return;
    if (!confirm('Deseja realmente encerrar este atendimento?')) return;

    const prefixo = window.prefixoApp || '';
    try {
        const resposta = await fetch(prefixo + '/api/atendimento/encerrar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatId: chatSelecionadoId })
        });
        const dados = await resposta.json();

        if (dados.sucesso) {
            chatSelecionadoId = null;
            document.getElementById('chat-vazio').style.display = 'flex';
            document.getElementById('chat-ativo-container').style.display = 'none';

            carregarListaAtendimentos();
            carregarHistoricoAtendimentos();
        }
    } catch (erro) {
        console.error('Erro ao encerrar atendimento:', erro);
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
            <div style="font-size: 11px; color: #64748b;">E-mail: ${chat.email || 'Não informado'}</div>
        `;
        container.appendChild(div);
    });
}

function filtrarHistorico() {
    const termo = document.getElementById('filtro-historico')?.value.toLowerCase() || '';
    const filtrados = listaHistoricoCache.filter(item => 
        (item.nome && item.nome.toLowerCase().includes(termo)) ||
        (item.email && item.email.toLowerCase().includes(termo))
    );
    renderizarHistorico(filtrados);
}

function tratarKeyPressOperador(event) {
    if (event.key === 'Enter') {
        enviarRespostaOperador();
    }
}

function desenharBalao(texto, remetente, autor, container) {
    const isCliente = remetente === 'cliente';
    const isSistema = remetente === 'sistema';

    if (isSistema) {
        const div = document.createElement('div');
        div.style.cssText = 'align-self: center; background: #e0f2fe; color: #0369a1; padding: 6px 12px; border-radius: 6px; font-size: 11px; font-weight: 600; text-align: center; margin: 4px 0;';
        div.innerText = texto;
        container.appendChild(div);
        return;
    }

    const wrapper = document.createElement('div');
    wrapper.className = `msg-wrapper ${isCliente ? 'cliente' : 'atendente'}`;

    const autorTexto = isCliente ? '👤 Cliente' : `👨‍💼 ${autor || 'Atendente Lello'}`;
    
    wrapper.innerHTML = `
        <div class="msg-meta">
            <span class="msg-autor">${autorTexto}</span>
        </div>
        <div class="msg-bubble">${texto}</div>
    `;
    container.appendChild(wrapper);
}