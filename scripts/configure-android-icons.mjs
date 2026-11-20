import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const source = path.join(root, 'resources', 'android')
const destination = path.join(root, 'android', 'app', 'src', 'main', 'res')

if (!fs.existsSync(source)) throw new Error('BETNOVA Android icon resources are missing')
if (!fs.existsSync(destination)) throw new Error('Generated Android resources directory is missing')

fs.cpSync(source, destination, { recursive: true })

const requiredIcons = [
  'drawable/ic_launcher_foreground.xml',
  'mipmap-anydpi-v21/ic_launcher.xml',
  'mipmap-anydpi-v21/ic_launcher_round.xml',
  'mipmap-anydpi-v26/ic_launcher.xml',
  'mipmap-anydpi-v26/ic_launcher_round.xml',
]
for (const relativePath of requiredIcons) {
  const iconPath = path.join(destination, relativePath)
  if (!fs.existsSync(iconPath)) throw new Error('Missing BETNOVA launcher resource: ' + relativePath)
}
const adaptiveIcon = fs.readFileSync(path.join(destination, 'mipmap-anydpi-v26/ic_launcher.xml'), 'utf8')
if (!adaptiveIcon.includes('@drawable/ic_launcher_foreground')) {
  throw new Error('Android adaptive launcher icon is not connected to the BETNOVA foreground artwork')
}
console.log('Verified and applied the custom BETNOVA launcher icons.')
