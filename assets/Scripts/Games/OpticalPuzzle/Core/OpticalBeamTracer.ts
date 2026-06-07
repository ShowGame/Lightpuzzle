import type { IOpticalLightSource, IOpticalPiece, IOpticalTarget } from '../Config/OpticalPuzzleLevelSchema';
import {
    mergeOverlappingBeamSegments,
    recomputeTargetLitFromSegments,
} from './OpticalBeamOverlapMerge';
import { alignBlockContactsWithSegments } from './OpticalBeamContactResolve';
import type { OpticalBeamBlockContact, OpticalBeamSegment } from './OpticalBeamTypes';
export type { OpticalBeamBlockContact, OpticalBeamSegment } from './OpticalBeamTypes';
import { mixLightColors, coerceBeamColorKey, collectColorKeyStrings } from './OpticalColorMix';
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
    blockContacts: OpticalBeamBlockContact[];
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

function blockContactAtCellFace(
    cx: number,
    cy: number,
    dir: Direction,
): { x: number; y: number } {
    return {
        x: cx + 0.5 - DIR_DX[dir] * 0.5,
        y: cy + 0.5 - DIR_DY[dir] * 0.5,
    };
}

/** 光线在地图边界被截断时的接触点（当前格朝传播方向的外侧面） */
function blockContactAtMapEdge(
    cx: number,
    cy: number,
    dir: Direction,
): { x: number; y: number } {
    return {
        x: cx + 0.5 + DIR_DX[dir] * 0.5,
        y: cy + 0.5 + DIR_DY[dir] * 0.5,
    };
}

function pushBlockContact(
    contacts: OpticalBeamBlockContact[],
    cx: number,
    cy: number,
    dir: Direction,
    colorKey: string,
    atMapEdge = false,
): void {
    const { x, y } = atMapEdge
        ? blockContactAtMapEdge(cx, cy, dir)
        : blockContactAtCellFace(cx, cy, dir);
    contacts.push({ x, y, dir, colorKey });
}

function dedupeBlockContacts(contacts: readonly OpticalBeamBlockContact[]): OpticalBeamBlockContact[] {
    const grouped = new Map<string, { x: number; y: number; dir: Direction; colorKeys: Set<string> }>();
    for (const contact of contacts) {
        const key = `${Math.round(contact.x * 2000)},${Math.round(contact.y * 2000)},${contact.dir}`;
        let entry = grouped.get(key);
        if (!entry) {
            entry = { x: contact.x, y: contact.y, dir: contact.dir as Direction, colorKeys: new Set() };
            grouped.set(key, entry);
        }
        for (const colorKey of collectColorKeyStrings(contact.colorKey)) {
            entry.colorKeys.add(resolveBeamColorKey(colorKey));
        }
    }
    const out: OpticalBeamBlockContact[] = [];
    for (const entry of grouped.values()) {
        const keys = [...entry.colorKeys];
        out.push({
            x: entry.x,
            y: entry.y,
            dir: entry.dir,
            colorKey: coerceBeamColorKey(keys),
        });
    }
    return out;
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
    outBlockContacts: OpticalBeamBlockContact[],
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
            pushBlockContact(outBlockContacts, cx, cy, dir, colorKey);
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
                pushBlockContact(outBlockContacts, cx, cy, dir, colorKey);
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
                pushBlockContact(outBlockContacts, cx, cy, dir, colorKey, true);
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
            pushBlockContact(outBlockContacts, cx, cy, dir, colorKey);
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
    const rawBlockContacts: OpticalBeamBlockContact[] = [];
    const scratchTargetLit = targets.map(() => false);

    for (const src of sources) {
        traceOneSource(src, input, pieceAt, targetAt, scratchTargetLit, rawSegments, rawBlockContacts);
    }

    const segments = mergeOverlappingBeamSegments(rawSegments);
    const blockContacts = alignBlockContactsWithSegments(
        dedupeBlockContacts(rawBlockContacts),
        segments,
    );
    const targetLit = recomputeTargetLitFromSegments(segments, targets);

    return { segments, blockContacts, targetLit };
}
