let idClienteAtual = null;
let intervalPolling = null;

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
        if (dados.status === 'Encerrado' || dados.status === 'encerrado') {
            if (intervalPolling) clearInterval(intervalPolling);
            
            const footerInput = document.getElementById('footer-input');
            if (footerInput) {
                footerInput.style.display = 'flex';
                footerInput.innerHTML = '<div style="font-size: 12px; color: #64748b; text-align: center; width: 100%; padding: 8px; font-weight: bold;">Atendimento encerrado pelo operador.</div>';
            }
        }
    } catch (erro) {
        console.error("❌ ERRO NO WIDGET:", erro); 
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