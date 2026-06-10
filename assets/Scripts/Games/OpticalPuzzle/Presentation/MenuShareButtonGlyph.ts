import { Color, Graphics } from 'cc';
import { unlitHudIconColor } from './OpticalPuzzleHudButtonCommon';
import {
    drawMenuCircleButtonChrome,
    MENU_START_ICON_BORDER_PX,
    strokeMenuButtonIconGlow,
} from './MenuStartButtonGlyph';

/** 菜单分享键 icon 占键帽边长比例 */
export const HUD_MENU_SHARE_ICON_SIZE_RATIO = 0.45;

/** 三圆心（SVG viewBox 1024 归一化，y 已翻转） */
const SHARE_NODES: ReadonlyArray<Readonly<{ x: number; y: number }>> = [
    { x: 0.18228432, y: 0.39084138 },
    { x: -0.29232185, y: -0.05988111 },
    { x: 0.29232185, y: -0.39084138 },
];

/** 圆半径 / icon 高度（相对 SVG 略放大，菜单 120 键更易辨认） */
const SHARE_CIRCLE_R_NORM = 0.15;

/** 连线：右上 → 左 → 右下 */
const SHARE_LINE_PAIRS: ReadonlyArray<readonly [number, number]> = [
    [0, 1],
    [1, 2],
];

const MENU_ICON_BORDER = new Color(255, 255, 255, 255);

function shareIconHeight(buttonSize: number): number {
    return buttonSize * HUD_MENU_SHARE_ICON_SIZE_RATIO;
}

function traceShareCircles(g: Graphics, cx: number, cy: number, iconH: number): void {
    const r = iconH * SHARE_CIRCLE_R_NORM;
    for (const p of SHARE_NODES) {
        g.circle(cx + p.x * iconH, cy + p.y * iconH, r);
    }
}

function traceShareLines(g: Graphics, cx: number, cy: number, iconH: number): void {
    const r = iconH * SHARE_CIRCLE_R_NORM;
    for (let i = 0; i < SHARE_LINE_PAIRS.length; i++) {
        const [a, b] = SHARE_LINE_PAIRS[i];
        const na = SHARE_NODES[a];
        const nb = SHARE_NODES[b];
        const ax = cx + na.x * iconH;
        const ay = cy + na.y * iconH;
        const bx = cx + nb.x * iconH;
        const by = cy + nb.y * iconH;
        const dx = bx - ax;
        const dy = by - ay;
        const len = Math.hypot(dx, dy);
        if (len < 1e-6) {
            continue;
        }
        const ux = dx / len;
        const uy = dy / len;
        const x0 = ax + ux * r;
        const y0 = ay + uy * r;
        const x1 = bx - ux * r;
        const y1 = by - uy * r;
        if (i === 0) {
            g.moveTo(x0, y0);
        } else {
            g.moveTo(x0, y0);
        }
        g.lineTo(x1, y1);
    }
}

function traceShareIconStroke(g: Graphics, cx: number, cy: number, iconH: number): void {
    traceShareLines(g, cx, cy, iconH);
    traceShareCircles(g, cx, cy, iconH);
}

function drawMenuShareIcon(
    g: Graphics,
    size: number,
    cx: number,
    cy: number,
    pressed: boolean,
): void {
    const iconH = shareIconHeight(size);
    const borderW = MENU_START_ICON_BORDER_PX;

    if (pressed) {
        g.fillColor = MENU_ICON_BORDER;
        traceShareCircles(g, cx, cy, iconH);
        g.fill();
        strokeMenuButtonIconGlow(g, size, () => {
            traceShareIconStroke(g, cx, cy, iconH);
        });
        return;
    }

    g.fillColor = unlitHudIconColor();
    traceShareCircles(g, cx, cy, iconH);
    g.fill();

    g.strokeColor = MENU_ICON_BORDER;
    g.lineWidth = borderW;
    g.lineJoin = Graphics.LineJoin.ROUND;
    g.lineCap = Graphics.LineCap.ROUND;
    traceShareIconStroke(g, cx, cy, iconH);
    g.stroke();
}

/** 圆形键帽 + 三圆分享 icon（120×120 等正方尺寸） */
export function drawMenuShareButtonGlyph(
    g: Graphics,
    left: number,
    bottom: number,
    width: number,
    height: number,
    pressed = false,
): void {
    const size = Math.min(width, height);
    const cx = left + width * 0.5;
    const cy = bottom + height * 0.5;

    drawMenuCircleButtonChrome(g, cx, cy, size, pressed);
    drawMenuShareIcon(g, size, cx, cy, pressed);
}
