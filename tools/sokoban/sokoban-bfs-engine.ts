/**
 * 纯推箱子 BFS 求解：三层字符网格（地形 / 物件 / 目标），箱与目标各向同性。
 * 与 OpticalPuzzle 无关，仅几何推箱 + 箱子到位判定。
 */

export interface SokobanLayeredSource {
    levelName?: string;
    /** 层 1：纯地形，`#` 墙，`.` 或空格为可走地板 */
    terrain: string[];
    /** 层 2：物件，`@` 玩家（唯一），`S` 箱子，墙格与 terrain 对齐为 `#` */
    objects: string[];
    /** 层 3：目标，`E` 为目标格，其余为 `.` */
    targets: string[];
}

export interface SokobanLevel {
    levelName: string;
    width: number;
    height: number;
    /** 可走且非墙（含目标格） */
    walkable: boolean[];
    /** 目标格索引 */
    targetCells: number[];
    /** 目标格 bitmask：index i 对应 (1 << i) */
    targetMask: number;
    startPlayer: number;
    startBoxes: number[];
}

export interface SokobanValidationResult {
    ok: boolean;
    errors: string[];
    warnings: string[];
}

export interface SokobanMove {
    step: number;
    direction: SokobanDirection;
    wasd: string;
    result: 'move' | 'push';
}

export interface SokobanSolveResult {
    solvable: boolean;
    minSteps: number | null;
    moves: SokobanMove[];
    exploredStates: number;
    visitedStates: number;
    elapsedMs: number;
    reason?: string;
}

export enum SokobanDirection {
    Right = 0,
    Up = 1,
    Left = 2,
    Down = 3,
}

const DIR_DX = [1, 0, -1, 0] as const;
const DIR_DY = [0, -1, 0, 1] as const;
const DIR_WASD = ['d', 'w', 'a', 's'] as const;
const EXPAND_ORDER: readonly SokobanDirection[] = [
    SokobanDirection.Right,
    SokobanDirection.Up,
    SokobanDirection.Left,
    SokobanDirection.Down,
];

function cellIndex(w: number, x: number, y: number): number {
    return y * w + x;
}

function cellXY(w: number, idx: number): { x: number; y: number } {
    return { x: idx % w, y: Math.floor(idx / w) };
}

function normalizeRow(row: string, width: number, label: string, rowIndex: number): string {
    const trimmed = row.replace(/\r$/, '');
    if (trimmed.length !== width) {
        throw new Error(`${label} 第 ${rowIndex + 1} 行列数为 ${trimmed.length}，期望 ${width}`);
    }
    return trimmed;
}

function isWallChar(ch: string): boolean {
    return ch === '#';
}

function isFloorChar(ch: string): boolean {
    return ch === '.' || ch === ' ';
}

/** 解析三层网格为推箱关卡 */
export function parseSokobanLevel(source: SokobanLayeredSource): SokobanLevel {
    const validation = validateSokobanSource(source);
    if (!validation.ok) {
        throw new Error(validation.errors.join('\n'));
    }

    const height = source.terrain.length;
    const width = source.terrain[0]!.length;
    const cellCount = width * height;
    const walkable = new Array<boolean>(cellCount).fill(false);
    const targetCells: number[] = [];
    let startPlayer = -1;
    const startBoxes: number[] = [];

    for (let y = 0; y < height; y++) {
        const tRow = normalizeRow(source.terrain[y]!, width, 'terrain', y);
        const oRow = normalizeRow(source.objects[y]!, width, 'objects', y);
        const gRow = normalizeRow(source.targets[y]!, width, 'targets', y);

        for (let x = 0; x < width; x++) {
            const idx = cellIndex(width, x, y);
            const tCh = tRow[x]!;
            const oCh = oRow[x]!;
            const gCh = gRow[x]!;

            if (isWallChar(tCh)) {
                if (!isWallChar(oCh)) {
                    throw new Error(`objects[${y}][${x}] 应为墙 #，与 terrain 不一致`);
                }
                continue;
            }

            if (!isFloorChar(tCh)) {
                throw new Error(`terrain[${y}][${x}] 非法字符 '${tCh}'，仅允许 # . 空格`);
            }

            walkable[idx] = true;

            if (isWallChar(oCh)) {
                throw new Error(`objects[${y}][${x}] 不应为墙，terrain 该格为地板`);
            }

            if (oCh === '@') {
                if (startPlayer >= 0) {
                    throw new Error('objects 中只能有一个 @');
                }
                startPlayer = idx;
            } else if (oCh === 'S') {
                startBoxes.push(idx);
            } else if (oCh !== '.' && oCh !== ' ') {
                throw new Error(`objects[${y}][${x}] 非法字符 '${oCh}'，仅允许 @ S . 空格`);
            }

            if (gCh === 'E') {
                targetCells.push(idx);
            } else if (!isFloorChar(gCh) && !isWallChar(gCh)) {
                throw new Error(`targets[${y}][${x}] 非法字符 '${gCh}'，仅允许 E . 空格`);
            }
        }
    }

    if (startPlayer < 0) {
        throw new Error('objects 中缺少 @');
    }
    if (startBoxes.length === 0) {
        throw new Error('objects 中缺少 S（箱子）');
    }
    if (targetCells.length === 0) {
        throw new Error('targets 中缺少 E（目标）');
    }

    startBoxes.sort((a, b) => a - b);

    return {
        levelName: source.levelName?.trim() || '未命名',
        width,
        height,
        walkable,
        targetCells,
        targetMask: (1 << targetCells.length) - 1,
        startPlayer,
        startBoxes,
    };
}

