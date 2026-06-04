import { Color, Graphics } from 'cc';
import {
    drawHudButtonChrome,
    HUD_BUTTON_DESIGN_SIZE,
    HUD_ICON_BORDER_DESIGN,
    HUD_KEY_FILL,
    fillGlowLayersMatchingStroke,
    pressedHudIconColor,
    scaleHudDesign,
    strokeGlowLayers,
    PRESSED_GLOW_LAYERS,
    unlitHudIconColor,
} from './OpticalPuzzleHudButtonCommon';

import { UNDO_ICON_FILL_STAGES } from '../Application/OpticalPuzzleSession';
export const ACTION_BUTTON_DESIGN_SIZE = HUD_BUTTON_DESIGN_SIZE;

/** 操作键种类 */
export enum ActionButtonKind {
    Undo = 'undo',
    Reset = 'reset',
}

/** 图标占键帽比例（与四向键 ARROW_SIZE_RATIO 一致） */
const ICON_SIZE_RATIO = 0.42;
/** 路径归一化半径（viewBox 1102×1024 → 80 键帽约 17px 半宽） */
const UNDO_PATH_UNIT = 17;
/** 重开图标路径半宽（viewBox 1024×1024，iconR=10） */
const RESET_PATH_UNIT = 10;
/** 重开图标相对默认占格放大系数 */
const RESET_ICON_SIZE_RATIO = 1.22;
/** 路径归一化最大半宽（iconR=10，用于光晕扩散换算） */
const RESET_ICON_NORM_HALF = 10.323;
/** 用尽角标占键帽比例（贴右上角略溢出） */
const UNDO_DISABLED_BADGE_SIZE_RATIO = 0.6;
/** 角标外轮廓描边（设计 px，与 HUD_ICON_BORDER_DESIGN 一致） */
const UNDO_DISABLED_BADGE_BORDER_DESIGN = 3;
/** 角标路径归一化半径（viewBox 1024×1024，iconR=8） */
const UNDO_DISABLED_BADGE_PATH_UNIT = 8;
/** 角标相对键帽右上角的向内偏移（设计 px） */
const UNDO_DISABLED_BADGE_INSET_DESIGN = 6;
/** 角标相对键帽右上角的向外溢出（设计 px） */
const UNDO_DISABLED_BADGE_OVERFLOW_DESIGN = 2;
/** 「+」笔画粗细（设计 px，纯白） */
const BADGE_PLUS_STROKE_DESIGN = 2.25;
/** 「+」双矩形圆角（设计 px） */
const BADGE_PLUS_CORNER_DESIGN = 1;
/** 「+」臂长（设计 px，相对 80 键帽） */
const BADGE_PLUS_ARM_HEIGHT_DESIGN = 11;
/** 数字 3 高度（设计 px，相对 80 键帽） */
const BADGE_DIGIT3_HEIGHT_DESIGN = 15;
/** 数字 3 加粗倍率（路径填充，与「+」3px 笔画视觉对齐） */
const BADGE_DIGIT3_BOLD_SCALE = 1.25;
/** 「+」与「3」间距（设计 px） */
const BADGE_PLUS3_GAP_DESIGN = 1.5;
/** 角标内框中心 X（badge 归一化坐标，iconR=8） */
const BADGE_INNER_CENTER_NX = (-5.595 + 2.976) * 0.5;
/** 数字 3 路径归一化半高（viewBox 1024，iconR=10） */
const BADGE_DIGIT3_PATH_HALF_H = 6.322;
/** 数字 3 路径归一化宽（iconR=10） */
const BADGE_DIGIT3_PATH_W = 8.037;

const ICON_STROKE = new Color(255, 255, 255, 255);

