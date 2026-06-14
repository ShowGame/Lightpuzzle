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
    /** 已解锁 / 通关记录：[levelId, steps, …]；steps=999999 表示仅解锁未通；解锁以出现过的 levelId 为准（支持跳关） */
    opticalLevelClears?: number[];
    bgmOn?: boolean;
    sfxOn?: boolean;
} = {
    /** 继续游戏目标关（须在 clears 已解锁的 id 中） */
    opticalCurrentLevelId: 1,
    /** 1/2/3/5 已通；4/6 未在表中 → 选关锁定；无 999999 占位也可，有真实步数即视为已解锁 */
    opticalLevelClears: [1, 1, 2, 7, 3, 20, 4, 999999, 5, 999999, 6, 999999, 7, 999999, 8, 999999],
};
