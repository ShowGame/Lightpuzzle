import type { IOpticalLightSource, IOpticalPiece } from '../Config/OpticalPuzzleLevelSchema';
import type { OpticalBeamSegment } from './OpticalBeamTypes';
import { mixLightColors, type MixedLightColorKey } from './OpticalColorMix';
import { colorModeToKey, resolveBeamColorKey } from './OpticalLightColor';
import {
    entrySideToPropagation,
    openDirectionsForPiece,
    propagationToEntrySide,
} from './OpticalPieceConnectivity';
import type { OpticalBeamTraceInput } from './OpticalBeamTracer';
import { Direction, normalizeDirection, TerrainKind } from './OpticalPuzzleTypes';

const DIR_DX: ReadonlyArray<number> = [1, 0, -1, 0];
const DIR_DY: ReadonlyArray<number> = [0, -1, 0, 1];
const EPS = 1e-4;

export interface BeamCycleGroup {
    id: number;
    /** 稳态环上的光传播状态 (x,y,dir) */
    stateKeys: ReadonlySet<string>;
    /** 由状态推导的格（用于滤光元件邻域等） */
    cellIndices: ReadonlySet<number>;
    /** 参与本稳态环的光源下标（`sources` 数组索引） */
    sourceIndices: readonly number[];
    /** 环内光源层 3 色 */
    sourceColorKeys: readonly string[];
    /** 环上滤光元件层 3 色（R/G/B，每格至多一项） */
    pieceFilterColorKeys: readonly string[];
}

export interface BeamCycleContext {
    groups: readonly BeamCycleGroup[];
    /** 光状态 → 循环组 id（按方向连通，非按格） */
    stateToGroupId: ReadonlyMap<string, number>;
    /** 仅稳态环上的光学元件格 → 组 id（后处理着色用） */
    cellToGroupId: ReadonlyMap<number, number>;
}

function cellIndex(w: number, x: number, y: number): number {
    return y * w + x;
}

function inBounds(x: number, y: number, w: number, h: number): boolean {
    return x >= 0 && y >= 0 && x < w && y < h;
}

function isBlockedCell(
    x: number,
    y: number,
    w: number,
    terrain: TerrainKind[],
    player: { x: number; y: number },
): boolean {
    if (!inBounds(x, y, w, terrain.length / w)) {
        return true;
    }
    if (player.x === x && player.y === y) {
        return true;
    }
    const t = terrain[cellIndex(w, x, y)];
    return t === TerrainKind.Wall || t === TerrainKind.Source || t === TerrainKind.Target;
}

function parseStateKey(sk: string): { x: number; y: number; dir: Direction } {
    const parts = sk.split(',');
    return { x: Number(parts[0]), y: Number(parts[1]), dir: Number(parts[2]) as Direction };
}

function statesToCellIndices(states: ReadonlySet<string>, w: number): Set<number> {
    const cells = new Set<number>();
    for (const sk of states) {
        const { x, y } = parseStateKey(sk);
        cells.add(cellIndex(w, x, y));
    }
    return cells;
}

function stateKey(x: number, y: number, dir: Direction): string {
    return `${x},${y},${dir}`;
}

function transitionsFromState(
    x: number,
    y: number,
    dir: Direction,
    w: number,
    h: number,
    terrain: TerrainKind[],
    player: { x: number; y: number },
    pieceAt: ReadonlyMap<number, IOpticalPiece>,
): Array<{ x: number; y: number; dir: Direction }> {
    if (isBlockedCell(x, y, w, terrain, player)) {
        return [];
    }

    const piece = pieceAt.get(cellIndex(w, x, y));
    if (!piece || piece.connectivity === 0) {
        if (piece) {
            return [];
        }
        const nx = x + DIR_DX[dir];
        const ny = y + DIR_DY[dir];
        if (!inBounds(nx, ny, w, h) || isBlockedCell(nx, ny, w, terrain, player)) {
            return [];
        }
        return [{ x: nx, y: ny, dir }];
    }

    const openDirs = openDirectionsForPiece(piece.connectivity, piece.direction);
    const entrySide = propagationToEntrySide(dir);
    if (!openDirs.includes(entrySide)) {
        return [];
    }

    const out: Array<{ x: number; y: number; dir: Direction }> = [];
    for (const outSide of openDirs) {
        if (outSide === entrySide) {
            continue;
        }
        const outDir = entrySideToPropagation(outSide);
        const nx = x + DIR_DX[outDir];
        const ny = y + DIR_DY[outDir];
        if (!inBounds(nx, ny, w, h) || isBlockedCell(nx, ny, w, terrain, player)) {
            continue;
        }
        out.push({ x: nx, y: ny, dir: outDir });
    }
    return out;
}

