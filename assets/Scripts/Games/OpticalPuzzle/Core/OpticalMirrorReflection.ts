import type { IOpticalPiece } from '../Config/OpticalPuzzleLevelSchema';
import { Direction, PieceType } from './OpticalPuzzleTypes';

/**
 * 查表下标 = 光线**射入该格时的传播方向**（与 `Direction` 枚举一致）：
 * - 光从**上方**来 → 传播方向 **Down**
 * - 光从**下方**来 → **Up**；从**左侧**来 → **Right**；从**右侧**来 → **Left**
 */

/**
 * `/` 镜：上→左、左→上、右→下、下→右（指光的来向与去向）。
 */
const REFLECT_MIRROR_SLASH: ReadonlyArray<Direction> = [
    Direction.Up, // 自左 (Right) → 向上
    Direction.Right, // 自下 (Up) → 向右
    Direction.Down, // 自右 (Left) → 向下
    Direction.Left, // 自上 (Down) → 向左
];

/**
 * `\` 镜：上→右、右→上、下→左、左→下。
 */
const REFLECT_MIRROR_BACKSLASH: ReadonlyArray<Direction> = [
    Direction.Down, // 自左 (Right) → 向下
    Direction.Left, // 自下 (Up) → 向左
    Direction.Up, // 自右 (Left) → 向上
    Direction.Right, // 自上 (Down) → 向右
];

export function isMirrorPiece(piece: IOpticalPiece): boolean {
    return (
        piece.type === PieceType.MirrorSlash || piece.type === PieceType.MirrorBackslash
    );
}

export function reflectAtPiece(piece: IOpticalPiece, incoming: Direction): Direction | null {
    if (!isMirrorPiece(piece)) {
        return null;
    }
    if (piece.type === PieceType.MirrorSlash) {
        return REFLECT_MIRROR_SLASH[incoming];
    }
    return REFLECT_MIRROR_BACKSLASH[incoming];
}
