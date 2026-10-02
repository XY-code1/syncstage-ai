// SyncStage · Demo 双身份人工演示入口验收
// 两个完全隔离的浏览器实例（不同 user-data-dir / 调试端口 / localStorage / sessionStorage），
// 分别用 ?demoRole=visitor 和 ?demoRole=jiangli 打开同一个 roomId，验证真人互发消息闭环。
// 前置：backend 127.0.0.1:8020 + dev server 5173 + 先执行 backend/scripts/seed_demo_room.py
// 用法：cd frontend && node scripts/acceptance-demo-roles.mjs
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = process.argv[2] ?? 'http://127.0.0.1:5173'
const API = 'http://127.0.0.1:8020'
const ROOM_ID = process.argv[3] ?? 'room-demo-dual'
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((item) => existsSync(item))
if (!CHROME) {
  console.log('没有找到 Chrome 或 Edge，无法执行双身份验收')
  process.exit(1)
}

const shotDir = join(process.cwd(), '..', 'docs', 'screenshots')
const evidenceDir = join(process.cwd(), '..', 'docs', 'acceptance')
mkdirSync(shotDir, { recursive: true })
mkdirSync(evidenceDir, { recursive: true })

const A_URL = BASE + '/#/room/' + ROOM_ID + '?demoRole=visitor'
const B_URL = BASE + '/#/room/' + ROOM_ID + '?demoRole=jiangli'

const rows = []
const calls = []
let failures = 0
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
function check(ok, step, note) {
  rows.push({ step, ok: Boolean(ok), note: note || '' })
  if (!ok) failures += 1
  console.log((ok ? '  PASS  ' : '  FAIL  ') + step + (note ? '  [' + note + ']' : ''))
}
function info(text) {
  console.log('  INFO  ' + text)
}
async function api(label, path, options) {
  const started = Date.now()
  const response = await fetch(API + path, options)
  const ms = Date.now() - started
  let body = null
  try {
    body = await response.clone().json()
  } catch {
    body = null
  }
  calls.push({ label, path, method: (options && options.method) || 'GET', status: response.status, ms })
  return { status: response.status, body }
}

async function openBrowser(port) {
  const profile = mkdtempSync(join(tmpdir(), 'sfl-demo-'))
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
    '--no-default-browser-check', '--window-size=390,844',
    '--remote-debugging-port=' + port, '--user-data-dir=' + profile, 'about:blank',
  ], { stdio: 'ignore' })

  const deadline = Date.now() + 20000
  let page = null
  while (Date.now() < deadline && !page) {
    try {
      const targets = await fetch('http://127.0.0.1:' + port + '/json/list').then((item) => item.json())
      page = targets.find((item) => item.type === 'page')
    } catch {
      // 等调试端口就绪
    }
    if (!page) await sleep(250)
  }
  if (!page) throw new Error('等待调试端口超时：' + port)

  const socket = new WebSocket(page.webSocketDebuggerUrl)
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
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    messageId += 1
    const id = messageId
    pending.set(id, (payload) => (payload.error ? reject(new Error(method + ': ' + JSON.stringify(payload.error))) : resolve(payload.result)))
    socket.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw new Error('页面脚本报错：' + JSON.stringify(result.exceptionDetails.exception))
    return result.result.value
  }
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Network.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })

  const goto = async (url) => {
    await send('Page.navigate', { url })
    await sleep(1800)
  }
  const reload = async () => {
    await send('Page.reload', { ignoreCache: true })
    await sleep(2200)
  }
  const bodyText = () => evaluate('document.body.innerText')
  const waitForText = async (text, timeoutMs = 15000) => {
    const end = Date.now() + timeoutMs
    while (Date.now() < end) {
      if (await evaluate('document.body.innerText.includes(' + JSON.stringify(text) + ')')) return true
      await sleep(250)
    }
    return false
  }
  const waitForComposer = async (timeoutMs = 15000) => {
    const expression = `Boolean(document.querySelector('input[placeholder*="输入消息"], textarea'))`
    const end = Date.now() + timeoutMs
    while (Date.now() < end) {
      if (await evaluate(expression)) return true
      await sleep(250)
    }
    return false
  }
  const clickText = (text, index = 0) => evaluate(`(() => {
    const wanted = ${JSON.stringify(text)};
    const nodes = Array.from(document.querySelectorAll('button, a, [role=button]'));
    const matches = nodes.filter((el) => (((el.innerText || '') + ' ' + (el.getAttribute('aria-label') || '')).trim()).includes(wanted));
    const el = matches[${index}];
    if (!el) return false;
    el.scrollIntoView({ block: 'center' });
    el.click();
    return true;
  })()`)
  const typeMessage = (value) => evaluate(`(() => {
    const el = document.querySelector('input[placeholder*="输入消息"], textarea');
    if (!el) return false;
    const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`)
  const capture = async (name) => {
    await evaluate('window.scrollTo(0, 0)')
    await sleep(220)
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    writeFileSync(join(shotDir, name), Buffer.from(shot.data, 'base64'))
  }
  const close = () => {
    try { socket.close() } catch { /* ignore */ }
    try { chrome.kill() } catch { /* ignore */ }
  }
  return { goto, reload, evaluate, bodyText, waitForText, waitForComposer, clickText, typeMessage, capture, close }
}

