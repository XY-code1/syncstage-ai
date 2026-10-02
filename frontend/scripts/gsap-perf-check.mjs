// gsap-performance 检查（Skill: gsap-performance）
// 口径：①帧率与长帧 ②动画属性是否只有 transform / opacity ③will-change 与 blur/filter 元素数量
//       ④失焦是否真的暂停、DOM 是否随时间无界增长。
// 用法：cd frontend && node scripts/gsap-perf-check.mjs
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const BASE = process.argv[2] ?? 'http://127.0.0.1:5173'
const PORT = 9388
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
  '我第一次看星野回声，最喜欢《夜航的信》，想找人一起排队候场、副歌一起唱，最好先在群里聊熟，3 个人以内，只在公开场合见面。'
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const profile = mkdtempSync(join(tmpdir(), 'sfl-perf-'))
const report = []
let socket
let chrome

// 采样：所有 main 后代元素的 transform / opacity / strokeDashoffset，用来发现「谁在动」。
const PROBE = `(() => Array.from(document.querySelectorAll('main *')).map((el) => {
  const s = getComputedStyle(el)
  return s.transform + '|' + s.opacity + '|' + s.strokeDashoffset
}))()`

const CSS_ANIM = `(() => {
  const list = []
  for (const el of document.querySelectorAll('main *')) {
    if (!el.getAnimations) continue
    for (const a of el.getAnimations()) {
      if (a.playState !== 'running') continue
      if (a.constructor && a.constructor.name === 'CSSTransition') continue
      list.push((a.animationName || 'unknown') + ' :: ' + el.tagName.toLowerCase() + '.' + String(el.className || '').slice(0, 48))
    }
  }
  return list
})()`

const INLINE_PROBE = `(() => Array.from(document.querySelectorAll('main [style]')).map((el) => el.getAttribute('style') || ''))()`

