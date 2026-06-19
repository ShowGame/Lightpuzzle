/**
 * 全局枚举集中定义（与 project-rules 一致）。
 * 光学解谜专用事件名使用 OPTICAL_ 前缀，避免与通用事件混淆。
 */
export enum EVENT_ENUM {
    /** 音效播放（载荷为 AUDIO_EFFECT_ENUM） */
    PLAY_AUDIO = 'PLAY_AUDIO',
    /** 背景音乐切换 */
    PLAY_BGM = 'PLAY_BGM',
    /** 全局游戏状态变更 */
    GAME_STATE_CHANGE = 'GAME_STATE_CHANGE',
    /** 光学解谜棋盘快照更新（载荷为 OpticalBoardSnapshot，由 Presentation 监听） */
    OPTICAL_SNAPSHOT_CHANGED = 'OPTICAL_SNAPSHOT_CHANGED',
    /** Toast 提示（载荷 { message, bgWidth?, localY? }） */
    SHOW_TOAST = 'SHOW_TOAST',
}

/** 音效类型（按需扩展；播放经 PLAY_AUDIO 事件，由 MusicManager 映射 AudioClip） */
export enum AUDIO_EFFECT_ENUM {
    /** UI 通用按钮点击 */
    CLICK_BUTTON = 'CLICK_BUTTON',
    /** 四向键：移动成功（走一格或推动元件） */
    OPTICAL_MOVE_SUCCESS = 'OPTICAL_MOVE_SUCCESS',
    /** 四向键：移动失败（与主角「><」阻拦脸同一时机） */
    OPTICAL_MOVE_FAIL = 'OPTICAL_MOVE_FAIL',
    /** 单个目标灯被点亮 */
    OPTICAL_TARGET_LIT = 'OPTICAL_TARGET_LIT',
    /** 关卡通关成功 */
    OPTICAL_LEVEL_COMPLETE = 'OPTICAL_LEVEL_COMPLETE',
}

/** 背景音乐种类（PLAY_BGM 刷新用；全局单曲 Bg.mp3，不再区分 Menu/Game） */
export enum BGM_KIND_ENUM {
    GLOBAL = 'GLOBAL',
}

/** 场景名与 build 设置中场景文件名一致 */
export enum SCENE_ENUM {
    MENU = 'Menu',
    /** 局内场景占位，创建 Game 场景后改为实际名称 */
    GAME = 'Game',
}

/** 与 project-rules 示例一致的全局游戏状态（跨玩法可复用） */
export enum GAME_STATE_ENUM {
    INIT,
    RUNNING,
    PAUSED,
    LOSED,
    COMPLETE,
}
