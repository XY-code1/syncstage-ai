import type { ChatStyle, Concert, GroupSize, MyGender, Purpose, SafetyPref } from '../types'

export const PURPOSE_OPTIONS: Array<{ value: Purpose; hint: string }> = [
  { value: '一起排队候场', hint: '开场前有人一起等，队伍没那么长' },
  { value: '副歌一起唱', hint: '想找敢在现场唱出来的人' },
  { value: '安静听完整场', hint: '不需要说话，各自听歌也很好' },
  { value: '拍照记录现场', hint: '互相帮忙拍一张像样的现场照' },
]

export const CHAT_STYLE_OPTIONS: Array<{ value: ChatStyle; hint: string }> = [
  { value: '热情外放', hint: '想到什么说什么，破冰很快' },
  { value: '温和慢热', hint: '先聊两句歌，熟了再聊别的' },
  { value: '安静听歌', hint: '大部分时间不说话，把注意力留给舞台' },
]

export const SAFETY_OPTIONS: Array<{ value: SafetyPref; hint: string }> = [
  { value: '只在公开场合见面', hint: '集合点选在灯光明亮的公共区域' },
  { value: '不交换私人联系方式', hint: '只在房间内沟通，散场即结束' },
  { value: '希望同行者性别相同', hint: '会作为硬性条件过滤匹配结果' },
  { value: '结伴入场与离场', hint: '一起检票进场，散场一起走到地铁口' },
  { value: '先在群里聊熟再见面', hint: '先在房间聊几轮再确认同行' },
  { value: '不接受临时改约', hint: '时间地点确认后不再变更' },
]

export const GROUP_SIZE_OPTIONS: Array<{ value: GroupSize; label: string; hint: string }> = [
  { value: 2, label: '2 人同行', hint: '最好约，也最容易聊深' },
  { value: 3, label: '3 人小组', hint: '人多一点不容易冷场' },
  { value: 4, label: '4 人小组', hint: '适合一起排队和互相拍照' },
]

export const MY_GENDER_OPTIONS: Array<{ value: MyGender; label: string }> = [
  { value: 'female', label: '女生' },
  { value: 'male', label: '男生' },
  { value: 'prefer-not-to-say', label: '不方便透露' },
]

export const ARTIST_LIBRARY: string[] = [
  '星野回声',
  '沈亦舟',
  '潮汐线',
  '海边有风',
  '短波电台',
  '南方的南方',
  '慢速快门',
  '无人的房间',
  '城市之光合唱团',
  '惘闻',
]

const EXTRA_SONGS: string[] = ['别在夏天说再见', '夏天最后一支歌', '凌晨四点的便利店']

export function songLibrary(concert: Concert): string[] {
  return Array.from(new Set([...concert.hotSongs, ...concert.setlist, ...EXTRA_SONGS]))
}
