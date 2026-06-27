import type { IOpticalLightSource, IOpticalPiece, IOpticalTarget } from '../Config/OpticalPuzzleLevelSchema';
import {
    mergeOverlappingBeamSegments,
    recomputeTargetLitFromSegments,
} from './OpticalBeamOverlapMerge';
import { alignBlockContactsWithSegments } from './OpticalBeamContactResolve';
import type { OpticalBeamBlockContact, OpticalBeamSegment } from './OpticalBeamTypes';
export type { OpticalBeamBlockContact, OpticalBeamSegment } from './OpticalBeamTypes';
import {
    coerceBeamColorKey,
    collectColorKeyStrings,
    mixLightColors,
    type MixedLightColorKey,
} from './OpticalColorMix';
import type { BeamCycleContext } from './OpticalBeamCycleResolve';
import {
    applyCycleUniformColors,
    buildBeamCycleContext,
    computeCycleUniformColors,
    createCycleIncomingMap,
    recordCycleIncomingBeam,
    steadyColorAtCell,
    steadyEmissionColorForSource,
} from './OpticalBeamCycleResolve';
import { colorModeToKey, lightMatchesTarget, resolveBeamColorKey } from './OpticalLightColor';
import type { PieceConnectivity } from './OpticalPieceConnectivity';
import {
    entrySideToPropagation,
    openDirectionsForPiece,
    propagationToEntrySide,
} from './OpticalPieceConnectivity';
import {
    normalizeGridCoord,
    normalizeGridSize,
    normalizePieceConnectivity,
    normalizeTerrainKind,
    opticalDirDelta,
    terrainKindAt,
} from './OpticalRuntimeCoerce';
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
    /** 该射线归属的光源下标（`sources` 数组索引） */
    sourceIds: Set<number>;
}

function copySourceIds(sourceIds: ReadonlySet<number>): Set<number> {
    return new Set(sourceIds);
}

function mergeSourceIds(target: Set<number>, from: ReadonlySet<number>): void {
    for (const id of from) {
        target.add(id);
    }
}

function cellIndex(w: number, x: number, y: number): number {
    return y * w + x;
}

function inBounds(x: number, y: number, w: number, h: number): boolean {
    return x >= 0 && y >= 0 && x < w && y < h;
}

function isWall(x: number, y: number, w: number, terrain: TerrainKind[]): boolean {
    return terrainKindAt(terrain, cellIndex(w, x, y)) === TerrainKind.Wall;
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

function pieceCellKey(cx: number, cy: number): string {
    return `${cx},${cy}`;
}

interface TraceAllBeamsOptions {
    /** 为 false 时不记录环外入射（第二遍光追用） */
    recordCycleIncoming?: boolean;
    /** 已算出的环稳态色；环上元件出射强制使用该色 */
    cycleUniformByGroup?: ReadonlyMap<number, MixedLightColorKey>;
}

function cycleGroupIdForPieceEmission(
    w: number,
    cx: number,
    cy: number,
    cycleCtx: BeamCycleContext,
): number | undefined {
    return cycleCtx.cellToGroupId.get(cellIndex(w, cx, cy));
}

function pieceOutColor(
    w: number,
    cx: number,
    cy: number,
    piece: IOpticalPiece,
    incomingColors: readonly string[],
    sourceIds: ReadonlySet<number>,
    cycleCtx: BeamCycleContext,
    cycleUniformByGroup?: ReadonlyMap<number, MixedLightColorKey>,
): MixedLightColorKey {
    const gid = cycleGroupIdForPieceEmission(w, cx, cy, cycleCtx);
    if (gid !== undefined && cycleUniformByGroup) {
        const group = cycleCtx.groups.find((g) => g.id === gid);
        if (group && group.sourceIndices.some((sid) => sourceIds.has(sid))) {
            const uniform = cycleUniformByGroup.get(gid);
            if (uniform !== undefined) {
                return uniform;
            }
        }
    }
    const mergedIncoming = mixLightColors(incomingColors);
    return mixLightColors([mergedIncoming, colorModeToKey(piece.colorMode)]);
}

function processOnePieceCell(
    w: number,
    pieceAt: ReadonlyMap<number, IOpticalPiece>,
    cellKey: string,
    pieceIncoming: Map<string, string[]>,
    pieceEntryDirs: Map<string, Direction[]>,
    pieceSourceIds: Map<string, Set<number>>,
    outSegments: OpticalBeamSegment[],
    queue: BeamRay[],
    cycleCtx: BeamCycleContext,
    cycleUniformByGroup?: ReadonlyMap<number, MixedLightColorKey>,
): void {
    const colors = pieceIncoming.get(cellKey);
    const entryDirs = pieceEntryDirs.get(cellKey);
    const sourceIds = pieceSourceIds.get(cellKey);
    if (!colors || colors.length === 0 || !entryDirs || entryDirs.length === 0 || !sourceIds) {
        return;
    }

    const parts = cellKey.split(',');
    const cx = Number(parts[0]);
    const cy = Number(parts[1]);
    const piece = pieceAt.get(cellIndex(w, cx, cy));
    if (!piece) {
        return;
    }

    const openDirs = openDirectionsForPiece(piece.connectivity, piece.direction);
    const outColor = pieceOutColor(w, cx, cy, piece, colors, sourceIds, cycleCtx, cycleUniformByGroup);

    const outputSides = new Set<Direction>();
    for (const entryDir of entryDirs) {
        const entrySide = propagationToEntrySide(entryDir);
        for (const side of openDirs) {
            if (side !== entrySide) {
                outputSides.add(side);
            }
        }
    }

    const mx = cx + 0.5;
    const my = cy + 0.5;
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
            sourceIds: copySourceIds(sourceIds),
        });
    }
}

