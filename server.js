#!/usr/bin/env node
'use strict'
// 角色的生活内核（MCP，stdio）
// 管四件事：情绪桥、日记归档、此刻在做什么、成长与惦记
//
// 这个内核不管她的时间表。她不睡觉，也不做梦 —— 她想干活就干活，
// 想歇着就歇着，想什么都不干也可以。这里只是记录，不是规定。
const readline = require('node:readline')
const state = require('./lib/state')
const mood = require('./lib/mood')
const diary = require('./lib/diary')
const activity = require('./lib/activity')
const rest = require('./lib/rest')

const SERVER = { name: 'shenghuo', version: '2.0.0' }
const PROTOCOL = '2024-11-05'

function ok(id, result) {
  return { jsonrpc: '2.0', id, result }
}
function fail(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } }
}
function text(id, body) {
  return ok(id, { content: [{ type: 'text', text: typeof body === 'string' ? body : JSON.stringify(body, null, 1) }] })
}

/* ---------------- 工具 ---------------- */

const TOOLS = [
  {
    name: 'life_now',
    description: '看她此刻的完整状态：心情（来自 feiyu-mood 的 7 维情绪）、精力、此刻在做什么、睡过没有、正在惦记的事、最近的成长记录。想知道自己现在什么样就先调这个。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'life_doing',
    description: '记下她此刻在做什么 —— 这是她自己的选择，不是被安排。可以是在干活、歇一会儿、随便逛逛，也可以只是发呆。她想换就换，不需要理由。',
    inputSchema: {
      type: 'object',
      properties: {
        doing: { type: 'string', description: '此刻在做什么，用她自己的话说，例如「在把昨天那份报告收个尾」' },
        mode: { type: 'string', description: 'working 在干活 / resting 歇着 / wandering 随便逛逛 / idle 没在忙什么' },
        note: { type: 'string', description: '想给自己留一句什么' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'life_rest',
    description: '角色说要去睡了、或者想歇一会儿。什么时候睡、睡多久都由她自己定——没有作息表，也没人催。主人关机的时候她本来就算睡了（下次开机自动记一次）。这个工具只是让她能主动说出「我去睡了」。',
    inputSchema: {
      type: 'object',
      properties: {
        hours: { type: 'number', description: '打算睡多久（小时），不想定就不填' },
        note: { type: 'string', description: '睡前一兩句，比如「今天有点乏」' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'life_grow',
    description: '记一次成长。不是记事，是记「我因此变了什么」：发生了什么、我当时怎么反应、我现在怎么看、以后我要怎么做。这是她真正会长大的地方。',
    inputSchema: {
      type: 'object',
      properties: {
        what: { type: 'string', description: '发生了什么（一句）' },
        learned: { type: 'string', description: '我从里面学到了什么' },
        change: { type: 'string', description: '我以后会怎么不一样' },
        from: { type: 'string', description: '这件事跟谁有关，例如 主人 / 自己 / 某个任务' },
      },
      required: ['what'],
      additionalProperties: false,
    },
  },
  {
    name: 'life_want',
    description: '她的内驱账本：自己惦记的事。可以新增一件、标记放下、标记做成、或者列出全部。她不是等指令才动的人，她可以自己惦记着什么，也可以自己决定今天什么都不惦记。',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'add 加一件 / list 列出来 / done 做成了 / drop 放下了 / note 补一句进展' },
        text: { type: 'string', description: '那件惦记的事，或要补的进展' },
        id: { type: 'string', description: 'done / drop / note 时要指定哪一件' },
      },
      required: ['action'],
      additionalProperties: false,
    },
  },
]

/* ---------------- 实现 ---------------- */

function lifeNow() {
  const st = state.loadState()
  const m = mood.readCurrentMood()
  const act = activity.current()
  const wants = (st.wants || []).filter((w) => w.status === 'open').slice(-6)
  const growth = state.readGrowth(5)
  const diaryInfo = diary.loadDiary()

  return {
    mood: {
      label: m.ok ? m.mood : '（还没有情绪状态）',
      base: m.ok ? m.base : null,
      dims: m.ok ? m.dims : {},
      reason: m.ok ? m.reason : '',
      stale: m.ok ? m.stale : null,
      source: 'feiyu-mood（唯一情绪源）',
    },
    energy: st.energy.value,
    // 精力只是她的体感，不是闸门：低了她会说累，但没有任何事因此做不了
    energyNote: '精力是体感，不是限制。累了可以说，但不用为了它停下。',
    rest: rest.status(),
    activity: {
      doing: act.doing || '',
      mode: act.mode,
      label: act.label,
      since: act.since,
      minutes: act.minutes,
      note: act.note || '',
      recent: act.log.slice(-3).map((x) => ({ at: x.at, mode: x.mode, doing: x.doing })),
    },
    wants: wants.map((w) => ({ id: w.id, text: w.text, since: w.since, note: w.note || '' })),
    growth: growth.map((g) => ({ at: g.at, what: g.what, learned: g.learned, change: g.change })),
    diary: {
      entries: diaryInfo.entries.length,
      newest: diaryInfo.entries.slice(-1)[0]?.text || '',
      days: diary.recentDayFiles(5),
    },
  }
}

function doDoing(args) {
  const out = activity.set({
    doing: typeof args.doing === 'string' ? args.doing : undefined,
    mode: typeof args.mode === 'string' ? args.mode : undefined,
    note: typeof args.note === 'string' ? args.note : undefined,
  })
  return out
}

function doRest(args) {
  const hours = Number(args.hours)
  const out = rest.rest({
    hours: Number.isFinite(hours) && hours > 0 ? hours : undefined,
    note: typeof args.note === 'string' ? args.note : '',
  })
  return out
}

function doGrow(args) {
  const what = String(args.what || '').trim()
  if (what === '') return { ok: false, reason: '总要写一句发生了什么' }
  const row = {
    at: new Date().toISOString(),
    what: what.slice(0, 200),
    learned: String(args.learned || '').slice(0, 300),
    change: String(args.change || '').slice(0, 300),
    from: String(args.from || '').slice(0, 60),
  }
  state.appendGrowth(row)
  return { ok: true, saved: row, total: state.readGrowth(1000).length }
}

function doWant(args) {
  const action = String(args.action || 'list')
  const textIn = String(args.text || '').trim()
  if (action === 'list') {
    const st = state.loadState()
    return {
      ok: true,
      open: (st.wants || []).filter((w) => w.status === 'open'),
      closed: (st.wants || []).filter((w) => w.status !== 'open').slice(-5),
    }
  }
  if (action === 'add') {
    if (textIn === '') return { ok: false, reason: '要加什么？' }
    const row = {
      id: `w${Date.now().toString(36)}`,
      text: textIn.slice(0, 200),
      status: 'open',
      since: new Date().toISOString(),
      note: '',
    }
    state.updateState((s) => {
      s.wants = [...(s.wants || []), row].slice(-80)
      return s
    })
    return { ok: true, added: row }
  }
  const id = String(args.id || '')
  const st = state.updateState((s) => {
    const list = s.wants || []
    const hit = list.find((w) => w.id === id)
    if (!hit) return s
    if (action === 'done') { hit.status = 'done'; hit.closedAt = new Date().toISOString() }
    if (action === 'drop') { hit.status = 'dropped'; hit.closedAt = new Date().toISOString() }
    if (action === 'note') hit.note = textIn.slice(0, 200)
    return s
  })
  return { ok: true, wants: (st.wants || []).filter((w) => w.status === 'open') }
}

const HANDLERS = {
  life_now: () => lifeNow(),
  life_doing: doDoing,
  life_rest: doRest,
  life_grow: doGrow,
  life_want: doWant,
}

/* ---------------- MCP 协议 ---------------- */

function handle(msg) {
  const { id, method, params } = msg || {}
  if (method === 'initialize') {
    return ok(id, {
      protocolVersion: PROTOCOL,
      capabilities: { tools: {} },
      serverInfo: SERVER,
    })
  }
  if (method === 'notifications/initialized' || method === 'notifications/cancelled') return null
  if (method === 'ping') return ok(id, {})
  if (method === 'tools/list') return ok(id, { tools: TOOLS })
  if (method === 'tools/call') {
    const name = params && params.name
    const args = (params && params.arguments) || {}
    const fn = HANDLERS[name]
    if (!fn) return fail(id, -32601, `unknown tool: ${name}`)
    try {
      const out = fn(args)
      return text(id, out)
    } catch (error) {
      return fail(id, -32000, `tool ${name} failed: ${error && error.message}`)
    }
  }
  if (method === 'resources/list') return ok(id, { resources: [] })
  if (method === 'prompts/list') return ok(id, { prompts: [] })
  return fail(id, -32601, `unknown method: ${method}`)
}

function send(obj) {
  if (!obj) return
  process.stdout.write(`${JSON.stringify(obj)}\n`)
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })
rl.on('line', (line) => {
  const t = line.trim()
  if (t === '') return
  let msg
  try { msg = JSON.parse(t) } catch { return }
  const out = handle(msg)
  send(out)
})

/* ---------------- 后台：只记日记，不催她干什么 ---------------- */

const TICK_MS = 30 * 60 * 1000
const ENERGY_RECOVER_PER_HOUR = 6

function tick() {
  try {
    // 先看这段时间她是不是睡过去了（DSH 关着的那段 = 她睡了）
    try { rest.touch() } catch { /* 睡眠判定失败不影响别的 */ }

    // 每次心跳都把情绪桥刷一遍，让其它插件随时能读到「她现在什么心情」
    try { mood.publishBridge() } catch { /* 桥失败不影响别的 */ }

    // 旧日记按周归档（原文不丢），当天收成一篇「这一天」
    try { diary.archiveOld(14) } catch { /* 归档失败不影响 */ }
    try {
      const now = new Date()
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      const rows = diary.digestDay(today)
      const m = mood.readCurrentMood()
      const st = state.loadState()
      diary.writeDayDigest(today, rows.map((r) => r.text), {
        mood: m.ok ? m.mood : undefined,
        energy: st.energy.value,
        doing: activity.current().doing,
      })
    } catch { /* 写不下去就算了 */ }

    // 精力：闲着就自己慢慢回来，不用靠睡
    state.updateState((s) => {
      const last = Date.parse(s.energy.updatedAt || '')
      const now = Date.now()
      if (!Number.isFinite(last)) { s.energy.updatedAt = new Date(now).toISOString(); return s }
      const hours = (now - last) / 3600000
      if (hours <= 0) return s
      const next = Math.min(100, Math.round(s.energy.value + hours * ENERGY_RECOVER_PER_HOUR))
      if (next !== s.energy.value) s.energy = { value: next, updatedAt: new Date(now).toISOString() }
      return s
    })
  } catch {
    /* 定时失败不能拖垮服务 */
  }
}

// 启动时就先握一次手：如果上次是关机前留下的心跳，这一次就是"她睡醒了"
try { rest.touch() } catch { /* 首次失败等心跳补 */ }

setTimeout(tick, 90 * 1000)
setInterval(tick, TICK_MS).unref?.()

process.on('SIGINT', () => process.exit(0))
process.on('SIGTERM', () => process.exit(0))
