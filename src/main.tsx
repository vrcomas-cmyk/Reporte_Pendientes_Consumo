import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';

// Red de seguridad global: rechazos de promesa y errores sin capturar se
// registran en consola en vez de perderse en silencio.
window.addEventListener('unhandledrejection', (e) => { console.error('[unhandledrejection]', e.reason); });
window.addEventListener('error', (e) => { console.error('[error]', e.message); });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
