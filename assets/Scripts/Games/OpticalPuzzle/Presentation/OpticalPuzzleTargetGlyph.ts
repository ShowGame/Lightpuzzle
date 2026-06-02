import { Color, Graphics } from 'cc';
import { lerpBeamColor } from './OpticalPuzzleBeamGradient';
import {
    targetDimFillColor,
    targetLitFillColor,
} from './OpticalPuzzleColorUtil';
import { OPTICAL_CELL_SIZE } from './OpticalPuzzleLayout';

/** 与发射器一致的外轮廓圆角 */
const TARGET_CORNER_RADIUS = 4;

function scaledCornerRadius(size: number): number {
    return TARGET_CORNER_RADIUS * (size / OPTICAL_CELL_SIZE);
}

/** 内嵌面板（点亮/未点亮共用，仅边框染色） */
const INNER_PANEL = new Color(22, 28, 38, 255);
const OUTER_BASE = new Color(8, 12, 20, 255);

function litBorderColor(litFill: Color): Color {
    return new Color(litFill.r, litFill.g, litFill.b, 255);
}

/** 灯体径向渐变：外圈柔光 → 内圈 100% 纯色小芯 */
function fillTargetBulbGradient(
    g: Graphics,
    cx: number,
    cy: number,
    size: number,
    litFill: Color,
): void {
    const outerR = size * 0.34;
    const coreR = size * 0.062;
    const steps = 12;
    const outerColor = new Color(litFill.r, litFill.g, litFill.b, 88);

    for (let i = 0; i < steps; i++) {
        const u = steps <= 1 ? 1 : i / (steps - 1);
        const r = outerR + (coreR - outerR) * u;
        g.fillColor = lerpBeamColor(outerColor, litFill, u);
        g.circle(cx, cy, r);
        g.fill();
    }

    g.fillColor = litFill;
    g.circle(cx, cy, coreR);
    g.fill();
}

/** 灯珠右上Specular：多层白芯向外渐隐 */
function drawBulbSpecularHighlight(
    g: Graphics,
    hx: number,
    hy: number,
    size: number,
): void {
    const outerR = size * 0.058;
    const coreR = size * 0.014;
    const steps = 6;
    for (let i = 0; i < steps; i++) {
        const u = steps <= 1 ? 1 : i / (steps - 1);
        const r = outerR + (coreR - outerR) * u;
        const alpha = Math.floor(6 + 204 * u * u);
        g.fillColor = new Color(255, 255, 255, alpha);
        g.circle(hx, hy, r);
        g.fill();
    }
}

/** 内面板四角指示点（格心对称，靠近四角） */
function drawCornerIndicatorDots(
    g: Graphics,
    cx: number,
    cy: number,
    innerHalf: number,
    size: number,
    color: Color,
): void {
    const inset = size * 0.1;
    const dotR = size * 0.035;
    const offsets = [
        { x: -innerHalf + inset, y: -innerHalf + inset },
        { x: innerHalf - inset, y: -innerHalf + inset },
        { x: -innerHalf + inset, y: innerHalf - inset },
        { x: innerHalf - inset, y: innerHalf - inset },
    ];
    g.fillColor = color;
    for (const o of offsets) {
        g.circle(cx + o.x, cy + o.y, dotR);
        g.fill();
    }
}

/**
 * 简约指示灯：未点亮为磨砂暗灯，点亮后与期望色同色发光。
 * 须在光路层之上绘制，避免被光束盖住。
 */
export function drawTargetLamp(
    g: Graphics,
    left: number,
    bottom: number,
    size: number,
    colorKey: string | undefined,
    lit: boolean,
): void {
    const cx = left + size * 0.5;
    const cy = bottom + size * 0.5;
    const corner = scaledCornerRadius(size);
    const lw = Math.max(1, size * 0.022);
    const litFill = targetLitFillColor(colorKey);

    const bezel = size * 0.034;
    const innerLeft = left + bezel;
    const innerBottom = bottom + bezel;
    const innerSize = size - bezel * 2;
    const innerCorner = corner * 0.7;
    const innerHalf = innerSize * 0.5;

    if (lit) {
        const border = litBorderColor(litFill);
        // 边框环：外圈 100% 灯光色
        g.fillColor = border;
        g.roundRect(left, bottom, size, size, corner);
        g.fill();
        g.strokeColor = border;
        g.lineWidth = Math.max(1, size * 0.011);
        g.roundRect(left, bottom, size, size, corner);
        g.stroke();

        // 内部仍用暗色面板，灯体由下方光晕/灯芯绘制
        g.fillColor = INNER_PANEL;
        g.roundRect(innerLeft, innerBottom, innerSize, innerSize, innerCorner);
        g.fill();
        g.strokeColor = border;
        g.lineWidth = Math.max(1, size * 0.008);
        g.roundRect(innerLeft, innerBottom, innerSize, innerSize, innerCorner);
        g.stroke();
    } else {
        g.fillColor = OUTER_BASE;
        g.roundRect(left, bottom, size, size, corner);
        g.fill();

        g.fillColor = INNER_PANEL;
        g.roundRect(innerLeft, innerBottom, innerSize, innerSize, innerCorner);
        g.fill();
    }

    const bulbR = size * 0.34;

    if (lit) {
        const halos = [
            { r: size * 0.48, a: 24 },
            { r: size * 0.44, a: 38 },
            { r: size * 0.4, a: 52 },
            { r: size * 0.36, a: 68 },
            { r: size * 0.32, a: 86 },
        ];
        for (const h of halos) {
            g.fillColor = new Color(litFill.r, litFill.g, litFill.b, h.a);
            g.circle(cx, cy, h.r);
            g.fill();
        }

        fillTargetBulbGradient(g, cx, cy, size, litFill);

        drawBulbSpecularHighlight(
            g,
            cx + bulbR * 0.34,
            cy + bulbR * 0.34,
            size,
        );
        drawCornerIndicatorDots(g, cx, cy, innerHalf, size, new Color(255, 255, 255, 255));
        return;
    }

    const dim = targetDimFillColor(colorKey);
    const bulbFill = new Color(
        Math.floor(dim.r * 0.76),
        Math.floor(dim.g * 0.76),
        Math.floor(dim.b * 0.76),
        255,
    );
    g.fillColor = bulbFill;
    g.circle(cx, cy, bulbR);
    g.fill();

    g.strokeColor = new Color(
        Math.floor(dim.r * 0.92),
        Math.floor(dim.g * 0.92),
        Math.floor(dim.b * 0.92),
        170,
    );
    g.lineWidth = lw * 0.65;
    g.circle(cx, cy, bulbR);
    g.stroke();

    drawCornerIndicatorDots(g, cx, cy, innerHalf, size, litBorderColor(litFill));
}
