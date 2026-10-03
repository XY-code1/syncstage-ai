/**
 * 双 Agent 破冰演示脚本。
 *
 * 只负责「两个 Agent 先替真人把共同点与安全边界对齐」的演示台词，
 * 不参与真实匹配计算，也不改任何后端 API 或 Agent 核心状态机。
 * 台词里引用的都是本轮匹配真实产出的数据（共同演出 / 共同歌曲 / 到场时间 / 公开集合点）。
 */

export type IcebreakSide = 'me' | 'peer'

export interface IcebreakMessage {
  id: string
  side: IcebreakSide
  /** agent = Agent 代发；self = 真人本人发送 */
  via: 'agent' | 'self'
  /** 消息归属的用户名称 */
  authorName: string
  /** 当前状态，例如「已送达」「已发送」 */
  status: string
  text: string
  time: string
  /** Agent 总结卡 */
  summary?: boolean
}

export interface IcebreakTyping {
  side: IcebreakSide
  label: string
}

export interface IcebreakStep {
  id: string
  /** 先展示多久「输入中」，再落下这条消息（600–1000ms） */
  delay: number
  typing?: IcebreakTyping
  message?: IcebreakMessage
}

/** 结尾总结卡必须出现的固定结论 */
export const ICEBREAK_SUMMARY_TEXT = 'Agent发现3个共同点：同场演出、共同歌曲、到场时间接近'

export interface IcebreakNames {
  me: string
  peer: string
}

export interface IcebreakFacts {
  concertTitle: string
  sharedSongs: string[]
  /** 公开集合时间，例如「18:50（开场前 40 分钟）」 */
  meetingTime: string
  meetingPoint: string
  /** 双方共同的安全边界 */
  safety: string
}

function stamp(base: number, offsetMinutes: number): string {
  const date = new Date(base + offsetMinutes * 60_000)
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

/**
 * 生成固定顺序的破冰脚本：
 *   对方 Agent 发起 → 我方 Agent 理解共同点 → 对方 Agent 回应 → 我方 Agent 确认安全边界 → 总结卡
 * 每一步都先给出「输入中」状态，再落下消息，保证不会出现「对方没说话、我方直接回复」的断层。
 */
export function buildIcebreakSteps(names: IcebreakNames, facts: IcebreakFacts, base = Date.now()): IcebreakStep[] {
  const me = names.me
  const peer = names.peer
  const songA = facts.sharedSongs[0] ?? '夜航的信'
  const songB = facts.sharedSongs[1] ?? songA
  const show = facts.concertTitle || '同场演出'

  const message = (
    id: string,
    side: IcebreakSide,
    via: IcebreakMessage['via'],
    authorName: string,
    text: string,
    time: string,
    summary = false,
  ): IcebreakMessage => ({
    id,
    side,
    via,
    authorName,
    status: via === 'agent' ? '已送达' : '已发送',
    text,
    time,
    summary,
  })

  return [
    {
      id: 'peer-typing-1',
      delay: 820,
      typing: { side: 'peer', label: `「${peer}」的 Agent 正在发起对话…` },
      message: message(
        'peer-1',
        'peer',
        'agent',
        peer,
        `你好，我是「${peer}」的 Agent。我们检测到两边都收藏了《${songA}》和《${songB}》，也都要去看「${show}」，想先替你们把共同点对一下。`,
        stamp(base, 0),
      ),
    },
    {
      id: 'me-typing-1',
      delay: 900,
      typing: { side: 'me', label: `「${me}」的 Agent 正在理解共同点…` },
      message: message(
        'me-1',
        'me',
        'agent',
        me,
        `收到。我方用户最想在现场听到《${songA}》，到场计划是${facts.meetingTime}，也就是提前大约 40 分钟到检票口。`,
        stamp(base, 1),
      ),
    },
    {
      id: 'peer-typing-2',
      delay: 860,
      typing: { side: 'peer', label: `「${peer}」的 Agent 正在回应…` },
      message: message(
        'peer-2',
        'peer',
        'agent',
        peer,
        `对上了：同场演出、共同歌曲、到场时间也接近。集合点建议用公开的「${facts.meetingPoint}」，两边都能接受吗？`,
        stamp(base, 2),
      ),
    },
    {
      id: 'me-typing-2',
      delay: 800,
      typing: { side: 'me', label: `「${me}」的 Agent 正在确认安全边界…` },
      message: message(
        'me-2',
        'me',
        'agent',
        me,
        `可以，写进同行约定：${facts.safety}，不交换私人联系方式，也不接受临时改约。双方的确定性就交给真人自己确认。`,
        stamp(base, 3),
      ),
    },
    {
      id: 'summary',
      delay: 700,
      typing: { side: 'me', label: '两个 Agent 正在汇总共同点…' },
      message: message('summary-card', 'me', 'agent', me, ICEBREAK_SUMMARY_TEXT, stamp(base, 4), true),
    },
  ]
}