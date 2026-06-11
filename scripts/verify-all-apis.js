#!/usr/bin/env node
/**
 * 本地冒烟：验证 product-releases-api 全部 HTTP 接口可达且返回预期状态。
 * 用法：node scripts/verify-all-apis.js
 * 需 API 已启动（默认 http://127.0.0.1:3090）
 */
require('dotenv').config()

const crypto = require('crypto')
const { getDb } = require('../src/db/getDb')
const { hashEmail, hashVerificationCode, normalizeEmail } = require('../src/utils/licenseCrypto')

const BASE = `http://${process.env.HOST || '127.0.0.1'}:${process.env.PORT || 3091}`
const PRODUCT_KEY = 'xiaoxiao-photos'
const TEST_DEVICE_ID = 'a'.repeat(64)
const TRIAL_EMAIL = `verify-test-${Date.now()}@example.com`
const PRO_EMAIL = `pro-test-${Date.now()}@example.com`
const TRIAL_CODE = '654321'

const results = []

function pass(name, detail) {
  results.push({ name, ok: true, detail })
}
function fail(name, detail) {
  results.push({ name, ok: false, detail })
}

async function request(method, path, { body, headers = {}, expectStatus } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined
  })
  let json = null
  try {
    json = await res.json()
  } catch {
    json = null
  }
  return { status: res.status, json }
}

function seedTrialVerificationCode(email, code) {
  const emailHash = hashEmail(normalizeEmail(email))
  const expiresAt = Date.now() + 10 * 60 * 1000
  getDb().prepare('DELETE FROM license_email_verification_codes WHERE email_hash = ?').run(emailHash)
  getDb().prepare(
    `INSERT INTO license_email_verification_codes (email_hash, code_hash, expires_at, created_at)
     VALUES (?, ?, ?, ?)`,
  ).run(emailHash, hashVerificationCode(code), expiresAt, Date.now())
}

