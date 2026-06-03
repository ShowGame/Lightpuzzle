import { Color, Graphics } from 'cc';
import { Direction } from '../Core/OpticalPuzzleTypes';
import {
    drawHudButtonChrome,
    drawHudShapeIcon,
    HUD_BUTTON_DESIGN_SIZE,
    HUD_ICON_BORDER_DESIGN,
    scaleHudDesign,
    unlitHudIconColor,
} from './OpticalPuzzleHudButtonCommon';

/** 键帽设计尺寸（与场景 UITransform 一致） */
export const DIR_BUTTON_DESIGN_SIZE = HUD_BUTTON_DESIGN_SIZE;
/** 箭头占键帽比例 */
const ARROW_SIZE_RATIO = 0.42;

const ARROW_STROKE = new Color(255, 255, 255, 255);

function traceArrow(
    g: Graphics,
    cx: number,
    cy: number,
    arrowHalf: number,
    direction: Direction,
): void {
    switch (direction) {
        case Direction.Up:
            g.moveTo(cx, cy + arrowHalf);
            g.lineTo(cx - arrowHalf, cy - arrowHalf * 0.6);
            g.lineTo(cx + arrowHalf, cy - arrowHalf * 0.6);
            break;
        case Direction.Down:
            g.moveTo(cx, cy - arrowHalf);
            g.lineTo(cx - arrowHalf, cy + arrowHalf * 0.6);
            g.lineTo(cx + arrowHalf, cy + arrowHalf * 0.6);
            break;
        case Direction.Left:
            g.moveTo(cx - arrowHalf, cy);
            g.lineTo(cx + arrowHalf * 0.6, cy + arrowHalf);
            g.lineTo(cx + arrowHalf * 0.6, cy - arrowHalf);
            break;
        case Direction.Right:
            g.moveTo(cx + arrowHalf, cy);
            g.lineTo(cx - arrowHalf * 0.6, cy + arrowHalf);
            g.lineTo(cx - arrowHalf * 0.6, cy - arrowHalf);
            break;
        default:
            break;
    }
    g.close();
}

/** 绘制单枚方向键：80×80 圆角底 + 白框三角箭头 */
export function drawDirButtonGlyph(
    g: Graphics,
    left: number,
    bottom: number,
    width: number,
    height: number,
    direction: Direction,
    pressed = false,
): void {
    const size = Math.min(width, height);
    const arrowBorderW = Math.max(1, scaleHudDesign(size, HUD_ICON_BORDER_DESIGN));

    drawHudButtonChrome(g, left, bottom, width, height, pressed);

    const cx = left + width * 0.5;
    const cy = bottom + height * 0.5;
    const arrowHalf = size * ARROW_SIZE_RATIO * 0.5;

    if (pressed) {
        drawHudShapeIcon(g, size, true, () => traceArrow(g, cx, cy, arrowHalf, direction));
        return;
    }

    g.fillColor = unlitHudIconColor();
    traceArrow(g, cx, cy, arrowHalf, direction);
    g.fill();
    g.strokeColor = ARROW_STROKE;
    g.lineWidth = arrowBorderW;
    g.lineJoin = Graphics.LineJoin.ROUND;
    g.lineCap = Graphics.LineCap.ROUND;
    traceArrow(g, cx, cy, arrowHalf, direction);
    g.stroke();
}
