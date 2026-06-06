/** 主角外轮廓（用户 SVG viewBox 1024，iconR=10；高度由 Presentation 层纵向三切片扩展） */
export const PLAYER_FRAME_BOX_W = 20.000 as const;
export const PLAYER_FRAME_NORM_CX = 0.000 as const;
/** 外轮廓 bbox 纵向范围（归一化坐标） */
export const PLAYER_FRAME_MIN_Y = -6.182 as const;
export const PLAYER_FRAME_MAX_Y = 6.364 as const;
/** 上盖下缘：内轮廓背带凹槽最低点，其上是耳 / 背带（不纵向拉伸） */
export const PLAYER_FRAME_TOP_SLICE_Y = 1.577 as const;
/** 下盖上缘：底圆角起点，其下是底边（不纵向拉伸） */
export const PLAYER_FRAME_BOTTOM_SLICE_Y = -3.182 as const;

export type PlayerSvgSeg =
    | { t: 'M'; x: number; y: number }
    | { t: 'L'; x: number; y: number }
    | { t: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
    | { t: 'Z' };

export const PLAYER_FRAME_OUTER_SEGS: ReadonlyArray<PlayerSvgSeg> = [
    { t: 'M', x: 9.091, y: 5.545 },
    { t: 'C', x1: 8.091, y1: 6.364, x2: 6.545, y2: 6.273, x: 5.636, y: 5.273 },
    { t: 'L', x: 4.182, y: 3.545 },
    { t: 'C', x1: 3.909, y1: 3.182, x2: 3.455, y2: 3, x: 3, y: 3 },
    { t: 'L', x: -3, y: 3 },
    { t: 'C', x1: -3.455, y1: 3, x2: -3.909, y2: 3.182, x: -4.182, y: 3.545 },
    { t: 'L', x: -5.727, y: 5.273 },
    { t: 'C', x1: -6.545, y1: 6.273, x2: -8.091, y2: 6.364, x: -9.091, y: 5.545 },
    { t: 'C', x1: -9.727, y1: 5.091, x2: -10, y2: 4.364, x: -10, y: 3.636 },
    { t: 'L', x: -10, y: -3.182 },
    { t: 'C', x1: -10, y1: -4.818, x2: -8.636, y2: -6.182, x: -7.091, y: -6.182 },
    { t: 'L', x: 7, y: -6.182 },
    { t: 'C', x1: 8.636, y1: -6.182, x2: 10, y2: -4.818, x: 10, y: -3.182 },
    { t: 'L', x: 10, y: 3.636 },
    { t: 'C', x1: 10, y1: 4.364, x2: 9.727, y2: 5.091, x: 9.091, y: 5.545 },
    { t: 'Z' },
];

export const PLAYER_FRAME_INNER_SEGS: ReadonlyArray<PlayerSvgSeg> = [
    { t: 'M', x: 8.727, y: -3.182 },
    { t: 'C', x1: 8.727, y1: -4.091, x2: 8, y2: -4.818, x: 7.091, y: -4.818 },
    { t: 'L', x: -7.091, y: -4.818 },
    { t: 'C', x1: -8, y1: -4.818, x2: -8.727, y2: -4.091, x: -8.727, y: -3.182 },
    { t: 'L', x: -8.727, y: 3.636 },
    { t: 'C', x1: -8.727, y1: 4, x2: -8.545, y2: 4.273, x: -8.273, y: 4.545 },
    { t: 'C', x1: -8.091, y1: 4.727, x2: -7.818, y2: 4.818, x: -7.545, y: 4.818 },
    { t: 'C', x1: -7.182, y1: 4.818, x2: -6.909, y2: 4.636, x: -6.636, y: 4.455 },
    { t: 'L', x: -5.273, y: 2.727 },
    { t: 'C', x1: -4.727, y1: 2.091, x2: -3.909, y2: 1.727, x: -3.091, y: 1.727 },
    { t: 'L', x: 3, y: 1.727 },
    { t: 'C', x1: 3.818, y1: 1.727, x2: 4.636, y2: 2.091, x: 5.182, y: 2.727 },
    { t: 'L', x: 6.636, y: 4.455 },
    { t: 'C', x1: 7.091, y1: 4.909, x2: 7.818, y2: 5, x: 8.273, y: 4.636 },
    { t: 'C', x1: 8.545, y1: 4.455, x2: 8.727, y2: 4.091, x: 8.727, y: 3.727 },
    { t: 'L', x: 8.727, y: -3.182 },
    { t: 'Z' },
];
