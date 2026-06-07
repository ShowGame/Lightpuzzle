/** 光路段（格坐标，可含 0.5 半格）；独立文件避免 Tracer ↔ OverlapMerge 循环依赖 */
export interface OpticalBeamSegment {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    colorKey: string;
}

/** 光线被阻挡时的接触点（格坐标，可含 0.5 半格；位于阻挡格朝向光路的接触面） */
export interface OpticalBeamBlockContact {
    x: number;
    y: number;
    /** 光线传播方向（与光追 DIR_DX/DY 一致） */
    dir: number;
    colorKey: string;
}
