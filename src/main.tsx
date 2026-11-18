import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'
import './visual-polish.css'
import './mobile-app.css'
import './betnova-next-ui.css'
import './betnova-native-shell.css'
import './public-landing.css'
import './betnova-premium-theme.css'
import './nova-arena-home.css'\nimport './install-app.css'\nimport InstallAppPrompt from './components/InstallAppPrompt'
import { LanguageProvider } from './i18n'

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => undefined)
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LanguageProvider><App /><InstallAppPrompt /></LanguageProvider>
  </React.StrictMode>,
)