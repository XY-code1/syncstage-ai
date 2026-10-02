// 演示链路录制：开始同频 → 发出同行邀请（无 ffmpeg 时的替代方案）
// 用 CDP Page.captureScreenshot 以固定间隔抓帧，输出 docs/demo-frames/*.jpg，
// 再由 docs/demo-replay.html 逐帧播放，等价于一条完整链路录屏。
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const BASE = process.argv[2] ?? 'http://127.0.0.1:5173'
const PORT = 9361
const FRAME_MS = 420
const ROOT = resolve(process.cwd(), '..')
const FRAME_DIR = join(ROOT, 'docs', 'demo-frames')
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((item) => existsSync(item))

if (!CHROME) {
  console.log('没有找到 Chrome 或 Edge，跳过录制')
  process.exit(0)
}

mkdirSync(FRAME_DIR, { recursive: true })
const profile = mkdtempSync(join(tmpdir(), 'sfl-demo-'))
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const chrome = spawn(
  CHROME,
  [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--no-default-browser-check',
    '--hide-scrollbars', '--window-size=390,844', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + profile, 'about:blank',
  ],
  { stdio: 'ignore' },
)

let socket
let frames = []
let lastFrame = ''
let recording = true

async function main() {
  let targets
  for (let i = 0; i < 100; i += 1) {
    try {
      const response = await fetch('http://127.0.0.1:' + PORT + '/json/list')
      if (response.ok) { targets = await response.json(); break }
    } catch { /* 还没起来 */ }
    await sleep(250)
  }
  const page = targets.find((item) => item.type === 'page')
  socket = new WebSocket(page.webSocketDebuggerUrl)
  const pending = new Map()
  let messageId = 0
  socket.addEventListener('message', (event) => {
    const payload = JSON.parse(event.data)
    if (payload.id && pending.has(payload.id)) pending.get(payload.id)(payload)
  })
  await new Promise((res) => socket.addEventListener('open', res))
  const send = (method, params = {}) => new Promise((res, rej) => {
    messageId += 1
    pending.set(messageId, (payload) => (payload.error ? rej(new Error(method + ': ' + JSON.stringify(payload.error))) : res(payload.result)))
    socket.send(JSON.stringify({ id: messageId, method, params }))
  })
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })

  const evaluate = async (expression) => {
    try {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
      return result.result.value
    } catch { return undefined }
  }
  const goto = (path) => send('Page.navigate', { url: BASE + '/?r=' + Date.now() + '#' + path })
  const bodyText = () => evaluate('document.body.innerText')
  const waitForText = async (text, timeoutMs = 20000) => {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if ((await bodyText() || '').includes(text)) return true
      await sleep(200)
    }
    return false
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
    await sleep(420)
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

  // 帧抓取：每次抓帧都带超时，避免个别请求挂住整条录制
  let captureFailures = 0
  const captureOnce = async () => {
    let timer
    try {
      return await Promise.race([
        send('Page.captureScreenshot', { format: 'jpeg', quality: 68, captureBeyondViewport: false }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('capture timeout')), 3000) }),
      ])
    } finally {
      clearTimeout(timer)
    }
  }
  const grabber = (async () => {
    while (recording) {
      try {
        const shot = await captureOnce()
        if (shot && shot.data && shot.data !== lastFrame) {
          lastFrame = shot.data
          frames.push(shot.data)
        }
      } catch { captureFailures += 1 }
      await sleep(FRAME_MS)
    }
  })()

  const mark = async (label) => {
    const index = frames.length
    console.log('  · ' + label + '（第 ' + index + ' 帧）')
  }

  console.log('录制开始')
  // Demo 模拟 Agent：让链路以可控节奏跑完，便于回放
  await goto('/')
  await sleep(1200)
  await evaluate("sessionStorage.clear(); localStorage.clear(); localStorage.setItem('sfl.agentMode.v1','mock')")
  await goto('/')
  await sleep(1500)
  await mark('首页：两条轨道尚未汇合')

  await clickWhenReady('开始同频')
  await waitForText('一起去现场')
  await mark('演出详情')

  await clickWhenReady('AI找同行')
  await sleep(1200)
  await mark('音乐画像授权')
  await clickWhenReady('全部授权')
  await sleep(600)
  await clickWhenReady('授权并继续')
  await sleep(1200)

  await evaluate(`(() => {
    const el = document.querySelector('textarea');
    if (!el) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(el, ${JSON.stringify('想找两个也喜欢《夜航的信》和星野回声的人一起候场，交流慢热一点，只在公开场合见面。')});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`)
  await sleep(400)
  await clickWhenReady('让 Agent 理解任务', 25000)
  await waitForText('音乐暗号')
  await mark('四项摘要确认')

  await clickWhenReady('就按这个找')
  await waitForText('正在同频', 25000)
  await mark('双轨动态匹配：候选头像从四周靠近')
  await waitForText('发现同频同行者', 90000)
  await mark('同频汇合：两条声波在共同歌曲封面汇合')

  await clickWhenReady('展开同行票根', 15000)
  await waitForText('同行票根')
  await mark('同行票根')
  await clickWhenReady('关闭弹窗')
  await sleep(400)

  await clickWhenReady('换一位')
  await sleep(1200)
  await mark('换一位：真的切到下一位候选人')

  await clickWhenReady('暂不同行')
  await waitForText('理由只用于优化下一轮匹配')
  await mark('暂不同行：只记录理由，不通知对方')
  await clickWhenReady('音乐不搭')
  await clickWhenReady('记录并看下一位')
  await sleep(800)

  await clickWhenReady('发出同行邀请')
  await waitForText('等待对方确认', 20000)
  await mark('发出同行邀请：等待对方确认')
  await waitForText('双方已确认', 20000)
  await mark('双方确认：可以进入同行房间')
  await sleep(1200)

  recording = false
  await grabber
  frames.forEach((data, index) => {
    writeFileSync(join(FRAME_DIR, 'frame-' + String(index).padStart(3, '0') + '.jpg'), Buffer.from(data, 'base64'))
  })
  console.log('录制结束：' + frames.length + ' 帧（抓帧失败 ' + captureFailures + ' 次）→ docs/demo-frames/')
}

try {
  await main()
} catch (error) {
  console.log('录制中断：' + error.message)
} finally {
  recording = false
  if (socket) socket.close()
  chrome.kill()
  await sleep(400)
  rmSync(profile, { recursive: true, force: true })
}