/** 每次验收前重置演示房间（复用 seed_demo_room.py），保证从干净状态开始、可重复执行 */
function reseedDemoRoom() {
  const base = join(process.cwd(), '..', 'backend')
  const python = [
    join(base, '.venv', 'Scripts', 'python.exe'),
    join(base, '.venv', 'bin', 'python'),
  ].find((item) => existsSync(item))
  if (!python) return 'skipped: 未找到 backend/.venv 的 python'
  const result = spawnSync(python, ['scripts/seed_demo_room.py'], {
    cwd: base,
    env: { ...process.env, PYTHONPATH: '.' },
    encoding: 'utf8',
  })
  return result.status === 0 ? 'ok' : 'exit ' + result.status + ' ' + String(result.stderr || '').slice(0, 200)
}

const A_MSG = 'A 端（Demo访客）：我已经到 1F 周边售卖台了，你在哪？'
const B_MSG = 'B 端（写歌的江离）：刚过安检，蓝色外套，两分钟到！'

let ctxA = null
let ctxB = null
try {
  // ---------------- 0. 重置演示房间 + 后端准备 ----------------
  info('重置演示房间：' + reseedDemoRoom())
  const roomProbe = await api('room-read', '/api/rooms/' + ROOM_ID)
  check(roomProbe.status === 200, '第0步 后端存在演示房间 roomId=' + ROOM_ID)
  const before = await api('room-messages-before', '/api/rooms/' + ROOM_ID + '/messages')
  const startCount = ((before.body && before.body.messages) || []).length
  info('演示房间起始消息数=' + startCount)

  // ---------------- 1. 两个隔离浏览器以不同身份进入同一房间 ----------------
  ctxA = await openBrowser(9337)
  ctxB = await openBrowser(9338)
  await ctxA.goto(A_URL)
  await ctxB.goto(B_URL)

  check(await ctxA.waitForComposer(20000), '第1步 A 端（普通窗口 profile）进入房间，输入框可用')
  check(await ctxB.waitForComposer(20000), '第1步 B 端（无痕/隔离 profile）进入同一 roomId，输入框可用')
  check(await ctxA.waitForText('当前身份：Demo访客', 8000), '第1步 A 端顶部显示「当前身份：Demo访客」')
  check(await ctxB.waitForText('当前身份：写歌的江离', 8000), '第1步 B 端顶部显示「当前身份：写歌的江离」')
  check(!(await ctxA.bodyText()).includes('当前身份：写歌的江离'), '第1步 A 端不显示 B 的身份（各自独立）')

  const roleA = await ctxA.evaluate("window.sessionStorage.getItem('sfl.demo.role')")
  const roleB = await ctxB.evaluate("window.sessionStorage.getItem('sfl.demo.role')")
  check(roleA === 'visitor' && roleB === 'jiangli', '第1步 身份各自存在本 tab 的 sessionStorage，互不覆盖', 'A=' + roleA + ' B=' + roleB)
  const lsA = await ctxA.evaluate('window.localStorage.getItem("sfl.demo.role")')
  const lsB = await ctxB.evaluate('window.localStorage.getItem("sfl.demo.role")')
  check(lsA === null && lsB === null, '第1步 身份不写 localStorage（避免两个浏览器互相覆盖）')
  const roomInStorage = '(() => { for (let i = 0; i < localStorage.length; i += 1) { const key = localStorage.key(i); if (!key) continue; try { const value = JSON.parse(localStorage.getItem(key)); if (value && typeof value === "object" && value.room) return true } catch { /* 忽略非 JSON */ } } return false })()'
  check(!(await ctxA.evaluate(roomInStorage)) && !(await ctxB.evaluate(roomInStorage)), '第1步 两个上下文本地都没有房间状态（只凭 roomId 进入）')
  check(!(await ctxB.bodyText()).includes(A_MSG), '第1步 B 端此时还没有 A 的消息')
  await ctxA.capture('21-demo-role-01-a-identity.png')
  await ctxB.capture('21-demo-role-02-b-identity.png')

  // ---------------- 2. A → B ----------------
  check((await ctxA.typeMessage(A_MSG)) === true, '第2步 A 端输入真人消息')
  check((await ctxA.clickText('发送')) === true, '第2步 A 端点击发送')
  check(await ctxA.waitForText(A_MSG, 10000), '第2步 A 端本地看到自己发出的消息')
  check(await ctxB.waitForText(A_MSG, 15000), '第2步 B 端在另一个隔离浏览器里收到 A 的消息')
  await ctxA.capture('21-demo-role-03-a-sent.png')
  await ctxB.capture('21-demo-role-04-b-received.png')

  // ---------------- 3. B → A ----------------
  check((await ctxB.typeMessage(B_MSG)) === true, '第3步 B 端输入回复')
  check((await ctxB.clickText('发送')) === true, '第3步 B 端点击发送')
  check(await ctxB.waitForText(B_MSG, 10000), '第3步 B 端本地看到自己的回复')
  check(await ctxA.waitForText(B_MSG, 15000), '第3步 A 端收到 B 的回复')
  await ctxA.capture('21-demo-role-05-a-received-reply.png')

  // ---------------- 4. 双方刷新后仍从后端恢复 ----------------
  await ctxA.reload()
  await ctxB.reload()
  const aRestored = (await ctxA.waitForText(A_MSG, 15000)) && (await ctxA.waitForText(B_MSG, 15000))
  const bRestored = (await ctxB.waitForText(A_MSG, 15000)) && (await ctxB.waitForText(B_MSG, 15000))
  check(aRestored, '第4步 A 端刷新后两条消息都还在')
  check(bRestored, '第4步 B 端刷新后两条消息都还在')
  check(await ctxA.waitForText('当前身份：Demo访客', 8000), '第4步 刷新后 A 端身份仍为 Demo访客（sessionStorage 恢复）')
  check(await ctxB.waitForText('当前身份：写歌的江离', 8000), '第4步 刷新后 B 端身份仍为 写歌的江离（sessionStorage 恢复）')
  await ctxA.capture('21-demo-role-06-a-after-refresh.png')
  await ctxB.capture('21-demo-role-07-b-after-refresh.png')

  // ---------------- 5. 后端持久化 / 字段 / 无 AI 冒充 ----------------
  const stored = await api('room-messages', '/api/rooms/' + ROOM_ID + '/messages')
  const messages = (stored.body && stored.body.messages) || []
  const texts = messages.map((item) => item.content)
  check(texts.includes(A_MSG) && texts.includes(B_MSG), '第5步 两条消息由后端保存，刷新/换实例都能读到', 'count=' + messages.length)
  check(
    messages.every((item) => item.id && item.roomId === ROOM_ID && item.senderId && item.senderName && item.content && item.createdAt),
    '第5步 每条消息字段完整（id/roomId/senderId/senderName/content/createdAt）',
  )
  const senders = Array.from(new Set(messages.map((item) => item.senderId)))
  check(
    senders.length === 2 && senders.includes('demo-visitor') && senders.includes('jiangli'),
    '第5步 发送者恰为 demo-visitor 与 jiangli 两个真人身份',
    senders.join(','),
  )
  const lastId = messages.length ? messages[messages.length - 1].id : 0
  await sleep(4500)
  const after = await api('room-messages-after', '/api/rooms/' + ROOM_ID + '/messages?after=' + lastId)
  const extra = ((after.body && after.body.messages) || []).filter((item) => item.senderId !== 'demo-visitor' && item.senderId !== 'jiangli')
  check(extra.length === 0, '第5步 等待 4.5s 没有任何第三方 / AI / mock 自动回复', 'extra=' + extra.length)
  const aText = await ctxA.bodyText()
  check(!aText.includes('模拟联系人') && !aText.includes('Agent 回复失败'), '第5步 页面没有「模拟联系人」或 AI 冒充回复入口')
  check(messages.length >= 2, '第5步 本次演示确实由两个真人身份各发了一条', 'senders=' + senders.length)
} catch (error) {
  check(false, '执行异常', error instanceof Error ? error.message : String(error))
} finally {
  if (ctxA) ctxA.close()
  if (ctxB) ctxB.close()
}

const evidence = {
  ranAt: new Date().toISOString(),
  base: BASE,
  api: API,
  roomId: ROOM_ID,
  urls: { visitor: A_URL, jiangli: B_URL },
  total: rows.length,
  passed: rows.filter((row) => row.ok).length,
  failed: failures,
  rows,
  calls,
}
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const file = join(evidenceDir, 'demo-roles-' + stamp + '.json')
writeFileSync(file, JSON.stringify(evidence, null, 2))
console.log('')
console.log('证据文件：' + file)
console.log(failures === 0 ? 'Demo 双身份验收通过（' + rows.length + ' 项）' : 'Demo 双身份验收失败（' + failures + ' 项）')
process.exit(failures === 0 ? 0 : 1)