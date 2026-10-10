let listaAssuntosGlobal = [];
let listaMotivosGlobal = [];
let listaRespostasRapidas = [];
let operadorEmEdicao = null;

// Variáveis do Modo Espião
let espiaoChatSelecionadoId = null;
let espiaoIntervalPolling = null;
let listaEspiaoCache = [];
let espiaoUltimasMensagensCount = 0;

// PROTEÇÃO DE ROTA E VERIFICAÇÃO DE PERFIL ADMIN
auth.onAuthStateChanged(async user => {
    if (!user) {
        window.location.href = (window.prefixoApp || '') + '/login.html';
        return;
    }

    const prefixo = window.prefixoApp || '';
    try {
        const res = await fetch(prefixo + `/api/operador/perfil?email=${encodeURIComponent(user.email)}`);
        const perfil = await res.json();

        if (!perfil || perfil.funcao !== 'admin') {
            alert('Acesso negado. Apenas administradores podem aceder a esta área.');
            window.location.href = prefixo + '/painel.html';
            return;
        }

        const nomeDisplay = document.getElementById('nome-admin-display');
        if (nomeDisplay) {
            nomeDisplay.innerText = perfil.nome || user.email;
        }

        // Carrega os dados iniciais do painel (incluindo o novo Dashboard)
        inicializarPainelAdmin();
    } catch (erro) {
        console.error('Erro ao verificar permissões:', erro);
        window.location.href = prefixo + '/login.html';
    }
});

async function fazerLogout() {
    try {
        await auth.signOut();
        window.location.href = (window.prefixoApp || '') + '/login.html';
    } catch (erro) {
        console.error('Erro ao efetuar logout:', erro);
    }
}

// NAVEGAÇÃO DE ABAS
function alternarAba(abaAtiva) {
    // Esconde todas as secções
    document.querySelectorAll('.aba-conteudo').forEach(el => el.style.display = 'none');
    // Remove classe 'active' de todos os botões
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));

    // Mostra a aba clicada
    const secao = document.getElementById(`aba-${abaAtiva}`);
    if (secao) secao.style.display = 'block';

    // Atualiza botão ativo (Mapeamento flexível por ID)
    const btnIdMap = {
        'dashboard': 'dash',
        'espiao': 'espi',
        'colaboradores': 'colab',
        'respostas': 'resp',
        'assuntos': 'assun',
        'motivos': 'motiv'
    };
    const prefixoAba = btnIdMap[abaAtiva] || abaAtiva.substring(0, 3);
    
    const btn = Array.from(document.querySelectorAll('.tab-btn')).find(b => b.innerText.toLowerCase().includes(prefixoAba));
    if (btn) btn.classList.add('active');

    // Acionamentos específicos de cada aba
    if (abaAtiva === 'dashboard') {
        carregarMetricasDashboard();
    }
    
    if (abaAtiva === 'espiao') {
        carregarListaEspiao();
        if (!espiaoIntervalPolling) {
            espiaoIntervalPolling = setInterval(carregarMensagensEspiaoAtivo, 2000);
        }
    } else {
        if (espiaoIntervalPolling) {
            clearInterval(espiaoIntervalPolling);
            espiaoIntervalPolling = null;
        }
    }
}

// INICIALIZAÇÃO DE DADOS
function inicializarPainelAdmin() {
    inicializarFiltroDatas();
    carregarMetricasDashboard();
    carregarColaboradores();
    carregarRespostasRapidas();
    carregarAssuntos();
    carregarMotivos();
}

// Preenche a Data Inicial (dia 1 do mês) e Data Final (hoje) para o Dashboard e para o Espião
function inicializarFiltroDatas() {
    const inputInicio = document.getElementById('dash-data-inicio');
    const inputFim = document.getElementById('dash-data-fim');
    const espiaoInicio = document.getElementById('espiao-data-inicio');
    const espiaoFim = document.getElementById('espiao-data-fim');

    const hoje = new Date();
    const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);

    const formataData = (data) => {
        const offset = data.getTimezoneOffset() * 60000;
        const dataLocal = new Date(data.getTime() - offset);
        return dataLocal.toISOString().split('T')[0];
    };

    const dataInicioStr = formataData(primeiroDia);
    const dataFimStr = formataData(hoje);

    if (inputInicio) inputInicio.value = dataInicioStr;
    if (inputFim) inputFim.value = dataFimStr;
    if (espiaoInicio) espiaoInicio.value = dataInicioStr;
    if (espiaoFim) espiaoFim.value = dataFimStr;
}

