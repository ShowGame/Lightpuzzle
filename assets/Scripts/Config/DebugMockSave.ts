/**
 * true：仅在进程内第一次 DataManager.init 时把 MOCK_PLAYER_DATA 写入本地再 restore（避免切场景第二次 init 覆盖你在 Menu 的修改）。
 * false：完全读本地已有存档，不写 mock。
 * 发版前请改为 false。
 */
export const USE_DEBUG_MOCK_SAVE = true;

/** 可只写关心的字段；其余在 restore 时与默认存档合并。仅当 USE_DEBUG_MOCK_SAVE 为 true 时写入本地 */
export const MOCK_PLAYER_DATA: {
    /** 菜单「开始游戏」进入的关卡 / 上次退出关卡（与解锁无关，可任意已解锁关） */
    opticalCurrentLevelId?: number;
    /** 已通关最少步数：[levelId, bestSteps, …]；解锁由本字段推算 */
    opticalLevelClears?: number[];
    bgmOn?: boolean;
    sfxOn?: boolean;
} = {
    /** 已通前三关，继续游戏从第 4 关开始 */
    opticalCurrentLevelId: 8,
    /** [levelId, bestSteps, …]：1 关三星线、2 关二星线、3 关一星线 → 解锁第 4 关 */
    opticalLevelClears: [1, 1, 2, 7, 3, 20],
};
