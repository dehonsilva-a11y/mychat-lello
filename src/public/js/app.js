let idClienteAtual = null;
let intervalPolling = null;
let npsExibido = false;
let notaSelecionada = 5;

// Inicia o polling contínuo para procurar respostas do atendente
intervalPolling = setInterval(carregarRespostasServidor, 1500);

async function iniciarAtendimentoComTriagem() {
    const prefixo = window.prefixoApp || '';
    const clienteVerificado = window.clienteLogado || null;

    let dadosCliente = {};

    if (clienteVerificado) {
        dadosCliente = {
            nome: clienteVerificado.nome,
            email: clienteVerificado.email,
            assunto: 'Portal Lello',
            verificado: true
        };
    } else {
        const nomeInput = document.getElementById('triagem-nome');
        const emailInput = document.getElementById('triagem-email');
        const assuntoInput = document.getElementById('triagem-assunto');

        const nome = nomeInput ? nomeInput.value.trim() : '';
        const email = emailInput ? emailInput.value.trim() : '';
        const assunto = assuntoInput ? assuntoInput.value : 'Geral';

        if (!nome || !email) {
            alert('Por favor, preencha o Nome e o E-mail para continuar.');
            return;
        }

        dadosCliente = { nome, email, assunto, verificado: false };
    }

    const formTriagem = document.getElementById('form-triagem');
    if (formTriagem) formTriagem.style.display = 'none';

    document.getElementById('footer-iniciar').style.display = 'none';
    document.getElementById('footer-input').style.display = 'flex';

    adicionarMensagemSistema('Solicitando atendimento...');

    try {
        const resposta = await fetch(prefixo + '/api/iniciar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dadosCliente)
        });
        const dados = await resposta.json();
        
        idClienteAtual = dados.chatId;

        adicionarMensagemSistema(`
            <strong>Status:</strong> ${dados.status}<br>
            <strong>Posição:</strong> ${dados.posicao} | <strong>Espera Estimada:</strong> ${dados.tempoEstimado}
        `);
    } catch (erro) {
        console.error('Erro na requisição ao iniciar atendimento:', erro);
    }
}

async function enviarMensagem() {
    const input = document.getElementById('input-mensagem');
    if (!input) return;

    const texto = input.value.trim();
    if (!texto || !idClienteAtual) return;

    input.value = '';
    const prefixo = window.prefixoApp || '';

    try {
        await fetch(prefixo + '/api/mensagem', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mensagem: texto, chatId: idClienteAtual })
        });
        carregarRespostasServidor();
    } catch (erro) {
        console.error('Erro ao enviar mensagem:', erro);
    }
}

async function carregarRespostasServidor() {
    if (!idClienteAtual) return;

    const prefixo = window.prefixoApp || '';
    try {
        const url = prefixo + `/api/mensagem/cliente?chatId=${idClienteAtual}&_t=${Date.now()}`;
        const resposta = await fetch(url, { cache: 'no-store' });
        const dados = await resposta.json();

        const chatBody = document.getElementById('chat-messages');
        if (!chatBody) return;

        if (dados.mensagens && dados.mensagens.length > 0) {
            // Preserva apenas os avisos iniciais de sistema (triagem/posição)
            const msgsSistema = chatBody.querySelectorAll('.msg-sistema');
            chatBody.innerHTML = ''; 
            msgsSistema.forEach(m => chatBody.appendChild(m));

            // Renderiza todas as mensagens recebidas do Firestore
            dados.mensagens.forEach(msg => {
                const div = document.createElement('div');
                if (msg.de === 'cliente') {
                    div.className = 'msg-cliente';
                } else if (msg.de === 'atendente') {
                    div.className = 'msg-atendente';
                } else {
                    div.className = 'msg-sistema';
                }
                div.innerText = msg.texto;
                chatBody.appendChild(div);
            });

            chatBody.scrollTop = chatBody.scrollHeight;
        }

        // Se o atendimento foi encerrado no backend pelo operador
        if ((dados.status === 'Encerrado' || dados.status === 'encerrado') && !npsExibido) {
            if (intervalPolling) clearInterval(intervalPolling);
            npsExibido = true;
            exibirFormularioNPS();
        }
    } catch (erro) {
        console.error("❌ ERRO NO WIDGET:", erro); 
    }
}

function exibirFormularioNPS() {
    const footerInput = document.getElementById('footer-input');
    if (!footerInput) return;

    footerInput.style.display = 'flex';
    footerInput.style.flexDirection = 'column';
    footerInput.style.gap = '8px';
    footerInput.style.padding = '12px';

    footerInput.innerHTML = `
        <div style="font-size: 13px; font-weight: bold; color: #1e293b; text-align: center;">
            Como você avalia este atendimento?
        </div>
        <div id="estrelas-nps" style="display: flex; justify-content: center; gap: 8px; font-size: 22px; cursor: pointer;">
            <span onclick="selecionarNotaNPS(1)">⭐</span>
            <span onclick="selecionarNotaNPS(2)">⭐</span>
            <span onclick="selecionarNotaNPS(3)">⭐</span>
            <span onclick="selecionarNotaNPS(4)">⭐</span>
            <span onclick="selecionarNotaNPS(5)">⭐</span>
        </div>
        <input type="text" id="nps-comentario-input" placeholder="Deixe um comentário (opcional)..." style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 12px; outline: none;">
        <button onclick="enviarAvaliacaoNPS()" style="background: #A00028; color: white; border: none; padding: 8px; border-radius: 6px; font-weight: bold; font-size: 12px; cursor: pointer;">Enviar Avaliação</button>
    `;
    selecionarNotaNPS(5);
}

function selecionarNotaNPS(nota) {
    notaSelecionada = nota;
    const container = document.getElementById('estrelas-nps');
    if (!container) return;

    const estrelas = container.querySelectorAll('span');
    estrelas.forEach((el, index) => {
        el.style.opacity = index < nota ? '1' : '0.25';
    });
}

async function enviarAvaliacaoNPS() {
    const comentarioInput = document.getElementById('nps-comentario-input');
    const comentario = comentarioInput ? comentarioInput.value.trim() : '';
    const prefixo = window.prefixoApp || '';

    try {
        await fetch(prefixo + '/api/atendimento/nps', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chatId: idClienteAtual,
                nota: notaSelecionada,
                comentario
            })
        });

        const footerInput = document.getElementById('footer-input');
        if (footerInput) {
            footerInput.innerHTML = `
                <div style="font-size: 12px; color: #15803d; text-align: center; width: 100%; padding: 8px; font-weight: bold;">
                    ✅ Obrigado pela sua avaliação! Atendimento encerrado.
                </div>
            `;
        }
    } catch (erro) {
        console.error('Erro ao enviar NPS:', erro);
    }
}

function tratarKeyPress(event) {
    if (event.key === 'Enter') {
        enviarMensagem();
    }
}

function adicionarMensagemSistema(htmlConteudo) {
    const chatBody = document.getElementById('chat-messages');
    if (!chatBody) return;
    const div = document.createElement('div');
    div.className = 'msg-sistema';
    div.innerHTML = htmlConteudo;
    chatBody.appendChild(div);
    chatBody.scrollTop = chatBody.scrollHeight;
}