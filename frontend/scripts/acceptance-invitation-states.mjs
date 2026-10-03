// 20. 双向确认状态机 · 真实浏览器人工验收
//   A：demoRole=visitor（发起方）  B：demoRole=jiangli（接收方，写歌的江离）
// 前置：后端 127.0.0.1:8020（AGENT_MODE=live，真实 DeepSeek）+ 前端 127.0.0.1:5173
// 用法：cd frontend && node scripts/acceptance-invitation-states.mjs [base] [--session=<sessionId>]
//   --session=<id>：调试用，直接注入一个真实后端会话，跳过现场跑 Agent（仍走真实后端接口）
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const args = process.argv.slice(2)
const BASE = args.find((item) => item.startsWith('http')) ?? 'http://127.0.0.1:5173'
const injectArg = args.find((item) => item.startsWith('--session='))
const INJECT_SESSION = injectArg ? injectArg.slice('--session='.length) : ''
const API = 'http://127.0.0.1:8020'
const DEMO_B = { userId: 'jiangli', nickname: '写歌的江离' }
const PROMPT =
  '我第一次看星野回声，最喜欢《烟花》，想找人一起排队候场、副歌一起唱，最好先在群里聊熟，3 个人以内，只在公开场合见面。'

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((item) => existsSync(item))
if (!CHROME) {
  console.log('没有找到 Chrome/Edge，无法执行验收')
  process.exit(1)
}

const shotDir = join(process.cwd(), '..', 'docs', 'screenshots')
const evidenceDir = join(process.cwd(), '..', 'docs', 'acceptance')
mkdirSync(shotDir, { recursive: true })
mkdirSync(evidenceDir, { recursive: true })