// ============================================================================
// --- GESTÃO DE MÉTRICAS (DASHBOARD) ---
// ============================================================================

async function carregarMetricasDashboard() {
    const prefixo = window.prefixoApp || '';
    const dataInicio = document.getElementById('dash-data-inicio')?.value || '';
    const dataFim = document.getElementById('dash-data-fim')?.value || '';

    try {
        const url = `${prefixo}/api/admin/metrics?inicio=${dataInicio}&fim=${dataFim}`;
        const res = await fetch(url);
        const dados = await res.json();

        // Helper seguro: Atualiza a propriedade innerText apenas se o elemento existir no DOM
        const atualizaKpi = (id, valor) => {
            const el = document.getElementById(id);
            if (el) el.innerText = valor;
        };

        // KPIs Gerais
        atualizaKpi('kpi-total', dados.total || 0);
        atualizaKpi('kpi-fila', dados.fila || 0);
        atualizaKpi('kpi-em-atendimento', dados.emAtendimento || 0);
        atualizaKpi('kpi-encerrados', dados.encerrados || 0);
        
        // Novos KPIs de Resolutividade
        atualizaKpi('kpi-resolvidos', dados.resolvidos || 0);
        atualizaKpi('kpi-nao-resolvidos', dados.naoResolvidos || 0);

        atualizaKpi('kpi-nps-media', dados.npsMedia || '-');
        atualizaKpi('kpi-nps-qtd', `${dados.qtdNps || 0} avaliações`);
        atualizaKpi('kpi-tma', `${dados.tmaMinutos || 0} min`);

        // Tabela de Operadores (Com Tooltip no e-mail)
        const tbodyOp = document.getElementById('tabela-metricas-operadores');
        if (tbodyOp) {
            tbodyOp.innerHTML = '';
            if (!dados.porOperador || dados.porOperador.length === 0) {
                tbodyOp.innerHTML = '<tr><td colspan="4" class="td-carregando">Sem dados no momento.</td></tr>';
            } else {
                dados.porOperador.forEach(op => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td title="${op.nome}"><strong>${op.nome}</strong></td>
                        <td>${op.atendimentos}</td>
                        <td>${op.encerrados}</td>
                        <td><span style="background: #fef08a; color: #854d0e; padding: 2px 6px; border-radius: 12px; font-weight: bold; font-size: 10px;">⭐ ${op.npsMedia}</span></td>
                    `;
                    tbodyOp.appendChild(tr);
                });
            }
        }

        // Tabela de Assuntos
        const tbodyAssunto = document.getElementById('tabela-metricas-assuntos');
        if (tbodyAssunto) {
            tbodyAssunto.innerHTML = '';
            if (!dados.porAssunto || dados.porAssunto.length === 0) {
                tbodyAssunto.innerHTML = '<tr><td colspan="2" class="td-carregando">Sem dados no momento.</td></tr>';
            } else {
                const assuntosOrdenados = dados.porAssunto.sort((a, b) => b.quantidade - a.quantidade);
                assuntosOrdenados.forEach(item => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td><span style="background: #e0f2fe; color: #0369a1; padding: 2px 8px; border-radius: 12px; font-weight: bold; font-size: 11px;">${item.assunto}</span></td>
                        <td>${item.quantidade} chamados</td>
                    `;
                    tbodyAssunto.appendChild(tr);
                });
            }
        }

        // Nova Tabela: Motivos de Não-Resolução
        const tbodyMotivos = document.getElementById('tabela-metricas-motivos');
        if (tbodyMotivos) {
            tbodyMotivos.innerHTML = '';
            if (!dados.porMotivoNaoResolvido || dados.porMotivoNaoResolvido.length === 0) {
                tbodyMotivos.innerHTML = '<tr><td colspan="2" class="td-carregando">Nenhum chamado não resolvido no período.</td></tr>';
            } else {
                const motivosOrdenados = dados.porMotivoNaoResolvido.sort((a, b) => b.quantidade - a.quantidade);
                motivosOrdenados.forEach(item => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td><span class="badge-motivo-nao-resolvido">${item.motivo}</span></td>
                        <td>${item.quantidade} ocorrências</td>
                    `;
                    tbodyMotivos.appendChild(tr);
                });
            }
        }

    } catch (erro) {
        console.error('Erro ao carregar métricas:', erro);
    }
}

// ============================================================================
// --- GESTÃO DE COLABORADORES ---
// ============================================================================

async function carregarColaboradores() {
    const prefixo = window.prefixoApp || '';
    try {
        const res = await fetch(prefixo + '/api/operadores/lista');
        const dados = await res.json();
        renderizarColaboradores(dados.operadores || []);
    } catch (erro) {
        console.error('Erro ao carregar colaboradores:', erro);
    }
}

function renderizarColaboradores(lista) {
    const tbody = document.getElementById('tabela-operadores-body');
    if (!tbody) return;

    tbody.innerHTML = '';
    if (lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="td-carregando">Nenhum colaborador encontrado.</td></tr>';
        return;
    }

    lista.forEach(op => {
        const tr = document.createElement('tr');
        const assuntosTexto = (op.assuntos && op.assuntos.length > 0) ? op.assuntos.join(', ') : 'Todos/Nenhum';
        const badgeFuncao = op.funcao === 'admin' ? '<span style="background:#fef08a; color:#854d0e; padding:2px 6px; border-radius:4px; font-size:11px; font-weight:bold;">Admin</span>' : 'Colaborador';
        const statusEmoji = op.status === 'disponivel' ? '🟢' : (op.status === 'pausa' ? '🟡' : '🔴');

        tr.innerHTML = `
            <td><strong>${op.nome || '-'}</strong></td>
            <td>${op.email}</td>
            <td>${badgeFuncao}</td>
            <td style="font-size: 11px; color: #64748b; max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${assuntosTexto}">${assuntosTexto}</td>
            <td style="font-size: 11px;">${statusEmoji} ${op.status || 'offline'}</td>
            <td>
                <button class="btn-editar-item" onclick='abrirModalOperador(${JSON.stringify(op).replace(/'/g, "\\'")})'>Editar</button>
                <button class="btn-remover-item" onclick="excluirOperador('${op.email}')">Excluir</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function abrirModalOperador(operador = null) {
    operadorEmEdicao = operador;
    const modal = document.getElementById('modal-operador');
    const titulo = document.getElementById('modal-titulo');
    const inputNome = document.getElementById('op-nome');
    const inputEmail = document.getElementById('op-email');
    const selectFuncao = document.getElementById('op-funcao');

    renderizarCheckboxesAssuntos();

    if (operador) {
        titulo.innerText = 'Editar Colaborador';
        inputNome.value = operador.nome || '';
        inputEmail.value = operador.email || '';
        inputEmail.disabled = true; 
        selectFuncao.value = operador.funcao || 'colaborador';

        if (operador.assuntos) {
            setTimeout(() => {
                const checkboxes = document.querySelectorAll('.check-assunto');
                checkboxes.forEach(cb => {
                    if (operador.assuntos.includes(cb.value)) cb.checked = true;
                });
            }, 100);
        }
    } else {
        titulo.innerText = 'Novo Colaborador';
        inputNome.value = '';
        inputEmail.value = '';
        inputEmail.disabled = false;
        selectFuncao.value = 'colaborador';
    }

    if (modal) modal.style.display = 'flex';
}

function fecharModalOperador() {
    const modal = document.getElementById('modal-operador');
    if (modal) modal.style.display = 'none';
    operadorEmEdicao = null;
}

function renderizarCheckboxesAssuntos() {
    const container = document.getElementById('container-checkboxes-assuntos');
    if (!container) return;

    if (listaAssuntosGlobal.length === 0) {
        container.innerHTML = '<span style="font-size: 11px; color: #94a3b8;">Nenhum assunto cadastrado ainda.</span>';
        return;
    }

    container.innerHTML = '';
    listaAssuntosGlobal.forEach(assunto => {
        const label = document.createElement('label');
        label.className = 'checkbox-item';
        label.innerHTML = `<input type="checkbox" class="check-assunto" value="${assunto}"> ${assunto}`;
        container.appendChild(label);
    });
}

async function salvarOperador(event) {
    event.preventDefault();
    const prefixo = window.prefixoApp || '';
    
    const nome = document.getElementById('op-nome').value.trim();
    const email = document.getElementById('op-email').value.trim();
    const funcao = document.getElementById('op-funcao').value;
    
    const checkboxes = document.querySelectorAll('.check-assunto:checked');
    const assuntos = Array.from(checkboxes).map(cb => cb.value);

    try {
        await fetch(prefixo + '/api/admin/operadores/salvar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, nome, funcao, assuntos })
        });
        fecharModalOperador();
        carregarColaboradores();
    } catch (erro) {
        console.error('Erro ao salvar operador:', erro);
        alert('Erro ao salvar colaborador.');
    }
}

