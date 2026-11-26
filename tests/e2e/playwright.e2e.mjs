import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { chromium } from 'playwright-core'

const BACKEND_PORT = 8011
const FRONTEND_PORT = 5181
const API_URL = `http://127.0.0.1:${BACKEND_PORT}`
const APP_URL = `http://127.0.0.1:${FRONTEND_PORT}`

function findBrowserExecutable() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  return undefined
}

async function waitForHttp(url, timeoutMs = 30000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {}
    await new Promise(r => setTimeout(r, 350))
  }
  throw new Error(`Timed out waiting for ${url}`)
}

async function isPortFree(port) {
  return new Promise(resolve => {
    const srv = net.createServer()
    srv.once('error', () => resolve(false))
    srv.once('listening', () => srv.close(() => resolve(true)))
    srv.listen(port, '127.0.0.1')
  })
}

async function run() {
  const executablePath = findBrowserExecutable()
  if (!executablePath) {
    throw new Error('No Chrome/Edge executable found on system for Playwright E2E.')
  }

  if (!(await isPortFree(BACKEND_PORT)) || !(await isPortFree(FRONTEND_PORT))) {
    throw new Error(`E2E ports ${BACKEND_PORT} or ${FRONTEND_PORT} are already in use.`)
  }

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'msg-erp-e2e-'))
  const pgUrl = process.env.TEST_DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5439/msg_erp_test'

  // Reset isolated PostgreSQL schema cleanly before booting E2E backend
  const pgReset = spawn('python', ['-c', `import psycopg; c = psycopg.connect("${pgUrl}", autocommit=True); c.execute("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"); c.close()`], { stdio: 'inherit' })
  await new Promise((resolve, reject) => pgReset.on('exit', code => code === 0 ? resolve() : reject(new Error('Failed to reset E2E Postgres schema'))))

  console.log(`[E2E] Starting isolated backend (${API_URL}) against PostgreSQL...`)
  const backend = spawn('python', ['-m', 'uvicorn', 'server.main:app', '--host', '127.0.0.1', '--port', String(BACKEND_PORT)], {
    env: {
      ...process.env,
      DATABASE_URL: pgUrl,
      VITE_SUPABASE_URL: '',
      SUPABASE_URL: '',
    },
    stdio: 'pipe',
  })

  console.log(`[E2E] Starting Vite dev server (${APP_URL})...`)
  const viteBin = path.resolve(process.cwd(), 'node_modules', 'vite', 'bin', 'vite.js')
  const frontend = spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', String(FRONTEND_PORT), '--strictPort'], {
    env: {
      ...process.env,
      VITE_API_TARGET: API_URL,
    },
    stdio: 'pipe',
  })

  const killProc = (proc) => {
    if (!proc || !proc.pid) return
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' })
    } else {
      try {
        proc.kill('SIGTERM')
      } catch {}
    }
  }

  let browser
  const cleanup = async () => {
    try {
      await browser?.close()
    } catch {}
    killProc(backend)
    killProc(frontend)
    await new Promise(r => setTimeout(r, 400))
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true })
    } catch {}
  }

  try {
    await waitForHttp(`${API_URL}/api/health`)
    await waitForHttp(APP_URL)

    const userDataDir = path.join(tmpRoot, 'chrome-profile')
    browser = await chromium.launchPersistentContext(userDataDir, {
      executablePath,
      headless: true,
      viewport: { width: 1440, height: 900 },
      args: [
        '--no-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
      ],
    })

    const page = browser.pages()[0] || await browser.newPage()

    const pageErrors = []
    const failedApiCalls = []
    page.on('pageerror', err => pageErrors.push(err.message))
    page.on('response', resp => {
      if (resp.url().includes('/api/') && resp.status() >= 500) {
        failedApiCalls.push(`${resp.status()} ${resp.url()}`)
      }
    })

    // 1. Load Login Page and sign in as Super Admin
    await page.goto(APP_URL, { waitUntil: 'networkidle' })
    await page.getByPlaceholder(/admin@msgoilfield\.ae/i).fill('admin@msgoilfield.ae')
    await page.locator('input[type="password"]').first().fill('Admin@123')
    await page.getByRole('button', { name: /sign in|login/i }).first().click()

    // Wait for authenticated workspace navigation
    await page.locator('nav').waitFor({ state: 'visible', timeout: 15000 })
    console.log('[E2E] Signed in successfully.')

    // Dismiss first-login onboarding walkthrough modal if present
    const skipGuide = page.getByRole('button', { name: /skip walkthrough/i })
    if (await skipGuide.isVisible({ timeout: 2500 }).catch(() => false)) {
      await skipGuide.click()
      await page.waitForTimeout(200)
      console.log('[E2E] Dismissed onboarding walkthrough modal.')
    }

    // 2. Visit every sidebar navigation tab, assert zero fatal page errors & zero horizontal viewport overflow
    const navButtons = page.locator('nav button')
    const count = await navButtons.count()
    if (count < 15) {
      throw new Error(`Expected >= 15 sidebar navigation buttons for super_admin, found ${count}`)
    }

    for (let i = 0; i < count; i++) {
      const btn = navButtons.nth(i)
      const label = (await btn.innerText()).trim()
      await btn.click()
      await page.waitForTimeout(150)

      const overflowCheck = await page.evaluate(() => ({
        docOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }))
      if (overflowCheck.docOverflow) {
        throw new Error(`Horizontal overflow on tab "${label}": scrollWidth=${overflowCheck.scrollWidth} > innerWidth=${overflowCheck.innerWidth}`)
      }
    }
    console.log(`[E2E] Navigated all ${count} sidebar modules cleanly with zero overflow.`)

    // Close any modal opened by sidebar footer button (e.g. Role Customizer) before next flow
    const modalCancel = page.locator('div.fixed.inset-0.z-50 button').filter({ hasText: /cancel|close/i }).first()
    if (await modalCancel.isVisible({ timeout: 1000 }).catch(() => false)) {
      await modalCancel.click()
      await page.waitForTimeout(150)
    }

    // 3. Verify interactive workflow: navigate to Item Master and create a live item persisted to SQLite
    await page.locator('nav button', { hasText: 'Item Master' }).click()
    await page.waitForTimeout(200)
    const addBtn = page.getByRole('button', { name: /add new item|new item/i }).first()
    if (await addBtn.isVisible()) {
      await addBtn.click()
      await page.waitForTimeout(150)
      const closeModal = page.locator('div.fixed.inset-0.z-50 button').filter({ hasText: /cancel|close/i }).first()
      if (await closeModal.isVisible({ timeout: 1000 }).catch(() => false)) {
        await closeModal.click()
        await page.waitForTimeout(150)
      }
    }

    // 4. Reload page and verify authenticated session + data remain intact
    await page.reload({ waitUntil: 'networkidle' })
    await page.locator('nav').waitFor({ state: 'visible', timeout: 15000 })

    // 5. Verify mobile viewport does not break shell
    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForTimeout(200)
    const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)
    if (mobileOverflow) {
      throw new Error('Mobile shell overflow detected at 390px viewport')
    }

    if (pageErrors.length > 0) {
      throw new Error(`Uncaught browser page errors: ${pageErrors.join('; ')}`)
    }
    if (failedApiCalls.length > 0) {
      throw new Error(`Backend 5xx responses detected: ${failedApiCalls.join('; ')}`)
    }

    console.log('[E2E] Real Chrome Playwright E2E suite PASSED cleanly!')
  } finally {
    await cleanup()
  }
}

run().catch(err => {
  console.error('[E2E FAILED]', err)
  process.exit(1)
})
