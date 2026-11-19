import fs from 'node:fs'
import path from 'node:path'

const rootBuild = path.join('android', 'build.gradle')
const appBuild = path.join('android', 'app', 'build.gradle')
const googleServices = path.join('android', 'app', 'google-services.json')

for (const file of [rootBuild, appBuild, googleServices]) {
  if (!fs.existsSync(file)) throw new Error(`Required Firebase Android file is missing: ${file}`)
}

let root = fs.readFileSync(rootBuild, 'utf8')
if (!root.includes('com.google.gms:google-services')) {
  const dependencies = /dependencies\\s*\\{/
  if (!dependencies.test(root)) throw new Error('Could not find Android root Gradle buildscript dependencies')
  root = root.replace(dependencies, match => match + "\\n        classpath 'com.google.gms:google-services:4.4.2'")
  fs.writeFileSync(rootBuild, root)
}

let app = fs.readFileSync(appBuild, 'utf8')
if (!app.includes("com.google.gms.google-services")) {
  app += "\\n\\n// Configure Firebase Cloud Messaging from google-services.json\\napply plugin: 'com.google.gms.google-services'\\n"
  fs.writeFileSync(appBuild, app)
}

const config = JSON.parse(fs.readFileSync(googleServices, 'utf8'))
const packageName = config.client?.[0]?.client_info?.android_client_info?.package_name
if (packageName !== 'com.betnova.app') {
  throw new Error(`Firebase Android package mismatch: expected com.betnova.app, received ${packageName ?? 'missing'}`)
}

console.log('Firebase Google Services Gradle plugin configured for com.betnova.app')
