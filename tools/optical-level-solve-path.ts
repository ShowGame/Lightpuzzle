/**
 * 输出单关 BFS 最佳解法（WASD 字符串组）。
 * npx.cmd --yes tsx tools/optical-level-solve-path.ts path/to/level.json
 */
import * as fs from 'fs';
import {
    parseLayeredGridsToLevelConfig,
    type IOpticalLevelLayeredSource,
} from '../assets/Scripts/Games/OpticalPuzzle/Config/OpticalPuzzleLevelSchema';
import { solveWithPath } from './optical-level-solver';

async function main(): Promise<void> {
    const path = process.argv[2];
    if (!path) {
        console.error('用法: tsx tools/optical-level-solve-path.ts <level.json>');
        process.exit(1);
    }
    const raw = JSON.parse(fs.readFileSync(path, 'utf8')) as IOpticalLevelLayeredSource;
    const level = parseLayeredGridsToLevelConfig(raw);
    const maxDepth = Number(process.argv[3]) || 200;
    const { minSteps, moves, exploredStates } = solveWithPath(level, maxDepth);

    if (minSteps === null) {
        console.log(`无解（深度 ${maxDepth}，探索 ${exploredStates} 状态）`);
        process.exit(2);
    }

    console.log(`最少步数: ${minSteps}（探索 ${exploredStates} 状态）\n`);
    for (const m of moves) {
        const key = m.result === 'push' ? m.wasd.toUpperCase() : m.wasd;
        console.log(`${String(m.step).padStart(3)}  ${key}  ${m.result}`);
    }
    console.log('\nbestSolution:', JSON.stringify(moves.map((m) => m.wasd)));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
