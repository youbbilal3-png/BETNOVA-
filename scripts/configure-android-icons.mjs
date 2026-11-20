import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const source = path.join(root, 'resources', 'android')
const destination = path.join(root, 'android', 'app', 'src', 'main', 'res')
const manifestPath = path.join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml')

if (!fs.existsSync(source)) throw new Error('BETNOVA Android icon resources are missing')
if (!fs.existsSync(destination)) throw new Error('Generated Android resources directory is missing')
if (!fs.existsSync(manifestPath)) throw new Error('Generated Android manifest is missing')

fs.cpSync(source, destination, { recursive: true })

const requiredIcons = [
  'drawable/betnova_launcher_foreground.xml',
  'drawable/betnova_launcher_monochrome.xml',
  'mipmap-anydpi/betnova_launcher.xml',
  'mipmap-anydpi/betnova_launcher_round.xml',
  'mipmap-anydpi-v26/betnova_launcher.xml',
  'mipmap-anydpi-v26/betnova_launcher_round.xml',
]
for (const relativePath of requiredIcons) {
  const iconPath = path.join(destination, relativePath)
  if (!fs.existsSync(iconPath)) throw new Error('Missing BETNOVA launcher resource: ' + relativePath)
}

for (const relativePath of ['drawable/betnova_launcher_foreground.xml', 'mipmap-anydpi/betnova_launcher.xml']) {
  const xml = fs.readFileSync(path.join(destination, relativePath), 'utf8')
  if (!xml.includes('android:width="108dp"') || !xml.includes('android:height="108dp"')) {
    throw new Error('BETNOVA icon layer must use Android 108dp adaptive-icon dimensions: ' + relativePath)
  }
}

for (const relativePath of ['mipmap-anydpi-v26/betnova_launcher.xml', 'mipmap-anydpi-v26/betnova_launcher_round.xml']) {
  const xml = fs.readFileSync(path.join(destination, relativePath), 'utf8')
  if (!xml.includes('@drawable/betnova_launcher_foreground') || !xml.includes('@drawable/betnova_launcher_monochrome')) {
    throw new Error('Adaptive launcher icon is not connected to BETNOVA artwork: ' + relativePath)
  }
}

let manifest = fs.readFileSync(manifestPath, 'utf8')
const iconAttribute = /android:icon\s*=\s*"[^"]+"/
const roundIconAttribute = /android:roundIcon\s*=\s*"[^"]+"/
if (!iconAttribute.test(manifest)) throw new Error('Android manifest has no application android:icon attribute')
manifest = manifest.replace(iconAttribute, 'android:icon="@mipmap/betnova_launcher"')
if (roundIconAttribute.test(manifest)) {
  manifest = manifest.replace(roundIconAttribute, 'android:roundIcon="@mipmap/betnova_launcher_round"')
} else {
  manifest = manifest.replace('android:icon="@mipmap/betnova_launcher"', 'android:icon="@mipmap/betnova_launcher" android:roundIcon="@mipmap/betnova_launcher_round"')
}
if (!manifest.includes('android:icon="@mipmap/betnova_launcher"') || !manifest.includes('android:roundIcon="@mipmap/betnova_launcher_round"')) {
  throw new Error('Android manifest is not using the unique BETNOVA launcher resources')
}
fs.writeFileSync(manifestPath, manifest)
console.log('Applied and verified unique BETNOVA launcher icons in the Android manifest.')