function findCyclicStateGroups(
    w: number,
    h: number,
    terrain: TerrainKind[],
    player: { x: number; y: number },
    pieceAt: ReadonlyMap<number, IOpticalPiece>,
): ReadonlySet<string>[] {
    const edges = new Map<string, string[]>();
    const nodes: string[] = [];

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (isBlockedCell(x, y, w, terrain, player)) {
                continue;
            }
            for (let dir = 0; dir < 4; dir++) {
                const d = dir as Direction;
                const from = stateKey(x, y, d);
                nodes.push(from);
                const nexts = transitionsFromState(x, y, d, w, h, terrain, player, pieceAt);
                edges.set(from, nexts.map((n) => stateKey(n.x, n.y, n.dir)));
            }
        }
    }

    const index = new Map<string, number>();
    const lowlink = new Map<string, number>();
    const onStack = new Set<string>();
    const stack: string[] = [];
    let nextIndex = 0;
    const sccs: string[][] = [];

    function strongConnect(v: string): void {
        index.set(v, nextIndex);
        lowlink.set(v, nextIndex);
        nextIndex++;
        stack.push(v);
        onStack.add(v);

        for (const wKey of edges.get(v) ?? []) {
            if (!index.has(wKey)) {
                strongConnect(wKey);
                lowlink.set(v, Math.min(lowlink.get(v)!, lowlink.get(wKey)!));
            } else if (onStack.has(wKey)) {
                lowlink.set(v, Math.min(lowlink.get(v)!, index.get(wKey)!));
            }
        }

        if (lowlink.get(v) === index.get(v)) {
            const comp: string[] = [];
            let wNode: string;
            do {
                wNode = stack.pop()!;
                onStack.delete(wNode);
                comp.push(wNode);
            } while (wNode !== v);
            sccs.push(comp);
        }
    }

    for (const n of nodes) {
        if (!index.has(n)) {
            strongConnect(n);
        }
    }

    const cyclicStateSets: ReadonlySet<string>[] = [];
    for (const comp of sccs) {
        if (comp.length <= 1) {
            const only = comp[0];
            const outs = edges.get(only) ?? [];
            if (!outs.includes(only)) {
                continue;
            }
        }
        if (comp.length >= 3) {
            cyclicStateSets.push(new Set(comp));
        }
    }

    return cyclicStateSets;
}

function reachableStatesFromSourceEmission(
    src: IOpticalLightSource,
    w: number,
    h: number,
    terrain: TerrainKind[],
    player: { x: number; y: number },
    pieceAt: ReadonlyMap<number, IOpticalPiece>,
): Set<string> {
    const states = new Set<string>();
    const dir = normalizeDirection(src.direction, Direction.Down);
    const startX = src.x + DIR_DX[dir];
    const startY = src.y + DIR_DY[dir];
    if (!inBounds(startX, startY, w, h) || isBlockedCell(startX, startY, w, terrain, player)) {
        return states;
    }

    const visited = new Set<string>();
    const queue: Array<{ x: number; y: number; dir: Direction }> = [{ x: startX, y: startY, dir }];
    while (queue.length > 0) {
        const { x, y, dir: beamDir } = queue.shift()!;
        const sk = stateKey(x, y, beamDir);
        if (visited.has(sk)) {
            continue;
        }
        visited.add(sk);
        states.add(sk);

        const nexts = transitionsFromState(x, y, beamDir, w, h, terrain, player, pieceAt);
        for (const n of nexts) {
            queue.push(n);
        }
    }
    return states;
}

