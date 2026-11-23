import { api } from '../api'

export async function openInConsole(prompt = '') {
  try {
    await api.post('/ai/open', { prompt })
    return true
  } catch {
    globalThis.alert?.('Не удалось открыть AI-консоль. Попробуй ещё раз.')
    return false
  }
}
