/**
 * 光学解谜关卡：合法性校验 + BFS 最小步数 + 评星阈值 + 难度分。
 * 用法：npx --yes tsx tools/optical-level-solver.ts path/to/level.json
 * 或：  npx --yes tsx tools/optical-level-solver.ts --stdin  （从 stdin 读 JSON）
 */
import * as fs from 'fs';
import * as readline from 'readline';
import {
    parseLayeredGridsToLevelConfig,
    type IOpticalLevelConfig,
    type IOpticalLevelLayeredSource,
} from '../assets/Scripts/Games/OpticalPuzzle/Config/OpticalPuzzleLevelSchema';
import { OpticalPuzzleCore } from '../assets/Scripts/Games/OpticalPuzzle/Core/OpticalPuzzleCore';
import { ColorMode, Direction, MoveAttemptResult } from '../assets/Scripts/Games/OpticalPuzzle/Core/OpticalPuzzleTypes';

const ASPECT_MIN = 0.5;
const ASPECT_MAX = 0.67;
const MAX_WIDTH = 15;
const BFS_MAX_DEPTH = 200;

const DIR_WASD = ['d', 'w', 'a', 's'] as const;

export interface SolutionMove {
    step: number;
    direction: Direction;
    wasd: string;
    result: 'move' | 'push';
}

/** 方向键 w/a/s/d（与层 4 朝向一致；回放时由 Core 判定移动或推块） */
export function encodeSolutionMove(dir: Direction, _result?: MoveAttemptResult): string {
    return DIR_WASD[dir] ?? 'd';
}

export function encodeSolutionMoves(
    path: ReadonlyArray<{ dir: Direction; result: MoveAttemptResult }>,
): string[] {
    return path.map((m) => encodeSolutionMove(m.dir, m.result));
}

export interface LevelDesignConstraints {
    aspectMin: number;
    aspectMax: number;
    maxWidth: number;
}

export interface StarThresholdsComputed {
    perfectSteps: number;
    threeStarSteps: number;
    twoStarSteps: number;
    oneStarSteps: number;
}

export interface DifficultyBreakdown {
    pieceCount: number;
    sourceCount: number;
    targetCount: number;
    coloredPieceCount: number;
    secondarySourceTargetColors: number;
    minSteps: number;
    mapCells: number;
    rawScore: number;
    difficulty: number;
}

export interface LevelValidationResult {
    ok: boolean;
    errors: string[];
    warnings: string[];
}

export interface LevelSolveResult {
    solvable: boolean;
    minSteps: number | null;
    exploredStates: number;
    reason?: string;
}

export interface LevelAnalysisResult {
    validation: LevelValidationResult;
    solve: LevelSolveResult;
    starThresholds: StarThresholdsComputed | null;
    difficulty: DifficultyBreakdown | null;
    level: IOpticalLevelConfig | null;
}

function clamp(n: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, n));
}

function ceilMul(n: number, factor: number): number {
    return Math.max(0, Math.ceil(n * factor));
}

export function validateLayeredSource(
    src: IOpticalLevelLayeredSource,
    constraints: LevelDesignConstraints = {
        aspectMin: ASPECT_MIN,
        aspectMax: ASPECT_MAX,
        maxWidth: MAX_WIDTH,
    },
): LevelValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (src.width < 3 || src.height < 3) {
        errors.push(`尺寸过小：${src.width}×${src.height}`);
    }
    if (src.width > constraints.maxWidth) {
        errors.push(`宽度 ${src.width} 超过上限 ${constraints.maxWidth}`);
    }
    const aspect = src.height / src.width;
    if (aspect < constraints.aspectMin - 1e-6 || aspect > constraints.aspectMax + 1e-6) {
        errors.push(
            `高宽比 ${aspect.toFixed(3)} 不在 [${constraints.aspectMin}, ${constraints.aspectMax}]`,
        );
    }

    try {
        parseLayeredGridsToLevelConfig(src);
    } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
        return { ok: false, errors, warnings };
    }

    const level = parseLayeredGridsToLevelConfig(src);
    if (level.sources.length === 0) {
        errors.push('至少需要一个光源 S');
    }
    if (level.targets.length === 0) {
        errors.push('至少需要一个目标 E');
    }
    if (level.pieces.length === 0) {
        warnings.push('无可推动光学元件（仅走位关）');
    }

    return { ok: errors.length === 0, errors, warnings };
}

