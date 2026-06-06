import {

    _decorator,

    Color,

    Component,

    Graphics,

    UITransform,

} from 'cc';

import { computeCrossBeamOverlays, type OpticalCrossBeamOverlay } from '../Core/OpticalBeamOverlapMerge';

import type { OpticalBeamSnapshot } from '../Core/OpticalPuzzleCore';

import { mixLightColors } from '../Core/OpticalColorMix';

import type { OpticalBeamSegment } from '../Core/OpticalBeamTypes';



const { ccclass } = _decorator;



import { beamColorFromKey } from './OpticalPuzzleColorUtil';
import {
    coreWhiteFor,
    lerpBeamColor,
    strokeBeamSegmentGradient,
} from './OpticalPuzzleBeamGradient';
import { BEAM_CORE_WIDTH_RATIO, BEAM_GRADIENT_STEPS, BEAM_LINE_WIDTH, OPTICAL_CELL_SIZE } from './OpticalPuzzleLayout';
const CELL = OPTICAL_CELL_SIZE;

const EPS = 1e-3;



/**

 * 十字叠色单层：各光路先各自做「白芯→本色」渐变，再按该深度混色（中心仍偏白，外圈才混成紫等）。

 */

function crossLayerStrokeColor(colorKeys: readonly string[], t: number): Color {

    const unique = [...new Set(colorKeys)];

    if (unique.length === 0) {

        return new Color(255, 255, 255, 235);

    }

    if (unique.length === 1) {

        const beam = beamColorFromKey(unique[0]);

        return lerpBeamColor(coreWhiteFor(beam), beam, t);

    }



    const layerColors = unique.map((key) => {

        const beam = beamColorFromKey(key);

        return lerpBeamColor(coreWhiteFor(beam), beam, t);

    });



    const mixedKey = mixLightColors(unique);

    const mixedBeam = beamColorFromKey(mixedKey);

    const mixedLayer = lerpBeamColor(coreWhiteFor(mixedBeam), mixedBeam, t);



    let r = 0;

    let g = 0;

    let b = 0;

    let a = 0;

    for (const c of layerColors) {

        r += c.r;

        g += c.g;

        b += c.b;

        a += c.a;

    }

    const n = layerColors.length;

    const avg = new Color(r / n, g / n, b / n, a / n);



    // t=0 外圈贴近玩法混色；t=1 内圈贴近多束白芯叠合
    return lerpBeamColor(mixedLayer, avg, t);

}



/** 十字交点：每层同步横竖窄条，避免先画两束再盖一层导致中心过曝/边缘发脏 */

function strokeCrossOverlay(

    g: Graphics,

    px: number,

    py: number,

    halfPx: number,

    colorKeys: readonly string[],

): void {

    const steps = BEAM_GRADIENT_STEPS;

    const coreRatio = BEAM_CORE_WIDTH_RATIO;



    g.lineCap = Graphics.LineCap.BUTT;

    g.lineJoin = Graphics.LineJoin.ROUND;



    for (let i = steps - 1; i >= 0; i--) {

        const t = steps <= 1 ? 1 : i / (steps - 1);

        g.lineWidth = BEAM_LINE_WIDTH * (coreRatio + (1 - coreRatio) * t);

        g.strokeColor = crossLayerStrokeColor(colorKeys, t);

        g.moveTo(px - halfPx, py);

        g.lineTo(px + halfPx, py);

        g.stroke();

        g.moveTo(px, py - halfPx);

        g.lineTo(px, py + halfPx);

        g.stroke();

    }

}



function subtractInterval(lo: number, hi: number, gapLo: number, gapHi: number): Array<[number, number]> {

    if (gapHi <= lo + EPS || gapLo >= hi - EPS) {

        return [[lo, hi]];

    }

    const out: Array<[number, number]> = [];

    if (gapLo > lo + EPS) {

        out.push([lo, gapLo]);

    }

    if (gapHi < hi - EPS) {

        out.push([gapHi, hi]);

    }

    return out;

}



