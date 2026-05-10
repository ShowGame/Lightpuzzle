/**
 * 与《小游戏设计文档》及 project-rules 统一的最小状态枚举。
 * 具体流转由 OpticalPuzzleSession 驱动。
 */
export enum OpticalGameFlowState {
    BOOT = 'BOOT',
    READY = 'READY',
    RUNNING = 'RUNNING',
    PAUSED = 'PAUSED',
    SETTLEMENT = 'SETTLEMENT',
    FINISHED = 'FINISHED',
}
