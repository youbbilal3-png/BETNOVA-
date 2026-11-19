import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'
import { useLanguage } from '../i18n'

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice?: Promise<{ outcome: 'accepted' | 'dismissed' }> }

export default function InstallAppPrompt() {
  const { t } = useLanguage()
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [installed, setInstalled] = useState(false)
  useEffect(() => {
    const onPrompt = (event: Event) => { event.preventDefault(); setPromptEvent(event as InstallPromptEvent) }
    const onInstalled = () => { setInstalled(true); setPromptEvent(null) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled) }
  }, [])
  if (!promptEvent || dismissed || installed) return null
  return <aside className="bn-install-prompt"><div><b>{t('install_app')}</b><small>{t('install_hint')}</small></div><button onClick={async()=>{await promptEvent.prompt(); setPromptEvent(null)}} aria-label={t('install_app')}><Download size={18}/>{t('install_btn')}</button><button className="bn-install-close" onClick={()=>setDismissed(true)} aria-label={t('dismiss')}><X size={16}/></button></aside>
}
