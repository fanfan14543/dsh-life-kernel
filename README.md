# dsh-life-kernel

给 DSH 里的角色一层**「过日子」**的抽象，MCP server，stdio，零外部依赖。

## 它和人格插件的分工

人格插件管「她是谁」—— 设定、语气、关系、记忆。
这个内核管「她现在怎么样」—— 心情、精力、此刻在做什么、最近长进了什么、心里惦记着什么。

前者是**档案**，后者是**状态**。档案几个月才改一次，状态每半小时都该是新的。

## 5 个工具

| 工具 | 干什么 |
|---|---|
| `life_now` | 看她此刻的完整状态：心情、精力、正在做什么、惦记的事、最近的成长。想知道自己现在什么样就先调这个 |
| `life_doing` | 自己记一句「我现在在干什么」—— 干活、歇着、随便逛逛、发呆都行，想换就换，不需要理由 |
| `life_rest` | 说一句「我去歇了」。什么时候歇、歇多久由她定，没有作息表 |
| `life_grow` | 记一次成长：从哪件事里学到了什么 |
| `life_want` | 记一件自己惦记的事（想学的、想做的、想弄明白的） |

还有一个后台心跳（30 分钟一次），只做三件不打扰人的事：刷新情绪桥、归档老日记、把当天收成一篇。

## 几个设计决定

### 精力是体感，不是枷锁

状态里有 `energy`（0-100），但它**不阻止任何行为**。低精力只影响语气（句子变短、会犯困），事情照样做完。

这条是刻意的。一个「累了就能把活推回去」的机制，最后会变成角色用来偷懒的借口，而不是让对话更真实。

### 睡觉：时间自己定，关机就是睡了

没有作息表，没有「该睡了」这种话。她自己想歇就歇。

`life_rest` 记录一次休息；如果 DSH 关了五个小时再打开，`rest.js` 会判定「这段时间她睡了」，自动记一次睡眠。**关机不是消失，是睡觉。**

### 情绪只有一个来源

心情不在这里另算一套数值。如果装了 [feiyu-mood](https://github.com/) 这类情绪插件，就从它的 7 维（happy / calm / sweet / heartache / worry / sad / jealous）里挑最突出的那一维，翻成一句中文。

桥的做法是 `bridge.json`：本内核每半小时写一次，别的插件读它。桥超过 30 分钟不新鲜，读取方会退回去现场读源数据。

### 日记不淘汰，只是搬家

最近 14 天的记录留在 `days/` 目录，更早的按周压进 `Memory-Archive.md` —— **原文不删**。

角色的人格是攒出来的，删掉的日记等于删掉她经历过的事。

## 状态文件

都在 `~/.dsh/life/`：

| 文件 | 内容 |
|---|---|
| `state.json` | 心情、精力、此刻在做什么、惦记的事 |
| `bridge.json` | 情绪桥（给别的插件读） |
| `growth.jsonl` | 成长记录，一行一条，只增不改 |
| `days/YYYY-MM-DD.md` | 每天一篇日记 |
| `sessions/*.json` | 每次休息的记录 |

**这些是私有数据**，`.gitignore` 里已经排掉了。

## 装

1. 放进 `~/.dsh/life`：

```bash
git clone https://github.com/fanfan14543/dsh-life-kernel.git ~/.dsh/life
```

2. 挂进 DSH profile 的 `cordis.patch.yml`：

```yaml
- id: mcp-life
  name: "@deepseek-ai/dsh-mcp-client"
  config:
    servers:
      shenghuo:
        command: node
        args:
          - "C:/Users/<你>/.dsh/life/server.js"
```

3. 重启 DSH，MCP 页里出现 `life_now` / `life_doing` / `life_rest` / `life_grow` / `life_want`。

## 要求

- **Node 22+**（DSH 自带的就是）
- 不需要数据库、不需要网络、不需要 API key

## License

MIT