function crossesOnHorizontal(seg: OpticalBeamSegment, crosses: readonly OpticalCrossBeamOverlay[]): OpticalCrossBeamOverlay[] {

    const lo = Math.min(seg.x0, seg.x1);

    const hi = Math.max(seg.x0, seg.x1);

    return crosses.filter(

        (c) => Math.abs(c.y - seg.y0) < EPS && c.x >= lo - EPS && c.x <= hi + EPS,

    );

}



function crossesOnVertical(seg: OpticalBeamSegment, crosses: readonly OpticalCrossBeamOverlay[]): OpticalCrossBeamOverlay[] {

    const lo = Math.min(seg.y0, seg.y1);

    const hi = Math.max(seg.y0, seg.y1);

    return crosses.filter(

        (c) => Math.abs(c.x - seg.x0) < EPS && c.y >= lo - EPS && c.y <= hi + EPS,

    );

}



/** 在十字交点处挖空，避免与叠色窄条重复绘制 */

function splitSegmentAtCrosses(

    seg: OpticalBeamSegment,

    crosses: readonly OpticalCrossBeamOverlay[],

    halfGap: number,

): OpticalBeamSegment[] {

    const dx = seg.x1 - seg.x0;

    const dy = seg.y1 - seg.y0;



    if (Math.abs(dy) < EPS && Math.abs(dx) > EPS) {

        let intervals: Array<[number, number]> = [[Math.min(seg.x0, seg.x1), Math.max(seg.x0, seg.x1)]];

        for (const cross of crossesOnHorizontal(seg, crosses)) {

            const next: Array<[number, number]> = [];

            for (const [lo, hi] of intervals) {

                next.push(...subtractInterval(lo, hi, cross.x - halfGap, cross.x + halfGap));

            }

            intervals = next;

        }

        return intervals

            .filter(([lo, hi]) => hi - lo > EPS)

            .map(([x0, x1]) => ({

                x0,

                y0: seg.y0,

                x1,

                y1: seg.y1,

                colorKey: seg.colorKey,

            }));

    }



    if (Math.abs(dx) < EPS && Math.abs(dy) > EPS) {

        let intervals: Array<[number, number]> = [[Math.min(seg.y0, seg.y1), Math.max(seg.y0, seg.y1)]];

        for (const cross of crossesOnVertical(seg, crosses)) {

            const next: Array<[number, number]> = [];

            for (const [lo, hi] of intervals) {

                next.push(...subtractInterval(lo, hi, cross.y - halfGap, cross.y + halfGap));

            }

            intervals = next;

        }

        return intervals

            .filter(([lo, hi]) => hi - lo > EPS)

            .map(([y0, y1]) => ({

                x0: seg.x0,

                y0,

                x1: seg.x0,

                y1,

                colorKey: seg.colorKey,

            }));

    }



    return [{ ...seg }];

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



        const crosses = computeCrossBeamOverlays(snapshot.segments);

        const overlapHalf = BEAM_LINE_WIDTH / (2 * CELL);

        const halfPx = overlapHalf * CELL;



        for (const seg of snapshot.segments) {

            const pieces = crosses.length > 0

                ? splitSegmentAtCrosses(seg, crosses, overlapHalf)

                : [{ ...seg }];

            for (const piece of pieces) {

                strokeBeamSegmentGradient(

                    g,

                    ox + piece.x0 * CELL,

                    oy - piece.y0 * CELL,

                    ox + piece.x1 * CELL,

                    oy - piece.y1 * CELL,

                    beamColorFromKey(piece.colorKey),

                );

            }

        }



        for (const cross of crosses) {

            strokeCrossOverlay(

                g,

                ox + cross.x * CELL,

                oy - cross.y * CELL,

                halfPx,

                cross.colorKeys,

            );

        }

    }

}


