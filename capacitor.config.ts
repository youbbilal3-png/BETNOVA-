import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.betnova.app',
  appName: 'BETNOVA',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
  },
}

export default config