function stateKey(core: OpticalPuzzleCore): string {
    const play = core.clonePlayState();
    const parts = play.pieces
        .map((p) => `${p.id}@${p.x},${p.y}`)
        .sort()
        .join(';');
    return `${play.player.x},${play.player.y}|${parts}`;
}

export function solveMinSteps(level: IOpticalLevelConfig, maxDepth = BFS_MAX_DEPTH): LevelSolveResult {
    const startCore = new OpticalPuzzleCore();
    startCore.reset(level);
    if (startCore.isAllTargetsLit()) {
        return { solvable: true, minSteps: 0, exploredStates: 1 };
    }

    interface QueueNode {
        core: OpticalPuzzleCore;
        steps: number;
    }

    const visited = new Set<string>();
    const queue: QueueNode[] = [{ core: startCore, steps: 0 }];
    visited.add(stateKey(startCore));
    let explored = 0;

    while (queue.length > 0) {
        const { core, steps } = queue.shift()!;
        explored += 1;
        if (steps >= maxDepth) {
            continue;
        }

        for (let d = 0; d < 4; d++) {
            const next = new OpticalPuzzleCore();
            next.reset(level);
            next.restorePlayState(core.clonePlayState());
            next.setPlayerFacing(d as Direction);
            const r = next.tryMove(d as Direction);
            if (r === MoveAttemptResult.Blocked) {
                continue;
            }
            if (next.isAllTargetsLit()) {
                return { solvable: true, minSteps: steps + 1, exploredStates: explored };
            }
            const key = stateKey(next);
            if (visited.has(key)) {
                continue;
            }
            visited.add(key);
            queue.push({ core: next, steps: steps + 1 });
        }
    }

    return {
        solvable: false,
        minSteps: null,
        exploredStates: explored,
        reason: `BFS 在深度 ${maxDepth} 内未找到解（已探索 ${visited.size} 状态）`,
    };
}

export function solveWithPath(
    level: IOpticalLevelConfig,
    maxDepth = BFS_MAX_DEPTH,
): { minSteps: number | null; moves: SolutionMove[]; exploredStates: number } {
    const startCore = new OpticalPuzzleCore();
    startCore.reset(level);
    if (startCore.isAllTargetsLit()) {
        return { minSteps: 0, moves: [], exploredStates: 1 };
    }

    interface QueueNode {
        core: OpticalPuzzleCore;
        steps: number;
    }

    const visited = new Set<string>();
    const parent = new Map<string, { prevKey: string; dir: Direction; result: MoveAttemptResult }>();
    const queue: QueueNode[] = [{ core: startCore, steps: 0 }];
    const startKey = stateKey(startCore);
    visited.add(startKey);
    let explored = 0;
    let goalKey: string | null = null;

    while (queue.length > 0) {
        const { core, steps } = queue.shift()!;
        explored += 1;
        if (steps >= maxDepth) {
            continue;
        }

        for (let d = 0; d < 4; d++) {
            const next = new OpticalPuzzleCore();
            next.reset(level);
            next.restorePlayState(core.clonePlayState());
            next.setPlayerFacing(d as Direction);
            const r = next.tryMove(d as Direction);
            if (r === MoveAttemptResult.Blocked) {
                continue;
            }
            const key = stateKey(next);
            const fromKey = stateKey(core);
            if (next.isAllTargetsLit()) {
                parent.set(key, { prevKey: fromKey, dir: d as Direction, result: r });
                goalKey = key;
                queue.length = 0;
                break;
            }
            if (visited.has(key)) {
                continue;
            }
            visited.add(key);
            parent.set(key, { prevKey: fromKey, dir: d as Direction, result: r });
            queue.push({ core: next, steps: steps + 1 });
        }
    }

    if (!goalKey) {
        return { minSteps: null, moves: [], exploredStates: explored };
    }

    const path: Array<{ dir: Direction; result: MoveAttemptResult }> = [];
    let k: string | undefined = goalKey;
    while (k && k !== startKey) {
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
            wasd: DIR_WASD[dir],
            result: result === MoveAttemptResult.PiecePushed ? 'push' : 'move',
        });
    }

    return { minSteps: path.length, moves, exploredStates: explored };
}

