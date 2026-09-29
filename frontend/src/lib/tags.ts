import type { AiTags, ChatStyle, GroupSize, Preferences, SafetyPref, TagGroup } from '../types'
import { extractStoryKeywords, unique } from './matching'

const CHAT_STYLES: ChatStyle[] = ['热情外放', '温和慢热', '安静听歌']
const SAFETY_PREFS: SafetyPref[] = [
  '只在公开场合见面',
  '不交换私人联系方式',
  '希望同行者性别相同',
  '结伴入场与离场',
  '先在群里聊熟再见面',
  '不接受临时改约',
]

export const songTag = (name: string) => `《${name}》`
export const artistTag = (name: string) => `#${name}`

export function buildTagGroups(prefs: Preferences): TagGroup[] {
  return [
    {
      id: 'music',
      title: '音乐口味',
      hint: '来自你填写的喜欢歌曲与常听音乐人，是匹配权重最高的一组',
      tags: [...prefs.likedSongs.map(songTag), ...prefs.likedArtists.map(artistTag)],
    },
    {
      id: 'expected',
      title: '现场期待',
      hint: '来自你勾选的期待曲目，决定“共同期待”这一项能不能对上',
      tags: prefs.expectedTracks.map((track) => `期待${songTag(track)}`),
    },
    {
      id: 'purpose',
      title: '同行目的',
      hint: '你希望这场演出里有人陪你做什么',
      tags: prefs.purposes,
    },
    {
      id: 'style',
      title: '交流风格与组队规模',
      hint: '决定破冰的节奏，也决定房间里有几个人',
      tags: [prefs.chatStyle, `${prefs.groupSize} 人小组`],
    },
    {
      id: 'safety',
      title: '安全边界',
      hint: '这一组会作为硬性条件优先过滤，不符合的人不会出现在匹配结果里',
      tags: prefs.safety,
    },
    {
      id: 'story',
      title: '听歌故事关键词',
      hint: '来自你的听歌故事，用来判断你们是不是在相似的场景里听懂同一首歌',
      tags: extractStoryKeywords(prefs.story),
    },
  ]
}

export function buildAiTags(prefs: Preferences): AiTags {
  const groups = buildTagGroups(prefs)
  const total = groups.reduce((sum, group) => sum + group.tags.length, 0)
  const musicCount = groups.find((group) => group.id === 'music')?.tags.length ?? 0
  return {
    groups,
    storyKeywords: extractStoryKeywords(prefs.story),
    summary: `已从你的填写内容里整理出 ${total} 个标签，其中 ${musicCount} 个和音乐口味相关，会直接影响匹配顺序。`,
    confirmedAt: Date.now(),
  }
}

export function addTag(tags: AiTags, groupId: string, rawTag: string): AiTags {
  const tag = rawTag.trim()
  if (!tag) return tags
  return {
    ...tags,
    groups: tags.groups.map((group) =>
      group.id === groupId ? { ...group, tags: unique([...group.tags, tag]) } : group,
    ),
  }
}

export function removeTag(tags: AiTags, groupId: string, tag: string): AiTags {
  return {
    ...tags,
    groups: tags.groups.map((group) =>
      group.id === groupId ? { ...group, tags: group.tags.filter((item) => item !== tag) } : group,
    ),
  }
}

function stripSongTag(tag: string): string {
  return tag.replace(/^【?《/, '').replace(/》$/, '')
}

export function reflectTagsToPreferences(prefs: Preferences, tags: AiTags): Preferences {
  const group = (id: string) => tags.groups.find((item) => item.id === id)?.tags ?? []

  const music = group('music')
  const likedSongs = music.filter((tag) => tag.startsWith('《')).map(stripSongTag)
  const likedArtists = music.filter((tag) => tag.startsWith('#')).map((tag) => tag.slice(1))

  const expectedTracks = group('expected').map(stripSongTag)

  const purposes = prefs.purposes.filter((item) => group('purpose').includes(item))

  const styleTags = group('style')
  const chatStyle = CHAT_STYLES.find((item) => styleTags.includes(item)) ?? prefs.chatStyle
  const sizeTag = styleTags.find((tag) => tag.endsWith(' 人小组'))
  const groupSize = sizeTag
    ? (Number.parseInt(sizeTag, 10) as GroupSize)
    : prefs.groupSize

  const safety = prefs.safety.filter((item) => group('safety').includes(item))

  return {
    ...prefs,
    likedSongs: likedSongs.length > 0 ? likedSongs : prefs.likedSongs,
    likedArtists: likedArtists.length > 0 ? likedArtists : prefs.likedArtists,
    expectedTracks,
    purposes: purposes.length > 0 ? purposes : prefs.purposes,
    chatStyle,
    groupSize,
    safety: SAFETY_PREFS.filter((item) => safety.includes(item)),
  }
}
