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
const BLINK_EYE_WIDTH = 12;
const BLINK_EYE_HEIGHT = 4;
/** 眨眼时双眼整体下移（设计像素） */
const BLINK_DOWN_OFFSET = 2;
/** 两眼中心间距（设计像素，眨眼时不变） */
const EYE_CENTER_GAP = 20;
/** 阻拦 >< 眼两眼中心间距（设计像素） */
const BLOCKED_EYE_CENTER_GAP = 22;

/** 与 TargetGlyph 外缘一致：bezel 环宽比例、内面板圆角系数 */
const BEZEL_RATIO = 0.034;
const INNER_CORNER_FACTOR = 0.7;
const INNER_FRAME_STROKE_RATIO = 0.008;

/** 格底圆角（设计像素，与 Target / 发射器一致） */
const CELL_CORNER_RADIUS = 4;
/** 眼镜片圆角（略小于格底） */
const EYE_CORNER_RADIUS = 2;

/** 双眼整体中心相对格心的偏移（设计像素，y 向上为正） */
const PAIR_CENTER_BY_DIR: Readonly<Record<Direction, { x: number; y: number }>> = {
    [Direction.Left]: { x: -4, y: 3 },
    [Direction.Up]: { x: 0, y: 3 },
    [Direction.Right]: { x: 4, y: 3 },
    [Direction.Down]: { x: 0, y: 0 },
};

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

/** 阻拦 >< 眼：单条矩形长 / 厚 / 夹角 / 圆角（设计像素） */
const BLOCKED_BAR_LENGTH = 12;
const BLOCKED_BAR_THICKNESS = 4;
const BLOCKED_BAR_ANGLE_DEG = 60;
const BLOCKED_BAR_CORNER = 2;

const BLOCKED_HALF_ANGLE_RAD = (BLOCKED_BAR_ANGLE_DEG * 0.5 * Math.PI) / 180;

/** 长边沿 local +x；四角均为 2px 圆角（含交叠内端） */
function fillRotatedRoundRect(
    g: Graphics,
    cx: number,
    cy: number,
    length: number,
    thickness: number,
    angleRad: number,
    corner: number,
): void {
    const hl = length * 0.5;
    const ht = thickness * 0.5;
    const r = Math.min(corner, hl, ht);
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    const toWorld = (lx: number, ly: number): { x: number; y: number } => ({
        x: cx + lx * cos - ly * sin,
        y: cy + lx * sin + ly * cos,
    });
    const move = (lx: number, ly: number): void => {
        const w = toWorld(lx, ly);
        g.moveTo(w.x, w.y);
    };
    const line = (lx: number, ly: number): void => {
        const w = toWorld(lx, ly);
        g.lineTo(w.x, w.y);
    };
    const arcCorner = (
        cornerCx: number,
        cornerCy: number,
        startA: number,
        endA: number,
    ): void => {
        const segs = 4;
        for (let i = 0; i <= segs; i++) {
            const a = startA + ((endA - startA) * i) / segs;
            line(cornerCx + r * Math.cos(a), cornerCy + r * Math.sin(a));
        }
    };

    if (r <= 0.001) {
        move(-hl, -ht);
        line(-hl, ht);
        line(hl, ht);
        line(hl, -ht);
        g.close();
        g.fill();
        return;
    }

    // 四角 2px 圆角
    move(-hl + r, -ht);
    line(hl - r, -ht);
    arcCorner(hl - r, -ht + r, -Math.PI * 0.5, 0);
    line(hl, ht - r);
    arcCorner(hl - r, ht - r, 0, Math.PI * 0.5);
    line(-hl + r, ht);
    arcCorner(-hl + r, ht - r, Math.PI * 0.5, Math.PI);
    line(-hl, -ht + r);
    arcCorner(-hl + r, -ht + r, Math.PI, Math.PI * 1.5);
    g.close();
    g.fill();
}

/** 内端向内微量延伸（设计像素），外端长度不变 */
const BLOCKED_BAR_INNER_EXTEND = 2;

