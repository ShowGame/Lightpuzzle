import { Color, Graphics } from 'cc';
import {
    openDirectionsForPiece,
    type PieceConnectivity,
} from '../Core/OpticalPieceConnectivity';
import { Direction } from '../Core/OpticalPuzzleTypes';
import {
    pieceBaseFillColor,
    pieceChannelColors,
    playerBaseBorderColor,
    targetUnlitBulbFillColor,
} from './OpticalPuzzleColorUtil';
import { OPTICAL_CELL_SIZE } from './OpticalPuzzleLayout';

const ARM_WIDTH_RATIO = 0.14;
const HOLE_RATIO = 0.3;
/** 臂端距格边留白（0 = 延至格缘） */
const ARM_EDGE_INSET = 1;
/** 元件格底圆角（设计像素，随格宽等比缩放） */
const PIECE_CORNER_RADIUS = 4;
/** 与 Target / Player 外缘一致：bezel 环宽、内面板圆角系数 */
const BEZEL_RATIO = 0.034;
const INNER_CORNER_FACTOR = 0.7;
/** 内面板描边线宽比例（与 TargetGlyph 点亮内框一致） */
const INNER_FRAME_STROKE_RATIO = 0.008;

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

/** 挡光元件（connectivity 0）：Target 式黑边 bezel + 纯色内面板 */
function drawBlockingPieceFrame(
    g: Graphics,
    left: number,
    bottom: number,
    width: number,
    height: number,
    refSize: number,
    innerFill: Color,
): void {
    const corner = scaledPieceCornerRadius(refSize);
    const bezel = refSize * BEZEL_RATIO;
    const innerLeft = left + bezel;
    const innerBottom = bottom + bezel;
    const innerWidth = width - bezel * 2;
    const innerHeight = height - bezel * 2;
    const innerCorner = corner * INNER_CORNER_FACTOR;
    const border = playerBaseBorderColor();

    g.fillColor = border;
    g.roundRect(left, bottom, width, height, corner);
    g.fill();

    g.fillColor = innerFill;
    g.roundRect(innerLeft, innerBottom, innerWidth, innerHeight, innerCorner);
    g.fill();

    g.strokeColor = border;
    g.lineWidth = Math.max(1, refSize * INNER_FRAME_STROKE_RATIO);
    g.roundRect(innerLeft, innerBottom, innerWidth, innerHeight, innerCorner);
    g.stroke();
}

function blockingPieceInnerFill(colorKey?: string): Color {
    return targetUnlitBulbFillColor(colorKey);
}

/**
 * 绘制统一通道元件占位：格心留空（后期换图），开口方向画直角通道臂。
 * @param width 格宽（挤压动画时可非正方形）
 * @param height 格高，默认与 width 相同
 */
export function drawConnectivityGlyph(
    g: Graphics,
    left: number,
    top: number,
    width: number,
    connectivity: PieceConnectivity,
    pieceDirection: Direction,
    colorKey?: string,
    height?: number,
): void {
    const h = height ?? width;
    const refSize = Math.min(width, h);
    const cx = left + width * 0.5;
    const cy = top - h * 0.5;
    const bottom = top - h;
    const cornerR = scaledPieceCornerRadius(refSize);

    if (connectivity === 0) {
        drawBlockingPieceFrame(
            g,
            left,
            bottom,
            width,
            h,
            refSize,
            blockingPieceInnerFill(colorKey),
        );
        return;
    }

    g.fillColor = pieceBaseFillColor(colorKey);
    g.roundRect(left, bottom, width, h, cornerR);
    g.fill();

    const holeR = refSize * HOLE_RATIO * 0.5;
    const armLen = refSize * 0.5 - holeR - ARM_EDGE_INSET;
    const halfW = refSize * ARM_WIDTH_RATIO * 0.5;

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
