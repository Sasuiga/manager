# 总经理十二个月 · 《维多利亚3》风格设计系统

> 状态：§0/§D/§E/§F 前置侦察已确认；本文档为设计系统唯一权威。
> 实现落点：`src/styles.css`（:root token + 组件样式）、`src/ui/theme.ts`（Mantine 主题）、`src/ui/ornaments.tsx`（装饰几何，阶段 D）、`index.html`（字体/主题色）。

## 0. 硬性规则（克制原则固化）

### H1 · 华丽分区规则
华丽只出现在**框架**上，绝不进入**内容**区。

- **允许区域**（可放置装饰元素）：
  1. 面板四角
  2. 面板边框
  3. 标题栏
  4. 按钮外框
  5. 图标容器
  6. 分隔线端点
  7. tab 指示器
- **禁止区域**（必须保持干净，仅文字/数据/留白）：
  1. 面板内容区
  2. 列表行（`.row` / `.goal-line` / `.log-line` / `.story-line` 等）
  3. 文字容器（`.card-desc` / `.event-body` / `.hint` 等）
  4. 输入框内部（`.stepper` / SegmentedControl 内部）
  5. 表格单元格（`.fin-table` 的 `.fin-row` 内部）

### H2 · 木质纹理暗示规则
按钮的木质纹理为**暗示而非写实**：以低对比渐变叠加（`--wood-*` 三个明度阶，单步明度差 ≤12% + 1px 内阴影），不得出现可辨识的木纹细节（无年轮、无纤维走向、无高对比条纹）。

### H3 · 审查检查项（每阶段交付前逐条过）
- [ ] 内容区（H1 禁止清单）内是否存在任何装饰元素、纹理或金色？
- [ ] 按钮基底渐变对比度是否低于「可辨识木纹」阈值（相邻明度差 ≤ 12%）？
- [ ] 同一面板是否出现 ≥3 类装饰元素（角饰/边框线/标题饰线 任选二为上限）？
- [ ] 所有颜色是否经由 CSS 变量 / Mantine 具名色板引用，无硬编码色值（SVG 装饰的 `currentColor` 由 CSS 变量着色）？

## 1. 美术支柱

| 支柱 | 落点 |
|---|---|
| **Prestigious 华丽** | 金色细线框架、双线圈面板边框、hero 容器的 Art Nouveau 卷草角饰、衬线大标题；华丽预算只花在框架层（H1） |
| **Vintage & Idyllic 复古田园** | 暖褐色深底（非纯黑）、羊皮纸色文字（非纯白）、低饱和古铜/钢蓝/铜橙/茄紫花色、做旧内阴影代替投影 |
| **Detailed yet Approachable 详细而平易** | 高细节集中在 8 类装饰元素（§7）；内容区按 H1 保持干净；信息密度靠面板分隔而非堆叠 |

## 2. 设计 Token（阶段 A 落进 `:root`）

### 2.1 色彩 —— 基底与面板

```css
--bg:        #241c13;  /* 壳层背景 · 深赭（非纯黑） */
--panel:     #2d2417;  /* 面板基底 · 暗皮/木 */
--panel-2:   #362b1c;  /* 抬升内表面（stat/row 行底）· 比基底亮 */
--panel-3:   #241d12;  /* 下沉凹槽（stepper/输入井） */
--wood-1:    #4d3d27;  /* 木质阶·亮 */
--wood-2:    #3d3020;  /* 木质阶·中 */
--wood-3:    #2d2417;  /* 木质阶·暗（单步明度差 ≤12%，H2） */
```

### 2.2 色彩 —— 文字（羊皮纸暖白系，禁纯白）

```css
--ink:   #e9dcc0;  /* 主文字 · 羊皮纸 */
--muted: #b6a687;  /* 次要文字 */
--faint: #857659;  /* 弱化/hint */
```

### 2.3 色彩 —— 金（强调/边框/荣耀）

