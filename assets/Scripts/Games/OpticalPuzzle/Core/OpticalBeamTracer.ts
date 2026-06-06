import type { IOpticalLightSource, IOpticalPiece, IOpticalTarget } from '../Config/OpticalPuzzleLevelSchema';
import {
    mergeOverlappingBeamSegments,
    recomputeTargetLitFromSegments,
} from './OpticalBeamOverlapMerge';
import type { OpticalBeamSegment } from './OpticalBeamTypes';
export type { OpticalBeamSegment } from './OpticalBeamTypes';
import { mixLightColors } from './OpticalColorMix';
import { colorModeToKey, lightMatchesTarget, resolveBeamColorKey } from './OpticalLightColor';
import {
    entrySideToPropagation,
    openDirectionsForPiece,
    propagationToEntrySide,
} from './OpticalPieceConnectivity';
import { Direction, normalizeDirection, TerrainKind } from './OpticalPuzzleTypes';

const DIR_DX: ReadonlyArray<number> = [1, 0, -1, 0];
const DIR_DY: ReadonlyArray<number> = [0, -1, 0, 1];

export interface OpticalBeamTraceInput {
    width: number;
    height: number;
    terrain: TerrainKind[];
    player: { x: number; y: number };
    pieces: readonly IOpticalPiece[];
    sources: readonly IOpticalLightSource[];
    targets: readonly IOpticalTarget[];
}

export interface OpticalBeamTraceResult {
    segments: OpticalBeamSegment[];
    targetLit: boolean[];
}

interface BeamRay {
    ax: number;
    ay: number;
    cx: number;
    cy: number;
    dir: Direction;
    colorKey: string;
}

function cellIndex(w: number, x: number, y: number): number {
    return y * w + x;
}

function inBounds(x: number, y: number, w: number, h: number): boolean {
    return x >= 0 && y >= 0 && x < w && y < h;
}

function isWall(x: number, y: number, w: number, terrain: TerrainKind[]): boolean {
    return terrain[cellIndex(w, x, y)] === TerrainKind.Wall;
}

function isPlayerCell(x: number, y: number, player: { x: number; y: number }): boolean {
    return player.x === x && player.y === y;
}

function pushSegment(
    segments: OpticalBeamSegment[],
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    colorKey: string,
): void {
    const eps = 1e-4;
    if (Math.abs(x0 - x1) < eps && Math.abs(y0 - y1) < eps) {
        return;
    }
    segments.push({ x0, y0, x1, y1, colorKey });
}

function tryLightTarget(
    x: number,
    y: number,
    w: number,
    colorKey: string,
    targetAt: ReadonlyMap<number, number>,
    targets: readonly IOpticalTarget[],
    targetLit: boolean[],
): void {
    const targetIdx = targetAt.get(cellIndex(w, x, y));
    if (targetIdx === undefined) {
        return;
    }
    const tgt = targets[targetIdx];
    if (lightMatchesTarget(colorKey, tgt.colorKey)) {
        targetLit[targetIdx] = true;
    }
}

