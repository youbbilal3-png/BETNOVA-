import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const source = path.join(root, 'resources', 'android')
const destination = path.join(root, 'android', 'app', 'src', 'main', 'res')

if (!fs.existsSync(source)) throw new Error('BETNOVA Android icon resources are missing')
if (!fs.existsSync(destination)) throw new Error('Generated Android resources directory is missing')

fs.cpSync(source, destination, { recursive: true })
console.log('Applied official BETNOVA green-and-black launcher icons.')
