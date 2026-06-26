---
name: optical-puzzle-level-design
description: >-
  Generates and validates LightPuzzle / OpticalPuzzle level designs: four layered
  char grids, star step thresholds, difficulty score (min 1, no cap), BFS min-steps solvability.
  Use when the user asks to design, generate, validate, or balance optical puzzle
  levels, 关卡设计, 最小步数, or star thresholds for 光学迷宫.
---

# 光学解谜关卡设计

为 **LightPuzzle（光学迷宫）** 生成可入库的关卡。规则与字符表见 [reference.md](reference.md)。

## 何时使用

- 用户要求生成/设计/验证光学解谜关卡
- 需要最小步数、三星/二星/一星步数阈值
- 需要难度分或按难度批量产关（≥1，无上限）

## 硬性约束

- `width` ≤ **15**
- 高宽比 `height / width` ∈ **[0.5, 0.67]**
- **`height` ≤ `width`**（局内棋盘宽撑满屏宽；若 `height > width`，缩放后棋盘高会超过屏宽，将按屏宽二次压缩）
- 四层同尺寸：`staticLayout`、`objects`、`colors`、`directions`
- 输出含：`levelId`、`levelName`、`height`、`width`、四层数组、四档步数阈值
- 难度分 ≥1（见 reference 公式，无上限）

## 工作流（必须按序执行）

```
- [ ] 1. 生成地图
- [ ] 2. 验证地图合法性
- [ ] 3. 验证地图可完成/达成性
- [ ] 4. 得出最小完成步数与评星步数
```

### 1. 生成地图

1. 根据目标难度选定 `width`、`height`（满足高宽比与宽度上限）。
2. 画层 1 外墙与内部障碍；层 2 放置 `@`、`S`、`E`、数字元件 `0`～`4`。
3. 层 3/4 **稀疏标注**（仅物件格写字，其余 `.`；墙格四层均为 `#`）。
4. 教学关：1S1E、1～2 个元件；进阶关：多元件、R/G/B 滤色、多目标、二次色 Y/C/P。
5. 避免初始即全点亮；避免 `{`/`}` 传送门（除非用户明确要求且已验证光追）。

### 2. 验证地图合法性

将关卡写成 JSON（见 reference 模板），运行：

```bash
npx --yes tsx tools/optical-level-solver.ts path/to/level.json
```

Windows PowerShell 若报「禁止运行脚本」，改用 `npx.cmd` 代替 `npx`。

或：

```bash
npx --yes tsx tools/optical-level-solver.ts --stdin < path/to/level.json
```

检查 `validation.ok === true`。若失败，阅读 `validation.errors`，修正后**从步骤 1 重来**。

合法性包括：四层尺寸、墙对齐、字符集、`parseLayeredGridsToLevelConfig` 规则、高宽比、宽度上限、`height ≤ width`（超出则警告二次压缩）。

### 3. 验证地图可完成/达成性

同一命令输出中检查 `solve.solvable === true`。

- 若 `false`：阅读 `solve.reason`，调整元件位置/朝向/滤色或墙体，**回到步骤 1**。
- BFS 与运行时 `OpticalPuzzleCore` 一致：四向移动、推箱、光追点亮全部目标；**仅成功移动计步**。
- 状态空间过大时脚本默认最大深度 200；超深则简化布局或拆关。

### 4. 得出最小完成步数、三星完成步数（最小完成步数*1.25）、二星（最小完成步数*1.5）、一星（最小完成步数*2）

从脚本输出读取：

| 字段 | 来源 |
|------|------|
| 最小完成步数 | `solve.minSteps` |
| `perfectSteps` | `starThresholds.perfectSteps`（= min） |
| `threeStarSteps` | `ceil(min × 1.25)` |
| `twoStarSteps` | `ceil(min × 1.5)` |
| `oneStarSteps` | `ceil(min × 2)` |
| `difficulty` | `difficulty.difficulty`（≥1，无上限） |

向用户交付时附上 **难度分解**（`difficulty` 对象内各计数）便于调平衡。

## 交付格式

### 给用户（Markdown 摘要）

- levelId、levelName、width×height、difficulty
- minSteps 与四档评星
- 四层字符表（代码块，每行一行字符串）
- 一句设计意图（玩家要做什么）

### 写入工程（用户确认后）

将 `IOpticalLevelLayeredSource` 对象追加到：

`assets/Scripts/Games/OpticalPuzzle/Config/OpticalPuzzleLevels.ts`

**不要**写入 `difficulty` 字段；步数字段必须与求解结果一致。

## 迭代调难度

| 目标 | 做法 |
|------|------|
| 提高难度 | 加元件、加 S/E、用 R/G/B/Y/C/P、加地图尺寸、增加绕路墙 |
| 降低难度 | 减元件、单色系 W、缩短光路、减小 width |
| 指定 difficulty 区间 | 生成 → 求解 → 不在区间则调整并重跑 2～4 |

## 常见问题

**Q：能否用软编码猜步数？**  
不行。必须以 `optical-level-solver.ts` BFS 结果为准。

**Q：评星与 perfect 关系？**  
`perfectSteps === minSteps`；步数 ≤ perfect 时三颗星均发光（见 `OpticalPuzzleStarRating.ts`）。

**Q：层 3 能否全图铺 `W`？**  
不行。空地/玩家格层 3 必须为 `.`。

## 附加资源

- 字符与难度公式：[reference.md](reference.md)
- 现有关卡样例：`assets/Scripts/Games/OpticalPuzzle/Config/OpticalPuzzleLevels.ts`
- 求解/校验实现：`tools/optical-level-solver.ts`