async function excluirOperador(email) {
    if (!confirm(`Tem a certeza que deseja excluir o acesso de ${email}?`)) return;

    const prefixo = window.prefixoApp || '';
    try {
        await fetch(prefixo + `/api/admin/operadores?email=${encodeURIComponent(email)}`, {
            method: 'DELETE'
        });
        carregarColaboradores();
    } catch (erro) {
        console.error('Erro ao excluir operador:', erro);
        alert('Erro ao excluir colaborador.');
    }
}

// ============================================================================
// --- GESTÃO DE RESPOSTAS RÁPIDAS ---
// ============================================================================

async function carregarRespostasRapidas() {
    const prefixo = window.prefixoApp || '';
    try {
        const resposta = await fetch(prefixo + '/api/atendimento/respostas-rapidas');
        const dados = await resposta.json();
        listaRespostasRapidas = dados.respostas || [];
        renderizarListaRespostasRapidas();
    } catch (erro) {
        console.error('Erro ao carregar respostas rápidas:', erro);
    }
}

function renderizarListaRespostasRapidas() {
    const tbody = document.getElementById('tabela-respostas-body');
    if (!tbody) return;

    tbody.innerHTML = '';
    if (listaRespostasRapidas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="td-carregando">Nenhuma resposta rápida cadastrada.</td></tr>';
        return;
    }

    listaRespostasRapidas.forEach(rr => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${rr.titulo}</strong></td>
            <td style="white-space: pre-wrap; font-size: 12px; color: #475569;">${rr.texto}</td>
            <td>
                <button class="btn-editar-item" onclick='abrirModalRespostaRapida(${JSON.stringify(rr).replace(/'/g, "\\'")})'>Editar</button>
                <button class="btn-remover-item" onclick="excluirRespostaRapida('${rr.id}')">Remover</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function abrirModalRespostaRapida(rr = null) {
    const modal = document.getElementById('modal-resposta-rapida');
    const titulo = document.getElementById('modal-titulo-resposta');
    const inputId = document.getElementById('rr-id-edit');
    const inputTitulo = document.getElementById('rr-titulo');
    const inputTexto = document.getElementById('rr-texto');

    if (rr) {
        titulo.innerText = 'Editar Resposta Rápida';
        inputId.value = rr.id;
        inputTitulo.value = rr.titulo;
        inputTexto.value = rr.texto;
    } else {
        titulo.innerText = 'Nova Resposta Rápida';
        inputId.value = '';
        inputTitulo.value = '';
        inputTexto.value = '';
    }

    if (modal) modal.style.display = 'flex';
}

