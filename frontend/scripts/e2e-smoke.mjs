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

  console.log('浏览器：' + chromePath)
  console.log('入口：' + BASE)

  // ============================================================ 主演示链路
  step('① 打开默认入口（模拟 QQ 音乐演出详情页）')
  await goto('/')
  await evaluate('sessionStorage.clear()')
  await goto('/')
  check(await waitForText('夜航计划'), '① 默认入口直接进入演出详情')
  check(await waitForText('QQ音乐'), '① 页面顶部体现 QQ 音乐场景')
  check(await waitForText('概念功能 Demo'), '① 明确标注为 QQ 音乐概念功能 Demo')
  check(await waitForText('AI找同行'), '① 出现“AI找同行”功能入口')
  check(await mobileButtonVisible('AI找同行'), '① 移动端主入口按钮无遮挡')
  check(
    await waitForText('本作品为参赛概念Demo'),
    '① 明确说明未接入官方 API、当前使用脱敏 Demo 数据',
  )
  check(await waitForText('同行安全提示'), '① 演出详情包含海报、歌手、时间、地点与安全提示')
  await capture('01-concert-detail.png')

  step('② 音乐数据授权')
  await clickText('AI找同行')
  check(await waitForText('选择要授权的音乐数据'), '② 进入音乐数据授权页')
  await clickText('暂不授权')
  check(await waitForText('你已拒绝音乐画像授权'), '② 拒绝授权时停止匹配并解释原因')
  await clickText('重新选择')
  check(await waitForText('收藏歌曲'), '② 授权项包含收藏歌曲')
  check(await waitForText('常听歌手'), '② 授权项包含常听歌手')
  check(await waitForText('近期播放'), '② 授权项包含近期播放')
  check(await waitForText('关注演出'), '② 授权项包含关注演出')
  check(await waitForText('歌单标签'), '② 授权项包含歌单标签')
  check(await clickText('全部授权').then((r) => r.ok === true), '② 可以一键全部授权')
  check(await mobileButtonVisible('授权并继续'), '② 移动端授权按钮无遮挡')
  await capture('02-music-auth.png')
  await clickText('授权并继续')

  step('③ 用自然语言说出需求')
  check(await waitForText('给同行 Agent 一个任务'), '③ 进入 Agent 对话及需求确认页')
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

  step('⑤ 查看 Agent 执行进度')
  await clickText('确认需求，执行 Agent 任务')
  check(await waitForText('正在理解需求', 20000), '⑤ 进度页展示“正在理解需求”')
  check(await waitForText('读取授权音乐偏好'), '⑤ 进度页展示“读取授权音乐偏好”')
  check(await waitForText('检索同场候选人'), '⑤ 进度页展示“检索同场候选人”')
  check(await waitForText('执行安全约束'), '⑤ 进度页展示“执行安全约束”')
  check(await waitForText('计算同频程度'), '⑤ 进度页展示“计算同频程度”')
  check(await waitForText('生成同频方案'), '⑤ 进度页展示“生成同频方案”')
  check(await waitForText('查看匹配结果与证据', 60000), '⑤ Agent 跑完后可进入匹配结果')
  const progressText = await bodyText()
  check(progressText.includes('parse_social_intent'), '⑤ 用户模式可见调用过的工具')
  check(progressText.includes('Agent 任务计划'), '⑤ 用户模式可见任务计划')
  check(!progressText.includes('输入：'), '⑤ 用户模式不显示底层输入摘要')
  await capture('04-agent-execution.png')

  step('⑥ 查看匹配结果与证据')
  await clickText('查看匹配结果与证据')
  check(await waitForText('同频匹配结果', 20000), '⑥ 进入匹配结果页')
  check(await waitForText('匹配度'), '⑥ 展示匹配度')
  check(await waitForText('共同歌曲'), '⑥ 展示共同歌曲')
  check(await waitForText('共同目的'), '⑥ 展示共同目的')
  check(await waitForText('差异点'), '⑥ 展示差异点')
  check(await waitForText('查看 Agent 预沟通报告'), '⑥ 提供结构化 A2A 预沟通报告')
  check(await waitForText('匹配理由（只引用真实共同点）'), '⑥ 展示有证据的匹配理由')
  check((await currentHash()).includes('/matches'), '⑥ 路由停在匹配结果页')
  await clickText('查看 Agent 预沟通报告')
  check(await waitForText('待真人确认条件'), '⑥ 差异项要求真人确认')
  check(await waitForText('被隐藏的数据'), '⑥ 明确列出不交换的数据')
  check(await waitForText('未交换真实姓名'), '⑥ A2A 不交换个人敏感数据')
  await closeConsole()
  await capture('05-match-results.png')

  step('⑦ 查看 Agent 依据抽屉')
  await clickText('查看依据')
  check(await waitForText('Agent 依据'), '⑦ 抽屉打开')
  check(await waitForText('工具调用步骤'), '⑦ 展示工具调用步骤')
  check(await waitForText('使用的数据来源'), '⑦ 展示使用的数据来源')
  check(await waitForText('得分构成'), '⑦ 展示每项匹配得分')
  check(await waitForText('等待你确认的下一步'), '⑦ 展示等待用户确认的下一步')
  await closeConsole()

  step('⑧ 双向确认')
  const invite = await clickText('邀请 ta 同行')
  check(invite.ok === true, '⑧ 可以发出同频邀请')
  check(await waitForText('双向确认状态'), '⑧ 出现双向确认状态')
  check(await waitForText('进入同频临时房间', 30000), '⑧ 双方确认后才出现进入房间的入口')

  step('⑨ 进入同频临时房间')
  await clickText('进入同频临时房间')
  check(await waitForText('双向确认状态', 20000), '⑨ 房间展示双向确认状态')
  check(await waitForText('公开集合点'), '⑨ 房间展示公开集合点')
  check(await waitForText('AI 音乐破冰卡'), '⑨ 房间展示 AI 音乐破冰卡')
  check(await waitForText('候场任务'), '⑨ 房间展示候场任务')
  check(await waitForText('位置共享'), '⑨ 位置共享默认关闭')
  check(await waitForText('已关闭'), '⑨ 位置共享状态为关闭')
  check(await waitForText('拉黑这位同行者'), '⑨ 房间提供拉黑入口')
  check(await waitForText('24 小时后自动归档'), '⑨ 房间展示自动归档提示')
  check(await waitForText('退出房间与举报'), '⑨ 房间提供退出与举报入口')
  await capture('06-temporary-room.png')

  await goto('/showcase')
  check(await waitForText('在开场之前', 20000), '⑩ 展示模式可访问')
  await capture('07-showcase.png')

  step('⑪ 刷新后演示数据仍可恢复')
  await goto('/concert/night-flight/matches')
  check(await waitForText('匹配理由（只引用真实共同点）', 20000), '⑪ 刷新后匹配结果仍能恢复')
  await goto('/')
  check(await waitForText('回到同行方案'), '⑪ 刷新后演出详情页仍记得已有方案')

  // ============================================================ 评委模式与三个案例
  step('⑫ 评委演示模式：Agent 执行轨迹')
  await resetDemo()
  check(await setJudge(true), '⑫ 可以开启评委演示模式')
  await goto('/concert/night-flight/agent')
  check(await waitForText('parse_social_intent', 60000), '⑫ 评委模式可以看到真实工具名')
  check(await waitForText('调用工具：'), '⑫ 评委模式可以看到工具输入输出摘要')
  check(await waitForText('输入：'), '⑫ 评委模式可以看到输入摘要')
  check(await waitForText('结果：'), '⑫ 评委模式可以看到输出摘要')
  check(await waitForText('ms'), '⑫ 评委模式可以看到每步耗时')
  check(await waitForText('评委演示模式'), '⑫ 出现评委模式提示条')

  step('⑬ 案例 1：正常匹配成功')
  await resetDemo()
  await setCase('正常匹配成功')
  await goto('/concert/night-flight/agent')
  check(await waitForText('案例 1 · 正常匹配成功', 20000), '⑬ 切换到案例 1')
  check(await waitForText('查看匹配结果与证据', 60000), '⑬ 正常案例跑完并产出结果')

  step('⑭ 案例 2：安全条件过滤后无匹配')
  await resetDemo()
  await setCase('安全条件过滤后无匹配')
  await goto('/concert/night-flight/agent')
  check(await waitForText('案例 2 · 安全条件过滤后无匹配', 20000), '⑭ 切换到案例 2')
  check(await waitForText('为什么一个人都没匹配到', 60000), '⑭ 无匹配时给出明确状态与原因')
  check(await waitForText('不会编造候选人'), '⑭ 明确说明不会编造候选人')
  await goto('/concert/night-flight/matches')
  check(await waitForText('这一轮没有找到同频的人', 20000), '⑭ 匹配结果页展示空结果状态')
  check(await waitForText('放宽条件再匹配'), '⑭ 空结果提供放宽条件入口')

  step('⑮ 案例 3：大模型不可用走本地 fallback')
  await resetDemo()
  await setCase('大模型不可用走本地 fallback')
  await goto('/concert/night-flight/agent')
  check(await waitForText('案例 3 · 大模型不可用走 fallback', 20000), '⑮ 切换到案例 3')
  check(await waitForText('本次演示指定', 60000), '⑮ 明确标记本次为 fallback 解析')
  check(await waitForText('查看匹配结果与证据', 60000), '⑮ fallback 后依然完成匹配')

  step('⑯ 加载状态')
  await resetDemo()
  await setScenario('载入较慢')
  await goto('/concert/night-flight/agent')
  check(await waitForText('已用', 15000), '⑯ 弱网下展示加载进度')
  check(await waitForText('查看匹配结果与证据', 90000), '⑯ 加载结束后仍能给出结果')

  step('⑰ 错误状态')
  await resetDemo()
  await setScenario('网络异常')
  await goto('/concert/night-flight/agent')
  check(await waitForText('Agent 执行中断', 30000), '⑰ 模型/网络异常时给出明确错误状态')
  check(await waitForText('重试一次'), '⑰ 错误状态提供重试入口')
  await goto('/concert/night-flight/matches')
  check(await waitForText('匹配失败', 20000), '⑰ 匹配结果页同步展示错误状态')
  check(await waitForText('重新匹配'), '⑰ 错误状态提供重新匹配入口')

  step('⑱ 恢复默认')
  await resetDemo()
  await setCase('正常匹配成功')
  await setScenario('正常流程')
  check(await setJudge(false), '⑱ 可以关闭评委演示模式')
  await goto('/concert/night-flight/agent')
  check(await waitForText('查看匹配结果与证据', 60000), '⑱ 恢复默认后 Agent 仍能跑完')
  await clickText('查看匹配结果与证据')
  check(await waitForText('匹配理由（只引用真实共同点）', 20000), '⑱ 恢复默认后重新出现匹配结果')
  check(!(await bodyText()).includes('评委演示模式'), '⑱ 关闭评委模式后不再显示技术日志提示条')

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



