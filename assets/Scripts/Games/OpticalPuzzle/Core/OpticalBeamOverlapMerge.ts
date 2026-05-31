import type { IOpticalTarget } from '../Config/OpticalPuzzleLevelSchema';
import { mixLightColors } from './OpticalColorMix';
import type { OpticalBeamSegment } from './OpticalBeamTracer';
import { lightMatchesTarget } from './OpticalLightColor';

const EPS = 1e-3;

interface AxisInterval {
    axis: 'h' | 'v';
    /** 水平段固定 y；垂直段固定 x */
    fixed: number;
    start: number;
    end: number;
    colorKey: string;
}

/** 十字交叉叠色：仅交点处窄条混色（由表现层按光路宽度绘制） */
export interface OpticalCrossBeamOverlay {
    x: number;
    y: number;
    /** 玩法混色结果 */
    colorKey: string;
    /** 参与叠色的各光路本色（供分层渐变混绘） */
    colorKeys: string[];
}

function toAxisInterval(seg: OpticalBeamSegment): AxisInterval | null {
    const dx = seg.x1 - seg.x0;
    const dy = seg.y1 - seg.y0;
    if (Math.abs(dy) < EPS && Math.abs(dx) > EPS) {
        return {
            axis: 'h',
            fixed: (seg.y0 + seg.y1) * 0.5,
            start: Math.min(seg.x0, seg.x1),
            end: Math.max(seg.x0, seg.x1),
            colorKey: seg.colorKey,
        };
    }
    if (Math.abs(dx) < EPS && Math.abs(dy) > EPS) {
        return {
            axis: 'v',
            fixed: (seg.x0 + seg.x1) * 0.5,
            start: Math.min(seg.y0, seg.y1),
            end: Math.max(seg.y0, seg.y1),
            colorKey: seg.colorKey,
        };
    }
    return null;
}

function axisIntervalToSegment(interval: AxisInterval): OpticalBeamSegment {
    if (interval.axis === 'h') {
        return {
            x0: interval.start,
            y0: interval.fixed,
            x1: interval.end,
            y1: interval.fixed,
            colorKey: interval.colorKey,
        };
    }
    return {
        x0: interval.fixed,
        y0: interval.start,
        x1: interval.fixed,
        y1: interval.end,
        colorKey: interval.colorKey,
    };
}

function sweepMergeIntervals(list: readonly AxisInterval[]): AxisInterval[] {
    if (list.length === 0) {
        return [];
    }
    const points = new Set<number>();
    for (const s of list) {
        points.add(s.start);
        points.add(s.end);
    }
    const sorted = [...points].sort((a, b) => a - b);
    const out: AxisInterval[] = [];

    for (let i = 0; i < sorted.length - 1; i++) {
        const a = sorted[i];
        const b = sorted[i + 1];
        if (b - a < EPS) {
            continue;
        }
        const mid = (a + b) * 0.5;
        const colors: string[] = [];
        for (const s of list) {
            if (mid >= s.start - EPS && mid <= s.end + EPS) {
                colors.push(s.colorKey);
            }
        }
        if (colors.length === 0) {
            continue;
        }
        out.push({
            axis: list[0].axis,
            fixed: list[0].fixed,
            start: a,
            end: b,
            colorKey: mixLightColors(colors),
        });
    }

    const merged: AxisInterval[] = [];
    for (const seg of out) {
        const last = merged[merged.length - 1];
        if (last && last.colorKey === seg.colorKey && Math.abs(last.end - seg.start) < EPS) {
            last.end = seg.end;
        } else {
            merged.push({ ...seg });
        }
    }
    return merged;
}

function isHorizontal(seg: OpticalBeamSegment): boolean {
    return Math.abs(seg.y1 - seg.y0) < EPS && Math.abs(seg.x1 - seg.x0) > EPS;
}

function isVertical(seg: OpticalBeamSegment): boolean {
    return Math.abs(seg.x1 - seg.x0) < EPS && Math.abs(seg.y1 - seg.y0) > EPS;
}

function pointOnSegment(x: number, y: number, seg: OpticalBeamSegment): boolean {
    if (isHorizontal(seg)) {
        const lo = Math.min(seg.x0, seg.x1);
        const hi = Math.max(seg.x0, seg.x1);
        return Math.abs(y - seg.y0) < EPS && x >= lo - EPS && x <= hi + EPS;
    }
    if (isVertical(seg)) {
        const lo = Math.min(seg.y0, seg.y1);
        const hi = Math.max(seg.y0, seg.y1);
        return Math.abs(x - seg.x0) < EPS && y >= lo - EPS && y <= hi + EPS;
    }
    return false;
}

function crossPointKey(x: number, y: number): string {
    return `${x.toFixed(4)},${y.toFixed(4)}`;
}

/**
 * 横竖光路交点：仅当经过该点的光色不止一种时返回叠色（供表现层画窄条）。
 */
export function computeCrossBeamOverlays(segments: readonly OpticalBeamSegment[]): OpticalCrossBeamOverlay[] {
    const colorSets = new Map<string, Set<string>>();
    const points = new Map<string, { x: number; y: number }>();

    const horizontals = segments.filter(isHorizontal);
    const verticals = segments.filter(isVertical);

    for (const h of horizontals) {
        for (const v of verticals) {
            const x = v.x0;
            const y = h.y0;
            if (!pointOnSegment(x, y, h) || !pointOnSegment(x, y, v)) {
                continue;
            }
            const key = crossPointKey(x, y);
            points.set(key, { x, y });
            let set = colorSets.get(key);
            if (!set) {
                set = new Set<string>();
                colorSets.set(key, set);
            }
            set.add(h.colorKey);
            set.add(v.colorKey);
        }
    }

    const overlays: OpticalCrossBeamOverlay[] = [];
    for (const [key, colors] of colorSets) {
        if (colors.size < 2) {
            continue;
        }
        const pt = points.get(key);
        if (!pt) {
            continue;
        }
        overlays.push({
            x: pt.x,
            y: pt.y,
            colorKey: mixLightColors([...colors]),
            colorKeys: [...colors],
        });
    }
    return overlays;
}

