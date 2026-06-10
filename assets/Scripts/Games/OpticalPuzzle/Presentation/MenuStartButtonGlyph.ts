import { Color, Graphics } from 'cc';
import { Direction } from '../Core/OpticalPuzzleTypes';
import {
    drawHudSvgArrowIcon,
    HUD_MENU_START_ARROW_SIZE_RATIO,
    traceHudSvgDirectionArrow,
} from './OpticalPuzzleHudArrowGlyph';
import { targetDimFillColor } from './OpticalPuzzleColorUtil';

/** 菜单开始键圆形外框线宽（设计 px，不随节点缩放） */
export const MENU_START_BORDER_PX = 3;

/** 中间右箭头 icon 外描边（设计 px，不随节点缩放） */
export const MENU_START_ICON_BORDER_PX = 4;

const KEY_FILL = new Color(22, 28, 38, 255);
const MENU_START_BORDER = new Color(255, 255, 255, 255);

const PRESSED_GLOW_LAYERS: ReadonlyArray<{ width: number; alpha: number }> = [
    { width: 9, alpha: 48 },
    { width: 6, alpha: 120 },
    { width: 3, alpha: 255 },
];

const HUD_BUTTON_DESIGN_SIZE = 80;

function scaleHudDesign(size: number, design: number): number {
    return design * (size / HUD_BUTTON_DESIGN_SIZE);
}

function menuStartIconFillColor(): Color {
    const dim = targetDimFillColor(undefined);
    return new Color(
        Math.floor(dim.r * 0.76),
        Math.floor(dim.g * 0.76),
        Math.floor(dim.b * 0.76),
        255,
    );
}

/** 菜单圆形键内 icon：与开始键箭头同描边（4px 固定、MITER/BUTT） */
export function drawMenuButtonIcon(
    g: Graphics,
    size: number,
    pressed: boolean,
    traceIcon: () => void,
): void {
    if (pressed) {
        g.fillColor = MENU_START_BORDER;
        traceIcon();
        g.fill();
        strokeGlowLayers(g, size, PRESSED_GLOW_LAYERS, traceIcon);
        return;
    }

    g.fillColor = menuStartIconFillColor();
    traceIcon();
    g.fill();
    g.strokeColor = MENU_START_BORDER;
    g.lineWidth = MENU_START_ICON_BORDER_PX;
    g.lineJoin = Graphics.LineJoin.MITER;
    g.lineCap = Graphics.LineCap.BUTT;
    traceIcon();
    g.stroke();
}

function strokeGlowLayers(
    g: Graphics,
    size: number,
    layers: ReadonlyArray<{ width: number; alpha: number }>,
    tracePath: () => void,
): void {
    g.lineJoin = Graphics.LineJoin.ROUND;
    g.lineCap = Graphics.LineCap.ROUND;
    for (const layer of layers) {
        g.strokeColor = new Color(255, 255, 255, layer.alpha);
        g.lineWidth = Math.max(1, scaleHudDesign(size, layer.width));
        tracePath();
        g.stroke();
    }
}

/** 菜单 icon 按下光晕（分享键等多段路径复用） */
export function strokeMenuButtonIconGlow(
    g: Graphics,
    size: number,
    tracePath: () => void,
): void {
    strokeGlowLayers(g, size, PRESSED_GLOW_LAYERS, tracePath);
}

/** 菜单圆形键帽底 + 白描边（开始键 / 选关键共用） */
export function drawMenuCircleButtonChrome(
    g: Graphics,
    cx: number,
    cy: number,
    size: number,
    pressed: boolean,
): void {
    const radius = size * 0.5 - MENU_START_BORDER_PX * 0.5;

    const traceCircle = (): void => {
        g.circle(cx, cy, radius);
    };

    g.fillColor = KEY_FILL;
    traceCircle();
    g.fill();

    g.lineJoin = Graphics.LineJoin.ROUND;
    g.lineCap = Graphics.LineCap.ROUND;

    if (pressed) {
        strokeGlowLayers(g, size, PRESSED_GLOW_LAYERS, traceCircle);
    } else {
        g.strokeColor = MENU_START_BORDER;
        g.lineWidth = MENU_START_BORDER_PX;
        traceCircle();
        g.stroke();
    }
}

function drawMenuStartRightArrowIcon(
    g: Graphics,
    size: number,
    cx: number,
    cy: number,
    pressed: boolean,
): void {
    const traceArrow = (): void => {
        traceHudSvgDirectionArrow(g, cx, cy, size, Direction.Right, HUD_MENU_START_ARROW_SIZE_RATIO);
    };

    if (pressed) {
        drawMenuButtonIcon(g, size, true, traceArrow);
        return;
    }

    drawHudSvgArrowIcon(
        g,
        cx,
        cy,
        size,
        Direction.Right,
        menuStartIconFillColor(),
        MENU_START_BORDER,
        MENU_START_ICON_BORDER_PX,
        HUD_MENU_START_ARROW_SIZE_RATIO,
    );
}

/** 圆形键帽 + 右箭头 icon（120×120 等正方尺寸） */
export function drawMenuStartButtonGlyph(
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
    drawMenuStartRightArrowIcon(g, size, cx, cy, pressed);
}