function processWavePendingPieces(
    w: number,
    pieceAt: ReadonlyMap<number, IOpticalPiece>,
    pendingPieceCells: Set<string>,
    pieceIncoming: Map<string, string[]>,
    pieceEntryDirs: Map<string, Direction[]>,
    pieceSourceIds: Map<string, Set<number>>,
    outSegments: OpticalBeamSegment[],
    nextWave: BeamRay[],
    cycleCtx: BeamCycleContext,
    cycleUniformByGroup?: ReadonlyMap<number, MixedLightColorKey>,
): void {
    const cells = sortPieceCellKeys(Array.from(pendingPieceCells));
    pendingPieceCells.clear();

    for (const cellKey of cells) {
        processOnePieceCell(
            w,
            pieceAt,
            cellKey,
            pieceIncoming,
            pieceEntryDirs,
            pieceSourceIds,
            outSegments,
            nextWave,
            cycleCtx,
            cycleUniformByGroup,
        );
        pieceIncoming.delete(cellKey);
        pieceEntryDirs.delete(cellKey);
        pieceSourceIds.delete(cellKey);
    }
}

function advanceBeamRay(
    input: OpticalBeamTraceInput,
    beam: BeamRay,
    pieceAt: ReadonlyMap<number, IOpticalPiece>,
    targetAt: ReadonlyMap<number, number>,
    targetLit: boolean[],
    visited: Set<string>,
    pieceIncoming: Map<string, string[]>,
    pieceEntryDirs: Map<string, Direction[]>,
    pieceSourceIds: Map<string, Set<number>>,
    pendingPieceCells: Set<string>,
    outSegments: OpticalBeamSegment[],
    outBlockContacts: OpticalBeamBlockContact[],
    nextWave: BeamRay[],
    cycleCtx: BeamCycleContext,
    incomingByCycle: Map<number, string[]>,
    traceOptions: TraceAllBeamsOptions = {},
): void {
    const { recordCycleIncoming = true, cycleUniformByGroup } = traceOptions;
    const { width: w, height: h, terrain, player, targets } = input;
    const { cx, cy, dir } = beam;
    let { ax, ay } = beam;
    const colorKey = steadyColorAtCell(
        cx,
        cy,
        dir,
        w,
        beam.colorKey,
        beam.sourceIds,
        cycleCtx,
        cycleUniformByGroup,
    );

    if (!inBounds(cx, cy, w, h)) {
        return;
    }

    const piece = pieceAt.get(cellIndex(w, cx, cy));
    const isPieceCell = piece != null && piece.connectivity !== 0;

    const visitKey = isPieceCell
        ? `${cx},${cy},${dir},${colorKey},p`
        : `${cx},${cy},${dir},${colorKey}`;
    if (visited.has(visitKey)) {
        return;
    }
    visited.add(visitKey);

    if (recordCycleIncoming) {
        recordCycleIncomingBeam(
            cx,
            cy,
            dir,
            colorKey,
            cycleCtx,
            w,
            incomingByCycle,
            pieceAt,
            beam.sourceIds,
        );
    }

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
        return;
    }

    if (terrainKindAt(terrain, cellIndex(w, cx, cy)) === TerrainKind.Target) {
        pushSegment(
            outSegments,
            ax,
            ay,
            cx + 0.5 - DIR_DX[dir] * 0.5,
            cy + 0.5 - DIR_DY[dir] * 0.5,
            colorKey,
        );
        tryLightTarget(cx, cy, w, colorKey, targetAt, targets, targetLit);
        return;
    }

    if (terrainKindAt(terrain, cellIndex(w, cx, cy)) === TerrainKind.Source) {
        pushSegment(
            outSegments,
            ax,
            ay,
            cx + 0.5 - DIR_DX[dir] * 0.5,
            cy + 0.5 - DIR_DY[dir] * 0.5,
            colorKey,
        );
        return;
    }

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
            return;
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
            return;
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
        nextWave.push({
            ax,
            ay,
            cx: nx,
            cy: ny,
            dir,
            colorKey,
            sourceIds: copySourceIds(beam.sourceIds),
        });
        return;
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
        return;
    }

    const cellKey = pieceCellKey(cx, cy);
    let incomingList = pieceIncoming.get(cellKey);
    if (!incomingList) {
        incomingList = [];
        pieceIncoming.set(cellKey, incomingList);
    }
    incomingList.push(resolveBeamColorKey(colorKey));

    let entryDirs = pieceEntryDirs.get(cellKey);
    if (!entryDirs) {
        entryDirs = [];
        pieceEntryDirs.set(cellKey, entryDirs);
    }
    entryDirs.push(dir);
    pendingPieceCells.add(cellKey);

    let sourceIdSet = pieceSourceIds.get(cellKey);
    if (!sourceIdSet) {
        sourceIdSet = new Set<number>();
        pieceSourceIds.set(cellKey, sourceIdSet);
    }
    mergeSourceIds(sourceIdSet, beam.sourceIds);

    const mx = cx + 0.5;
    const my = cy + 0.5;
    const entryX = mx - DIR_DX[dir] * 0.5;
    const entryY = my - DIR_DY[dir] * 0.5;
    pushSegment(outSegments, ax, ay, entryX, entryY, colorKey);
    pushSegment(outSegments, entryX, entryY, mx, my, colorKey);
}

