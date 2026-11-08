import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './lib/auth/AuthProvider';
import { initServiceWorker } from './pwa/register';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('No se encontró el contenedor #root de HIDRIA.');

// El SW se registra al arrancar (también en /login) para que la app sea instalable desde
// el primer acceso. En `dev` está deshabilitado (ver vite.config.ts).
initServiceWorker();

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>,
);
