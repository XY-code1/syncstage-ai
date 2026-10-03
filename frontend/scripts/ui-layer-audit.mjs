// 层级 / 文字 / 对比度 / 点击区域 检查（配合 ponytail-audit 的人工验收，只报不改）
// 用法：cd frontend && node scripts/ui-layer-audit.mjs
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const BASE = process.argv[2] ?? 'http://127.0.0.1:5173'
const PORT = 9399
const ROOT = resolve(process.cwd(), '..')
const OUT = join(ROOT, 'docs', 'acceptance')
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((item) => existsSync(item))
if (!CHROME) {
  console.log('没有找到 Chrome 或 Edge，无法检查')
  process.exit(1)
}
mkdirSync(OUT, { recursive: true })

const PROMPT =
  '我第一次看星野回声，最喜欢《烟花》，想找人一起排队候场、副歌一起唱，最好先在群里聊熟，3 个人以内，只在公开场合见面。'
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const profile = mkdtempSync(join(tmpdir(), 'sfl-ui-'))
const report = []
let socket
let chrome

const AUDIT = `(() => {
  const parseColor = (value) => {
    const match = String(value || '').match(/rgba?\\(([^)]+)\\)/)
    if (!match) return null
    const parts = match[1].split(',').map((part) => parseFloat(part))
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 }
  }
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  })
  const lum = (color) => {
    const channel = (value) => {
      const v = value / 255
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
    }
    return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b)
  }
  const ratio = (a, b) => {
    const l1 = lum(a)
    const l2 = lum(b)
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
  }
  const label = (el) => el.tagName.toLowerCase() + '.' + String(el.className || '').split(' ').slice(0, 3).join('.')
  const visible = (el, rect) => rect.width > 1 && rect.height > 1 && getComputedStyle(el).visibility !== 'hidden'

  const main = document.querySelector('main') || document.body
  const inViewport = (rect) => rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth

  // 点击区域：可见按钮/链接的中心点是否真的能点到它自己
  const targets = []
  const covered = []
  for (const el of main.querySelectorAll('button, a, [role=button]')) {
    const rect = el.getBoundingClientRect()
    if (!visible(el, rect) || !inViewport(rect)) continue
    const text = (el.innerText || el.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim().slice(0, 24)
    if (rect.height < 44 || rect.width < 44) targets.push(text + ' [' + Math.round(rect.width) + 'x' + Math.round(rect.height) + '] ' + label(el))
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
    if (hit && hit !== el && !el.contains(hit)) covered.push(text + ' -> ' + (hit.tagName.toLowerCase() + '.' + String(hit.className || '').split(' ')[0]))
  }

  // 文字：被截断且没有折叠入口
  const clipped = []
  const contrast = []
  let checked = 0
  for (const el of main.querySelectorAll('*')) {
    if (el.getAttribute('aria-hidden') === 'true' || el.closest('[aria-hidden="true"]')) continue
    const style = getComputedStyle(el)
    const rect = el.getBoundingClientRect()
    if (!visible(el, rect)) continue
    const ownText = [...el.childNodes].filter((node) => node.nodeType === 3).map((node) => node.textContent).join('').trim()
    if (ownText && el.scrollWidth > el.clientWidth + 2 && style.textOverflow !== 'ellipsis' && el.clientWidth > 0) {
      clipped.push(ownText.slice(0, 26) + ' [' + el.scrollWidth + '>' + el.clientWidth + '] ' + label(el))
    }
    if (!ownText || ownText.length < 2) continue
    const size = parseFloat(style.fontSize)
    if (!size || size < 9) continue
    const color = parseColor(style.color)
    if (!color) continue
    const chain = []
    let node = el.parentElement
    while (node) {
      const bg = parseColor(getComputedStyle(node).backgroundColor)
      if (bg && bg.a > 0) chain.push(bg)
      node = node.parentElement
    }
    let bg = { r: 5, g: 7, b: 10 }
    for (let i = chain.length - 1; i >= 0; i -= 1) bg = over(chain[i], bg)
    const weight = parseInt(style.fontWeight, 10) || 400
    const large = size >= 24 || (size >= 18.66 && weight >= 700)
    const value = ratio(over(color, bg), bg)
    checked += 1
    const need = large ? 3 : 4.5
    if (value < need) {
      contrast.push({
        text: ownText.slice(0, 24),
        ratio: Number(value.toFixed(2)),
        need,
        size: Math.round(size * 10) / 10,
        color: style.color,
        where: label(el),
      })
    }
  }
  contrast.sort((a, b) => a.ratio - b.ratio)
  return {
    smallTargets: targets,
    covered,
    clipped,
    contrastChecked: checked,
    contrastFails: contrast.length,
    worst: contrast.slice(0, 8),
  }
})()`

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
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] })

  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw new Error('页面内异常：' + (result.exceptionDetails.exception?.description || result.exceptionDetails.text))
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
  const waitInPage = async (expression, label, timeoutMs = 30000) => {
    const hit = await evaluate(`new Promise((resolve) => {
      const deadline = Date.now() + ${timeoutMs}
      const timer = setInterval(() => {
        const ok = (() => { try { return Boolean(${expression}) } catch { return false } })()
        if (ok) { clearInterval(timer); resolve(true); return }
        if (Date.now() > deadline) { clearInterval(timer); resolve(false) }
      }, 50)
    })`)
    if (hit !== true) console.log('  ! 等待超时：' + label)
    return hit === true
  }
  const clickText = async (text) => {
    const done = await evaluate(`(() => {
      const wanted = ${JSON.stringify(text)};
      const el = [...document.querySelectorAll('button, a, [role=button]')].find((item) =>
        ((item.innerText || '') + ' ' + (item.getAttribute('aria-label') || '')).replace(/\\s+/g, ' ').includes(wanted));
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

  const audit = async (label) => {
    await evaluate('window.scrollTo(0, 0)')
    await sleep(200)
    const result = await evaluate(AUDIT)
    report.push({ label, ...result })
    console.log('')
    console.log('== ' + label + ' ==')
    console.log('  点击区域 < 44px 的控件 ' + result.smallTargets.length + ' 个' + (result.smallTargets.length ? '：' + result.smallTargets.slice(0, 4).join(' ｜ ') : ''))
    console.log('  中心点被遮挡的控件 ' + result.covered.length + ' 个（期望 0）' + (result.covered.length ? '：' + result.covered.slice(0, 3).join(' ｜ ') : ''))
    console.log('  文字被截断且无省略号 ' + result.clipped.length + ' 处' + (result.clipped.length ? '：' + result.clipped.slice(0, 3).join(' ｜ ') : ''))
    console.log('  对比度检查 ' + result.contrastChecked + ' 条文字，低于阈值 ' + result.contrastFails + ' 条')
    for (const item of result.worst.slice(0, 5)) {
      console.log('    ' + item.ratio + ':1（需 ' + item.need + '）' + item.size + 'px ' + item.text + '  ' + item.where)
    }
  }

  console.log('UI 层级 / 文字 / 对比度 / 点击区域检查开始（Demo 模拟 Agent，无真实模型调用）')
  await goto('/')
  await sleep(1200)
  await evaluate("sessionStorage.clear(); localStorage.clear(); localStorage.setItem('sfl.agentMode.v1','mock'); true")
  await goto('/')
  await sleep(1700)
  await waitForText('两条音乐轨迹，因为同一首歌汇合。', 15000)
  await audit('首页（未汇合）')

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
  await clickWhenReady('就按这个找')
  await waitInPage(
    "(() => { const el = document.querySelector('main [data-visual=\"dual-track\"]'); if (!el) return false; if (!location.hash.includes('/running')) return false; return Number(el.getAttribute('data-track-progress')) >= 0.2 })()",
    '双轨进入正在汇合',
    20000,
  )
  await audit('Agent 匹配中（正在汇合）')

  await waitForText('共同曲目让你们在开场前相遇', 90000)
  await waitInPage("location.hash.includes('/reveal')", '进入同频汇合页', 30000)
  await waitInPage(
    "(() => { const el = document.querySelector('main [data-visual=\"dual-track\"]'); return Boolean(el) && el.getAttribute('data-identity') === 'revealed' })()",
    '候选身份揭晓',
    20000,
  )
  await sleep(1200)
  await audit('匹配揭晓（双人同行票）')

  const out = join(OUT, 'ui-layer-audit.json')
  writeFileSync(out, JSON.stringify(report, null, 2))
  console.log('')
  console.log('报告已写入 ' + out)
} catch (error) {
  console.log('检查失败：' + (error && error.message ? error.message : error))
  process.exitCode = 1
} finally {
  if (socket) socket.close()
  if (chrome) chrome.kill()
  await sleep(400)
  rmSync(profile, { recursive: true, force: true })
}