/** 两束光路是否在光学元件格上通过方向状态交汇（同格不同方向不算地板虚空交叉） */
function stateSetsConnectOnPieces(
    a: ReadonlySet<string>,
    b: ReadonlySet<string>,
    pieceAt: ReadonlyMap<number, IOpticalPiece>,
    w: number,
): boolean {
    const pieceCellsB = new Set<number>();
    for (const sk of b) {
        const { x, y } = parseStateKey(sk);
        const idx = cellIndex(w, x, y);
        if (isPassableOpticalPieceCell(idx, pieceAt)) {
            pieceCellsB.add(idx);
        }
    }
    for (const sk of a) {
        const { x, y } = parseStateKey(sk);
        const idx = cellIndex(w, x, y);
        if (pieceCellsB.has(idx) && isPassableOpticalPieceCell(idx, pieceAt)) {
            return true;
        }
    }
    return false;
}

interface SteadyStateBundle {
    states: Set<string>;
    sourceIndices: number[];
}

function sourceIndicesReachingStateSet(
    targetStates: ReadonlySet<string>,
    w: number,
    h: number,
    terrain: TerrainKind[],
    player: { x: number; y: number },
    sources: readonly IOpticalLightSource[],
    pieceAt: ReadonlyMap<number, IOpticalPiece>,
): number[] {
    const indices: number[] = [];
    for (let i = 0; i < sources.length; i++) {
        const reach = reachableStatesFromSourceEmission(
            sources[i],
            w,
            h,
            terrain,
            player,
            pieceAt,
        );
        for (const sk of targetStates) {
            if (reach.has(sk)) {
                indices.push(i);
                break;
            }
        }
    }
    return indices;
}

function sourceColorKeysForIndices(
    sources: readonly IOpticalLightSource[],
    indices: readonly number[],
): string[] {
    const keys: string[] = [];
    const seen = new Set<string>();
    for (const i of indices) {
        const key = resolveBeamColorKey(sources[i].colorKey);
        if (!seen.has(key)) {
            seen.add(key);
            keys.push(key);
        }
    }
    return keys;
}

function mergeOverlappingStateSets(
    bundles: SteadyStateBundle[],
    pieceAt: ReadonlyMap<number, IOpticalPiece>,
    w: number,
): SteadyStateBundle[] {
    const merged: SteadyStateBundle[] = bundles.map((b) => ({
        states: new Set(b.states),
        sourceIndices: [...b.sourceIndices],
    }));
    let changed = true;
    while (changed) {
        changed = false;
        for (let i = 0; i < merged.length; i++) {
            for (let j = i + 1; j < merged.length; j++) {
                const a = merged[i];
                const b = merged[j];
                if (!stateSetsConnectOnPieces(a.states, b.states, pieceAt, w)) {
                    continue;
                }
                for (const sk of b.states) {
                    a.states.add(sk);
                }
                for (const sid of b.sourceIndices) {
                    if (!a.sourceIndices.includes(sid)) {
                        a.sourceIndices.push(sid);
                    }
                }
                merged.splice(j, 1);
                changed = true;
                break;
            }
            if (changed) {
                break;
            }
        }
    }
    return merged;
}

/**
 * 多光源经十字等元件光路连通（在元件格上可达交汇）时，视为同一稳态环；
 * 状态集为簇内各光源可达状态的并集（按 (x,y,dir)，非按格 footprint）。
 */
/** 同行对射光源：无元件但地板光路在同一行交汇（如左右侧源） */
function sourcesConnectOnOpposingFloorRow(
    i: number,
    j: number,
    sources: readonly IOpticalLightSource[],
    reachSets: readonly ReadonlySet<string>[],
    w: number,
): boolean {
    const a = sources[i];
    const b = sources[j];
    if (a.y !== b.y) {
        return false;
    }
    const dirA = normalizeDirection(a.direction, Direction.Down);
    const dirB = normalizeDirection(b.direction, Direction.Down);
    if (dirA !== Direction.Right || dirB !== Direction.Left) {
        return false;
    }
    const row = a.y;
    const cellsOnRowB = new Set<number>();
    for (const sk of reachSets[j]) {
        const { x, y } = parseStateKey(sk);
        if (y === row) {
            cellsOnRowB.add(cellIndex(w, x, y));
        }
    }
    for (const sk of reachSets[i]) {
        const { x, y } = parseStateKey(sk);
        if (y === row && cellsOnRowB.has(cellIndex(w, x, y))) {
            return true;
        }
    }
    return false;
}

