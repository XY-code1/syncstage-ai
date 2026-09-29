// 同频现场 · 匹配逻辑与 Agent 流水线冒烟测试（开发用脚本，不参与打包）
// 用法：npm run smoke
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const outdir = mkdtempSync(join(tmpdir(), 'sfl-smoke-'))

async function load(entry) {
  await build({
    entryPoints: [entry],
    outdir,
    bundle: true,
    format: 'esm',
    platform: 'node',
    logLevel: 'warning',
  })
}

let failures = 0

function check(condition, label) {
  if (condition) {
    console.log('  PASS  ' + label)
  } else {
    failures += 1
    console.log('  FAIL  ' + label)
  }
}

try {
  await load('src/lib/matching.ts')
  await load('src/data/demoData.ts')
  await load('src/lib/agentMock.ts')
  await load('src/lib/scoring.ts')

  const { computeMatches, intentFromPrefs, factsFromPrefs } = await import(
    pathToFileURL(join(outdir, 'matching.js')).href
  )
  const { demoConcerts, demoUsers } = await import(pathToFileURL(join(outdir, 'demoData.js')).href)
  const { runAgent, createRoomState, inviteState, peerConfirmState, unsupportedQuotes } = await import(
    pathToFileURL(join(outdir, 'agentMock.js')).href
  )
  const { DIMENSION_WEIGHTS } = await import(pathToFileURL(join(outdir, 'scoring.js')).href)

  console.log('Demo 数据：' + demoConcerts.length + ' 场演出 / ' + demoUsers.length + ' 位匿名用户')
  check(demoConcerts.length >= 3, '至少 3 场演出')
  check(demoUsers.length >= 12, '至少 12 位匿名用户')
  check(
    demoUsers.every((user) => user.isDemo === true) && demoConcerts.every((concert) => concert.isDemo === true),
    '所有演出与用户都标记为 Demo 数据',
  )
  check(
    demoUsers.every(
      (user) =>
        Array.isArray(user.likedSongs) &&
        Array.isArray(user.likedArtists) &&
        Array.isArray(user.expectedTracks) &&
        Array.isArray(user.purposes) &&
        typeof user.chatStyle === 'string' &&
        typeof user.groupSize === 'number' &&
        Array.isArray(user.safety),
    ),
    '每位用户都带有歌曲 / 歌手 / 期待曲目 / 社交目的 / 交流风格 / 人数 / 安全偏好',
  )

  for (const concert of demoConcerts) {
    const pool = demoUsers.filter((user) => user.concertIds.includes(concert.id))
    // 模拟一位普通观众在现场填写偏好页时会给出的答案
    const me = {
      nickname: '演示访客',
      likedSongs: concert.hotSongs.slice(0, 3),
      likedArtists: [concert.artist],
      expectedTracks: concert.hotSongs.slice(0, 2),
      story: '加班回家的路上一直在听这张专辑，想找个人一起排队，也想在副歌有人一起唱。',
      purposes: ['副歌一起唱', '演出后聊音乐'],
      chatStyle: '温和慢热',
      groupSize: 3,
      safety: ['只在公开场合见面', '不交换私人联系方式'],
      myGender: 'prefer-not-to-say',
    }

    console.log('')
    console.log('== 演出「' + concert.title + '」匹配（以 ' + me.nickname + ' 的身份）==')
    const { results, blocked } = computeMatches(me, pool)
    const top = results.slice(0, 3)
    console.log('  候选池 ' + pool.length + ' 人，安全偏好过滤 ' + blocked.length + ' 人，返回 ' + results.length + ' 条')
    top.forEach((item, index) => {
      console.log(
        '  #' +
          (index + 1) +
          ' ' +
          item.candidate.nickname +
          ' 匹配度 ' +
          item.score +
          '  共同歌曲 ' +
          item.sharedSongs.length +
          '  理由 ' +
          item.evidence.length +
          ' 条  差异 ' +
          item.differences.length +
          ' 条',
      )
    })

    check(top.length === Math.min(3, results.length), '最多返回 3 位候选人')
    check(results.length + blocked.length === pool.length, '过滤与结果加起来等于候选池，没有凭空造人')
    const blockedIds = new Set(blocked.map((user) => user.id))
    check(
      results.every((item) => !blockedIds.has(item.userId)),
      '被安全条件排除的人不会再出现在结果里',
    )
    check(results.every((item) => item.score >= 0 && item.score <= 99), '匹配度都在 0～99 之间')
    check(results.every((item) => item.evidence.length >= 2), '每位候选人都至少有 2 条匹配理由')
    check(results.every((item) => item.differences.length >= 1), '每位候选人都给出了差异点')
    check(
      results.every((item, index) => index === 0 || results[index - 1].score >= item.score),
      '结果按匹配度从高到低排序',
    )
    check(
      results.every((item) => {
        const weights = item.scoreBreakdown.dimensions.map((dimension) => dimension.weight).join('+')
        const total = item.scoreBreakdown.dimensions.reduce((sum, dimension) => sum + dimension.weight, 0)
        return weights === '40+25+20+15' && total === 100
      }),
      'score_breakdown 固定四维权重 40 / 25 / 20 / 15',
    )
    check(
      results.every((item) =>
        item.scoreBreakdown.dimensions.every(
          (dimension) => dimension.points >= 0 && dimension.points <= dimension.weight,
        ),
      ),
      '每个维度的得分都不超过其权重上限',
    )
    check(
      results.every((item) => item.evidence.every((entry) => entry.source && entry.sourceLabel)),
      '每条证据都标注了数据来源',
    )
    check(
      results.every((item) => unsupportedQuotes(item.matchReason, item.evidence).length === 0),
      '推荐理由只引用了 evidence 里真实存在的内容',
    )
    if (concert.id === 'night-flight') {
      check(top[0].score >= 65, '代表场次「夜航计划」的最高匹配度不低于 65（当前 ' + top[0].score + '）')
    }
  }

  console.log('')
  console.log('== 边界情况：安全条件过滤后没有匹配 ==')
  const strictPrefs = {
    likedSongs: ['一个不存在的歌名'],
    likedArtists: [],
    expectedTracks: [],
    story: '我就是来听听看',
    purposes: [],
    chatStyle: '安静听歌',
    groupSize: 2,
    safety: ['希望同行者性别相同'],
    myGender: 'female',
  }
  const tide = demoConcerts.find((concert) => concert.id === 'tide-line')
  const tidePool = demoUsers.filter((user) => user.concertIds.includes(tide.id))
  const genderOnly = computeMatches(strictPrefs, tidePool)
  check(genderOnly.blocked.length > 0, '同性同行偏好会过滤掉不符合的候选人')
  check(
    genderOnly.results.every((item) => item.candidate.gender === 'female' || item.candidate.gender === 'undisclosed'),
    '过滤后结果里不再出现男性候选人',
  )
  check(
    genderOnly.excluded.every((item) => Boolean(item.rule && item.reason)),
    '每位被排除的候选人都带有规则与原因',
  )
  check(
    genderOnly.results.every((item) => item.candidate.gender !== 'male'),
    '同性要求生效：结果中没有男性候选人',
  )

  const intentOf = intentFromPrefs(strictPrefs, 'tide-line')
  const viewerOf = factsFromPrefs(strictPrefs, 'tide-line')
  check(intentOf.eventId === 'tide-line' && intentOf.sameGenderOnly === true, '偏好能正确转换成结构化意图')
  check(viewerOf.userId === 'u-viewer' && viewerOf.followedEventIds.includes('tide-line'), '访客画像绑定了当前演出')

  console.log('')
  console.log('== Agent 流水线（前端 mock 编排，与后端同形）==')
  const ALL_SCOPES = ['favorite_songs', 'top_artists', 'recent_plays', 'followed_events', 'playlist_tags']
  const INTENT_TEXT =
    '我第一次看星野回声，最喜欢夜航计划这张专辑，想找人一起排队候场、副歌一起唱，最好先在群里聊熟，3 个人以内，只在公开场合见面。'

  async function runCase(demoCase) {
    return runAgent({
      eventId: 'night-flight',
      userId: 'u-viewer',
      text: INTENT_TEXT,
      scopes: ALL_SCOPES,
      demoCase,
      scenario: 'normal',
    })
  }

  const normal = await runCase('normal')
  const distinctTools = new Set(normal.trace.map((step) => step.name))
  console.log('  正常匹配：状态 ' + normal.status + '，工具调用 ' + normal.trace.length + ' 次 / ' + distinctTools.size + ' 个不同工具')
  check(distinctTools.size >= 5, 'Agent 至少真实调用 5 个工具（当前 ' + distinctTools.size + ' 个）')
  check(normal.status === 'pending_confirmation', '正常匹配进入 pending_confirmation 等待双方确认')
  check(normal.rankedCandidates.length > 0, '返回了候选人')
  check(normal.rankedCandidates[0].score >= 60, '首位候选人同频分不低于 60（当前 ' + normal.rankedCandidates[0].score + '）')
  check(
    normal.rankedCandidates.every((item) => unsupportedQuotes(item.matchReason, item.evidence).length === 0),
    'Agent 生成的推荐理由都通过了 evidence 引用校验',
  )
  check(normal.proposedGroup.members.length >= 2, '组队方案至少有发起人和一位同行者')
  check(
    normal.proposedGroup.members.length <= normal.parsedIntent.groupSize,
    '组队人数不超过用户要求的规模',
  )
  check(
    normal.parsedIntent !== null && normal.parsedIntent.groupSize === 3 && normal.parsedIntent.purposes.includes('副歌一起唱'),
    '自然语言被解析出人数与同行目的',
  )
  check(normal.pendingConfirmation.required === true, '创建房间前必须经过 pending_confirmation')

  const safetyCase = await runCase('safety_no_match')
  console.log('  安全过滤：状态 ' + safetyCase.status + '，排除 ' + safetyCase.excludedCandidates.length + ' 人')
  check(safetyCase.status === 'no_match', '安全条件过滤后返回 no_match')
  check(safetyCase.rankedCandidates.length === 0, 'no_match 时不返回任何候选人（不编造）')
  check(safetyCase.excludedCandidates.length > 0, 'no_match 时给出被排除的人与规则原因')

  const fallbackCase = await runCase('ai_fallback')
  const parseStep = fallbackCase.trace.find((step) => step.name === 'parse_social_intent')
  console.log('  大模型不可用：解析状态 ' + parseStep.status + '，最终状态 ' + fallbackCase.status)
  check(parseStep.status === 'fallback' && parseStep.usedFallback === true, '大模型不可用时明确标记 fallback 状态')
  check(fallbackCase.status === 'pending_confirmation', 'fallback 后依然能完成匹配')
  check(fallbackCase.rankedCandidates.length > 0, 'fallback 后仍有候选人结果')

  console.log('')
  console.log('== 双向确认 -> 创建房间 ==')
  const chosen = normal.rankedCandidates[0].userId
  const invited = inviteState(normal, chosen)
  const premature = createRoomState(invited)
  check(premature.room === null, '只有发起方确认时不能创建房间')
  const confirmed = peerConfirmState(invited, true)
  const created = createRoomState(confirmed)
  check(created.room !== null, '双方都确认后可以创建房间')
  check(created.room.members.length >= 2, '房间里至少有两人')
  check(created.room.icebreakers.length >= 1, '房间带音乐破冰话题')
  check(Boolean(created.room.meetingPoint && created.room.meetingPoint.name), '房间给出公开集合点')
  check(
    created.state.trace.some((step) => step.name === 'create_room' && step.status === 'ok'),
    'create_room 工具被真实调用并成功',
  )

  const declined = createRoomState(peerConfirmState(invited, false))
  check(declined.room === null, '对方拒绝时不会创建房间')
} finally {
  rmSync(outdir, { recursive: true, force: true })
}

if (failures > 0) {
  console.log('')
  console.log('冒烟测试未全部通过：' + failures + ' 项失败')
  process.exitCode = 1
} else {
  console.log('')
  console.log('全部检查通过')
}