import { Color, Graphics } from 'cc';
import { Direction } from '../Core/OpticalPuzzleTypes';
import {
    playerBaseBorderColor,
    playerBaseFillColor,
    playerEyeFillColor,
} from './OpticalPuzzleColorUtil';
import { OPTICAL_CELL_SIZE } from './OpticalPuzzleLayout';

/** 单眼宽 / 高（设计像素） */
const EYE_WIDTH = 6;
const EYE_HEIGHT = 18;
/** 眨眼压扁后单眼宽 / 高（设计像素） */
const BLINK_EYE_WIDTH = 14;
const BLINK_EYE_HEIGHT = 6;
/** 眨眼时双眼整体下移（设计像素） */
const BLINK_DOWN_OFFSET = 2;
/** 两眼中心间距（设计像素，眨眼时不变） */
const EYE_CENTER_GAP = 20;
/** 格底外框宽度（设计像素） */
const BASE_BORDER_WIDTH = 2;

/** 双眼整体中心相对格心的偏移（设计像素，y 向上为正） */
const PAIR_CENTER_BY_DIR: Readonly<Record<Direction, { x: number; y: number }>> = {
    [Direction.Left]: { x: -4, y: 3 },
    [Direction.Up]: { x: 0, y: 3 },
    [Direction.Right]: { x: 4, y: 3 },
    [Direction.Down]: { x: 0, y: 0 },
};

/** 格底圆角（设计像素） */
const CELL_CORNER_RADIUS = 4;
/** 眼镜片圆角（略小于格底） */
const EYE_CORNER_RADIUS = 2;

function scaleDesign(size: number, design: number): number {
    return design * (size / OPTICAL_CELL_SIZE);
}

function scaledCellCornerRadius(size: number): number {
    return CELL_CORNER_RADIUS * (size / OPTICAL_CELL_SIZE);
}

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

/** 眨眼时眼色为原色的比例（峰值） */
const BLINK_EYE_COLOR_SCALE = 0.8;

function eyeColorForBlink(base: Color, blinkAmount: number): Color {
    const t = Math.max(0, Math.min(1, blinkAmount));
    const scale = lerp(1, BLINK_EYE_COLOR_SCALE, t);
    return new Color(
        Math.floor(base.r * scale),
        Math.floor(base.g * scale),
        Math.floor(base.b * scale),
        base.a,
    );
}

/**
 * 主角：橘红格底 + 2px 黑边 + 两枚深橘眼镜片。
 * @param blinkAmount 0=睁开，1=眨眼峰值（压扁/下移/眼色 80%）
 */
export function drawPlayerEyes(
    g: Graphics,
    left: number,
    bottom: number,
    size: number,
    facing: Direction,
    blinkAmount = 0,
): void {
    const cellCorner = scaledCellCornerRadius(size);
    g.fillColor = playerBaseFillColor();
    g.roundRect(left, bottom, size, size, cellCorner);
    g.fill();
    g.strokeColor = playerBaseBorderColor();
    g.lineWidth = Math.max(1, scaleDesign(size, BASE_BORDER_WIDTH));
    g.roundRect(left, bottom, size, size, cellCorner);
    g.stroke();

    const cx = left + size * 0.5;
    const cy = bottom + size * 0.5;
    const offset = PAIR_CENTER_BY_DIR[facing] ?? PAIR_CENTER_BY_DIR[Direction.Left];
    const pairCx = cx + scaleDesign(size, offset.x);
    const pairCy =
        cy +
        scaleDesign(size, offset.y) -
        scaleDesign(size, BLINK_DOWN_OFFSET * blinkAmount);

    const t = Math.max(0, Math.min(1, blinkAmount));
    const eyeW = scaleDesign(size, lerp(EYE_WIDTH, BLINK_EYE_WIDTH, t));
    const eyeH = scaleDesign(size, lerp(EYE_HEIGHT, BLINK_EYE_HEIGHT, t));
    const halfGap = scaleDesign(size, EYE_CENTER_GAP) * 0.5;
    const eyeCorner = scaleDesign(
        size,
        lerp(EYE_CORNER_RADIUS, Math.min(3, BLINK_EYE_HEIGHT * 0.5), t),
    );
    const eyeColor = eyeColorForBlink(playerEyeFillColor(), t);

    g.fillColor = eyeColor;
    for (const ex of [pairCx - halfGap, pairCx + halfGap]) {
        g.roundRect(ex - eyeW * 0.5, pairCy - eyeH * 0.5, eyeW, eyeH, eyeCorner);
        g.fill();
    }
}
