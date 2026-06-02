/** 网格四向，与文档一致：0 右 1 上 2 左 3 下（可按实现统一调整，全项目一致即可） */
import type { PieceConnectivity } from './OpticalPieceConnectivity';

export enum Direction {
    Right = 0,
    Up = 1,
    Left = 2,
    Down = 3,
}

/** 地形（与《小游戏设计文档》§3.2） */
export enum TerrainKind {
    Floor = 0,
    Wall = 1,
    Source = 2,
    Target = 3,
}

/** 光学元件 type（§3.3） */
export enum PieceType {
    Glass = 'glass',
    GlassH = 'glass-h',
    GlassV = 'glass-v',
    MirrorSlash = 'mirror-slash',
    MirrorBackslash = 'mirror-backslash',
    SplitterT = 'splitter-t',
    SplitterCross = 'splitter-cross',
    PortalA = 'portal-a',
    PortalB = 'portal-b',
}

/** 颜色模式（§3.4） */
export enum ColorMode {
    Through = 'through',
    FilterRed = 'filterRed',
    FilterGreen = 'filterGreen',
    FilterBlue = 'filterBlue',
}

/** 光源格（与关卡 sources 顺序一致） */
export interface OpticalSourceSnapshot {
    x: number;
    y: number;
    colorKey: string;
    direction: Direction;
}

/** 目标格点亮状态（与关卡 targets 顺序一致） */
export interface OpticalTargetSnapshot {
    x: number;
    y: number;
    colorKey: string;
    lit: boolean;
}

/** 光学元件（通道 0～4 + 朝向 + 层 3 颜色，用于棋盘绘制） */
export interface OpticalPieceSnapshot {
    x: number;
    y: number;
    connectivity: PieceConnectivity;
    direction: Direction;
    colorKey: string;
}

/** Application / Presentation 使用的只读棋盘快照 */
export interface OpticalBoardSnapshot {
    levelId: number;
    levelName: string;
    width: number;
    height: number;
    terrain: TerrainKind[];
    player: { x: number; y: number };
    /** 主角朝向（决定双眼在格内的偏移，默认左） */
    playerFacing: Direction;
    sources: OpticalSourceSnapshot[];
    targets: OpticalTargetSnapshot[];
    pieces: OpticalPieceSnapshot[];
    /** 全部目标已按对应颜色点亮 */
    allTargetsLit: boolean;
}

export enum MoveAttemptResult {
    /** 主角走入空地 */
    PlayerMoved = 'player_moved',
    /** 主角推动一块光学元件成功（仅推动一格，不可推两格连体） */
    PiecePushed = 'piece_pushed',
    /** 被墙、边界、光源/目标格或推不动挡住 */
    Blocked = 'blocked',
}
