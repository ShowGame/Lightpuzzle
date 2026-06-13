# 光学解谜关卡设计参考

权威定义见 `assets/Scripts/Games/OpticalPuzzle/Config/OpticalPuzzleLevelSchema.ts`。

## 尺寸约束

| 项 | 值 |
|----|-----|
| 宽度 `width` | 3～15（**不超过 15**） |
| 高宽比 `height / width` | **0.5～0.67**（竖屏友好） |
| 四层网格 | 行数 = `height`，每行列数 = `width`，必须对齐 |

推荐尺寸示例：

| width | 允许 height |
|-------|-------------|
| 9 | 5～6 |
| 10 | 5～6 |
| 11 | 6～7 |
| 12 | 6～8 |
| 15 | 8～10 |

## 四层字符表（`[y][x]`，y=0 为顶行）

### 层 1 `staticLayout` — 静态地形

| 字符 | 含义 |
|------|------|
| `#` | 墙（挡光、不可进入） |
| `.` 或空格 | 地板 |

### 层 2 `objects` — 物件

| 字符 | 含义 |
|------|------|
| `#` | 与层 1 墙对齐 |
| `.` | 空地 |
| `@` | 玩家（全关唯一） |
| `S` | 光源 |
| `E` | 目标 |
| `0`～`4` | 光学元件通道类型（见下） |
| `{` / `}` | 传送门对（高级；生成器默认避免） |

通道类型（层 4 默认 `w`，`.` 同 `w`）：

- `0` 挡光块（可推，无通道）
- `1` 上+右
- `2` 上+下
- `3` 上+左+右
- `4` 四面

### 层 3 `colors` — 光色（稀疏标注）

| 位置 | 允许字符 |
|------|----------|
| 墙 | `#` |
| 空地 / 玩家 | `.` |
| 光源 / 目标 | `W` `R` `G` `B` `Y` `C` `P`（`.` = `W`） |
| 光学元件 | `W` `R` `G` `B`（`.` = `W`） |

### 层 4 `directions` — 朝向（稀疏标注）

| 位置 | 允许字符 |
|------|----------|
| 墙 | `#` |
| 空地 / 玩家 / 目标 | `.` |
| 光源 | `w` `a` `s` `d`（`.` 默认朝下 `s`） |
| 元件 | `w` `a` `s` `d`（`.` 同 `w`） |

## 玩法约束（生成时须满足）

1. 外圈建议 `#` 围墙，内部留可走区域。
2. 玩家 `@` 不能放在 `S` / `E` 格上。
3. 光源、目标格地形为 Source/Target，**不可被元件占据**。
4. 元件初始位置不能在 `@` / `S` / `E` 上。
5. 至少 1 个 `S`、1 个 `E`。
6. 初始布局下**不能**已全目标点亮（否则 minSteps=0，教学意义弱）。
7. 元件朝向在局内**不可旋转**，仅可推动；设计时靠层 4 固定朝向。

## 难度分（1～100）

由求解脚本 `tools/optical-level-solver.ts` 计算：

```
rawScore =
  元件数 × 4
  + (光源数 + 目标数) × 6
  + 有色元件数(R/G/B) × 5
  + 二次色光源/目标数(Y/C/P) × 10
  + 最小步数 × 1.2
  + 地图格数 × 0.12

difficulty = clamp(1, 100, round(rawScore × 0.65))
```

生成时可指定目标难度区间，迭代调整元件数、滤色、光源/目标数量与地图尺寸。

## 评星步数（求解后自动算）

设 BFS 最小完成步数为 `min`：

| 字段 | 公式 |
|------|------|
| `perfectSteps` | `min` |
| `threeStarSteps` | `ceil(min × 1.25)` |
| `twoStarSteps` | `ceil(min × 1.5)` |
| `oneStarSteps` | `ceil(min × 2)` |

## 输出 JSON 模板

```json
{
  "levelId": 5,
  "levelName": "关卡名",
  "height": 6,
  "width": 9,
  "staticLayout": ["#########", "..."],
  "objects": ["#########", "..."],
  "colors": ["#########", "..."],
  "directions": ["#########", "..."],
  "perfectSteps": 0,
  "threeStarSteps": 0,
  "twoStarSteps": 0,
  "oneStarSteps": 0,
  "difficulty": 0
}
```

`perfectSteps` 等四字段在通过求解后填入；`difficulty` 为分析字段，写入 `OpticalPuzzleLevels.ts` 时可省略。

## 写入工程

通过验证后，将对象追加到 `assets/Scripts/Games/OpticalPuzzle/Config/OpticalPuzzleLevels.ts` 的 `OPTICAL_LEVEL_LAYERED_SOURCES`（不含 `difficulty` 字段）。
