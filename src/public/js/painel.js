let chatSelecionadoId = null;

document.addEventListener('DOMContentLoaded', () => {
    carregarListaAtendimentos();
    setInterval(carregarListaAtendimentos, 2000);
    setInterval(carregarMensagensChatAtivo, 1500);
});

async function carregarListaAtendimentos() {
    const prefixo = window.prefixoApp || '';
    try {
        const url = prefixo + `/api/atendimento/lista?_t=${Date.now()}`;
        const resposta = await fetch(url, { cache: 'no-store' });
        const dados = await resposta.json();

        renderizarFila(dados.fila || []);
        renderizarAtivos(dados.emAtendimento || []);
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
        container.innerHTML = '<div style="font-size: 12px; color: #94a3b8; text-align: center; padding: 12px;">Nenhum cliente na fila</div>';
        return;
    }

    fila.forEach(chat => {
        const div = document.createElement('div');
        div.className = 'card-chat';
        div.innerHTML = `
            <div class="header-card">
                <strong>${chat.nome}</strong>
            </div>
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
        container.innerHTML = '<div style="font-size: 12px; color: #94a3b8; text-align: center; padding: 12px;">Nenhum atendimento em andamento</div>';
        return;
    }

    ativos.forEach(chat => {
        const div = document.createElement('div');
        div.className = `card-chat ${chatSelecionadoId === chat.id ? 'ativo' : ''}`;
        div.onclick = () => selecionarChat(chat);
        div.innerHTML = `
            <div class="header-card">
                <strong>${chat.nome}</strong>
                <span class="badge-origem">${chat.origem}</span>
            </div>
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
            body: JSON.stringify({ chatId })
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

    const chatVazio = document.getElementById('chat-vazio');
    const chatAtivoContainer = document.getElementById('chat-ativo-container');
    const nomeClienteAtivo = document.getElementById('nome-cliente-ativo');
    const origemClienteAtivo = document.getElementById('origem-cliente-ativo');
    const containerMessages = document.getElementById('painel-messages');

    if (chatVazio) chatVazio.style.display = 'none';
    if (chatAtivoContainer) chatAtivoContainer.style.display = 'flex';

    if (nomeClienteAtivo) nomeClienteAtivo.innerText = chat.nome;
    if (origemClienteAtivo) origemClienteAtivo.innerText = chat.origem;

    if (containerMessages) containerMessages.innerHTML = ''; // Limpa a tela ao trocar de cliente
    carregarMensagensChatAtivo();
}

async function carregarMensagensChatAtivo() {
    if (!chatSelecionadoId) return;

    const prefixo = window.prefixoApp || '';
    try {
        const url = prefixo + `/api/mensagem/cliente?chatId=${chatSelecionadoId}&_t=${Date.now()}`;
        const resposta = await fetch(url, { cache: 'no-store' });
        const dados = await resposta.json();

        if (dados.mensagens && dados.mensagens.length > 0) {
            const container = document.getElementById('painel-messages');
            if (!container) return;

            container.innerHTML = ''; // Redesenha com a lista atualizada do Firestore

            dados.mensagens.forEach(msg => {
                desenharBalao(msg.texto, msg.de, container);
            });

            container.scrollTop = container.scrollHeight;
        }
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
            body: JSON.stringify({ chatId: chatSelecionadoId, mensagem: texto })
        });
        
        carregarMensagensChatAtivo();
    } catch (erro) {
        console.error('Erro ao responder:', erro);
    }
}

function tratarKeyPressOperador(event) {
    if (event.key === 'Enter') {
        enviarRespostaOperador();
    }
}

function desenharBalao(texto, remetente, container) {
    const isCliente = remetente === 'cliente';
    const wrapper = document.createElement('div');
    wrapper.className = `msg-wrapper ${isCliente ? 'cliente' : 'atendente'}`;

    const autor = isCliente ? '👤 Cliente' : '👨‍💼 Atendente Lello';
    
    wrapper.innerHTML = `
        <div class="msg-meta">
            <span class="msg-autor">${autor}</span>
        </div>
        <div class="msg-bubble">${texto}</div>
    `;
    container.appendChild(wrapper);
}