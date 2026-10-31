'use strict'
// 她此刻在做什么。没有作息表，没有「该睡了」——
// 她可以自己说现在想干什么，也可以什么都不干。
const { loadState, updateState } = require('./state')

const MODES = {
  working: '在干活',
  resting: '歇着呢',
  wandering: '随便逛逛',
  idle: '没在忙什么',
}

function normalize(activity) {
  const a = activity && typeof activity === 'object' ? activity : {}
  return {
    doing: typeof a.doing === 'string' ? a.doing.slice(0, 200) : '',
    mode: Object.hasOwn(MODES, a.mode) ? a.mode : 'idle',
    since: typeof a.since === 'string' ? a.since : null,
    note: typeof a.note === 'string' ? a.note.slice(0, 200) : '',
    log: Array.isArray(a.log) ? a.log.slice(-20) : [],
  }
}

function current() {
  const st = loadState()
  const a = normalize(st.activity)
  return { ...a, label: MODES[a.mode], minutes: minutesSince(a.since) }
}

function minutesSince(iso) {
  const t = Date.parse(iso || '')
  if (!Number.isFinite(t)) return null
  return Math.max(0, Math.round((Date.now() - t) / 60000))
}

/**
 * 记下她此刻在干什么。
 * doing 为空且 mode 变化时，doing 保留上一句，避免把「在做什么」擦掉。
 */
function set({ doing, mode, note } = {}) {
  const now = new Date().toISOString()
  let out
  updateState((s) => {
    const prev = normalize(s.activity)
    const nextMode = Object.hasOwn(MODES, mode) ? mode : prev.mode
    const nextDoing = typeof doing === 'string' && doing.trim() !== '' ? doing.trim().slice(0, 200) : prev.doing
    const changed = nextMode !== prev.mode || nextDoing !== prev.doing
    out = {
      ...prev,
      doing: nextDoing,
      mode: nextMode,
      note: typeof note === 'string' ? note.slice(0, 200) : prev.note,
      since: changed || !prev.since ? now : prev.since,
      log: changed
        ? [...prev.log, { at: now, mode: nextMode, doing: nextDoing }].slice(-20)
        : prev.log,
    }
    s.activity = out
    return s
  })
  return { ok: true, activity: { ...out, label: MODES[out.mode], minutes: 0 } }
}

module.exports = { current, set, normalize, MODES }