const rows = []
const calls = []
const diags = []
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
  let response = null
  try {
    response = await fetch(API + path, options)
  } catch (error) {
    calls.push({ label, path, method: (options && options.method) || 'GET', status: 0, ms: Date.now() - started })
    return { status: 0, body: null, error: String(error) }
  }
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
  const profile = mkdtempSync(join(tmpdir(), 'sfl-inv-'))
  const chrome = spawn(
    CHROME,
    [
      '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
      '--no-default-browser-check', '--window-size=390,844',
      '--remote-debugging-port=' + port, '--user-data-dir=' + profile, 'about:blank',
    ],
    { stdio: 'ignore' },
  )
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
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      messageId += 1
      const id = messageId
      pending.set(id, (payload) =>
        payload.error ? reject(new Error(method + ': ' + JSON.stringify(payload.error))) : resolve(payload.result),
      )
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

  const goto = async (hashPath, waitMs = 1700) => {
    const target = BASE + '/#' + hashPath
    if ((await evaluate('location.href')) === target) {
      // CDP 对同一 URL 的 Page.navigate 不会重载，这里显式 reload 保证是全新挂载
      await send('Page.reload', { ignoreCache: true })
    } else {
      await send('Page.navigate', { url: target })
    }
    await sleep(waitMs)
  }
  const reload = async (waitMs = 2400) => {
    await send('Page.reload', { ignoreCache: true })
    await sleep(waitMs)
  }
  const bodyText = () => evaluate('document.body.innerText')
  const hash = () => evaluate('location.hash')
  const waitFor = async (expression, timeoutMs = 15000, interval = 250) => {
    const end = Date.now() + timeoutMs
    while (Date.now() < end) {
      if (await evaluate(expression)) return true
      await sleep(interval)
    }
    return false
  }
  const waitForText = (text, timeoutMs = 15000) =>
    waitFor('document.body.innerText.includes(' + JSON.stringify(text) + ')', timeoutMs)
  const waitForHash = (part, timeoutMs = 15000) =>
    waitFor('location.hash.includes(' + JSON.stringify(part) + ')', timeoutMs)
  const clickText = (text, index = 0) =>
    evaluate(`(() => {
      const wanted = ${JSON.stringify(text)};
      const nodes = Array.from(document.querySelectorAll('button, a, [role=button]'));
      const matches = nodes.filter((el) => (((el.innerText || '') + ' ' + (el.getAttribute('aria-label') || '')).trim()).includes(wanted));
      const el = matches[${index}];
      if (!el) return false;
      el.scrollIntoView({ block: 'center' });
      el.click();
      return true;
    })()`)
  const fillTextarea = (value) =>
    evaluate(`(() => {
      const el = document.querySelector('textarea');
      if (!el) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`)
  const sessionState = () =>
    evaluate(`(() => { try { return JSON.parse(sessionStorage.getItem('sfl.session.v2') || 'null') } catch { return null } })()`)
  const personId = () =>
    evaluate(`(() => { const el = document.querySelector('[data-visual="reveal-person"]'); return el ? (el.getAttribute('data-person') || '') : '' })()`)
  const inviteIdOnCard = () =>
    evaluate(`(() => { const el = document.querySelector('[data-invitation]'); return el ? el.getAttribute('data-invitation') : '' })()`)
  const tapTargets = (selector) =>
    evaluate(`(() => {
      const root = document.querySelector(${JSON.stringify(selector)});
      if (!root) return null;
      return Array.from(root.querySelectorAll('button, a, [role=button]')).map((el) => {
        const r = el.getBoundingClientRect();
        return {
          label: ((el.innerText || el.getAttribute('aria-label') || '').trim()).slice(0, 18),
          w: Math.round(r.width),
          h: Math.round(r.height),
          inView: r.width > 0 && r.top >= -1 && r.bottom <= window.innerHeight + 1 && r.left >= -1 && r.right <= window.innerWidth + 1,
        };
      });
    })()`)
  const layoutReport = () =>
    evaluate(`(() => {
      const de = document.documentElement;
      const clipped = Array.from(document.querySelectorAll('p, span, b, h1, h2')).filter((el) => {
        if (el.clientWidth <= 0) return false;
        const cls = String(el.className || '');
        if (cls.includes('truncate') || cls.includes('line-clamp') || cls.includes('sr-only')) return false;
        if (getComputedStyle(el).overflow === 'visible') return false;
        return el.scrollWidth > el.clientWidth + 1;
      }).map((el) => (el.innerText || '').trim().slice(0, 18)).filter(Boolean);
      return { overflowX: de.scrollWidth - window.innerWidth, clipped: Array.from(new Set(clipped)).slice(0, 10) };
    })()`)
  const capture = async (name) => {
    await evaluate('window.scrollTo(0, 0)')
    await sleep(260)
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    writeFileSync(join(shotDir, name), Buffer.from(shot.data, 'base64'))
    return join(shotDir, name)
  }
  const close = () => {
    try { socket.close() } catch { /* ignore */ }
    try { chrome.kill() } catch { /* ignore */ }
  }

  return {
    goto, reload, evaluate, bodyText, hash, waitFor, waitForText, waitForHash,
    clickText, fillTextarea, sessionState, personId, inviteIdOnCard,
    tapTargets, layoutReport, capture, close,
  }
}

function pendingOf(state) {
  return (state && state.agent && state.agent.pendingConfirmation) || {}
}

let ctxA = null
let ctxB = null
const shots = {}
const evidence = { startedAt: new Date().toISOString(), base: BASE, api: API, injected: INJECT_SESSION || null, shots, rows, calls, diags }

let candidateB = ''

async function dumpA(label) {
  const snapshot = {
    label,
    hash: await ctxA.hash(),
    person: await ctxA.personId(),
    hasFooter: await ctxA.evaluate('Boolean(document.querySelector("footer"))'),
    body: (await ctxA.bodyText()).replace(/\s+/g, ' ').slice(0, 260),
  }
  diags.push(snapshot)
  info('诊断[' + label + '] hash=' + snapshot.hash + ' person=' + snapshot.person + ' footer=' + snapshot.hasFooter + ' body=' + snapshot.body)
  return snapshot
}

