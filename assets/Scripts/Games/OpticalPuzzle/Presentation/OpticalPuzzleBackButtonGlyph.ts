import { Graphics } from 'cc';
import {
    drawHudShapeIcon,
    HUD_BUTTON_DESIGN_SIZE,
} from './OpticalPuzzleHudButtonCommon';

/** 图标占按钮比例（四向键 0.42；返回键无键帽，略放大） */
const ICON_SIZE_RATIO = 0.58;
/** 返回箭头路径半宽（viewBox 1024×1024，iconR=10） */
const BACK_PATH_UNIT = 10.198;

type PathSeg =
    | { t: 'M'; x: number; y: number }
    | { t: 'L'; x: number; y: number }
    | { t: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
    | { t: 'Z' };

/** 返回箭头（用户 SVG，iconR=10；无键帽，仅面型图标） */
const BACK_ICON_SEGS: ReadonlyArray<PathSeg> = [
    { t: 'M', x: 5.497, y: -6.585 },
    { t: 'L', x: -1.166, y: 0.036 },
    { t: 'L', x: 5.455, y: 6.575 },
    { t: 'C', x1: 6.247, y1: 7.366, x2: 6.247, y2: 8.615, x: 5.455, y: 9.407 },
    { t: 'C', x1: 4.664, y1: 10.198, x2: 3.373, y2: 10.198, x: 2.582, y: 9.407 },
    { t: 'L', x: -5.289, y: 1.661 },
    { t: 'C', x1: -5.372, y1: 1.619, x2: -5.455, y2: 1.536, x: -5.539, y: 1.494 },
    { t: 'C', x1: -5.955, y1: 1.119, x2: -6.122, y2: 0.578, x: -6.122, y: 0.078 },
    { t: 'C', x1: -6.122, y1: -0.422, x2: -5.914, y2: -0.963, x: -5.539, y: -1.338 },
    { t: 'C', x1: -5.455, y1: -1.421, x2: -5.372, y2: -1.463, x: -5.289, y: -1.504 },
    { t: 'L', x: 2.624, y: -9.334 },
    { t: 'C', x1: 3.415, y1: -10.125, x2: 4.706, y2: -10.125, x: 5.497, y: -9.334 },
    { t: 'C', x1: 6.33, y1: -8.626, x2: 6.33, y2: -7.376, x: 5.497, y: -6.585 },
    { t: 'Z' },
];

function traceIconSegs(
    g: Graphics,
    segs: ReadonlyArray<PathSeg>,
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

function traceBackIcon(g: Graphics, cx: number, cy: number, scale: number): void {
    traceIconSegs(g, BACK_ICON_SEGS, cx, cy, scale);
}

/**
 * 绘制返回键：无键帽外框，仅箭头图标（描边/填色/按下光晕与四向键内芯一致）。
 */
export function drawBackButtonGlyph(
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
    const iconHalf = size * ICON_SIZE_RATIO * 0.5;
    const scale = iconHalf / BACK_PATH_UNIT;
    const refSize = size > 0 ? size : HUD_BUTTON_DESIGN_SIZE;

    drawHudShapeIcon(g, refSize, pressed, () => {
        traceBackIcon(g, cx, cy, scale);
    });
}