async function main() {
  console.log(`\n验证目标: ${BASE}\n`)

  // --- Stats ---
  try {
    const r = await request('POST', '/api/stats/page-view', {
      body: { productKey: PRODUCT_KEY },
      expectStatus: 200
    })
    if (r.status === 200 && r.json?.status === 'success') pass('POST /api/stats/page-view', `pageViews=${r.json.data?.pageViews}`)
    else fail('POST /api/stats/page-view', `HTTP ${r.status} ${r.json?.message || ''}`)
  } catch (e) {
    fail('POST /api/stats/page-view', e.message)
  }

  try {
    const r = await request('POST', '/api/stats/download', { body: { productKey: PRODUCT_KEY } })
    if (r.status === 200 && r.json?.status === 'success') pass('POST /api/stats/download', `downloadClicks=${r.json.data?.downloadClicks}`)
    else fail('POST /api/stats/download', `HTTP ${r.status}`)
  } catch (e) {
    fail('POST /api/stats/download', e.message)
  }

  try {
    const r = await request('GET', `/api/stats/counts?productKey=${PRODUCT_KEY}`)
    if (r.status === 401) pass('GET /api/stats/counts (无 Token)', '401 未登录')
    else fail('GET /api/stats/counts (无 Token)', `期望 401，实际 ${r.status}`)
  } catch (e) {
    fail('GET /api/stats/counts (无 Token)', e.message)
  }

  const statsUser = process.env.STATS_ADMIN_USERNAME
  const statsPass = process.env.STATS_ADMIN_PASSWORD
  let jwtToken = null

  if (!statsUser || !statsPass || !process.env.STATS_JWT_SECRET) {
    fail('POST /api/stats/admin/session', 'STATS_ADMIN_* / STATS_JWT_SECRET 未配置')
    fail('GET /api/stats/counts (有 Token)', '跳过：无 JWT')
    fail('GET /api/stats/admin/all', '跳过：无 JWT')
  } else {
    try {
      const r = await request('POST', '/api/stats/admin/session', {
        body: { username: statsUser, password: 'wrong-password-xyz' }
      })
      if (r.status === 401) pass('POST /api/stats/admin/session (错误密码)', '401')
      else fail('POST /api/stats/admin/session (错误密码)', `期望 401，实际 ${r.status}`)
    } catch (e) {
      fail('POST /api/stats/admin/session (错误密码)', e.message)
    }

    try {
      const r = await request('POST', '/api/stats/admin/session', {
        body: { username: statsUser, password: statsPass }
      })
      if (r.status === 200 && r.json?.data?.jwtToken) {
        jwtToken = r.json.data.jwtToken
        pass('POST /api/stats/admin/session (正确密码)', '200 + jwtToken')
      } else fail('POST /api/stats/admin/session (正确密码)', `HTTP ${r.status} ${r.json?.message || ''}`)
    } catch (e) {
      fail('POST /api/stats/admin/session (正确密码)', e.message)
    }

    if (jwtToken) {
      const auth = { Authorization: `Bearer ${jwtToken}` }
      try {
        const r = await request('GET', `/api/stats/counts?productKey=${PRODUCT_KEY}`, { headers: auth })
        if (r.status === 200 && r.json?.data?.productKey) pass('GET /api/stats/counts (有 Token)', `pageViews=${r.json.data.pageViews}`)
        else fail('GET /api/stats/counts (有 Token)', `HTTP ${r.status}`)
      } catch (e) {
        fail('GET /api/stats/counts (有 Token)', e.message)
      }

      try {
        const r = await request('GET', '/api/stats/admin/all', { headers: auth })
        if (r.status === 200 && Array.isArray(r.json?.data)) pass('GET /api/stats/admin/all', `产品数=${r.json.data.length}`)
        else fail('GET /api/stats/admin/all', `HTTP ${r.status}`)
      } catch (e) {
        fail('GET /api/stats/admin/all', e.message)
      }
    }
  }

  // --- License admin ---
  const adminKey = String(process.env.LICENSE_ADMIN_SECRET || '').trim()
  if (!adminKey) {
    fail('POST /api/license/admin/codes', 'LICENSE_ADMIN_SECRET 未配置')
    fail('GET /api/license/admin/status', '跳过')
    fail('POST /api/license/admin/fulfill', '跳过')
  } else {
    try {
      const r = await request('POST', '/api/license/admin/codes', {
        body: { count: 1 },
        headers: { 'X-Admin-Key': 'invalid-key' }
      })
      if (r.status === 401) pass('POST /api/license/admin/codes (无/错 Key)', '401')
      else fail('POST /api/license/admin/codes (无/错 Key)', `期望 401，实际 ${r.status}`)
    } catch (e) {
      fail('POST /api/license/admin/codes (无/错 Key)', e.message)
    }

    let generatedCode = null
    try {
      const r = await request('POST', '/api/license/admin/codes', {
        body: { count: 1 },
        headers: { 'X-Admin-Key': adminKey }
      })
      if (r.status === 200 && r.json?.data?.codes?.[0]) {
        generatedCode = r.json.data.codes[0]
        pass('POST /api/license/admin/codes', `生成码 ${generatedCode}`)
      } else fail('POST /api/license/admin/codes', `HTTP ${r.status} ${r.json?.message || ''}`)
    } catch (e) {
      fail('POST /api/license/admin/codes', e.message)
    }

    try {
      const r = await request('GET', `/api/license/admin/status?email=${encodeURIComponent(PRO_EMAIL)}`, {
        headers: { 'X-Admin-Key': adminKey }
      })
      if (r.status === 200 && r.json?.data?.email) pass('GET /api/license/admin/status', `trial_used=${r.json.data.trial_used}`)
      else fail('GET /api/license/admin/status', `HTTP ${r.status}`)
    } catch (e) {
      fail('GET /api/license/admin/status', e.message)
    }

    if (generatedCode) {
      try {
        const r = await request('POST', '/api/license/admin/fulfill', {
          body: { email: PRO_EMAIL, payment_note: '本地验证脚本', amount_cents: 12800 },
          headers: { 'X-Admin-Key': adminKey }
        })
        if (r.status === 200 && r.json?.data?.activation_code) {
          pass('POST /api/license/admin/fulfill', `发码 ${r.json.data.activation_code} email_sent=${r.json.data.email_sent}`)
        } else if (r.status === 502 && String(r.json?.message || '').includes('发送邮件失败')) {
          fail('POST /api/license/admin/fulfill', `SMTP 失败: ${r.json.message}（接口逻辑可达，需检查 EMAIL_*）`)
        } else {
          fail('POST /api/license/admin/fulfill', `HTTP ${r.status} ${r.json?.message || ''}`)
        }
      } catch (e) {
        fail('POST /api/license/admin/fulfill', e.message)
      }
    }
  }

  // --- License trial send-code (真实 SMTP) ---
  const emailConfigured = process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS
  const sendCodeEmail = `smtp-test-${Date.now()}@example.com`
  if (!emailConfigured) {
    fail('POST /api/license/trial/send-code', 'EMAIL_* 未配置')
  } else {
    try {
      const r = await request('POST', '/api/license/trial/send-code', { body: { email: sendCodeEmail } })
      if (r.status === 200) pass('POST /api/license/trial/send-code', r.json?.message || '200')
      else if (r.status === 502) fail('POST /api/license/trial/send-code', `SMTP: ${r.json?.message}`)
      else fail('POST /api/license/trial/send-code', `HTTP ${r.status} ${r.json?.message || ''}`)
    } catch (e) {
      fail('POST /api/license/trial/send-code', e.message)
    }
  }

  // --- License trial activate (DB 注入验证码，不依赖邮件) ---
  if (!process.env.LICENSE_PRIVATE_KEY_BASE64) {
    fail('POST /api/license/trial/activate', 'LICENSE_PRIVATE_KEY_BASE64 未配置')
  } else {
    seedTrialVerificationCode(TRIAL_EMAIL, TRIAL_CODE)
    try {
      const r = await request('POST', '/api/license/trial/activate', {
        body: { email: TRIAL_EMAIL, code: TRIAL_CODE, device_id: TEST_DEVICE_ID }
      })
      if (r.status === 200 && r.json?.data?.license?.signature) {
        pass('POST /api/license/trial/activate', `edition=${r.json.data.edition}`)
      } else fail('POST /api/license/trial/activate', `HTTP ${r.status} ${r.json?.message || ''}`)
    } catch (e) {
      fail('POST /api/license/trial/activate', e.message)
    }
  }

  // --- License pro redeem ---
  if (!process.env.LICENSE_PRIVATE_KEY_BASE64 || !adminKey) {
    fail('POST /api/license/pro/redeem', '跳过：缺私钥或 Admin Key')
  } else {
    // 确保 PRO_EMAIL 有 fulfilled 码（fulfill 可能因 SMTP 失败但码已绑定）
    const emailHash = hashEmail(normalizeEmail(PRO_EMAIL))
    const row = getDb()
      .prepare("SELECT code FROM pro_activation_codes WHERE email_hash = ? AND status IN ('fulfilled','redeemed') LIMIT 1")
      .get(emailHash)

    if (!row?.code) {
      const unused = getDb().prepare("SELECT code FROM pro_activation_codes WHERE status = 'unused' LIMIT 1").get()
      if (unused?.code) {
        getDb().prepare(
          `UPDATE pro_activation_codes SET email_hash = ?, status = 'fulfilled', fulfilled_at = ? WHERE code = ?`,
        ).run(emailHash, Date.now(), unused.code)
        pass('POST /api/license/pro/redeem (准备)', `手动绑定码 ${unused.code}`)
      } else {
        fail('POST /api/license/pro/redeem', '无可用 Pro 码，请先 admin/codes')
      }
    }

    const codeRow = getDb()
      .prepare("SELECT code FROM pro_activation_codes WHERE email_hash = ? AND status = 'fulfilled' LIMIT 1")
      .get(emailHash)

    if (codeRow?.code) {
      try {
        const r = await request('POST', '/api/license/pro/redeem', {
          body: { email: PRO_EMAIL, activation_code: codeRow.code, device_id: TEST_DEVICE_ID }
        })
        if (r.status === 200 && r.json?.data?.license?.signature) {
          pass('POST /api/license/pro/redeem', `edition=${r.json.data.edition}`)
        } else fail('POST /api/license/pro/redeem', `HTTP ${r.status} ${r.json?.message || ''}`)
      } catch (e) {
        fail('POST /api/license/pro/redeem', e.message)
      }
    }
  }

  // --- 汇总 ---
  const ok = results.filter((r) => r.ok).length
  const bad = results.filter((r) => !r.ok).length
  console.log('接口验证结果')
  console.log('─'.repeat(60))
  for (const r of results) {
    console.log(`${r.ok ? '✓' : '✗'} ${r.name}`)
    console.log(`  ${r.detail}`)
  }
  console.log('─'.repeat(60))
  console.log(`合计: ${ok} 通过, ${bad} 失败 / 共 ${results.length} 项\n`)
  process.exit(bad > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error('脚本异常:', e.message)
  process.exit(1)
})