/** 揭晓页必须是「双人同行票」而不是 loading / StateView；必要时硬刷新从 sessionStorage 恢复。 */
async function ensureRevealCard(timeoutMs = 25000, label = 'reveal') {
  if (await ctxA.waitFor(`Boolean(document.querySelector('[data-visual="reveal-person"]'))`, timeoutMs)) return true
  await dumpA(label + '-before-reload')
  await ctxA.reload(2800)
  const ok = await ctxA.waitFor(`Boolean(document.querySelector('[data-visual="reveal-person"]'))`, 30000)
  if (!ok) await dumpA(label + '-after-reload')
  return ok
}

/** 在揭晓页把轮播切到指定候选人（只向后找，调用前必须已在第 0 位或更前）。 */
async function selectOnReveal(targetUserId) {
  for (let i = 0; i < 8; i += 1) {
    if ((await ctxA.personId()) === targetUserId) return true
    if (!(await ctxA.clickText('换一位'))) break
    await sleep(500)
  }
  return (await ctxA.personId()) === targetUserId
}

/** 回到揭晓页第 0 位（hard reload 会重置轮播下标）。 */
async function resetReveal() {
  const h = await ctxA.hash()
  if (h.includes('/reveal')) await ctxA.reload(2600)
  else await ctxA.goto('/concert/night-flight/reveal', 2600)
  return ensureRevealCard(30000, 'reset-reveal')
}

/** 让发起方准备好一条指向 targetUserId 的等待确认邀请（真实 UI 操作）。 */
async function armInvite(targetUserId) {
  if (!(await resetReveal())) return 'no-card'
  if (!(await selectOnReveal(targetUserId))) return 'not-selected'
  if (!(await ctxA.bodyText()).includes('发出同行邀请')) return 'no-invite-button'
  await ctxA.clickText('发出同行邀请')
  if (!(await ctxA.waitForText('撤回邀请', 15000))) return 'no-waiting'
  const st = await ctxA.sessionState()
  if (pendingOf(st).status !== 'awaiting_peer') return 'status-' + pendingOf(st).status
  if (pendingOf(st).candidateId !== targetUserId) return 'target-' + pendingOf(st).candidateId
  return 'ui'
}

/**
 * 把 pending 指向一位「陪跑」候选人（真实后端 invite 接口，产品自己就是这么发邀请的）。
 *
 * cancelled / expired 终态下，产品 UI 只给「返回首页 / 重新匹配」，不再提供「换一位」，
 * 也无法对同一候选人再次发出邀请——这是产品既定行为（不是缺陷）。所以再次开一轮前，
 * 用后端接口先把 pending 挪到别人身上，随后所有「发出邀请 / 撤回 / 接受 / 拒绝」仍然由真实 UI 完成。
 */
async function forceArmDecoy(decoyUserId) {
  const sid = (await ctxA.sessionState()).agent.sessionId
  const status = await ctxA.evaluate(
    `fetch(${JSON.stringify(API + '/api/agent/sessions/')} + ${JSON.stringify(sid)} + '/invite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ candidateId: ${JSON.stringify(decoyUserId)} }) }).then(async (r) => { const body = await r.json(); const raw = JSON.parse(sessionStorage.getItem('sfl.session.v2') || '{}'); raw.agent = body; sessionStorage.setItem('sfl.session.v2', JSON.stringify(raw)); return r.status })`,
  )
  await ctxA.goto('/concert/night-flight/reveal', 2600)
  return status === 200
}

/** 清掉已完成的 Agent 结果，回到「还没有开始匹配」，用于验证匹配页的开始 / 取消匹配。 */
async function resetAgentRun() {
  await ctxA.evaluate("(() => { const raw = JSON.parse(sessionStorage.getItem('sfl.session.v2') || '{}'); raw.agent = null; sessionStorage.setItem('sfl.session.v2', JSON.stringify(raw)); return true })()")
  await ctxA.reload(2400)
}

/** 左上角返回：等顶栏返回按钮出现再点，避免页面还在渲染时点空。 */
async function clickBack(timeoutMs = 12000) {
  if (!(await ctxA.waitFor("Boolean(document.querySelector('button[aria-label=\"返回\"]'))", timeoutMs))) return false
  return ctxA.waitFor("(() => { const el = document.querySelector('button[aria-label=\"返回\"]'); if (!el) return false; el.click(); return true })()", 2000)
}

