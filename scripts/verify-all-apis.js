#!/usr/bin/env node
/**
 * 本地冒烟：验证 product-releases-api 全部 HTTP 接口可达且返回预期状态。
 * 用法：node scripts/verify-all-apis.js
 * 需 API 已启动（默认 http://127.0.0.1:3090）
 */
require('dotenv').config()
const crypto = require('crypto')

const { getDb } = require('../src/db/getDb')

const BASE = `http://${process.env.HOST || '127.0.0.1'}:${process.env.PORT || 3091}`
const PRODUCT_KEY = 'xiaoxiao-photos'
const TEST_DEVICE_ID = crypto.createHash('sha256').update(`verify-${Date.now()}`).digest('hex')
const PRO_EMAIL = `pro-test-${Date.now()}@example.com`

const results = []

function pass(name, detail) {
  results.push({ name, ok: true, detail })
}
function fail(name, detail) {
  results.push({ name, ok: false, detail })
}

async function request(method, path, { body, headers = {} } = {}) {
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

async function main() {
  console.log(`\n验证目标: ${BASE}\n`)

  // --- Stats ---
  try {
    const r = await request('POST', '/api/stats/page-view', {
      body: { productKey: PRODUCT_KEY }
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

  // --- License public ---
  try {
    const r = await request('GET', '/api/license/config')
    if (r.status === 200 && Number.isFinite(Number(r.json?.data?.trialDays))) {
      pass('GET /api/license/config', `trialDays=${r.json.data.trialDays}`)
    } else fail('GET /api/license/config', `HTTP ${r.status}`)
  } catch (e) {
    fail('GET /api/license/config', e.message)
  }

  // --- License admin ---
  const licenseUser = process.env.LICENSE_ADMIN_USERNAME
  const licensePass = process.env.LICENSE_ADMIN_PASSWORD
  let licenseJwt = null

  if (!licenseUser || !licensePass || !process.env.STATS_JWT_SECRET) {
    fail('POST /api/license/admin/session', 'LICENSE_ADMIN_* / STATS_JWT_SECRET 未配置')
    fail('POST /api/license/admin/codes', '跳过：无 JWT')
    fail('POST /api/license/admin/fulfill', '跳过')
  } else {
    try {
      const r = await request('POST', '/api/license/admin/session', {
        body: { username: licenseUser, password: 'wrong-password-xyz' }
      })
      if (r.status === 401) pass('POST /api/license/admin/session (错误密码)', '401')
      else fail('POST /api/license/admin/session (错误密码)', `期望 401，实际 ${r.status}`)
    } catch (e) {
      fail('POST /api/license/admin/session (错误密码)', e.message)
    }

    try {
      const r = await request('POST', '/api/license/admin/session', {
        body: { username: licenseUser, password: licensePass }
      })
      if (r.status === 200 && r.json?.data?.jwtToken) {
        licenseJwt = r.json.data.jwtToken
        pass('POST /api/license/admin/session (正确密码)', '200 + jwtToken')
      } else fail('POST /api/license/admin/session (正确密码)', `HTTP ${r.status} ${r.json?.message || ''}`)
    } catch (e) {
      fail('POST /api/license/admin/session (正确密码)', e.message)
    }

    try {
      const r = await request('POST', '/api/license/admin/codes', {
        body: { count: 1 },
        headers: { Authorization: 'Bearer invalid-token' }
      })
      if (r.status === 401) pass('POST /api/license/admin/codes (无/错 Token)', '401')
      else fail('POST /api/license/admin/codes (无/错 Token)', `期望 401，实际 ${r.status}`)
    } catch (e) {
      fail('POST /api/license/admin/codes (无/错 Token)', e.message)
    }

    if (licenseJwt) {
      const auth = { Authorization: `Bearer ${licenseJwt}` }
      let generatedCode = null
      try {
        const r = await request('POST', '/api/license/admin/codes', {
          body: { count: 1 },
          headers: auth
        })
        if (r.status === 200 && r.json?.data?.codes?.[0]) {
          generatedCode = r.json.data.codes[0]
          pass('POST /api/license/admin/codes', `生成码 ${generatedCode}`)
        } else fail('POST /api/license/admin/codes', `HTTP ${r.status} ${r.json?.message || ''}`)
      } catch (e) {
        fail('POST /api/license/admin/codes', e.message)
      }

      if (generatedCode) {
        try {
          const r = await request('POST', '/api/license/admin/fulfill', {
            body: { email: PRO_EMAIL },
            headers: auth
          })
          if (r.status === 200 && r.json?.data?.activation_code) {
            pass('POST /api/license/admin/fulfill', `发码 ${r.json.data.activation_code}`)
          } else if (r.status === 502) {
            fail('POST /api/license/admin/fulfill', `SMTP 失败（HTTP 502，接口逻辑可达，需检查 EMAIL_*）`)
          } else {
            fail('POST /api/license/admin/fulfill', `HTTP ${r.status} ${r.json?.message || ''}`)
          }
        } catch (e) {
          fail('POST /api/license/admin/fulfill', e.message)
        }
      }

      try {
        const r = await request('GET', '/api/license/admin/overview', { headers: auth })
        const entries = r.json?.data?.entries
        const proRow = Array.isArray(entries)
          ? entries.find((row) => row.kind === 'pro' && row.fulfilled_email === PRO_EMAIL)
          : null
        if (
          r.status === 200 &&
          typeof r.json?.data?.default_device_limit === 'number' &&
          proRow &&
          typeof proRow.device_count === 'number' &&
          Array.isArray(proRow.device_ids)
        ) {
          pass(
            'GET /api/license/admin/overview',
            `default_device_limit=${r.json.data.default_device_limit}, ${PRO_EMAIL} 绑定 ${proRow.device_count}/${proRow.device_limit ?? '不限'}`,
          )
        } else {
          fail('GET /api/license/admin/overview', `HTTP ${r.status} 或缺少 device_* 字段`)
        }

        if (proRow?.activation_code) {
          try {
            const patch = await request('PATCH', '/api/license/admin/codes/device-limit', {
              body: { activation_code: proRow.activation_code, device_limit_override: 0 },
              headers: auth
            })
            if (
              patch.status === 200 &&
              patch.json?.data?.device_limit_override === 0 &&
              patch.json?.data?.device_limit === null
            ) {
              pass('PATCH /api/license/admin/codes/device-limit', '设为不限')
            } else {
              fail('PATCH /api/license/admin/codes/device-limit', `HTTP ${patch.status}`)
            }
          } catch (e) {
            fail('PATCH /api/license/admin/codes/device-limit', e.message)
          }
        }
      } catch (e) {
        fail('GET /api/license/admin/overview', e.message)
      }
    }
  }

  // --- License trial/start ---
  if (!process.env.LICENSE_PRIVATE_KEY_BASE64) {
    fail('POST /api/license/trial/start', 'LICENSE_PRIVATE_KEY_BASE64 未配置')
  } else {
    try {
      const r = await request('POST', '/api/license/trial/start', {
        body: { device_id: TEST_DEVICE_ID }
      })
      if (r.status === 200 && r.json?.data?.license?.signature) {
        pass('POST /api/license/trial/start', `edition=${r.json.data.edition}`)
      } else fail('POST /api/license/trial/start', `HTTP ${r.status} ${r.json?.message || ''}`)

      const r2 = await request('POST', '/api/license/trial/start', {
        body: { device_id: TEST_DEVICE_ID }
      })
      if (r2.status === 200 && r2.json?.data?.license?.signature) {
        pass('POST /api/license/trial/start (幂等)', `edition=${r2.json.data.edition}`)
      } else fail('POST /api/license/trial/start (幂等)', `HTTP ${r2.status}`)
    } catch (e) {
      fail('POST /api/license/trial/start', e.message)
    }
  }

  // --- License pro redeem ---
  if (!process.env.LICENSE_PRIVATE_KEY_BASE64) {
    fail('POST /api/license/pro/redeem', '跳过：缺私钥')
  } else {
    // 确保 PRO_EMAIL 有 fulfilled 码（fulfill 可能因 SMTP 失败但码已绑定）
    let codeRow = getDb()
      .prepare("SELECT code, license_id FROM pro_activation_codes WHERE fulfilled_email = ? AND status IN ('fulfilled','redeemed') LIMIT 1")
      .get(PRO_EMAIL)

    if (!codeRow?.code) {
      const unused = getDb().prepare("SELECT code FROM pro_activation_codes WHERE status = 'unused' LIMIT 1").get()
      if (unused?.code) {
        const licenseId = `lic_${Date.now()}`
        getDb().prepare(
          `UPDATE pro_activation_codes SET fulfilled_email = ?, status = 'fulfilled', fulfilled_at = ?, license_id = ? WHERE code = ?`,
        ).run(PRO_EMAIL, Date.now(), licenseId, unused.code)
        getDb().prepare(
          `INSERT INTO license_records (license_id, edition, device_ids_json, device_limit_override, created_at, updated_at)
           VALUES (?, 'pro', '[]', NULL, ?, ?)`,
        ).run(licenseId, Date.now(), Date.now())
        codeRow = { code: unused.code, license_id: licenseId }
        pass('POST /api/license/pro/redeem (准备)', `手动绑定码 ${unused.code}`)
      } else {
        fail('POST /api/license/pro/redeem', '无可用激活码，请先 admin/codes')
      }
    }

    if (codeRow?.code) {
      try {
        const r = await request('POST', '/api/license/pro/redeem', {
          body: { activation_code: codeRow.code, device_id: TEST_DEVICE_ID }
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
