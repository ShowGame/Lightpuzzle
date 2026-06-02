import { Color, Graphics } from 'cc';
import {
    BEAM_CORE_WIDTH_RATIO,
    BEAM_GRADIENT_STEPS,
    BEAM_LINE_WIDTH,
    OPTICAL_CELL_SIZE,
} from './OpticalPuzzleLayout';

export function lerpBeamColor(from: Color, to: Color, t: number): Color {
    return new Color(
        from.r + (to.r - from.r) * t,
        from.g + (to.g - from.g) * t,
        from.b + (to.b - from.b) * t,
        from.a + (to.a - from.a) * t,
    );
}

export function coreWhiteFor(beamColor: Color): Color {
    return new Color(255, 255, 255, Math.min(255, beamColor.a + 15));
}

/** 与 strokeBeamSegment 第 t 层对应的截面半径 */
export function beamCrossSectionRadius(t: number, cellSize: number = OPTICAL_CELL_SIZE): number {
    const scale = cellSize / OPTICAL_CELL_SIZE;
    return (BEAM_LINE_WIDTH / 2) * scale * (BEAM_CORE_WIDTH_RATIO + (1 - BEAM_CORE_WIDTH_RATIO) * t);
}

/**
 * 炮口圆盘渐变：由外向内白芯→本色，层数/宽度与光路 strokeBeamSegment 一致。
 */
export function fillBeamCrossSection(
    g: Graphics,
    x: number,
    y: number,
    beamColor: Color,
    cellSize: number = OPTICAL_CELL_SIZE,
): void {
    const coreWhite = coreWhiteFor(beamColor);
    const steps = BEAM_GRADIENT_STEPS;
    for (let i = steps - 1; i >= 0; i--) {
        const t = steps <= 1 ? 1 : i / (steps - 1);
        g.fillColor = lerpBeamColor(coreWhite, beamColor, t);
        g.circle(x, y, beamCrossSectionRadius(t, cellSize));
        g.fill();
    }
}

/** 光路线段渐变描边（与 fillBeamCrossSection 共用同一套 t / 色插值） */
export function strokeBeamSegmentGradient(
    g: Graphics,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    beamColor: Color,
): void {
    const coreWhite = coreWhiteFor(beamColor);
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
