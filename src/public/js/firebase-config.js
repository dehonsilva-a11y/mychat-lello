const firebaseConfig = {
  apiKey: "AIzaSyB4sye7C1kWx9MwlesGWEVaUQILKwv_XcU",
  authDomain: "mychat-lello.firebaseapp.com",
  projectId: "mychat-lello",
  storageBucket: "mychat-lello.firebasestorage.app",
  messagingSenderId: "245002270926",
  appId: "1:245002270926:web:3164b38f929911a65af89f"
};

// Inicializa o Firebase apenas se ainda não tiver sido inicializado
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

// Instâncias globais de Autenticação para uso em qualquer script
const auth = firebase.auth();
const googleProvider = new firebase.auth.GoogleAuthProvider();