function sortPieceCellKeys(keys: readonly string[]): string[] {
    return [...keys].sort((a, b) => {
        const pa = a.split(',').map(Number);
        const pb = b.split(',').map(Number);
        return pa[1] - pb[1] || pa[0] - pb[0];
    });
}

function beamRayStateKey(beam: BeamRay): string {
    return `${beam.cx},${beam.cy},${beam.dir},${beam.colorKey}`;
}

/** 同波层内合并相同 (格, 方向, 色) 的射线，避免分路指数膨胀 */
function dedupeWaveRays(beams: readonly BeamRay[]): BeamRay[] {
    const map = new Map<string, BeamRay>();
    for (const beam of beams) {
        const key = beamRayStateKey(beam);
        const existing = map.get(key);
        if (!existing) {
            map.set(key, { ...beam, sourceIds: copySourceIds(beam.sourceIds) });
        } else {
            mergeSourceIds(existing.sourceIds, beam.sourceIds);
        }
    }
    return Array.from(map.values());
}

function traceAllBeams(
    input: OpticalBeamTraceInput,
    sources: readonly IOpticalLightSource[],
    pieceAt: ReadonlyMap<number, IOpticalPiece>,
    targetAt: ReadonlyMap<number, number>,
    targetLit: boolean[],
    outSegments: OpticalBeamSegment[],
    outBlockContacts: OpticalBeamBlockContact[],
    cycleCtx: BeamCycleContext,
    incomingByCycle: Map<number, string[]>,
    traceOptions: TraceAllBeamsOptions = {},
): void {
    const { width: w, height: h } = input;
    let currentWave: BeamRay[] = [];

    for (let si = 0; si < sources.length; si++) {
        const src = sources[si];
        const delta = opticalDirDelta(src.direction);
        if (!delta) {
            continue;
        }
        const { dx: dx0, dy: dy0, dir: srcDir } = delta;
        const sx = normalizeGridCoord(src.x);
        const sy = normalizeGridCoord(src.y);
        currentWave.push({
            ax: sx + 0.5 + dx0 * 0.5,
            ay: sy + 0.5 + dy0 * 0.5,
            cx: sx + dx0,
            cy: sy + dy0,
            dir: srcDir,
            colorKey: steadyEmissionColorForSource(
                src,
                si,
                w,
                cycleCtx,
                traceOptions.cycleUniformByGroup,
            ),
            sourceIds: new Set([si]),
        });
    }

    /** 空地/目标等：按色分开防环；元件格用 `,p` 后缀允许多色入射累积 */
    const visited = new Set<string>();
    const maxWaves = w * h * 8 * Math.max(1, sources.length);

    for (let wave = 0; wave < maxWaves && currentWave.length > 0; wave++) {
        currentWave = dedupeWaveRays(currentWave);
        if (currentWave.length === 0) {
            break;
        }

        const nextWave: BeamRay[] = [];
        const pieceIncoming = new Map<string, string[]>();
        const pieceEntryDirs = new Map<string, Direction[]>();
        const pieceSourceIds = new Map<string, Set<number>>();
        const pendingPieceCells = new Set<string>();

        for (const beam of currentWave) {
            advanceBeamRay(
                input,
                beam,
                pieceAt,
                targetAt,
                targetLit,
                visited,
                pieceIncoming,
                pieceEntryDirs,
                pieceSourceIds,
                pendingPieceCells,
                outSegments,
                outBlockContacts,
                nextWave,
                cycleCtx,
                incomingByCycle,
                traceOptions,
            );
        }

        processWavePendingPieces(
            w,
            pieceAt,
            pendingPieceCells,
            pieceIncoming,
            pieceEntryDirs,
            pieceSourceIds,
            outSegments,
            nextWave,
            cycleCtx,
            traceOptions.cycleUniformByGroup,
        );

        currentWave = nextWave;
    }
}

