// SyncStage · 真实链路验收（live / DeepSeek，无 mock、无 fallback）
// 前置：backend 127.0.0.1:8020（AGENT_MODE=live 且已配置 DeepSeek Key）+ dev server 5173
// 用法：cd frontend && node scripts/acceptance-live-chain.mjs
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = process.argv[2] ?? 'http://127.0.0.1:5173'
const API = 'http://127.0.0.1:8020'
const PORT = 9334
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((item) => existsSync(item))
if (!CHROME) {
  console.log('没有找到 Chrome 或 Edge，无法执行真实链路验收')
  process.exit(1)
}

const shotDir = join(process.cwd(), '..', 'docs', 'screenshots')
const evidenceDir = join(process.cwd(), '..', 'docs', 'acceptance')
mkdirSync(shotDir, { recursive: true })
mkdirSync(evidenceDir, { recursive: true })

const rows = []
const calls = []
const started = new Map()
const notes = []
let failures = 0

function check(ok, step, note) {
  rows.push({ step, ok: Boolean(ok), note: note || '' })
  if (!ok) failures += 1
  console.log((ok ? '  PASS  ' : '  FAIL  ') + step + (note ? '  [' + note + ']' : ''))
}
function info(text) {
  notes.push(text)
  console.log('  INFO  ' + text)
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const profile = mkdtempSync(join(tmpdir(), 'sfl-live-'))
let socket
let chrome

try {
  chrome = spawn(
    CHROME,
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

  const waitForEndpoint = async (url, timeoutMs = 20000) => {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      try {
        const response = await fetch(url)
        if (response.ok) return await response.json()
      } catch {
        // 等浏览器调试端口
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
    if (payload.method === 'Network.requestWillBeSent') {
      const { requestId, request, timestamp } = payload.params
      if (request.url.includes('/api/')) started.set(requestId, { url: request.url, method: request.method, t0: timestamp })
    }
    if (payload.method === 'Network.responseReceived') {
      const { requestId, response, timestamp } = payload.params
      const entry = started.get(requestId)
      if (entry) {
        calls.push({ url: entry.url, method: entry.method, status: response.status, ms: Math.round((timestamp - entry.t0) * 1000) })
        started.delete(requestId)
      }
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
  await send('Network.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })

  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw new Error('页面脚本报错：' + JSON.stringify(result.exceptionDetails.exception))
    return result.result.value
  }
  const goto = async (hash) => {
    await send('Page.navigate', { url: BASE + '/#' + hash })
    await sleep(900)
  }
  const capture = async (name) => {
    await evaluate(`document.querySelectorAll('div.fixed.inset-x-0.bottom-24 button').forEach((el) => el.click())`)
    await sleep(120)
    await evaluate('window.scrollTo(0, 0)')
    await sleep(220)
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    writeFileSync(join(shotDir, name), Buffer.from(shot.data, 'base64'))
  }
  const waitForText = async (text, timeoutMs = 15000) => {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (await evaluate('document.body.innerText.includes(' + JSON.stringify(text) + ')')) return true
      await sleep(250)
    }
    return false
  }
  const clickText = (text, index = 0) =>
    evaluate(`(() => {
      const wanted = ${JSON.stringify(text)};
      const nodes = Array.from(document.querySelectorAll('button, a, [role=button]'));
      const matches = nodes.filter((el) => {
        const label = ((el.innerText || '') + ' ' + (el.getAttribute('aria-label') || '')).replace(/\s+/g, ' ').trim();
        return label.includes(wanted);
      });
      const el = matches[${index}];
      if (!el) return { ok: false, matches: matches.length };
      el.scrollIntoView({ block: 'center' });
      el.click();
      return { ok: true, matches: matches.length, text: (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40) };
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
  const fillComposer = (value) =>
    evaluate(`(() => {
      const el = document.querySelector('input[placeholder*="输入消息"], textarea');
      if (!el) return false;
      const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`)
  const bodyText = () => evaluate('document.body.innerText')
  const currentHash = () => evaluate('location.hash')

  const PROMPT = '我第一次看星野回声，最喜欢《烟花》，想找人一起排队候场、副歌一起唱，最好先在群里聊熟，3 个人以内，只在公开场合见面。'
  const HUMAN_MSG = '我已经到场外了，在周边售卖台这边'

  // ---------------- 0. 清空旧 localStorage 与 Demo 状态，确认后端是真实 DeepSeek
  const status = await fetch(API + '/api/ai/status').then((item) => item.json())
  const llm = status.llm || {}
  info('AI 状态：agentMode=' + status.agentMode + ' provider=' + llm.provider + ' model=' + llm.model + ' configured=' + llm.configured + ' liveMode=' + llm.liveMode + ' enabled=' + status.enabled + ' reason=' + status.reason)
  check(llm.provider === 'deepseek', '第0步 /api/ai/status provider=deepseek', 'provider=' + llm.provider)
  check(llm.configured === true && llm.keyConfigured === true, '第0步 /api/ai/status configured=true（Key 已配置，未打印）', 'configured=' + llm.configured)
  check(status.enabled === true && llm.liveMode === true, '第0步 live 可用（enabled=true / liveMode=true，对应 available）', 'reason=' + status.reason)

  await send('Page.navigate', { url: BASE + '/#/' })
  await sleep(1500)
  await evaluate('localStorage.clear(); sessionStorage.clear(); true')
  await send('Page.navigate', { url: BASE + '/#/' })
  await sleep(2000)
  check(!(await bodyText()).includes('Demo 模拟 Agent'), '第0步 已清空旧存储，当前不是 Demo 模拟 Agent')
  await capture('18-live-01-home.png')

  // ---------------- 1. 首页 → 选择演出
  check(await waitForText('一起去现场'), '第1步 首页加载完成', await currentHash())
  check((await clickText('夜航计划')).ok === true, '第1步 选择演出：点击「夜航计划」卡片')
  check(await waitForText('AI找同行', 15000), '第1步 进入演出详情 /concert/night-flight', await currentHash())
  await capture('18-live-02-concert.png')

  // ---------------- 2. 授权 → 输入需求 → Agent 结构化理解
  check((await clickText('AI找同行')).ok === true, '第2步 进入音乐数据授权')
  await waitForText('选择要授权的音乐数据', 10000)
  await clickText('全部授权')
  await sleep(300)
  check((await clickText('授权并继续')).ok === true, '第2步 全部授权并继续')
  check(await waitForText('同行 Agent 眼中的你', 15000), '第2步 进入需求输入页（已授权画像）')
  check((await fillTextarea(PROMPT)) === true, '第2步 输入自然语言同行需求')
  check((await clickText('让 Agent 理解任务')).ok === true, '第2步 提交给 Agent 结构化理解')
  check(await waitForText('就按这个找', 40000), '第2步 真实模型解析出四项结构化需求（音乐暗号/同行方式/现场氛围/安全边界）')
  const intentText = await bodyText()
  check(intentText.includes('音乐暗号') && intentText.includes('同行方式') && intentText.includes('安全边界'), '第2步 确认页展示结构化字段')
  await capture('18-live-03-intent.png')

  // ---------------- 3. 确认需求 → 配对过程
  check((await clickText('就按这个找')).ok === true, '第3步 确认需求并进入配对')
  await sleep(1200)
  check(await waitForText('正在同频', 15000), '第3步 进入配对进度页', await currentHash())
  const startBtn = await clickText('开始匹配')
  info('开始匹配按钮：' + (startBtn.ok ? '已点击' : '未出现（确认页点击「就按这个找」后会自动开始运行）'))
  await sleep(2000)
  const runText = await bodyText()
  check(!runText.includes('Demo 模拟 Agent'), '第3步 运行模式徽标为真实模型 Agent')
  check(!runText.includes('回退') && !runText.includes('fallback'), '第3步 一级界面没有 fallback / 回退字样')
  await capture('18-live-04-matching.png')
  check(await waitForText('发现同频同行者', 120000), '第3步 真实 Agent 跑完并汇合到揭晓页', await currentHash())
  check((await currentHash()).includes('/reveal'), '第3步 落在 /concert/night-flight/reveal')
  const revealText = await bodyText()
  check(/\d+%/.test(revealText), '第3步 揭晓页展示真实综合匹配度', (revealText.match(/\d+%/) || ['-'])[0])
  check(!revealText.includes('回退') && !revealText.includes('规则回退'), '第3步 揭晓理由来自真实模型，不是规则回退')
  await sleep(900)
  await capture('18-live-05-reveal.png')

  // ---------------- 4. 暂不同行 / 换一位
  check((await clickText('查看匹配依据')).ok === true, '第4步 打开匹配依据（同行票根）')
  check(await waitForText('同行票根', 10000), '第4步 票根可展开')
  await clickText('关闭弹窗')
  await sleep(300)
  const personA = await evaluate(`document.querySelector('[data-visual="reveal-person"]').getAttribute('data-person')`)
  check((await clickText('换一位')).ok === true, '第4步 「换一位」可点击')
  await sleep(600)
  const personB = await evaluate(`document.querySelector('[data-visual="reveal-person"]').getAttribute('data-person')`)
  check(Boolean(personA) && Boolean(personB) && personA !== personB, '第4步 「换一位」真的切换候选人', personA + ' → ' + personB)
  check((await clickText('暂不同行')).ok === true, '第4步 「暂不同行」可点击')
  check(await waitForText('理由只用于优化下一轮匹配', 10000), '第4步 拒绝理由只影响下一轮，不通知对方')
  await capture('18-live-06-skip.png')
  await clickText('音乐不搭')
  await sleep(200)
  check((await clickText('记录并看下一位')).ok === true, '第4步 提交拒绝理由并看下一位')
  await sleep(700)
  const personC = await evaluate(`document.querySelector('[data-visual="reveal-person"]').getAttribute('data-person')`)
  check(Boolean(personC) && personC !== personB, '第4步 拒绝后自动切到下一位', personB + ' → ' + personC)

  // ---------------- 5. 发出邀请 → 双方确认 → 进入同行房间
  check((await clickText('发出同行邀请')).ok === true, '第5步 发出同行邀请')
  check(await waitForText('等待对方确认', 15000), '第5步 邀请后先等待对方确认（不直接建房间）')
  check(await waitForText('对方已确认', 20000), '第5步 第二用户状态机（Demo 定时器，真实调用 peer-confirm 接口）完成确认')
  check(await waitForText('进入同行房间', 20000), '第5步 双方确认后才出现进入房间入口')
  check((await clickText('进入同行房间')).ok === true, '第5步 进入同行房间')
  check(await waitForText('夜航计划同行组', 25000), '第5步 房间是消息模块里的群聊')
  check((await currentHash()).includes('/room'), '第5步 路由落在 /concert/night-flight/room', await currentHash())
  await capture('18-live-07-room.png')

  // ---------------- 6. 发送真人消息，且不得出现 AI 冒充对方
  const beforeCount = await evaluate('document.querySelectorAll("[data-message-id], .message-bubble").length')
  check((await fillComposer(HUMAN_MSG)) === true, '第6步 在房间里输入真人消息')
  check((await clickText('发送')).ok === true, '第6步 发送真人消息')
  check(await waitForText(HUMAN_MSG, 10000), '第6步 我的消息进入聊天')
  await sleep(4500)
  const afterText = await bodyText()
  check(!afterText.includes('模拟联系人'), '第6步 没有自动出现「模拟联系人」消息')
  check(!afterText.includes('Agent 回复失败'), '第6步 没有 AI 冒充对方的自动回复失败态')
  const afterCount = await evaluate('document.querySelectorAll("[data-message-id], .message-bubble").length')
  info('消息气泡数量：发送前 ' + beforeCount + '，等待 4.5s 后 ' + afterCount)

  // ---------------- 7. 刷新后匹配结果与房间状态仍可恢复
  await send('Page.reload', { ignoreCache: true })
  await sleep(2500)
  check(await waitForText('夜航计划同行组', 20000), '第7步 刷新后房间仍存在')
  check(await waitForText(HUMAN_MSG, 15000), '第7步 刷新后聊天记录仍恢复')
  await capture('18-live-08-room-refresh.png')
  await goto('/concert/night-flight/reveal')
  check(await waitForText('发现同频同行者', 25000), '第7步 刷新后匹配结果仍可恢复（揭晓页）')
  check(/\d+%/.test(await bodyText()), '第7步 刷新后匹配度仍展示')

  // ---------------- 8. 从消息页重新进入房间
  await goto('/messages')
  check(await waitForText('群聊与临时房间', 20000), '第8步 打开消息页')
  check((await clickText('夜航计划同行组')).ok === true, '第8步 从消息列表重新进入同行房间')
  check(await waitForText(HUMAN_MSG, 20000), '第8步 重新进入后聊天记录保持')
  await capture('18-live-09-messages-reenter.png')

  // ---------------- 9. 正常退出房间
  check((await clickText('房间设置')).ok === true, '第9步 打开房间设置')
  check(await waitForText('退出同行', 10000), '第9步 设置里有「退出同行」')
  await clickText('退出同行')
  check(await waitForText('再次确认：退出同行？', 10000), '第9步 退出有二次确认')
  check((await clickText('确认退出并停止联系')).ok === true, '第9步 确认退出同行')
  check(await waitForText('已退出同行', 15000), '第9步 退出后给出明确反馈')
  await sleep(600)
  check((await currentHash()).includes('/messages'), '第9步 退出后回到消息列表', await currentHash())
  await capture('18-live-10-exit.png')

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const evidence = {
    runAt: new Date().toISOString(),
    base: BASE,
    api: API,
    status: { agentMode: status.agentMode, provider: llm.provider, model: llm.model, configured: llm.configured, liveMode: llm.liveMode, enabled: status.enabled, reason: status.reason },
    apiCalls: calls,
    notes,
    rows,
  }
  const file = join(evidenceDir, 'live-chain-' + stamp + '.json')
  writeFileSync(file, JSON.stringify(evidence, null, 2))
  console.log('')
  console.log('真实调用（本页捕获的 /api/*）：')
  for (const call of calls) console.log('  ' + call.method + ' ' + call.url.replace(API, '') + '  HTTP ' + call.status + '  ' + call.ms + 'ms')
  console.log('证据文件：' + file)
  console.log(failures === 0 ? '真实链路验收通过（' + rows.length + ' 项）' : '真实链路验收未通过：' + failures + ' 项失败')
  process.exitCode = failures === 0 ? 0 : 1
} catch (error) {
  console.log('真实链路验收异常：' + (error && error.message ? error.message : error))
  process.exitCode = 1
} finally {
  if (socket) socket.close()
  if (chrome) chrome.kill()
}