/** 单眼 ><：两枚圆角矩形拼接（pointingRight：左眼泪 >，右眼泪 <） */
function drawBlockedBarEye(
    g: Graphics,
    eyeCx: number,
    eyeCy: number,
    size: number,
    pointingRight: boolean,
): void {
    const barLen = scaleDesign(size, BLOCKED_BAR_LENGTH);
    const barThick = scaleDesign(size, BLOCKED_BAR_THICKNESS);
    const corner = scaleDesign(size, BLOCKED_BAR_CORNER);
    const cosH = Math.cos(BLOCKED_HALF_ANGLE_RAD);
    const sinH = Math.sin(BLOCKED_HALF_ANGLE_RAD);
    /** 内端微量延伸，外端长度不变，交叠侧同样 2px 圆角 */
    const innerExtend = scaleDesign(size, BLOCKED_BAR_INNER_EXTEND);
    const drawLen = barLen + innerExtend;
    const centerAlong = (barLen - innerExtend) * 0.5;
    const apexOffset = scaleDesign(
        size,
        (BLOCKED_BAR_LENGTH * 0.5) * cosH,
    );

    const apexX = eyeCx + (pointingRight ? apexOffset : -apexOffset);
    const apexY = eyeCy;

    const outwardSign = pointingRight ? -1 : 1;
    const topDirX = outwardSign * cosH;
    const topDirY = sinH;
    const botDirX = outwardSign * cosH;
    const botDirY = -sinH;

    fillRotatedRoundRect(
        g,
        apexX + topDirX * centerAlong,
        apexY + topDirY * centerAlong,
        drawLen,
        barThick,
        Math.atan2(topDirY, topDirX),
        corner,
    );
    fillRotatedRoundRect(
        g,
        apexX + botDirX * centerAlong,
        apexY + botDirY * centerAlong,
        drawLen,
        barThick,
        Math.atan2(botDirY, botDirX),
        corner,
    );
}

function drawBlockedChevronEyes(
    g: Graphics,
    pairCx: number,
    pairCy: number,
    size: number,
): void {
    const halfGap = scaleDesign(size, BLOCKED_EYE_CENTER_GAP) * 0.5;
    g.fillColor = eyeColorForBlink(playerEyeFillColor(), 1);

    drawBlockedBarEye(g, pairCx - halfGap, pairCy, size, true);
    drawBlockedBarEye(g, pairCx + halfGap, pairCy, size, false);
}

/**
 * 外缘 bezel 填充环 + 内嵌圆角面板（与 Target 未点亮外框同结构，颜色为主角黑边/橘底）。
 * 描边仅画内面板路径，不外溢格缘。
 */
function drawPlayerCellFrame(
    g: Graphics,
    left: number,
    bottom: number,
    width: number,
    height: number,
    refSize: number,
): void {
    const corner = scaledCellCornerRadius(refSize);
    const bezel = refSize * BEZEL_RATIO;
    const innerLeft = left + bezel;
    const innerBottom = bottom + bezel;
    const innerWidth = width - bezel * 2;
    const innerHeight = height - bezel * 2;
    const innerCorner = corner * INNER_CORNER_FACTOR;
    const border = playerBaseBorderColor();

    g.fillColor = border;
    g.roundRect(left, bottom, width, height, corner);
    g.fill();

    g.fillColor = playerBaseFillColor();
    g.roundRect(innerLeft, innerBottom, innerWidth, innerHeight, innerCorner);
    g.fill();

    g.strokeColor = border;
    g.lineWidth = Math.max(1, refSize * INNER_FRAME_STROKE_RATIO);
    g.roundRect(innerLeft, innerBottom, innerWidth, innerHeight, innerCorner);
    g.stroke();
}

/**
 * 主角：Target 式 bezel 外缘 + 橘色内面板 + 两枚深橘眼镜片。
 * @param width 格宽（挤压动画时可非正方形）
 * @param height 格高，默认与 width 相同
 */
export function drawPlayerEyes(
    g: Graphics,
    left: number,
    bottom: number,
    width: number,
    facing: Direction,
    blinkAmount = 0,
    blockedEyes = false,
    height?: number,
): void {
    const h = height ?? width;
    const refSize = Math.min(width, h);

    drawPlayerCellFrame(g, left, bottom, width, h, refSize);

    const cx = left + width * 0.5;
    const cy = bottom + h * 0.5;
    const offset = PAIR_CENTER_BY_DIR[facing] ?? PAIR_CENTER_BY_DIR[Direction.Left];
    const pairCx = cx + scaleDesign(refSize, offset.x);
    const pairCy = cy + scaleDesign(refSize, offset.y);

    if (blockedEyes) {
        drawBlockedChevronEyes(g, pairCx, pairCy, refSize);
        return;
    }

    const pairCyBlink =
        pairCy - scaleDesign(refSize, BLINK_DOWN_OFFSET * blinkAmount);

    const t = Math.max(0, Math.min(1, blinkAmount));
    const eyeW = scaleDesign(refSize, lerp(EYE_WIDTH, BLINK_EYE_WIDTH, t));
    const eyeH = scaleDesign(refSize, lerp(EYE_HEIGHT, BLINK_EYE_HEIGHT, t));
    const halfGap = scaleDesign(refSize, EYE_CENTER_GAP) * 0.5;
    const eyeCorner = scaleDesign(
        refSize,
        lerp(EYE_CORNER_RADIUS, Math.min(3, BLINK_EYE_HEIGHT * 0.5), t),
    );
    const eyeColor = eyeColorForBlink(playerEyeFillColor(), t);

    g.fillColor = eyeColor;
    for (const ex of [pairCx - halfGap, pairCx + halfGap]) {
        g.roundRect(ex - eyeW * 0.5, pairCyBlink - eyeH * 0.5, eyeW, eyeH, eyeCorner);
        g.fill();
    }
}
