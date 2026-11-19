import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'
import './visual-polish.css'
import './mobile-app.css'
import './betnova-next-ui.css'
import './betnova-native-shell.css'
import './betnova-mobile-reference.css'
import './public-landing.css'
import './betnova-premium-theme.css'
import './nova-arena-home.css'
import './install-app.css'
import InstallAppPrompt from './components/InstallAppPrompt'
import NativeAppGate from './native/NativeAppGate'
import './native/native-app-gate.css'
import { LanguageProvider } from './i18n'

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => undefined)
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LanguageProvider><App /><InstallAppPrompt /><NativeAppGate /></LanguageProvider>
  </React.StrictMode>,
)