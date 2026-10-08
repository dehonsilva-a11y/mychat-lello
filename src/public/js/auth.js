// auth.js - A instância 'auth' é herdada diretamente do firebase-config.js

// Se o utilizador já estiver logado, redireciona automaticamente para o painel
auth.onAuthStateChanged(user => {
    if (user) {
        window.location.href = (window.prefixoApp || '') + '/painel.html';
    }
});

async function realizarLogin(event) {
    event.preventDefault();

    const emailInput = document.getElementById('email-input');
    const senhaInput = document.getElementById('senha-input');
    const btnLogin = document.getElementById('btn-login');
    const msgErro = document.getElementById('msg-erro');

    const email = emailInput ? emailInput.value.trim() : '';
    const senha = senhaInput ? senhaInput.value : '';

    if (!email || !senha) return;

    // Estado visual de carregamento
    if (btnLogin) {
        btnLogin.disabled = true;
        btnLogin.innerText = 'A autenticar...';
    }
    if (msgErro) msgErro.style.display = 'none';

    try {
        await auth.signInWithEmailAndPassword(email, senha);
        // O redirecionamento é efetuado automaticamente pelo listener onAuthStateChanged
    } catch (error) {
        console.error('Erro de autenticação:', error);

        if (btnLogin) {
            btnLogin.disabled = false;
            btnLogin.innerText = 'Entrar no Painel';
        }

        if (msgErro) {
            msgErro.style.display = 'block';
            switch (error.code) {
                case 'auth/invalid-credential':
                case 'auth/user-not-found':
                case 'auth/wrong-password':
                    msgErro.innerText = 'E-mail ou senha incorretos.';
                    break;
                case 'auth/invalid-email':
                    msgErro.innerText = 'E-mail em formato inválido.';
                    break;
                case 'auth/too-many-requests':
                    msgErro.innerText = 'Muitas tentativas. Aguarde um momento e tente novamente.';
                    break;
                default:
                    msgErro.innerText = 'Erro ao efetuar login. Tente novamente.';
            }
        }
    }
}