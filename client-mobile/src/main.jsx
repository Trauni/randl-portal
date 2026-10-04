import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// Service Worker registrieren -- Voraussetzung dafuer, dass Chrome/Android "Zur Startseite
// hinzufuegen"/Installierbar anzeigt (Manifest + Icons allein reichen nicht, siehe public/sw.js).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/mobile/sw.js', { scope: '/mobile/' }).catch(() => {})
  })
}