type UndoSeg =
    | { t: 'M'; x: number; y: number }
    | { t: 'L'; x: number; y: number }
    | { t: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
    | { t: 'Z' };

/** 外轮廓（用户 SVG）；实心填充，与四向键一致不做内孔 */
const UNDO_ICON_SEGS: ReadonlyArray<UndoSeg> = [
    { t: 'M', x: 14.46, y: -15.078 },
    { t: 'C', x1: 14.076, y1: -13.213, x2: 12.148, y2: -7.064, x: 2.129, y: -6.316 },
    { t: 'L', x: 2.129, y: -13.027 },
    { t: 'C', x1: 2.129, y1: -14.144, x2: 1.553, y2: -15.078, x: 0.779, y: -15.449 },
    { t: 'C', x1: -0.183, y1: -16.009, x2: -1.339, y2: -16.009, x: -2.302, y: -15.263 },
    { t: 'L', x: -2.495, y: -15.078 },
    { t: 'L', x: -17.139, y: -1.661 },
    { t: 'C', x1: -17.717, y1: -1.098, x2: -18.295, y2: -0.353, x: -18.295, y: 0.575 },
    { t: 'C', x1: -18.295, y1: 1.509, x2: -17.91, y2: 2.254, x: -17.139, y: 2.812 },
    { t: 'L', x: -2.302, y: 16.414 },
    { t: 'C', x1: -1.339, y1: 17.16, x2: -0.183, y2: 17.16, x: 0.779, y: 16.602 },
    { t: 'C', x1: 1.744, y1: 16.043, x2: 2.129, y2: 15.112, x: 2.129, y: 14.178 },
    { t: 'L', x: 2.129, y: 8.403 },
    { t: 'C', x1: 7.524, y1: 7.098, x2: 18.315, y2: 3.371, x: 18.315, y: -14.889 },
    { t: 'C', x1: 18.315, y1: -14.889, x2: 18.506, y2: -16.38, x: 16.772, y: -16.754 },
    { t: 'C', x1: 15.038, y1: -17.126, x2: 14.46, y2: -15.078, x: 14.46, y: -15.078 },
    { t: 'Z' },
];

/** 重开：双弧循环箭头（用户 SVG，iconR=10；弧段为三次贝塞尔） */
const RESET_ICON_SEGS: ReadonlyArray<UndoSeg> = [
    { t: 'M', x: -1.234, y: -6.26 },
    { t: 'L', x: -2.262, y: -6.26 },
    { t: 'C', x1: -5.228, y1: -5.775, x2: -7.498, y2: -3.192, x: -7.498, y: -0.089 },
    { t: 'C', x1: -7.498, y1: 0.95, x2: -7.231, y2: 1.923, x: -6.78, y: 2.786 },
    { t: 'L', x: -6.013, y: 1.723 },
    { t: 'C', x1: -5.455, y1: 0.949, x2: -4.251, y2: 1.165, x: -3.995, y: 2.084 },
    { t: 'L', x: -3.384, y: 4.281 },
    { t: 'L', x: -2.542, y: 7.311 },
    { t: 'C', x1: -2.34, y1: 8.037, x2: -2.886, y2: 8.756, x: -3.639, y: 8.754 },
    { t: 'L', x: -6.61, y: 8.75 },
    { t: 'L', x: -8.859, y: 8.747 },
    { t: 'C', x1: -9.786, y1: 8.746, x2: -10.323, y2: 7.695, x: -9.78, y: 6.943 },
    { t: 'L', x: -8.368, y: 4.986 },
    { t: 'C', x1: -9.391, y1: 3.555, x2: -9.997, y2: 1.805, x: -9.997, y: -0.089 },
    { t: 'C', x1: -9.997, y1: -4.466, x2: -6.788, y2: -8.092, x: -2.596, y: -8.74 },
    { t: 'C', x1: -2.481, y1: -8.758, x2: -2.37, y2: -8.753, x: -2.262, y: -8.739 },
    { t: 'L', x: -2.262, y: -8.754 },
    { t: 'L', x: -1.234, y: -8.754 },
    { t: 'C', x1: -0.552, y1: -8.754, x2: 0, y2: -8.202, x: 0, y: -7.52 },
    { t: 'L', x: 0, y: -7.495 },
    { t: 'C', x1: 0, y1: -6.813, x2: -0.552, y2: -6.26, x: -1.234, y: -6.26 },
    { t: 'Z' },
    { t: 'M', x: 9.78, y: -6.943 },
    { t: 'L', x: 8.368, y: -4.987 },
    { t: 'C', x1: 9.391, y1: -3.555, x2: 9.997, y2: -1.805, x: 9.997, y: 0.089 },
    { t: 'C', x1: 9.997, y1: 4.466, x2: 6.788, y2: 8.092, x: 2.596, y: 8.74 },
    { t: 'C', x1: 2.481, y1: 8.758, x2: 2.37, y2: 8.753, x: 2.262, y: 8.739 },
    { t: 'L', x: 2.262, y: 8.754 },
    { t: 'L', x: 1.234, y: 8.754 },
    { t: 'C', x1: 0.552, y1: 8.754, x2: 0, y2: 8.202, x: 0, y: 7.52 },
    { t: 'L', x: 0, y: 7.495 },
    { t: 'C', x1: 0, y1: 6.813, x2: 0.552, y2: 6.26, x: 1.234, y: 6.26 },
    { t: 'L', x: 2.262, y: 6.26 },
    { t: 'C', x1: 5.228, y1: 5.775, x2: 7.498, y2: 3.192, x: 7.498, y: 0.089 },
    { t: 'C', x1: 7.498, y1: -0.95, x2: 7.231, y2: -1.923, x: 6.78, y: -2.786 },
    { t: 'L', x: 6.013, y: -1.723 },
    { t: 'C', x1: 5.455, y1: -0.949, x2: 4.251, y2: -1.165, x: 3.995, y: -2.084 },
    { t: 'L', x: 3.385, y: -4.281 },
    { t: 'L', x: 2.542, y: -7.311 },
    { t: 'C', x1: 2.34, y1: -8.037, x2: 2.886, y2: -8.756, x: 3.639, y: -8.754 },
    { t: 'L', x: 6.61, y: -8.75 },
    { t: 'L', x: 8.86, y: -8.747 },
    { t: 'C', x1: 9.786, y1: -8.746, x2: 10.323, y2: -7.695, x: 9.78, y: -6.943 },
    { t: 'Z' },
];

/** 撤回用尽角标（用户 SVG：胶片框 + 播放三角 + 左上标记块） */
const UNDO_DISABLED_BADGE_FILL_SEGS: ReadonlyArray<UndoSeg> = [
    { t: 'M', x: 5.953, y: 3.098 },
    { t: 'L', x: 4.047, y: 2.009 },
    { t: 'L', x: 4.047, y: 4.255 },
    { t: 'C', x1: 4.047, y1: 4.776, x2: 3.62, y2: 5.2, x: 3.095, y: 5.2 },
    { t: 'L', x: -5.714, y: 5.2 },
    { t: 'C', x1: -6.24, y1: 5.2, x2: -6.667, y2: 4.776, x: -6.667, y: 4.255 },
    { t: 'L', x: -6.667, y: -4.255 },
    { t: 'C', x1: -6.667, y1: -4.776, x2: -6.24, y2: -5.2, x: -5.714, y: -5.2 },
    { t: 'L', x: 3.095, y: -5.2 },
    { t: 'C', x1: 3.621, y1: -5.2, x2: 4.047, y2: -4.776, x: 4.047, y: -4.255 },
    { t: 'L', x: 4.047, y: -2.009 },
    { t: 'L', x: 5.953, y: -3.098 },
    { t: 'L', x: 6.667, y: -2.69 },
    { t: 'L', x: 6.667, y: 2.689 },
    { t: 'L', x: 5.953, y: 3.098 },
    { t: 'Z' },
    { t: 'M', x: 2.976, y: -4.136 },
    { t: 'L', x: -5.595, y: -4.136 },
    { t: 'L', x: -5.595, y: 4.137 },
    { t: 'L', x: 2.976, y: 4.137 },
    { t: 'L', x: 2.976, y: -4.137 },
    { t: 'Z' },
    { t: 'M', x: 5.595, y: -1.669 },
    { t: 'L', x: 4.047, y: -0.786 },
    { t: 'L', x: 4.047, y: 0.785 },
    { t: 'L', x: 5.595, y: 1.669 },
    { t: 'L', x: 5.595, y: -1.669 },
    { t: 'Z' },
    { t: 'M', x: -4.524, y: 2.245 },
    { t: 'L', x: -2.857, y: 2.245 },
    { t: 'C', x1: -2.792, y1: 2.245, x2: -2.738, y2: 2.299, x: -2.738, y: 2.364 },
    { t: 'L', x: -2.738, y: 3.073 },
    { t: 'L', x: -2.857, y: 3.191 },
    { t: 'L', x: -4.524, y: 3.191 },
    { t: 'L', x: -4.643, y: 3.073 },
    { t: 'L', x: -4.643, y: 2.364 },
    { t: 'C', x1: -4.643, y1: 2.299, x2: -4.589, y2: 2.245, x: -4.524, y: 2.245 },
    { t: 'Z' },
];

/** 角标描边路径：仅最外轮廓（内框/播放三角/左上块只填充不描边，避免薄形状与共用边叠线） */
const UNDO_DISABLED_BADGE_STROKE_SEGS: ReadonlyArray<UndoSeg> = [
    { t: 'M', x: 5.953, y: 3.098 },
    { t: 'L', x: 4.047, y: 2.009 },
    { t: 'L', x: 4.047, y: 4.255 },
    { t: 'C', x1: 4.047, y1: 4.776, x2: 3.62, y2: 5.2, x: 3.095, y: 5.2 },
    { t: 'L', x: -5.714, y: 5.2 },
    { t: 'C', x1: -6.24, y1: 5.2, x2: -6.667, y2: 4.776, x: -6.667, y: 4.255 },
    { t: 'L', x: -6.667, y: -4.255 },
    { t: 'C', x1: -6.667, y1: -4.776, x2: -6.24, y2: -5.2, x: -5.714, y: -5.2 },
    { t: 'L', x: 3.095, y: -5.2 },
    { t: 'C', x1: 3.621, y1: -5.2, x2: 4.047, y2: -4.776, x: 4.047, y: -4.255 },
    { t: 'L', x: 4.047, y: -2.009 },
    { t: 'L', x: 5.953, y: -3.098 },
    { t: 'L', x: 6.667, y: -2.69 },
    { t: 'L', x: 6.667, y: 2.689 },
    { t: 'L', x: 5.953, y: 3.098 },
    { t: 'Z' },
];

/** 角标内数字 3（用户 SVG，iconR=10） */
const BADGE_DIGIT3_SEGS: ReadonlyArray<UndoSeg> = [
    { t: 'M', x: -3.972, y: -2.864 },
    { t: 'L', x: -2.465, y: -2.663 },
    { t: 'C', x1: -2.292, y1: -3.517, x2: -1.998, y2: -4.132, x: -1.582, y: -4.509 },
    { t: 'C', x1: -1.166, y1: -4.886, x2: -0.66, y2: -5.074, x: -0.063, y: -5.074 },
    { t: 'C', x1: 0.646, y1: -5.074, x2: 1.245, y2: -4.829, x: 1.733, y: -4.337 },
    { t: 'C', x1: 2.221, y1: -3.846, x2: 2.466, y2: -3.238, x: 2.466, y: -2.513 },
    { t: 'C', x1: 2.466, y1: -1.821, x2: 2.24, y2: -1.25, x: 1.788, y: -0.801 },
    { t: 'C', x1: 1.336, y1: -0.351, x2: 0.761, y2: -0.127, x: 0.063, y: -0.127 },
    { t: 'C', x1: -0.222, y1: -0.127, x2: -0.576, y2: -0.183, x: -1.0, y: -0.294 },
    { t: 'L', x: -0.833, y: 1.029 },
    { t: 'C', x1: -0.732, y1: 1.017, x2: -0.651, y2: 1.012, x: -0.59, y: 1.012 },
    { t: 'C', x1: 0.052, y1: 1.012, x2: 0.629, y2: 1.179, x: 1.143, y: 1.514 },
    { t: 'C', x1: 1.656, y1: 1.849, x2: 1.913, y2: 2.365, x: 1.913, y: 3.063 },
    { t: 'C', x1: 1.913, y1: 3.615, x2: 1.726, y2: 4.073, x: 1.352, y: 4.436 },
    { t: 'C', x1: 0.978, y1: 4.798, x2: 0.495, y2: 4.98, x: -0.096, y: 4.98 },
    { t: 'C', x1: -0.682, y1: 4.98, x2: -1.17, y2: 4.796, x: -1.561, y: 4.427 },
    { t: 'C', x1: -1.952, y1: 4.059, x2: -2.203, y2: 3.506, x: -2.314, y: 2.77 },
    { t: 'L', x: -3.821, y: 3.038 },
    { t: 'C', x1: -3.637, y1: 4.048, x2: -3.219, y2: 4.83, x: -2.566, y: 5.386 },
    { t: 'C', x1: -1.913, y1: 5.941, x2: -1.101, y2: 6.219, x: -0.129, y: 6.219 },
    { t: 'C', x1: 0.54, y1: 6.219, x2: 1.157, y2: 6.075, x: 1.721, y: 5.788 },
    { t: 'C', x1: 2.284, y1: 5.5, x2: 2.715, y2: 5.108, x: 3.014, y: 4.611 },
    { t: 'C', x1: 3.312, y1: 4.115, x2: 3.462, y2: 3.587, x: 3.462, y: 3.029 },
    { t: 'C', x1: 3.462, y1: 2.499, x2: 3.319, y2: 2.016, x: 3.035, y: 1.581 },
    { t: 'C', x1: 2.75, y1: 1.146, x2: 2.329, y2: 0.8, x: 1.771, y: 0.543 },
    { t: 'C', x1: 2.496, y1: 0.376, x2: 3.06, y2: 0.028, x: 3.462, y: -0.499 },
    { t: 'C', x1: 3.864, y1: -1.027, x2: 4.065, y2: -1.687, x: 4.065, y: -2.479 },
    { t: 'C', x1: 4.065, y1: -3.551, x2: 3.674, y2: -4.459, x: 2.893, y: -5.204 },
    { t: 'C', x1: 2.111, y1: -5.949, x2: 1.123, y2: -6.322, x: -0.071, y: -6.322 },
    { t: 'C', x1: -1.148, y1: -6.322, x2: -2.042, y2: -6.001, x: -2.754, y: -5.359 },
    { t: 'C', x1: -3.465, y1: -4.717, x2: -3.871, y2: -3.885, x: -3.972, y: -2.864 },
    { t: 'Z' },
];

function traceIconSegs(
    g: Graphics,
    segs: ReadonlyArray<UndoSeg>,
    cx: number,
    cy: number,
    scale: number,
): void {
    for (const seg of segs) {
        switch (seg.t) {
            case 'M':
                g.moveTo(cx + seg.x * scale, cy + seg.y * scale);
                break;
            case 'L':
                g.lineTo(cx + seg.x * scale, cy + seg.y * scale);
                break;
            case 'C':
                g.bezierCurveTo(
                    cx + seg.x1 * scale,
                    cy + seg.y1 * scale,
                    cx + seg.x2 * scale,
                    cy + seg.y2 * scale,
                    cx + seg.x * scale,
                    cy + seg.y * scale,
                );
                break;
            case 'Z':
                g.close();
                break;
            default:
                break;
        }
    }
}

function traceUndoIcon(g: Graphics, cx: number, cy: number, scale: number): void {
    traceIconSegs(g, UNDO_ICON_SEGS, cx, cy, scale);
}

function traceResetIcon(g: Graphics, cx: number, cy: number, scale: number): void {
    traceIconSegs(g, RESET_ICON_SEGS, cx, cy, scale);
}

/** 横向填充比例：stage0=100%，每 +1 少 33% 右缘 */
function undoFillRatio(fillStage: number): number {
    const stage = Math.max(0, Math.min(UNDO_ICON_FILL_STAGES, fillStage));
    return Math.max(0, (UNDO_ICON_FILL_STAGES - stage) / UNDO_ICON_FILL_STAGES);
}

function undoIconBounds(cx: number, cy: number, size: number): {
    left: number;
    bottom: number;
    width: number;
    height: number;
} {
    const half = size * ICON_SIZE_RATIO * 0.5;
    return { left: cx - half, bottom: cy - half, width: half * 2, height: half * 2 };
}

/** 用键帽色盖住图标右缘，实现从左向右保留 fillRatio 的填充 */
function coverUndoIconRight(
    g: Graphics,
    cx: number,
    cy: number,
    size: number,
    fillRatio: number,
): void {
    if (fillRatio >= 1) {
        return;
    }
    const box = undoIconBounds(cx, cy, size);
    const coverW = box.width * (1 - fillRatio);
    g.fillColor = HUD_KEY_FILL;
    g.rect(box.left + box.width - coverW, box.bottom, coverW, box.height);
    g.fill();
}

function strokeUndoIconOutline(
    g: Graphics,
    cx: number,
    cy: number,
    scale: number,
    lineWidth: number,
): void {
    g.strokeColor = ICON_STROKE;
    g.lineWidth = lineWidth;
    g.lineJoin = Graphics.LineJoin.ROUND;
    g.lineCap = Graphics.LineCap.ROUND;
    traceUndoIcon(g, cx, cy, scale);
    g.stroke();
}

/** 撤回：内部填充可横向递减；外轮廓始终完整描边，按下时光晕覆盖全路径 */
function drawUndoIcon(
    g: Graphics,
    cx: number,
    cy: number,
    size: number,
    pressed: boolean,
    fillStage: number,
): void {
    const iconHalf = size * ICON_SIZE_RATIO * 0.5;
    const scale = iconHalf / UNDO_PATH_UNIT;
    const borderW = Math.max(1, scaleHudDesign(size, HUD_ICON_BORDER_DESIGN));
    const fillRatio = undoFillRatio(fillStage);
    const tracePath = (): void => {
        traceUndoIcon(g, cx, cy, scale);
    };

    if (fillRatio > 0) {
        g.fillColor = pressed ? pressedHudIconColor() : unlitHudIconColor();
        tracePath();
        g.fill();
        coverUndoIconRight(g, cx, cy, size, fillRatio);
    }

    if (pressed) {
        strokeGlowLayers(g, size, PRESSED_GLOW_LAYERS, tracePath, true);
    }
    strokeUndoIconOutline(g, cx, cy, scale, borderW);
}

/** 重开：未按浅白 + 3px 白描边；按下全白 + 光晕（与四向键/面型键一致） */
function drawResetIcon(
    g: Graphics,
    cx: number,
    cy: number,
    size: number,
    pressed: boolean,
): void {
    const iconHalf = size * ICON_SIZE_RATIO * 0.5;
    const scale = (iconHalf * RESET_ICON_SIZE_RATIO) / RESET_PATH_UNIT;
    const iconHalfPx = scale * RESET_ICON_NORM_HALF;
    const borderW = Math.max(1, scaleHudDesign(size, HUD_ICON_BORDER_DESIGN));
    const tracePath = (): void => {
        traceResetIcon(g, cx, cy, scale);
    };

    if (pressed) {
        fillGlowLayersMatchingStroke(
            g,
            size,
            PRESSED_GLOW_LAYERS,
            iconHalfPx,
            (expand) => traceResetIcon(g, cx, cy, scale * expand),
        );
        g.fillColor = pressedHudIconColor();
        tracePath();
        g.fill();
        return;
    }

    g.fillColor = unlitHudIconColor();
    tracePath();
    g.fill();

    g.strokeColor = ICON_STROKE;
    g.lineWidth = borderW;
    g.lineJoin = Graphics.LineJoin.ROUND;
    g.lineCap = Graphics.LineCap.ROUND;
    tracePath();
    g.stroke();
}

/** 「+」：两枚圆角矩形交叉，3px 厚、1px 圆角，纯白填充 */
function drawBadgePlusCross(
    g: Graphics,
    cx: number,
    cy: number,
    keySize: number,
    armLength: number,
): void {
    const thick = Math.max(1, scaleHudDesign(keySize, BADGE_PLUS_STROKE_DESIGN));
    const corner = Math.max(0.5, scaleHudDesign(keySize, BADGE_PLUS_CORNER_DESIGN));
    g.fillColor = ICON_STROKE;
    g.roundRect(cx - armLength * 0.5, cy - thick * 0.5, armLength, thick, corner);
    g.fill();
    g.roundRect(cx - thick * 0.5, cy - armLength * 0.5, thick, armLength, corner);
    g.fill();
}

/** 角标内「+3」：纯白、3px 笔画；不参与按下光晕 */
function drawUndoDisabledBadgePlus3(
    g: Graphics,
    badgeCx: number,
    badgeCy: number,
    badgeScale: number,
    keySize: number,
): void {
    const groupCx = badgeCx + BADGE_INNER_CENTER_NX * badgeScale;
    const groupCy = badgeCy;
    const digitH = scaleHudDesign(keySize, BADGE_DIGIT3_HEIGHT_DESIGN);
    const plusArm = scaleHudDesign(keySize, BADGE_PLUS_ARM_HEIGHT_DESIGN);
    const digitScale =
        (digitH / (BADGE_DIGIT3_PATH_HALF_H * 2)) * BADGE_DIGIT3_BOLD_SCALE;
    const gap = scaleHudDesign(keySize, BADGE_PLUS3_GAP_DESIGN);
    const digitW = BADGE_DIGIT3_PATH_W * digitScale;
    const groupW = plusArm + gap + digitW;
    const plusCx = groupCx - groupW * 0.5 + plusArm * 0.5;
    const digitCx = groupCx - groupW * 0.5 + plusArm + gap + digitW * 0.5;

    drawBadgePlusCross(g, plusCx, groupCy, keySize, plusArm);

    g.fillColor = ICON_STROKE;
    traceIconSegs(g, BADGE_DIGIT3_SEGS, digitCx, groupCy, digitScale);
    g.fill();
}

/** stage=3 时在键帽右上角叠「不可用」胶片角标 */
function drawUndoDisabledBadge(
    g: Graphics,
    left: number,
    bottom: number,
    width: number,
    height: number,
    pressed: boolean,
): void {
    const size = Math.min(width, height);
    const badgeHalf = size * UNDO_DISABLED_BADGE_SIZE_RATIO * 0.5;
    const scale = badgeHalf / UNDO_DISABLED_BADGE_PATH_UNIT;
    const inset = scaleHudDesign(size, UNDO_DISABLED_BADGE_INSET_DESIGN);
    const overflow = scaleHudDesign(size, UNDO_DISABLED_BADGE_OVERFLOW_DESIGN);
    const cx = left + width - inset + overflow;
    const cy = bottom + height - inset + overflow;
    const borderW = Math.max(1, scaleHudDesign(size, UNDO_DISABLED_BADGE_BORDER_DESIGN));
    const traceFill = (): void => {
        traceIconSegs(g, UNDO_DISABLED_BADGE_FILL_SEGS, cx, cy, scale);
    };
    const traceStroke = (): void => {
        traceIconSegs(g, UNDO_DISABLED_BADGE_STROKE_SEGS, cx, cy, scale);
    };

    g.fillColor = HUD_KEY_FILL;
    traceFill();
    g.fill();

    if (pressed) {
        strokeGlowLayers(g, size, PRESSED_GLOW_LAYERS, traceStroke, true);
    }

    g.strokeColor = ICON_STROKE;
    g.lineWidth = borderW;
    g.lineJoin = Graphics.LineJoin.ROUND;
    g.lineCap = Graphics.LineCap.ROUND;
    traceStroke();
    g.stroke();

    drawUndoDisabledBadgePlus3(g, cx, cy, scale, size);
}

/** 绘制撤回 / 重置键：80×80 圆角底 + 内部符号 */
export function drawActionButtonGlyph(
    g: Graphics,
    left: number,
    bottom: number,
    width: number,
    height: number,
    kind: ActionButtonKind,
    pressed = false,
    undoFillStage = 0,
): void {
    drawHudButtonChrome(g, left, bottom, width, height, pressed);

    const size = Math.min(width, height);
    const cx = left + width * 0.5;
    const cy = bottom + height * 0.5;

    if (kind === ActionButtonKind.Reset) {
        drawResetIcon(g, cx, cy, size, pressed);
        return;
    }

    if (kind !== ActionButtonKind.Undo) {
        return;
    }

    drawUndoIcon(g, cx, cy, size, pressed, undoFillStage);

    if (undoFillStage >= UNDO_ICON_FILL_STAGES) {
        drawUndoDisabledBadge(g, left, bottom, width, height, pressed);
    }
}
