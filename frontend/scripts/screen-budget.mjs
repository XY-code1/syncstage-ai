// SyncStage · 移动端屏幕预算检查（开发用脚本）
// 前置：先启动 dev server（npm run dev），再执行 npm run screens
//
// 规则：一级页面（首页 / 同频 / 消息 / 我的）与核心任务页的主任务
// 必须在 1～1.5 个 iPhone 390×844 屏幕内完成，不允许 3～5 屏连续纵向堆叠。
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = process.argv[2] ?? 'http://127.0.0.1:5173'
const PORT = 9334
const VIEWPORT = { width: 390, height: 844 }

const BUDGETS = [
  { path: '/', label: '首页', screens: 1.5 },
  { path: '/sync', label: '同频', screens: 1.5 },
  { path: '/messages', label: '消息', screens: 1.5 },
  { path: '/me', label: '我的', screens: 1.5 },
  { path: '/messages/dm-jiangli', label: '聊天室', screens: 1.05 },
  { path: '/concert/night-flight/authorize', label: '音乐画像授权', screens: 1.05 },
  { path: '/concert/night-flight/running', label: 'Agent 匹配进度', screens: 1.5 },
  { path: '/me/edit', label: '编辑资料', screens: 1.6 },
  { path: '/me/music', label: '音乐画像与授权', screens: 1.5 },
  { path: '/concerts', label: '演出列表', screens: 1.5 },
]

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
]

const chromePath = CHROME_CANDIDATES.find((item) => existsSync(item))
if (!chromePath) {
  console.log('没有找到 Chrome 或 Edge，跳过屏幕预算检查')
  process.exit(0)
}

const profile = mkdtempSync(join(tmpdir(), 'sfl-screens-'))
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let failures = 0
let chrome
let socket

async function waitForEndpoint(url, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return await response.json()
    } catch {
      // 还没起来
    }
    await sleep(250)
  }
  throw new Error('等待浏览器调试端口超时：' + url)
}

try {
  chrome = spawn(
    chromePath,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--no-first-run',
      '--no-default-browser-check',
      `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
      '--remote-debugging-port=' + PORT,
      '--user-data-dir=' + profile,
      'about:blank',
    ],
    { stdio: 'ignore' },
  )

  await waitForEndpoint('http://127.0.0.1:' + PORT + '/json/version')
  const targets = await waitForEndpoint('http://127.0.0.1:' + PORT + '/json/list')
  const page = targets.find((item) => item.type === 'page')
  if (!page) throw new Error('没有可用的页面目标')

  socket = new WebSocket(page.webSocketDebuggerUrl)
  const pending = new Map()
  let messageId = 0
  socket.addEventListener('message', (event) => {
    const payload = JSON.parse(event.data)
    if (payload.id && pending.has(payload.id)) pending.get(payload.id)(payload)
  })
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve)
    socket.addEventListener('error', reject)
  })

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      messageId += 1
      const id = messageId
      pending.set(id, (payload) => {
        if (payload.error) reject(new Error(method + ': ' + JSON.stringify(payload.error)))
        else resolve(payload.result)
      })
      socket.send(JSON.stringify({ id, method, params }))
    })

  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { ...VIEWPORT, deviceScaleFactor: 2, mobile: true })

  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw new Error('页面脚本报错：' + JSON.stringify(result.exceptionDetails.exception))
    return result.result.value
  }

  for (const budget of BUDGETS) {
    await send('Page.navigate', { url: BASE + '/?r=' + Date.now() + '#' + budget.path })
    await sleep(1400)
    const measured = await evaluate(`(() => {
      const app = document.querySelector('#root > div') || document.body;
      return {
        scroll: Math.max(document.documentElement.scrollHeight, app.scrollHeight || 0),
        overflowX: document.documentElement.scrollWidth > innerWidth,
      };
    })()`)
    const screens = measured.scroll / VIEWPORT.height
    const ok = screens <= budget.screens && !measured.overflowX
    if (!ok) failures += 1
    console.log(
      `  ${ok ? 'PASS' : 'FAIL'}  ${budget.label.padEnd(8, '　')} ${budget.path.padEnd(34)} ` +
        `${screens.toFixed(2)} 屏 / 预算 ${budget.screens} 屏${measured.overflowX ? ' · 横向溢出' : ''}`,
    )
  }

  socket.close()
  socket = undefined
} catch (error) {
  failures += 1
  console.log('  FAIL  屏幕预算检查异常：' + error.message)
} finally {
  if (socket) socket.close()
  if (chrome) chrome.kill()
  await sleep(400)
  rmSync(profile, { recursive: true, force: true })
}

console.log('')
if (failures > 0) {
  console.log('屏幕预算未通过：' + failures + ' 个页面超出预算')
  process.exit(1)
}
console.log('所有核心页面都在屏幕预算内')
