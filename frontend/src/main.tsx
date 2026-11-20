import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/index.css';

// Register Service Worker for PWA precaching
if ('serviceWorker' in navigator) {
  import('virtual:pwa-register').then(({ registerSW }) => {
    registerSW({
      onNeedRefresh() {
        console.log('[PWA] New content available, refresh needed.');
      },
      onOfflineReady() {
        console.log('[PWA] App shell precached. App is ready to work fully offline.');
      }
    });
  }).catch(() => {
    // virtual:pwa-register might not be present in dev mode
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
