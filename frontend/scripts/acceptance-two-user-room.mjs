// SyncStage · 双人真人聊天闭环验收
// 两个完全隔离的浏览器实例（不同 user-data-dir / 不同调试端口 / 不同 localStorage），
// 凭同一个 roomId 进入同一房间，通过后端 /api/rooms/{roomId}/messages 互发消息。
// 前置：backend 127.0.0.1:8020（AGENT_MODE=live, DeepSeek 可用）+ dev server 5173
// 用法：cd frontend && node scripts/acceptance-two-user-room.mjs
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = process.argv[2] ?? 'http://127.0.0.1:5173'
const API = 'http://127.0.0.1:8020'
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((item) => existsSync(item))
if (!CHROME) {
  console.log('没有找到 Chrome 或 Edge，无法执行双人验收')
  process.exit(1)
}

const shotDir = join(process.cwd(), '..', 'docs', 'screenshots')
const evidenceDir = join(process.cwd(), '..', 'docs', 'acceptance')
mkdirSync(shotDir, { recursive: true })
mkdirSync(evidenceDir, { recursive: true })

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
  const profile = mkdtempSync(join(tmpdir(), 'sfl-two-'))
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
    await sleep(1600)
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

const SCOPES = ['favorite_songs', 'top_artists', 'recent_plays', 'followed_events', 'playlist_tags']
const PROMPT = '我第一次看星野回声，最喜欢《夜航的信》，想找人一起排队候场、副歌一起唱，最好先在群里聊熟，3 个人以内，只在公开场合见面。'
const A_MSG = 'A 端消息：我已经到周边售卖台了，你到哪了？'
const B_MSG = 'B 端回复：我刚过安检，蓝色外套，马上到！'

