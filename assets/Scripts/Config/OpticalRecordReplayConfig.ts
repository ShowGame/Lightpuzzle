/**
 * 录屏自动回放配置（仅开发/宣传录屏使用，发版前请保持 RECORD_REPLAY_ENABLED = false）。
 *
 * 用法：
 * 1. 将 RECORD_REPLAY_ENABLED 改为 true
 * 2. 选择 RECORD_REPLAY_ACTIVE_SCRIPT 或自定义 RECORD_REPLAY_SCRIPTS
 * 3. 预览/真机运行 Game 场景，开始录屏
 * 4. 快捷键：P 暂停/继续，R 重播当前段，N 跳下一段
 */

/** 总开关：true 时 Root 自动挂载录屏回放组件 */
export const RECORD_REPLAY_ENABLED = true;

/** 进入场景后自动开始播放脚本 */
export const RECORD_REPLAY_AUTO_START = true;

/** 播完最后一段后是否从头循环（方便长录屏）；成片剪辑时建议 false */
export const RECORD_REPLAY_LOOP = false;

/** 默认每步间隔（秒）；段内可用 stepIntervalSec 覆盖 */
export const RECORD_REPLAY_STEP_INTERVAL_SEC = 0.75;

/** 每关开局停留（秒），展示初始光路 */
export const RECORD_REPLAY_LEVEL_HOLD_SEC = 1.2;

/** 通关后停留（秒），展示光线溅射/全亮 */
export const RECORD_REPLAY_COMPLETE_HOLD_SEC = 1.8;

/** 演示段（未通关）段末停留（秒） */
export const RECORD_REPLAY_DEMO_HOLD_SEC = 2.2;

/** 录屏时隐藏方向键与底栏按钮；false 则保留 HUD 显示 */
export const RECORD_REPLAY_HIDE_HUD = false;

/** 录屏模式不写通关存档、不弹通关面板 */
export const RECORD_REPLAY_SKIP_SAVE_AND_WIN_UI = true;

/** 录屏 preWin → winPanel 延迟（秒）；默认 0.75×0.8，与成片 0.8 倍速对齐 */
export const RECORD_REPLAY_WIN_PRE_PANEL_DELAY_SEC = 0.6;

/** 单段脚本：一段 = 一关 + 解法序列 */
export interface OpticalRecordReplaySegment {
    /** 关卡 id */
    levelId: number;
    /** w/a/s/d；`reset` 点重开；`pause:秒数` 口播停顿（如 pause:5） */
    moves?: readonly string[];
    /** 本段开局停留（秒） */
    holdBeforeSec?: number;
    /** 本段通关后停留（秒） */
    holdAfterSec?: number;
    /** 本段每步间隔（秒） */
    stepIntervalSec?: number;
    /**
     * 最多演示几步（不必通关）。
     * 省略则播完整 bestSolution / moves 直至通关。
     */
    maxSteps?: number;
    /** 本段通关后展示 winPanel +「下一关」按钮（一条龙录屏用） */
    showWinPanel?: boolean;
    /** winPanel 弹出后再停留秒数（含 preWin 0.75s 之后的展示时间） */
    winPanelHoldSec?: number;
    /** 自动点「下一关」后加载的关卡 id（省略则用存档下一关） */
    jumpToLevelId?: number;
    /** 某步被阻挡时戛然而止（用于故意走错） */
    stopOnBlocked?: boolean;
    /** 段末（含阻挡停）后再停留秒数，然后自动回 Menu */
    backToMenuAfterSec?: number;
}

/** 命名脚本：多段连续播放，适合一条视频录多个关卡 */
export type OpticalRecordReplayScript = readonly OpticalRecordReplaySegment[];

