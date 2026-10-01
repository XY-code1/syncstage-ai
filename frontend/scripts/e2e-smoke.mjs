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
let chrome
let socket

function check(condition, label) {
  if (condition) {
    console.log('  PASS  ' + label)
  } else {
    failures += 1
    console.log('  FAIL  ' + label)
  }
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
    await evaluate('window.scrollTo(0, 0)')
    await sleep(250)
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    writeFileSync(join(screenshotDir, name), Buffer.from(shot.data, 'base64'))
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
  const tapTargetsOk = (minWidth = 120, minHeight = 44) => evaluate(`(() => {
    const nodes = [...document.querySelectorAll('main button, nav button, footer button')];
    return nodes.filter((el) => { const r = el.getBoundingClientRect(); return r.width >= ${minWidth} && r.height > 0 && r.bottom > 0 && r.top < innerHeight; })
      .every((el) => el.getBoundingClientRect().height >= ${minHeight});
  })()`)
  const noHorizontalOverflow = () => evaluate('document.documentElement.scrollWidth <= innerWidth')
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
    const clicked = await clickText('打开演示控制台')
    await sleep(300)
    return clicked
  }

  async function closeConsole() {
    await sleep(150)
    return clickText('关闭弹窗')
  }

  async function resetDemo() {
    await openConsole()
    const clicked = await clickText('重置演示数据并回到首页')
    return clicked.ok === true
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
  check(await waitForText('正在匹配的演出'), '① 首页直接给出演出入口')
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
  check(await fitsScreens(1.5), '① 首页不超过 1.5 屏纵向堆叠')
  check(await tapTargetsOk(), '① 首页主点击区高度合格')
  check(await mobileButtonVisible('找同频搭子'), '① 首页主入口按钮无遮挡')
  await capture('00-home.png')
  await clickText('夜航计划')
  check(await waitForText('AI找同行'), '① 点击演出进入独立详情路由')
  check((await currentHash()).includes('/concert/night-flight'), '① 演出详情路由正确')
  check(await mobileButtonVisible('AI找同行'), '① 移动端主入口按钮无遮挡')
  check(
    await waitForText('本作品为参赛概念Demo'),
    '① 明确说明未接入官方 API、当前使用脱敏 Demo 数据',
  )
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
  check(await waitForText('确认需求，执行 Agent 任务', 20000), '④ 同页展示结构化意图确认')
  check(await mobileButtonVisible('确认需求，执行 Agent 任务'), '④ 移动端执行按钮无遮挡')
  const intentText = await bodyText()
  check(intentText.includes('组队人数') || intentText.includes('人数'), '④ 确认页展示解析出的组队人数')
  check(intentText.includes('安全'), '④ 确认页展示解析出的安全偏好')
  await capture('03-agent-intent.png')

  step('⑤ Agent 执行页：四阶段进度 → 自动进入匹配结果')
  await clickText('确认需求，执行 Agent 任务')
  check(await waitForText('理解需求', 20000), '⑤ 执行页展示「理解需求」阶段')
  check(await waitForText('寻找同场用户'), '⑤ 执行页展示「寻找同场用户」阶段')
  check(await waitForText('计算同频度'), '⑤ 执行页展示「计算同频度」阶段')
  check(await waitForText('生成组队方案'), '⑤ 执行页展示「生成组队方案」阶段')
  check(await waitForText('Demo 模拟 Agent'), '⑤ 明确标注当前是 Demo 模拟 Agent')
  check(!(await bodyText()).includes('parse_social_intent'), '⑤ 一级进度页不再直接铺工具调用日志')
  await capture('04a-agent-running.png')
  check(await waitForText('综合匹配度', 60000), '⑤ Mock 跑完自动跳转匹配结果页')
  check((await currentHash()).includes('/matches'), '⑤ 完成后落在 /concert/:id/matches')
  const resultText = await bodyText()
  check(/位同场候选人/.test(resultText) || resultText.includes('综合匹配度'), '⑤ 结果页展示候选人列表')
  await goto('/concert/night-flight/running')
  check(await waitForText('查看匹配结果', 20000), '⑤ 返回进度页仍能看到结果摘要与入口')
  const summaryText = await bodyText()
  check(summaryText.includes('匹配理由：'), '⑤ 摘要包含 Top Match 的匹配理由')
  check(summaryText.includes('共同演出：'), '⑤ 摘要包含共同演出')
  check(/位同频候选人/.test(summaryText), '⑤ 摘要包含候选人数')
  check(await fitsScreens(1.5), '⑤ 执行页不超过 1.5 屏纵向堆叠')
  await capture('04b-agent-result.png')
  await clickText('查看 Agent 工作过程')
  check((await currentHash()).includes('/trace'), '⑤ 工具调用记录移动到二级页面')
  check(await waitForText('工具调用步骤', 10000), '⑤ 二级页面保留全部工具调用记录')
  const traceText = await bodyText()
  check(traceText.includes('parse_social_intent'), '⑤ 二级页面可以看到真实工具名')
  check(traceText.includes('阶段：'), '⑤ 二级页面标注每个工具所属阶段')
  check(traceText.includes('输入：') && traceText.includes('输出：'), '⑤ 二级页面保留输入输出摘要')
  check(traceText.includes('ms'), '⑤ 二级页面保留每步耗时')
  await capture('04c-agent-trace.png')
  await goto('/concert/night-flight/running')
  check(await waitForText('查看匹配结果', 20000), '⑤ 返回进度页仍能看到结果入口')
  await clickText('查看匹配结果')
  await sleep(400)
  check((await currentHash()).includes('/matches'), '⑤ 从进度页进入匹配列表')

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
  await waitForText('模拟对方确认', 10000)
  await clickText('模拟对方确认')
  check(await waitForText('创建临时群聊', 10000), '⑧ 双方确认后允许创建群聊')
  await clickText('创建临时群聊')
  check(await waitForText('双向确认状态', 20000), '⑨ 房间展示双向确认状态')
  check(await waitForText('公开集合点'), '⑨ 房间展示公开集合点')
  check(await waitForText('真人临时群聊'), '⑨ 全部确认后开放真人临时群聊')
  check(await waitForText('木那啦啦'), '⑨ 展示预置真人聊天')
  check(await waitForText('同行Agent已完成安全条件核对'), '⑨ 展示系统安全提示')
  check(await waitForText('候场任务'), '⑨ 房间展示候场任务')
  check(await waitForText('AI破冰'), '⑨ 输入栏提供 AI 破冰辅助')
  check(await evaluate(`(() => { const el=document.querySelector('input[placeholder="输入消息……"]'); if(!el) return false; el.scrollIntoView({block:'center'}); const r=el.getBoundingClientRect(); return r.width>80 && r.height>=32 && r.left>=0 && r.right<=innerWidth && r.top>=0 && r.bottom<=innerHeight; })()`), '⑨ 390×844 输入栏无遮挡')
  check(await waitForText('24 小时后自动归档'), '⑨ 房间展示自动归档提示')
  check(await waitForText('退出房间'), '⑨ 房间提供退出入口')
  const beforeIce = await evaluate("document.querySelector('[aria-label=\"临时群聊消息\"]')?.children.length || 0")
  await clickText('AI破冰')
  check(await evaluate("document.querySelector('input[placeholder=\"输入消息……\"]')?.value.length > 0"), '⑨ AI 破冰只填入输入框')
  check((await evaluate("document.querySelector('[aria-label=\"临时群聊消息\"]')?.children.length || 0")) === beforeIce, '⑨ AI 破冰不会自动发送')
  await clickText('发送')
  check((await evaluate("document.querySelector('[aria-label=\"临时群聊消息\"]')?.children.length || 0")) === beforeIce + 1, '⑨ 全部确认后本地发送会改变消息状态')
  await clickText('屏蔽成员')
  check(!(await evaluate("document.querySelector('[aria-label=\"临时群聊消息\"]')?.innerText.includes('我大概18:40到')")), '⑨ 屏蔽后不再显示对应成员消息')
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
  await clickText('写歌的江离')
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
  check(await waitForText('综合匹配度', 60000), '⑯ 评委模式下跑完自动进入匹配结果')
  await goto('/concert/night-flight/running')
  check(await waitForText('查看 Agent 工作过程', 20000), '⑯ 进度页保留四阶段与工作过程入口')
  check(await waitForText('评委演示模式'), '⑯ 出现评委模式提示条')
  await clickText('查看 Agent 工作过程')
  check(await waitForText('工具调用步骤', 10000), '⑯ 二级页面保留完整工具调用记录')
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
  check(await waitForText('综合匹配度', 60000), '⑰ 正常案例跑完并产出结果')

  step('⑱ 案例 2：安全条件过滤后无匹配')
  await resetDemo()
  await setCase('安全条件过滤后无匹配')
  await goto('/concert/night-flight/running')
  check(await startMatch(), '⑱ 用户点击后开始运行')
  check(await waitForText('案例 2 · 安全条件过滤后无匹配', 20000), '⑱ 切换到案例 2')
  check(await waitForText('为什么一个人都没匹配到', 60000), '⑱ 无匹配时给出明确状态与原因')
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
  check(await waitForText('综合匹配度', 60000), '⑲ fallback 后依然完成匹配')
  await goto('/concert/night-flight/running')
  check(await waitForText('查看 Agent 工作过程', 20000), '⑲ 返回进度页仍可打开工作过程')
  await clickText('查看 Agent 工作过程')
  check(await waitForText('本次演示指定', 10000), '⑲ 二级页面明确标记本次为 fallback 解析')

  step('⑳ 加载状态')
  await resetDemo()
  await setScenario('载入较慢')
  await goto('/concert/night-flight/running')
  check(await startMatch(), '⑳ 用户点击后开始运行')
  check(await waitForText('已用', 15000), '⑳ 弱网下展示加载进度')
  check(await waitForText('综合匹配度', 90000), '⑳ 加载结束后仍能给出结果')

  step('㉑ 错误状态')
  await resetDemo()
  await setScenario('网络异常')
  await goto('/concert/night-flight/running')
  check(await startMatch(), '㉑ 用户点击后开始运行')
  check(await waitForText('Agent 执行中断', 30000), '㉑ 模型/网络异常时给出明确错误状态')
  check(await waitForText('重新运行'), '㉑ 错误状态提供重新运行入口')
  check(await waitForText('返回修改需求'), '㉑ 错误状态提供返回修改需求入口')
  await goto('/concert/night-flight/matches')
  check(await waitForText('匹配失败', 20000), '㉑ 匹配结果页同步展示错误状态')
  check(await waitForText('重新运行'), '㉑ 错误状态提供重新匹配入口')

  step('㉒ 恢复默认')
  await resetDemo()
  await setCase('正常匹配成功')
  await setScenario('正常流程')
  check(await setJudge(false), '㉒ 可以关闭评委演示模式')
  await goto('/concert/night-flight/running')
  check(await startMatch(), '㉒ 用户点击后开始运行')
  check(await waitForText('综合匹配度', 60000), '㉒ 恢复默认后 Agent 仍能跑完并停在匹配结果页')
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



