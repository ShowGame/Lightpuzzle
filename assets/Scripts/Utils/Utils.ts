/**
 * 通用工具函数（与 project-rules 目录约定一致）。
 */

export function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}
