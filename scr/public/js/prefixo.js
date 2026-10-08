document.addEventListener('DOMContentLoaded', () => {
    const prefixo = window.prefixoApp || '';
    
    const logoElement = document.getElementById('logo-lello');
    if (logoElement) {
        logoElement.src = prefixo + '/assets/logo.png'; 
    }
});