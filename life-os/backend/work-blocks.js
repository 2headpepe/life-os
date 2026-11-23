import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { localDay } from './local-day.js'

function reject(status, message) {
  throw Object.assign(new Error(message), { status })
}

const editable = ['title', 'date', 'time', 'duration_min', 'calendar_id', 'time_zone']

export function blockTarget(nodes, id) {
  const byId = new Map(nodes.map(node => [node.id, node]))
  let node = byId.get(id)
  if (!node?.parent_id || node.calendar_id || ['done','dropped','someday','waiting_for_review'].includes(node.status) || nodes.some(child => child.parent_id === id)) return false
  const seen = new Set()
  while (node && (node.work_context || 'personal') === 'personal' && !seen.has(node.id)) {
    if (!node.parent_id) return true
    seen.add(node.id)
    node = byId.get(node.parent_id)
  }
  return false
}

function validate(block, calendars) {
  const start = new Date(block.date + 'T00:00:00Z')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(block.date) || !Number.isFinite(+start) || start.toISOString().slice(0, 10) !== block.date) reject(400, 'Некорректная дата')
  if (typeof block.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(block.time)) reject(400, 'Укажите время начала')
  if (!Number.isSafeInteger(block.duration_min) || block.duration_min <= 0 || block.duration_min > 1440) reject(400, 'Длительность интервала должна составлять от 1 до 1440 минут')
  if (!block.title || typeof block.title !== 'string' || !block.title.trim()) reject(400, 'Нужно название интервала')
  if (block.time_zone) {
    try { new Intl.DateTimeFormat('en', { timeZone: block.time_zone }) }
    catch { reject(400, 'Некорректный часовой пояс') }
  }
  if (block.calendar_id && !calendars.some(cal => cal.id === block.calendar_id)) reject(400, 'Календарь не найден')
}

function assertAvailable(block, events, nodes, verifyWindow) {
  const start = Date.parse(block.date + 'T' + block.time + ':00Z')
  const end = start + block.duration_min * 60000
  function overlaps(item, date, isEvent) {
    if (!date || ['done','dropped','someday','cancelled'].includes(item.status)) return false
    const day = Date.parse(date + 'T00:00:00Z')
    const validClock = typeof item.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(item.time)
    if (!validClock) return (isEvent || Boolean(item.time)) && day < end && start < day + 86400000
    const from = Date.parse(date + 'T' + item.time + ':00Z')
    const until = Number.isSafeInteger(item.duration_min) && item.duration_min > 0
      ? from + item.duration_min * 60000 : day + 86400000
    return from < end && start < until
  }
  const busyEvent = events.some(item => item.id !== block.id && item.type !== 'deadline' &&
    (item.type === 'work_block' || verifyWindow) && overlaps(item, item.date, true))
  const parentIds = new Set(nodes.map(node => node.parent_id))
  const busyTask = verifyWindow && nodes.some(node =>
    node.parent_id && !parentIds.has(node.id) && node.date_kind !== 'deadline' &&
    (!node.calendar_id || node.watched || node.date_kind === 'scheduled') &&
    (node.work_context !== 'delivery' || node.date_kind === 'scheduled') && overlaps(node, node.due, false))
  if (busyEvent || busyTask) reject(409, 'Интервал уже занят. Обновите варианты.')
}

export function saveWorkBlock(data, input, nodes, calendars, previous) {
  const { verify_window: verifyWindow = false, ...fields } = input
  if (typeof verifyWindow !== 'boolean') reject(400, 'Некорректный флаг проверки окна')
  if (Object.keys(fields).some(key => ![...editable, 'task_id','type','id'].includes(key))) reject(400, 'Неизвестное поле рабочего интервала')
  if (previous && ['task_id','type','id'].some(key => key in input && input[key] !== previous[key])) reject(400, 'Связь сохранённого интервала нельзя заменить')
  const block = { id: 'block-' + randomUUID(), ...previous, ...fields, type: 'work_block' }
  if (typeof block.id !== 'string' || !/^[\w:-]{1,180}$/.test(block.id)) reject(400, 'Некорректный идентификатор интервала')
  if (!blockTarget(nodes, block.task_id)) reject(409, 'Для интервала нужна существующая незавершённая личная задача')
  validate(block, calendars)
  const existing = data.events.find(event => event.id === block.id)
  if (existing && !previous) {
    if (existing.type === block.type && existing.task_id === block.task_id && editable.every(key => (block[key] ?? null) === (existing[key] ?? null))) return existing
    reject(409, 'Идентификатор интервала уже занят')
  }
  assertAvailable(block, data.events, nodes, verifyWindow)
  if (previous) data.events[data.events.indexOf(previous)] = block
  else data.events.push(block)
  return block
}

