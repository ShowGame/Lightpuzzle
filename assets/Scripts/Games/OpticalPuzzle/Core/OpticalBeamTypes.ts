/** 光路段（格坐标，可含 0.5 半格）；独立文件避免 Tracer ↔ OverlapMerge 循环依赖 */
export interface OpticalBeamSegment {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    colorKey: string;
}
