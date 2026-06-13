import { Color } from 'cc';

/** 棋盘逻辑格边长（像素） */
export const OPTICAL_CELL_SIZE = 56;

/** 墙心 / 默认外扩 / 左上补块 #40c3f9 */
export const WALL_LIGHT_FILL = new Color(0x40, 0xc3, 0xf9, 255);

/** 默认外扩（同 WALL_LIGHT_FILL）；贴地板侧外扩改用 WALL_DARK_FILL */
export const WALL_ARM_FILL = WALL_LIGHT_FILL;

/** 贴地板侧深臂 / 右下补块 #226c8f */
export const WALL_DARK_FILL = new Color(0x22, 0x6c, 0x8f, 255);

/** 墙心正方形边长 */
export const WALL_CORE_SIZE = 28;

/** 四向臂厚度（与墙角缺口一致） */
export const WALL_ARM_THICK = 14;

/** 墙角补块边长 / 圆角半径 */
export const WALL_CORNER_PATCH = 14;

/** 2×2 墙块内角强制补丁色 #3093bc */
export const WALL_BLOCK_PATCH_FILL = new Color(0x30, 0x93, 0xbc, 255);

/** 叠层统一色（墙心 + 外臂 + 角补） #3093bc */
export const WALL_OVERLAY_FILL = new Color(0x30, 0x93, 0xbc, 255);

/** 叠层墙心正方形边长 */
export const WALL_OVERLAY_CORE_SIZE = 20;

/** 叠层四向臂厚度 / 角补边长（自墙心面向外，8×8） */
export const WALL_OVERLAY_ARM = 8;

/** 叠层邻墙连通扩展额外重叠（消除接缝，用于上下） */
export const WALL_OVERLAY_CONNECT_PAD = 1;

/** 叠层左右连通扩展额外重叠（跨格缝再压 1px） */
export const WALL_OVERLAY_CONNECT_PAD_H = 1;

/** 地板填充 #123749（与选关缩略图 THUMB_FLOOR 一致；不透明以免背景方框透出） */
export const FLOOR_FILL = new Color(0x12, 0x37, 0x49, 255);

/** 光路总宽度（与 BeamView 一致） */
export const BEAM_LINE_WIDTH = 9;

/** 光路最内层白芯占全宽比例（与 BeamView 一致） */
export const BEAM_CORE_WIDTH_RATIO = 0.125;

/** 光路渐变叠层数（与 BeamView 一致） */
export const BEAM_GRADIENT_STEPS = 8;

/** 光路半宽（随格宽等比缩放） */
export function beamHalfRadius(cellSize: number = OPTICAL_CELL_SIZE): number {
    return (BEAM_LINE_WIDTH / 2) * (cellSize / OPTICAL_CELL_SIZE);
}

/** 光路内白芯半径（= 最内层描边线宽的一半，随格宽等比缩放） */
export function beamCoreRadius(cellSize: number = OPTICAL_CELL_SIZE): number {
    const scale = cellSize / OPTICAL_CELL_SIZE;
    return BEAM_LINE_WIDTH * BEAM_CORE_WIDTH_RATIO * 0.5 * scale;
}

/** 缩放后棋盘距 Canvas 顶部的设计边距（px） */
export const PLAY_LAYER_TOP_MARGIN = 125;

/** 关卡棋盘逻辑高度（像素，未缩放） */
export function boardPixelHeight(levelHeight: number, cellSize: number = OPTICAL_CELL_SIZE): number {
    return levelHeight * cellSize;
}

/** 关卡棋盘逻辑宽度（像素，未缩放） */
export function boardPixelWidth(levelWidth: number, cellSize: number = OPTICAL_CELL_SIZE): number {
    return levelWidth * cellSize;
}

/**
 * 按关卡列数计算 layerPlay 等比缩放，使棋盘宽撑满 targetWidth。
 */
export function computePlayLayerScale(
    levelWidth: number,
    targetWidth: number,
    cellSize: number = OPTICAL_CELL_SIZE,
): number {
    const boardWidth = boardPixelWidth(levelWidth, cellSize);
    if (boardWidth <= 0 || targetWidth <= 0) {
        return 1;
    }
    return targetWidth / boardWidth;
}

/**
 * 缩放后使棋盘顶边距 Canvas 顶边 topMargin（设计 px）。
 * Canvas 锚点居中时，顶边 y = canvasHeight / 2。
 */
export function computePlayLayerPosition(
    levelHeight: number,
    scale: number,
    canvasHeight: number,
    topMargin: number = PLAY_LAYER_TOP_MARGIN,
    cellSize: number = OPTICAL_CELL_SIZE,
): { x: number; y: number } {
    if (canvasHeight <= 0 || levelHeight <= 0) {
        return { x: 0, y: 0 };
    }
    const boardTopLocal = boardPixelHeight(levelHeight, cellSize) * 0.5;
    const canvasTop = canvasHeight * 0.5;
    const targetBoardTopY = canvasTop - Math.max(0, topMargin);
    return {
        x: 0,
        y: targetBoardTopY - boardTopLocal * scale,
    };
}
