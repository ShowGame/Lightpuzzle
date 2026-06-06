import { Color, Graphics } from 'cc';
import {
    HUD_DIR_BUTTON_SCENE_SIZE,
    HUD_KEY_CORNER_DESIGN,
    scaleHudDesign,
    strokeGlowLayers,
    unlitHudIconColor,
} from './OpticalPuzzleHudButtonCommon';

/** nextlevel 外框线宽（设计 px，不随节点缩放） */
export const WIN_NEXT_LEVEL_BORDER_PX = 4;
const NEXT_LEVEL_BORDER = new Color(255, 255, 255, 255);

/** nextlevel 按下光晕（略大于四向键 PRESSED_GLOW_LAYERS，缩放基准与 100×100 四向键对齐） */
const WIN_NEXT_LEVEL_PRESSED_GLOW_LAYERS: ReadonlyArray<{ width: number; alpha: number }> = [
    { width: 14, alpha: 48 },
    { width: 10, alpha: 120 },
    { width: 5, alpha: 255 },
];

/** 绘制 winds/nextlevel：四向键 icon 未按填充色 + 4px 圆角白框（无内芯图标） */
export function drawWinPanelNextLevelButtonGlyph(
    g: Graphics,
    left: number,
    bottom: number,
    width: number,
    height: number,
    pressed = false,
    borderPx: number = WIN_NEXT_LEVEL_BORDER_PX,
): void {
    const size = Math.min(width, height);
    const corner = scaleHudDesign(size, HUD_KEY_CORNER_DESIGN);
    const traceChrome = (): void => {
        g.roundRect(left, bottom, width, height, corner);
    };

    g.fillColor = unlitHudIconColor();
    traceChrome();
    g.fill();

    if (pressed) {
        strokeGlowLayers(
            g,
            HUD_DIR_BUTTON_SCENE_SIZE,
            WIN_NEXT_LEVEL_PRESSED_GLOW_LAYERS,
            traceChrome,
            true,
        );
        return;
    }

    g.strokeColor = NEXT_LEVEL_BORDER;
    g.lineWidth = borderPx;
    traceChrome();
    g.stroke();
}