function findMultiSourceConnectedStateGroups(
    input: OpticalBeamTraceInput,
    pieceAt: ReadonlyMap<number, IOpticalPiece>,
): SteadyStateBundle[] {
    const { width: w, height: h, terrain, player, sources } = input;
    if (sources.length < 2) {
        return [];
    }

    const reachSets = sources.map((src) =>
        reachableStatesFromSourceEmission(src, w, h, terrain, player, pieceAt),
    );

    const parent = sources.map((_, i) => i);
    function find(i: number): number {
        while (parent[i] !== i) {
            parent[i] = parent[parent[i]];
            i = parent[i];
        }
        return i;
    }
    function union(a: number, b: number): void {
        const ra = find(a);
        const rb = find(b);
        if (ra !== rb) {
            parent[rb] = ra;
        }
    }

    for (let i = 0; i < sources.length; i++) {
        for (let j = i + 1; j < sources.length; j++) {
            if (
                stateSetsConnectOnPieces(reachSets[i], reachSets[j], pieceAt, w) ||
                sourcesConnectOnOpposingFloorRow(i, j, sources, reachSets, w)
            ) {
                union(i, j);
            }
        }
    }

    const clusters = new Map<number, number[]>();
    for (let i = 0; i < sources.length; i++) {
        const root = find(i);
        let list = clusters.get(root);
        if (!list) {
            list = [];
            clusters.set(root, list);
        }
        list.push(i);
    }

    const out: SteadyStateBundle[] = [];
    for (const indices of clusters.values()) {
        if (indices.length < 2) {
            continue;
        }
        const merged = new Set<string>();
        for (const i of indices) {
            for (const sk of reachSets[i]) {
                merged.add(sk);
            }
        }
        out.push({ states: merged, sourceIndices: [...indices] });
    }
    return out;
}

function isPassableOpticalPieceCell(
    idx: number,
    pieceAt: ReadonlyMap<number, IOpticalPiece>,
): boolean {
    const piece = pieceAt.get(idx);
    return piece != null && piece.connectivity !== 0;
}

function coloredFilterKeysAttachedToCycle(
    cellIndices: ReadonlySet<number>,
    w: number,
    h: number,
    pieceAt: ReadonlyMap<number, IOpticalPiece>,
): string[] {
    const keys: string[] = [];
    const seenKeys = new Set<string>();
    const visited = new Set<number>();
    const queue: Array<{ idx: number; depth: number }> = [];
    for (const idx of cellIndices) {
        queue.push({ idx, depth: 0 });
        visited.add(idx);
    }
    /** 环外短支路上的滤光元件（如底绿十字）也参与稳态混色 */
    const maxDepth = 4;
    while (queue.length > 0) {
        const { idx, depth } = queue.shift()!;
        const piece = pieceAt.get(idx);
        if (piece) {
            const key = colorModeToKey(piece.colorMode);
            if (key !== 'white' && !seenKeys.has(key)) {
                seenKeys.add(key);
                keys.push(key);
            }
        }
        if (depth >= maxDepth) {
            continue;
        }
        const x = idx % w;
        const y = Math.floor(idx / w);
        for (let d = 0; d < 4; d++) {
            const nx = x + DIR_DX[d];
            const ny = y + DIR_DY[d];
            if (!inBounds(nx, ny, w, h)) {
                continue;
            }
            const nidx = cellIndex(w, nx, ny);
            if (visited.has(nidx)) {
                continue;
            }
            visited.add(nidx);
            queue.push({ idx: nidx, depth: depth + 1 });
        }
    }
    return keys;
}

