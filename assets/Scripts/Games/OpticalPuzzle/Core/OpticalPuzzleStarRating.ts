import type { IOpticalLevelStarThresholds } from '../Config/OpticalPuzzleLevelSchema';

/** 五角星显示状态 */
export enum OpticalStarVisualState {
    /** 不发光：键帽底色填充 */
    Dim = 1,
    /** 涂满：纯白填充，无边缘光晕 */
    Filled = 2,
    /** 发光：纯白填充 + 边缘光晕 */
    Glow = 3,
}

/** 三颗星槽位：左 / 上 / 右 */
export type OpticalStarSlotStates = readonly [
    OpticalStarVisualState,
    OpticalStarVisualState,
    OpticalStarVisualState,
];

/** 是否完美通关（步数 ≤ perfectSteps） */
export function isPerfectClear(
    moveCount: number,
    thresholds: IOpticalLevelStarThresholds,
): boolean {
    return Math.max(0, Math.floor(moveCount)) <= thresholds.perfectSteps;
}

/**
 * 按通关步数与关卡阈值计算三颗星状态。
 * 左 = 一星线，中 = 二星线，右 = 三星线（完美时三颗均发光）。
 */
export function resolveStarSlotStates(
    moveCount: number,
    thresholds: IOpticalLevelStarThresholds,
): OpticalStarSlotStates {
    const steps = Math.max(0, Math.floor(moveCount));
    if (isPerfectClear(steps, thresholds)) {
        return [OpticalStarVisualState.Glow, OpticalStarVisualState.Glow, OpticalStarVisualState.Glow];
    }
    if (steps <= thresholds.threeStarSteps) {
        return [OpticalStarVisualState.Filled, OpticalStarVisualState.Filled, OpticalStarVisualState.Filled];
    }
    if (steps <= thresholds.twoStarSteps) {
        return [OpticalStarVisualState.Filled, OpticalStarVisualState.Filled, OpticalStarVisualState.Dim];
    }
    if (steps <= thresholds.oneStarSteps) {
        return [OpticalStarVisualState.Filled, OpticalStarVisualState.Dim, OpticalStarVisualState.Dim];
    }
    return [OpticalStarVisualState.Dim, OpticalStarVisualState.Dim, OpticalStarVisualState.Dim];
}

/** 未通关前默认三颗星均为不发光 */
export function defaultDimStarStates(): OpticalStarSlotStates {
    return [OpticalStarVisualState.Dim, OpticalStarVisualState.Dim, OpticalStarVisualState.Dim];
}
