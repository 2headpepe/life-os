export function openInConsole(prompt = '') {
  return fetch('/api/open-claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  })
}