export function validateSokobanSource(source: SokobanLayeredSource): SokobanValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!source.terrain?.length) {
        errors.push('terrain 不能为空');
    }
    if (!source.objects?.length) {
        errors.push('objects 不能为空');
    }
    if (!source.targets?.length) {
        errors.push('targets 不能为空');
    }
    if (errors.length > 0) {
        return { ok: false, errors, warnings };
    }

    const h = source.terrain.length;
    const w = source.terrain[0]!.length;
    if (w < 1 || h < 1) {
        errors.push('地图尺寸无效');
    }
    if (source.objects.length !== h) {
        errors.push(`objects 行数 ${source.objects.length} 与 terrain 行数 ${h} 不一致`);
    }
    if (source.targets.length !== h) {
        errors.push(`targets 行数 ${source.targets.length} 与 terrain 行数 ${h} 不一致`);
    }

    let playerCount = 0;
    let boxCount = 0;
    let targetCount = 0;

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            try {
                const oRow = normalizeRow(source.objects[y]!, w, 'objects', y);
                const gRow = normalizeRow(source.targets[y]!, w, 'targets', y);
                if (oRow[x] === '@') {
                    playerCount += 1;
                }
                if (oRow[x] === 'S') {
                    boxCount += 1;
                }
                if (gRow[x] === 'E') {
                    targetCount += 1;
                }
            } catch (e) {
                errors.push(e instanceof Error ? e.message : String(e));
            }
        }
    }

    if (playerCount !== 1) {
        errors.push(`objects 中 @ 数量应为 1，当前 ${playerCount}`);
    }
    if (boxCount === 0) {
        errors.push('objects 中至少需要一个 S');
    }
    if (targetCount === 0) {
        errors.push('targets 中至少需要一个 E');
    }
    if (boxCount !== targetCount) {
        warnings.push(`箱子数 ${boxCount} 与目标数 ${targetCount} 不一致，可能无解`);
    }

    return { ok: errors.length === 0, errors, warnings };
}

interface SearchNode {
    player: number;
    /** 箱子格索引，升序 */
    boxes: number[];
    steps: number;
}

function packStateKey(player: number, boxes: readonly number[], cellCount: number): bigint {
    const n = BigInt(cellCount);
    let key = BigInt(player);
    for (let i = 0; i < boxes.length; i++) {
        key = key * n + BigInt(boxes[i]!);
    }
    return key;
}

function boxesOnTargetsMask(boxes: readonly number[], targetCells: readonly number[]): number {
    let mask = 0;
    for (let i = 0; i < targetCells.length; i++) {
        if (boxes.includes(targetCells[i]!)) {
            mask |= 1 << i;
        }
    }
    return mask;
}

function isWallBlocked(idx: number, walkable: readonly boolean[]): boolean {
    return !walkable[idx];
}

/** 箱子不在目标上且陷入墙墙角时不可再推动（仅看墙，不把其他箱子当墙） */
function isBoxCornerDeadlocked(
    boxIdx: number,
    walkable: readonly boolean[],
    targetSet: ReadonlySet<number>,
    w: number,
    h: number,
): boolean {
    if (targetSet.has(boxIdx)) {
        return false;
    }
    const { x, y } = cellXY(w, boxIdx);
    const up = y <= 0 || isWallBlocked(cellIndex(w, x, y - 1), walkable);
    const down = y >= h - 1 || isWallBlocked(cellIndex(w, x, y + 1), walkable);
    const left = x <= 0 || isWallBlocked(cellIndex(w, x - 1, y), walkable);
    const right = x >= w - 1 || isWallBlocked(cellIndex(w, x + 1, y), walkable);
    return (up && left) || (up && right) || (down && left) || (down && right);
}

function hasDeadlockedBox(
    boxes: readonly number[],
    walkable: readonly boolean[],
    targetCells: readonly number[],
    w: number,
    h: number,
): boolean {
    const targetSet = new Set(targetCells);
    for (const b of boxes) {
        if (isBoxCornerDeadlocked(b, walkable, targetSet, w, h)) {
            return true;
        }
    }
    return false;
}

