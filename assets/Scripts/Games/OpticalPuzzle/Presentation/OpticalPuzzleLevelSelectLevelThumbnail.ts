import { Color, Graphics } from 'cc';
import type { IOpticalLevelConfig, IOpticalPiece } from '../Config/OpticalPuzzleLevelSchema';
import { colorModeToKey } from '../Core/OpticalLightColor';
import { TerrainKind } from '../Core/OpticalPuzzleTypes';
import {
    beamColorFromKey,
    pieceChannelColors,
    playerBaseFillColor,
    sourceFillColor,
    targetUnlitBulbFillColor,
} from './OpticalPuzzleColorUtil';
import { LEVEL_SELECT_ITEM_THUMB_BOARD_SCALE } from './OpticalPuzzleLevelSelectPanelGlyph';

const THUMB_FLOOR = new Color(18, 55, 73, 255);
const THUMB_WALL = new Color(48, 147, 188, 255);

/** 缩略图元件填充色（与局内 `OpticalPuzzlePieceGlyph` 同源） */
function pieceThumbFillColor(piece: IOpticalPiece): Color {
    const colorKey = colorModeToKey(piece.colorMode);
    if (piece.connectivity === 0) {
        return targetUnlitBulbFillColor(colorKey);
    }
    return pieceChannelColors(colorKey).stroke;
}

/** 缩略图目标填充色（按 colorKey，与光路同色阶） */
function targetThumbFillColor(colorKey?: string): Color {
    const beam = beamColorFromKey(colorKey);
    return new Color(beam.r, beam.g, beam.b, 255);
}

/** 在关卡项中心区域绘制关卡布局缩略图 */
export function drawLevelSelectLevelThumbnail(
    g: Graphics,
    level: IOpticalLevelConfig,
    left: number,
    bottom: number,
    width: number,
    height: number,
    locked: boolean,
): void {
    const lw = Math.max(1, level.width);
    const lh = Math.max(1, level.height);
    const areaW = width * LEVEL_SELECT_ITEM_THUMB_BOARD_SCALE;
    const areaH = height * LEVEL_SELECT_ITEM_THUMB_BOARD_SCALE;
    const cell = Math.min(areaW / lw, areaH / lh);
    const boardW = lw * cell;
    const boardH = lh * cell;
    const ox = left + (width - boardW) * 0.5;
    const oy = bottom + (height - boardH) * 0.5;

    g.fillColor = THUMB_FLOOR;
    g.rect(ox, oy, boardW, boardH);
    g.fill();

    for (let y = 0; y < lh; y++) {
        for (let x = 0; x < lw; x++) {
            const kind = level.terrain[y * lw + x];
            const cx = ox + x * cell;
            const cy = oy + (lh - 1 - y) * cell;
            if (kind === TerrainKind.Wall) {
                g.fillColor = THUMB_WALL;
                g.rect(cx, cy, cell, cell);
                g.fill();
            }
        }
    }

    const dot = Math.max(1.5, cell * 0.28);
    const inset = cell * 0.22;

    for (const src of level.sources) {
        g.fillColor = sourceFillColor(src.colorKey);
        g.circle(ox + (src.x + 0.5) * cell, oy + (lh - 1 - src.y + 0.5) * cell, dot);
        g.fill();
    }

    for (const tgt of level.targets) {
        g.fillColor = targetThumbFillColor(tgt.colorKey);
        g.circle(ox + (tgt.x + 0.5) * cell, oy + (lh - 1 - tgt.y + 0.5) * cell, dot * 0.85);
        g.fill();
    }

    for (const piece of level.pieces) {
        g.fillColor = pieceThumbFillColor(piece);
        g.rect(
            ox + piece.x * cell + inset,
            oy + (lh - 1 - piece.y) * cell + inset,
            cell - inset * 2,
            cell - inset * 2,
        );
        g.fill();
    }

    const px = level.player.x;
    const py = level.player.y;
    g.fillColor = playerBaseFillColor();
    g.circle(ox + (px + 0.5) * cell, oy + (lh - 1 - py + 0.5) * cell, dot * 0.75);
    g.fill();

    if (locked) {
        g.fillColor = new Color(0, 0, 0, 72);
        g.rect(ox, oy, boardW, boardH);
        g.fill();
    }
}