```css
--gold:            #c9a24b;  /* 主金 */
--gold-hi:         #e6cd8a;  /* 高光金（hover 文字/发光） */
--gold-deep:       #8a6d3b;  /* 暗金（按钮描边、凹陷线） */
--line-gold:       rgba(201,162,74,0.22);  /* 金色细线·默认 */
--line-gold-hi:    rgba(201,162,74,0.45);  /* 金色细线·加强 */
--line:            rgba(201,162,74,0.12);  /* 中性暖发丝线 */
--line-2:          rgba(201,162,74,0.28);  /* 中性暖发丝线·强 */
--glow-gold:       0 0 10px rgba(201,162,74,0.28);  /* hover 金晕（唯一允许的"发光"） */
```

### 2.4 色彩 —— 祖母绿（两档明度）

```css
--emerald-nav:   #4c815d;  /* 较浅档 · 导航/切换（页面切换器、tab 激活、选中态） */
--emerald:       #2f5c41;  /* 较深档 · 行动按钮（结算/确认/开始） */
--emerald-hi:    #3d6f4f;  /* 行动按钮 hover 提亮 */
--emerald-deep:  #274d37;  /* 行动按钮按下/暗部 */
--emerald-soft:  rgba(76,129,93,0.16);  /* 选中/达成底纹 */
```

### 2.5 色彩 —— 语义与花色（全部降饱和做旧，点缀克制）

```css
--green:  #6fa87f;  --green-soft:  rgba(111,168,127,0.14);  /* 成功 */
--red:    #c07a6d;  --red-soft:    rgba(192,122,109,0.14); /* 警示（暗酒红系） */
--amber:  #c99a52;  --amber-soft:  rgba(201,154,82,0.14);  /* 警告/参半 */
/* 四花色（V3 复古调：钢蓝/铜橙/铜绿/茄紫） */
--blue:   #7a92a4;  --blue-soft:   rgba(122,146,164,0.14);  /* 采购·古钢蓝 */
--orange: #b5794a;  --orange-soft: rgba(181,121,74,0.14);   /* 生产·铜 */
--teal:   #5d8a7d;  --teal-soft:   rgba(93,138,125,0.14);   /* 销售·铜绿 */
--grape:  #8f6280;  --grape-soft:  rgba(143,98,128,0.14);   /* 研发·茄紫 */
```

### 2.6 阴影（浮雕替代投影，禁 Material 层级）

```css
--shadow-sm:   0 1px 0 rgba(233,220,192,0.06), 0 2px 6px rgba(12,8,4,0.5);
--shadow-md:   0 2px 12px rgba(12,8,4,0.55), inset 0 1px 0 rgba(233,220,192,0.07);
--inset-well:  inset 0 2px 5px rgba(0,0,0,0.35), inset 0 -1px 0 rgba(233,220,192,0.05);  /* 输入凹槽 */
--btn-active:  inset 0 2px 5px rgba(0,0,0,0.45);  /* 按钮按下下沉 */
```

### 2.7 圆角（三档定死角色，同页不混用，H3 检查）

```css
--r-sm: 4px;  /* 芯片/徽章/stepper 按钮/小容器 */
--r-md: 6px;  /* 面板/卡片/按钮/输入框（默认档） */
--r-lg: 8px;  /* 仅 sheet 顶角与 hero 容器（title-card/end-card） */
```
Mantine：`radius {xs:2, sm:4, md:6, lg:8, xl:8}`，`defaultRadius '6px'`。

### 2.8 间距（4px 网格；面板内边距 ≥12px；区块间距 ≥24px）

```css
--s1:4px; --s2:8px; --s3:12px; --s4:16px; --s5:20px; --s6:24px; --s7:32px;
/* 应用：页面内边距 16（现 14）；卡片内边距 16（现 14）；卡片间距 24（现 12）；
   列表行内 gap 8–12 不变（面板内部，非区块） */
```

### 2.9 字体（D 项已确认）

