let idClienteAtual = null;
let intervalPolling = null;
let npsExibido = false;
let notaSelecionada = 5;

// Variável para evitar o loop de repetição no ecrã do cliente
let ultimasMensagensClienteCount = 0; 

// Captura Parâmetros de Contexto passados pela URL (via widget.js / teste.html / HubSpot)
const urlParams = new URLSearchParams(window.location.search);
const ctxNome = urlParams.get('nome') || '';
const ctxEmail = urlParams.get('email') || '';
const ctxContrato = urlParams.get('contrato') || '';
const ctxImovel = urlParams.get('imovel') || '';
const ctxOrigemUrl = urlParams.get('origemUrl') || '';
const ctxVerificado = urlParams.get('verificado') === 'true';

// Inicialização e Leitura do Contexto ao carregar
document.addEventListener('DOMContentLoaded', () => {
    carregarAssuntosTriagem();

    // Preenche campos de triagem caso venham na URL
    const nomeInput = document.getElementById('triagem-nome');
    const emailInput = document.getElementById('triagem-email');

    if (nomeInput && ctxNome) nomeInput.value = ctxNome;
    if (emailInput && ctxEmail) emailInput.value = ctxEmail;

    // Se o cliente for verificado (com e-mail informado), oculta a coleta de nome e e-mail
    if (ctxVerificado && ctxEmail) {
        const boxNome = document.getElementById('box-triagem-nome');
        const boxEmail = document.getElementById('box-triagem-email');
        if (boxNome) boxNome.style.display = 'none';
        if (boxEmail) boxEmail.style.display = 'none';
        
        const tituloTriagem = document.getElementById('titulo-triagem');
        if (tituloTriagem) tituloTriagem.innerText = 'Selecione o assunto do atendimento';
    }
});

// Polling contínuo para verificar respostas do atendente
intervalPolling = setInterval(carregarRespostasServidor, 1500);

async function carregarAssuntosTriagem() {
    const prefixo = window.prefixoApp || '';
    try {
        const res = await fetch(prefixo + '/api/assuntos');
        const dados = await res.json();
        const select = document.getElementById('triagem-assunto');
        if (select) {
            select.innerHTML = '<option value="">Selecione o assunto...</option>';
            (dados.assuntos || []).forEach(a => {
                const opt = document.createElement('option');
                opt.value = a;
                opt.innerText = a;
                select.appendChild(opt);
            });
        }
    } catch (erro) {
        console.error('Erro ao carregar assuntos:', erro);
    }
}

