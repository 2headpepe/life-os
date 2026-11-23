import path from 'node:path'

export function contentPath(vault, relativePath) {
  if (typeof relativePath !== 'string' || !relativePath || relativePath.includes('\\') || relativePath.includes('\0')) return null
  if (relativePath.split('/').some(segment => !segment || segment === '.' || segment === '..')) return null
  const root = path.resolve(vault)
  const resolved = path.resolve(root, relativePath)
  return resolved.startsWith(`${root}${path.sep}`) ? resolved : null
}

export function writableContent(relativePath) {
  return relativePath === 'habits/definitions.json' || /^habits\/log\/\d{4}-\d{2}-\d{2}\.json$/.test(relativePath)
}
