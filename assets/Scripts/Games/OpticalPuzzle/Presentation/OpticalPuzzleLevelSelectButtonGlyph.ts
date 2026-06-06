import { Graphics } from 'cc';
import {
    drawHudShapeIcon,
    HUD_BUTTON_DESIGN_SIZE,
} from './OpticalPuzzleHudButtonCommon';

/** 图标占按钮比例（与 TopBar 返回键一致） */
const ICON_SIZE_RATIO = 0.58;
/** 返回箭头外接框（与 OpticalPuzzleBackButtonGlyph 一致，用于与选关四宫格顶底对齐） */
const BACK_ICON_TOP_NORM = 10.198;
const BACK_ICON_BOTTOM_NORM = -10.125;
const BACK_PATH_UNIT = 10.198;

/**
 * 四宫格几何（用户 SVG viewBox 1024，iconR=10）：
 * 每格外框 192×192，圆角约 52.8；格心见 CELL_CENTERS。
 * CELL_SIZE_SCALE：在保持 2×2 间距前提下放大单格。
 */
const CELL_SIZE_SCALE = 1.7;
const CELL_HALF = ((96 * 10) / 512) * CELL_SIZE_SCALE;
const CELL_CORNER = ((52.8 * 10) / 512) * CELL_SIZE_SCALE;
const CELL_CENTERS: ReadonlyArray<readonly [number, number]> = [
    [-4.375, 3.438],
    [4.375, 3.438],
    [-4.375, -5.312],
    [4.375, -5.312],
];
const GRID_TOP_NORM = Math.max(...CELL_CENTERS.map(([, ny]) => ny + CELL_HALF));
const GRID_BOTTOM_NORM = Math.min(...CELL_CENTERS.map(([, ny]) => ny - CELL_HALF));

function traceLevelSelectIcon(g: Graphics, cx: number, cy: number, scale: number): void {
    const half = CELL_HALF * scale;
    const corner = CELL_CORNER * scale;
    for (const [nx, ny] of CELL_CENTERS) {
        const cellCx = cx + nx * scale;
        const cellCy = cy + ny * scale;
        g.roundRect(cellCx - half, cellCy - half, half * 2, half * 2, corner);
    }
}

/**
 * 绘制选关键：无键帽外框，四枚圆角正方（描边/填色/按下光晕与四向键内芯一致）。
 */
export function drawLevelSelectButtonGlyph(
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
    const backScale = iconHalf / BACK_PATH_UNIT;
    const backHeightNorm = BACK_ICON_TOP_NORM - BACK_ICON_BOTTOM_NORM;
    const gridHeightNorm = GRID_TOP_NORM - GRID_BOTTOM_NORM;
    // 等比放大四宫格，使外接框顶/底与返回箭头一致（宽高同 scale）
    const scale = (backHeightNorm * backScale) / gridHeightNorm;
    const alignOffsetY = BACK_ICON_TOP_NORM * backScale - GRID_TOP_NORM * scale;
    const refSize = size > 0 ? size : HUD_BUTTON_DESIGN_SIZE;

    drawHudShapeIcon(g, refSize, pressed, () => {
        traceLevelSelectIcon(g, cx, cy + alignOffsetY, scale);
    });
}
