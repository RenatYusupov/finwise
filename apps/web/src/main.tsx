import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app/App';
import './app/styles/globals.css';

// Detect Telegram context SYNCHRONOUSLY before React mounts.
// This flag is frozen at page-load time and never changes during the session.
// We cannot rely on window.Telegram?.WebApp here because the SDK script
// loads asynchronously — it may not be defined yet at this point.
// Instead we use two synchronous signals:
//   1. window.TelegramWebviewProxy — injected by the native Telegram app
//      into the WebView before any JS runs (iOS, Android).
//   2. window.location.hash containing "tgWebApp" — Telegram appends launch
//      params to the URL hash synchronously before the page loads.
// Note: with BrowserRouter the hash is NOT used for routing, so checking it
// here is safe and does not interfere with navigation.
(window as unknown as Record<string, unknown>).__isTelegram = !!(
  (window as unknown as { TelegramWebviewProxy?: unknown }).TelegramWebviewProxy ||
  window.location.hash.includes('tgWebApp')
);

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
