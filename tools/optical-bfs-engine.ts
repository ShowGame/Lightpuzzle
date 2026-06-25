/**
 * 光学解谜 BFS 求解引擎：紧凑状态、单 Core 复用、几何预检、litMask 剪枝。
 * 供 optical-level-solver.ts 调用，与 OpticalPuzzleCore 行为一致。
 */
import type { IOpticalLevelConfig, IOpticalPiece } from '../assets/Scripts/Games/OpticalPuzzle/Config/OpticalPuzzleLevelSchema';
import { OpticalPuzzleCore } from '../assets/Scripts/Games/OpticalPuzzle/Core/OpticalPuzzleCore';
import {
    Direction,
    MoveAttemptResult,
    TerrainKind,
    type OpticalPlayStateSnapshot,
} from '../assets/Scripts/Games/OpticalPuzzle/Core/OpticalPuzzleTypes';
import type { SolutionMove } from './optical-level-solver';

const DIR_WASD = ['d', 'w', 'a', 's'] as const;
const DIR_DX = [1, 0, -1, 0] as const;
const DIR_DY = [0, -1, 0, 1] as const;

/** 推块方向优先（同深度内先尝试推块，更快命中目标） */
const EXPAND_ORDER: readonly Direction[] = [
    Direction.Right,
    Direction.Up,
    Direction.Left,
    Direction.Down,
];

export interface BfsProgress {
    explored: number;
    visited: number;
    queueSize: number;
    currentDepth: number;
    elapsedMs: number;
}

export interface BfsEngineOptions {
    maxDepth?: number;
    /** 探索状态上限，超出则中止 */
    maxExplored?: number;
    /** 是否回溯路径（false 时仅求 minSteps，省内存） */
    trackPath?: boolean;
    onProgress?: (p: BfsProgress) => void;
    progressInterval?: number;
}

export interface BfsEngineResult {
    minSteps: number | null;
    moves: SolutionMove[];
    exploredStates: number;
    visitedStates: number;
    elapsedMs: number;
    reason?: string;
}

interface CompactNode {
    px: number;
    py: number;
    /** 各元件所在格索引 y*w+x，顺序与 level.pieces 一致 */
    pieceCell: number[];
    steps: number;
}

interface LevelSearchContext {
    level: IOpticalLevelConfig;
    w: number;
    h: number;
    cellCount: number;
    pieceCount: number;
    /** 固定元件模板（id/type/color 等），位置由 CompactNode 提供 */
    pieceTemplates: IOpticalPiece[];
    /** 可走且非光源/目标的地板 */
    isWalkableFloor: boolean[];
    /** 全目标点亮掩码 */
    fullLitMask: number;
    worker: OpticalPuzzleCore;
    /** 复用快照对象，减少 GC */
    snapshotScratch: OpticalPlayStateSnapshot;
}

function buildSearchContext(level: IOpticalLevelConfig): LevelSearchContext {
    const w = level.width;
    const h = level.height;
    const cellCount = w * h;
    const isWalkableFloor = new Array<boolean>(cellCount);
    for (let i = 0; i < cellCount; i++) {
        isWalkableFloor[i] = level.terrain[i] === TerrainKind.Floor;
    }
    const worker = new OpticalPuzzleCore();
    worker.reset(level);
    const fullLitMask = (1 << level.targets.length) - 1;
    return {
        level,
        w,
        h,
        cellCount,
        pieceCount: level.pieces.length,
        pieceTemplates: level.pieces,
        isWalkableFloor,
        fullLitMask,
        worker,
        snapshotScratch: worker.clonePlayState(),
    };
}

function cellIndex(w: number, x: number, y: number): number {
    return y * w + x;
}

function cellXY(w: number, idx: number): { x: number; y: number } {
    return { x: idx % w, y: Math.floor(idx / w) };
}

/** BigInt 打包：玩家格 + 各元件格（顺序固定，无需字符串排序） */
function packStateKey(px: number, py: number, pieceCell: readonly number[], w: number, cellCount: number): bigint {
    const n = BigInt(cellCount);
    let key = BigInt(cellIndex(w, px, py));
    for (let i = 0; i < pieceCell.length; i++) {
        key = key * n + BigInt(pieceCell[i]!);
    }
    return key;
}
function nodeFromCore(core: OpticalPuzzleCore, ctx: LevelSearchContext, steps: number): CompactNode {
    const play = core.clonePlayState();
    const pieceCell = play.pieces.map((p) => cellIndex(ctx.w, p.x, p.y));
    return { px: play.player.x, py: play.player.y, pieceCell, steps };
}

