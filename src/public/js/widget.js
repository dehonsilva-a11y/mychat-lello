(function() {
    let config = {
        appUrl: '',
        cliente: {}
    };

    window.mychat = function(acao, opcoes) {
        if (acao === 'init') {
            config = Object.assign(config, opcoes);
            carregarWidgetHTML();
        }
    };

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

        // Trata a URL base para evitar erros de barra no final ou URL relativa
        const baseUrl = config.appUrl ? config.appUrl.replace(/\/$/, '') : window.location.origin;

        // INJEÇÃO DO ARQUIVO CSS EXTERNO
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
        
        // Monta a URL com os parâmetros de contexto
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