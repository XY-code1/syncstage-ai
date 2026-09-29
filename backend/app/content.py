'''候场任务、破冰话题、回忆卡的内容生成（规则回退版本）。'''

from typing import Any


def build_room_tasks(concert: dict[str, Any]) -> list[dict[str, Any]]:
    meeting = concert.get('meeting_point') or {}
    return [
        {
            'id': 'meeting',
            'label': '确认公开集合点',
            'detail': '约定在' + str(meeting.get('name', '场馆入口的公共区域')) + '碰头，时间为 ' + str(meeting.get('time', '开场前 40 分钟')),
            'done': False,
        },
        {'id': 'arrive', 'label': '提前 40 分钟到场', 'detail': '先在场外见一面，确认彼此，再一起检票入场', 'done': False},
        {'id': 'signal', 'label': '约定一个互相认出的信号', 'detail': '例如外套颜色、随身包挂件，避免在人群里找不到人', 'done': False},
        {'id': 'playlist', 'label': '交换一首候场歌单', 'detail': '各自挑一首现场前最想听的歌，进场前一起听完', 'done': False},
        {'id': 'leave', 'label': '说好散场后的走法', 'detail': '约定一起走到地铁口或打车点，之后各回各家', 'done': False},
        {'id': 'tell', 'label': '把行程告诉一位朋友', 'detail': '把演出场地、大致返程时间告诉场外的朋友或家人', 'done': False},
    ]


def build_icebreakers(concert: dict[str, Any], prefs: dict[str, Any], shared_songs: list[str]) -> list[str]:
    hot_songs = concert.get('hot_songs') or []
    songs = shared_songs or hot_songs
    first = songs[0] if songs else '这场的开场曲'
    second = songs[1] if len(songs) > 1 else first
    wants_photo = '拍照记录现场' in (prefs.get('purposes') or [])

    return [
        '你第一次听到《' + first + '》是什么场景？在什么天气、什么地方？',
        '这次如果只能一起合唱一首，你选《' + first + '》还是《' + second + '》？',
        '散场以后你一般立刻就走，还是会站在门口把最后一首哼完？',
        '你更想站在靠近舞台的位置，还是靠近调音台的位置？',
        '《' + second + '》里你最喜欢的那个瞬间是哪一秒？',
        '今天几点到？要不要在集合点先碰个面再一起进场？',
        '你手机里播放次数最多的那首歌是什么？不一定是这场演出的。',
        '如果拍到一张很喜欢的照片，你会发朋友圈还是自己留着？' if wants_photo else '听现场的时候你会把手机收起来吗？',
    ]


def build_memory_card(
    concert: dict[str, Any],
    partner: dict[str, Any] | None,
    companions: list[dict[str, Any]],
    shared_songs: list[str],
) -> dict[str, Any]:
    members: list[dict[str, Any]] = [{'userId': 'me', 'nickname': '我', 'avatar': {'from': '#31c27c', 'to': '#0d6b45'}}]
    if partner:
        members.append({'userId': partner['id'], 'nickname': partner['nickname'], 'avatar': partner.get('avatar', {})})
    for companion in companions:
        members.append({'userId': companion['id'], 'nickname': companion['nickname'], 'avatar': companion.get('avatar', {})})

    hot_songs = concert.get('hot_songs') or []
    songs = shared_songs[:3] if shared_songs else hot_songs[:2]
    lines = concert.get('memory_lines') or []

    return {
        'id': 'memory-' + concert['id'],
        'concertId': concert['id'],
        'concertTitle': concert['title'],
        'artist': concert['artist'],
        'dateLabel': concert['date_label'],
        'venue': concert['venue'],
        'sharedSongs': songs,
        'keywords': (concert.get('memory_keywords') or [])[:4],
        'members': members,
        'line': lines[0] if lines else '散场之后，我们又在门口把最想听的那首歌唱了一遍。',
        'lineOptions': lines,
    }


def build_tag_groups(prefs: dict[str, Any]) -> list[dict[str, Any]]:
    from app.matching import extract_story_keywords

    return [
        {
            'id': 'music',
            'title': '音乐口味',
            'hint': '来自喜欢歌曲与常听音乐人，是匹配权重最高的一组',
            'tags': ['《' + song + '》' for song in (prefs.get('likedSongs') or [])]
            + ['#' + artist for artist in (prefs.get('likedArtists') or [])],
        },
        {
            'id': 'expected',
            'title': '现场期待',
            'hint': '来自期待曲目，决定共同期待能不能对上',
            'tags': ['期待《' + track + '》' for track in (prefs.get('expectedTracks') or [])],
        },
        {'id': 'purpose', 'title': '同行目的', 'hint': '你希望这场演出里有人陪你做什么', 'tags': list(prefs.get('purposes') or [])},
        {
            'id': 'style',
            'title': '交流风格与组队规模',
            'hint': '决定破冰的节奏，也决定房间里有几个人',
            'tags': [str(prefs.get('chatStyle', '')), str(prefs.get('groupSize', 2)) + ' 人小组'],
        },
        {
            'id': 'safety',
            'title': '安全边界',
            'hint': '作为硬性条件优先过滤',
            'tags': list(prefs.get('safety') or []),
        },
        {
            'id': 'story',
            'title': '听歌故事关键词',
            'hint': '用来判断你们是不是在相似的场景里听懂同一首歌',
            'tags': extract_story_keywords(prefs.get('story', '')),
        },
    ]