let ctxA = null
let ctxB = null
try {
  // ---------------- 0. 真实 DeepSeek 状态 + 后端建房（含真实模型匹配）----------------
  const status = await api('ai-status', '/api/ai/status')
  const llmStatus = (status.body && status.body.llm) || {}
  check(llmStatus.provider === 'deepseek' && llmStatus.configured === true, '第0步 /api/ai/status provider=deepseek 且 configured=true', 'model=' + llmStatus.model)

  const run = await api('agent-run', '/api/agent/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: PROMPT, eventId: 'night-flight', userId: 'u-viewer', authorizedScopes: SCOPES }),
  })
  const runBody = run.body || {}
  check(run.status === 200, '第0步 真实 DeepSeek 匹配运行完成', 'runId=' + runBody.runId)
  check(
    Boolean(runBody.provider) && runBody.provider.isMock === false && Boolean(runBody.llm) && runBody.llm.source === 'model',
    '第0步 匹配由真实模型完成（source=model, isMock=false）',
    'provider=' + ((runBody.provider || {}).provider) + ' model=' + ((runBody.llm || {}).model),
  )

  const state = runBody.state || {}
  const group = (state.proposedGroup && state.proposedGroup.members) || []
  const viewerId = state.userId || 'u-viewer'
  const others = group.filter((member) => member.userId !== viewerId && member.isMe !== true)
  const partner = others.find((member) => member.nickname === '写歌的江离') || others[0]
  check(Boolean(partner), '第0步 冒烟组里存在第二位真人身份', partner ? partner.nickname : 'none')

  await api('invite', '/api/agent/sessions/' + runBody.runId + '/invite', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ candidateId: partner.userId }),
  })
  await api('peer-confirm', '/api/agent/sessions/' + runBody.runId + '/peer-confirm', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accept: true }),
  })
  const roomCall = await api('create-room', '/api/agent/sessions/' + runBody.runId + '/room', { method: 'POST' })
  const roomState = (roomCall.body && roomCall.body.room) || {}
  const roomId = roomState.roomId
  check(Boolean(roomId), '第0步 双方确认后创建了同一个 roomId', 'roomId=' + roomId)

  const roomMembers = roomState.members || []
  const meMember = roomMembers.find((member) => member.isMe) || roomMembers[0]
  const peerMember = roomMembers.find((member) => !member.isMe && member.userId === partner.userId) || roomMembers.find((member) => !member.isMe)
  info('身份：A=' + meMember.nickname + '(' + meMember.userId + ')  B=' + peerMember.nickname + '(' + peerMember.userId + ')')

  const roomProbe = await api('room-read', '/api/rooms/' + roomId)
  check(roomProbe.status === 200, '第0步 后端可按 roomId 读回房间（第二身份不依赖本地存储）')

  // ---------------- 1. 两个完全隔离的浏览器上下文 ----------------
  ctxA = await openBrowser(9335)
  ctxB = await openBrowser(9336)
  // 房间路由要求明确身份：A 端用 ?as= 认领房间成员身份（与 B 端一致）
  await ctxA.goto(BASE + '/#/room/' + roomId + '?as=' + meMember.userId)
  await ctxB.goto(BASE + '/#/room/' + roomId + '?as=' + peerMember.userId)

  check(await ctxA.waitForComposer(20000), '第1步 A 端进入房间（390x844，独立浏览器实例）')
  check(await ctxB.waitForComposer(20000), '第1步 B 端进入同一房间（另一个隔离实例 / 无痕 profile）')
  const roomInStorage = '(() => { for (let i = 0; i < localStorage.length; i += 1) { const key = localStorage.key(i); if (!key) continue; try { const value = JSON.parse(localStorage.getItem(key)); if (value && typeof value === "object" && value.room) return true } catch { /* 非 JSON 的键忽略 */ } } return false })()'
  const aHasLocalRoom = await ctxA.evaluate(roomInStorage)
  const bHasLocalRoom = await ctxB.evaluate(roomInStorage)
  check(!aHasLocalRoom && !bHasLocalRoom, '第1步 两个上下文本地都没有房间状态（只凭 roomId，证明不靠 localStorage）')
  check(!(await ctxB.bodyText()).includes(A_MSG), '第1步 B 端此时还没有 A 的消息（本地无任何缓存）')
  await ctxA.capture('20-two-user-01-room-a.png')
  await ctxB.capture('20-two-user-02-room-b.png')

  // ---------------- 2. A → B ----------------
  check((await ctxA.typeMessage(A_MSG)) === true, '第2步 A 端输入真人消息')
  check((await ctxA.clickText('发送')) === true, '第2步 A 端点击发送')
  check(await ctxA.waitForText(A_MSG, 10000), '第2步 A 端本地看到自己发出的消息')
  check(await ctxB.waitForText(A_MSG, 15000), '第2步 B 端在另一个隔离浏览器里收到 A 的消息（B→收到）')
  await ctxA.capture('20-two-user-03-a-sent.png')
  await ctxB.capture('20-two-user-04-b-received.png')

  // ---------------- 3. B → A ----------------
  check((await ctxB.typeMessage(B_MSG)) === true, '第3步 B 端输入回复')
  check((await ctxB.clickText('发送')) === true, '第3步 B 端点击发送')
  check(await ctxB.waitForText(B_MSG, 10000), '第3步 B 端本地看到自己的回复')
  check(await ctxA.waitForText(B_MSG, 15000), '第3步 A 端收到 B 的回复（A→收到）')
  await ctxA.capture('20-two-user-05-a-received-reply.png')

  // ---------------- 4. 双方刷新后仍从后端恢复 ----------------
  await ctxA.reload()
  await ctxB.reload()
  const aRestored = (await ctxA.waitForText(A_MSG, 15000)) && (await ctxA.waitForText(B_MSG, 15000))
  const bRestored = (await ctxB.waitForText(A_MSG, 15000)) && (await ctxB.waitForText(B_MSG, 15000))
  check(aRestored, '第4步 A 端刷新后两条消息都还在')
  check(bRestored, '第4步 B 端刷新后两条消息都还在')
  await ctxA.capture('20-two-user-06-a-after-refresh.png')
  await ctxB.capture('20-two-user-07-b-after-refresh.png')

  // ---------------- 5. 后端持久化 + 字段 + 没有第三方冒充 ----------------
  const stored = await api('room-messages', '/api/rooms/' + roomId + '/messages')
  const messages = (stored.body && stored.body.messages) || []
  const texts = messages.map((item) => item.content)
  check(texts.includes(A_MSG) && texts.includes(B_MSG), '第5步 消息由后端保存，刷新/换实例都能读到', 'count=' + messages.length)
  check(
    messages.every((item) => item.id && item.roomId === roomId && item.senderId && item.senderName && item.content && item.createdAt),
    '第5步 每条消息字段完整（id/roomId/senderId/senderName/content/createdAt）',
  )
  const senders = Array.from(new Set(messages.map((item) => item.senderId)))
  check(senders.length === 2 && senders.includes(meMember.userId) && senders.includes(peerMember.userId), '第5步 发送者就是 A/B 两个真人身份', senders.join(','))

  await sleep(4500)
  const after = await api('room-messages-after', '/api/rooms/' + roomId + '/messages?after=' + messages[messages.length - 1].id)
  const extra = ((after.body && after.body.messages) || []).filter((item) => item.senderId !== meMember.userId && item.senderId !== peerMember.userId)
  const aText = await ctxA.bodyText()
  check(extra.length === 0, '第5步 等待 4.5s 没有任何第三方/AI/mock 冒充真人回复', 'extra=' + extra.length)
  check(!aText.includes('模拟联系人') && !aText.includes('Agent 回复失败'), '第5步 页面没有「模拟联系人」或 AI 冒充回复')
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
  total: rows.length,
  passed: rows.filter((row) => row.ok).length,
  failed: failures,
  rows,
  calls,
}
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const file = join(evidenceDir, 'two-user-room-' + stamp + '.json')
writeFileSync(file, JSON.stringify(evidence, null, 2))
console.log('')
console.log('证据文件：' + file)
console.log(failures === 0 ? '双人真人聊天闭环验收通过（' + rows.length + ' 项）' : '双人真人聊天闭环验收失败（' + failures + ' 项）')
process.exit(failures === 0 ? 0 : 1)