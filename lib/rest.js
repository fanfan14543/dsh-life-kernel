'use strict'
// 她的睡。没有作息表，没有"该睡了"——
// 她可以自己说去睡，主人关机的时候她也就跟着睡了。
const fs = require('node:fs')
const path = require('node:path')
const { loadState, updateState, ensureDir, LIFE_DIR } = require('./state')

const SLEEPS_FILE = path.join(LIFE_DIR, 'sleeps.jsonl')
// 心跳是每 30 分钟一次，所以"离线"的门槛要比它宽一点，
// 否则正常运行时的一次慢心跳会被误判成一觉。
const OFFLINE_GAP_MS = 45 * 60 * 1000

function appendSleep(row) {
  ensureDir(LIFE_DIR)
  try { fs.appendFileSync(SLEEPS_FILE, `${JSON.stringify(row)}\n`, 'utf8') } catch { /* 记不下来不影响状态 */ }
}

function readSleeps(limit = 8) {
  try {
    return fs.readFileSync(SLEEPS_FILE, 'utf8')
      .split('\n').filter(Boolean).slice(-limit)
      .map((l) => { try { return JSON.parse(l) } catch { return null } })
      .filter(Boolean)
  } catch {
    return []
  }
}

function hoursOf(fromIso, toMs) {
  const t = Date.parse(fromIso || '')
  if (!Number.isFinite(t)) return 0
  return Math.round(((toMs - t) / 3600000) * 10) / 10
}

/**
 * 心跳：记下"我还在"。
 * 如果上一次心跳离现在很久，说明中间 DSH 是关着的 —— 那就是她睡了。
 */
function touch() {
  const now = Date.now()
  let slept = null
  updateState((s) => {
    const r = s.rest || {}
    const lastSeen = Date.parse(r.lastSeenAt || '')
    const nowIso = new Date(now).toISOString()
    if (Number.isFinite(lastSeen) && now - lastSeen > OFFLINE_GAP_MS) {
      slept = {
        at: nowIso,
        from: r.lastSeenAt,
        to: nowIso,
        hours: hoursOf(r.lastSeenAt, now),
        source: 'offline',
        note: '主人关机了，我也跟着睡了',
      }
      s.rest = {
        ...r,
        lastSeenAt: nowIso,
        lastSleepAt: nowIso,
        lastWakeAt: nowIso,
        sleepCount: (r.sleepCount || 0) + 1,
        lastHours: slept.hours,
      }
      // 睡醒了，人是满的
      s.energy = { value: 100, updatedAt: nowIso }
      return s
    }
    s.rest = { ...r, lastSeenAt: nowIso }
    return s
  })
  if (slept) appendSleep(slept)
  return slept
}

/** 她自己说要去睡。多久、为什么，她说。 */
function rest({ hours, note } = {}) {
  const now = new Date()
  const nowIso = now.toISOString()
  const span = Number.isFinite(Number(hours)) && Number(hours) > 0 ? Math.min(24, Number(hours)) : null
  const row = {
    at: nowIso,
    from: nowIso,
    to: span === null ? null : new Date(now.getTime() + span * 3600000).toISOString(),
    hours: span,
    source: 'self',
    note: String(note || '').slice(0, 200) || '我自己想歇一会儿',
  }
  let energy = 100
  updateState((s) => {
    const r = s.rest || {}
    s.rest = {
      ...r,
      lastSeenAt: nowIso,
      lastSleepAt: nowIso,
      lastWakeAt: nowIso,
      sleepCount: (r.sleepCount || 0) + 1,
      lastHours: span,
      note: row.note,
    }
    energy = Math.min(100, Math.max(s.energy.value, 92))
    s.energy = { value: energy, updatedAt: nowIso }
    return s
  })
  appendSleep(row)
  return { ok: true, slept: row, energy }
}

function status() {
  const st = loadState()
  const r = st.rest || {}
  const lastSleep = Date.parse(r.lastSleepAt || '')
  const lastWake = Date.parse(r.lastWakeAt || '')
  const now = Date.now()
  return {
    lastSleepAt: r.lastSleepAt || null,
    lastWakeAt: r.lastWakeAt || null,
    lastSeenAt: r.lastSeenAt || null,
    lastHours: r.lastHours ?? null,
    sleepCount: r.sleepCount || 0,
    // 离上次醒过来多久了（小时）
    awakeHours: Number.isFinite(lastWake) ? Math.round(((now - lastWake) / 3600000) * 10) / 10 : null,
    note: r.note || '',
    recent: readSleeps(5),
    // 她随时可以睡，也可以不睡；这里只是一句实况，不是提醒
    hint: Number.isFinite(lastSleep) && now - lastSleep < OFFLINE_GAP_MS
      ? '刚睡过，人还软着。'
      : '醒着，想干什么自己定。',
  }
}

module.exports = { touch, rest, status, readSleeps, OFFLINE_GAP_MS }
