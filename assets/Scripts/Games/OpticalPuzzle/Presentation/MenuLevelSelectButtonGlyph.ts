import { Graphics } from 'cc';
import { traceLevelSelectGridIconForButton } from './OpticalPuzzleLevelSelectButtonGlyph';
import { drawMenuButtonIcon, drawMenuCircleButtonChrome } from './MenuStartButtonGlyph';

/** 菜单选关键四宫格 icon 占键帽边长比例（与开始键箭头 0.42 对齐） */
export const HUD_MENU_LEVEL_SELECT_ICON_SIZE_RATIO = 0.42;

/** 菜单选关键：圆形键帽 + Game 同款四宫格 icon（120×120 等正方尺寸） */
export function drawMenuLevelSelectButtonGlyph(
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
    drawMenuButtonIcon(g, size, pressed, () => {
        traceLevelSelectGridIconForButton(g, cx, cy, size, HUD_MENU_LEVEL_SELECT_ICON_SIZE_RATIO);
    });
}
