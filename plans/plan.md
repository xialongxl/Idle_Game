# 《末光咏叹》开发计划

> 基于 `feature_analysis.md` 需求分析，经讨论筛选后的实际开发优先级。

## 排除项（不做）

- ❌ 音效反馈（SFX/BGM）
- ❌ 战斗动画/粒子效果
- ❌ 成就系统
- ❌ 多角色/多职业
- ❌ 转生/轮回系统（Prestige）

---

## Phase 1：强化系统重构

**目标**：为金币建立核心回收循环，同时增加强化决策深度。

**当前问题**：
- 强化 100% 成功率，无风险无决策
- 强化仅是装备详情里的一个按钮，无独立 UI
- 金币中后期必然严重溢出（强化 + 50G 回血是唯二出口）

### 1.1 成功率机制

| 强化等级 | 成功率 | 计算公式 |
|----------|--------|----------|
| +0 → +1 | 95% | 基础成功率 |
| +1 → +2 | 88% | 95% - 7% |
| +2 → +3 | 81% | 95% - 14% |
| ... | ... | 95% - (当前等级 × 7%) |
| +10+ | 30% | 硬下限，不再递减 |

公式：`successRate = Math.max(30, 95 - currentEnhanceLv * 7)` （单位：%）

- **失败惩罚**：仅损失金币，强化等级不变
- **成功效果**：与现有一致（主属性指数增长 + 副属性 +0.5%）

### 1.2 强化费用调整

当前公式：`Math.max(100, (rarityIdx + 1) * 300 * (enhanceLv + 1))`

调整为更激进的指数增长：

```javascript
let baseCost = (rarityIdx + 1) * 300;
let cost = Math.floor(baseCost * Math.pow(1.8, enhanceLv));
```

| 强化等级 | 普通装备 | 终焉装备 |
|----------|----------|----------|
| +1 | 540G | 5,940G |
| +5 | 4,307G | 47,374G |
| +8 | 25,059G | 275,649G |
| +10 | 81,117G | 892,287G |
| +12 | 262,819G | 2,891,009G |

结合成功率递减，+10 以上的期望消耗会非常高，形成强力金币回收。

### 1.3 强化 UI

从装备详情弹窗中剥离，在背包弹窗中新增"⚒️ 强化"按钮（位于手动分解按钮旁边），点击后切换到强化视图。

**入口位置**：背包弹窗内，与"手动分解"按钮并列，新增"⚒️ 强化锻造"按钮。点击后进入强化模式，背包列表切换为强化装备列表。

**布局设计**（复用背包弹窗的左右结构）：
```
┌─────────────────────────────────────────┐
│  ⚒️ 强化锻造台            [↩ 返回背包]    │
├──────────────────┬──────────────────────┤
│  左侧：装备列表   │  右侧：强化详情       │
│  排序：与终焉精炼  │                      │
│  一致（已装备按   │  装备名 +等级          │
│  槽位顺序顶置，   │  主属性：xxxx          │
│  背包中的在后）   │  副属性：xxxx          │
│                  │                      │
│  [装备中]武器 +3  │  成功率：72.0%         │
│  [装备中]头盔 +5  │  费用：12,500G         │
│  [背包]  法杖 +0  │                      │
│  [背包]  法袍 +2  │  [⚒️ 强化] 按钮        │
│  ...             │                      │
│                  │  连续强化 ×5 ×10 ×MAX │
│                  │  (批量强化直到成功/     │
│                  │   金币耗尽，显示摘要)   │
└──────────────────┴──────────────────────┘
```

**排序规则**（与终焉精炼一致，见 `ui.js:renderRefineList`）：
1. 已装备的装备按固定槽位顺序排列（weapon → head → chest → legs → ring → trinket）
2. 背包中的装备排在后面
3. 已装备的条目标记 `[装备中]`，背景色区分

**功能清单**：
- 背包弹窗内新增"⚒️ 强化锻造"按钮，与"手动分解"并列
- 点击后进入强化模式：左侧切换为强化装备列表，右侧为强化详情
- "↩ 返回背包"按钮可切回普通背包视图
- 强化按钮：单次强化
- 批量强化：×5 / ×10 / ×MAX（自动重复直到成功或金币耗尽，显示结果摘要）
- 强化动画/反馈：成功绿色闪光，失败红色闪光（纯 CSS）

### 1.4 涉及文件

- `engine.js`
  - `Player` 类：新增 `enhanceGear(gear)` 方法，内含成功率判定逻辑
  - 移除 `ui.js` 中的旧 `enhanceGear()` 方法
