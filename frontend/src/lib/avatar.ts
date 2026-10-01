/**
 * 头像处理的唯一实现：校验类型 / 限制大小 / 居中裁剪 / 缩放到 256×256 / 压缩成 data URL。
 *
 * 关键约束：
 * - 永久头像地址必须是 data URL，不能用 URL.createObjectURL 的结果：
 *   object URL 在刷新或重启浏览器后就会失效，头像会变成裂图；
 *   这里只用它做一次性的临时解码，用完立即 revoke。
 * - 压缩后的 data URL 必须控制在 500KB 以内，否则 localStorage 很快会被撑爆。
 */

export const AVATAR_SIZE = 256
export const AVATAR_MAX_SOURCE_BYTES = 8 * 1024 * 1024
export const AVATAR_MAX_DATA_URL_BYTES = 500 * 1024
export const AVATAR_ACCEPT = 'image/jpeg,image/png,image/webp'
export const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp']

/** 头像处理失败：message 是可以直接展示给用户的中文原因。 */
export class AvatarError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AvatarError'
  }
}

function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',')
  const body = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
  return Math.ceil((body.length * 3) / 4)
}

function decode(file: File): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(file)
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new AvatarError('这张图片无法读取，请换一张 jpg / png / webp'))
    image.src = objectUrl
  }).finally(() => URL.revokeObjectURL(objectUrl))
}

export async function toAvatarDataUrl(file: File): Promise<string> {
  if (!AVATAR_TYPES.includes(file.type)) {
    throw new AvatarError('只支持 jpg / png / webp 格式的图片')
  }
  if (file.size > AVATAR_MAX_SOURCE_BYTES) {
    throw new AvatarError('原图不能超过 8MB，请先压缩后再上传')
  }

  const image = await decode(file)
  if (!image.width || !image.height) throw new AvatarError('图片尺寸异常，请换一张')

  const side = Math.min(image.width, image.height)

  for (const quality of [0.85, 0.72, 0.6]) {
    const canvas = document.createElement('canvas')
    canvas.width = AVATAR_SIZE
    canvas.height = AVATAR_SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new AvatarError('当前浏览器不支持图片裁剪')
    ctx.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE)

    const dataUrl = canvas.toDataURL('image/jpeg', quality)
    if (dataUrlBytes(dataUrl) <= AVATAR_MAX_DATA_URL_BYTES) return dataUrl
  }

  throw new AvatarError('压缩后的头像仍然超过 500KB，请换一张更小的图片')
}