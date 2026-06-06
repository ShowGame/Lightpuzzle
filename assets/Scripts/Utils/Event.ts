import { EventTarget } from 'cc';

/** 全局音效 */
export const PLAY_AUDIO = new EventTarget();

/** 背景音乐 */
export const PLAY_BGM = new EventTarget();

/** 全局状态 */
export const GAME_STATE_CHANGE = new EventTarget();

/** 光学解谜：棋盘 / HUD 刷新等 */
export const OPTICAL_PUZZLE = new EventTarget();

/** 全局 Toast 提示（载荷 { message, bgWidth?, localY? }，由局内 Presentation 转发到 ToastManager） */
export const SHOW_TOAST = new EventTarget();
