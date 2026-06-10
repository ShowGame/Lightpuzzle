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
import {
    HUD_DIR_ARROW_SIZE_RATIO,
    traceHudSvgDirectionArrow,
    drawHudSvgArrowIcon,
} from './OpticalPuzzleHudArrowGlyph';

/** 键帽设计尺寸（与场景 UITransform 一致） */
export const DIR_BUTTON_DESIGN_SIZE = HUD_BUTTON_DESIGN_SIZE;

const ARROW_STROKE = new Color(255, 255, 255, 255);

/** 绘制单枚方向键：80×80 圆角底 + SVG 圆角三角箭头 */
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

    if (pressed) {
        drawHudShapeIcon(g, size, true, () =>
            traceHudSvgDirectionArrow(g, cx, cy, size, direction, HUD_DIR_ARROW_SIZE_RATIO),
        );
        return;
    }

    drawHudSvgArrowIcon(
        g,
        cx,
        cy,
        size,
        direction,
        unlitHudIconColor(),
        ARROW_STROKE,
        arrowBorderW,
        HUD_DIR_ARROW_SIZE_RATIO,
    );
}
