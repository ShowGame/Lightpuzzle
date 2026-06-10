import { Color, Graphics } from 'cc';
import { unlitHudIconColor } from './OpticalPuzzleHudButtonCommon';
import {
    drawMenuCircleButtonChrome,
    MENU_START_ICON_BORDER_PX,
    strokeMenuButtonIconGlow,
} from './MenuStartButtonGlyph';
import {
    MENU_ABOUT_BODY_SVG_SEGS,
    MENU_ABOUT_HEAD_SVG_SEGS,
} from './MenuAboutIconSegs.generated';

/** 菜单关于键 icon 占键帽边长比例 */
export const HUD_MENU_ABOUT_ICON_SIZE_RATIO = 0.45;

/** icon 视觉中心相对键帽中心向上微调（相对 icon 高度） */
const HUD_MENU_ABOUT_ICON_OFFSET_Y_NORM = 0.04;

const MENU_ICON_BORDER = new Color(255, 255, 255, 255);

function iconHeight(buttonSize: number): number {
    return buttonSize * HUD_MENU_ABOUT_ICON_SIZE_RATIO;
}

function iconCenterY(cy: number, iconH: number): number {
    return cy + iconH * HUD_MENU_ABOUT_ICON_OFFSET_Y_NORM;
}

function traceSvgSegs(
    g: Graphics,
    segs: ReadonlyArray<Readonly<{ x: number; y: number }>>,
    cx: number,
    cy: number,
    iconH: number,
): void {
    for (let i = 0; i < segs.length; i++) {
        const p = segs[i];
        const x = cx + p.x * iconH;
        const y = cy + p.y * iconH;
        if (i === 0) {
            g.moveTo(x, y);
        } else {
            g.lineTo(x, y);
        }
    }
    g.close();
}

function traceAboutHead(g: Graphics, cx: number, cy: number, iconH: number): void {
    traceSvgSegs(g, MENU_ABOUT_HEAD_SVG_SEGS, cx, cy, iconH);
}

function traceAboutBody(g: Graphics, cx: number, cy: number, iconH: number): void {
    traceSvgSegs(g, MENU_ABOUT_BODY_SVG_SEGS, cx, cy, iconH);
}

function traceAboutIcon(g: Graphics, cx: number, cy: number, iconH: number): void {
    traceAboutHead(g, cx, cy, iconH);
    traceAboutBody(g, cx, cy, iconH);
}

function fillAboutIcon(
    g: Graphics,
    cx: number,
    cy: number,
    iconH: number,
    fillColor: Color,
): void {
    g.fillColor = fillColor;
    traceAboutHead(g, cx, cy, iconH);
    g.fill();
    traceAboutBody(g, cx, cy, iconH);
    g.fill();
}

function strokeAboutIconOutline(
    g: Graphics,
    cx: number,
    cy: number,
    iconH: number,
    lineWidth: number,
): void {
    g.strokeColor = MENU_ICON_BORDER;
    g.lineWidth = lineWidth;
    g.lineJoin = Graphics.LineJoin.ROUND;
    g.lineCap = Graphics.LineCap.ROUND;
    traceAboutIcon(g, cx, cy, iconH);
    g.stroke();
}

function drawMenuAboutIcon(
    g: Graphics,
    size: number,
    cx: number,
    cy: number,
    pressed: boolean,
): void {
    const iconH = iconHeight(size);
    const borderW = MENU_START_ICON_BORDER_PX;
    const iconCy = iconCenterY(cy, iconH);

    if (pressed) {
        fillAboutIcon(g, cx, iconCy, iconH, MENU_ICON_BORDER);
        strokeMenuButtonIconGlow(g, size, () => {
            traceAboutIcon(g, cx, iconCy, iconH);
        });
        return;
    }

    fillAboutIcon(g, cx, iconCy, iconH, unlitHudIconColor());
    strokeAboutIconOutline(g, cx, iconCy, iconH, borderW);
}

/** 圆形键帽 + 用户/about icon（SVG subpath 2+3，120×120 等正方尺寸） */
export function drawMenuAboutButtonGlyph(
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
    drawMenuAboutIcon(g, size, cx, cy, pressed);
}
