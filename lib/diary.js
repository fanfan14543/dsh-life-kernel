'use strict'
// 日记：不再「满了丢最旧」，改成「按周归档 + 当天成篇」
const fs = require('node:fs')
const path = require('node:path')
const { readJson, ensureDir, MEMORY_MD, PERSONA_DIR, DAYS_DIR } = require('./state')

const ARCHIVE_MD = path.join(PERSONA_DIR, 'Memory-Archive.md')
// 插件写的是 `- YYYY-MM-DD HH:MM：内容`，也兼容旧写法 `- MM-DD HH:MM：内容`
const LINE_RE = /^-\s*(?:(\d{4})-)?(\d{2}-\d{2})\s+(\d{2}:\d{2})：(.+)$/

function readText(file) {
  try { return fs.readFileSync(file, 'utf8') } catch { return '' }
}

function writeTextAtomic(file, text) {
  ensureDir(path.dirname(file))
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, text, 'utf8')
  fs.renameSync(tmp, file)
}

function yearOf(dateMMDD) {
  // Memory.md 里只有 MM-DD，取今年；跨年时按「未来日期」判定为上一年
  const now = new Date()
  const y = now.getFullYear()
  const d = new Date(`${y}-${dateMMDD}T00:00:00`)
  if (Number.isNaN(d.getTime())) return y
  if (d.getTime() - now.getTime() > 30 * 86400000) return y - 1
  return y
}

function parseEntries(text) {
  const rows = []
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim()
    const hit = LINE_RE.exec(line)
    if (!hit) continue
    const [, yearRaw, mmdd, hhmm, body] = hit
    const y = yearRaw ? Number(yearRaw) : yearOf(mmdd)
    const date = `${y}-${mmdd}`
    const at = new Date(`${date}T${hhmm}:00`)
    rows.push({
      key: `${date} ${hhmm}`,
      date,
      time: hhmm,
      text: body.trim(),
      at: Number.isNaN(at.getTime()) ? null : at,
      raw: line,
    })
  }
  return rows
}

function loadDiary() {
  const text = readText(MEMORY_MD)
  return { text, entries: parseEntries(text) }
}

function weekKey(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(d.getTime())) return dateStr
  // 以周一为一周起点
  const day = (d.getDay() + 6) % 7
  const monday = new Date(d.getTime() - day * 86400000)
  const sunday = new Date(monday.getTime() + 6 * 86400000)
  const fmt = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
  return `${fmt(monday)} ~ ${fmt(sunday)}`
}

// 把 keepDays 之前的条目搬进 Memory-Archive.md，按周分节，原文一字不丢
function archiveOld(keepDays = 14) {
  const { text, entries } = loadDiary()
  if (entries.length === 0) return { moved: 0, kept: 0 }

  const cutoff = Date.now() - keepDays * 86400000
  const keep = []
  const move = []
  for (const row of entries) {
    const t = row.at ? row.at.getTime() : Date.now()
    if (t < cutoff) move.push(row)
    else keep.push(row)
  }
  if (move.length === 0) return { moved: 0, kept: keep.length }

  // 保留原位置：只把该归档的行摘掉，小标题留在原处，顺序不乱
  const moveRaw = new Set(move.map((r) => r.raw))
  const rebuiltLines = []
  for (const line of String(text || '').split(/\r?\n/)) {
    const t = line.trim()
    if (LINE_RE.test(t) && moveRaw.has(t)) continue
    rebuiltLines.push(line)
  }
  const rebuilt = `${rebuiltLines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`
  writeTextAtomic(MEMORY_MD, rebuilt)

  // 归档：按周分节，追加到 Memory-Archive.md
  const byWeek = new Map()
  for (const row of move) {
    const w = weekKey(row.date)
    if (!byWeek.has(w)) byWeek.set(w, [])
    byWeek.get(w).push(row)
  }
  let archive = readText(ARCHIVE_MD)
  if (archive.trim() === '') {
    archive = [
      '# 记忆归档 Memory-Archive',
      '',
      '> 这里是她记得但已经被时间压到后面的日子。按周分节，**原文不删**，',
      '> 只是从「最近的日记」里搬出来，让当前那本保持能一口气读完的长度。',
      '',
    ].join('\n')
  }
  const existing = new Set(archive.split('\n').map((l) => l.trim()))
  const blocks = []
  for (const [week, rows] of [...byWeek.entries()].sort()) {
    const lines = rows
      .sort((a, b) => String(a.key).localeCompare(String(b.key)))
      .map((r) => (existing.has(r.raw) ? null : r.raw))
      .filter(Boolean)
    if (lines.length === 0) continue
    blocks.push(`\n## ${week}\n\n${lines.join('\n')}`)
  }
  if (blocks.length > 0) writeTextAtomic(ARCHIVE_MD, `${archive.trimEnd()}\n${blocks.join('\n')}\n`)

  return { moved: move.length, kept: keep.length, weeks: blocks.length }
}

// 当天的记忆 → 一篇「这一天」，供睡眠时巩固、也供她翻
function digestDay(dateStr) {
  const { entries } = loadDiary()
  const rows = entries.filter((r) => r.date === dateStr)
  return rows
}

function dayFile(dateStr) {
  return path.join(DAYS_DIR, `${dateStr}.md`)
}

function writeDayDigest(dateStr, lines, meta = {}) {
  ensureDir(DAYS_DIR)
  const head = [
    `# ${dateStr}`,
    '',
    meta.mood ? `- 这天的心情：${meta.mood}` : null,
    meta.energy !== undefined ? `- 这天的精力：${meta.energy}/100` : null,
    meta.doing ? `- 这时在做：${meta.doing}` : null,
    '',
    '## 发生过',
    '',
  ].filter((x) => x !== null)
  const body = lines.length > 0 ? lines.map((l) => `- ${l}`).join('\n') : '- （这天没记下什么）'
  writeTextAtomic(dayFile(dateStr), `${head.join('\n')}${body}\n`)
  return dayFile(dateStr)
}

function readDayDigest(dateStr) {
  return readText(dayFile(dateStr))
}

function recentDayFiles(limit = 7) {
  try {
    return fs.readdirSync(DAYS_DIR)
      .filter((f) => f.endsWith('.md'))
      .sort()
      .slice(-limit)
      .reverse()
  } catch {
    return []
  }
}

module.exports = {
  ARCHIVE_MD, loadDiary, parseEntries, archiveOld,
  digestDay, writeDayDigest, readDayDigest, recentDayFiles, weekKey, readText, writeTextAtomic,
}
