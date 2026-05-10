/** 网格四向，与文档一致：0 右 1 上 2 左 3 下（可按实现统一调整，全项目一致即可） */
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

/** Application / Presentation 使用的只读棋盘快照（后续扩展 pieces、光路等） */
export interface OpticalBoardSnapshot {
    levelId: string;
    width: number;
    height: number;
    terrain: TerrainKind[];
    player: { x: number; y: number };
}

export enum MoveAttemptResult {
    /** 主角发生位移（含成功推动时主角仍是一步） */
    PlayerMoved = 'player_moved',
    /** 被墙、边界或当前规则下的阻挡挡住 */
    Blocked = 'blocked',
}
