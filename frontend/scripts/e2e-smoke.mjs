// SyncStage · 演示路径端到端冒烟测试（开发用脚本）
// 前置：先启动 dev server（npm run dev），再执行 npm run e2e
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = process.argv[2] ?? 'http://127.0.0.1:5173'
const PORT = 9333
const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
]

const chromePath = CHROME_CANDIDATES.find((item) => existsSync(item))
if (!chromePath) {
  console.log('没有找到 Chrome 或 Edge，跳过端到端冒烟测试')
  process.exit(0)
}

const profile = mkdtempSync(join(tmpdir(), 'sfl-e2e-'))
const screenshotDir = join(process.cwd(), '..', 'docs', 'screenshots')
mkdirSync(screenshotDir, { recursive: true })
let failures = 0
const SHEET_CLOSE_SELECTOR = "[aria-label='关闭弹窗']"
let chrome
let socket
// 运行模式由执行页徽标判定：mock = Demo 模拟 Agent，live = 真实模型 Agent。

function check(condition, label) {
  if (condition) {
    console.log('  PASS  ' + label)
  } else {
    failures += 1
    console.log('  FAIL  ' + label)
  }
}

function skip(label, why) {
  console.log('  SKIP  ' + label + (why ? '（' + why + '）' : ''))
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

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
      '--window-size=390,844',
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
    if (payload.id && pending.has(payload.id)) {
      pending.get(payload.id)(payload)
    }
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

  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    if (result.exceptionDetails) {
      throw new Error('页面脚本报错：' + JSON.stringify(result.exceptionDetails.exception))
    }
    return result.result.value
  }

  async function capture(name) {
    // 清掉上一步残留的 toast，避免遮挡截图
    await evaluate(`document.querySelectorAll('div.fixed.inset-x-0.bottom-24 button').forEach((el) => el.click())`)
    await sleep(120)
    await evaluate('window.scrollTo(0, 0)')
    await sleep(250)
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    writeFileSync(join(screenshotDir, 'p0-' + name), Buffer.from(shot.data, 'base64'))
  }

  async function waitForText(text, timeoutMs = 15000) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const found = await evaluate('document.body.innerText.includes(' + JSON.stringify(text) + ')')
      if (found) return true
      await sleep(250)
    }
    return false
  }

  function step(label) {
    console.log('→ ' + label)
  }

  async function clickText(text, index = 0) {
    return evaluate(`(() => {
      const wanted = ${JSON.stringify(text)};
      const nodes = Array.from(document.querySelectorAll('button, a, [role=button]'));
      const matches = nodes.filter((el) => {
        const label = ((el.innerText || '') + ' ' + (el.getAttribute('aria-label') || '')).replace(/\\s+/g, ' ').trim();
        return label.includes(wanted);
      });
      const el = matches[${index}];
      if (!el) return { ok: false, matches: matches.length };
      el.scrollIntoView({ block: 'center' });
      el.click();
      return { ok: true, matches: matches.length, text: (el.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 30) };
    })()`)
  }

  /**
   * 需要同时命中多个子串才点击：避免「群聊行的预览文案里出现某个名字」时
   * 把 substring 匹配误当成私聊行（例如预览为「写歌的江离：…」的同行组行）。
   */
  async function clickTextAll(texts, index = 0) {
    return evaluate(`(() => {
      const wanted = ${JSON.stringify(texts)};
      const nodes = Array.from(document.querySelectorAll('button, a, [role=button]'));
      const matches = nodes.filter((el) => {
        const label = ((el.innerText || '') + ' ' + (el.getAttribute('aria-label') || '')).replace(/\\s+/g, ' ').trim();
        return wanted.every((item) => label.includes(item));
      });
      const el = matches[${index}];
      if (!el) return { ok: false, matches: matches.length };
      el.scrollIntoView({ block: 'center' });
      el.click();
      return { ok: true, matches: matches.length, text: (el.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 40) };
    })()`)
  }

  /** 轮询等待表达式结果等于期望值：消息要先落库再显示，同步断言会踩在请求返回之前 */
  async function waitForValue(expression, expected, timeoutMs = 6000) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if ((await evaluate(expression)) === expected) return true
      await sleep(150)
    }
    return false
  }

  async function fillTextarea(value) {
    return evaluate(`(() => {
      const el = document.querySelector('textarea');
      if (!el) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`)
  }

  const currentHash = () => evaluate('location.hash')
  const bodyText = () => evaluate('document.body.innerText')
  /** 一级/核心页面不应超过给定屏幕数的连续纵向堆叠 */
  const fitsScreens = (screens) => evaluate(`document.documentElement.scrollHeight <= innerHeight * ${screens} + 4`)
  const hasElement = (selector) => evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`)

  /** 等待元素出现：路由切换是异步的，直接断言容易踩在上一页 */
  const waitForElement = async (selector, timeoutMs = 8000) => {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (await hasElement(selector)) return true
      await sleep(120)
    }
    return false
  }
  /** 底部「消息」入口的未读数字：没有红点时返回空串 */
  const navUnread = () => evaluate(`(() => {
    const nav = document.querySelector('nav[aria-label="主导航"]');
    const link = nav ? [...nav.querySelectorAll('a')].find((a) => (a.getAttribute('href') || '').endsWith('/messages')) : null;
    if (!link) return '';
    const badge = [...link.querySelectorAll('span')].map((s) => (s.innerText || '').trim()).find((t) => t.length > 0 && t.length <= 2 && !Number.isNaN(Number(t)));
    return badge || '';
  })()`)
  const tapTargetsOk = (minWidth = 120, minHeight = 44) => evaluate(`(() => {
    const nodes = [...document.querySelectorAll('main button, nav button, footer button')];
    return nodes.filter((el) => { const r = el.getBoundingClientRect(); return r.width >= ${minWidth} && r.height > 0 && r.bottom > 0 && r.top < innerHeight; })
      .every((el) => el.getBoundingClientRect().height >= ${minHeight});
  })()`)
  const noHorizontalOverflow = () => evaluate('document.documentElement.scrollWidth <= innerWidth')
  /** 双轨声波当前状态：apart（尚未汇合）/ converging（正在靠近）/ merged（已汇合） */
  const dualTrackState = () => evaluate(
    '(() => { const el = document.querySelector(\'[data-visual="dual-track"]\'); return el ? el.getAttribute("data-track-state") : "" })()',
  )
  const waitForDualTrackState = async (state, timeoutMs = 5000) => {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if ((await dualTrackState()) === state) return true
      await sleep(120)
    }
    return false
  }
  const mobileButtonVisible = (label) => evaluate(`(() => {
    const el = [...document.querySelectorAll('button')].find((item) => (item.innerText || '').trim().includes(${JSON.stringify(label)}));
    if (!el) return false;
    el.scrollIntoView({ block: 'center' });
    const rect = el.getBoundingClientRect();
    return rect.width > 120 && rect.height >= 40 && rect.left >= 0 && rect.right <= innerWidth + 1 && rect.top >= 0 && rect.bottom <= innerHeight + 1;
  })()`)
  // 每次都带上变化的查询串，确保是整页重新加载（否则同一 URL 的 hash 跳转不会重新挂载页面）
  const goto = (path) => send('Page.navigate', { url: BASE + '/?r=' + Date.now() + '#' + path })


  // ---------------------------------------------------------------- 演示控制台
  async function openConsole() {
    // 页面刚导航完时，点击可能落在旧文档上；这里以「弹层真的出现」为准重试
    for (let attempt = 0; attempt < 12; attempt += 1) {
      if (!(await hasElement(SHEET_CLOSE_SELECTOR))) {
        await clickText('打开演示控制台')
      }
      await sleep(250)
      if (await hasElement(SHEET_CLOSE_SELECTOR)) return { ok: true }
    }
    return { ok: false }
  }

  async function closeConsole() {
    await sleep(150)
    return clickText('关闭弹窗')
  }

  async function resetDemo() {
    await openConsole()
    const clicked = await clickText('重置演示数据并回到首页')
    if (clicked.ok !== true) return false
    // 重置会清空本地会话并回到首页；等首页渲染完成再继续，避免后续断言踩在旧状态上
    await waitForText('近期演出', 8000)
    await sleep(200)
    return true
  }

  async function setJudge(on) {
    await openConsole()
    const clicked = await clickText(on ? '已关闭：只显示自然语言进度' : '已开启：显示技术日志')
    await closeConsole()
    return clicked.ok === true
  }

  async function setCase(caseLabel) {
    await openConsole()
    const clicked = await clickText(caseLabel)
    await closeConsole()
    return clicked.ok === true
  }

  async function setScenario(scenarioLabel) {
    await openConsole()
    const clicked = await clickText(scenarioLabel)
    await closeConsole()
    return clicked.ok === true
  }

  // Agent 不再在进入进度页时自动运行：必须由用户点击「开始匹配」。
  async function startMatch(timeoutMs = 20000) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const clicked = await clickText('开始匹配')
      if (clicked.ok === true) {
        await sleep(400)
        return true
      }
      await sleep(250)
    }
    return false
  }

  console.log('浏览器：' + chromePath)
  console.log('入口：' + BASE)

  // ============================================================ 一级导航与四个主页面
  step('① 首页：一级任务在一个屏幕内完成')
  await goto('/')
  await evaluate('sessionStorage.clear(); localStorage.clear()')
  await goto('/')
  check(await waitForText('一起去现场'), '① 首页标题可见')
  check(await waitForText('近期演出'), '① 首页保留真实演出入口')
  check(await waitForText('夜航计划'), '① 首页至少显示一场演出')
  const navLabels = ['首页', '同频', '消息', '我的']
  const navText = await evaluate(`(() => { const nav = document.querySelector('nav[aria-label=主导航]'); return nav ? nav.innerText : '' })()`)
  for (const label of navLabels) {
    check(navText.includes(label), `① 一级导航包含「${label}」`)
  }
  check(await evaluate(`(() => { const nav=document.querySelector('nav[aria-label=主导航]'); return Boolean(nav) && [...nav.querySelectorAll('a')].length === 4 })()`), '① 一级导航固定四项')
  for (const [width, height] of [[390, 844], [375, 812], [430, 932]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true })
    await sleep(150)
    check(await noHorizontalOverflow(), `① ${width}×${height} 无横向溢出`)
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await sleep(250)
  check(await waitForText('开场前，'), '① 首屏主标题为开场前找同频的人')
  check(await waitForText('两条轨道尚未汇合'), '① 首屏是两条尚未汇合的声波')
  check(await waitForElement('[data-visual=dual-track]'), '① 首屏使用双轨声波主视觉')
  check((await dualTrackState()) === 'apart', '① 首屏双轨状态是「尚未汇合」')
  check(await tapTargetsOk(), '① 首页主点击区高度合格')
  check(await mobileButtonVisible('开始找同频搭子'), '① 首页主按钮无遮挡')
  await send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 1, mobile: true })
  await sleep(300)
  check(await evaluate('document.querySelector("h1")?.getBoundingClientRect().bottom < innerHeight'), '① 430×932 Hero 主标题位于首屏')
  check(await noHorizontalOverflow(), '① 430×932 首页无横向溢出')
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await sleep(250)
  await capture('00-home.png')
  // prefers-reduced-motion：关闭轨迹移动，但静态状态变化（尚未汇合）必须保留
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  await sleep(400)
  check(
    await evaluate(`(() => {
      const track = document.querySelector('.track-shift');
      if (!track) return false;
      return getComputedStyle(track).transitionDuration.split(',').every((value) => parseFloat(value) === 0);
    })()`),
    '① prefers-reduced-motion 下关闭轨迹移动',
  )
  check((await dualTrackState()) === 'apart', '① 减少动效下仍保留静态双轨状态')
  await send('Emulation.setEmulatedMedia', { features: [] })
  await sleep(250)
  await clickText('夜航计划')
  check(await waitForText('AI找同行'), '① 点击演出进入独立详情路由')
  check((await currentHash()).includes('/concert/night-flight'), '① 演出详情路由正确')
  check(await mobileButtonVisible('AI找同行'), '① 移动端主入口按钮无遮挡')
  check(await waitForText('概念功能 Demo'), '① 全站只在顶部保留一个概念 Demo 标签')
  check(!(await bodyText()).includes('本作品为参赛概念Demo'), '① 详情页不再重复 Demo 声明')
  await capture('01-concert-detail.png')

  step('② 音乐数据授权：单屏紧凑列表 + 逐项说明')
  await clickText('AI找同行')
  check(await waitForText('选择要授权的音乐数据'), '② 进入音乐数据授权页')
  check(await fitsScreens(1.05), '② 授权页在一屏内读完，不再堆叠五张大卡片')
  await clickText('暂不授权')
  check(await waitForText('你已拒绝音乐画像授权'), '② 拒绝授权时停止匹配并解释原因')
  await clickText('重新选择授权项')
  check(await waitForText('收藏歌曲'), '② 授权项包含收藏歌曲')
  check(await waitForText('常听歌手'), '② 授权项包含常听歌手')
  check(await waitForText('近期播放'), '② 授权项包含近期播放')
  check(await waitForText('关注演出'), '② 授权项包含关注演出')
  check(await waitForText('歌单标签'), '② 授权项包含歌单标签')
  check((await bodyText()).includes('已选 0/5'), '② 每一项都独立勾选')
  await clickText('收藏歌曲 的授权说明')
  check(await waitForText('读取什么'), '② 每一项都有 info 详细解释')
  check(await waitForText('不会做什么'), '② 详细解释包含数据边界')
  await clickText('关闭弹窗')
  check(await clickText('全部授权').then((r) => r.ok === true), '② 可以一键全部授权')
  check((await bodyText()).includes('已选 5/5'), '② 全部授权后状态同步')
  check(await mobileButtonVisible('授权并继续'), '② 移动端授权按钮无遮挡')
  await capture('02-music-auth.png')
  await clickText('授权并继续')

  step('③ 用自然语言说出需求')
  check(await waitForText('给同行 Agent 一个任务'), '③ 进入 Agent 对话及需求确认页')
  await goto('/concert/night-flight/authorize')
  check(await waitForText('给同行 Agent 一个任务'), '③ 已授权用户重新进入时跳过完整授权页')
  await goto('/concert/tide-line/authorize')
  check(await waitForText('选择要授权的音乐数据'), '③ 不同 concertId 的授权状态相互隔离')
  await goto('/concert/night-flight/task')
  check(await waitForText('同行 Agent 眼中的你'), '③ 授权后生成可控的临时 Agent 档案')
  const typed = await fillTextarea(
    '我第一次看星野回声，最喜欢《夜航的信》，想找人一起排队候场、副歌一起唱，最好先在群里聊熟，3 个人以内，只在公开场合见面。',
  )
  check(typed === true, '③ 可以输入自然语言需求')
  await clickText('让 Agent 理解任务')

  step('④ 确认 Agent 的理解')
  check(await waitForText('就按这个找', 20000), '④ 同页展示结构化意图确认')
  check(await mobileButtonVisible('就按这个找'), '④ 移动端执行按钮无遮挡')
  check(await fitsScreens(1.05), '④ 四项摘要确认控制在一个主屏内')
  check(await noHorizontalOverflow(), '④ 需求确认页无横向溢出')
  const intentText = await bodyText()
  check(intentText.includes('人同行') || intentText.includes('组队人数'), '④ 确认页展示解析出的组队人数')
  check(intentText.includes('安全'), '④ 确认页展示解析出的安全偏好')
  check(
    intentText.includes('音乐暗号') && intentText.includes('同行方式') && intentText.includes('现场氛围') && intentText.includes('安全边界'),
    '④ 需求确认页压成一屏四张摘要卡',
  )
  check(intentText.includes('有一处不对'), '④ 提供「有一处不对」的修改入口')
  check(intentText.includes('查看 Agent 工作过程'), '④ 技术信息收进可折叠的工作过程')
  await capture('03-agent-intent.png')

  step('⑤ 双轨匹配：靠近 → 汇合 → 同行票根')
  await clickText('就按这个找')
  check(await waitForElement('[data-visual="dual-track"]'), '⑤ 匹配页用双轨声波表达两条轨道正在靠近')
  check((await dualTrackState()) === 'converging', '⑤ 匹配中的双轨状态是「正在靠近」')
  check(
    await evaluate('document.querySelectorAll(\'[aria-label="匹配阶段"] [data-stage]\').length === 4'),
    '⑤ 四个真实阶段挂在进度上',
  )
  const stageNames = await evaluate(
    '[...document.querySelectorAll(\'[aria-label="匹配阶段"] [data-stage]\')].map((el) => el.getAttribute("data-stage"))',
  )
  check(
    ['理解你的期待', '检查安全边界', '对齐音乐偏好', '寻找同频观众'].every((name) => stageNames.includes(name)),
    '⑤ 阶段名与后端真实流水线一致',
  )
  check(
    await evaluate('document.querySelectorAll(\'[data-visual="track-bead"]\').length === 5'),
    '⑤ 两轨之间挂着五个共同音符节点',
  )
  const trackProgress = () => evaluate(
    '(() => { const el = document.querySelector(\'[data-visual="dual-track"]\'); return el ? Number(el.getAttribute("data-track-progress")) : -1 })()',
  )
  const progressStart = await trackProgress()
  check(progressStart >= 0, '⑤ 双轨声波带真实进度')
  check(!(await bodyText()).includes('parse_social_intent'), '⑤ 一级匹配页不铺工具调用日志')
  check(!/provider|token|fallback|\d+ ms/.test(await bodyText()), '⑤ 一级匹配页不出现技术参数')
  check(await fitsScreens(1.05), '⑤ 匹配中控制在一个主屏内')
  await capture('04a-agent-running.png')

  await clickText('暂停寻找')
  check(await waitForText('任务已暂停', 5000), '⑤ 用户可以暂停 Agent，已完成轨迹保留')
  check((await bodyText()).includes('修改条件') && (await bodyText()).includes('结束任务'), '⑤ 暂停后可修改条件或结束任务')
  await clickText('继续寻找')
  check(await waitForText('暂停寻找', 5000), '⑤ 用户可以沿用当前条件继续执行')

  // 每完成一步，两轨之间就亮起一个共同音符；两条轨道随真实阶段持续靠近
  const advancing = await (async () => {
    const deadline = Date.now() + 15000
    let moved = progressStart
    while (Date.now() < deadline) {
      moved = Math.max(moved, await trackProgress())
      const lit = await evaluate('Boolean(document.querySelector(\'[data-visual="track-bead"][data-bead-state="done"]\'))')
      if (moved > progressStart + 0.1 && lit) return true
      if ((await currentHash()).includes('/reveal')) return true
      await sleep(200)
    }
    return false
  })()
  check(advancing, '⑤ 两道声波随真实阶段靠近，并逐一亮起共同音符')

  // 跑完先播 600–900ms 汇合动画，再进入同频汇合页
  check(await waitForText('发现同频同行者', 90000), '⑤ 匹配完成后进入同频汇合页')
  check((await currentHash()).includes('/reveal'), '⑤ 完成后落在 /concert/:id/reveal')
  check(await waitForElement('[data-visual="dual-track"]'), '⑤ 两条声波在共同歌曲封面处汇合')
  await sleep(120)
  check(await fitsScreens(1.05), '⑤ 汇合成功控制在一个主屏内')
  check(await noHorizontalOverflow(), '⑤ 汇合页无横向溢出')
  const revealText = await bodyText()
  check(
    revealText.includes('共同曲目') &&
      revealText.includes('夜航的信') &&
      revealText.includes('你们同频的 3 个理由') &&
      revealText.includes('只在公开场合见面'),
    '⑤ 票根首屏展示曲目、活动、集合信息和三个理由',
  )
  check(/\d+%/.test(revealText), '⑤ 展示真实综合匹配度')
  // 等 600–900ms 汇合动画停稳再截图：验收图必须能看到两条声波已经汇合
  await sleep(950)
  check(await waitForDualTrackState('merged', 2000), '⑤ 汇合动画结束后双轨进入「已汇合」状态')
  await capture('05a-match-reveal.png')

  // 动画结束后浮出「查看匹配依据」入口，票根 / 偏好明细 / Agent 证据都收在这个 bottom sheet 里
  check(await waitForText('查看匹配依据', 10000), '⑤ 汇合动画结束后浮出匹配依据入口')
  await clickText('查看匹配依据')
  check(await waitForText('推荐理由'), '⑤ 匹配依据可展开')
  check(await waitForText('偏好明细'), '⑤ 匹配依据里包含偏好明细')
  const ticketText = await bodyText()
  check(ticketText.includes('夜航计划'), '⑤ 票根包含演出名称与时间')
  check(ticketText.includes('同行方式') && ticketText.includes('集合原则'), '⑤ 票根包含同行方式与公开集合原则')
  check(ticketText.includes('双方都还没确认'), '⑤ 票根展示双方确认状态')

  const ticketGeom = await evaluate(`(() => {
    const panel = document.querySelector('[role=dialog] > div');
    if (!panel) return null;
    const rect = panel.getBoundingClientRect();
    const scroller = panel.querySelector('.overflow-y-auto');
    return {
      top: Math.round(rect.top),
      height: Math.round(rect.height),
      viewport: innerHeight,
      innerScroll: scroller ? getComputedStyle(scroller).overflowY : 'none',
      pageScroll: document.documentElement.scrollHeight,
    };
  })()`)
  const ticketFits = Boolean(ticketGeom)
    && ticketGeom.top >= -1
    && ticketGeom.height <= ticketGeom.viewport + 1
    && ticketGeom.pageScroll <= ticketGeom.viewport * 1.05
  if (!ticketFits) console.log('    DEBUG ticket=' + JSON.stringify(ticketGeom))
  check(ticketFits, '⑤ 同行票根在一个主屏内（超出部分内部滚动）')
  await capture('05b-ticket-stub.png')
  await clickText('关闭弹窗')

  // 「换一位」真的切换候选人
  const person1 = await evaluate('document.querySelector(\'[data-visual="reveal-person"]\').getAttribute("data-person")')
  check(Boolean(person1), '⑤ 汇合页展示真实候选人')
  await clickText('换一位')
  await sleep(500)
  const person2 = await evaluate('document.querySelector(\'[data-visual="reveal-person"]\').getAttribute("data-person")')
  check(Boolean(person2) && person2 !== person1, '⑤ 「换一位」真的换到下一位候选人')
  await capture('05c-reveal-swap.png')

  // 「暂不同行」只记录理由，不通知对方
  await clickText('暂不同行')
  check(await waitForText('理由只用于优化下一轮匹配'), '⑤ 「暂不同行」明确只影响下一轮匹配')
  await capture('05d-reveal-reject.png')
  await clickText('音乐不搭')
  await clickText('记录并看下一位')
  await sleep(600)
  const person3 = await evaluate('document.querySelector(\'[data-visual="reveal-person"]\').getAttribute("data-person")')
  check(Boolean(person3) && person3 !== person2, '⑤ 记录拒绝理由后自动看下一位')
  check(!(await bodyText()).includes('淘汰'), '⑤ 拒绝后不出现淘汰文案')

  // 发出邀请 → 双方确认后才允许进房间
  await clickText('发出同行邀请')
  check(await waitForText('等待对方确认', 10000), '⑤ 发出邀请后先等待对方确认，不创建房间')
  check(!(await bodyText()).includes('进入同行房间'), '⑤ 单方确认时绝不提前开放房间')

  // 路由约束：waiting / 未 accepted 状态访问房间路由必须被拦截回同频
  await goto('/concert/night-flight/room')
  await sleep(900)
  check((await currentHash()).includes('/sync'), '⑤ waiting 状态访问房间路由被拦截回同频')
  check(!(await bodyText()).includes('同行房间消息'), '⑤ 被拦截时看不到房间消息区')
  await goto('/room/room-not-accepted-yet')
  await sleep(900)
  check((await currentHash()).includes('/sync'), '⑤ 未 accepted 时直接输入房间 URL 被拦截回同频')

  await goto('/concert/night-flight/reveal?as=peer')
  check(await waitForText('Demo访客邀请你一起去现场'), '⑤ 受邀方可看到邀请')
  await clickText('接受同行')
  check(await waitForText('进入同行房间', 15000), '⑤ 双方都确认后才出现进入同行房间入口')
  await clickText('查看匹配依据')
  check(await waitForText('双方已确认'), '⑤ 票根记录双方都已确认')
  await clickText('关闭弹窗')

  // 旧的匹配列表页仍然可用
  await goto('/concert/night-flight/matches')
  await sleep(400)
  check(await waitForText('综合匹配度', 20000), '⑤ 匹配列表页仍然可用')
  step('⑥ 候选列表 -> 独立详情 -> 独立预沟通')
  check(await waitForText('综合匹配度'), '⑥ 列表显示候选摘要')
  await capture('05-match-list.png')
  check(await clickText('查看详情').then(r=>r.ok), '⑥ 点击候选进入详情')
  check((await currentHash()).includes('/matches/'), '⑥ 候选详情拥有独立路由')
  check(await waitForText('四维评分组成'), '⑥ 详情展示完整评分')
  check(await waitForText('全部匹配证据'), '⑥ 详情展示完整证据')
  await capture('06-candidate-detail.png')
  await clickText('查看 Agent 预沟通报告')
  check((await currentHash()).includes('/handshake/'), '⑦ 预沟通报告拥有独立路由')
  check(await waitForText('待真人确认'), '⑦ 报告展示待确认项')
  await capture('07-handshake.png')
  await clickText('确认报告并邀请同行')
  await waitForText('接受同行', 10000)
  await clickText('接受同行')
  check(await waitForText('进入临时群聊', 10000), '⑧ 双方确认后允许进入群聊')
  await clickText('进入临时群聊')
  check(await waitForText('夜航计划同行组', 20000), '⑨ 同行房间是消息模块里的一个群聊')
  check(/\d+人\s*·\s*集合中/.test(await bodyText()), '⑨ 顶部栏显示「人数·集合状态」')
  check(await hasElement('[aria-label="返回消息列表"]'), '⑨ 顶部左侧是「‹ 消息」返回')
  check(await hasElement('[aria-label="房间设置"]'), '⑨ 顶部右侧是 ··· 房间设置')
  check(await hasElement('[aria-label="查看集合详情"]'), '⑨ 集合信息压缩成一行可点击状态卡')
  check(/\d+人同行\s*·\s*\d+\/\d+\s*已确认/.test(await bodyText()), '⑨ 双向确认压缩成一行状态')
  check(!(await bodyText()).includes('双向确认状态'), '⑨ 删除顶部四段流程条与大面积确认卡')
  check(await fitsScreens(1), '⑨ 房间为一屏式布局，整页不产生长滚动')
  check(
    await evaluate(`(() => { const el = document.querySelector('[aria-label="同行房间消息"]'); return Boolean(el) && getComputedStyle(el).overflowY === 'auto' })()`),
    '⑨ 只有消息区是滚动容器',
  )
  check(await waitForText('木那啦啦'), '⑨ 展示预置真人聊天')
  check(await waitForText('同行Agent已完成安全条件核对'), '⑨ 安全提示是小型居中系统消息')
  check(await waitForText('Agent · 集合点已同步'), '⑨ Agent 集合通知是小型系统消息')
  check(await evaluate(`(() => { const el=document.querySelector('input[placeholder="输入消息……"]'); if(!el) return false; el.scrollIntoView({block:'center'}); const r=el.getBoundingClientRect(); return r.width>80 && r.height>=32 && r.left>=0 && r.right<=innerWidth && r.top>=0 && r.bottom<=innerHeight })()`), '⑨ 390×844 输入栏无遮挡')

  // 集合详情：地图 / 到达状态 / 成员确认 / 安全说明
  await clickText('查看集合详情')
  check(await waitForText('集合详情', 10000), '⑨ 点击集合卡进入集合详情')
  check(await waitForText('声浪 Livehouse 静安店'), '⑨ 集合详情展示地图与公开集合点')
  check(await waitForText('我的到达状态'), '⑨ 集合详情可修改自己的到达状态')
  check(await waitForText('安全说明'), '⑨ 集合详情包含安全说明')
  await capture('08b-meeting-detail.png')
  await clickText('我已记下集合点')
  await sleep(300)
  check(await waitForText('我已记下集合点'), '⑨ 集合确认后状态保持')
  await clickText('关闭弹窗')

  // 房间设置：成员列表 / 消息免打扰 / 举报 / 退出同行
  await clickText('房间设置')
  check(await waitForText('成员列表', 10000), '⑨ 房间设置包含成员列表')
  check(await waitForText('消息免打扰'), '⑨ 房间设置包含消息免打扰')
  check(await waitForText('退出同行'), '⑨ 房间设置包含退出同行（危险操作 + 二次确认）')
  check(await waitForText('安全说明'), '⑨ 房间设置也包含安全说明')
  await capture('08c-room-settings.png')
  await clickText('消息免打扰')
  check(await evaluate(`Boolean(document.querySelector('[aria-pressed="true"]'))`), '⑨ 消息免打扰可切换')
  await clickText('消息免打扰')
  await clickText('关闭弹窗')

  // 430×932 也要首屏完整放下顶部栏 / 集合卡 / 聊天 / 输入栏
  await send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 1, mobile: true })
  await sleep(400)
  check(await fitsScreens(1), '⑨ 430×932 下房间仍是一屏')
  check(
    await evaluate(`(() => { const el=document.querySelector('input[placeholder="输入消息……"]'); if(!el) return false; el.scrollIntoView({block:'center'}); const r=el.getBoundingClientRect(); return r.width>120 && r.height>=32 && r.top>=0 && r.bottom<=innerHeight+1 })()`),
    '⑨ 430×932 下输入栏完整可见',
  )
  await send('Emulation.clearDeviceMetricsOverride')
  await sleep(300)
  // 「＋」菜单与 Agent帮写：只出草稿，绝不自动发送
  const beforeDraft = await evaluate(`document.querySelector('[aria-label="同行房间消息"]')?.children.length || 0`)
  await clickText('更多操作')
  check(await waitForText('Agent帮写', 10000), '⑨ 「＋」包含 Agent帮写 / 查看任务 / 共享歌曲 / 查看集合点')
  check(await waitForText('查看任务'), '⑨ 「＋」包含查看任务')
  check(await waitForText('共享歌曲'), '⑨ 「＋」包含共享歌曲')
  await clickText('Agent帮写')
  check(await waitForText('只生成草稿', 10000), '⑨ Agent帮写明确只生成草稿')
  await clickText('生成草稿')
  await clickText('填入输入框')
  check(await evaluate(`document.querySelector('input[placeholder="输入消息……"]')?.value.length > 0`), '⑨ 草稿只填入输入框')
  check((await evaluate(`document.querySelector('[aria-label="同行房间消息"]')?.children.length || 0`)) === beforeDraft, '⑨ Agent帮写不会自动发送')
  const roomDraft = await evaluate(`document.querySelector('input[placeholder="输入消息……"]')?.value || ''`)
  await clickText('发送')
  check(await waitForValue(`document.querySelector('[aria-label="同行房间消息"]')?.children.length || 0`, beforeDraft + 1), '⑨ 用户点发送后才真正发出')

  // 举报 / 屏蔽不常驻，长按（右键）才出现
  check(!(await bodyText()).includes('屏蔽成员'), '⑨ 举报与屏蔽不常驻显示')
  check(
    await evaluate(`(() => { const el = document.querySelector('[data-message-action="1"]'); if (!el) return false; el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })); return true })()`),
    '⑨ 长按 / 右键消息才出现操作菜单',
  )
  check(await waitForText('消息操作', 10000), '⑨ 消息操作菜单包含举报与屏蔽')
  await clickText('屏蔽成员')
  check(!(await evaluate(`document.querySelector('[aria-label="同行房间消息"]')?.innerText.includes('我大概18:40到')`)), '⑨ 屏蔽后不再显示对应成员消息')
  await capture('08-temporary-room.png')

  await evaluate(`(() => { const key='sfl.session.v2'; const s=JSON.parse(sessionStorage.getItem(key)); s.room.members[1].confirmed=false; sessionStorage.setItem(key, JSON.stringify(s)); return true })()`)
  await goto('/concert/night-flight/room')
  check(await waitForText('等待全部成员确认，确认完成后开放临时群聊。'), '⑨ 未全部确认时不能发送消息')
  check(!(await bodyText()).includes('输入消息……'), '⑨ 未全部确认时隐藏消息输入栏')
  await evaluate(`(() => { const key='sfl.session.v2'; const s=JSON.parse(sessionStorage.getItem(key)); s.room.members.forEach(m=>m.confirmed=true); s.room.createdAt=1; sessionStorage.setItem(key, JSON.stringify(s)); return true })()`)
  await goto('/concert/night-flight/room')
  check(await waitForText('房间已归档，只可查看历史消息'), '⑨ 归档房间不能继续发送')
  check(!(await bodyText()).includes('输入消息……'), '⑨ 归档后输入框不可用')

  step('⑩ 同频：人与匹配优先')
  await goto('/sync')
  check(await waitForText('推荐同频用户', 20000), '⑩ 同频页以人为优先，而不是演出列表')
  check(await waitForText('共同演出：'), '⑩ 推荐卡片突出共同演出')
  check((await bodyText()).includes('推荐理由：'), '⑩ 推荐卡片给出推荐理由')
  check((await bodyText()).includes('临时同频房间') || (await bodyText()).includes('匹配进行中'), '⑩ 同频页展示正在进行的匹配或房间')
  check(await fitsScreens(1.5), '⑩ 同频页不超过 1.5 屏纵向堆叠')
  check(await tapTargetsOk(), '⑩ 同频页主点击区高度合格')
  await capture('09-sync.png')
  check(
    await evaluate(`(() => {
      const el = [...document.querySelectorAll('button')].find((b) => (b.innerText || '').includes('推荐理由：'));
      if (!el) return false;
      el.scrollIntoView({ block: 'center' });
      el.click();
      return true;
    })()`),
    '⑩ 推荐卡片可点开',
  )
  check(await waitForText('四维评分组成', 10000), '⑩ 点开卡片通过 Bottom Sheet 看详细解释')
  await clickText('关闭弹窗')

  step('⑪ 消息：Agent 通知 / 群聊 / 私聊 / 系统通知')
  await goto('/messages')
  check(await waitForText('Agent 通知', 20000), '⑪ 消息页包含 Agent 通知分类')
  check(await waitForText('群聊与临时房间'), '⑪ 消息页包含群聊与临时房间')
  check(await waitForText('私聊'), '⑪ 消息页包含私聊')
  check(await waitForText('系统通知'), '⑪ 消息页包含系统通知')
  check(await waitForText('一起去现场 Agent'), '⑪ 消息列表展示 Agent 通知会话')
  check(await fitsScreens(1.5), '⑪ 消息页不超过 1.5 屏纵向堆叠')
  await capture('10-messages.png')
  // 同行房间群聊：最后一条消息 / 时间 / 未读数 / 集合状态
  await evaluate(`(() => { const k='sfl.session.v2'; const s=JSON.parse(sessionStorage.getItem(k)); if (s.room) { s.room.createdAt = Date.now(); sessionStorage.setItem(k, JSON.stringify(s)) } return true })()`)
  // 清掉已读与房间快照，模拟「收到房间消息、还没进房间」
  await evaluate(`(() => { const k='sfl.social.v1'; const s=JSON.parse(localStorage.getItem(k) || '{}'); s.read = {}; s.roomChat = {}; localStorage.setItem(k, JSON.stringify(s)); return true })()`)
  await goto('/messages')
  check(await waitForText('夜航计划同行组', 20000), '⑪ 消息列表增加「夜航计划同行组」群聊')
  check(/\d+\/\d+\s*已确认/.test(await bodyText()), '⑪ 群聊行展示集合状态')
  const unreadBefore = await navUnread()
  check(unreadBefore !== '', '⑪ 有房间消息时底部「消息」入口显示未读红点')
  await capture('10-messages.png')
  await clickText('夜航计划同行组')
  check((await currentHash()).includes('/room'), '⑪ 从消息列表点同行组直接进入房间')
  check(await hasElement('[aria-label="返回消息列表"]'), '⑪ 房间顶部保留「‹ 消息」返回')
  check(await waitForText(roomDraft, 10000), '⑪ 再次进入时聊天与位置保持')
  await clickText('返回消息列表')
  check((await currentHash()).includes('/messages'), '⑪ 返回只回到消息列表')
  check(await waitForText('夜航计划同行组'), '⑪ 返回后房间仍在，返回不等于退出同行')
  const unreadAfter = await navUnread()
  check(Number(unreadBefore) - (unreadAfter === '' ? 0 : Number(unreadAfter)) === 1, '⑪ 进过房间后房间未读归零')
  await clickTextAll(['写歌的江离', '私聊'])
  check((await currentHash()).includes('/messages/'), '⑪ 私聊拥有独立聊天室路由')
  check(await hasElement('[aria-label=语音入口]'), '⑪ 聊天室提供语音入口')
  check(await hasElement('textarea'), '⑪ 聊天室提供输入框')
  check(await waitForText('看到我们共同收藏了'), '⑪ 聊天室展示消息气泡')
  await fillTextarea('我已经到场外了，在周边售卖台这边')
  await clickText('发送')
  await sleep(300)
  check((await bodyText()).includes('我已经到场外了'), '⑪ 聊天室可以发送消息')
  await capture('11-chatroom.png')

  step('⑫ Agent 在聊天室给出集合时间 / 地点建议卡片')
  await goto('/messages/agent-notify')
  check(await waitForText('集合时间与地点建议', 10000), '⑫ Agent 以特殊消息卡片给出集合建议')
  check(await waitForText('声浪 Livehouse 静安店'), '⑫ 建议卡片包含集合地点')
  check(await waitForText('采纳这份建议'), '⑫ 建议卡片需要用户确认')
  await capture('12-agent-card.png')

  step('⑬ 我的：头像、音乐画像摘要与六个入口')
  await goto('/me')
  check(await waitForText('音乐画像', 20000), '⑬ 我的页展示音乐画像状态卡')
  const profileText = await bodyText()
  check(profileText.includes('演出') && profileText.includes('匹配') && profileText.includes('同频好友'), '⑬ 我的页展示演出/匹配/同频好友数')
  for (const entry of ['编辑资料', '我的演出', '同频好友', '音乐画像与授权', '隐私与安全', '设置']) {
    check(profileText.includes(entry), `⑬ 我的页包含「${entry}」入口`)
  }
  check(await fitsScreens(1.5), '⑬ 我的页不超过 1.5 屏纵向堆叠')
  await capture('13-profile.png')
  await clickText('音乐画像与授权')
  check((await currentHash()).includes('/me/music'), '⑬ 二级入口拥有独立路由')
  check(await waitForText('已授权的音乐数据', 10000), '⑬ 音乐画像与授权页展示授权项')
  await capture('13b-profile-music.png')
  await goto('/me/agent')
  check(await waitForText('查看 Agent 工作过程', 10000), '⑬ Agent 设置页提供工作过程入口')

  await goto('/showcase')
  check(await waitForText('在开场之前', 20000), '⑭ 展示模式可访问')
  await capture('14-showcase.png')

  step('⑮ 刷新后演示数据仍可恢复')
  await goto('/concert/night-flight/matches')
  check(await waitForText('综合匹配度', 20000), '⑮ 刷新后匹配结果仍能恢复')
  await goto('/concert/night-flight')
  check(await waitForText('回到同行方案'), '⑮ 刷新后演出详情页仍记得已有方案')

  // ============================================================ 评委模式与三个案例
  step('⑯ 评委演示模式：工具轨迹在二级页面')
  await resetDemo()
  check(await setJudge(true), '⑯ 可以开启评委演示模式')
  await goto('/concert/night-flight/running')
  check(await waitForText('还没有开始匹配', 10000), '⑯ 进入进度页不会自动重跑')
  check(await startMatch(), '⑯ 点击「开始匹配」后才运行')
  check(await waitForText('发现同频同行者', 60000), '⑯ 评委模式下跑完进入同频汇合页')
  await goto('/concert/night-flight/running')
  check(await waitForText('查看 Agent 工作过程', 20000), '⑯ 双轨匹配页保留工作过程入口')
  check(await waitForText('评委演示模式'), '⑯ 出现评委模式提示条')
  await clickText('查看 Agent 工作过程')
  check(await waitForText('工具调用步骤', 10000), '⑯ 展开后保留完整工具调用记录')
  check(await waitForText('parse_social_intent'), '⑯ 可以看到真实工具名')
  check(await waitForText('输入：'), '⑯ 可以看到输入摘要')
  check(await waitForText('输出：'), '⑯ 可以看到输出摘要')
  check(await waitForText('ms'), '⑯ 可以看到每步耗时')

  step('⑰ 案例 1：正常匹配成功')
  await resetDemo()
  await setCase('正常匹配成功')
  await goto('/concert/night-flight/running')
  check(await startMatch(), '⑰ 用户点击后开始运行')
  check(await waitForText('案例 1 · 正常匹配成功', 20000), '⑰ 切换到案例 1')
  check(await waitForText('发现同频同行者', 60000), '⑰ 正常案例跑完并产出结果')

  step('⑱ 案例 2：安全条件过滤后无匹配')
  await resetDemo()
  await setCase('安全条件过滤后无匹配')
  await goto('/concert/night-flight/running')
  check(await startMatch(), '⑱ 用户点击后开始运行')
  check(await waitForText('案例 2 · 安全条件过滤后无匹配', 20000), '⑱ 切换到案例 2')
  check(await waitForText('没有符合安全条件的同频搭子', 60000), '⑱ 无匹配时给出明确状态与原因')
  check(await waitForText('不会编造候选人'), '⑱ 明确说明不会编造候选人')
  await goto('/concert/night-flight/matches')
  check(await waitForText('没有符合硬条件的候选人', 20000), '⑱ 匹配结果页展示空结果状态')
  check(await waitForText('修改任务'), '⑱ 空结果提供放宽条件入口')

  step('⑲ 案例 3：大模型不可用走本地 fallback')
  await resetDemo()
  await setCase('大模型不可用走本地 fallback')
  await goto('/concert/night-flight/running')
  check(await startMatch(), '⑲ 用户点击后开始运行')
  check(await waitForText('案例 3 · 大模型不可用走 fallback', 20000), '⑲ 切换到案例 3')
  check(await waitForText('发现同频同行者', 60000), '⑲ fallback 后依然完成匹配')
  await goto('/concert/night-flight/running')
  check(await waitForText('查看 Agent 工作过程', 20000), '⑲ 返回进度页仍可打开工作过程')
  await clickText('查看 Agent 工作过程')
  check(await waitForText('本次演示指定', 10000), '⑲ 二级页面明确标记本次为 fallback 解析')

  step('⑳ 加载状态')
  await resetDemo()
  await setScenario('载入较慢')
  await goto('/concert/night-flight/running')
  check(await startMatch(), '⑳ 用户点击后开始运行')
  check(await waitForElement('[aria-label="匹配阶段"]'), '⑳ 弱网下展示匹配轨道进度')
  check(await waitForText('发现同频同行者', 90000), '⑳ 加载结束后仍能给出结果')

  step('㉑ 错误状态')
  // 「网络异常」是前端 Demo 场景注入的失败，只在 Demo 模拟 Agent 下触发。
  // 为了让「可恢复错误状态」在任何后端配置下都被真实验证，这里临时切到 Demo 模拟 Agent，步骤结束后恢复原模式。
  const savedAgentMode = await evaluate("localStorage.getItem('sfl.agentMode.v1') || ''")
  await evaluate("localStorage.setItem('sfl.agentMode.v1','mock')")
  await goto('/')
  await resetDemo()
  await setScenario('网络异常')
  await goto('/concert/night-flight/running')
  check(await startMatch(), '㉑ 用户点击后开始运行')
  check(await waitForText('这次同频中断了', 30000), '㉑ 模型/网络异常时给出明确错误状态')
  check(await waitForText('重新运行'), '㉑ 错误状态提供重新运行入口')
  check(await waitForText('返回修改需求'), '㉑ 错误状态提供返回修改需求入口')
  // 错误状态截图也按 390×844 采集，避免出现整页滚动条与裁切
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await sleep(350)
  check(await fitsScreens(1.2), '㉑ 错误状态在 390×844 下不超过 1.2 屏')
  await capture('05e-agent-error.png')
  await goto('/concert/night-flight/matches')
  check(await waitForText('匹配失败', 20000), '㉑ 匹配结果页同步展示错误状态')
  check(await waitForText('重新运行'), '㉑ 错误状态提供重新匹配入口')
  // 恢复进入本步骤前的 Agent 运行模式
  await evaluate(savedAgentMode
    ? 'localStorage.setItem("sfl.agentMode.v1","' + savedAgentMode + '")'
    : 'localStorage.removeItem("sfl.agentMode.v1")')
  await goto('/')

  step('㉒ 恢复默认')
  await resetDemo()
  await setCase('正常匹配成功')
  await setScenario('正常流程')
  check(await setJudge(false), '㉒ 可以关闭评委演示模式')
  await goto('/concert/night-flight/running')
  check(await startMatch(), '㉒ 用户点击后开始运行')
  check(await waitForText('发现同频同行者', 60000), '㉒ 恢复默认后 Agent 仍能跑完并停在同频汇合页')
  check(!(await bodyText()).includes('评委演示模式'), '㉒ 关闭评委模式后不再显示技术日志提示条')

  const finalText = await bodyText()
  check(finalText.includes('Demo') || finalText.includes('演示'), '页面明确标注 Demo 数据')
  check(!finalText.includes('TypeError') && !finalText.includes('Uncaught'), '页面没有运行时错误')

  socket.close()
  socket = undefined
} catch (error) {
  failures += 1
  console.log('  FAIL  端到端冒烟测试异常：' + error.message)
} finally {
  if (socket) socket.close()
  if (chrome) chrome.kill()
  await sleep(500)
  rmSync(profile, { recursive: true, force: true })
}

console.log('')
if (failures > 0) {
  console.log('端到端冒烟测试未通过：' + failures + ' 项失败')
  process.exit(1)
} else {
  console.log('核心演示路径全部可点击通过')
  process.exit(0)
}