function fecharModalRespostaRapida() {
    const modal = document.getElementById('modal-resposta-rapida');
    if (modal) modal.style.display = 'none';
}

async function salvarRespostaRapida(event) {
    event.preventDefault();
    const prefixo = window.prefixoApp || '';
    
    const id = document.getElementById('rr-id-edit').value;
    const titulo = document.getElementById('rr-titulo').value.trim();
    const texto = document.getElementById('rr-texto').value.trim();

    try {
        await fetch(prefixo + '/api/admin/respostas-rapidas/salvar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id || null, titulo, texto })
        });
        fecharModalRespostaRapida();
        carregarRespostasRapidas();
    } catch (erro) {
        console.error('Erro ao salvar resposta rápida:', erro);
        alert('Erro ao salvar resposta rápida.');
    }
}

async function excluirRespostaRapida(id) {
    if (!confirm('Tem a certeza que deseja remover esta resposta rápida?')) return;
    const prefixo = window.prefixoApp || '';
    try {
        await fetch(prefixo + `/api/admin/respostas-rapidas?id=${id}`, {
            method: 'DELETE'
        });
        carregarRespostasRapidas();
    } catch (erro) {
        console.error('Erro ao excluir resposta rápida:', erro);
    }
}

// ============================================================================
// --- MODO ESPIÃO E AUDITORIA DE CHATS ---
// ============================================================================

