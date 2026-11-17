import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'
import './visual-polish.css'
import './mobile-app.css'
import { LanguageProvider } from './i18n'

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => undefined)
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LanguageProvider><App /></LanguageProvider>
  </React.StrictMode>,
)