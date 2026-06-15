import { Graphics } from 'cc';
import { Direction } from '../Core/OpticalPuzzleTypes';
import { strokeBeamSegmentGradient } from './OpticalPuzzleBeamGradient';
import { beamColorFromKey } from './OpticalPuzzleColorUtil';
import { drawSourceEmitter, sourceMuzzleScreenPoint } from './OpticalPuzzleSourceGlyph';

/** 菜单标题区白色光源向右发射的光束长度（设计 px） */
export const MENU_TITLE_SOURCE_BEAM_LENGTH_PX = 1000;

/** 白色光源发射器朝右 + 固定长度光束 */
export function drawMenuTitleWhiteSourceRightBeam(
    g: Graphics,
    left: number,
    bottom: number,
    width: number,
    height: number,
): void {
    const size = Math.min(width, height);
    const cellLeft = left + (width - size) * 0.5;
    const cellBottom = bottom + (height - size) * 0.5;
    const direction = Direction.Right;
    const beamColor = beamColorFromKey('white');
    const muzzle = sourceMuzzleScreenPoint(cellLeft, cellBottom, size, direction);

    strokeBeamSegmentGradient(
        g,
        muzzle.x,
        muzzle.y,
        muzzle.x + MENU_TITLE_SOURCE_BEAM_LENGTH_PX,
        muzzle.y,
        beamColor,
    );
    drawSourceEmitter(g, cellLeft, cellBottom, size, 'white', direction);
}
