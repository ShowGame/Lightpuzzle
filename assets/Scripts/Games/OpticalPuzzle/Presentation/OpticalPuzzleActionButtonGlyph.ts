import { Graphics } from 'cc';
import { drawHudButtonChrome, HUD_BUTTON_DESIGN_SIZE } from './OpticalPuzzleHudButtonCommon';

/** 与四向键一致，保留旧导出名 */
export { HUD_BUTTON_DESIGN_SIZE as ACTION_BUTTON_DESIGN_SIZE };

/** 操作键种类 */
export enum ActionButtonKind {
    Undo = 'undo',
    Reset = 'reset',
}

/** 绘制撤回 / 重置键：80×80 圆角底（无中心图标） */
export function drawActionButtonGlyph(
    g: Graphics,
    left: number,
    bottom: number,
    width: number,
    height: number,
    _kind: ActionButtonKind,
    pressed = false,
): void {
    drawHudButtonChrome(g, left, bottom, width, height, pressed);
}
