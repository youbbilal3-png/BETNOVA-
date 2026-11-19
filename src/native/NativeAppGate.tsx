import { useCallback, useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'

const VERSION_POLICY_URL = 'https://betnova-8daa3.web.app/app-version.json'

type VersionPolicy = {
  minimumSupportedVersion: string
  latestVersion: string
  downloadUrl: string
  message?: string
}

function compareVersions(left: string, right: string) {
  const a = left.split('.').map(part => Number.parseInt(part, 10) || 0)
  const b = right.split('.').map(part => Number.parseInt(part, 10) || 0)
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0)
    if (difference !== 0) return difference
  }
  return 0
}

export default function NativeAppGate() {
  const isNative = Capacitor.isNativePlatform()
  const [checking, setChecking] = useState(isNative)
  const hasChecked = useRef(false)
  const [error, setError] = useState('')
  const [installedVersion, setInstalledVersion] = useState('1.0')
  const [policy, setPolicy] = useState<VersionPolicy | null>(null)

  const checkVersion = useCallback(async () => {
    if (!isNative) return
    if (!hasChecked.current) setChecking(true)
    setError('')
    try {
      const [appInfo, response] = await Promise.all([
        App.getInfo(),
        fetch(`${VERSION_POLICY_URL}?_=${Date.now()}`, { cache: 'no-store' }),
      ])
      if (!response.ok) throw new Error('تعذر الوصول إلى خادم التحديثات')
      const remote = await response.json() as VersionPolicy
      if (!remote.minimumSupportedVersion || !remote.latestVersion) {
        throw new Error('بيانات إصدار التطبيق غير مكتملة')
      }
      setInstalledVersion(appInfo.version || '1.0')
      setPolicy(remote)
    } catch {
      // Keep the app usable on weak or temporarily unavailable connections.
      // If a mandatory policy was already loaded, preserve it until a fresh check succeeds.
      if (!hasChecked.current) setPolicy(null)
    } finally {
      hasChecked.current = true
      setChecking(false)
    }
  }, [isNative]

  useEffect(() => {
    if (!isNative) return
    void checkVersion()
    let listener: { remove: () => Promise<void> } | undefined
    void App.addListener('appStateChange', state => {
      if (state.isActive) void checkVersion()
    }).then(handle => { listener = handle })
    return () => { void listener?.remove() }
  }, [checkVersion, isNative])

  const mustUpdate = Boolean(
    policy && compareVersions(installedVersion, policy.minimumSupportedVersion) < 0,
  )

  if (!isNative || (!checking && !error && !mustUpdate)) return null

  const openUpdate = async () => {
    if (!policy?.downloadUrl) return
    try {
      const url = new URL(policy.downloadUrl)
      if (url.protocol !== 'https:') return
      await Browser.open({ url: url.toString() })
    } catch {
      setError('رابط التحديث غير صالح. حاول مرة أخرى لاحقاً.')
    }
  }

  return (
    <div className="bn-native-gate" role="dialog" aria-modal="true" aria-live="polite">
      <div className="bn-native-gate-card">
        <div className="bn-native-gate-mark">B</div>
        {checking ? (
          <>
            <p className="bn-native-gate-eyebrow">BETNOVA · SECURITY CHECK</p>
            <h1>جارٍ التحقق من التطبيق</h1>
            <p>يرجى الانتظار لحظة قبل المتابعة.</p>
          </>
        ) : error ? (
          <>
            <p className="bn-native-gate-eyebrow">BETNOVA · CONNECTION</p>
            <h1>تعذر التحقق من الإصدار</h1>
            <p>{error}</p>
            <button type="button" onClick={() => void checkVersion()}>إعادة المحاولة</button>
          </>
        ) : (
          <>
            <p className="bn-native-gate-eyebrow">BETNOVA · UPDATE REQUIRED</p>
            <h1>يتوفر تحديث جديد</h1>
            <p>{policy?.message || 'يرجى تحديث التطبيق إلى أحدث إصدار لمواصلة الاستخدام.'}</p>
            <p className="bn-native-gate-version">الإصدار الحالي: {installedVersion} · المطلوب: {policy?.minimumSupportedVersion}</p>
            {policy?.downloadUrl ? (
              <button type="button" onClick={() => void openUpdate()}>تحديث الآن</button>
            ) : (
              <p className="bn-native-gate-note">رابط التحديث غير متاح حالياً. يرجى المحاولة لاحقاً.</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
