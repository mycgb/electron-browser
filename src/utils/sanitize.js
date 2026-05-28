export function sanitizeFileName(name) {
  if (!name) return 'download'
  return name
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/[·\s]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 50).trim() || 'download'
}

export function sanitizeFolderName(name) {
  if (!name) return '未命名'
  return name
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/[·\s]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 50).trim() || '未命名'
}

export function sanitizeTitle(title) {
  if (!title) return '未知商品'
  return title
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/[·\s]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 50).trim() || '未知商品'
}
