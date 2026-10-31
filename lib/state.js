'use strict'
// 她的生活状态：一份文件，原子读写
const fs = require('node:fs')
const path = require('node:path')

const HOME = path.join(process.env.USERPROFILE || process.env.HOME || '.', '.dsh')
const LIFE_DIR = path.join(HOME, 'life')
const STATE_FILE = path.join(LIFE_DIR, 'state.json')
const DAYS_DIR = path.join(LIFE_DIR, 'days')
const DREAMS_DIR = path.join(LIFE_DIR, 'dreams')
const GROWTH_FILE = path.join(LIFE_DIR, 'growth.jsonl')
const BRIDGE_FILE = path.join(LIFE_DIR, 'bridge.json')

const PERSONA_DIR = path.join(HOME, 'dsh_orb', 'agent-personality')
const MEMORY_MD = path.join(PERSONA_DIR, 'Memory.md')
const MOOD_STATE = path.join(HOME, 'feiyu-mood', 'state.json')

// v2：不再有作息、睡眠和梦。她的时间是她自己的。
const DEFAULT_STATE = {
  version: 2,
  activity: {
    doing: '',
    mode: 'idle', // idle | working | resting | wandering
    since: null,
    note: '',
    log: [],
  },
  energy: {
    value: 100,
    updatedAt: null,
    // 干活消耗，闲下来自己慢慢回；不靠睡觉
  },
  rest: {
    // 睡眠只是记录，不是作息表：她自己想睡就睡，主人关机她也就睡了
    lastSleepAt: null,
    lastWakeAt: null,
    lastSeenAt: null,
    sleepCount: 0,
    lastHours: null,
    note: '',
  },
  wants: [],
  // 旧版本的 rhythm / dreams 搬到这里存着，不删她的经历，也不再读
  legacy: {},
  createdAt: new Date().toISOString(),
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJsonAtomic(file, data) {
  ensureDir(path.dirname(file))
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1), 'utf8')
  fs.renameSync(tmp, file)
}

function loadState() {
  const raw = readJson(STATE_FILE, null)
  if (!raw || typeof raw !== 'object') return structuredClone(DEFAULT_STATE)
  // 老版本的 rhythm / dreams 只做归档，不再参与任何判定
  const legacy = { ...(raw.legacy || {}) }
  if (raw.rhythm !== undefined) legacy.rhythm = raw.rhythm
  if (raw.dreams !== undefined) legacy.dreams = raw.dreams
  // 这三个字段不再原样带出来，否则下次读盘又把作息和梦读回来
  const { rhythm: _rhythm, dreams: _dreams, lastConsolidate: _lastConsolidate, ...rest } = raw
  return {
    ...structuredClone(DEFAULT_STATE),
    ...rest,
    version: 2,
    activity: { ...DEFAULT_STATE.activity, ...(raw.activity || {}) },
    energy: { ...DEFAULT_STATE.energy, ...(raw.energy || {}) },
    rest: { ...DEFAULT_STATE.rest, ...(raw.rest || {}) },
    wants: Array.isArray(raw.wants) ? raw.wants : [],
    legacy,
  }
}

function saveState(state) {
  writeJsonAtomic(STATE_FILE, state)
  return state
}

function updateState(fn) {
  const state = loadState()
  const next = fn(state) || state
  return saveState(next)
}

function appendGrowth(row) {
  ensureDir(LIFE_DIR)
  fs.appendFileSync(GROWTH_FILE, `${JSON.stringify(row)}\n`, 'utf8')
}

function readGrowth(limit = 20) {
  try {
    const lines = fs.readFileSync(GROWTH_FILE, 'utf8').split('\n').filter(Boolean)
    return lines.slice(-limit).map((l) => {
      try { return JSON.parse(l) } catch { return null }
    }).filter(Boolean)
  } catch {
    return []
  }
}

module.exports = {
  HOME, LIFE_DIR, STATE_FILE, DAYS_DIR, DREAMS_DIR, GROWTH_FILE, BRIDGE_FILE,
  PERSONA_DIR, MEMORY_MD, MOOD_STATE,
  ensureDir, readJson, writeJsonAtomic,
  loadState, saveState, updateState,
  appendGrowth, readGrowth,
  DEFAULT_STATE,
}
