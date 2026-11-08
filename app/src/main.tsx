import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './lib/auth/AuthProvider';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('No se encontró el contenedor #root de HIDRIA.');

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>,
);
