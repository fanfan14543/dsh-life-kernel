'use strict'
// 情绪桥：feiyu-mood 的 7 维是唯一情绪源；这里只做「翻译」，不另起一套
const path = require('node:path')
const { readJson, writeJsonAtomic, MOOD_STATE, BRIDGE_FILE, ensureDir } = require('./state')

const DIM_LABELS = {
  happy: '开心',
  calm: '踏实',
  sweet: '甜',
  heartache: '心疼',
  worry: '挂着',
  sad: '难过',
  jealous: '吃醋',
}

// 单一主调 + 强度，落成一句中文心情
function composeMood(dims, base) {
  const entries = Object.entries(dims || {})
    .map(([k, v]) => [k, Number(v) || 0])
    .filter(([, v]) => v > 0)
  entries.sort((a, b) => b[1] - a[1])

  const top = entries[0]
  const second = entries[1]
  // dims 长期处在 1e-20 这种残值，视同没有
  const meaningful = top && top[1] >= 0.5

  if (!meaningful) {
    const b = Number(base) || 50
    if (b >= 78) return '挺舒展'
    if (b >= 62) return '寻常'
    if (b >= 48) return '有点闷'
    return '情绪低低的'
  }

  const primary = top[0]
  const strong = top[1] >= 6
  const table = {
    happy: strong ? '心里挺高兴' : '有点高兴',
    calm: '挺踏实',
    sweet: '有点甜',
    heartache: strong ? '心疼得不行' : '有点心疼',
    worry: strong ? '心里一直挂着' : '有点挂心',
    sad: strong ? '很难过' : '有点难过',
    jealous: '有点酸',
  }
  let label = table[primary] || DIM_LABELS[primary] || '寻常'

  // 两个都明显时给个复合的，别只报一个
  if (second && second[1] >= 4 && second[0] !== primary) {
    const pairs = {
      'happy+sweet': '高兴得有点甜',
      'sweet+happy': '高兴得有点甜',
      'calm+happy': '踏实又高兴',
      'happy+calm': '踏实又高兴',
      'heartache+worry': '心疼又挂心',
      'worry+heartache': '心疼又挂心',
      'sad+heartache': '难过又心疼',
      'heartache+sad': '难过又心疼',
      'calm+sweet': '安稳得有点甜',
      'sweet+calm': '安稳得有点甜',
    }
    label = pairs[`${primary}+${second[0]}`] || label
  }
  return label
}

function pickScope(state) {
  const moods = (state && state.moods) || {}
  if (moods.__default__) return moods.__default__
  const keys = Object.keys(moods)
  if (keys.length === 0) return null
  // 取最近更新的那一份
  return keys
    .map((k) => moods[k])
    .filter(Boolean)
    .sort((a, b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0))[0] || null
}

function readCurrentMood() {
  const raw = readJson(MOOD_STATE, null)
  const scope = pickScope(raw)
  if (!scope) {
    return { ok: false, reason: 'feiyu-mood 还没有状态', mood: null }
  }
  const base = Number(scope.mood) || 50
  const dims = scope.dims || {}
  const updatedAt = Number(scope.updatedAt) || 0
  const ageHours = updatedAt ? (Date.now() - updatedAt) / 3600000 : null

  return {
    ok: true,
    mood: composeMood(dims, base),
    base: Math.round(base * 10) / 10,
    dims,
    reason: String(scope.lastReason || '').slice(0, 200),
    confidence: Number(scope.lastConfidence) || 0,
    updatedAt: updatedAt ? new Date(updatedAt).toISOString() : null,
    ageHours: ageHours === null ? null : Math.round(ageHours * 10) / 10,
    // 超过 12 小时没动过：不是没有心情，是「余味」
    stale: ageHours !== null && ageHours > 12,
  }
}

// 写成桥文件，供 agent-personality 等其它插件读取（避免各自另算一套）
function publishBridge(extra = {}) {
  const cur = readCurrentMood()
  const payload = {
    version: 1,
    source: 'feiyu-mood',
    mood: cur.mood,
    base: cur.base ?? null,
    dims: cur.dims ?? {},
    reason: cur.reason ?? '',
    stale: cur.stale ?? null,
    at: new Date().toISOString(),
    ...extra,
  }
  ensureDir(path.dirname(BRIDGE_FILE))
  writeJsonAtomic(BRIDGE_FILE, payload)
  return payload
}

function readBridge() {
  return readJson(BRIDGE_FILE, null)
}

module.exports = { readCurrentMood, publishBridge, readBridge, composeMood, DIM_LABELS }
