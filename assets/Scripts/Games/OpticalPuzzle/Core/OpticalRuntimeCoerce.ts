import { Direction, normalizeDirection, TerrainKind } from './OpticalPuzzleTypes';

export const OPTICAL_DIR_DX: ReadonlyArray<number> = [1, 0, -1, 0];
export const OPTICAL_DIR_DY: ReadonlyArray<number> = [0, -1, 0, 1];

const DIR_DOWN = 3 as Direction;

/** 微信包关卡坐标偶发 string，与 number 相加会变成字符串拼接 → 光追 inBounds 失败 */
export function normalizeGridCoord(value: unknown, fallback = 0): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.floor(value);
    }
    if (typeof value === 'string') {
        const n = Number(value.trim());
        if (Number.isFinite(n)) {
            return Math.floor(n);
        }
    }
    return fallback;
}

export function normalizeGridSize(value: unknown, fallback: number): number {
    const n = normalizeGridCoord(value, fallback);
    return n > 0 ? n : fallback;
}

export function opticalDirDelta(dir: unknown): { dx: number; dy: number; dir: Direction } | null {
    const normalized = normalizeDirection(dir, DIR_DOWN);
    const dx = OPTICAL_DIR_DX[normalized];
    const dy = OPTICAL_DIR_DY[normalized];
    if (dx === undefined || dy === undefined) {
        return null;
    }
    return { dx, dy, dir: normalized };
}

export function normalizeTerrainKind(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.floor(value);
    }
    if (typeof value === 'string') {
        const trimmed = value.trim();
        const asNum = Number(trimmed);
        if (Number.isFinite(asNum)) {
            return Math.floor(asNum);
        }
        const fromEnum = TerrainKind[trimmed as keyof typeof TerrainKind];
        if (typeof fromEnum === 'number') {
            return fromEnum;
        }
    }
    return -1;
}

export function terrainKindAt(terrain: readonly unknown[], index: number): number {
    if (index < 0 || index >= terrain.length) {
        return -1;
    }
    return normalizeTerrainKind(terrain[index]);
}

export function normalizePieceConnectivity(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.floor(value);
    }
    if (typeof value === 'string') {
        const n = Number(value.trim());
        if (Number.isFinite(n)) {
            return Math.floor(n);
        }
    }
    return 0;
}
