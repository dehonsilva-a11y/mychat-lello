require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const rotas = require('./rotas');

const app = express();

// Configuração do CORS e parser JSON
app.use(cors({ origin: '*' }));
app.use(express.json());

// Servir os ficheiros estáticos do Frontend (HTML, CSS, JS)
const publicPath = path.join(__dirname, '../public');
app.use(express.static(publicPath));

// Ligar as rotas da API
app.use('/api', rotas);

// Rota principal para o Widget do Cliente
app.get('/', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

// Rota para o Painel do Colaborador
app.get('/painel.html', (req, res) => {
    res.sendFile(path.join(publicPath, 'painel.html'));
});

// Fallback para rotas estáticas não encontradas
app.get('*', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

// Inicialização local (executado apenas fora da Vercel)
if (!process.env.VERCEL) {
    const PORTA = process.env.PORT || 3000;
    app.listen(PORTA, () => {
        console.log(`🚀 Servidor Mychat Local online na porta ${PORTA}`);
    });
}

// Exportar o app para o Vercel utilizar como Serverless Function
module.exports = app;