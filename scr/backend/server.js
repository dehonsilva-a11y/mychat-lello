require('dotenv').config(); // Carrega as variáveis de ambiente (chaves do Firebase)
const express = require('express');
const path = require('path');
const cors = require('cors');
const rotas = require('./rotas');

const app = express();

// Configuração CORS
app.use(cors({ origin: '*' }));
app.use(express.json());

// Servir os ficheiros estáticos do Frontend (para quando rodar localmente no VS Code)
const publicPath = path.join(__dirname, '../public');
app.use(express.static(publicPath));

// Ligar as rotas da API
app.use('/api', rotas);

// Rota principal para servir o HTML do cliente
app.get('/', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

// Rota para o Painel do Colaborador
app.get('/painel.html', (req, res) => {
    res.sendFile(path.join(publicPath, 'painel.html'));
});

// Inicialização condicional:
// Se NÃO estivermos no Vercel, iniciamos o servidor na porta 3000 (Local VS Code)
if (process.env.NODE_ENV !== 'production') {
    const PORTA = process.env.PORT || 3000;
    app.listen(PORTA, () => {
        console.log(`🚀 Servidor Mychat Local online na porta ${PORTA}`);
    });
}

// Exportar o app é OBRIGATÓRIO para o Vercel funcionar corretamente
module.exports = app;