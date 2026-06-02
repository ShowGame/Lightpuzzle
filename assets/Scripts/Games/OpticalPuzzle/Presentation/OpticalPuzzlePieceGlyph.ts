import { Graphics } from 'cc';
import {
    openDirectionsForPiece,
    type PieceConnectivity,
} from '../Core/OpticalPieceConnectivity';
import { Direction } from '../Core/OpticalPuzzleTypes';
import { pieceBaseFillColor, pieceChannelColors } from './OpticalPuzzleColorUtil';
import { OPTICAL_CELL_SIZE } from './OpticalPuzzleLayout';

const ARM_WIDTH_RATIO = 0.14;
const HOLE_RATIO = 0.3;
/** 臂端距格边留白（0 = 延至格缘） */
const ARM_EDGE_INSET = 1;
/** 元件格底圆角（设计像素，随格宽等比缩放） */
const PIECE_CORNER_RADIUS = 4;

function scaledPieceCornerRadius(size: number): number {
    return PIECE_CORNER_RADIUS * (size / OPTICAL_CELL_SIZE);
}

const SCREEN_DIR_DX: ReadonlyArray<number> = [1, 0, -1, 0];
const SCREEN_DIR_DY: ReadonlyArray<number> = [0, 1, 0, -1];

function drawThickArm(
    g: Graphics,
    cx: number,
    cy: number,
    dir: Direction,
    holeR: number,
    armLen: number,
    halfW: number,
): void {
    const dx = SCREEN_DIR_DX[dir];
    const dy = SCREEN_DIR_DY[dir];
    const px = -dy * halfW;
    const py = dx * halfW;
    const x0 = cx + dx * holeR;
    const y0 = cy + dy * holeR;
    const x1 = cx + dx * (holeR + armLen);
    const y1 = cy + dy * (holeR + armLen);

    g.moveTo(x0 + px, y0 + py);
    g.lineTo(x1 + px, y1 + py);
    g.lineTo(x1 - px, y1 - py);
    g.lineTo(x0 - px, y0 - py);
    g.close();
    g.fill();
    g.stroke();
}

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
    const bottom = top - size;
    const cornerR = scaledPieceCornerRadius(size);

    g.fillColor = pieceBaseFillColor(colorKey);
    g.roundRect(left, bottom, size, size, cornerR);
    g.fill();

    const holeR = size * HOLE_RATIO * 0.5;
    const armLen = size * 0.5 - holeR - ARM_EDGE_INSET;
    const halfW = size * ARM_WIDTH_RATIO * 0.5;

    if (connectivity === 0) {
        return;
    }

    const channelColors = pieceChannelColors(colorKey);
    g.fillColor = channelColors.fill;
    g.strokeColor = channelColors.stroke;
    g.lineWidth = 2;

    const dirs = openDirectionsForPiece(connectivity, pieceDirection);
    for (const d of dirs) {
        drawThickArm(g, cx, cy, d, holeR, armLen, halfW);
    }

    g.fillColor = channelColors.stroke;
    g.circle(cx, cy, holeR);
    g.fill();
    g.strokeColor = channelColors.stroke;
    g.lineWidth = 2;
    g.circle(cx, cy, holeR);
    g.stroke();
}
