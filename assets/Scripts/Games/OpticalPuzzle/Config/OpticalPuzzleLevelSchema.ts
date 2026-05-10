import type { ColorMode, Direction, TerrainKind } from '../Core/OpticalPuzzleTypes';

/** 光源（占位，光追后续接入） */
export interface IOpticalLightSource {
    x: number;
    y: number;
    /** 0..3 与 Direction 一致 */
    direction: Direction;
    /** 后续扩展颜色；占位 */
    colorKey?: string;
}

export interface IOpticalTarget {
    x: number;
    y: number;
    colorKey?: string;
}

export interface IOpticalPiece {
    id: string;
    /** 如 glass、mirror-slash、portal-0a 等（与关卡数据一致） */
    type: string;
    colorMode: ColorMode;
    x: number;
    y: number;
    portalGroup?: string;
}

/**
 * 关卡配置（与《小游戏设计文档》§5 对齐；字段可随迭代增减）。
 * terrain 使用行优先一维数组，索引 i = y * width + x。
 */
export interface IOpticalLevelConfig {
    levelId: string;
    width: number;
    height: number;
    terrain: TerrainKind[];
    player: { x: number; y: number };
    pieces: IOpticalPiece[];
    sources: IOpticalLightSource[];
    targets: IOpticalTarget[];
}

/** 开发用最小关：仅地板 + 墙框 + 主角，用于跑通框架链路 */
export const DEV_LEVEL_MINIMAL: IOpticalLevelConfig = (() => {
    const w = 7;
    const h = 7;
    const t: TerrainKind[] = new Array(w * h).fill(0); // floor
    const wall = 1 as TerrainKind;
    for (let x = 0; x < w; x++) {
        t[x] = wall;
        t[(h - 1) * w + x] = wall;
    }
    for (let y = 0; y < h; y++) {
        t[y * w] = wall;
        t[y * w + (w - 1)] = wall;
    }
    return {
        levelId: 'dev_minimal',
        width: w,
        height: h,
        terrain: t,
        player: { x: 3, y: 3 },
        pieces: [],
        sources: [],
        targets: [],
    };
})();