/** 稳态环：状态图 SCC + 多光源经元件连通（二者有交集则合并） */
export function buildBeamCycleContext(
    input: OpticalBeamTraceInput,
    pieceAt: ReadonlyMap<number, IOpticalPiece>,
): BeamCycleContext {
    const { width: w, height: h, terrain, player, sources } = input;
    const cyclicStateSets = findCyclicStateGroups(w, h, terrain, player, pieceAt);
    const cyclicBundles: SteadyStateBundle[] = cyclicStateSets.map((states) => ({
        states: new Set(states),
        sourceIndices: sourceIndicesReachingStateSet(
            states,
            w,
            h,
            terrain,
            player,
            sources,
            pieceAt,
        ),
    }));
    const connectedBundles = findMultiSourceConnectedStateGroups(input, pieceAt);
    const mergedBundles = mergeOverlappingStateSets(
        [...cyclicBundles, ...connectedBundles],
        pieceAt,
        w,
    );

    const groups: BeamCycleGroup[] = mergedBundles.map((bundle, id) => {
        const stateKeys = bundle.states;
        const cellIndices = statesToCellIndices(stateKeys, w);
        const sourceIndices = bundle.sourceIndices;
        return {
            id,
            stateKeys,
            cellIndices,
            sourceIndices,
            sourceColorKeys: sourceColorKeysForIndices(sources, sourceIndices),
            pieceFilterColorKeys: coloredFilterKeysAttachedToCycle(cellIndices, w, h, pieceAt),
        };
    });

    const stateToGroupId = new Map<string, number>();
    const cellToGroupId = new Map<number, number>();
    for (const g of groups) {
        for (const sk of g.stateKeys) {
            stateToGroupId.set(sk, g.id);
            const { x, y } = parseStateKey(sk);
            const idx = cellIndex(w, x, y);
            const piece = pieceAt.get(idx);
            if (piece != null && piece.connectivity !== 0) {
                cellToGroupId.set(idx, g.id);
            }
        }
    }

    return { groups, stateToGroupId, cellToGroupId };
}

export function createCycleIncomingMap(ctx: BeamCycleContext): Map<number, string[]> {
    const incoming = new Map<number, string[]>();
    for (const g of ctx.groups) {
        incoming.set(g.id, []);
    }
    return incoming;
}

/**
 * 记录射入循环光路的外来光（在元件混色之前、从环外格进入时调用）。
 * 每束入射单独 push，供后续与环上滤光元件色一起累加混色。
 */
export function recordCycleIncomingBeam(
    cx: number,
    cy: number,
    dir: Direction,
    colorKey: string,
    ctx: BeamCycleContext,
    w: number,
    incoming: Map<number, string[]>,
    pieceAt: ReadonlyMap<number, IOpticalPiece>,
    sourceIds: ReadonlySet<number>,
): void {
    const sk = stateKey(cx, cy, dir);
    const gid = ctx.stateToGroupId.get(sk);
    if (gid === undefined) {
        return;
    }
    const px = cx - DIR_DX[dir];
    const py = cy - DIR_DY[dir];
    if (ctx.stateToGroupId.has(stateKey(px, py, dir))) {
        return;
    }
    const group = ctx.groups.find((g) => g.id === gid);
    if (!group) {
        return;
    }
    // 本环光源射入已计入 sourceColorKeys，不算环外入射
    if (beamBelongsToSteadyGroup(group, sourceIds)) {
        return;
    }
    const piece = pieceAt.get(cellIndex(w, cx, cy));
    const isPieceCell = piece != null && piece.connectivity !== 0;
    // 异源光仅垂直/水平穿过环内地板不算环外入射（虚空十字交叉）
    if (!isPieceCell && !beamBelongsToSteadyGroup(group, sourceIds)) {
        return;
    }
    incoming.get(gid)!.push(resolveBeamColorKey(colorKey));
}

/** 组内光源色 + 环外入射 + 滤光元件色 → 稳态色 */
export function computeCycleUniformColors(
    ctx: BeamCycleContext,
    incomingByGroup: ReadonlyMap<number, string[]>,
): Map<number, MixedLightColorKey> {
    const out = new Map<number, MixedLightColorKey>();
    for (const g of ctx.groups) {
        const inputs = incomingByGroup.get(g.id) ?? [];
        const filterExtras = g.pieceFilterColorKeys.filter(
            (fk) => !g.sourceColorKeys.includes(fk),
        );
        const mixKeys = [...g.sourceColorKeys, ...inputs, ...filterExtras];
        out.set(g.id, mixKeys.length > 0 ? mixLightColors(mixKeys) : 'white');
    }
    return out;
}