function traceOneSource(
    src: IOpticalLightSource,
    input: OpticalBeamTraceInput,
    pieceAt: ReadonlyMap<number, IOpticalPiece>,
    targetAt: ReadonlyMap<number, number>,
    targetLit: boolean[],
    outSegments: OpticalBeamSegment[],
): void {
    const { width: w, height: h, terrain, player, targets } = input;
    const srcDir = normalizeDirection(src.direction, Direction.Down);
    const dx0 = DIR_DX[srcDir];
    const dy0 = DIR_DY[srcDir];
    if (dx0 === undefined || dy0 === undefined) {
        return;
    }
    const visited = new Set<string>();
    const queue: BeamRay[] = [
        {
            ax: src.x + 0.5 + dx0 * 0.5,
            ay: src.y + 0.5 + dy0 * 0.5,
            cx: src.x + dx0,
            cy: src.y + dy0,
            dir: srcDir,
            colorKey: resolveBeamColorKey(src.colorKey),
        },
    ];

    const maxSteps = w * h * 16;
    let steps = 0;

    while (queue.length > 0 && steps < maxSteps) {
        steps++;
        const beam = queue.shift()!;
        const { cx, cy, dir, colorKey } = beam;
        let { ax, ay } = beam;

        if (!inBounds(cx, cy, w, h)) {
            continue;
        }

        const visitKey = `${cx},${cy},${dir},${colorKey}`;
        if (visited.has(visitKey)) {
            continue;
        }
        visited.add(visitKey);

        if (isWall(cx, cy, w, terrain) || isPlayerCell(cx, cy, player)) {
            pushSegment(
                outSegments,
                ax,
                ay,
                cx + 0.5 - DIR_DX[dir] * 0.5,
                cy + 0.5 - DIR_DY[dir] * 0.5,
                colorKey,
            );
            continue;
        }

        if (terrain[cellIndex(w, cx, cy)] === TerrainKind.Target) {
            pushSegment(
                outSegments,
                ax,
                ay,
                cx + 0.5 - DIR_DX[dir] * 0.5,
                cy + 0.5 - DIR_DY[dir] * 0.5,
                colorKey,
            );
            tryLightTarget(cx, cy, w, colorKey, targetAt, targets, targetLit);
            continue;
        }

        if (terrain[cellIndex(w, cx, cy)] === TerrainKind.Source) {
            pushSegment(
                outSegments,
                ax,
                ay,
                cx + 0.5 - DIR_DX[dir] * 0.5,
                cy + 0.5 - DIR_DY[dir] * 0.5,
                colorKey,
            );
            continue;
        }

        const piece = pieceAt.get(cellIndex(w, cx, cy));
        if (!piece || piece.connectivity === 0) {
            if (piece) {
                pushSegment(
                    outSegments,
                    ax,
                    ay,
                    cx + 0.5 - DIR_DX[dir] * 0.5,
                    cy + 0.5 - DIR_DY[dir] * 0.5,
                    colorKey,
                );
                continue;
            }

            const nx = cx + DIR_DX[dir];
            const ny = cy + DIR_DY[dir];
            if (!inBounds(nx, ny, w, h)) {
                pushSegment(
                    outSegments,
                    ax,
                    ay,
                    cx + 0.5 + DIR_DX[dir] * 0.5,
                    cy + 0.5 + DIR_DY[dir] * 0.5,
                    colorKey,
                );
                continue;
            }
            pushSegment(
                outSegments,
                ax,
                ay,
                cx + 0.5 + DIR_DX[dir] * 0.5,
                cy + 0.5 + DIR_DY[dir] * 0.5,
                colorKey,
            );
            ax = cx + 0.5 + DIR_DX[dir] * 0.5;
            ay = cy + 0.5 + DIR_DY[dir] * 0.5;
            queue.push({ ax, ay, cx: nx, cy: ny, dir, colorKey });
            continue;
        }

        const openDirs = openDirectionsForPiece(piece.connectivity, piece.direction);
        const entrySide = propagationToEntrySide(dir);
        if (!openDirs.includes(entrySide)) {
            pushSegment(
                outSegments,
                ax,
                ay,
                cx + 0.5 - DIR_DX[dir] * 0.5,
                cy + 0.5 - DIR_DY[dir] * 0.5,
                colorKey,
            );
            continue;
        }

        const mx = cx + 0.5;
        const my = cy + 0.5;
        const entryX = mx - DIR_DX[dir] * 0.5;
        const entryY = my - DIR_DY[dir] * 0.5;
        const outColor = mixLightColors([colorKey, colorModeToKey(piece.colorMode)]);

        pushSegment(outSegments, ax, ay, entryX, entryY, colorKey);
        pushSegment(outSegments, entryX, entryY, mx, my, colorKey);

        const outputSides = openDirs.filter((s) => s !== entrySide);
        for (const outSide of outputSides) {
            const outDir = entrySideToPropagation(outSide);
            const exitX = mx + DIR_DX[outDir] * 0.5;
            const exitY = my + DIR_DY[outDir] * 0.5;
            pushSegment(outSegments, mx, my, exitX, exitY, outColor);
            queue.push({
                ax: exitX,
                ay: exitY,
                cx: cx + DIR_DX[outDir],
                cy: cy + DIR_DY[outDir],
                dir: outDir,
                colorKey: outColor,
            });
        }
    }
}

/** 通道 0～4 统一光追（格内 L 形折线，无斜镜反射表） */
export function traceBeams(input: OpticalBeamTraceInput): OpticalBeamTraceResult {
    const { width: w, pieces, sources, targets } = input;
    const pieceAt = new Map<number, IOpticalPiece>();
    for (const p of pieces) {
        pieceAt.set(cellIndex(w, p.x, p.y), p);
    }
    const targetAt = new Map<number, number>();
    targets.forEach((t, i) => {
        targetAt.set(cellIndex(w, t.x, t.y), i);
    });

    const rawSegments: OpticalBeamSegment[] = [];
    const scratchTargetLit = targets.map(() => false);

    for (const src of sources) {
        traceOneSource(src, input, pieceAt, targetAt, scratchTargetLit, rawSegments);
    }

    const segments = mergeOverlappingBeamSegments(rawSegments);
    const targetLit = recomputeTargetLitFromSegments(segments, targets);

    return { segments, targetLit };
}
