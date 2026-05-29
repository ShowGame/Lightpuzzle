import { Direction } from './OpticalPuzzleTypes';

/** 统一光学元件通道类型（默认朝向下的开口集合） */
export type PieceConnectivity = 0 | 1 | 2 | 3 | 4;

/**
 * 默认朝向（层 4 `w`）下各类型的开口方向。
 * 0 无口；1 上+右；2 上+下；3 上+左+右；4 四面。
 */
export const CONNECTIVITY_OPEN_DIRS: ReadonlyArray<readonly Direction[]> = [
    [],
    [Direction.Up, Direction.Right],
    [Direction.Up, Direction.Down],
    [Direction.Up, Direction.Left, Direction.Right],
    [Direction.Up, Direction.Right, Direction.Down, Direction.Left],
];

const DIR_STEPS_CW: Readonly<Record<Direction, number>> = {
    [Direction.Up]: 0,
    [Direction.Right]: 1,
    [Direction.Down]: 2,
    [Direction.Left]: 3,
};

/** 顺时针旋转开口方向（`w`=0，`d`=1，`s`=2，`a`=3） */
export function rotateOpenDirections(
    dirs: readonly Direction[],
    pieceDirection: Direction,
): Direction[] {
    const steps = DIR_STEPS_CW[pieceDirection];
    if (steps === 0) {
        return [...dirs];
    }
    return dirs.map((d) => ((d + 3 * steps) % 4) as Direction);
}

export function openDirectionsForPiece(
    connectivity: PieceConnectivity,
    pieceDirection: Direction,
): readonly Direction[] {
    const base = CONNECTIVITY_OPEN_DIRS[connectivity] ?? [];
    return rotateOpenDirections(base, pieceDirection);
}

/** 传播方向 → 从哪一侧进入该格（向下传播 = 从上方进入 = Up） */
export function propagationToEntrySide(propagation: Direction): Direction {
    return ((propagation + 2) % 4) as Direction;
}

/** 从某开口侧出射时的传播方向（向上开口 = 向上传播） */
export function entrySideToPropagation(exitSide: Direction): Direction {
    return exitSide;
}

export function parseConnectivityChar(ch: string): PieceConnectivity | null {
    if (ch >= '0' && ch <= '4') {
        return Number(ch) as PieceConnectivity;
    }
    return null;
}
