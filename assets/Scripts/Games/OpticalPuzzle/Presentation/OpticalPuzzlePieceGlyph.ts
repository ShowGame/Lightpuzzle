import { Color, Graphics } from 'cc';
import {
    openDirectionsForPiece,
    type PieceConnectivity,
} from '../Core/OpticalPieceConnectivity';
import { Direction } from '../Core/OpticalPuzzleTypes';
import { pieceChannelColors } from './OpticalPuzzleColorUtil';

const ARM_WIDTH = 5;
const HOLE_RATIO = 0.34;

const SCREEN_DX: ReadonlyArray<number> = [1, 0, -1, 0];
const SCREEN_DY: ReadonlyArray<number> = [0, 1, 0, -1];

/**
 * 绘制统一通道元件占位：格心留空（后期换图），开口方向画直角通道臂。
 * 默认朝向图示见 `OpticalPuzzleLevelSchema.ts` 文件头注释。
 */
export function drawConnectivityGlyph(
    g: Graphics,
    left: number,
    top: number,
    size: number,
    connectivity: PieceConnectivity,
    pieceDirection: Direction,
    colorKey?: string,
): void {
    const cx = left + size * 0.5;
    const cy = top - size * 0.5;
    const holeR = size * HOLE_RATIO * 0.5;
    const armLen = size * 0.5 - holeR - 4;
    const inset = 4;

    if (connectivity === 0) {
        g.fillColor = new Color(48, 52, 64, 255);
        g.rect(left + inset, top - size + inset, size - inset * 2, size - inset * 2);
        g.fill();
        g.strokeColor = new Color(90, 94, 108, 255);
        g.lineWidth = 2;
        g.rect(left + inset, top - size + inset, size - inset * 2, size - inset * 2);
        g.stroke();
        return;
    }

    const channelColors = pieceChannelColors(colorKey);
    g.strokeColor = channelColors.stroke;
    g.lineWidth = ARM_WIDTH;
    g.fillColor = channelColors.fill;

    const dirs = openDirectionsForPiece(connectivity, pieceDirection);
    for (const d of dirs) {
        const sx = cx + SCREEN_DX[d] * holeR;
        const sy = cy + SCREEN_DY[d] * holeR;
        const ex = cx + SCREEN_DX[d] * (holeR + armLen);
        const ey = cy + SCREEN_DY[d] * (holeR + armLen);
        g.moveTo(sx, sy);
        g.lineTo(ex, ey);
        g.stroke();
    }

    g.strokeColor = new Color(28, 32, 42, 200);
    g.lineWidth = 2;
    g.circle(cx, cy, holeR);
    g.stroke();
}
