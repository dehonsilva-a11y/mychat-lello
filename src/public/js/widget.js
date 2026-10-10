(function() {
    let config = {
        appUrl: '',
        cliente: {}
    };

    function executarComando(acao, opcoes) {
        if (acao === 'init') {
            config = Object.assign(config, opcoes);
            carregarWidgetHTML();
        }
    }

    // Captura o objeto mychat existente e processa chamadas em fila
    const mychatStub = window.mychat;

    // Redefine window.mychat para chamadas diretas futuras
    window.mychat = function(acao, opcoes) {
        executarComando(acao, opcoes);
    };

    // Processa a fila de comandos acumulada antes do carregamento do script
    if (mychatStub && Array.isArray(mychatStub.q)) {
        mychatStub.q.forEach(args => executarComando(args[0], args[1]));
    }

    function capturarContextoOrigem() {
        return {
            urlCompleta: window.location.href,
            paginaTitulo: document.title,
            caminho: window.location.pathname,
            referrer: document.referrer || 'Acesso Direto'
        };
    }

    function carregarWidgetHTML() {
        if (document.getElementById('mychat-widget-button')) return;

        const baseUrl = config.appUrl ? config.appUrl.replace(/\/$/, '') : window.location.origin;

        // Injeção do ficheiro CSS
        const linkCss = document.createElement('link');
        linkCss.rel = 'stylesheet';
        linkCss.href = `${baseUrl}/css/widget.css`;
        document.head.appendChild(linkCss);

        // Botão flutuante do chat
        const btn = document.createElement('div');
        btn.id = 'mychat-widget-button';
        btn.innerHTML = '💬';
        btn.onclick = toggleWidget;
        document.body.appendChild(btn);

        // Container Iframe
        const container = document.createElement('div');
        container.id = 'mychat-widget-container';
        
        const contexto = capturarContextoOrigem();
        const nomeCliente = (config.cliente && config.cliente.nome && !config.cliente.nome.includes('{{')) ? config.cliente.nome : '';
        const emailCliente = (config.cliente && config.cliente.email && !config.cliente.email.includes('{{')) ? config.cliente.email : '';
        const contrato = (config.cliente && config.cliente.contrato && !config.cliente.contrato.includes('{{')) ? config.cliente.contrato : '';
        const imovel = (config.cliente && config.cliente.imovel && !config.cliente.imovel.includes('{{')) ? config.cliente.imovel : '';

        const queryParams = new URLSearchParams({
            origemUrl: contexto.urlCompleta,
            pagina: contexto.paginaTitulo,
            nome: nomeCliente,
            email: emailCliente,
            contrato: contrato,
            imovel: imovel,
            verificado: (emailCliente ? 'true' : 'false')
        });

        const iframe = document.createElement('iframe');
        iframe.id = 'mychat-widget-iframe';
        iframe.src = `${baseUrl}/index.html?${queryParams.toString()}`;
        // Permite acionar câmera e microfone para envio de fotos/mídia em dispositivos móveis
        iframe.allow = 'camera; microphone';
        
        container.appendChild(iframe);
        document.body.appendChild(container);
    }

    function toggleWidget() {
        const container = document.getElementById('mychat-widget-container');
        if (container.style.display === 'block') {
            container.style.display = 'none';
        } else {
            container.style.display = 'block';
        }
    }
})();