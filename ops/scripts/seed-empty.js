#!/usr/bin/env node
// Creates empty brain/content structure for a fresh Life OS install.
// Run once after cloning: node ops/scripts/seed-empty.js
// Safe to re-run — skips files that already exist.

import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..')
const CONTENT = path.join(ROOT, 'brain/content')

const today = new Date().toISOString().slice(0, 10)

const files = {
  'tree/nodes.json': {
    _type: 'tree',
    updated: today,
    nodes: [
      { id: 'root-health',    title: 'Здоровье',      parent_id: null, color: '#3B82F6', status: null, due: null, notes: null, created: today, updated: today },
      { id: 'root-work',      title: 'Работа',         parent_id: null, color: '#22C55E', status: null, due: null, notes: null, created: today, updated: today },
      { id: 'root-study',     title: 'Учёба',          parent_id: null, color: '#EF4444', status: null, due: null, notes: null, created: today, updated: today },
      { id: 'root-growth',    title: 'Саморазвитие',   parent_id: null, color: '#06B6D4', status: null, due: null, notes: null, created: today, updated: today },
      { id: 'root-relations', title: 'Отношения',      parent_id: null, color: '#EC4899', status: null, due: null, notes: null, created: today, updated: today },
      { id: 'root-leisure',   title: 'Досуг',          parent_id: null, color: '#F59E0B', status: null, due: null, notes: null, created: today, updated: today },
    ],
  },

  'inbox/current.json': {
    _type: 'inbox',
    updated: today,
    items: [],
  },

  'insights/index.json': {
    updated: today,
    insights: [],
  },

  'memories/index.json': {
    _type: 'memories',
    updated: today,
    entries: [],
  },

  'feed/reactions.json': {
    _type: 'feed_reactions',
    updated: today,
    reactions: [],
  },

  'habits/definitions.json': {
    categories: [
      {
        id: 'base',
        label: 'База',
        habits: [
          {
            id: 'sleep_time',
            label: 'Сон до 00:00',
            detail: 'Цель: лечь до полуночи. Кликни для выбора времени.',
            kind: 'time_window',
            time_window: { start: '22:00', end: '00:00' },
            max_score: 2,
            active: true,
          },
          {
            id: 'morning_water',
            label: 'Вода утром',
            detail: 'Выпил стакан воды после пробуждения',
            kind: 'toggle',
            max_score: 1,
            active: true,
          },
          {
            id: 'outdoor_air',
            label: 'Свежий воздух',
            detail: 'Провёл время на улице',
            kind: 'toggle',
            max_score: 1,
            active: true,
          },
        ],
      },
      {
        id: 'activity',
        label: 'Активность',
        habits: [
          {
            id: 'exercise',
            label: 'Физическая нагрузка',
            detail: 'Тренировка, зал, пробежка или зарядка',
            kind: 'toggle',
            max_score: 2,
            active: true,
          },
          {
            id: 'work_done',
            label: 'Продуктивный день',
            detail: 'Сделал что-то важное по работе/учёбе',
            kind: 'toggle',
            max_score: 1,
            active: true,
          },
        ],
      },
      {
        id: 'nutrition',
        label: 'Питание',
        habits: [
          {
            id: 'breakfast',
            label: 'Завтрак',
            detail: 'Позавтракал',
            kind: 'toggle',
            max_score: 1,
            active: true,
          },
          {
            id: 'no_junk',
            label: 'Без фастфуда',
            detail: 'Не ел фастфуд',
            kind: 'toggle',
            max_score: 1,
            active: true,
          },
        ],
      },
    ],
  },

  'lists/_index.json': {
    _type: 'list_collection',
    updated: today,
    _config: { defaultTab: 'films', defaultView: 'cards' },
    collections: [
      { id: 'films',       label: 'Фильмы',       file: 'films.json' },
      { id: 'series',      label: 'Сериалы',       file: 'series.json' },
      { id: 'games',       label: 'Игры',           file: 'games.json' },
      { id: 'books',       label: 'Книги',          file: 'books.json' },
      { id: 'wishes',      label: 'Желания',        file: 'wishes.json' },
      { id: 'restaurants', label: 'Рестораны',      file: 'restaurants.json' },
      { id: 'travel',      label: 'Путешествия',    file: 'travel.json' },
      { id: 'shopping',    label: 'Покупки',        file: 'shopping.json' },
    ],
  },

  'lists/films.json':       { items: [] },
  'lists/series.json':      { items: [] },
  'lists/games.json':       { items: [] },
  'lists/books.json':       { items: [] },
  'lists/wishes.json':      { items: [] },
  'lists/restaurants.json': { items: [] },
  'lists/travel.json':      { items: [] },
  'lists/shopping.json':    { items: [] },
}

const dirs = [
  'habits/log',
  'memories/photos',
  'calendars',
]

async function seed() {
  let created = 0
  let skipped = 0

  for (const [rel, data] of Object.entries(files)) {
    const target = path.join(CONTENT, rel)
    await fs.mkdir(path.dirname(target), { recursive: true })
    try {
      await fs.access(target)
      console.log(`  skip  ${rel}`)
      skipped++
    } catch {
      await fs.writeFile(target, JSON.stringify(data, null, 2))
      console.log(`  wrote ${rel}`)
      created++
    }
  }

  for (const rel of dirs) {
    await fs.mkdir(path.join(CONTENT, rel), { recursive: true })
  }

  // Empty brain/people and brain/topics dirs
  for (const rel of ['../people', '../topics']) {
    await fs.mkdir(path.join(CONTENT, rel), { recursive: true })
  }

  console.log(`\nDone: ${created} created, ${skipped} skipped.`)
  if (created > 0) console.log('Next: copy .env.example → .env and fill in your API keys.')
}

seed().catch(e => { console.error(e); process.exit(1) })
