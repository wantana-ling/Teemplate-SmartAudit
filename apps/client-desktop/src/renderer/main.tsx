import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import './index.css';

try {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    throw new Error('Root element not found');
  }

  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <HashRouter>
        <App />
      </HashRouter>
    </React.StrictMode>
  );
} catch (error) {
  console.error('[App] Failed to mount:', error);
  document.body.innerHTML = `
    <div style="padding: 20px; font-family: system-ui;">
      <h1 style="color: red;">Error Loading App</h1>
      <pre>${error}</pre>
    </div>
  `;
}
