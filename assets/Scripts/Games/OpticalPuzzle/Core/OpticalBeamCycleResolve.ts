import type { IOpticalLightSource, IOpticalPiece } from '../Config/OpticalPuzzleLevelSchema';
import type { OpticalBeamSegment } from './OpticalBeamTypes';
import { mixLightColors, type MixedLightColorKey } from './OpticalColorMix';
import { colorModeToKey, resolveBeamColorKey } from './OpticalLightColor';
import {
    canEnterPieceWithPropagation,
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
    /** 由状态推导的格（光实际经过） */
    cellIndices: ReadonlySet<number>;
    /** 参与本稳态环的光源下标（`sources` 数组索引） */
    sourceIndices: readonly number[];
    /** 环内光源层 3 色 */
    sourceColorKeys: readonly string[];
    /** 环上滤光元件层 3 色（R/G/B，每格至多一项） */
    pieceFilterColorKeys: readonly string[];
    /** 组内是否存在 SCC 闭合环（有则地板态也强制稳态色；纯源间连通则否） */
    hasClosedCycle: boolean;
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
        const nextPiece = pieceAt.get(cellIndex(w, nx, ny));
        if (
            nextPiece
            && nextPiece.connectivity !== 0
            && !canEnterPieceWithPropagation(dir, nextPiece)
        ) {
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

function buildTransitionEdges(
    w: number,
    h: number,
    terrain: TerrainKind[],
    player: { x: number; y: number },
    pieceAt: ReadonlyMap<number, IOpticalPiece>,
): Map<string, string[]> {
    const edges = new Map<string, string[]>();

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (isBlockedCell(x, y, w, terrain, player)) {
                continue;
            }
            for (let dir = 0; dir < 4; dir++) {
                const d = dir as Direction;
                const piece = pieceAt.get(cellIndex(w, x, y));
                if (
                    piece
                    && piece.connectivity !== 0
                    && !canEnterPieceWithPropagation(d, piece)
                ) {
                    continue;
                }
                const from = stateKey(x, y, d);
                const nexts = transitionsFromState(x, y, d, w, h, terrain, player, pieceAt);
                edges.set(from, nexts.map((n) => stateKey(n.x, n.y, n.dir)));
            }
        }
    }

    return edges;
}

function buildReverseEdges(forward: ReadonlyMap<string, string[]>): Map<string, string[]> {
    const reverse = new Map<string, string[]>();
    for (const [from, tos] of forward) {
        for (const to of tos) {
            let preds = reverse.get(to);
            if (!preds) {
                preds = [];
                reverse.set(to, preds);
            }
            preds.push(from);
        }
    }
    return reverse;
}

/** 从 seed 状态沿正向边 BFS */
function forwardReachableFrom(
    seeds: ReadonlySet<string>,
    forwardEdges: ReadonlyMap<string, string[]>,
): Set<string> {
    const out = new Set<string>();
    const queue: string[] = [];
    for (const sk of seeds) {
        if (!out.has(sk)) {
            out.add(sk);
            queue.push(sk);
        }
    }
    while (queue.length > 0) {
        const sk = queue.shift()!;
        for (const next of forwardEdges.get(sk) ?? []) {
            if (!out.has(next)) {
                out.add(next);
                queue.push(next);
            }
        }
    }
    return out;
}

function collectSourceEmissionStateKeys(
    sources: readonly IOpticalLightSource[],
    w: number,
    h: number,
    terrain: TerrainKind[],
    player: { x: number; y: number },
): Set<string> {
    const out = new Set<string>();
    for (let i = 0; i < sources.length; i++) {
        const sk = sourceEmissionStateKey(sources[i], i, w, h, terrain, player);
        if (sk) {
            out.add(sk);
        }
    }
    return out;
}

function collectSourceEmissionStateKeyByIndex(
    sources: readonly IOpticalLightSource[],
    w: number,
    h: number,
    terrain: TerrainKind[],
    player: { x: number; y: number },
): Map<number, string> {
    const out = new Map<number, string>();
    for (let i = 0; i < sources.length; i++) {
        const sk = sourceEmissionStateKey(sources[i], i, w, h, terrain, player);
        if (sk) {
            out.set(i, sk);
        }
    }
    return out;
}