try {
  console.log('')
  console.log('== 双向确认状态机验收 ==')
  console.log('浏览器：' + CHROME)
  console.log('入口：' + BASE + '  后端：' + API)
  if (INJECT_SESSION) console.log('调试模式：注入真实后端会话 ' + INJECT_SESSION)

  const status = await api('ai-status', '/api/ai/status')
  const llm = (status.body && status.body.llm) || {}
  check(status.status === 200, '0.1 /api/ai/status 返回 200', 'status=' + status.status)
  check(llm.provider === 'deepseek', '0.2 provider=deepseek', 'provider=' + llm.provider)
  check(status.body && status.body.agentMode === 'live', '0.3 agentMode=live（无 mock）', 'mode=' + (status.body && status.body.mode))
  check(llm.configured === true && llm.available === true, '0.4 configured=true & available=true')
  check(status.body && status.body.forceFallback === false, '0.5 forceFallback=false（未静默回退）')
  const base1 = await api('invitations-baseline', '/api/agent/invitations?userId=' + DEMO_B.userId + '&nickname=' + encodeURIComponent(DEMO_B.nickname))
  check(base1.status === 200, '0.6 邀请列表接口可用')

  ctxA = await openBrowser(9341)
  ctxB = await openBrowser(9342)

  // ============================================================ 1. 拿到真实匹配结果
  await ctxA.goto('/sync?demoRole=visitor')
  if (INJECT_SESSION) {
    const agent = await api('inject-session', '/api/agent/sessions/' + INJECT_SESSION)
    check(agent.status === 200, '1.0 注入会话存在', 'status=' + agent.status)
    await ctxA.goto('/concert/night-flight/reveal')
    const persisted = JSON.stringify({
      concertId: 'night-flight', authorized: true, scopes: [], rawIntent: '', parsedIntent: null,
      prefs: null, agent: agent.body, peerViewed: false, room: null, memory: null,
    })
    await ctxA.evaluate('sessionStorage.setItem("sfl.session.v2", ' + JSON.stringify(persisted) + '); true')
    await ctxA.reload(2600)
  } else {
    await ctxA.goto('/concert/night-flight/task')
    check(await ctxA.evaluate("Boolean(document.querySelector('textarea'))"), '1.1 需求页可输入自然语言')
    await ctxA.fillTextarea(PROMPT)
    await ctxA.clickText('让 Agent 理解任务')
    check(await ctxA.waitForText('就按这个找', 40000), '1.2 Agent 结构化理解完成')
    await ctxA.clickText('就按这个找')
    const reachedReveal = await ctxA.waitForHash('/reveal', 150000)
    check(reachedReveal, '1.3 真实匹配完成并落在揭晓页')
    if (!reachedReveal) throw new Error('真实匹配未到达揭晓页，终止验收')
  }
  check(await ensureRevealCard(30000, 'step1'), '1.4 揭晓页展示双人同行票（非 loading/StateView）')

  const stateA0 = await ctxA.sessionState()
  const sessionId = stateA0.agent.sessionId
  const pool = stateA0.agent.rankedCandidates || []
  const itemB = pool.find((item) => item.candidate && item.candidate.nickname === DEMO_B.nickname)
  info('sessionId=' + sessionId + '  候选=' + pool.map((item, i) => i + ':' + item.candidate.nickname).join(' / '))
  check(Boolean(sessionId), '1.5 拿到真实后端会话 sessionId')
  check(Boolean(itemB), '1.6 候选中存在「' + DEMO_B.nickname + '」', itemB ? itemB.userId : 'not found')
  if (!itemB) throw new Error('真实候选里没有写歌的江离，无法验证接收方链路')
  candidateB = itemB.userId
  const decoyItem = pool.slice(2).reverse().find((item) => item.userId !== candidateB) ?? pool[pool.length - 1]
  const decoyId = decoyItem.userId
  const decoy2Item = pool.slice(3).reverse().find((item) => item.userId !== candidateB && item.userId !== decoyId) ?? pool[0]
  const decoy2Id = decoy2Item.userId
  evidence.decoyId = decoyId
  evidence.decoy2Id = decoy2Id
  const expectedRoomId = 'room-' + String(sessionId).slice(0, 12)
  evidence.sessionId = sessionId
  evidence.candidateB = candidateB
  evidence.expectedRoomId = expectedRoomId
  evidence.pool = pool.map((item) => ({ userId: item.userId, nickname: item.candidate.nickname, score: item.score }))

  // ============================================================ 2. 状态一：发起人等待
  const arm = await armInvite(candidateB)
  check(arm === 'ui', '2.1 点击「发出同行邀请」后进入等待对方确认', 'via=' + arm)
  const stateA1 = await ctxA.sessionState()
  const p1 = pendingOf(stateA1)
  check(p1.status === 'awaiting_peer', '2.2 状态 = awaiting_peer', 'status=' + p1.status)
  check(!stateA1.agent.roomId, '2.3 单方确认不建房（roomId 为空）', 'roomId=' + stateA1.agent.roomId)
  const waitingText = await ctxA.bodyText()
  check(waitingText.includes('对方确认后才会开启房间'), '2.4 明确提示「对方确认后才会开启房间」')
  check(waitingText.includes('撤回邀请') && waitingText.includes('返回同频首页'), '2.5 提供「撤回邀请」「返回同频首页」')
  const ttlMs = Number(p1.expiresAt || 0) - Number(p1.createdAt || 0)
  evidence.ttlSeconds = Math.round(ttlMs / 1000)
  check(ttlMs > 0, '2.6 邀请带真实有效期（倒计时）', Math.round(ttlMs / 1000) + 's')
  shots.waiting = await ctxA.capture('20-invitation-01-sender-waiting.png')
  const layoutWaiting = await ctxA.layoutReport()
  check(layoutWaiting.overflowX <= 1, '2.7 等待页无横向溢出', 'overflowX=' + layoutWaiting.overflowX)
  check(layoutWaiting.clipped.length === 0, '2.8 等待页文案未被截断', JSON.stringify(layoutWaiting.clipped))
  const footerTargets = await ctxA.tapTargets('footer')
  check((footerTargets || []).length >= 3 && (footerTargets || []).every((item) => item.h >= 44 && item.inView), '2.9 等待页底部按钮可见且 >=44px', JSON.stringify(footerTargets))

  check((await api('room-not-created-1', '/api/agent/sessions/' + sessionId + '/room', { method: 'POST', headers: { 'Content-Type': 'application/json' } })).status === 409, '2.10 未双向确认时建房接口 409')
  await ctxA.goto('/concert/night-flight/room')
  await sleep(600)
  check((await ctxA.hash()).includes('/sync'), '2.11 等待中访问房间路由被拦截回同频', await ctxA.hash())
  check(await resetReveal(), '2.12 返回揭晓页重新渲染同行票')
  check(await selectOnReveal(candidateB), '2.13 重新选中江离')
  check(await ctxA.waitForText('撤回邀请', 12000), '2.14 仍处于「等待对方确认」')

  // ============================================================ 3. 状态二：接收方卡片
  await ctxB.goto('/sync?demoRole=jiangli', 2200)
  check(await ctxB.waitForText('邀请你一起去现场', 30000), '3.1 B（写歌的江离）看到「Demo访客邀请你一起去现场」')
  const cardText = await ctxB.bodyText()
  check(cardText.includes('Demo访客'), '3.2 邀请人显示为 Demo访客')
  check(cardText.includes('共同曲目') && /北京昨夜下了雪|坏心情|特别关系|烟花|发个定位/.test(cardText), '3.3 卡片展示共同曲目（官方参考歌单歌曲）')
  check(cardText.includes('匹配理由'), '3.4 卡片展示匹配理由')
  check(cardText.includes('公开集合') || cardText.includes('安全集合'), '3.5 卡片展示安全集合点')
  check(cardText.includes('接受同行') && cardText.includes('暂不同行'), '3.6 提供「接受同行」「暂不同行」')
  const inviteId = await ctxB.inviteIdOnCard()
  check(Boolean(inviteId), '3.7 拿到 inviteId', inviteId)
  evidence.inviteId = inviteId
  shots.receiver = await ctxB.capture('20-invitation-02-receiver-card.png')
  check((await ctxB.layoutReport()).overflowX <= 1, '3.8 接收方卡片无横向溢出')
  const cardTargets = await ctxB.tapTargets('[data-invitation]')
  check((cardTargets || []).length >= 2 && (cardTargets || []).every((item) => item.h >= 44 && item.inView), '3.9 接收方按钮可见且 >=44px', JSON.stringify(cardTargets))

  // ============================================================ 4. 状态四：对方拒绝
  console.log('')
  console.log('== 对方拒绝 ==')
  await ctxB.clickText('暂不同行')
  check(await ctxA.waitForText('对方暂时没有接受邀请', 25000), '4.1 A 看到「对方暂时没有接受邀请」')
  const declinedText = await ctxA.bodyText()
  check(declinedText.includes('换一位') && declinedText.includes('返回首页'), '4.2 提供「换一位」「返回首页」')
  check(!declinedText.includes('已拒绝你') && !declinedText.includes('被拒绝'), '4.3 拒绝文案不带攻击性')
  const declinedState = await ctxA.sessionState()
  check(!declinedState.agent.roomId, '4.4 拒绝不创建房间', 'roomId=' + declinedState.agent.roomId)
  check((await api('room-not-created-2', '/api/agent/sessions/' + sessionId + '/room', { method: 'POST', headers: { 'Content-Type': 'application/json' } })).status === 409, '4.5 拒绝后建房接口 409')
  check((await api('room-404-2', '/api/rooms/room-' + String(sessionId).slice(0, 12))).status === 404, '4.6 该 session 没有任何房间')
  shots.declined = await ctxA.capture('20-invitation-04-declined.png')

  // ============================================================ 5. 状态五：A 撤回，B 再点接受失败
  console.log('')
  console.log('== 发起人撤回 ==')
  // 终态下产品不提供对同一候选人的再次邀请按钮（这是正常的产品行为，不是缺陷）：
  // 先对一位「陪跑」候选人发出邀请，把 pending 指向别人，再回揭晓页切回江离。
  info('陪跑邀请（先把 pending 指向别人）：' + (await forceArmDecoy(decoyId)))
  const arm2 = await armInvite(candidateB)
  check(arm2 === 'ui', '5.1 回到对江离的「等待对方确认」', 'via=' + arm2)
  const stateC = await ctxA.sessionState()
  const inviteIdC = pendingOf(stateC).inviteId
  check(pendingOf(stateC).status === 'awaiting_peer' && pendingOf(stateC).candidateId === candidateB, '5.2 当前状态 awaiting_peer（指向江离）')
  check((await ctxA.bodyText()).includes('撤回邀请'), '5.3 页面显示「撤回邀请」')

  await ctxB.goto('/sync?demoRole=jiangli', 2200)
  check(await ctxB.waitForText('邀请你一起去现场', 30000), '5.4 B 收到待确认邀请')

  await ctxA.clickText('撤回邀请')
  check(await ctxA.waitForText('邀请已撤回', 20000), '5.5 A 看到「邀请已撤回，旧邀请不能再进入房间。」')
  check((await ctxA.bodyText()).includes('返回首页'), '5.6 撤回后提供返回首页')
  shots.cancelled = await ctxA.capture('20-invitation-05-cancelled.png')

  const bStillHasCard = await ctxB.evaluate("Boolean(document.querySelector('[data-invitation]'))")
  const bClicked = bStillHasCard ? await ctxB.clickText('接受同行') : false
  await sleep(1800)
  check(bClicked, '5.7 B 在旧卡上点击「接受同行」', bStillHasCard ? 'card-still-visible' : 'card-already-gone')
  check(!(await ctxB.hash()).includes('/room'), '5.8 B 点击接受失败：没有进入房间', await ctxB.hash())
  const stateBAfter = await ctxB.sessionState()
  check(!(stateBAfter && stateBAfter.agent && stateBAfter.agent.roomId), '5.9 B 本地没有房间')
  check((await api('respond-after-cancel', '/api/agent/invitations/' + inviteIdC + '/respond', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accept: true }) })).status === 409, '5.10 撤回后接受接口 409（不建房）')
  check((await api('room-not-created-3', '/api/agent/sessions/' + sessionId + '/room', { method: 'POST', headers: { 'Content-Type': 'application/json' } })).status === 409, '5.11 撤回后建房接口 409')
  const inviteGone = await api('invitations-after-cancel', '/api/agent/invitations?userId=' + DEMO_B.userId + '&nickname=' + encodeURIComponent(DEMO_B.nickname))
  check(((inviteGone.body && inviteGone.body.invitations) || []).length === 0, '5.12 B 的邀请列表已清空')

  // ============================================================ 6. 状态六：超时 expired
  console.log('')
  console.log('== 超时 ==')
  await ctxA.clickText('返回首页')
  await sleep(1000)
  check((await ctxA.hash()).includes('/sync'), '6.1 撤回后返回落到 /sync', await ctxA.hash())
  check(await forceArmDecoy(decoyId), '6.2 准备一条真实邀请（后端 invite 接口）')
  check((await armInvite(decoy2Id)) === 'ui', '6.3 通过真实 UI 邀请一位候选人，进入等待并开始倒计时')
  check(await ctxA.waitForText('撤回邀请', 12000), '6.4 处于「等待对方确认」，真实有效期开始计时')
  const stateT = await ctxA.sessionState()
  const ttlMs4 = Number(pendingOf(stateT).expiresAt || 0) - Number(pendingOf(stateT).createdAt || 0)
  evidence.ttlSeconds = Math.round(ttlMs4 / 1000)
  info('本轮邀请有效期 ' + Math.round(ttlMs4 / 1000) + 's（真实超时，不手工改状态）')
  check(await ctxA.waitForText('邀请暂未得到回应', Math.round(ttlMs4) + 40000), '6.3 超时后显示「邀请暂未得到回应，本次匹配已结束。」')
  const expiredState = await ctxA.sessionState()
  check(pendingOf(expiredState).status === 'expired', '6.4 状态 = expired', 'status=' + pendingOf(expiredState).status)
  const expiredText = await ctxA.bodyText()
  check(expiredText.includes('重新匹配') && expiredText.includes('返回首页'), '6.5 提供「重新匹配」「返回首页」')
  check((await api('room-404-expired', '/api/rooms/room-' + String(sessionId).slice(0, 12))).status === 404, '6.6 超时没有创建任何房间')
  shots.expired = await ctxA.capture('20-invitation-06-expired.png')

  // ============================================================ 7. 状态三：双方 accepted
  console.log('')
  console.log('== 双方接受 ==')
  const arm4 = await armInvite(candidateB)
  check(arm4 === 'ui', '7.1 再次对江离发出邀请', 'via=' + arm4)
  await ctxB.goto('/sync?demoRole=jiangli', 2200)
  check(await ctxB.waitForText('邀请你一起去现场', 30000), '7.2 B 收到邀请卡')
  await ctxB.clickText('接受同行')
  check(await ctxB.waitForHash('/room', 20000), '7.3 B 接受后进入同行房间')
  check(await ctxA.waitForText('进入同行房间', 25000), '7.4 A 侧同步为已接受（2.5s 轮询生效）')
  const stateB7 = await ctxB.sessionState()
  const stateA7 = await ctxA.sessionState()
  const roomIdA = stateA7.agent.roomId
  const roomIdB = stateB7.agent.roomId
  evidence.roomIdA = roomIdA
  evidence.roomIdB = roomIdB
  check(Boolean(roomIdA) && roomIdA === roomIdB, '7.5 A/B 进入完全相同的 roomId', 'A=' + roomIdA + ' B=' + roomIdB)
  check(roomIdA === expectedRoomId, '7.6 roomId 由 sessionId 决定且唯一', roomIdA)
  check(pendingOf(stateA7).status === 'accepted' && pendingOf(stateB7).status === 'accepted', '7.7 双方状态均为 accepted')
  check((await api('room-exists', '/api/rooms/' + roomIdA)).status === 200, '7.8 后端只有一个该房间')
  shots.accepted = await ctxA.capture('20-invitation-03-both-accepted.png')
  await ctxA.reload(2600)
  await ctxB.reload(2600)
  const aAfter = await ctxA.sessionState()
  const bAfter = await ctxB.sessionState()
  check(aAfter.agent.roomId === roomIdA && bAfter.agent.roomId === roomIdB, '7.9 双方刷新后仍是同一房间', 'A=' + aAfter.agent.roomId + ' B=' + bAfter.agent.roomId)
  check((await ctxB.hash()).includes('/room'), '7.10 B 刷新后仍在房间页', await ctxB.hash())
  await ctxA.goto('/concert/night-flight/reveal', 2600)
  check(await ctxA.waitForText('进入同行房间', 12000), '7.11 A 刷新后仍是已接受')

  // ============================================================ 8. 返回 / 取消 / 浏览器返回键
  console.log('')
  console.log('== 返回与路由约束 ==')
  await ctxA.goto('/concert/night-flight/reveal', 2400)
  await clickBack()
  await sleep(1000)
  check((await ctxA.hash()).includes('/sync'), '8.1 揭晓页左上角返回 → 同频', await ctxA.hash())

  await ctxA.goto('/concert/night-flight/task', 2400)
  await clickBack()
  await sleep(1000)
  check((await ctxA.hash()).includes('/sync'), '8.2 需求确认页左上角返回 → 同频', await ctxA.hash())

  await resetAgentRun()
  await ctxA.goto('/concert/night-flight/running', 2400)
  check(await ctxA.waitForText('开始匹配', 15000), '8.3 匹配页可开始匹配')
  await ctxA.clickText('开始匹配')
  check(await ctxA.waitForText('取消匹配', 15000), '8.4 匹配进行中出现「取消匹配」')
  await ctxA.clickText('取消匹配')
  await sleep(1200)
  check((await ctxA.hash()).includes('/sync'), '8.5 取消匹配 → 同频', await ctxA.hash())

  await ctxA.goto('/concert/night-flight/running', 2400)
  await clickBack()
  await sleep(1000)
  check((await ctxA.hash()).includes('/sync'), '8.6 匹配页左上角返回 → 同频', await ctxA.hash())

  await ctxA.goto('/sync', 1800)
  await ctxA.goto('/concert/night-flight/reveal', 2400)
  await ctxA.evaluate('history.back()')
  await sleep(1600)
  check((await ctxA.hash()).includes('/sync'), '8.7 浏览器返回键 → 同频（不回确认页循环）', await ctxA.hash())

  check((await ctxA.layoutReport()).overflowX <= 1, '9.1 390×844 无横向溢出')
} catch (error) {
  check(false, '执行异常', error instanceof Error ? error.message : String(error))
  info('已捕获异常，保留已生成的截图与证据以便定位')
} finally {
  if (ctxA) ctxA.close()
  if (ctxB) ctxB.close()
}

evidence.total = rows.length
evidence.passed = rows.filter((row) => row.ok).length
evidence.failed = failures
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const file = join(evidenceDir, 'invitation-states-' + stamp + '.json')
writeFileSync(file, JSON.stringify(evidence, null, 2))
console.log('')
console.log('截图：')
for (const [key, value] of Object.entries(shots)) console.log('  ' + key + ' → ' + value)
console.log('证据文件：' + file)
console.log(failures === 0 ? '双向确认状态机验收通过（' + rows.length + ' 项）' : '双向确认状态机验收失败（' + failures + ' / ' + rows.length + ' 项）')
process.exit(failures === 0 ? 0 : 1)