```css
--font-display: 'EB Garamond','Noto Serif SC','Songti SC','STSong','SimSun',serif;
--font-body:    'Spectral','Noto Serif SC','Songti SC','STSong','SimSun',serif;
--font-mono:    'JetBrains Mono',ui-monospace,'SF Mono',monospace;
--fs-xs:11px; --fs-sm:12px; --fs-md:13px; --fs-lg:14px; --fs-xl:15px;
--fs-2xl:18px; --fs-3xl:26px; --fs-hero:40px;
/* 正文行高 1.6（衬线），标题 1.25–1.3 */
```
挂载点见 D 项报告（body=Mantine fontFamily；h1-h4/.title-name/.sheet-title/.card h3=display；.num 族=mono）。

### 2.10 动效（150–300ms，沉稳曲线，禁弹跳）

```css
--dur-fast:150ms; --dur:220ms; --dur-slow:300ms;
--ease-settle: cubic-bezier(0.25,0.46,0.45,0.94);  /* 替代所有 cubic-bezier(0.34,1.56,0.64,1) 弹跳曲线 */
/* 允许清单：hover 150–220ms / active 150ms / 页面切换 250ms / sheet 出入场 300ms(入)/220ms(出)
   / 进度条 300ms / popIn 改 200ms 无过冲版
   唯一持续动画：当前月进度点 pulse（2.8s，状态指示，金晕呼吸） */
```

## 3. Mantine 主题映射（阶段 A 扩展现有 `theme.ts`，不覆盖）

- `colors`：新增/覆盖 10 阶色板 ——
  `emerald: [e0 #e6efe3, e1 #c3d9c0, e2 #98bd9a, e3 #6b9d76, e4 #4c815d, e5 #3d6f4f, e6 #2f5c41, e7 #274d37, e8 #1e3a2b, e9 #13271d]`
  `gold:    [g0 #f5ecd4, g1 #ead6a8, g2 #d9bc78, g3 #c9a24b, g4 #b78e3f, g5 #a37a33, g6 #8a642c, g7 #6f4e24, g8 #543a1d, g9 #382614]`
  `gray:    [n0 #f0e8d8, n1 #d9cdb4, n2 #b9a98c, n3 #97876c, n4 #7a6c56, n5 #5f5342, n6 #4a4033, n7 #383026, n8 #282219, n9 #1a1510]`（暖羊皮纸灰，替代现冷灰；`c="dimmed"` 16 处自动生效）
  `red:     [r0 #f5e2dd, r1 #e8c3ba, r2 #d69d92, r3 #c07a6d, r4 #a85f52, r5 #94483e, r6 #8a3f37, r7 #6f332d, r8 #522722, r9 #331a16]`（暗酒红）
  `amber:   [a0 #f7e8d3, a1 #ecd2a8, a2 #ddb377, a3 #c99a52, a4 #b3823f, a5 #996b31, a6 #7d552a, a7 #5f3f21, a8 #452e19, a9 #2b1e10]`
- `primaryColor: 'emerald'`、`primaryShade: 6`、`black: '#241c13'`、`white: '#e9dcc0'`
- `defaultColorScheme="dark"`（`main.tsx` 一行，展示层改动）
- `Button` 组件钩子：默认（leather 小按钮）= 木质基底 + 金发丝描边 + 羊皮纸字；`variant="light"` 在 dark scheme 下走 shade 0 羊皮纸 → 由 CSS 类 `.btn-mini` 覆写为皮革金边版
- `Badge`：radius 4px（现 pill 999px → `--r-sm`，仅圆点型 tab-badge 保留 pill）
- `Tooltip`：`wood-3` 底 + 1px `--gold-deep` 边 + `--muted` 字 + 4px 圆角
- `Progress`：track `--panel-3` + `--inset-well`，fill 走 emerald/gold 色板
- `SegmentedControl`：dark 变体，active 段 = `--emerald-soft` 底 + 金字

