let listaAssuntosGlobal = [];
let listaMotivosGlobal = [];
let operadorEmEdicao = null;

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

        // Carrega os dados iniciais do painel
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

    // Atualiza botão ativo
    const btn = Array.from(document.querySelectorAll('.tab-btn')).find(b => b.innerText.toLowerCase().includes(abaAtiva.substring(0, 3)));
    if (btn) btn.classList.add('active');
}

// INICIALIZAÇÃO DE DADOS
function inicializarPainelAdmin() {
    carregarAssuntos();
    carregarMotivos();
    carregarColaboradores();
}

// --- GESTÃO DE COLABORADORES ---

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
                <button onclick='abrirModalOperador(${JSON.stringify(op).replace(/'/g, "\\'")})' style="background:#3b82f6; color:white; border:none; padding:4px 8px; border-radius:4px; font-size:11px; cursor:pointer; margin-right:4px;">Editar</button>
                <button onclick="excluirOperador('${op.email}')" style="background:#ef4444; color:white; border:none; padding:4px 8px; border-radius:4px; font-size:11px; cursor:pointer;">Excluir</button>
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

    // Popula checkboxes com os assuntos existentes
    renderizarCheckboxesAssuntos();

    if (operador) {
        titulo.innerText = 'Editar Colaborador';
        inputNome.value = operador.nome || '';
        inputEmail.value = operador.email || '';
        inputEmail.disabled = true; // Não permite alterar email na edição
        selectFuncao.value = operador.funcao || 'colaborador';

        // Marca as checkboxes que o operador já tem atribuídas
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
    
    // Recolhe os assuntos selecionados
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

// --- GESTÃO DE ASSUNTOS (WIDGET) ---

async function carregarAssuntos() {
    const prefixo = window.prefixoApp || '';
    try {
        const res = await fetch(prefixo + '/api/assuntos');
        const dados = await res.json();
        listaAssuntosGlobal = dados.assuntos || [];
        renderizarAssuntos(listaAssuntosGlobal);
    } catch (erro) {
        console.error('Erro ao carregar assuntos:', erro);
    }
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
    } catch (erro) {
        console.error('Erro ao salvar assuntos:', erro);
    }
}

// --- GESTÃO DE MOTIVOS DE NÃO-RESOLUÇÃO ---

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