// The calendar store serializes read/modify/write, including double-clicks, pushes and retries.
export function eventStore(file) {
  let tail = Promise.resolve()
  return function change(operation) {
    const next = tail.then(async () => {
      let data
      try { data = JSON.parse(await fs.readFile(file, 'utf8')) }
      catch (error) { if (error.code !== 'ENOENT') throw error; data = { _type: 'events', events: [] } }
      let saved = JSON.stringify(data)
      const commit = async () => {
        const changed = JSON.stringify(data)
        if (changed === saved) return
        await fs.mkdir(path.dirname(file), { recursive: true })
        data.updated = localDay()
        const temp = file + '.' + randomUUID() + '.tmp'
        try {
          await fs.writeFile(temp, JSON.stringify(data, null, 2))
          await fs.rename(temp, file)
          saved = JSON.stringify(data)
        } finally { await fs.rm(temp, { force: true }) }
      }
      const result = await operation(data, commit)
      await commit()
      return result
    })
    tail = next.catch(() => {})
    return next
  }
}

// Resolve the local start in its own IANA zone. Use an absolute end so that a
// session spanning a daylight-saving transition still lasts its full duration.
function googleTimes(block, zone) {
  const civil = Date.parse(block.date + 'T' + block.time + ':00Z')
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hourCycle: 'h23', minute: '2-digit', second: '2-digit',
  })
  const asCivil = instant => Date.parse(formatter.format(instant).replace(' ', 'T') + 'Z')
  for (const sample of [civil - 86400000, civil, civil + 86400000]) {
    const instant = civil - (asCivil(sample) - sample)
    if (asCivil(instant) !== civil) continue
    return {
      start: { dateTime: new Date(instant).toISOString(), timeZone: zone },
      end: { dateTime: new Date(instant + block.duration_min * 60000).toISOString(), timeZone: zone },
    }
  }
  reject(400, 'В этом часовом поясе указанное время не существует')
}

export async function pushWorkBlocks(data, calendars, client, commit, timeZone) {
  const previouslySent = data.work_block_exports ||= {}
  const desired = new Map()
  for (const block of data.events.filter(item => item.type === 'work_block')) {
    const calendar = calendars.find(cal => cal.id === block.calendar_id && cal.sync_to_gcal === true)
    if (!calendar) continue
    const calendarId = calendar.gcal_calendar_id || 'primary'
    const key = JSON.stringify([calendarId, block.id])
    desired.set(key, { block, calendarId })
  }
  for (const [key, remote] of Object.entries(previouslySent)) {
    if (desired.has(key)) continue
    try { await client.events.delete(remote) }
    catch (error) { if (![404, 410].includes(Number(error.code || error.response?.status))) throw error }
    delete previouslySent[key]
  }
  for (const [key, { block, calendarId }] of desired) {
    if (!previouslySent[key]) {
      previouslySent[key] = { calendarId, eventId: randomUUID().replaceAll('-', '') }
      await commit() // an interrupted insert can still be recovered or removed
    }
    let { eventId } = previouslySent[key]
    const requestBody = { summary: block.title, ...googleTimes(block, block.time_zone || timeZone) }
    try { await client.events.update({ calendarId, eventId, requestBody }) }
    catch (err) {
      const code = Number(err.code || err.response?.status)
      if (![404, 410].includes(code)) throw err
      // Google can retain cancelled ids. Persist a fresh id before the retry.
      if (code === 410) {
        eventId = previouslySent[key].eventId = randomUUID().replaceAll('-', '')
        await commit()
      }
      try { await client.events.insert({ calendarId, requestBody: { ...requestBody, id: eventId } }) }
      catch (failure) {
        if (Number(failure.code || failure.response?.status) !== 409) throw failure
        // A retried insert can also collide with an active remote event. Keep its id.
        let cancelled
        try { cancelled = (await client.events.get({ calendarId, eventId })).data.status === 'cancelled' }
        catch (readError) {
          if (Number(readError.code || readError.response?.status) !== 410) throw readError
          cancelled = true
        }
        if (!cancelled) {
          await client.events.update({ calendarId, eventId, requestBody })
          continue
        }
        eventId = previouslySent[key].eventId = randomUUID().replaceAll('-', '')
        await commit()
        await client.events.insert({ calendarId, requestBody: { ...requestBody, id: eventId } })
      }
    }
  }
  return desired.size
}
