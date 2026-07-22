/**
 * 通用工具函数（与 project-rules 目录约定一致）。
 */

import { sys } from 'cc';

export function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

interface IWxVibrate {
    vibrateShort?(opt?: { type?: string; style?: string }): void;
}

/**
 * 轻触振动（近似输入法/键盘按键）。
 * 微信：`wx.vibrateShort` 约 15ms；浏览器移动端：`navigator.vibrate(10)`；无硬件时静默。
 */
export function playLightTapHaptic(): void {
    const g = globalThis as unknown as { wx?: IWxVibrate };
    if (sys.platform === sys.Platform.WECHAT_GAME) {
        const wx = g.wx;
        if (typeof wx?.vibrateShort === 'function') {
            wx.vibrateShort({ type: 'light' });
        }
        return;
    }
    if (sys.isBrowser && sys.isMobile && typeof navigator.vibrate === 'function') {
        navigator.vibrate(10);
    }
}
