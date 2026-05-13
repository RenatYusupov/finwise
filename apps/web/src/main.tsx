import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app/App';
import './app/styles/globals.css';

// Register service worker for network-first HTML fetching.
// This ensures Telegram iOS WebView always loads the latest index.html
// instead of serving a stale cached version after a deploy.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/finwise/sw.js', { scope: '/finwise/' })
      .catch(() => {/* SW registration failure is non-fatal */});
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