function fillSnapshot(node: CompactNode, ctx: LevelSearchContext): OpticalPlayStateSnapshot {
    const snap = ctx.snapshotScratch;
    snap.player.x = node.px;
    snap.player.y = node.py;
    snap.playerFacing = Direction.Left;
    for (let i = 0; i < ctx.pieceCount; i++) {
        const { x, y } = cellXY(ctx.w, node.pieceCell[i]!);
        const tpl = ctx.pieceTemplates[i]!;
        const p = snap.pieces[i]!;
        p.x = x;
        p.y = y;
        p.id = tpl.id;
        p.connectivity = tpl.connectivity;
        p.type = tpl.type;
        p.colorMode = tpl.colorMode;
        p.direction = tpl.direction;
        p.portalGroup = tpl.portalGroup;
    }
    return snap;
}

/**
 * 纯几何预检：不跑光追，blocked 则直接跳过。
 * @returns 'walk' | 'push' | null
 */
function geomMoveKind(node: CompactNode, dir: Direction, ctx: LevelSearchContext): 'walk' | 'push' | null {
    const { w, h, isWalkableFloor } = ctx;
    const dx = DIR_DX[dir]!;
    const dy = DIR_DY[dir]!;
    const nx = node.px + dx;
    const ny = node.py + dy;
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) {
        return null;
    }
    const nIdx = cellIndex(w, nx, ny);
    const pieceAtNext = node.pieceCell.findIndex((c) => c === nIdx);
    if (pieceAtNext < 0) {
        return isWalkableFloor[nIdx] ? 'walk' : null;
    }
    const bx = nx + dx;
    const by = ny + dy;
    if (bx < 0 || by < 0 || bx >= w || by >= h) {
        return null;
    }
    const bIdx = cellIndex(w, bx, by);
    if (!isWalkableFloor[bIdx]) {
        return null;
    }
    if (node.pieceCell.some((c) => c === bIdx)) {
        return null;
    }
    return 'push';
}

function applyGeomMove(node: CompactNode, dir: Direction, ctx: LevelSearchContext): CompactNode | null {
    const kind = geomMoveKind(node, dir, ctx);
    if (!kind) {
        return null;
    }
    const { w } = ctx;
    const dx = DIR_DX[dir]!;
    const dy = DIR_DY[dir]!;
    const nx = node.px + dx;
    const ny = node.py + dy;
    const pieceCell = node.pieceCell.slice();
    if (kind === 'push') {
        const nIdx = cellIndex(w, nx, ny);
        const pi = pieceCell.findIndex((c) => c === nIdx);
        pieceCell[pi] = cellIndex(w, nx + dx, ny + dy);
    }
    return { px: nx, py: ny, pieceCell, steps: node.steps + 1 };
}

function sortDirsByPushFirst(node: CompactNode, ctx: LevelSearchContext): Direction[] {
    const pushes: Direction[] = [];
    const walks: Direction[] = [];
    for (const d of EXPAND_ORDER) {
        const kind = geomMoveKind(node, d, ctx);
        if (!kind) {
            continue;
        }
        if (kind === 'push') {
            pushes.push(d);
        } else {
            walks.push(d);
        }
    }
    return pushes.concat(walks);
}

function applyMoveOnWorker(
    node: CompactNode,
    dir: Direction,
    ctx: LevelSearchContext,
): { ok: true; litMask: number; result: MoveAttemptResult } | { ok: false } {
    const snap = fillSnapshot(node, ctx);
    const { worker } = ctx;
    worker.restorePlayState(snap, { deferLighting: true });
    worker.setPlayerFacing(dir);
    const result = worker.tryMove(dir);
    if (result === MoveAttemptResult.Blocked) {
        return { ok: false };
    }
    return { ok: true, litMask: worker.getTargetLitMask(), result };
}

