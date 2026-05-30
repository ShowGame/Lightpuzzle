import {
    _decorator,
    Color,
    Component,
    Graphics,
    UITransform,
} from 'cc';
import type { OpticalBeamSegment } from '../Core/OpticalBeamTracer';
import type { OpticalBeamSnapshot } from '../Core/OpticalPuzzleCore';
import type { MixedLightColorKey } from '../Core/OpticalColorMix';

const { ccclass } = _decorator;

const CELL = 56;
/** 光路总宽度（由外向内多层叠绘） */
const BEAM_LINE_WIDTH = 9;
const BEAM_GRADIENT_STEPS = 8;
/** 最内层白芯占全宽比例（过小会看不出渐变） */
const BEAM_CORE_WIDTH_RATIO = 0.125;
const MERGE_EPS = 1e-3;

function pointsNear(ax: number, ay: number, bx: number, by: number): boolean {
    return Math.abs(ax - bx) < MERGE_EPS && Math.abs(ay - by) < MERGE_EPS;
}

function segmentUnitDir(seg: OpticalBeamSegment): { dx: number; dy: number } | null {
    const dx = seg.x1 - seg.x0;
    const dy = seg.y1 - seg.y0;
    const len = Math.hypot(dx, dy);
    if (len < MERGE_EPS) {
        return null;
    }
    return { dx: dx / len, dy: dy / len };
}

function dirsParallel(
    a: { dx: number; dy: number },
    b: { dx: number; dy: number },
): boolean {
    return Math.abs(a.dx - b.dx) < MERGE_EPS && Math.abs(a.dy - b.dy) < MERGE_EPS;
}

/** 合并同色、共线、首尾相接的碎段，避免格缝处重复叠绘出本色圆点 */
function mergeCollinearBeamSegments(segments: readonly OpticalBeamSegment[]): OpticalBeamSegment[] {
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

function colorKeyToBeamColor(key: string): Color {
    const k = key as MixedLightColorKey;
    switch (k) {
        case 'red':
            return new Color(255, 72, 72, 230);
        case 'green':
            return new Color(72, 220, 110, 230);
        case 'blue':
            return new Color(72, 140, 255, 230);
        case 'yellow':
            return new Color(255, 220, 72, 230);
        case 'cyan':
            return new Color(72, 220, 230, 230);
        case 'purple':
            return new Color(180, 90, 255, 230);
        default:
            return new Color(255, 255, 255, 235);
    }
}

function lerpBeamColor(from: Color, to: Color, t: number): Color {
    return new Color(
        from.r + (to.r - from.r) * t,
        from.g + (to.g - from.g) * t,
        from.b + (to.b - from.b) * t,
        from.a + (to.a - from.a) * t,
    );
}

/** 由外向内叠绘：外层本色 → 中心白芯（每层整宽描边，内层覆盖中心） */
function strokeBeamSegment(
    g: Graphics,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    beamColor: Color,
): void {
    const coreWhite = new Color(255, 255, 255, Math.min(255, beamColor.a + 15));
    const steps = BEAM_GRADIENT_STEPS;
    const coreRatio = BEAM_CORE_WIDTH_RATIO;

    g.lineCap = Graphics.LineCap.BUTT;
    g.lineJoin = Graphics.LineJoin.ROUND;

    for (let i = steps - 1; i >= 0; i--) {
        const t = steps <= 1 ? 1 : i / (steps - 1);
        g.lineWidth = BEAM_LINE_WIDTH * (coreRatio + (1 - coreRatio) * t);
        g.strokeColor = lerpBeamColor(coreWhite, beamColor, t);
        g.moveTo(x0, y0);
        g.lineTo(x1, y1);
        g.stroke();
    }
}

/** 光路占位：直线段；镜格内由 tracer 拆成 L 形两段（后续换美术素材） */
@ccclass('OpticalPuzzleBeamView')
export class OpticalPuzzleBeamView extends Component {
    private _graphics: Graphics | null = null;

    protected onLoad(): void {
        this._ensureGraphics();
        let ut = this.getComponent(UITransform);
        if (!ut) {
            ut = this.addComponent(UITransform);
            ut.setContentSize(700, 700);
        }
    }

    private _ensureGraphics(): Graphics | null {
        if (!this._graphics?.isValid) {
            this._graphics = this.getComponent(Graphics) ?? this.addComponent(Graphics);
        }
        return this._graphics;
    }

    render(snapshot: OpticalBeamSnapshot): void {
        const g = this._ensureGraphics();
        if (!g) {
            return;
        }
        g.clear();
        const ox = (-snapshot.width * CELL) / 2;
        const oy = (snapshot.height * CELL) / 2;

        const merged = mergeCollinearBeamSegments(snapshot.segments);

        for (const seg of merged) {
            const beamColor = colorKeyToBeamColor(seg.colorKey);
            strokeBeamSegment(
                g,
                ox + seg.x0 * CELL,
                oy - seg.y0 * CELL,
                ox + seg.x1 * CELL,
                oy - seg.y1 * CELL,
                beamColor,
            );
        }
    }
}
