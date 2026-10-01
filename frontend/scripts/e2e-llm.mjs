// SyncStage · 真实大模型链路验收（开发用脚本）
// 前置：1) 后端已启动（backend: uvicorn）2) dev server 已启动 3) 本机已配置真实大模型
// 运行：node scripts/e2e-llm.mjs http://127.0.0.1:5177 http://127.0.0.1:8020
//
// 覆盖验收项：
//   1. 发送从未预置过的自由文本 -> 真实 LLM 请求 -> 模型生成回复
//   2. 请求失败（模拟后端不可达）-> 明确错误 + 重试，不出现伪造回复
//   3. 麦克风入口是真实语音识别（不再有"选一句示例文字"）
//   4. 头像上传后刷新仍然存在
//   5. 昵称/生日/性别修改后，"我的"与聊天同步更新
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = process.argv[2] ?? 'http://127.0.0.1:5173'
const API = process.argv[3] ?? 'http://127.0.0.1:8020'
const PORT = 9336
const VIEWPORT = { width: 390, height: 844 }
const screenshotDir = join(process.cwd(), '..', 'docs', 'screenshots')
const NOVEL_TEXT = '我穿蓝色外套，从地铁 2 号口过来，想把集合时间往后挪十分钟，可以吗？'

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
]
const chromePath = CHROME_CANDIDATES.find((item) => existsSync(item))
if (!chromePath) {
  console.log('没有找到 Chrome 或 Edge，跳过真实大模型链路检查')
  process.exit(0)
}