// 只在「两次采样真的变了」时才算动画属性，否则静态内联样式会全部误报。
const parseStyle = (style) => {
  const map = new Map()
  for (const part of String(style || '').split(';')) {
    const idx = part.indexOf(':')
    if (idx < 0) continue
    map.set(part.slice(0, idx).trim(), part.slice(idx + 1).trim())
  }
  return map
}
const LAYOUT_PROPS = new Set(['width', 'height', 'top', 'left', 'right', 'bottom', 'margin', 'padding'])
const diffStyleProps = (a, b) => {
  const before = parseStyle(a)
  const after = parseStyle(b)
  return [...new Set([...before.keys(), ...after.keys()])].filter((key) => before.get(key) !== after.get(key))
}

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
    if (result.exceptionDetails) throw new Error('页面内异常：' + JSON.stringify(result.exceptionDetails.exception?.description || result.exceptionDetails.text))
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

  const sampleFrames = async (ms) => {
    const frames = await evaluate(`new Promise((done) => {
      const gaps = []
      let last = performance.now()
      const end = last + ${ms}
      const tick = (now) => {
        gaps.push(now - last)
        last = now
        if (now < end) requestAnimationFrame(tick)
        else done(gaps)
      }
      requestAnimationFrame(tick)
    })`)
    const sorted = [...frames].sort((a, b) => a - b)
    const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0
    return {
      frames: frames.length,
      fps: Math.round((frames.length / ms) * 1000),
      p95: Number(p95.toFixed(1)),
      long: frames.filter((gap) => gap > 34).length,
    }
  }

  const measure = async (label, frameMs) => {
    const cssAnim = await evaluate(CSS_ANIM)
    const inline1 = await evaluate(INLINE_PROBE)
    await sleep(450)
    const inline2 = await evaluate(INLINE_PROBE)
    const inlineChanged = []
    const layoutAnimated = []
    for (let i = 0; i < Math.min(inline1.length, inline2.length); i += 1) {
      if (inline1[i] === inline2[i]) continue
      const changed = diffStyleProps(inline1[i], inline2[i])
      if (!changed.length) continue
      inlineChanged.push(changed.join(','))
      const layout = changed.filter((name) => LAYOUT_PROPS.has(name))
      if (layout.length) layoutAnimated.push(layout.join(',') + ' :: ' + String(inline1[i]).slice(0, 48))
    }
    const inlineMotion = { changed: inlineChanged.length, props: [...new Set(inlineChanged.flatMap((item) => item.split(',')))], layout: layoutAnimated }
    const dom = await evaluate(`(() => ({
      nodes: document.querySelectorAll('main *').length,
      willChange: [...document.querySelectorAll('main *')].filter((el) => {
        const value = getComputedStyle(el).willChange
        return Boolean(value) && value !== 'none' && value !== 'auto'
      }).length,
      blurFilter: [...document.querySelectorAll('main *')].filter((el) => {
        const s = getComputedStyle(el)
        return (s.filter && s.filter !== 'none') || (s.backdropFilter && s.backdropFilter !== 'none')
      }).length,
    }))()`)

    // 谁在动：两次采样的计算样式差异
    const a = await evaluate(PROBE)
    await sleep(500)
    const b = await evaluate(PROBE)
    const moving = new Set()
    for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) moving.add(i)

    // 失焦暂停：连续采样 9 次，取值 >=4 种才算「还在插值」。
    // 只跳变一两次的是 React 按真实进度重渲染（业务状态），不是动画。
    const burst = async (times) => {
      const samples = []
      for (let i = 0; i < times; i += 1) {
        samples.push(await evaluate(PROBE))
        await sleep(110)
      }
      return samples
    }
    const distinct = (samples, i) => new Set(samples.map((sample) => sample[i])).size
    await evaluate("window.dispatchEvent(new Event('blur'))")
    await sleep(150)
    const blurSamples = await burst(9)
    const changedWhileBlurred = [...moving].filter((i) => distinct(blurSamples, i) >= 4).length
    const discreteWhileBlurred = [...moving].filter((i) => distinct(blurSamples, i) === 2).length
    await evaluate("window.dispatchEvent(new Event('focus'))")
    await sleep(150)
    const focusSamples = await burst(9)
    const changedAfterFocus = [...moving].filter((i) => distinct(focusSamples, i) >= 4).length

    // DOM 是否无界增长
    const before = dom.nodes
    await sleep(4000)
    const after = await evaluate(`document.querySelectorAll('main *').length`)

    const frames = frameMs ? await sampleFrames(frameMs) : null

    const entry = { label, dom, moving: moving.size, changedWhileBlurred, discreteWhileBlurred, changedAfterFocus, cssAnim, inlineMotion, nodeGrowth: after - before, frames }
    report.push(entry)

    console.log('')
    console.log('== ' + label + ' ==')
    console.log('  DOM 节点 ' + dom.nodes + ' ｜ will-change ' + dom.willChange + ' ｜ blur/filter ' + dom.blurFilter)
    console.log('  正在动的元素 ' + moving.size + ' 个')
    console.log('  失焦后仍在插值 ' + changedWhileBlurred + ' 个（期望 0）｜ 仅状态跳变 ' + discreteWhileBlurred + ' 个 ｜ 回焦后重新插值 ' + changedAfterFocus + ' 个')
    if (frames) console.log('  帧：' + frames.fps + 'fps ｜ p95 ' + frames.p95 + 'ms ｜ 长帧(>34ms) ' + frames.long + '/' + frames.frames)
    console.log('  4 秒 DOM 增长 ' + (after - before) + ' 个（期望 0）')
    console.log('  仍在跑的 CSS animation ' + cssAnim.length + ' 个' + (cssAnim.length ? '：' + cssAnim.slice(0, 6).join(' ｜ ') : ''))
    console.log('  内联里真正在变的属性 ' + (inlineMotion.props.join(' / ') || '无') + '（' + inlineMotion.changed + ' 个元素）')
    console.log('  其中布局属性 ' + inlineMotion.layout.length + ' 处（期望 0）' + (inlineMotion.layout.length ? '：' + inlineMotion.layout.slice(0, 3).join(' ｜ ') : ''))
  }

  console.log('GSAP 性能检查开始（Demo 模拟 Agent，无真实模型调用）')
  await goto('/')
  await sleep(1200)
  await evaluate("sessionStorage.clear(); localStorage.clear(); localStorage.setItem('sfl.agentMode.v1','mock'); true")
  await goto('/')
  await sleep(1700)
  await waitForText('两条音乐轨迹，因为同一首歌汇合。', 15000)
  await measure('首页（未汇合）', 2500)

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
  const converging = await waitInPage(
    "(() => { const el = document.querySelector('main [data-visual=\"dual-track\"]'); if (!el) return false; if (!location.hash.includes('/running')) return false; return Number(el.getAttribute('data-track-progress')) >= 0.2 })()",
    '双轨进入正在汇合',
    20000,
  )
  console.log('  ' + (converging ? '已进入汇合阶段' : '未命中汇合阶段'))
  await measure('Agent 匹配中（正在汇合）', 2500)

  await waitForText('共同曲目让你们在开场前相遇', 90000)
  await waitInPage("location.hash.includes('/reveal')", '进入同频汇合页', 30000)
  await waitInPage(
    "(() => { const el = document.querySelector('main [data-visual=\"dual-track\"]'); return Boolean(el) && el.getAttribute('data-identity') === 'revealed' })()",
    '候选身份揭晓',
    20000,
  )
  await measure('匹配揭晓（双人同行票）', 0)

  const perfPath = join(OUT, 'gsap-perf-report.json')
  writeFileSync(perfPath, JSON.stringify(report, null, 2))
  console.log('')
  console.log('报告已写入 ' + perfPath)
} catch (error) {
  console.log('性能检查失败：' + (error && error.message ? error.message : error))
  process.exitCode = 1
} finally {
  if (socket) socket.close()
  if (chrome) chrome.kill()
  await sleep(400)
  rmSync(profile, { recursive: true, force: true })
}