function sourceEmissionStateKey(
    src: IOpticalLightSource,
    _index: number,
    w: number,
    h: number,
    terrain: TerrainKind[],
    player: { x: number; y: number },
): string | null {
    const dir = normalizeDirection(src.direction, Direction.Down);
    const startX = src.x + DIR_DX[dir];
    const startY = src.y + DIR_DY[dir];
    if (!inBounds(startX, startY, w, h) || isBlockedCell(startX, startY, w, terrain, player)) {
        return null;
    }
    return stateKey(startX, startY, dir);
}

/** 在状态子集内找 SCC 闭合环，其状态作为「环锚点」（环外射后须能回到此处） */
function findCycleAnchorStatesInSet(
    states: ReadonlySet<string>,
    forwardEdges: ReadonlyMap<string, string[]>,
): Set<string> {
    const anchors = new Set<string>();
    if (states.size === 0) {
        return anchors;
    }

    const edgesFrom = (v: string): string[] =>
        (forwardEdges.get(v) ?? []).filter((to) => states.has(to));

    const nodes = [...states];
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

        for (const wKey of edgesFrom(v)) {
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

    for (const comp of sccs) {
        if (comp.length <= 1) {
            const only = comp[0];
            if (edgesFrom(only).includes(only)) {
                for (const sk of comp) {
                    anchors.add(sk);
                }
            }
        } else if (comp.length >= 3) {
            for (const sk of comp) {
                anchors.add(sk);
            }
        }
    }
    return anchors;
}

function buildAnchorStatesForBundle(
    bundle: SteadyStateBundle,
    forwardEdges: ReadonlyMap<string, string[]>,
    emissionBySourceIndex: ReadonlyMap<number, string>,
): Set<string> {
    const anchors = new Set<string>();
    for (const i of bundle.sourceIndices) {
        const es = emissionBySourceIndex.get(i);
        if (es) {
            anchors.add(es);
        }
    }
    for (const sk of findCycleAnchorStatesInSet(bundle.states, forwardEdges)) {
        anchors.add(sk);
    }
    return anchors;
}

function canReachAnyAnchorState(
    fromSk: string,
    forwardEdges: ReadonlyMap<string, string[]>,
    anchorStates: ReadonlySet<string>,
): boolean {
    if (anchorStates.size === 0) {
        return false;
    }
    const reachable = forwardReachableFrom(new Set([fromSk]), forwardEdges);
    for (const anchor of anchorStates) {
        if (reachable.has(anchor)) {
            return true;
        }
    }
    return false;
}

/**
 * 剔除元件格上不能回到稳态锚点的状态（锚点 = 环上 SCC 态 ∪ 组内光源出射态）；地板态保留。
 */
function filterStatesByPieceReturnToAnchors(
    states: ReadonlySet<string>,
    forwardEdges: ReadonlyMap<string, string[]>,
    anchorStates: ReadonlySet<string>,
    pieceAt: ReadonlyMap<number, IOpticalPiece>,
    w: number,
): Set<string> {
    const out = new Set<string>();
    for (const sk of states) {
        const { x, y, dir } = parseStateKey(sk);
        const piece = pieceAt.get(cellIndex(w, x, y));
        if (!piece || piece.connectivity === 0) {
            out.add(sk);
            continue;
        }
        if (!canEnterPieceWithPropagation(dir, piece)) {
            continue;
        }
        if (canReachAnyAnchorState(sk, forwardEdges, anchorStates)) {
            out.add(sk);
        }
    }
    return out;
}


/** 从 seed 状态沿反向边 BFS，得到「能到达 seed 中某一态」的全部状态 */
function reverseReachableFrom(
    seeds: ReadonlySet<string>,
    reverseEdges: ReadonlyMap<string, string[]>,
): Set<string> {
    const out = new Set<string>();
    const queue: string[] = [];
    for (const sk of seeds) {
        if (!out.has(sk)) {
            out.add(sk);
            queue.push(sk);
        }
    }
    while (queue.length > 0) {
        const sk = queue.shift()!;
        for (const pred of reverseEdges.get(sk) ?? []) {
            if (!out.has(pred)) {
                out.add(pred);
                queue.push(pred);
            }
        }
    }
    return out;
}

/**
 * 光源 A 可达态 ∩ 「能到达光源 B 可达态」= 位于 A→B 光路上的状态（含地板与元件）。
 * 不含 A 可达但到不了 B 的岔路/末梢。
 */
function statesOnPathBetweenReachSets(
    reachA: ReadonlySet<string>,
    reachB: ReadonlySet<string>,
    reverseEdges: ReadonlyMap<string, string[]>,
): Set<string> {
    const canReachB = reverseReachableFrom(reachB, reverseEdges);
    const out = new Set<string>();
    for (const sk of reachA) {
        if (canReachB.has(sk)) {
            out.add(sk);
        }
    }
    return out;
}

function findCyclicStateGroups(
    forwardEdges: ReadonlyMap<string, string[]>,
): ReadonlySet<string>[] {
    const nodes: string[] = [];
    for (const from of forwardEdges.keys()) {
        nodes.push(from);
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

        for (const wKey of forwardEdges.get(v) ?? []) {
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
            const outs = forwardEdges.get(only) ?? [];
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

/** 两束光路是否在光学元件格上以合法入射态交汇（按 connectivity 通道，非按格 footprint） */
function stateSetsConnectOnPieces(
    a: ReadonlySet<string>,
    b: ReadonlySet<string>,
    pieceAt: ReadonlyMap<number, IOpticalPiece>,
    w: number,
): boolean {
    const pieceCellsB = new Set<number>();
    for (const sk of b) {
        const { x, y, dir } = parseStateKey(sk);
        const idx = cellIndex(w, x, y);
        const piece = pieceAt.get(idx);
        if (
            piece
            && piece.connectivity !== 0
            && canEnterPieceWithPropagation(dir, piece)
        ) {
            pieceCellsB.add(idx);
        }
    }
    for (const sk of a) {
        const { x, y, dir } = parseStateKey(sk);
        const idx = cellIndex(w, x, y);
        const piece = pieceAt.get(idx);
        if (
            piece
            && piece.connectivity !== 0
            && pieceCellsB.has(idx)
            && canEnterPieceWithPropagation(dir, piece)
        ) {
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
 * 多光源经光学元件连通（共享元件格过光）时视为同一抽象稳态网；
 * 状态集为源间光路；元件是否参与稳态在合并后按锚点统一过滤。
 * 不含纯地板对射合并（避免无元件交汇时误染整段光路）。
 */
function findMultiSourceConnectedStateGroups(
    input: OpticalBeamTraceInput,
    pieceAt: ReadonlyMap<number, IOpticalPiece>,
    forwardEdges: ReadonlyMap<string, string[]>,
    reverseEdges: ReadonlyMap<string, string[]>,
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
            if (stateSetsConnectOnPieces(reachSets[i], reachSets[j], pieceAt, w)) {
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
        for (let a = 0; a < indices.length; a++) {
            for (let b = a + 1; b < indices.length; b++) {
                const i = indices[a];
                const j = indices[b];
                for (const sk of statesOnPathBetweenReachSets(
                    reachSets[i],
                    reachSets[j],
                    reverseEdges,
                )) {
                    merged.add(sk);
                }
                for (const sk of statesOnPathBetweenReachSets(
                    reachSets[j],
                    reachSets[i],
                    reverseEdges,
                )) {
                    merged.add(sk);
                }
            }
        }
        if (merged.size === 0) {
            continue;
        }
        out.push({ states: merged, sourceIndices: [...indices] });
    }
    return out;
}

/** 稳态滤光元件：合法入射且至少一态能回到组内锚点（环 SCC 态 ∪ 光源出射态） */
function coloredFilterKeysOnCycleStates(
    stateKeys: ReadonlySet<string>,
    w: number,
    pieceAt: ReadonlyMap<number, IOpticalPiece>,
    forwardEdges?: ReadonlyMap<string, string[]>,
    anchorStates?: ReadonlySet<string>,
): string[] {
    const keys: string[] = [];
    const seenKeys = new Set<string>();
    const seenCells = new Set<number>();
    const statesByCell = new Map<number, string[]>();
    for (const sk of stateKeys) {
        const { x, y, dir } = parseStateKey(sk);
        const idx = cellIndex(w, x, y);
        const piece = pieceAt.get(idx);
        if (!piece || piece.connectivity === 0) {
            continue;
        }
        if (!canEnterPieceWithPropagation(dir, piece)) {
            continue;
        }
        let list = statesByCell.get(idx);
        if (!list) {
            list = [];
            statesByCell.set(idx, list);
        }
        list.push(sk);
    }
    for (const [idx, cellStates] of statesByCell) {
        if (seenCells.has(idx)) {
            continue;
        }
        if (
            forwardEdges
            && anchorStates
            && anchorStates.size > 0
            && !cellStates.some((sk) => canReachAnyAnchorState(sk, forwardEdges, anchorStates))
        ) {
            continue;
        }
        seenCells.add(idx);
        const piece = pieceAt.get(idx)!;
        const key = colorModeToKey(piece.colorMode);
        if (key !== 'white' && !seenKeys.has(key)) {
            seenKeys.add(key);
            keys.push(key);
        }
    }
    return keys;
}

/**
 * 稳态上下文：
 * 1. SCC 闭合环；
 * 2. 多光源经元件连通；
 * 有元件交集可合并。参与稳态的元件须能沿正向光路回到组内锚点（环 SCC 态或光源出射态），
 * 环外射、只单向收光且不回流到环/源的元件不计入。
 */
export function buildBeamCycleContext(
    input: OpticalBeamTraceInput,
    pieceAt: ReadonlyMap<number, IOpticalPiece>,
): BeamCycleContext {
    const { width: w, height: h, terrain, player, sources } = input;
    const forwardEdges = buildTransitionEdges(w, h, terrain, player, pieceAt);
    const reverseEdges = buildReverseEdges(forwardEdges);
    const emissionBySourceIndex = collectSourceEmissionStateKeyByIndex(
        sources,
        w,
        h,
        terrain,
        player,
    );
    const cyclicStateSets = findCyclicStateGroups(forwardEdges);
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
    const connectedBundles = findMultiSourceConnectedStateGroups(
        input,
        pieceAt,
        forwardEdges,
        reverseEdges,
    );
    const mergedBundles = mergeOverlappingStateSets(
        [...cyclicBundles, ...connectedBundles],
        pieceAt,
        w,
    );

    const filteredBundles: SteadyStateBundle[] = [];
    for (const bundle of mergedBundles) {
        const anchors = buildAnchorStatesForBundle(bundle, forwardEdges, emissionBySourceIndex);
        const filtered = filterStatesByPieceReturnToAnchors(
            bundle.states,
            forwardEdges,
            anchors,
            pieceAt,
            w,
        );
        if (filtered.size === 0) {
            continue;
        }
        filteredBundles.push({ states: filtered, sourceIndices: [...bundle.sourceIndices] });
    }

    const groups: BeamCycleGroup[] = filteredBundles.map((bundle, id) => {
        const stateKeys = bundle.states;
        const cellIndices = statesToCellIndices(stateKeys, w);
        const sourceIndices = bundle.sourceIndices;
        const anchorStates = buildAnchorStatesForBundle(bundle, forwardEdges, emissionBySourceIndex);
        const hasClosedCycle = findCycleAnchorStatesInSet(stateKeys, forwardEdges).size > 0;
        return {
            id,
            stateKeys,
            cellIndices,
            sourceIndices,
            sourceColorKeys: sourceColorKeysForIndices(sources, sourceIndices),
            pieceFilterColorKeys: coloredFilterKeysOnCycleStates(
                stateKeys,
                w,
                pieceAt,
                forwardEdges,
                anchorStates,
            ),
            hasClosedCycle,
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

/** 稳态环内传播/着色用的统一色；纯源间连通时仅强制稳态网络元件，地板保留滤光结果 */
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
    const sk = stateKey(cx, cy, dir);
    const gid = ctx.stateToGroupId.get(sk);
    if (gid === undefined) {
        return colorKey;
    }
    const group = ctx.groups.find((g) => g.id === gid);
    if (!group || !beamBelongsToSteadyGroup(group, sourceIds)) {
        return colorKey;
    }
    const onSteadyPiece = ctx.cellToGroupId.has(cellIndex(w, cx, cy));
    if (!onSteadyPiece && !group.hasClosedCycle) {
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