- `ui.js`
  - 新增 `openEnhanceView()` / `renderEnhanceList()` / `renderEnhanceDetail()` / `doEnhance()` / `batchEnhance()`
  - 在背包弹窗底部操作区新增"⚒️ 强化锻造"按钮（位于手动分解按钮旁）
  - 移除旧强化按钮相关代码（装备详情中的 `enhanceGear` 按钮）
- `index.html` — 无需新增独立 overlay（复用背包弹窗的 modal 结构）
- `data.js` — 无需改动（强化公式在 engine 中计算）

### 1.5 关键注意

- 成功率显示精确到小数点后一位（如 `72.0%`）
- 批量强化结果以摘要形式弹出（"尝试 5 次：成功 2 次，失败 3 次，共消耗 62,500G"）
- 终焉装备的强化费用系数 11x（rarityIdx=8），是核心金币回收大户
- 存档兼容：`enhanceLv` 字段已存在，无需新增；成功率在运行时计算，不持久化

---

## Phase 2：DPS 面板 / 战斗统计

**目标**：让玩家能量化排轴优劣，验证 Build 有效性。

**当前问题**：有文字战斗日志，但无法直观得知秒伤、技能占比。

### 功能清单

| 统计项 | 说明 |
|--------|------|
| 实时 DPS | 最近 5 秒滑动窗口总伤害 / 5 |
| 技能伤害占比 | 各技能伤害占总伤害百分比，降序排列 |
| 暴击率 | 本次战斗实际暴击触发率 |
| 总治疗量 | 所有治疗技能总恢复量 |
| 护盾承伤 | 护盾吸收的总伤害量 |
| 战斗时长 | 从遇到怪物到击杀的用时 |

### 涉及文件

- `engine.js` — 新增 `CombatStats` 类，嵌入 `CombatEngine`；在 `calcDmg()`、`processEffects()` 中埋点记录
- `ui.js` — 新增可折叠 DPS 面板渲染
- `index.html` — 新增 DPS 面板容器 DOM

### 数据结构

```javascript
class CombatStats {
    constructor() { this.reset(); }
    reset() {
        this.startTime = 0;
        this.totalDmg = 0;
        this.totalHeal = 0;
        this.shieldAbsorbed = 0;
        this.critCount = 0;
        this.totalHits = 0;
        this.skillDmgMap = {};  // { skillId: { name, totalDmg, hits, crits } }
        this.recentDmgLog = []; // { timestamp, dmg } 滑动窗口
    }
    recordHit(skillId, skillName, dmg, isCrit) { ... }
    recordHeal(val) { ... }
    recordShieldAbsorb(val) { ... }
    getDPS() { ... }
    getSkillBreakdown() { ... }
    getCritRate() { ... }
}
```

### 关键注意

- `recentDmgLog` 滑动窗口只保留最近 5 秒数据
- 每场战斗开始（`spawnMob()`）时 `reset()`
- DPS 面板通过 `EBus.emit('ui_dps_update', stats)` 每 500ms 刷新一次，避免高频渲染
- 击杀怪物时输出本次战斗摘要到战斗日志

---

## Phase 3：动态技能描述

**目标**：技能说明动态显示实际数值，排轴时有据可依。

**当前问题**：`SKILLS_DB` 中 `desc` 全部为静态字符串，如 `"造成220%伤害"`。

### 实现方案

将 `desc` 字段改为模板格式，UI 渲染时根据玩家当前面板动态替换：

```javascript
// 旧: desc: '[GCD] 造成220%伤害，消耗12法力，冷却8秒。'
// 新: desc: '[GCD] 造成{dmgMult}%攻击力的伤害（约{dmg}），消耗{cost}法力，冷却{cd}秒。'
```

### 涉及文件

- `data.js` — 全部 42 个技能的 `desc` 字段改为模板格式
- `ui.js` — 新增 `renderDynamicDesc(skill, player)` 函数，在技能池/技能轴/Tooltip 处调用

### 模板语法

| 占位符 | 替换逻辑 |
|--------|----------|
| `{dmg}` | `formatNumber(Math.floor(atk * dmgMult * (1 + versa/100)))` |
| `{dmgMult}` | `(skill.dmgMult * 100).toFixed(0)` |
| `{cost}` | `skill.cost` |
| `{cd}` | `(skill.cd / 1000).toFixed(1)` |
| `{heal}` | `formatNumber(Math.floor(max(atk,int) * healMult))` |
| `{dur}` | `(effect.dur / 1000).toFixed(0)` |