## 4. 组件规范（阶段 B/C 实施依据）

### 4.1 按钮（三档，全部木质基底，H2 暗示规则）
- **T1 行动**（`.btn-primary`/`.btn-settle`，结算/确认/开始）：`wood 1→3` 渐变上叠 emerald 深档（`--emerald`→`--emerald-deep` 92% 不透明度渐变），**1px `--gold-deep` 描边**（行动=深祖母绿+细金边，规格原文）；文字 14px/600/`--ink`/字距 0.03em；hover→`--emerald-hi` 底 + 描边 `--gold` + `--glow-gold`（220ms）；active→下沉 1px + `--btn-active`；disabled→`saturate(0.55) opacity(0.55)`
- **T2 导航**（`.pageswitch-btn`/TabBar `.tab`，切换页面）：`--emerald-nav`（浅档）叠木质基底，**无金描边**（1px `--line` 金发丝），选中时文字转 `--gold-hi`
- **T3 皮革小按钮**（`.btn-mini` 招聘/实施/签合约/购设备）：`--wood-2` 半透明底 + 1px `--line-gold` + 金色文字；hover→`--gold-hi` 字 + 细金晕
- committed 态（结算后）：T1 降为 T3 皮革观感（灰阶 neutral，`color` 动态映射已在 B 审计确认）

### 4.2 面板（`.card`/`.stat`/`.sheet`）
- 底：`--panel` + 织物暗示（`linear-gradient(180deg, rgba(233,220,192,0.05), rgba(0,0,0,0.14))` 一层，3% 级 alpha）
- 框：双线圈 —— 内 1px `--line-gold` + 外 1px `--line`（box-shadow spread 实现），顶部 1px 亮边（`--shadow-sm`）
- 角饰：仅 hero 容器（title-card / end-card / sheet 面板）四角 `orn-corner`（E 项 §克制分配）
- 标题栏：`.card h3` = `--font-display` 15px/600/`--ink`，其下 `title-rule`（2px 渐变金线 + 中心菱形，`--line-gold`）

### 4.3 输入/选择
- `stepper`：`--panel-3` 凹槽（`--inset-well`）+ 26px 方形按钮（`--r-sm`，金加减号，hover 金晕）
- SegmentedControl：见 §3
- 列表行 `.row`：无底色、1px `--line` 分隔 + 行首留白（内容区保持干净，H1）
- 表格 `.fin-table`：发丝线表头（`--line-gold`），bold 行 = `--emerald-soft` 底 + 金字数值，奇偶行仅极淡差（≤4%）

### 4.4 TabBar / PageSwitcher
- TabBar 底：`--wood-3` 92% 不透明 + blur，顶边 1px `--line-gold`
- 激活 tab：`tab-tip`（28×3px 金发丝 + 两端菱形）取代现圆角下划线；图标/文字转 `--gold-hi`
- tab-badge：pill 保留，底 `--gold` 字 `#241c13`（唯一 pill 圆角例外）
- PageSwitcher 分段：容器 = 木质凹槽，选中段 = T2 观感（`--emerald-nav` 底 + 金发丝框）

### 4.5 HUD
- 顶栏底：`--wood-3` 90% + blur + 底边 1px `--line-gold`
- 月份条：已历=`--gold-deep` 55%、当前=`--gold` + pulse 金晕（唯一持续动画）、未历=`--line`
- stat 三盒：`--panel-2` 底 + 双线圈框，数值 `--font-mono` 16px（现金=`--ink`、负值=`--red`、预估分=`--gold`）

### 4.6 抽屉 Sheet
- 面板顶角 `--r-lg` 8px；`sheet-crown`（E 项）取代现 38px 灰把手条，位于 sheet-head 顶部中央
- overlay：`rgba(12,8,4,0.55)` + blur 3px（暖黑遮罩）
- sheet-foot：皮革条（`--wood-3`）+ 顶边金发丝 + T1 行动按钮