function pointsNear(ax: number, ay: number, bx: number, by: number): boolean {
    return Math.abs(ax - bx) < EPS && Math.abs(ay - by) < EPS;
}

function segmentUnitDir(seg: OpticalBeamSegment): { dx: number; dy: number } | null {
    const dx = seg.x1 - seg.x0;
    const dy = seg.y1 - seg.y0;
    const len = Math.hypot(dx, dy);
    if (len < EPS) {
        return null;
    }
    return { dx: dx / len, dy: dy / len };
}

function dirsParallel(
    a: { dx: number; dy: number },
    b: { dx: number; dy: number },
): boolean {
    return Math.abs(a.dx - b.dx) < EPS && Math.abs(a.dy - b.dy) < EPS;
}

/** 合并同色、共线、首尾相接的碎段 */
export function mergeCollinearBeamSegments(segments: readonly OpticalBeamSegment[]): OpticalBeamSegment[] {
    let list = segments.map((s) => ({ ...s }));
    let changed = true;

    while (changed) {
        changed = false;
        outer: for (let i = 0; i < list.length; i++) {
            const a = list[i];
            const da = segmentUnitDir(a);
            if (!da) {
                continue;
            }
            for (let j = i + 1; j < list.length; j++) {
                const b = list[j];
                if (a.colorKey !== b.colorKey) {
                    continue;
                }
                const db = segmentUnitDir(b);
                if (!db) {
                    continue;
                }

                if (pointsNear(a.x1, a.y1, b.x0, b.y0) && dirsParallel(da, db)) {
                    list[i] = { ...a, x1: b.x1, y1: b.y1 };
                    list.splice(j, 1);
                    changed = true;
                    break outer;
                }
                if (pointsNear(a.x1, a.y1, b.x1, b.y1) && dirsParallel(da, { dx: -db.dx, dy: -db.dy })) {
                    list[i] = { ...a, x1: b.x0, y1: b.y0 };
                    list.splice(j, 1);
                    changed = true;
                    break outer;
                }
                if (pointsNear(a.x0, a.y0, b.x0, b.y0) && dirsParallel(da, { dx: -db.dx, dy: -db.dy })) {
                    list[i] = { x0: a.x1, y0: a.y1, x1: b.x1, y1: b.y1, colorKey: a.colorKey };
                    list.splice(j, 1);
                    changed = true;
                    break outer;
                }
                if (pointsNear(a.x0, a.y0, b.x1, b.y1) && dirsParallel(da, db)) {
                    list[i] = { x0: b.x0, y0: b.y0, x1: a.x1, y1: a.y1, colorKey: a.colorKey };
                    list.splice(j, 1);
                    changed = true;
                    break outer;
                }
            }
        }
    }

    return list;
}

/**
 * 共线重叠区间混色（同轴光路叠加）；十字交叉不在此改色，由表现层在交点窄条叠绘。
 */
export function mergeOverlappingBeamSegments(segments: readonly OpticalBeamSegment[]): OpticalBeamSegment[] {
    const axisBuckets = new Map<string, AxisInterval[]>();
    const passthrough: OpticalBeamSegment[] = [];

    for (const seg of segments) {
        const axis = toAxisInterval(seg);
        if (!axis) {
            passthrough.push({ ...seg });
            continue;
        }
        const key = `${axis.axis}:${axis.fixed.toFixed(4)}`;
        const bucket = axisBuckets.get(key);
        if (bucket) {
            bucket.push(axis);
        } else {
            axisBuckets.set(key, [axis]);
        }
    }

    const merged: OpticalBeamSegment[] = [...passthrough];
    for (const bucket of axisBuckets.values()) {
        for (const interval of sweepMergeIntervals(bucket)) {
            merged.push(axisIntervalToSegment(interval));
        }
    }

    return mergeCollinearBeamSegments(merged);
}

function segmentEndsOnTargetEdge(seg: OpticalBeamSegment, tx: number, ty: number): boolean {
    const x = seg.x1;
    const y = seg.y1;
    const onWest = Math.abs(x - tx) < EPS && y >= ty - EPS && y <= ty + 1 + EPS;
    const onEast = Math.abs(x - (tx + 1)) < EPS && y >= ty - EPS && y <= ty + 1 + EPS;
    const onNorth = Math.abs(y - ty) < EPS && x >= tx - EPS && x <= tx + 1 + EPS;
    const onSouth = Math.abs(y - (ty + 1)) < EPS && x >= tx - EPS && x <= tx + 1 + EPS;
    return onWest || onEast || onNorth || onSouth;
}

/** 按合并后的光段重算目标点亮（重叠光路先混色再判定） */
export function recomputeTargetLitFromSegments(
    segments: readonly OpticalBeamSegment[],
    targets: readonly IOpticalTarget[],
): boolean[] {
    const colorsAtTarget: string[][] = targets.map(() => []);

    for (const seg of segments) {
        for (let i = 0; i < targets.length; i++) {
            const t = targets[i];
            if (segmentEndsOnTargetEdge(seg, t.x, t.y)) {
                colorsAtTarget[i].push(seg.colorKey);
            }
        }
    }

    return targets.map((t, i) => {
        const colors = colorsAtTarget[i];
        if (colors.length === 0) {
            return false;
        }
        return lightMatchesTarget(mixLightColors(colors), t.colorKey);
    });
}
