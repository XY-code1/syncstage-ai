'''初始化 SQLite 数据库并写入 Demo 数据。

用法（在 backend 目录下）：
    python scripts/seed_db.py
'''

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:  # noqa: BLE001 - 老终端可能不支持重设编码
    pass

from app.config import settings  # noqa: E402
from app.db import get_connection, init_db  # noqa: E402
from app.demo_data import DEMO_CONCERTS, DEMO_USERS  # noqa: E402


def main() -> None:
    init_db()

    with get_connection() as connection:
        concerts_total = connection.execute('SELECT COUNT(*) AS total FROM concerts').fetchone()['total']
        users_total = connection.execute('SELECT COUNT(*) AS total FROM users').fetchone()['total']

    print('数据库文件：' + str(settings.db_path))
    print('演出：' + str(concerts_total) + ' 场（Demo 数据 ' + str(len(DEMO_CONCERTS)) + ' 场）')
    print('用户：' + str(users_total) + ' 位（Demo 数据 ' + str(len(DEMO_USERS)) + ' 位）')
    print('完成。所有数据均为虚构的演示数据。')


if __name__ == '__main__':
    main()