async function iniciarAtendimentoComTriagem() {
    const prefixo = window.prefixoApp || '';

    const nomeInput = document.getElementById('triagem-nome');
    const emailInput = document.getElementById('triagem-email');
    const assuntoInput = document.getElementById('triagem-assunto');

    const nome = (nomeInput ? nomeInput.value.trim() : '') || ctxNome || 'Cliente';
    const email = (emailInput ? emailInput.value.trim() : '') || ctxEmail || 'Não informado';
    const assunto = (assuntoInput ? assuntoInput.value : '') || 'Geral';

    if (!nome || !email || !assunto) {
        alert('Por favor, preencha todos os campos e selecione um assunto para continuar.');
        return;
    }

    const dadosCliente = {
        nome,
        email,
        assunto,
        verificado: ctxVerificado,
        contrato: ctxContrato,
        imovel: ctxImovel,
        origemUrl: ctxOrigemUrl
    };

    const formTriagem = document.getElementById('form-triagem');
    if (formTriagem) formTriagem.style.display = 'none';

    document.getElementById('footer-iniciar').style.display = 'none';
    document.getElementById('footer-input').style.display = 'flex';

    ultimasMensagensClienteCount = 0; // Zera o contador de mensagens no início do chat

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

// UPLOAD DE ANEXOS PELO CLIENTE
function acionarInputAnexoCliente() {
    const input = document.getElementById('input-anexo-cliente');
    if (input) input.click();
}

async function enviarAnexoCliente(event) {
    const file = event.target.files[0];
    if (!file || !idClienteAtual) return;

    event.target.value = '';

    const prefixo = window.prefixoApp || '';
    const formData = new FormData();
    formData.append('arquivo', file);

    const chatBody = document.getElementById('chat-messages');

    try {
        if (chatBody) {
            const loadingDiv = document.createElement('div');
            loadingDiv.id = 'loading-anexo-cliente';
            loadingDiv.style.cssText = 'align-self: flex-end; color: #94a3b8; font-size: 11px; margin-bottom: 8px; font-weight: bold;';
            loadingDiv.innerText = 'A enviar anexo... ⏳';
            chatBody.appendChild(loadingDiv);
            chatBody.scrollTop = chatBody.scrollHeight;
        }

        const resUpload = await fetch(prefixo + '/api/upload', {
            method: 'POST',
            body: formData
        });

        const dadosUpload = await resUpload.json();

        if (dadosUpload.sucesso) {
            await fetch(prefixo + '/api/mensagem', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chatId: idClienteAtual,
                    mensagem: '',
                    tipo: dadosUpload.tipo,
                    url: dadosUpload.url,
                    nomeArquivo: dadosUpload.nomeArquivo
                })
            });
            carregarRespostasServidor();
        } else {
            alert('Erro ao enviar anexo: ' + (dadosUpload.erro || 'Desconhecido'));
            const el = document.getElementById('loading-anexo-cliente');
            if (el) el.remove();
        }
    } catch (erro) {
        console.error('Erro ao enviar anexo do cliente:', erro);
        alert('Ocorreu um erro ao enviar o anexo. Tente novamente.');
        const el = document.getElementById('loading-anexo-cliente');
        if (el) el.remove();
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

        // Controle visual de conversão para Ticket
        const widgetHeaderInfo = document.getElementById('widget-header-info');
        if (dados.status === 'Ticket') {
            if (!widgetHeaderInfo) {
                const header = document.querySelector('.chat-header');
                const titleSpan = header.querySelector('span');
                titleSpan.style.display = 'none';

                const infoDiv = document.createElement('div');
                infoDiv.id = 'widget-header-info';
                infoDiv.className = 'chat-header-info';
                infoDiv.innerHTML = `
                    <span class="badge-ticket-widget">🎫 TICKET: ${dados.subStatusTicket || 'Aberto'}</span>
                `;
                header.appendChild(infoDiv);
            } else {
                widgetHeaderInfo.innerHTML = `<span class="badge-ticket-widget">🎫 TICKET: ${dados.subStatusTicket || 'Aberto'}</span>`;
            }
        }

        // Se houver mensagens e a quantidade for DIFERENTE da que já temos renderizada, nós redesenhamos o ecrã
        if (dados.mensagens && dados.mensagens.length !== ultimasMensagensClienteCount) {
            
            // Preserva avisos de sistema iniciais (Fila, Posição)
            const msgsSistemaIniciais = Array.from(chatBody.querySelectorAll('.msg-sistema')).filter(m => m.innerHTML.includes('<strong>Status:</strong>') || m.innerHTML.includes('Solicitando atendimento'));
            
            chatBody.innerHTML = ''; 
            msgsSistemaIniciais.forEach(m => chatBody.appendChild(m));

            // Renderiza as mensagens recebidas da BD
            dados.mensagens.forEach(msg => {
                const div = document.createElement('div');
                if (msg.de === 'cliente') {
                    div.className = 'msg-cliente';
                } else if (msg.de === 'atendente') {
                    div.className = 'msg-atendente';
                } else {
                    div.className = 'msg-sistema'; // Mensagens do protocolo, nps, transferências
                }

                if (msg.de === 'sistema') {
                    div.innerHTML = msg.texto;
                } else {
                    let conteudoHTML = '';
                    if (msg.tipo === 'imagem' && msg.url) {
                        conteudoHTML = `<img src="${msg.url}" alt="Imagem" class="msg-img-widget" onclick="window.open('${msg.url}', '_blank')">`;
                        if (msg.texto) conteudoHTML += `<div style="margin-top: 4px;">${msg.texto}</div>`;
                    } else if (msg.tipo === 'arquivo' && msg.url) {
                        conteudoHTML = `
                            <a href="${msg.url}" target="_blank" class="msg-arquivo-widget-card">
                                <div style="font-size: 16px;">📄</div>
                                <div>
                                    <div class="msg-arquivo-widget-nome">${msg.nomeArquivo || 'Documento Anexo'}</div>
                                    <div class="msg-arquivo-widget-baixar">Clique para baixar</div>
                                </div>
                            </a>
                        `;
                        if (msg.texto) conteudoHTML += `<div style="margin-top: 4px;">${msg.texto}</div>`;
                    } else {
                        conteudoHTML = msg.texto || '';
                    }
                    div.innerHTML = conteudoHTML;
                }

                chatBody.appendChild(div);
            });

            // Atualiza o contador de controlo e faz scroll para baixo
            ultimasMensagensClienteCount = dados.mensagens.length;
            chatBody.scrollTop = chatBody.scrollHeight;
        }

        // Se o atendimento foi encerrado no backend
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
                <div style="font-size: 12px; color: #15803d; text-align: center; width: 100%; padding: 8px; font-weight: bold; display: flex; flex-direction: column; gap: 8px;">
                    <span>✅ Obrigado pela sua avaliação! Atendimento encerrado.</span>
                    <button onclick="reiniciarAtendimento()" style="background: #A00028; color: white; border: none; padding: 8px; border-radius: 6px; font-weight: bold; cursor: pointer;">🔄 Iniciar Novo Atendimento</button>
                </div>
            `;
        }
    } catch (erro) {
        console.error('Erro ao enviar NPS:', erro);
    }
}

function reiniciarAtendimento() {
    idClienteAtual = null;
    npsExibido = false;
    ultimasMensagensClienteCount = 0; // Reset na variável do ciclo

    // Restaura o cabeçalho original se for Ticket
    const widgetHeaderInfo = document.getElementById('widget-header-info');
    if (widgetHeaderInfo) widgetHeaderInfo.remove();
    const header = document.querySelector('.chat-header');
    if (header) {
        const titleSpan = header.querySelector('span');
        if (titleSpan) titleSpan.style.display = 'inline-block';
    }

    // Limpa mensagens do chat e restaura o formulário de triagem
    const chatBody = document.getElementById('chat-messages');
    if (chatBody) {
        chatBody.innerHTML = `
            <div id="form-triagem" class="form-triagem-box">
                <h4 id="titulo-triagem">${(ctxVerificado && ctxEmail) ? 'Selecione o assunto do atendimento' : 'Preencha os seus dados'}</h4>
                
                <div class="campo-triagem" id="box-triagem-nome" style="${(ctxVerificado && ctxEmail) ? 'display: none;' : ''}">
                    <label for="triagem-nome">Nome *</label>
                    <input type="text" id="triagem-nome" placeholder="Seu nome" value="${ctxNome}">
                </div>
                
                <div class="campo-triagem" id="box-triagem-email" style="${(ctxVerificado && ctxEmail) ? 'display: none;' : ''}">
                    <label for="triagem-email">E-mail *</label>
                    <input type="email" id="triagem-email" placeholder="seu@email.com" value="${ctxEmail}">
                </div>

                <div class="campo-triagem">
                    <label for="triagem-assunto">Assunto *</label>
                    <select id="triagem-assunto">
                        <option value="">A carregar assuntos...</option>
                    </select>
                </div>
            </div>
        `;
    }

    // Restaura o estado e layout dos rodapés
    const footerInput = document.getElementById('footer-input');
    const footerIniciar = document.getElementById('footer-iniciar');

    if (footerInput) {
        footerInput.style.display = 'none';
        footerInput.style.flexDirection = 'row';
        footerInput.style.padding = '10px 12px';
        footerInput.innerHTML = `
            <input type="file" id="input-anexo-cliente" style="display: none;" onchange="enviarAnexoCliente(event)">
            <button class="btn-anexo-widget" onclick="acionarInputAnexoCliente()" title="Enviar imagem ou ficheiro" style="background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; color: #64748b;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
                </svg>
            </button>
            <input type="text" id="input-mensagem" placeholder="Escreva a sua mensagem..." onkeypress="tratarKeyPress(event)">
            <button class="btn-send" onclick="enviarMensagem()">Enviar</button>
        `;
    }
    if (footerIniciar) footerIniciar.style.display = 'flex';

    // Recarrega os assuntos na triagem
    carregarAssuntosTriagem();

    // Reativa o polling do servidor
    if (intervalPolling) clearInterval(intervalPolling);
    intervalPolling = setInterval(carregarRespostasServidor, 1500);
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