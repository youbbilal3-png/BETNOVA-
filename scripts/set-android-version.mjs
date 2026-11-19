import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const policyPath = path.join(root, 'public', 'app-version.json')
const gradlePath = path.join(root, 'android', 'app', 'build.gradle')

const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'))
const versionName = String(policy.latestVersion ?? '').trim()
const match = versionName.match(/^(\\d+)\\.(\\d+)(?:\\.(\\d+))?$/)
if (!match) {
  throw new Error('public/app-version.json latestVersion must use MAJOR.MINOR or MAJOR.MINOR.PATCH')
}

const major = Number(match[1])
const minor = Number(match[2])
const patch = Number(match[3] ?? 0)
const versionCode = major * 1_000_000 + minor * 1_000 + patch
if (!Number.isSafeInteger(versionCode) || versionCode < 1 || versionCode > 2_100_000_000) {
  throw new Error('Calculated Android versionCode is outside the supported range')
}

let gradle = fs.readFileSync(gradlePath, 'utf8')
if (!/defaultConfig\\s*\\{/.test(gradle)) {
  throw new Error('Could not find defaultConfig in generated Android app/build.gradle')
}
if (/versionCode\\s+\\d+/.test(gradle)) {
  gradle = gradle.replace(/versionCode\\s+\\d+/, `versionCode ${versionCode}`)
} else {
  gradle = gradle.replace(/(defaultConfig\\s*\\{)/, `$1\\n        versionCode ${versionCode}`)
}
if (/versionName\\s+["'][^"']+["']/.test(gradle)) {
  gradle = gradle.replace(/versionName\\s+["'][^"']+["']/, `versionName "${versionName}"`)
} else {
  gradle = gradle.replace(/(defaultConfig\\s*\\{)/, `$1\\n        versionName "${versionName}"`)
}

fs.writeFileSync(gradlePath, gradle)
console.log(`BETNOVA Android version: ${versionName} (versionCode ${versionCode})`)