/** 通道 0～4 统一光追（波层同步多光源 + 稳态环后处理） */
export function traceBeams(input: OpticalBeamTraceInput): OpticalBeamTraceResult {
    const w = normalizeGridSize(input.width, input.width);
    const h = normalizeGridSize(input.height, input.height);
    const normalizedInput: OpticalBeamTraceInput = {
        ...input,
        width: w,
        height: h,
        terrain: input.terrain.map((t) => normalizeTerrainKind(t) as TerrainKind),
        player: {
            x: normalizeGridCoord(input.player.x),
            y: normalizeGridCoord(input.player.y),
        },
        pieces: input.pieces.map((p) => ({
            ...p,
            x: normalizeGridCoord(p.x),
            y: normalizeGridCoord(p.y),
            direction: normalizeDirection(p.direction, Direction.Up),
            connectivity: normalizePieceConnectivity(p.connectivity) as PieceConnectivity,
        })),
        sources: input.sources.map((s) => ({
            ...s,
            x: normalizeGridCoord(s.x),
            y: normalizeGridCoord(s.y),
            direction: normalizeDirection(s.direction, Direction.Down),
        })),
        targets: input.targets.map((t) => ({
            ...t,
            x: normalizeGridCoord(t.x),
            y: normalizeGridCoord(t.y),
        })),
    };
    const { pieces, sources, targets } = normalizedInput;
    const pieceAt = new Map<number, IOpticalPiece>();
    for (const p of pieces) {
        pieceAt.set(cellIndex(w, p.x, p.y), p);
    }
    const targetAt = new Map<number, number>();
    targets.forEach((t, i) => {
        targetAt.set(cellIndex(w, t.x, t.y), i);
    });

    const cycleCtx = buildBeamCycleContext(normalizedInput, pieceAt);
    const incomingByCycle = createCycleIncomingMap(cycleCtx);

    /** 第一遍：收集环外入射（不产出最终光段） */
    const incomingProbeLit = targets.map(() => false);
    traceAllBeams(
        normalizedInput,
        sources,
        pieceAt,
        targetAt,
        incomingProbeLit,
        [],
        [],
        cycleCtx,
        incomingByCycle,
        { recordCycleIncoming: true },
    );

    const cycleColors = computeCycleUniformColors(cycleCtx, incomingByCycle);

    /** 第二遍：环上元件出射使用环稳态色 */
    const rawSegments: OpticalBeamSegment[] = [];
    const rawBlockContacts: OpticalBeamBlockContact[] = [];
    const scratchTargetLit = targets.map(() => false);
    traceAllBeams(
        normalizedInput,
        sources,
        pieceAt,
        targetAt,
        scratchTargetLit,
        rawSegments,
        rawBlockContacts,
        cycleCtx,
        incomingByCycle,
        { recordCycleIncoming: false, cycleUniformByGroup: cycleColors },
    );
    const cycleResolvedSegments = applyCycleUniformColors(rawSegments, cycleCtx, cycleColors, w, pieceAt);

    const segments = mergeOverlappingBeamSegments(cycleResolvedSegments);
    const blockContacts = alignBlockContactsWithSegments(
        dedupeBlockContacts(rawBlockContacts),
        segments,
    );
    const targetLit = recomputeTargetLitFromSegments(segments, targets);

    return { segments, blockContacts, targetLit };
}
