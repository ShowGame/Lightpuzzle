import { EventTarget } from 'cc';

/** 全局音效 */
export const PLAY_AUDIO = new EventTarget();

/** 背景音乐 */
export const PLAY_BGM = new EventTarget();

/** 全局状态 */
export const GAME_STATE_CHANGE = new EventTarget();

/** 光学解谜：棋盘 / HUD 刷新等 */
export const OPTICAL_PUZZLE = new EventTarget();
