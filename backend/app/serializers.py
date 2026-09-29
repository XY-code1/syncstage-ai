'''把数据库里的 snake_case 记录转换成前端约定的 camelCase 结构。'''

from typing import Any


def to_camel(name: str) -> str:
    head, *rest = name.split('_')
    return head + ''.join(part[:1].upper() + part[1:] for part in rest if part)


def to_camel_keys(value: Any) -> Any:
    if isinstance(value, dict):
        return {to_camel(key): to_camel_keys(item) for key, item in value.items()}
    if isinstance(value, list):
        return [to_camel_keys(item) for item in value]
    return value
