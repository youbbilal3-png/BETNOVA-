import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { supabase } from '../lib/supabase'

export default function PushNotificationRegistrar() {
  useEffect(() => {
    if (!supabase || !Capacitor.isNativePlatform()) return

    let active = true
    let userId: string | null = null
    type SupabaseClient = NonNullable<typeof supabase>
    let preferenceChannel: ReturnType<SupabaseClient['channel']> | null = null
    let registrationHandle: { remove: () => Promise<void> } | undefined
    let errorHandle: { remove: () => Promise<void> } | undefined

    const registerIfEnabled = async (currentUserId: string) => {
      try {
        const { data: preferences, error } = await supabase!
          .from('notification_preferences').select('enabled')
          .eq('user_id', currentUserId).maybeSingle()
        if (!active || error || !preferences?.enabled) return

        const permission = await PushNotifications.checkPermissions()
        if (!active || permission.receive !== 'granted') return

        await PushNotifications.createChannel({
          id: 'betnova_alerts',
          name: 'BETNOVA Alerts',
          description: 'Match events and account notifications',
          importance: 4,
          visibility: 1,
          sound: 'default',
          vibration: true,
        })
        if (active) await PushNotifications.register()
      } catch (error) {
        console.error('Could not refresh BETNOVA push registration', error)
      }
    }

    const changeUser = (nextUserId: string | null) => {
      if (userId === nextUserId) return
      userId = nextUserId
      if (preferenceChannel && supabase) {
        void supabase.removeChannel(preferenceChannel)
        preferenceChannel = null
      }
      if (!nextUserId || !supabase) return

      preferenceChannel = supabase.channel('push-preferences-' + nextUserId)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'notification_preferences',
          filter: 'user_id=eq.' + nextUserId,
        }, payload => {
          if ((payload.new as { enabled?: boolean } | null)?.enabled) {
            void registerIfEnabled(nextUserId)
          }
        })
        .subscribe()

      void registerIfEnabled(nextUserId)
    }

    void PushNotifications.addListener('registration', async token => {
      const currentUserId = userId
      if (!active || !currentUserId || !supabase) return
      const { error } = await supabase.from('device_push_tokens').upsert({
        token: token.value,
        user_id: currentUserId,
        platform: 'android',
        last_seen_at: new Date().toISOString(),
      }, { onConflict: 'token' })
      if (error) console.error('Could not save BETNOVA push token', error.message)
    }).then(handle => {
      registrationHandle = handle
      if (!active) void handle.remove()
    })

    void PushNotifications.addListener('registrationError', error => {
      if (active) console.error('BETNOVA push registration failed', error)
    }).then(handle => {
      errorHandle = handle
      if (!active) void handle.remove()
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      changeUser(session?.user?.id ?? null)
    })
    void supabase.auth.getUser().then(({ data }) => {
      if (active) changeUser(data.user?.id ?? null)
    })

    return () => {
      active = false
      subscription.unsubscribe()
      if (preferenceChannel && supabase) void supabase.removeChannel(preferenceChannel)
      void registrationHandle?.remove()
      void errorHandle?.remove()
    }
  }, [])

  return null
}
