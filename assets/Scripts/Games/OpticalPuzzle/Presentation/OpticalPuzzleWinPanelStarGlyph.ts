import { Color, Graphics } from 'cc';
import { OpticalStarVisualState } from '../Core/OpticalPuzzleStarRating';
import {
    fillGlowLayersMatchingStroke,
    strokeGlowLayers,
} from './OpticalPuzzleHudButtonCommon';
import { beamColorFromKey } from './OpticalPuzzleColorUtil';
import {
    WIN_STAR_SEGS,
    WIN_STAR_VIEW_CX,
    WIN_STAR_VIEW_CY,
    WIN_STAR_VIEW_H,
    WIN_STAR_VIEW_W,
    WinStarPathSeg,
} from './OpticalPuzzleWinPanelStarSegs.generated';

/** 单颗星外轮廓线宽（设计 px，不随节点缩放） */
export const WIN_STAR_BORDER_PX = 4;
/** 左右槽位星相对中间的旋转角（度）：左逆时针、右顺时针 */
export const WIN_STAR_SIDE_ROTATION_DEG = 15;
/** 发光态外缘光晕（比 HUD 按钮更厚） */
const WIN_STAR_GLOW_LAYERS: ReadonlyArray<{ width: number; alpha: number }> = [
    { width: 16, alpha: 36 },
    { width: 11, alpha: 96 },
    { width: 7, alpha: 180 },
    { width: 4, alpha: 255 },
];
const STAR_BORDER = new Color(255, 255, 255, 255);
const STAR_WHITE = new Color(255, 255, 255, 255);
/** 点亮态：与光路 yellow 同色填充 */
const _STAR_YELLOW_BEAM = beamColorFromKey('yellow');
const STAR_YELLOW = new Color(_STAR_YELLOW_BEAM.r, _STAR_YELLOW_BEAM.g, _STAR_YELLOW_BEAM.b, 255);
const STAR_GLOW_RGB = {
    r: _STAR_YELLOW_BEAM.r,
    g: _STAR_YELLOW_BEAM.g,
    b: _STAR_YELLOW_BEAM.b,
};

function rotateAround(
    x: number,
    y: number,
    cx: number,
    cy: number,
    rad: number,
): { x: number; y: number } {
    if (rad === 0) {
        return { x, y };
    }
    const dx = x - cx;
    const dy = y - cy;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return {
        x: cx + dx * cos - dy * sin,
        y: cy + dx * sin + dy * cos,
    };
}

function mapStarSvgPoint(
    svgX: number,
    svgY: number,
    cx: number,
    cy: number,
    scale: number,
    scaleMul = 1,
    rotationRad = 0,
): { x: number; y: number } {
    const s = scale * scaleMul;
    const mapped = {
        x: cx + (svgX - WIN_STAR_VIEW_CX) * s,
        y: cy - (svgY - WIN_STAR_VIEW_CY) * s,
    };
    return rotateAround(mapped.x, mapped.y, cx, cy, rotationRad);
}

function traceStarSegs(
    g: Graphics,
    segs: ReadonlyArray<WinStarPathSeg>,
    cx: number,
    cy: number,
    scale: number,
    scaleMul = 1,
    rotationRad = 0,
): void {
    for (const seg of segs) {
        switch (seg.t) {
            case 'M': {
                const p = mapStarSvgPoint(seg.x, seg.y, cx, cy, scale, scaleMul, rotationRad);
                g.moveTo(p.x, p.y);
                break;
            }
            case 'L': {
                const p = mapStarSvgPoint(seg.x, seg.y, cx, cy, scale, scaleMul, rotationRad);
                g.lineTo(p.x, p.y);
                break;
            }
            case 'C': {
                const p1 = mapStarSvgPoint(seg.x1, seg.y1, cx, cy, scale, scaleMul, rotationRad);
                const p2 = mapStarSvgPoint(seg.x2, seg.y2, cx, cy, scale, scaleMul, rotationRad);
                const p = mapStarSvgPoint(seg.x, seg.y, cx, cy, scale, scaleMul, rotationRad);
                g.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, p.x, p.y);
                break;
            }
            case 'Z':
                g.close();
                break;
            default:
                break;
        }
    }
}

function traceStarPath(
    g: Graphics,
    cx: number,
    cy: number,
    scale: number,
    scaleMul = 1,
    rotationRad = 0,
): void {
    traceStarSegs(g, WIN_STAR_SEGS, cx, cy, scale, scaleMul, rotationRad);
}

/** 在矩形区域内绘制单颗五角星（用户 SVG 路径，含圆角） */
export function drawWinPanelStarGlyph(
    g: Graphics,
    left: number,
    bottom: number,
    width: number,
    height: number,
    state: OpticalStarVisualState,
    rotationDeg = 0,
    borderPx = WIN_STAR_BORDER_PX,
): void {
    const size = Math.min(width, height);
    const cx = left + width * 0.5;
    const cy = bottom + height * 0.5;
    const scale = (size * 0.5) / Math.max(WIN_STAR_VIEW_W * 0.5, WIN_STAR_VIEW_H * 0.5);
    const iconHalf = size * 0.45;
    const rotationRad = (rotationDeg * Math.PI) / 180;

    const trace = (): void => {
        traceStarPath(g, cx, cy, scale, 1, rotationRad);
    };
    const traceScaled = (mul: number): void => {
        traceStarPath(g, cx, cy, scale, mul, rotationRad);
    };

    if (state === OpticalStarVisualState.Glow) {
        fillGlowLayersMatchingStroke(g, size, WIN_STAR_GLOW_LAYERS, iconHalf, traceScaled, STAR_GLOW_RGB);
        g.fillColor = STAR_YELLOW;
        trace();
        g.fill();
        strokeGlowLayers(g, size, WIN_STAR_GLOW_LAYERS, trace, true, STAR_GLOW_RGB);
        return;
    }

    g.fillColor = state === OpticalStarVisualState.Filled ? STAR_WHITE : new Color(0, 0, 0, 0);
    trace();
    g.fill();

    g.strokeColor = STAR_BORDER;
    g.lineWidth = borderPx;
    g.lineJoin = Graphics.LineJoin.ROUND;
    g.lineCap = Graphics.LineCap.ROUND;
    trace();
    g.stroke();
}
