/**
 * 纯推箱子求解 CLI：三层字符网格 → BFS 最少步数 + WASD 解法。
 *
 * 用法：
 *   npx.cmd --yes tsx tools/sokoban/sokoban-solver.ts path/to/level.json
 *   npx.cmd --yes tsx tools/sokoban/sokoban-solver.ts --stdin
 *
 * JSON 字段：
 *   terrain  — 地形层，`#` 墙，`.` 地板
 *   objects  — 物件层，`@` 玩家，`S` 箱子
 *   targets  — 目标层，`E` 目标格
 */
import * as fs from 'fs';
import * as readline from 'readline';
import {
    encodeSokobanSolution,
    parseSokobanLevel,
    solveSokobanBfs,
    validateSokobanSource,
    type SokobanLayeredSource,
} from './sokoban-bfs-engine';

async function readStdinJson(): Promise<SokobanLayeredSource> {
    const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
    const lines: string[] = [];
    for await (const line of rl) {
        lines.push(line);
    }
    return JSON.parse(lines.join('\n')) as SokobanLayeredSource;
}

async function main(): Promise<void> {
    const arg = process.argv[2];
    if (!arg) {
        console.error('用法: tsx tools/sokoban/sokoban-solver.ts <level.json>');
        console.error('  或: tsx tools/sokoban/sokoban-solver.ts --stdin');
        process.exit(1);
    }

    const raw: SokobanLayeredSource =
        arg === '--stdin'
            ? await readStdinJson()
            : (JSON.parse(fs.readFileSync(arg, 'utf8')) as SokobanLayeredSource);

    const validation = validateSokobanSource(raw);
    if (!validation.ok) {
        console.error('校验失败:');
        for (const e of validation.errors) {
            console.error(`  - ${e}`);
        }
        process.exit(1);
    }
    for (const w of validation.warnings) {
        console.warn(`警告: ${w}`);
    }

    const level = parseSokobanLevel(raw);
    const maxDepth = Number(process.argv[3]) || 200;
    const result = solveSokobanBfs(level, { maxDepth });

    const summary = {
        levelName: level.levelName,
        width: level.width,
        height: level.height,
        boxCount: level.startBoxes.length,
        targetCount: level.targetCells.length,
        validation,
        solve: {
            solvable: result.solvable,
            minSteps: result.minSteps,
            exploredStates: result.exploredStates,
            visitedStates: result.visitedStates,
            elapsedMs: result.elapsedMs,
            reason: result.reason,
            bestSolution: encodeSokobanSolution(result.moves),
        },
    };

    console.log(JSON.stringify(summary, null, 2));

    if (!result.solvable) {
        process.exit(2);
    }

    console.error('');
    console.error(`关卡: ${level.levelName} (${level.width}×${level.height})`);
    console.error(`最少步数: ${result.minSteps}（探索 ${result.exploredStates} 状态，${result.elapsedMs}ms）`);
    console.error('');
    for (const m of result.moves) {
        const key = m.result === 'push' ? m.wasd.toUpperCase() : m.wasd;
        console.error(`${String(m.step).padStart(3)}  ${key}  ${m.result}`);
    }
}

main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
});
