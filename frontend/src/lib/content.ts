import type { Concert, DemoUser, MemoryCardData, Preferences, RoomTask } from '../types'

export function buildIcebreakers(args: {
  concert: Concert
  sharedSongs: string[]
  partner: DemoUser | null
  prefs: Preferences
}): string[] {
  const { sharedSongs, prefs } = args
  // 只引用真实存在的共同歌曲；没有共同歌曲时用不含歌名的通用问题，绝不编造歌名
  const first = sharedSongs[0]
  const second = sharedSongs[1] ?? first

  const questions = [
    first
      ? `你第一次听到《${first}》是什么场景？在什么天气、什么地方？`
      : '你最近单曲循环最多的一首歌，是在什么场景下听的？',
    first && second
      ? `这次如果只能一起合唱一首，你选《${first}》还是《${second}》？`
      : '这次如果只能一起合唱一首，你会选哪一首？',
    `散场以后你一般立刻就走，还是会站在门口把最后一首哼完？`,
    `你更想站在靠近舞台的位置，还是靠近调音台的位置？`,
    second ? `《${second}》里你最喜欢的那个瞬间是哪一秒？` : '一首歌里，你最容易被哪个瞬间打动？',
    `今天几点到？要不要在集合点先碰个面再一起进场？`,
    `你手机里播放次数最多的那首歌是什么？不一定是这场演出的。`,
    prefs.purposes.includes('拍照记录现场')
      ? `如果拍到一张很喜欢的照片，你会发朋友圈还是自己留着？`
      : `听现场的时候你会把手机收起来吗？`,
  ]

  return questions
}

export function buildRoomTasks(concert: Concert): RoomTask[] {
  return [
    {
      id: 'meeting',
      label: '确认公开集合点',
      detail: `约定在${concert.meetingPoint.name}碰头，时间为 ${concert.meetingPoint.time}`,
      done: false,
    },
    {
      id: 'arrive',
      label: '提前 40 分钟到场',
      detail: '先在场外见一面，确认彼此，再一起检票入场',
      done: false,
    },
    {
      id: 'signal',
      label: '约定一个互相认出的信号',
      detail: '例如外套颜色、随身包挂件，避免在人群里找不到人',
      done: false,
    },
    {
      id: 'playlist',
      label: '交换一首候场歌单',
      detail: '各自挑一首现场前最想听的歌，进场前一起听完',
      done: false,
    },
    {
      id: 'leave',
      label: '说好散场后的走法',
      detail: '约定一起走到地铁口或打车点，之后各回各家',
      done: false,
    },
    {
      id: 'tell',
      label: '把行程告诉一位朋友',
      detail: '把演出场地、大致返程时间告诉场外的朋友或家人',
      done: false,
    },
  ]
}

export function buildMemoryCard(args: {
  concert: Concert
  prefs: Preferences
  partner: DemoUser | null
  companions: DemoUser[]
  sharedSongs: string[]
}): MemoryCardData {
  const { concert, partner, companions, sharedSongs } = args
  const members = [
    { userId: 'me', nickname: '我', avatar: { from: '#31c27c', to: '#0d6b45' } },
    ...(partner
      ? [{ userId: partner.id, nickname: partner.nickname, avatar: partner.avatar }]
      : []),
    ...companions.map((user) => ({ userId: user.id, nickname: user.nickname, avatar: user.avatar })),
  ]

  const songs = sharedSongs.length > 0 ? sharedSongs.slice(0, 3) : concert.hotSongs.slice(0, 2)
  const keywords = concert.memoryKeywords.slice(0, 4)

  return {
    id: `memory-${concert.id}-${Date.now()}`,
    concertId: concert.id,
    concertTitle: concert.title,
    artist: concert.artist,
    dateLabel: concert.dateLabel,
    venue: concert.venue,
    sharedSongs: songs,
    keywords,
    members,
    line: concert.memoryLines[0],
    lineOptions: concert.memoryLines,
    createdAt: Date.now(),
  }
}