### 4.7 图标
- 注册表 `icons.tsx` 保留（lucide 线性 SVG 的历史感优于几何扁平，描边 1.75–2）
- 显著位（事件图标/部门图标/卡片图标/标题页点）套 `icon-medallion` 容器（双环 + 四向刻线，E 项）；容器内图标 1.4–2px 描边、色 = 花色/金
- 行内小图标（11–13px）裸用，色 `--faint`/`--muted`，hover 随父级转金
- 着色机制：全部 `currentColor`，实例由 CSS 变量控制（E 项清单）

## 5. 装饰元素清单（E 项，阶段 D 实施）

| 元素 | 用途 | 尺寸 | 变量 | 着色 |
|---|---|---|---|---|
| `orn-corner` 卷草角饰 | 角饰（hero 容器四角，同一几何四旋） | 18/24/32 | `--ornament: --gold-deep`、`--ornament-opacity: 0.75` | SVG currentColor |
| `panel-frame` 双线圈边框 | 边框（全部面板） | 无变体 | `--line-gold`、`--line`、`--shadow-sm` | CSS 变量 |
| `title-rule` 标题饰线 | 标题栏（节标题下） | 全宽×2px + 菱形 6px | `--line-gold`、`--ornament` | CSS 变量 + 共享菱形 currentColor |
| `btn-frame` 按钮外框 | 边框（按钮，H2 适用） | 随 Button 三档 | `--wood-1/2/3`、`--line-gold`、`--glow-gold` | CSS 变量 |
| `icon-medallion` 图标徽章 | 容器（双环 + 四向刻线） | 24/28/32/36/44/46 | `--medal-bg: var(--panel-2)`、`--line-gold` | SVG 环 currentColor + 底色变量 |
| `div-end` 分隔端点 | 分隔（分隔线两端菱形叶点） | 5px | `--line`、`--ornament` | 共享菱形 currentColor |
| `tab-tip` tab 指示器 | 指示器（TabBar 激活） | 28×3px + 端点 | `--line-gold-hi` | CSS 变量 + 共享菱形 |
| `sheet-crown` 抽屉顶饰 | 角饰/标题栏（sheet-head 中央） | 48×16 | `--ornament`、`--line-gold` | 复用 `orn-corner` 几何 |

独立 SVG 几何 3 个（卷草/菱形/medallion），`src/ui/ornaments.tsx` 承载；克制分配：普通 `.card` = 边框 + title-rule（无角饰），hero = 全配。

## 6. 页面应用映射（阶段 C/D）

- 标题页/终局页：hero 全配（角饰 + 皇冠式顶饰 + 大衬线标题 + T1 主按钮 + 花色成就章）
- 经营 5 页：`.card` 标准面板 + DeptRow 轨道节点（节点=金色菱形而非圆点，`--gold`/`--gold-deep`）+ Stepper 凹槽
- 弹窗 6 个：Sheet 标准皮 + 各弹窗 head 的图标套 medallion + footer T1 按钮
- 报表/日志页：fin-table 金线表格 + qres 行发丝分隔（内容区无装饰，H1）

## 7. 反 AI 味清单核对（逐条）

| 禁项 | 本系统对策 |
|---|---|
| 紫/蓝紫渐变 | 全部渐变为 木/绿/金 暖系单色向，花色茄紫仅 14% alpha 底纹 |
| 大圆角 >12px | 最大 `--r-lg` 8px（仅 sheet 顶/hero） |
| Inter/Roboto/Open Sans 标题 | 标题 = EB Garamond / Noto Serif SC |
| 纯白面板 | 最亮色 `--ink #e9dcc0`（羊皮纸，非白） |
| Material 阴影层级 | 浮雕内阴影（§2.6）替代 |
| emoji 图标 | 现 `icons.tsx` 注册表已全量替换，保留 |
| 同页混用圆角 | 三档定死角色（§2.7），H3 检查 |