export function runOptimizedBfs(
    level: IOpticalLevelConfig,
    options: BfsEngineOptions = {},
): BfsEngineResult {
    const maxDepth = options.maxDepth ?? 200;
    const maxExplored = options.maxExplored ?? Infinity;
    const trackPath = options.trackPath !== false;
    const progressEvery = options.progressInterval ?? 50_000;

    const ctx = buildSearchContext(level);
    const startNode = nodeFromCore(ctx.worker, ctx, 0);

    if (ctx.worker.isAllTargetsLit()) {
        return { minSteps: 0, moves: [], exploredStates: 1, visitedStates: 1, elapsedMs: 0 };
    }

    const startKey = packStateKey(startNode.px, startNode.py, startNode.pieceCell, ctx.w, ctx.cellCount);
    const visited = new Set<bigint>([startKey]);

    const parent = new Map<
        bigint,
        { prevKey: bigint; dir: Direction; result: MoveAttemptResult }
    >();

    const queue: CompactNode[] = [startNode];
    let head = 0;
    let explored = 0;
    let maxQueue = 1;
    let goalKey: bigint | null = null;
    let goalSteps: number | null = null;
    const t0 = Date.now();

    while (head < queue.length) {
        const node = queue[head++]!;
        explored += 1;

        if (explored % progressEvery === 0 && options.onProgress) {
            options.onProgress({
                explored,
                visited: visited.size,
                queueSize: queue.length - head,
                currentDepth: node.steps,
                elapsedMs: Date.now() - t0,
            });
        }

        if (explored > maxExplored) {
            return {
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

        const fromKey = packStateKey(node.px, node.py, node.pieceCell, ctx.w, ctx.cellCount);
        const dirs = sortDirsByPushFirst(node, ctx);

        for (const dir of dirs) {
            const geomNext = applyGeomMove(node, dir, ctx);
            if (!geomNext) {
                continue;
            }

            const key = packStateKey(geomNext.px, geomNext.py, geomNext.pieceCell, ctx.w, ctx.cellCount);
            if (visited.has(key)) {
                continue;
            }

            const applied = applyMoveOnWorker(node, dir, ctx);
            if (!applied.ok) {
                continue;
            }

            const { litMask, result } = applied;

            if (litMask === ctx.fullLitMask) {
                if (trackPath) {
                    parent.set(key, { prevKey: fromKey, dir, result });
                }
                goalKey = key;
                goalSteps = node.steps + 1;
                head = queue.length;
                break;
            }

            visited.add(key);
            if (trackPath) {
                parent.set(key, { prevKey: fromKey, dir, result });
            }
            queue.push(geomNext);
            if (queue.length - head > maxQueue) {
                maxQueue = queue.length - head;
            }
        }
    }

    const elapsedMs = Date.now() - t0;

    if (goalSteps === null) {
        return {
            minSteps: null,
            moves: [],
            exploredStates: explored,
            visitedStates: visited.size,
            elapsedMs,
            reason: `BFS 在深度 ${maxDepth} 内未找到解（已探索 ${visited.size} 状态，队列峰值 ${maxQueue}）`,
        };
    }

    if (!trackPath || goalKey === null) {
        return {
            minSteps: goalSteps,
            moves: [],
            exploredStates: explored,
            visitedStates: visited.size,
            elapsedMs,
        };
    }

    const path: Array<{ dir: Direction; result: MoveAttemptResult }> = [];
    let k: bigint | undefined = goalKey;
    while (k !== undefined && k !== startKey) {
        const p = parent.get(k)!;
        path.push({ dir: p.dir, result: p.result });
        k = p.prevKey;
    }
    path.reverse();

    const moves: SolutionMove[] = [];
    const sim = new OpticalPuzzleCore();
    sim.reset(level);
    for (let i = 0; i < path.length; i++) {
        const { dir, result } = path[i]!;
        sim.setPlayerFacing(dir);
        sim.tryMove(dir);
        moves.push({
            step: i + 1,
            direction: dir,
            wasd: DIR_WASD[dir]!,
            result: result === MoveAttemptResult.PiecePushed ? 'push' : 'move',
        });
    }

    return {
        minSteps: goalSteps,
        moves,
        exploredStates: explored,
        visitedStates: visited.size,
        elapsedMs,
    };
}
