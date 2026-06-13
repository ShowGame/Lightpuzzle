/**
 * 批量为 OPTICAL_LEVEL_LAYERED_SOURCES 求 BFS 最佳解法。
 * npx.cmd --yes tsx tools/gen-level-solutions.ts
 */
import { OPTICAL_LEVEL_LAYERED_SOURCES } from '../assets/Scripts/Games/OpticalPuzzle/Config/OpticalPuzzleLevels';
import { parseLayeredGridsToLevelConfig } from '../assets/Scripts/Games/OpticalPuzzle/Config/OpticalPuzzleLevelSchema';
import { solveBestSolutionStrings } from './optical-level-solver';

const DEPTH_BY_LEVEL: Record<number, number> = {
    1: 50,
    2: 80,
    3: 80,
    4: 80,
    5: 80,
    6: 80,
    7: 120,
    8: 120,
};

function formatSolutionArray(moves: readonly string[]): string {
    const lines = moves.map((m) => `            '${m}',`);
    return `        bestSolution: [\n${lines.join('\n')}\n        ],`;
}

for (const src of OPTICAL_LEVEL_LAYERED_SOURCES) {
    const level = parseLayeredGridsToLevelConfig(src);
    const maxDepth = DEPTH_BY_LEVEL[src.levelId] ?? 200;
    const { minSteps, bestSolution, exploredStates } = solveBestSolutionStrings(level, maxDepth);

    console.log(`\n=== Level ${src.levelId} ${src.levelName} (depth ${maxDepth}) ===`);
    if (minSteps === null) {
        console.log(`  UNSOLVED (explored ${exploredStates})`);
        continue;
    }
    console.log(`  minSteps: ${minSteps}  perfectSteps: ${src.perfectSteps ?? '—'}  explored: ${exploredStates}`);
    console.log(formatSolutionArray(bestSolution));
}
