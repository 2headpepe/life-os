export function openInConsole(prompt = '') {
  return fetch('/api/ai/open', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  })
}