function tryMove(
    node: SearchNode,
    dir: SokobanDirection,
    level: SokobanLevel,
): { next: SearchNode; result: 'move' | 'push' } | null {
    const { width: w, height: h, walkable } = level;
    const { x, y } = cellXY(w, node.player);
    const dx = DIR_DX[dir]!;
    const dy = DIR_DY[dir]!;
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) {
        return null;
    }

    const nextPlayer = cellIndex(w, nx, ny);
    const boxSet = new Set(node.boxes);
    const boxAtNext = node.boxes.indexOf(nextPlayer);

    if (boxAtNext < 0) {
        if (!walkable[nextPlayer] || boxSet.has(nextPlayer)) {
            return null;
        }
        return {
            next: { player: nextPlayer, boxes: node.boxes.slice(), steps: node.steps + 1 },
            result: 'move',
        };
    }

    const bx = nx + dx;
    const by = ny + dy;
    if (bx < 0 || by < 0 || bx >= w || by >= h) {
        return null;
    }
    const beyond = cellIndex(w, bx, by);
    if (!walkable[beyond] || boxSet.has(beyond)) {
        return null;
    }

    const boxes = node.boxes.slice();
    boxes[boxAtNext] = beyond;
    boxes.sort((a, b) => a - b);
    return {
        next: { player: nextPlayer, boxes, steps: node.steps + 1 },
        result: 'push',
    };
}

export interface SokobanBfsOptions {
    maxDepth?: number;
    maxExplored?: number;
    /** 是否检测墙角死锁（不影响正确性，仅剪枝） */
    pruneDeadlock?: boolean;
}

/** BFS 求最少步数与操作序列 */
export function solveSokobanBfs(level: SokobanLevel, options: SokobanBfsOptions = {}): SokobanSolveResult {
    const maxDepth = options.maxDepth ?? 200;
    const maxExplored = options.maxExplored ?? Infinity;
    const pruneDeadlock = options.pruneDeadlock !== false;
    const cellCount = level.width * level.height;
    const t0 = Date.now();

    const start: SearchNode = {
        player: level.startPlayer,
        boxes: level.startBoxes.slice(),
        steps: 0,
    };

    const startMask = boxesOnTargetsMask(start.boxes, level.targetCells);
    if (startMask === level.targetMask) {
        return {
            solvable: true,
            minSteps: 0,
            moves: [],
            exploredStates: 1,
            visitedStates: 1,
            elapsedMs: 0,
        };
    }

    const startKey = packStateKey(start.player, start.boxes, cellCount);
    const visited = new Set<bigint>([startKey]);
    const parent = new Map<bigint, { prevKey: bigint; dir: SokobanDirection; result: 'move' | 'push' }>();

    const queue: SearchNode[] = [start];
    let head = 0;
    let explored = 0;
    let maxQueue = 1;
    let goalKey: bigint | null = null;
    let goalSteps: number | null = null;

    while (head < queue.length) {
        const node = queue[head++]!;
        explored += 1;

        if (explored > maxExplored) {
            return {
                solvable: false,
                minSteps: null,
                moves: [],
                exploredStates: explored,
                visitedStates: visited.size,
                elapsedMs: Date.now() - t0,
                reason: `已达探索上限 ${maxExplored}（深度 ${node.steps}）`,
            };
        }

        if (node.steps >= maxDepth) {
            continue;
        }

        const fromKey = packStateKey(node.player, node.boxes, cellCount);

        for (const dir of EXPAND_ORDER) {
            const applied = tryMove(node, dir, level);
            if (!applied) {
                continue;
            }

            const { next, result } = applied;
            const key = packStateKey(next.player, next.boxes, cellCount);
            if (visited.has(key)) {
                continue;
            }

            if (pruneDeadlock && hasDeadlockedBox(next.boxes, level.walkable, level.targetCells, level.width, level.height)) {
                continue;
            }

            const mask = boxesOnTargetsMask(next.boxes, level.targetCells);
            if (mask === level.targetMask) {
                parent.set(key, { prevKey: fromKey, dir, result });
                goalKey = key;
                goalSteps = next.steps;
                head = queue.length;
                break;
            }

            visited.add(key);
            parent.set(key, { prevKey: fromKey, dir, result });
            queue.push(next);
            if (queue.length - head > maxQueue) {
                maxQueue = queue.length - head;
            }
        }
    }

    const elapsedMs = Date.now() - t0;

    if (goalSteps === null || goalKey === null) {
        return {
            solvable: false,
            minSteps: null,
            moves: [],
            exploredStates: explored,
            visitedStates: visited.size,
            elapsedMs,
            reason: `BFS 在深度 ${maxDepth} 内未找到解（已探索 ${visited.size} 状态，队列峰值 ${maxQueue}）`,
        };
    }

    const path: Array<{ dir: SokobanDirection; result: 'move' | 'push' }> = [];
    let k: bigint | undefined = goalKey;
    while (k !== undefined && k !== startKey) {
        const p = parent.get(k)!;
        path.push({ dir: p.dir, result: p.result });
        k = p.prevKey;
    }
    path.reverse();

    const moves: SokobanMove[] = path.map((m, i) => ({
        step: i + 1,
        direction: m.dir,
        wasd: DIR_WASD[m.dir]!,
        result: m.result,
    }));

    return {
        solvable: true,
        minSteps: goalSteps,
        moves,
        exploredStates: explored,
        visitedStates: visited.size,
        elapsedMs,
    };
}

export function encodeSokobanSolution(moves: readonly SokobanMove[]): string[] {
    return moves.map((m) => m.wasd);
}
