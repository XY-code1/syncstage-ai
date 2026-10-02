// 记忆点验收截图：只跑 Demo(mock) Agent，不触发任何真实大模型调用。
// 1) 首页未汇合  2) Agent 正在汇合  3) 候选身份揭晓瞬间  4) 双人同行票完整首屏
// 用法：cd frontend && node scripts/memory-shots.mjs
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const BASE = process.argv[2] ?? 'http://127.0.0.1:5173'
const PORT = 9377
const ROOT = resolve(process.cwd(), '..')
const OUT = join(ROOT, 'docs', 'screenshots')
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((item) => existsSync(item))
if (!CHROME) {
  console.log('没有找到 Chrome 或 Edge，无法截图')
  process.exit(1)
}
mkdirSync(OUT, { recursive: true })

const PROMPT = '我第一次看星野回声，最喜欢《夜航的信》，想找人一起排队候场、副歌一起唱，最好先在群里聊熟，3 个人以内，只在公开场合见面。'
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const profile = mkdtempSync(join(tmpdir(), 'sfl-memory-'))
let socket
let chrome
const shots = []

try {
  chrome = spawn(
    CHROME,
    [
      '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--no-default-browser-check',
      '--hide-scrollbars', '--window-size=390,844', '--remote-debugging-port=' + PORT,
      '--user-data-dir=' + profile, 'about:blank',
    ],
    { stdio: 'ignore' },
  )

  const waitForEndpoint = async (url, timeoutMs = 20000) => {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      try {
        const response = await fetch(url)
        if (response.ok) return await response.json()
      } catch {
        /* 等浏览器调试端口 */
      }
      await sleep(250)
    }
    throw new Error('等待调试端口超时：' + url)
  }

  await waitForEndpoint('http://127.0.0.1:' + PORT + '/json/version')
  const targets = await waitForEndpoint('http://127.0.0.1:' + PORT + '/json/list')
  const page = targets.find((item) => item.type === 'page')
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
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  // headless Chrome 默认会报告 prefers-reduced-motion: reduce，会把揭晓过渡与闪光全部关掉。
  // 这里显式声明为 no-preference，才能截到"剪影 → 真人"的那一帧（产品在 reduce 下的行为不变）。
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] })

  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    return result.result.value
  }
  const goto = (path) => send('Page.navigate', { url: BASE + '/?r=' + Date.now() + '#' + path })
  const bodyText = async () => (await evaluate('document.body.innerText')) || ''
  const waitForText = async (text, timeoutMs = 25000) => {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if ((await bodyText()).includes(text)) return true
      await sleep(180)
    }
    return false
  }
  const waitFor = async (expression, label, timeoutMs = 30000) => {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if ((await evaluate(expression)) === true) return true
      await sleep(60)
    }
    console.log('  ! 等待超时：' + label)
    return false
  }

  // 页面内高频轮询：汇合窗口只有约 1.4s，CDP 往返会错过，改在页面里用 setInterval 命中即返回。
  const waitInPage = async (expression, label, timeoutMs = 30000) => {
    const hit = await evaluate(`new Promise((resolve) => {
      const started = Date.now();
      const timer = setInterval(() => {
        let ok = false;
        try { ok = Boolean(${expression}); } catch { ok = false; }
        if (ok) { clearInterval(timer); resolve(true); return; }
        if (Date.now() - started > ${timeoutMs}) { clearInterval(timer); resolve(false); }
      }, 16);
    })`)
    if (hit !== true) console.log('  ! 等待超时：' + label)
    return hit === true
  }
  const clickText = async (text) => {
    const done = await evaluate(`(() => {
      const wanted = ${JSON.stringify(text)};
      const el = [...document.querySelectorAll('button, a, [role=button]')].find((item) =>
        ((item.innerText || '') + ' ' + (item.getAttribute('aria-label') || '')).replace(/\s+/g, ' ').includes(wanted));
      if (!el) return false;
      el.scrollIntoView({ block: 'center' });
      el.click();
      return true;
    })()`)
    await sleep(320)
    return done === true
  }
  const clickWhenReady = async (text, timeoutMs = 20000) => {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (await clickText(text)) return true
      await sleep(300)
    }
    return false
  }
  const fillTextarea = (value) =>
    evaluate(`(() => {
      const el = document.querySelector('textarea');
      if (!el) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`)

  const metrics = () => evaluate(`(() => ({
    doc: document.documentElement.scrollHeight,
    view: window.innerHeight,
    wide: document.documentElement.scrollWidth,
    win: window.innerWidth,
  }))()`)

  const capture = async (name) => {
    // 先关掉上一步残留的 toast，避免遮挡票面与操作区
    await evaluate("document.querySelectorAll('div.fixed.inset-x-0.bottom-24 button').forEach((el) => el.click())")
    await evaluate('window.scrollTo(0, 0)')
    await sleep(160)
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    writeFileSync(join(OUT, name), Buffer.from(shot.data, 'base64'))
    const m = await metrics()
    shots.push({ name, doc: m.doc, view: m.view, wide: m.wide, win: m.win })
    console.log('  ✓ ' + name + '  ' + m.win + 'x' + m.view + '  文档高 ' + m.doc + (m.doc <= m.view + 4 ? '（无整页滚动）' : '（⚠ 有整页滚动）'))
  }

  // 揭晓瞬间专用：不做滚动与等待，只在关掉残留 toast 后立刻截图，尽量贴近过渡中的那一帧。
  const captureFast = async (name) => {
    await evaluate("document.querySelectorAll('div.fixed.inset-x-0.bottom-24 button').forEach((el) => el.click())")
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    writeFileSync(join(OUT, name), Buffer.from(shot.data, 'base64'))
    const m = await metrics()
    shots.push({ name, doc: m.doc, view: m.view, wide: m.wide, win: m.win })
    console.log('  ✓ ' + name + '  ' + m.win + 'x' + m.view + '  文档高 ' + m.doc + (m.doc <= m.view + 4 ? '（无整页滚动）' : '（⚠ 有整页滚动）'))
  }

  console.log('记忆点截图开始（Demo 模拟 Agent，无真实模型调用）')
  await goto('/')
  await sleep(1200)
  await evaluate("sessionStorage.clear(); localStorage.clear(); localStorage.setItem('sfl.agentMode.v1','mock'); true")
  await goto('/')
  await sleep(1700)
  await waitForText('两条音乐轨迹，因为同一首歌汇合。', 15000)
  await capture('19-memory-01-home-apart.png')

  await clickWhenReady('开始同频')
  await clickWhenReady('AI找同行')
  await sleep(700)
  await clickWhenReady('全部授权')
  await sleep(400)
  await clickWhenReady('授权并继续')
  await sleep(800)
  await fillTextarea(PROMPT)
  await sleep(300)
  await clickWhenReady('让 Agent 理解任务', 25000)
  await waitForText('就按这个找', 25000)
  // 确认需求后 Agent 会立刻开跑（进度页只负责展示），点这里之前不能等「开始匹配」按钮，
  // 否则会像旧脚本那样白等 8 秒，直接错过只有约 2 秒的两轨汇合窗口。
  await clickWhenReady('就按这个找')
  const trackSnapshot = () => evaluate("(() => { const el = document.querySelector('main [data-visual=\"dual-track\"]'); if (!el) return 'none'; return el.getAttribute('data-track-state') + ' progress=' + el.getAttribute('data-track-progress') + ' identity=' + el.getAttribute('data-identity') })()")
  const converging = await waitInPage(
    "(() => { const el = document.querySelector('main [data-visual=\"dual-track\"]'); if (!el) return false; if (!location.hash.includes('/running')) return false; return Number(el.getAttribute('data-track-progress')) >= 0.35 })()",
    '双轨进入正在汇合',
    20000,
  )
  console.log('  汇合帧：' + (converging ? await trackSnapshot() : '未命中'))
  await capture('19-memory-02-agent-converging.png')

  await waitForText('共同曲目让你们在开场前相遇', 90000)
  await waitInPage("location.hash.includes('/reveal')", '进入同频汇合页', 30000)
  await waitInPage(
    "(() => { const el = document.querySelector('main [data-visual=\"dual-track\"]'); return Boolean(el) && el.getAttribute('data-track-state') === 'merged' })()",
    '双轨已汇合',
    20000,
  )
  // 揭晓瞬间：候选端从匿名剪影切到真人（520ms 交叉过渡 + 920ms 闪光），取过渡中的一帧
  await waitInPage(
    "(() => { const el = document.querySelector('main [data-visual=\"dual-track\"]'); return Boolean(el) && el.getAttribute('data-identity') === 'revealed' })()",
    '候选身份揭晓',
    20000,
  )

  await sleep(150)
  console.log('  揭晓帧：' + (await trackSnapshot()))
  await captureFast('19-memory-03-identity-reveal.png')

  await sleep(1800)
  await capture('19-memory-04-ticket-hero.png')

  // 单独验证（不截图）：prefers-reduced-motion 下应跳过过渡，直接显示揭晓完成状态。
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  await goto('/concert/night-flight/reveal')
  await sleep(900)
  const reducedIdentity = await evaluate("(() => { const el = document.querySelector('main [data-visual=\"dual-track\"]'); return el ? el.getAttribute('data-identity') : 'none' })()")
  if (reducedIdentity === 'none') {
    console.log('  - 减少动效校验跳过：汇合页状态未恢复')
  } else {
    console.log((reducedIdentity === 'revealed' ? '  ✓' : '  ✗') + ' 减少动效下直接显示揭晓完成状态（identity=' + reducedIdentity + '，等待 0.9s < 1.7s 过渡）')
  }
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] })


  console.log('')
  console.log('截图结果（390×844）：')
  for (const item of shots) console.log('  ' + item.name + '  doc=' + item.doc + ' view=' + item.view + ' 横向=' + item.wide + '/' + item.win)
  const overflow = shots.filter((item) => item.doc > item.view + 4 || item.wide > item.win + 1)
  console.log(overflow.length === 0 ? '四张截图均无整页滚动与横向溢出' : '存在溢出：' + JSON.stringify(overflow))
} catch (error) {
  console.log('截图失败：' + (error && error.message ? error.message : error))
  process.exitCode = 1
} finally {
  if (socket) socket.close()
  if (chrome) chrome.kill()
  await sleep(400)
  rmSync(profile, { recursive: true, force: true })
}