/** 稳态环内传播/着色用的统一色（第二遍光追）；仅当射线归属该环光源时替换 */
export function steadyColorAtCell(
    cx: number,
    cy: number,
    dir: Direction,
    w: number,
    colorKey: string,
    sourceIds: ReadonlySet<number>,
    ctx: BeamCycleContext,
    steadyByGroup?: ReadonlyMap<number, MixedLightColorKey>,
): string {
    if (!steadyByGroup) {
        return colorKey;
    }
    const gid = ctx.stateToGroupId.get(stateKey(cx, cy, dir));
    if (gid === undefined) {
        return colorKey;
    }
    const group = ctx.groups.find((g) => g.id === gid);
    if (!group || !beamBelongsToSteadyGroup(group, sourceIds)) {
        return colorKey;
    }
    return steadyByGroup.get(gid) ?? colorKey;
}

/** 稳态环内光源的出射初始色（非环内光源保持本色） */
export function steadyEmissionColorForSource(
    src: IOpticalLightSource,
    sourceIndex: number,
    w: number,
    ctx: BeamCycleContext,
    steadyByGroup?: ReadonlyMap<number, MixedLightColorKey>,
): string {
    const base = resolveBeamColorKey(src.colorKey);
    if (!steadyByGroup) {
        return base;
    }
    for (const g of ctx.groups) {
        if (g.sourceIndices.includes(sourceIndex)) {
            const steady = steadyByGroup.get(g.id);
            if (steady !== undefined) {
                return steady;
            }
        }
    }
    return base;
}

function beamBelongsToSteadyGroup(group: BeamCycleGroup, sourceIds: ReadonlySet<number>): boolean {
    for (const sid of sourceIds) {
        if (group.sourceIndices.includes(sid)) {
            return true;
        }
    }
    return false;
}

function cellsOverlap1D(lo: number, hi: number, cellStart: number): boolean {
    const cellLo = cellStart;
    const cellHi = cellStart + 1;
    return Math.max(lo, cellLo) < Math.min(hi, cellHi) - EPS;
}

/** 光段穿过的格；水平段取 floor(y)，垂直段取 floor(x) */
function cellsUnderSegment(seg: OpticalBeamSegment): Array<{ x: number; y: number }> {
    const dx = seg.x1 - seg.x0;
    const dy = seg.y1 - seg.y0;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);

    if (adx >= ady) {
        const y = Math.floor((seg.y0 + seg.y1) * 0.5);
        const lo = Math.min(seg.x0, seg.x1);
        const hi = Math.max(seg.x0, seg.x1);
        const cells: Array<{ x: number; y: number }> = [];
        const cxStart = Math.floor(lo);
        const cxEnd = Math.ceil(hi) - 1;
        for (let x = cxStart; x <= cxEnd; x++) {
            if (cellsOverlap1D(lo, hi, x)) {
                cells.push({ x, y });
            }
        }
        return cells;
    }

    const x = Math.floor((seg.x0 + seg.x1) * 0.5);
    const lo = Math.min(seg.y0, seg.y1);
    const hi = Math.max(seg.y0, seg.y1);
    const cells: Array<{ x: number; y: number }> = [];
    const cyStart = Math.floor(lo);
    const cyEnd = Math.ceil(hi) - 1;
    for (let y = cyStart; y <= cyEnd; y++) {
        if (cellsOverlap1D(lo, hi, y)) {
            cells.push({ x, y });
        }
    }
    return cells;
}