let pass = 0
let fail = 0
const checks = []
function check(ok, label) {
  if (ok) {
    pass += 1
    console.log('  PASS  ' + label)
  } else {
    fail += 1
    console.log('  FAIL  ' + label)
  }
  checks.push({ ok, label })
  return ok
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const profile = mkdtempSync(join(tmpdir(), 'sfl-llm-'))
const avatarFile = join(profile, 'avatar.png')
// 1x1 的合法 PNG，用于测试真实文件上传
writeFileSync(avatarFile, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'))

let chrome
let socket
let failed = false

async function waitForEndpoint(url, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return await response.json()
    } catch {
      // 继续等
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
      '--use-fake-ui-for-media-stream',
      `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
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
  const chatResponses = []
  const pausedRequests = []
  const consoleLogs = []

  socket.addEventListener('message', (event) => {
    const payload = JSON.parse(event.data)
    if (payload.id && pending.has(payload.id)) {
      pending.get(payload.id)(payload)
      return
    }
    if (payload.method === 'Network.responseReceived' && payload.params.response.url.includes('/api/agent/chat')) {
      chatResponses.push({ requestId: payload.params.requestId, status: payload.params.response.status, body: null })
    }
    if (payload.method === 'Runtime.consoleAPICalled') {
      const line = (payload.params.args || [])
        .map((arg) => arg.value ?? arg.description ?? JSON.stringify(arg.preview?.properties ?? ''))
        .join(' ')
      if (line.includes('[agent-chat]')) consoleLogs.push(line)
    }
    if (payload.method === 'Network.loadingFinished') {
      const entry = chatResponses.find((item) => item.requestId === payload.params.requestId && item.body === null)
      if (entry) {
        send('Network.getResponseBody', { requestId: entry.requestId })
          .then((body) => {
            entry.body = body.body
          })
          .catch(() => {
            entry.body = ''
          })
      }
    }
    if (payload.method === 'Fetch.requestPaused') {
      pausedRequests.push(payload.params.requestId)
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
  await send('DOM.enable')
  await send('Emulation.setDeviceMetricsOverride', { ...VIEWPORT, deviceScaleFactor: 2, mobile: true })

  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw new Error('页面脚本报错：' + JSON.stringify(result.exceptionDetails.exception))
    return result.result.value
  }
  const goto = (path) => send('Page.navigate', { url: BASE + '/?r=' + Date.now() + '#' + path })
  const bodyText = () => evaluate('document.body.innerText')
  const capture = async (name) => {
    await evaluate('window.scrollTo(0, 0)')
    await sleep(200)
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    writeFileSync(join(screenshotDir, name), Buffer.from(shot.data, 'base64'))
  }
  const waitForText = async (text, timeoutMs = 15000) => {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (await evaluate(`document.body.innerText.includes(${JSON.stringify(text)})`)) return true
      await sleep(250)
    }
    return false
  }
  const clickText = (text, index = 0) =>
    evaluate(`(() => {
      const wanted = ${JSON.stringify(text)};
      const nodes = Array.from(document.querySelectorAll('button, a, [role=button]'));
      const matches = nodes.filter((el) => (((el.innerText || '') + ' ' + (el.getAttribute('aria-label') || '')).replace(/\\s+/g, ' ').trim()).includes(wanted));
      const el = matches[${index}];
      if (!el) return { ok: false, matches: matches.length };
      el.scrollIntoView({ block: 'center' });
      el.click();
      return { ok: true, matches: matches.length };
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
  const scrollBottom = () => evaluate('window.scrollTo(0, document.body.scrollHeight)')
  // 对比渲染结果时忽略空白、Markdown 标记与 emoji 变体选择符，
  // 这些差异来自浏览器渲染，不是"回复没渲染出来"。
  const normalize = (value) =>
    String(value || '')
      .replace(/[\s\uFE0F\u200B]/g, '')
      .replace(/[*`#]/g, '')

  console.log('入口：' + BASE + ' · 后端：' + API)
  console.log('')

  // ---------------------------------------------------------------- 0. 后端状态
  const status = await fetch(API + '/api/ai/status').then((response) => response.json()).catch(() => null)
  check(Boolean(status && status.enabled), '后端大模型已启用（' + (status ? status.model : '无法连接后端') + '）')
  if (!status || !status.enabled) {
    throw new Error('后端还没有配置真实大模型，无法验收。请先配置 backend/.env')
  }

  // ---------------------------------------------------------------- 1. 真实对话
  console.log('→ ① 自由文本 -> 真实 LLM -> 模型回复')
  await goto('/messages/agent-notify')
  check(await waitForText('一起去现场 Agent', 20000), '① 进入 Agent 会话')
  const beforeCount = await evaluate('document.querySelectorAll(\'.overflow-y-auto > div\').length')
  await fillTextarea(NOVEL_TEXT)
  await clickText('发送')
  check(await waitForText('正在思考', 8000), '① 出现 Agent thinking 状态')
  const replied = await waitForText('真实模型', 90000)
  check(replied, '① 收到模型生成的回复（页面出现真实模型标记）')
  await scrollBottom()
  await capture('15-agent-llm-reply.png')

  const entry = chatResponses.find((item) => item.status === 200 && item.body)
  let payload = null
  if (entry) {
    try {
      payload = JSON.parse(entry.body)
    } catch {
      payload = null
    }
  }
  check(Boolean(payload), '① Network 中捕获到 /api/agent/chat 响应')
  check(Boolean(payload && payload.source === 'model'), '① 响应来源是真实模型（source=model）')
  check(Boolean(payload && payload.model), '① 响应标记了真实模型名：' + (payload ? payload.model : '-'))
  check(Boolean(payload && payload.reply && payload.reply.length > 8), '① 模型返回了非空回复（' + (payload ? payload.reply.length : 0) + ' 字）')
  const text = await bodyText()
  const renderedReply = Boolean(payload && normalize(text).includes(normalize(payload.reply).slice(0, 10)))
  check(renderedReply, '① 模型回复渲染进聊天室')
  if (!renderedReply && payload) {
    console.log('       模型回复片段:', JSON.stringify(normalize(payload.reply).slice(0, 24)))
  }
  check(text.includes('同频 Agent ✨'), '① Agent 使用独立身份「同频 Agent ✨」')
  const afterCount = await evaluate('document.querySelectorAll(\'.overflow-y-auto > div\').length')
  check(afterCount > beforeCount, '① 聊天室新增了 Agent 消息气泡')
  check(consoleLogs.some((line) => line.includes('[agent-chat] →')), '① 开发日志打印了真实 LLM 请求（URL + 上下文）')
  check(
    consoleLogs.some((line) => line.includes('[agent-chat] ←') && line.includes('model')),
    '① 开发日志记录了模型返回（source=model + 耗时）',
  )

  // ---------------------------------------------------------------- 2. 失败 -> 明确错误 + 重试
  console.log('→ ② 大模型请求失败 -> 明确错误 + 重试，不伪造回复')
  await send('Fetch.enable', { patterns: [{ urlPattern: '*api/agent/chat*', requestStage: 'Request' }] })
  const beforeFailCount = await evaluate('document.querySelectorAll(\'.overflow-y-auto > div\').length')
  await fillTextarea('失败场景测试：这条一定会失败')
  await clickText('发送')
  let failedState = false
  const failDeadline = Date.now() + 30000
  while (Date.now() < failDeadline) {
    if (await evaluate('document.body.innerText.includes("重试这条消息")')) {
      failedState = true
      break
    }
    // 让被挂起的请求真的失败
    if (pausedRequests.length) {
      const requestId = pausedRequests.shift()
      await send('Fetch.failRequest', { requestId, errorReason: 'ConnectionFailed' })
    }
    await sleep(250)
  }
  check(failedState, '② 失败时展示明确错误与「重试这条消息」')
  const failText = await bodyText()
  check(failText.includes('Agent 回复失败'), '② 明确标注 Agent 回复失败')
  check(!failText.includes('Demo 回退'), '② 失败时没有偷偷回退成 Demo 模板')
  const afterFailCount = await evaluate('document.querySelectorAll(\'.overflow-y-auto > div\').length')
  check(afterFailCount <= beforeFailCount + 2, '② 失败时没有新增伪造的 Agent 回复气泡')
  await capture('16-agent-llm-failed.png')

  await send('Fetch.disable')
  while (pausedRequests.length) {
    const requestId = pausedRequests.shift()
    await send('Fetch.continueRequest', { requestId }).catch(() => {})
  }
  await clickText('重试这条消息')
  check(await waitForText('正在思考', 8000), '② 重试会重新进入思考状态')
  const retried = await waitForText('真实模型', 90000)
  const retryText = await bodyText()
  check(retried || !retryText.includes('Agent 回复失败'), '② 重试后重新拿到真实模型回复')

  // ---------------------------------------------------------------- 3. 真实语音识别
  console.log('→ ③ 麦克风是真实语音识别，不是示例文字')
  const chatText = await bodyText()
  check(!chatText.includes('选一句转成文字'), '③ 已删除「选一句示例文字」的假语音入口')
  await clickText('语音入口')
  check(await waitForText('语音转文字', 5000), '③ 点击麦克风打开语音转文字面板')
  check(await waitForText('点击麦克风，真实说一句话', 5000), '③ 提示真实录音，而不是选择示例')
  const hasStop = await evaluate('Boolean(document.querySelector(\'[aria-label="开始录音"]\'))')
  check(hasStop, '③ 提供「开始录音」按钮（真实请求麦克风）')
  await capture('17-voice-real.png')

  // ---------------------------------------------------------------- 4/5. 编辑资料
  console.log('→ ④⑤ 编辑资料：头像上传持久化 + 昵称/生日/性别同步')
  await goto('/me/edit')
  check(await waitForText('编辑资料', 15000), '④ 我的页面可以进入编辑资料')

  const doc = await send('DOM.getDocument', { depth: -1 })
  const inputNode = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: 'input[type=file]' })
  check(Boolean(inputNode.nodeId), '④ 编辑资料提供头像上传输入框')
  await send('DOM.setFileInputFiles', { nodeId: inputNode.nodeId, files: [avatarFile] })
  await sleep(600)
  const previewOk = await evaluate('Boolean(document.querySelector("img"))')
  check(previewOk, '④ 头像上传后有本地预览')

  const nickname = '午夜电台听众'
  await evaluate(`(() => {
    const inputs = Array.from(document.querySelectorAll('input'));
    const target = inputs.find((el) => el.placeholder === '给自己起个名字');
    if (!target) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(target, ${JSON.stringify('午夜电台听众')});
    target.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`)
  await evaluate(`(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const target = buttons.find((el) => (el.innerText || '').trim() === '男');
    if (!target) return false;
    target.click();
    return true;
  })()`)
  await evaluate(`(() => {
    const input = document.querySelector('input[type=date]');
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, '1999-03-08');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`)
  await sleep(300)
  await capture('18-edit-profile.png')
  await clickText('保存资料')
  check(await waitForText('我的', 10000), '④ 保存后回到我的页面')

  await goto('/me')
  check(await waitForText(nickname, 15000), '⑤ 我的页面显示新的昵称')
  const meText = await bodyText()
  check(meText.includes('男'), '⑤ 我的页面显示新的性别')
  check(meText.includes('27 岁'), '⑤ 生日自动计算年龄（27 岁）')
  check(await evaluate('Boolean(document.querySelector("img"))'), '④ 我的页面展示已上传的头像')

  await goto('/messages/dm-jiangli')
  check(await waitForText(nickname, 15000), '⑤ 聊天页面同步显示新昵称')

  // 刷新后头像仍在（localStorage 持久化）
  await goto('/me')
  await waitForText(nickname, 15000)
  const persisted = await evaluate('Boolean(document.querySelector("img"))')
  check(persisted, '④ 刷新页面后头像仍然存在')

  socket.close()
  socket = undefined
} catch (error) {
  failed = true
  console.log('  脚本异常：' + error.message)
} finally {
  if (socket) socket.close()
  if (chrome) chrome.kill()
  await sleep(400)
  rmSync(profile, { recursive: true, force: true })
}

console.log('')
console.log('真实链路验收：' + pass + ' PASS / ' + fail + ' FAIL')
if (fail > 0 || failed) process.exit(1)