### 关键注意

- 保持 `desc` 可读性，模板标记简洁
- 多效果技能（如真言术·慰同时造成伤害和回蓝）按顺序用 `{dmg}` `{heal}` 等依次替换
- `desc` 仅影响技能池/技能轴的 Tooltip 显示，不影响战斗日志输出

---

## Phase 4：进阶拾取过滤

**目标**：允许玩家按词条+品质组合规则精确控制拾取/分解。

**当前问题**：只有一个下拉框选择丢弃品质阈值，无法细粒度过滤。

### 功能清单

| 过滤规则 | 说明 | 示例 |
|----------|------|------|
| 品质门槛 | 低于此品质直接分解 | ≥ 传说 |
| 词条过滤 | 只保留带指定词条的装备 | 戒指必须带 crit |
| 词条数值门槛 | 词条值低于阈值则分解 | crit ≥ 8% |
| 部位独立规则 | 不同部位可设不同规则 | 武器全留，防具只要 haste |

### 涉及文件

- `data.js` — 新增默认过滤规则模板
- `engine.js` — `Player.lootItem()` 中替换原有 `autoThreshold` 逻辑，改为调用 `LootFilter.shouldKeep(gear)`
- `ui.js` — 新增拾取过滤设置面板
- `index.html` — 新增过滤设置面板 DOM

### 数据结构

```javascript
{
    slot: 'ring',              // 部位，null 表示全局
    minRarity: 5,              // 最低品质索引（传说）
    requiredAffixes: ['crit'], // 必须包含的词条
    minAffixValues: {           // 词条最低数值
        crit: 8
    }
}
```

### 关键注意

- 规则存入 `Storage`，持久化
- 优先级：部位规则 > 全局规则 > 旧版品质下拉框（兼容保留）
- 过滤面板提供"快捷预设"按钮（如"只留终焉"、"只留高暴击首饰"）

---

## Phase 5（后调）：商店/黑市系统

金币回收已由强化概率机制承担，商店定位调整为补充性消费，待其他系统稳定后再设计具体商品。

---

## Phase 6（后调）：离线收益计算

**当前问题**：`requestAnimationFrame` 在页面隐藏后暂停或 deltaTime 跳跃。

### 实现概要

1. 监听 `document.visibilitychange`，隐藏时记录 `lastOnlineTimestamp` 到 Storage
2. 页面可见时计算离线时长，超过 30s 触发结算
3. 根据挂机前 DPS + 胜率估算，快速模拟 N 场战斗
4. 批量发放经验/金币/掉落，弹出离线收益报告
5. 离线时长硬上限 8 小时，超时按 8 小时计算

### 涉及文件

- `engine.js` — 新增 `OfflineCalculator` 类、`CombatEngine` 初始化检测
- `ui.js` — 离线收益弹窗
- `index.html` — 弹窗 DOM

---

## Phase 7（后调）：敌方技能与 AI

**当前问题**：`Monster` 类纯粹是数值沙袋，Boss 只是血量和攻击力的倍率提升。

### 实现概要

1. `data.js` 新增 `ENEMY_SKILLS_DB`（眩晕/反伤/护盾/回血/AOE）
2. `Monster` 类扩展 `skills[]`，Boss 随机分配 1-3 个敌方技能
3. `CombatEngine.processMobAI()` 增加敌方技能执行逻辑
4. 新增玩家状态 `stunned`、怪物状态 `reflecting`
5. 让排轴从"打木桩"升级为"对策编排"

### 涉及文件

- `data.js` — `ENEMY_SKILLS_DB`、`BOSS_TEMPLATES`
- `engine.js` — 扩展 `Monster`、`processMobAI()`、新增 `processEnemySkills()`
- `ui.js` — 怪物 Buff 栏、玩家眩晕状态视觉反馈

---

## Phase 3.5：跨平台自适应 UI（CSS 模块化重构 + 响应式）

**目标**：将 CSS 从 `index.html` 的 `<style>` 标签拆分为模块化文件，并实现 PC/移动端自动适配。

### 文件结构

```
css/
├── main.css          # 入口文件：@import 其他文件 + 响应式规则
├── base.css          # 公共样式：变量、重置、按钮、颜色、日志等
├── layout-pc.css     # PC 端布局：三列宽度、网格、间距
└── layout-mobile.css # 移动端覆盖：单列、全宽、弹窗适配、Tab 导航
```

### `index.html` 修改

