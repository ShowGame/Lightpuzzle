import type { OpticalBoardSnapshot } from '../Core/OpticalPuzzleTypes';
import { Direction } from '../Core/OpticalPuzzleTypes';
import { cellScreenRect } from './OpticalPuzzleWallDraw';

/** 主角 / 元件滑格时长（秒） */
export const MOVE_ANIM_DURATION = 0.1;

/** 挤压峰值：运动轴 1.06，垂直轴 0.8（中点达到） */
const SQUASH_AXIS_PEAK = 1.06;
const SQUASH_AXIS_DIP = 0.8;

export interface SquashedCellRect {
    left: number;
    bottom: number;
    width: number;
    height: number;
}

export interface MoveAnimEntity {
    kind: 'player' | 'piece';
    pieceIndex?: number;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    direction: Direction;
}

export interface MoveAnimState {
    elapsed: number;
    snapshot: OpticalBoardSnapshot;
    entities: MoveAnimEntity[];
}

export function moveAnimProgress(elapsed: number): number {
    return Math.min(1, Math.max(0, elapsed / MOVE_ANIM_DURATION));
}

/** 0→1→0，t=0.5 时为 1 */
function squashWave(progress: number): number {
    return Math.sin(progress * Math.PI);
}

export function squashScales(dir: Direction, progress: number): { sx: number; sy: number } {
    const a = squashWave(progress);
    const horizontal = dir === Direction.Left || dir === Direction.Right;
    if (horizontal) {
        return {
            sx: 1 + (SQUASH_AXIS_PEAK - 1) * a,
            sy: 1 - (1 - SQUASH_AXIS_DIP) * a,
        };
    }
    return {
        sx: 1 - (1 - SQUASH_AXIS_DIP) * a,
        sy: 1 + (SQUASH_AXIS_PEAK - 1) * a,
    };
}

export function directionFromGridDelta(dx: number, dy: number): Direction {
    if (dx > 0) {
        return Direction.Right;
    }
    if (dx < 0) {
        return Direction.Left;
    }
    if (dy > 0) {
        return Direction.Up;
    }
    if (dy < 0) {
        return Direction.Down;
    }
    return Direction.Left;
}

/** 格子坐标插值 + 以格心为锚的挤压缩放 */
export function animatedSquashedCellRect(
    ox: number,
    oy: number,
    cell: number,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    progress: number,
    dir: Direction,
): SquashedCellRect {
    const gx = fromX + (toX - fromX) * progress;
    const gy = fromY + (toY - fromY) * progress;
    const base = cellScreenRect(ox, oy, gx, gy, cell);
    const { sx, sy } = squashScales(dir, progress);
    const cx = base.left + base.size * 0.5;
    const cy = base.bottom + base.size * 0.5;
    const w = base.size * sx;
    const h = base.size * sy;
    return {
        left: cx - w * 0.5,
        bottom: cy - h * 0.5,
        width: w,
        height: h,
    };
}

export function buildMoveAnimEntities(
    fromSnap: OpticalBoardSnapshot,
    toSnap: OpticalBoardSnapshot,
): MoveAnimEntity[] {
    const entities: MoveAnimEntity[] = [];

    const pdx = toSnap.player.x - fromSnap.player.x;
    const pdy = toSnap.player.y - fromSnap.player.y;
    if (pdx !== 0 || pdy !== 0) {
        entities.push({
            kind: 'player',
            fromX: fromSnap.player.x,
            fromY: fromSnap.player.y,
            toX: toSnap.player.x,
            toY: toSnap.player.y,
            direction: directionFromGridDelta(pdx, pdy),
        });
    }

    const count = Math.min(fromSnap.pieces.length, toSnap.pieces.length);
    for (let i = 0; i < count; i++) {
        const from = fromSnap.pieces[i];
        const to = toSnap.pieces[i];
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        if (dx === 0 && dy === 0) {
            continue;
        }
        entities.push({
            kind: 'piece',
            pieceIndex: i,
            fromX: from.x,
            fromY: from.y,
            toX: to.x,
            toY: to.y,
            direction: directionFromGridDelta(dx, dy),
        });
    }

    return entities;
}

/** 移动失败：主角原地挤压形变，元件不动 */
export function buildFailedMovePlayerEntity(snapshot: OpticalBoardSnapshot): MoveAnimEntity {
    const { x, y } = snapshot.player;
    const direction = snapshot.playerFacing ?? Direction.Left;
    return {
        kind: 'player',
        fromX: x,
        fromY: y,
        toX: x,
        toY: y,
        direction,
    };
}