async function carregarListaEspiao() {
    const prefixo = window.prefixoApp || '';
    const filtroStatus = document.getElementById('filtro-status-espiao')?.value || 'abertos'; 
    const dataInicio = document.getElementById('espiao-data-inicio')?.value || '';
    const dataFim = document.getElementById('espiao-data-fim')?.value || '';

    try {
        let url = prefixo;
        const params = `inicio=${dataInicio}&fim=${dataFim}&_t=${Date.now()}`;

        if (filtroStatus === 'abertos') {
            url += `/api/atendimento/lista?${params}`;
        } else {
            url += `/api/atendimento/historico?${params}`;
        }

        const res = await fetch(url, { cache: 'no-store' });
        const dados = await res.json();

        if (filtroStatus === 'abertos') {
            listaEspiaoCache = [...(dados.fila || []), ...(dados.emAtendimento || [])];
        } else {
            listaEspiaoCache = dados.historico || [];
        }

        filtrarListaEspiao();
    } catch (erro) {
        console.error('Erro ao carregar chats para espionagem:', erro);
    }
}

function filtrarListaEspiao() {
    const termo = (document.getElementById('input-busca-espiao')?.value || '').toLowerCase();
    const filtroAssunto = document.getElementById('filtro-assunto-espiao')?.value || 'todos';
    
    const filtrados = listaEspiaoCache.filter(chat => {
        // Busca por Nome, Email, Operador OU Protocolo
        const matchTexto = 
            (chat.nome && chat.nome.toLowerCase().includes(termo)) ||
            (chat.email && chat.email.toLowerCase().includes(termo)) ||
            (chat.atendente && chat.atendente.toLowerCase().includes(termo)) ||
            (chat.protocolo && chat.protocolo.toLowerCase().includes(termo));

        const assuntoChat = chat.origem || 'Geral';
        const matchAssunto = (filtroAssunto === 'todos') || (assuntoChat === filtroAssunto);

        return matchTexto && matchAssunto;
    });

    renderizarListaEspiao(filtrados);
}

function renderizarListaEspiao(lista) {
    const container = document.getElementById('lista-chats-espiao');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (lista.length === 0) {
        container.innerHTML = '<div style="font-size: 11px; color: #94a3b8; text-align: center; margin-top: 20px;">Nenhum chat encontrado.</div>';
        return;
    }

    lista.forEach(chat => {
        const div = document.createElement('div');
        div.className = `espiao-card ${espiaoChatSelecionadoId === chat.id ? 'ativo' : ''}`;
        
        const corStatus = chat.status === 'Em Atendimento' ? '#16a34a' : (chat.status === 'Encerrado' ? '#64748b' : '#dc2626');
        
        div.innerHTML = `
            <div class="espiao-card-header">
                <span class="espiao-card-nome">${chat.nome}</span>
                <span class="espiao-card-status" style="color: ${corStatus};">${chat.status}</span>
            </div>
            <div class="espiao-card-atendente">Op: ${chat.atendente || 'Sem atribuição'}</div>
        `;
        div.onclick = () => selecionarChatEspiao(chat);
        container.appendChild(div);
    });
}

