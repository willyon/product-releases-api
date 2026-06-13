#!/usr/bin/env node
/**
 * 本地开发：写入桌面端 userData/license.json，模拟试用 / 免费（试用过期）/ Pro。
 *
 * 用法：
 *   npm run license:mock -- trial|free|pro
 *   npm run license:mock -- pro --device-id <64hex>
 *
 * 需配置 .env 中 LICENSE_PRIVATE_KEY_BASE64；写入后请完全重启 Electron。
 */
require('dotenv').config()
const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { signLicensePayload, buildTrialPayload, buildProPayload } = require('../src/utils/licenseSigning')
const { newLicenseId, addDaysMs, assertDeviceId } = require('../src/utils/licenseCrypto')
const { TRIAL_DAYS } = require('../src/config/licenseConfig')

const APP_ELECTRON = path.join(__dirname, '../../xiaoxiao-album-app/electron')
const { getDeviceId } = require(path.join(APP_ELECTRON, 'licenseDevice.cjs'))
const { resolveEdition } = require(path.join(APP_ELECTRON, 'licenseVerifier.cjs'))

const USER_DATA_BASENAME = 'xiaoxiao-photos-app'
const EDITIONS = new Set(['trial', 'free', 'pro'])
const FREE_TRIAL_EXPIRES_MS = Date.parse('2020-01-01T00:00:00.000Z')

function parseArgs(argv) {
  const positional = []
  let deviceId = null
  let userData = null

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--device-id') {
      deviceId = argv[i + 1]
      i += 1
      continue
    }
    if (arg === '--user-data') {
      userData = argv[i + 1]
      i += 1
      continue
    }
    if (!arg.startsWith('-')) positional.push(arg)
  }

  return { edition: positional[0], deviceId, userData }
}

function getDefaultUserDataDir() {
  if (process.platform === 'darwin') {
    return path.join(process.env.HOME || os.homedir(), 'Library/Application Support', USER_DATA_BASENAME)
  }
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || os.homedir(), 'AppData', 'Roaming')
    return path.join(appData, USER_DATA_BASENAME)
  }
  return path.join(process.env.HOME || os.homedir(), '.config', USER_DATA_BASENAME)
}

const { readLicenseFile } = require(path.join(APP_ELECTRON, 'licenseStore.cjs'))

function buildPayload(edition, { deviceId, existing }) {
  const licenseId = existing?.payload?.license_id || newLicenseId()
  const deviceIds = [...new Set([...(existing?.payload?.device_ids || []), deviceId])]

  if (edition === 'pro') {
    return buildProPayload({ deviceIds, licenseId })
  }

  const trialExpiresAtMs = edition === 'free' ? FREE_TRIAL_EXPIRES_MS : addDaysMs(TRIAL_DAYS)
  return buildTrialPayload({ deviceIds, trialExpiresAtMs, licenseId })
}

function printUsage() {
  console.error(`Usage: npm run license:mock -- <${[...EDITIONS].join('|')}> [--device-id <64hex>] [--user-data <dir>]`)
}

function main() {
  const { edition, deviceId: deviceIdArg, userData: userDataArg } = parseArgs(process.argv.slice(2))
  if (!edition || !EDITIONS.has(edition)) {
    printUsage()
    process.exit(1)
  }

  let deviceId = null
  try {
    deviceId = assertDeviceId(String(deviceIdArg || getDeviceId()).trim().toLowerCase())
  } catch {
    console.error('device_id 须为 64 位 hex')
    process.exit(1)
  }

  const userDataDir = path.resolve(userDataArg || getDefaultUserDataDir())
  fs.mkdirSync(userDataDir, { recursive: true })
  const licensePath = path.join(userDataDir, 'license.json')

  const existing = readLicenseFile(userDataDir)
  const payload = buildPayload(edition, { deviceId, existing: existing })
  const licenseFile = signLicensePayload(payload)
  fs.writeFileSync(licensePath, JSON.stringify(licenseFile, null, 2), 'utf8')

  const publicKey = crypto.createPublicKey(
    fs.readFileSync(path.join(__dirname, '../config/license-public.pem'), 'utf8')
  )
  const preview = resolveEdition({ licenseFile, deviceId, publicKey })

  console.log(`已写入 ${edition} mock license:`)
  console.log(`  路径: ${licensePath}`)
  console.log(`  device_id: ${deviceId}`)
  console.log(`  解析结果: ${JSON.stringify(preview)}`)
  console.log('请完全重启 Electron 应用后生效。')
}

main()