export const RECORD_REPLAY_SCRIPTS: Record<string, OpticalRecordReplayScript> = {
    /**
     * 主推：前段简单关全通关，后段难关只演示机制（maxSteps）
     * 1(3步通) → 2(2步通) → 3(4步通) → 9(演示5步/分光) → 4(演示6步/绕墙)
     */
    douyin_showcase_01: [
        { levelId: 1, holdBeforeSec: 1.8, stepIntervalSec: 0.75 },
        { levelId: 2, holdBeforeSec: 0.8, stepIntervalSec: 0.7, holdAfterSec: 1.2 },
        { levelId: 3, holdBeforeSec: 1.0, stepIntervalSec: 0.65, holdAfterSec: 1.5 },
        {
            levelId: 9,
            maxSteps: 5,
            holdBeforeSec: 2,
            stepIntervalSec: 0.7,
            holdAfterSec: 2.5,
        },
        {
            levelId: 4,
            maxSteps: 6,
            holdBeforeSec: 1.8,
            stepIntervalSec: 0.55,
            holdAfterSec: 2.2,
        },
    ],

    /** 单关：第 1 关教学（3 步） */
    single_level_1: [{ levelId: 1, holdBeforeSec: 1.5, stepIntervalSec: 0.75 }],

    /** 单关：第 2 关最短（2 步），Q 弹手感 */
    single_level_2: [{ levelId: 2, holdBeforeSec: 1.2, stepIntervalSec: 0.8 }],

    /** 简单三连通关（9 步） */
    douyin_hook_01: [
        { levelId: 1, holdBeforeSec: 1.8, stepIntervalSec: 0.75 },
        { levelId: 2, holdBeforeSec: 1.0, stepIntervalSec: 0.7 },
        { levelId: 3, holdBeforeSec: 1.2, stepIntervalSec: 0.65 },
    ],

    /** 治愈向：仅第 2 关循环录 */
    douyin_qtan_02: [{ levelId: 2, holdBeforeSec: 1.5, stepIntervalSec: 0.85, holdAfterSec: 2 }],

    /** 颜色铺垫：第 1 关通 → 第 9 关只演示 5 步 */
    douyin_color_09: [
        { levelId: 1, holdBeforeSec: 1.2, stepIntervalSec: 0.7, holdAfterSec: 0.8 },
        { levelId: 9, maxSteps: 5, holdBeforeSec: 2, stepIntervalSec: 0.7, holdAfterSec: 2.5 },
    ],

    /** 烧脑演示：第 4 关只走 6 步 */
    brain_level_04: [{ levelId: 4, maxSteps: 6, holdBeforeSec: 2, stepIntervalSec: 0.6, holdAfterSec: 2.2 }],

    /** 爆款脚本 A：第2关全通 → 第9关正解前5步（走错段手操）见 宣传素材/总规划/三条爆款录屏脚本.md */
    viral_challenge_02_09: [
        { levelId: 2, holdBeforeSec: 1.0, stepIntervalSec: 0.75, holdAfterSec: 1.2 },
        {
            levelId: 9,
            moves: ['w', 'a', 'a', 'w', 'a'],
            maxSteps: 5,
            holdBeforeSec: 1.5,
            stepIntervalSec: 0.65,
            holdAfterSec: 2.0,
        },
    ],

    /** 爆款脚本 B：第1关全通 → 第4关绕墙前6步（走错段手操） */
    viral_wrong_light_01_04: [
        { levelId: 1, holdBeforeSec: 1.2, stepIntervalSec: 0.7, holdAfterSec: 1.0 },
        {
            levelId: 4,
            moves: ['d', 'd', 'w', 'd', 's', 'd'],
            maxSteps: 6,
            holdBeforeSec: 1.8,
            stepIntervalSec: 0.55,
            holdAfterSec: 2.0,
        },
    ],

    /** 爆款脚本 C：第2关全通 → 第8关染红前7步（前期关备选） */
    viral_undo_color_02_08: [
        { levelId: 2, holdBeforeSec: 0.8, stepIntervalSec: 0.8, holdAfterSec: 0.8 },
        {
            levelId: 8,
            moves: ['s', 's', 'd', 'd', 'd', 'd', 'w'],
            maxSteps: 7,
            holdBeforeSec: 2.0,
            stepIntervalSec: 0.6,
            holdAfterSec: 2.0,
        },
    ],

    /** 脚本 A（推荐）：第2关 → 第25关前6步 */
    viral_challenge_02_25: [
        { levelId: 2, holdBeforeSec: 1.0, stepIntervalSec: 0.75, holdAfterSec: 1.0 },
        {
            levelId: 25,
            moves: ['s', 'a', 's', 'd', 'a', 'a'],
            maxSteps: 6,
            holdBeforeSec: 2.0,
            stepIntervalSec: 0.6,
            holdAfterSec: 2.5,
        },
    ],

    /** 脚本 B（推荐）：第2关 → 第17关前5步 */
    viral_wrong_light_02_17: [
        { levelId: 2, holdBeforeSec: 0.8, stepIntervalSec: 0.75, holdAfterSec: 0.8 },
        {
            levelId: 17,
            moves: ['d', 'w', 'a', 'w', 'a'],
            maxSteps: 5,
            holdBeforeSec: 1.8,
            stepIntervalSec: 0.65,
            holdAfterSec: 2.0,
        },
    ],

    /** 脚本 C（推荐）：第3关 → 第25关前8步 */
    viral_undo_color_03_25: [
        { levelId: 3, holdBeforeSec: 1.0, stepIntervalSec: 0.65, holdAfterSec: 1.0 },
        {
            levelId: 25,
            moves: ['s', 'a', 's', 'd', 'a', 'a', 'a', 'w'],
            maxSteps: 8,
            holdBeforeSec: 2.0,
            stepIntervalSec: 0.55,
            holdAfterSec: 2.5,
        },
    ],

    /**
     * 07-12 成片：Menu 点开始 → 第21关正解通关 → 第23关两轮试错 → 回 Menu
     * Mock 存档 currentLevel=21；预览 Menu 场景，开录屏后点「开始游戏」。
     */
    viral_menu_02_23: [
        {
            levelId: 21,
            /** 演示用通关解（用户指定，非 bestSolution） */
            moves: [
                'a', 'a', 'a', 's', 'd', 's', 'a', 'w', 'a', 's', 'd', 'd',
                'w', 'w', 'd', 'd', 's', 'a', 'w', 'a', 'a', 's', 's', 'd', 'w', 'a', 'w', 'd', 's',
            ],
            holdBeforeSec: 0.8,
            stepIntervalSec: 0.4,
            showWinPanel: true,
            winPanelHoldSec: 0.8,
            jumpToLevelId: 23,
        },
        {
            levelId: 23,
            holdBeforeSec: 0.8,
            stepIntervalSec: 0.4,
            moves: [
                'w', 'a', 's', 'a', 'w', 'd', 'w', 'a', 'a', 'a', 'w', 'a', 'd', 'w', 'a', 'a',
                'pause:0.8',
                'reset',
                'pause:0.4',
                'a', 'a', 'w', 'w', 'a', 'a', 'a', 'w', 'd', 's', 'd', 'd', 's', 's', 'd', 'd',
                'w', 'a', 's', 'a', 'w', 'd', 'w', 'a', 'a', 'a', 'w', 'd', 's', 'd', 'd', 'w', 'a', 'w', 'd', 'd',
                'pause:0.8',
            ],
            backToMenuAfterSec: 0,
        },
    ],
};

/** 当前激活的脚本名（须在 RECORD_REPLAY_SCRIPTS 中存在） */
export const RECORD_REPLAY_ACTIVE_SCRIPT = 'viral_menu_02_23';