function selecionarChatEspiao(chat) {
    espiaoChatSelecionadoId = chat.id;
    espiaoUltimasMensagensCount = 0;
    
    filtrarListaEspiao();

    document.getElementById('espiao-vazio').style.display = 'none';
    
    document.getElementById('espiao-nome-cliente').innerText = chat.nome;
    document.getElementById('espiao-nome-atendente').innerText = chat.atendente || 'Fila / Pendente';
    
    const badge = document.getElementById('espiao-badge-status');
    if (badge) {
        badge.innerText = chat.status;
        badge.style.background = chat.status === 'Em Atendimento' ? '#dcfce7' : (chat.status === 'Encerrado' ? '#f1f5f9' : '#fee2e2');
        badge.style.color = chat.status === 'Em Atendimento' ? '#16a34a' : (chat.status === 'Encerrado' ? '#64748b' : '#dc2626');
    }

    const badgeProtocolo = document.getElementById('espiao-protocolo');
    if (badgeProtocolo) {
        if (chat.protocolo) {
            badgeProtocolo.innerText = `Protocolo: ${chat.protocolo}`;
            badgeProtocolo.style.display = 'inline-block';
        } else {
            badgeProtocolo.style.display = 'none';
        }
    }

    const footer = document.getElementById('espiao-footer');
    if (chat.status === 'Encerrado') {
        footer.style.display = 'none';
    } else {
        footer.style.display = 'flex';
    }

    document.getElementById('espiao-mensagens').innerHTML = '';
    carregarMensagensEspiaoAtivo();
}

async function carregarMensagensEspiaoAtivo() {
    if (!espiaoChatSelecionadoId) return;

    const prefixo = window.prefixoApp || '';
    try {
        const url = prefixo + `/api/mensagem/cliente?chatId=${espiaoChatSelecionadoId}&_t=${Date.now()}`;
        const resposta = await fetch(url, { cache: 'no-store' });
        const dados = await resposta.json();

        const mensagens = dados.mensagens || [];
        const container = document.getElementById('espiao-mensagens');
        if (!container) return;

        if (mensagens.length !== espiaoUltimasMensagensCount) {
            container.innerHTML = '';
            mensagens.forEach(msg => {
                desenharBalaoEspiao(msg.texto, msg.de, msg.autor, container);
            });
            espiaoUltimasMensagensCount = mensagens.length;
            container.scrollTop = container.scrollHeight;
        }

    } catch (erro) {
        console.error('Erro ao ler mensagens do espião:', erro);
    }
}

async function enviarMensagemIntervencao() {
    if (!espiaoChatSelecionadoId) return;
    
    const input = document.getElementById('input-intervencao-gestor');
    const texto = input.value.trim();
    if (!texto) return;

    const prefixo = window.prefixoApp || '';
    const nomeGestorLogado = document.getElementById('nome-admin-display').innerText;

    input.value = '';

    try {
        await fetch(prefixo + '/api/atendimento/responder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                chatId: espiaoChatSelecionadoId, 
                mensagem: texto,
                atendente: `Gestor: ${nomeGestorLogado}`
            })
        });
        carregarMensagensEspiaoAtivo();
    } catch (erro) {
        console.error('Erro na intervenção do gestor:', erro);
    }
}

function tratarKeyPressGestor(event) {
    if (event.key === 'Enter') {
        enviarMensagemIntervencao();
    }
}

function desenharBalaoEspiao(texto, remetente, autor, container) {
    const isCliente = remetente === 'cliente';
    const isSistema = remetente === 'sistema';
    const isGestor = autor && autor.startsWith('Gestor');

    if (isSistema) {
        const div = document.createElement('div');
        div.className = 'msg-sistema';
        div.innerText = texto;
        container.appendChild(div);
        return;
    }

    const wrapper = document.createElement('div');
    
    if (isCliente) wrapper.className = 'msg-wrapper cliente';
    else if (isGestor) wrapper.className = 'msg-wrapper gestor';
    else wrapper.className = 'msg-wrapper atendente';

    const autorTexto = isCliente ? '👤 Cliente' : (isGestor ? `🛡️ ${autor}` : `👨‍💼 ${autor || 'Operador'}`);
    
    wrapper.innerHTML = `
        <div class="msg-meta">${autorTexto}</div>
        <div class="msg-bubble">${texto}</div>
    `;
    container.appendChild(wrapper);
}