1. 添加 `<meta name="viewport">` 标签
2. 删除 `<style>` 全部内容，替换为 `<link rel="stylesheet" href="css/main.css">`
3. 在 `.wrapper` 之前添加手机端 Tab 导航 HTML

### 手机端 Tab 导航

`<nav class="mobile-tabs">` 三个按钮切换角色/战斗/技能面板。PC 端 `display:none`，手机端 `display:flex`。JS 点击 Tab 切换面板 `.active` 类。

### 关键注意

- 桌面端体验零改动，移动端覆盖仅通过 `layout-mobile.css` 触发
- 不引入外部框架，纯原生
- 弹窗左右布局在手机端自动转上下布局
- 所有原有颜色/尺寸/动画不变，只拆分归类

---

## Phase 3.5：跨平台自适应 UI

**目标**：让游戏在桌面、平板、手机上均可正常使用。

**当前问题**：
- 缺少 `<meta name="viewport">` 标签，移动端缩放异常
- 三栏固定比例布局（25%/45%/30%），窄屏下内容挤压不可用
- 弹窗（背包、精炼、强化）固定宽度，手机上溢出
- 按钮和文字尺寸在小屏上太小，触控不友好
- 战斗控制区（按钮+速度+血线）在小屏上溢出换行混乱
- 地图雷达在窄屏上挤压变形

### 实现方案

#### 1. 添加 viewport meta 标签

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
```

#### 2. 响应式断点设计

| 断点 | 设备 | 布局策略 |
|------|------|----------|
| ≥ 1024px | 桌面 | 三栏并排（现有布局，不变） |
| 768px ~ 1023px | 平板 | 两栏：左栏(角色+装备) + 右栏(战斗+技能)，技能序列折叠为 Tab |
| < 768px | 手机 | 单栏垂直滚动，三栏通过 Tab 切换 |

#### 3. CSS 媒体查询规则

**平板 (768px ~ 1023px)**：
- `.wrapper` 改为两栏：`col-left` 35% + `col-mid/right` 合并为 65%
- `col-right` 的技能序列编辑器通过 Tab 按钮切换显示/隐藏
- 战斗控制区 `flex-wrap: wrap`
- 地图雷达字体缩小

**手机 (<768px)**：
- `.wrapper` 改为 `flex-direction: column`，三栏垂直堆叠
- 顶部增加 Tab 导航栏：[角色] [战斗] [技能]，切换显示对应面板
- `.col-left` / `.col-mid` / `.col-right` 宽度 100%，只显示当前激活的 Tab
- 弹窗 `.modal` 和 `.refine-modal` 改为 `width: 95%`、`max-height: 90vh`
- `.refine-modal` 在手机上改为 `flex-direction: column`（上下布局代替左右）
- 按钮最小触控尺寸 36px × 36px
- 字体微调：`font-size: 13px` → `12px`，小元素更紧凑

#### 4. 手机 Tab 导航

在手机端，于 `.wrapper` 之前插入一个固定在顶部的 Tab 栏：

```html
<nav class="mobile-tabs">
    <button class="mobile-tab active" data-panel="col-left">👤 角色</button>
    <button class="mobile-tab" data-panel="col-mid">⚔️ 战斗</button>
    <button class="mobile-tab" data-panel="col-right">🧠 技能</button>
</nav>
```

CSS：桌面端 `display:none`，手机端 `display:flex`。
JS：点击 Tab 切换显示对应面板，隐藏其他面板。

#### 5. 弹窗适配

- `.modal`：手机端 `width: 95%; max-height: 90vh`
- `.refine-modal`：手机端 `flex-direction: column; width: 95%`
- `.refine-left` / `.refine-right`：手机端 `width: 100%`，取消左右分割
- `#modal-content-area`：手机端 `max-height: 50vh`

### 涉及文件

- `index.html`
  - 添加 `<meta name="viewport">` 标签
  - 添加手机端 Tab 导航 HTML
- `index.html` `<style>` 块
  - 新增 `@media (max-width: 1023px)` 规则（平板）
  - 新增 `@media (max-width: 767px)` 规则（手机）
  - 新增 `.mobile-tabs` / `.mobile-tab` 样式
- `js/main.js`
  - 添加手机端 Tab 切换事件监听

### 关键注意

- 桌面端（≥1024px）体验零改动，所有变化仅通过媒体查询触发
- 手机端 Tab 切换不依赖路由，纯 CSS display 控制
- 不引入任何外部 CSS 框架，纯原生实现
- 弹窗内的左右布局（精炼/强化）在手机端自动转为上下布局