function clipSegmentToCellSpan(
    seg: OpticalBeamSegment,
    minCellX: number,
    maxCellX: number,
    minCellY: number,
    maxCellY: number,
): OpticalBeamSegment | null {
    const dx = seg.x1 - seg.x0;
    const dy = seg.y1 - seg.y0;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);

    if (adx >= ady) {
        const y = seg.y0;
        const lo = Math.min(seg.x0, seg.x1);
        const hi = Math.max(seg.x0, seg.x1);
        const clipLo = Math.max(lo, minCellX);
        const clipHi = Math.min(hi, maxCellX + 1);
        if (clipHi - clipLo < EPS) {
            return null;
        }
        if (seg.x0 <= seg.x1) {
            return { x0: clipLo, y0: y, x1: clipHi, y1: y, colorKey: seg.colorKey };
        }
        return { x0: clipHi, y0: y, x1: clipLo, y1: y, colorKey: seg.colorKey };
    }

    const x = seg.x0;
    const lo = Math.min(seg.y0, seg.y1);
    const hi = Math.max(seg.y0, seg.y1);
    const clipLo = Math.max(lo, minCellY);
    const clipHi = Math.min(hi, maxCellY + 1);
    if (clipHi - clipLo < EPS) {
        return null;
    }
    if (seg.y0 <= seg.y1) {
        return { x0: x, y0: clipLo, x1: x, y1: clipHi, colorKey: seg.colorKey };
    }
    return { x0: x, y0: clipHi, x1: x, y1: clipLo, colorKey: seg.colorKey };
}

function pieceGroupIdAtCell(
    x: number,
    y: number,
    w: number,
    ctx: BeamCycleContext,
    pieceAt: ReadonlyMap<number, IOpticalPiece>,
): number | undefined {
    const idx = cellIndex(w, x, y);
    const piece = pieceAt.get(idx);
    if (!piece || piece.connectivity === 0) {
        return undefined;
    }
    return ctx.cellToGroupId.get(idx);
}

function splitSegmentForCycleColor(
    seg: OpticalBeamSegment,
    ctx: BeamCycleContext,
    colorsByGroup: ReadonlyMap<number, MixedLightColorKey>,
    w: number,
    pieceAt: ReadonlyMap<number, IOpticalPiece>,
): OpticalBeamSegment[] {
    const cells = cellsUnderSegment(seg);
    if (cells.length === 0) {
        return [{ ...seg }];
    }

    const out: OpticalBeamSegment[] = [];
    let runGid: number | undefined | null = null;
    let runMinX = 0;
    let runMaxX = 0;
    let runMinY = 0;
    let runMaxY = 0;

    const flushRun = (): void => {
        if (runGid === null) {
            return;
        }
        const clipped = clipSegmentToCellSpan(seg, runMinX, runMaxX, runMinY, runMaxY);
        if (!clipped) {
            runGid = null;
            return;
        }
        if (runGid === undefined) {
            out.push({ ...clipped });
        } else {
            const colorKey = colorsByGroup.get(runGid) ?? clipped.colorKey;
            out.push({ ...clipped, colorKey });
        }
        runGid = null;
    };

    for (const c of cells) {
        const gid = pieceGroupIdAtCell(c.x, c.y, w, ctx, pieceAt);
        if (runGid === null) {
            runGid = gid;
            runMinX = c.x;
            runMaxX = c.x;
            runMinY = c.y;
            runMaxY = c.y;
            continue;
        }
        if (gid === runGid) {
            runMinX = Math.min(runMinX, c.x);
            runMaxX = Math.max(runMaxX, c.x);
            runMinY = Math.min(runMinY, c.y);
            runMaxY = Math.max(runMaxY, c.y);
            continue;
        }
        flushRun();
        runGid = gid;
        runMinX = c.x;
        runMaxX = c.x;
        runMinY = c.y;
        runMaxY = c.y;
    }
    flushRun();

    if (out.length === 0) {
        return [{ ...seg }];
    }
    return out;
}

/** 将循环光路覆盖段统一为计算色（仅元件格；地板虚空交叉保留原色） */
export function applyCycleUniformColors(
    segments: readonly OpticalBeamSegment[],
    ctx: BeamCycleContext,
    colorsByGroup: ReadonlyMap<number, MixedLightColorKey>,
    w: number,
    pieceAt: ReadonlyMap<number, IOpticalPiece>,
): OpticalBeamSegment[] {
    if (ctx.groups.length === 0) {
        return segments.map((s) => ({ ...s }));
    }

    const out: OpticalBeamSegment[] = [];
    for (const seg of segments) {
        out.push(...splitSegmentForCycleColor(seg, ctx, colorsByGroup, w, pieceAt));
    }
    return out;
}
