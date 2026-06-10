import { Color, Graphics } from 'cc';
import { Direction } from '../Core/OpticalPuzzleTypes';
import { HUD_ARROW_SVG_SEGS } from './OpticalPuzzleHudArrowSegs.generated';

/** 四向键箭头占键帽边长比例 */
export const HUD_DIR_ARROW_SIZE_RATIO = 0.45;
/** 菜单开始键箭头占键帽边长比例 */
export const HUD_MENU_START_ARROW_SIZE_RATIO = 0.42;

function rotationRad(direction: Direction): number {
    switch (direction) {
        case Direction.Up:
            return Math.PI * 0.5;
        case Direction.Down:
            return -Math.PI * 0.5;
        case Direction.Left:
            return Math.PI;
        default:
            return 0;
    }
}

/** 右向 SVG 外轮廓 → 按方向旋转后描路径（不含内孔 subpath） */
export function traceHudSvgDirectionArrow(
    g: Graphics,
    cx: number,
    cy: number,
    size: number,
    direction: Direction,
    sizeRatio: number = HUD_DIR_ARROW_SIZE_RATIO,
    scaleMul = 1,
): void {
    const height = size * sizeRatio * scaleMul;
    const rot = rotationRad(direction);
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);

    for (let i = 0; i < HUD_ARROW_SVG_SEGS.length; i++) {
        const p = HUD_ARROW_SVG_SEGS[i];
        const lx = p.x * height;
        const ly = p.y * height;
        const x = cx + lx * cos - ly * sin;
        const y = cy + lx * sin + ly * cos;
        if (i === 0) {
            g.moveTo(x, y);
        } else {
            g.lineTo(x, y);
        }
    }
    g.close();
}

/**
 * 外轮廓 fill + stroke：描边沿路径法线等宽；用 MITER/BUTT 避免 ROUND join 在顶点叠圆球。
 */
export function drawHudSvgArrowIcon(
    g: Graphics,
    cx: number,
    cy: number,
    size: number,
    direction: Direction,
    fillColor: Color,
    borderColor: Color,
    borderPx: number,
    sizeRatio: number = HUD_DIR_ARROW_SIZE_RATIO,
): void {
    const trace = (): void => {
        traceHudSvgDirectionArrow(g, cx, cy, size, direction, sizeRatio);
    };

    g.fillColor = fillColor;
    trace();
    g.fill();

    g.strokeColor = borderColor;
    g.lineWidth = Math.max(1, borderPx);
    g.lineJoin = Graphics.LineJoin.MITER;
    g.lineCap = Graphics.LineCap.BUTT;
    trace();
    g.stroke();
}