// ============================================================================
// --- GESTÃO DE ASSUNTOS E MOTIVOS (CRUD SIMPLES) ---
// ============================================================================

async function carregarAssuntos() {
    const prefixo = window.prefixoApp || '';
    try {
        const res = await fetch(prefixo + '/api/assuntos');
        const dados = await res.json();
        listaAssuntosGlobal = dados.assuntos || [];
        renderizarAssuntos(listaAssuntosGlobal);
        preencherFiltroAssuntosEspiao();
    } catch (erro) {
        console.error('Erro ao carregar assuntos:', erro);
    }
}

function preencherFiltroAssuntosEspiao() {
    const select = document.getElementById('filtro-assunto-espiao');
    if (!select) return;

    select.innerHTML = '<option value="todos">Todos os Assuntos</option>';
    listaAssuntosGlobal.forEach(assunto => {
        const opt = document.createElement('option');
        opt.value = assunto;
        opt.innerText = assunto;
        select.appendChild(opt);
    });
}

function renderizarAssuntos(lista) {
    const container = document.getElementById('lista-assuntos-admin');
    if (!container) return;
    container.innerHTML = '';

    lista.forEach((assunto, index) => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span>${assunto}</span>
            <button class="btn-remover-item" onclick="removerAssunto(${index})">Remover</button>
        `;
        container.appendChild(li);
    });
}

async function adicionarAssunto() {
    const input = document.getElementById('input-novo-assunto');
    const valor = input.value.trim();
    if (!valor) return;

    if (!listaAssuntosGlobal.includes(valor)) {
        listaAssuntosGlobal.push(valor);
        await salvarAssuntosNoBanco();
        input.value = '';
    } else {
        alert('Este assunto já existe na lista.');
    }
}

async function removerAssunto(index) {
    if (!confirm('Remover este assunto da lista?')) return;
    listaAssuntosGlobal.splice(index, 1);
    await salvarAssuntosNoBanco();
}

async function salvarAssuntosNoBanco() {
    const prefixo = window.prefixoApp || '';
    try {
        await fetch(prefixo + '/api/admin/assuntos/salvar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lista: listaAssuntosGlobal })
        });
        renderizarAssuntos(listaAssuntosGlobal);
        preencherFiltroAssuntosEspiao();
    } catch (erro) {
        console.error('Erro ao salvar assuntos:', erro);
    }
}

async function carregarMotivos() {
    const prefixo = window.prefixoApp || '';
    try {
        const res = await fetch(prefixo + '/api/admin/motivos');
        const dados = await res.json();
        listaMotivosGlobal = dados.motivos || [];
        renderizarMotivos(listaMotivosGlobal);
    } catch (erro) {
        console.error('Erro ao carregar motivos:', erro);
    }
}

function renderizarMotivos(lista) {
    const container = document.getElementById('lista-motivos-admin');
    if (!container) return;
    container.innerHTML = '';

    lista.forEach((motivo, index) => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span>${motivo}</span>
            <button class="btn-remover-item" onclick="removerMotivo(${index})">Remover</button>
        `;
        container.appendChild(li);
    });
}

async function adicionarMotivo() {
    const input = document.getElementById('input-novo-motivo');
    const valor = input.value.trim();
    if (!valor) return;

    if (!listaMotivosGlobal.includes(valor)) {
        listaMotivosGlobal.push(valor);
        await salvarMotivosNoBanco();
        input.value = '';
    } else {
        alert('Este motivo já existe na lista.');
    }
}

async function removerMotivo(index) {
    if (!confirm('Remover este motivo da lista?')) return;
    listaMotivosGlobal.splice(index, 1);
    await salvarMotivosNoBanco();
}

async function salvarMotivosNoBanco() {
    const prefixo = window.prefixoApp || '';
    try {
        await fetch(prefixo + '/api/admin/motivos/salvar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lista: listaMotivosGlobal })
        });
        renderizarMotivos(listaMotivosGlobal);
    } catch (erro) {
        console.error('Erro ao salvar motivos:', erro);
    }
}