export function solveBestSolutionStrings(
    level: IOpticalLevelConfig,
    maxDepth = BFS_MAX_DEPTH,
): { minSteps: number | null; bestSolution: string[]; exploredStates: number } {
    const { minSteps, moves, exploredStates } = solveWithPath(level, maxDepth);
    if (minSteps === null) {
        return { minSteps: null, bestSolution: [], exploredStates };
    }
    return {
        minSteps,
        bestSolution: moves.map((m) => m.wasd),
        exploredStates,
    };
}

export function computeStarThresholds(minSteps: number): StarThresholdsComputed {
    const min = Math.max(0, Math.floor(minSteps));
    return {
        perfectSteps: min,
        threeStarSteps: ceilMul(min, 1.25),
        twoStarSteps: ceilMul(min, 1.5),
        oneStarSteps: ceilMul(min, 2),
    };
}

export function computeDifficulty(level: IOpticalLevelConfig, minSteps: number): DifficultyBreakdown {
    const pieceCount = level.pieces.length;
    const sourceCount = level.sources.length;
    const targetCount = level.targets.length;
    const coloredPieceCount = level.pieces.filter((p) => p.colorMode !== ColorMode.Through).length;

    const secondary = new Set(['yellow', 'cyan', 'purple']);
    let secondarySourceTargetColors = 0;
    for (const s of level.sources) {
        if (secondary.has((s.colorKey ?? 'white').toLowerCase())) {
            secondarySourceTargetColors += 1;
        }
    }
    for (const t of level.targets) {
        if (secondary.has((t.colorKey ?? 'white').toLowerCase())) {
            secondarySourceTargetColors += 1;
        }
    }

    const mapCells = level.width * level.height;
    const rawScore =
        pieceCount * 4 +
        (sourceCount + targetCount) * 6 +
        coloredPieceCount * 5 +
        secondarySourceTargetColors * 10 +
        minSteps * 1.2 +
        mapCells * 0.12;

    const difficulty = Math.max(1, Math.round(rawScore * 0.65));

    return {
        pieceCount,
        sourceCount,
        targetCount,
        coloredPieceCount,
        secondarySourceTargetColors,
        minSteps,
        mapCells,
        rawScore,
        difficulty,
    };
}

export function analyzeLevelSource(src: IOpticalLevelLayeredSource): LevelAnalysisResult {
    const validation = validateLayeredSource(src);
    if (!validation.ok) {
        return {
            validation,
            solve: { solvable: false, minSteps: null, exploredStates: 0, reason: '合法性未通过' },
            starThresholds: null,
            difficulty: null,
            level: null,
        };
    }

    const level = parseLayeredGridsToLevelConfig(src);
    const solve = solveMinSteps(level);
    if (!solve.solvable || solve.minSteps === null) {
        return {
            validation,
            solve,
            starThresholds: null,
            difficulty: null,
            level,
        };
    }

    const starThresholds = computeStarThresholds(solve.minSteps);
    const difficulty = computeDifficulty(level, solve.minSteps);
    return {
        validation,
        solve,
        starThresholds,
        difficulty,
        level: { ...level, starThresholds },
    };
}

async function readStdinJson(): Promise<unknown> {
    const rl = readline.createInterface({ input: process.stdin, terminal: false });
    const lines: string[] = [];
    for await (const line of rl) {
        lines.push(line);
    }
    return JSON.parse(lines.join('\n'));
}

async function main(): Promise<void> {
    const arg = process.argv[2];
    let raw: unknown;
    if (arg === '--stdin') {
        raw = await readStdinJson();
    } else if (!arg) {
        console.error('用法: npx --yes tsx tools/optical-level-solver.ts <level.json>');
        console.error('  或: npx --yes tsx tools/optical-level-solver.ts --stdin');
        process.exit(2);
    } else {
        raw = JSON.parse(fs.readFileSync(arg, 'utf8'));
    }

    const result = analyzeLevelSource(raw as IOpticalLevelLayeredSource);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.validation.ok && result.solve.solvable ? 0 : 1);
}

const isDirectRun =
    typeof process.argv[1] === 'string' &&
    (process.argv[1].endsWith('optical-level-solver.ts') ||
        process.argv[1].endsWith('optical-level-solver.js'));

if (isDirectRun) {
    main().catch((e) => {
        console.error(e);
        process.exit(2);
    });
}
