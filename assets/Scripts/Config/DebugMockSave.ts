/**
 * true：仅在进程内第一次 DataManager.init 时把 MOCK_PLAYER_DATA 覆盖写入内存（不写 localStorage）。
 * 之后局内推进（如下一关）会正常 save；同一次预览内回菜单再开不会重复套 mock。
 * false：完全按本地存档 + DEFAULT_DATA 合并。
 * 发版前请改为 false。
 */
export const USE_DEBUG_MOCK_SAVE = true;

/** 可只写关心的字段；其余保留 restore 结果。仅当 USE_DEBUG_MOCK_SAVE 为 true 且进程内首次 init 时覆盖内存 */
export const MOCK_PLAYER_DATA: {
    opticalCurrentLevelId?: number;
    bgmOn?: boolean;
    sfxOn?: boolean;
} = {
    opticalCurrentLevelId: 6,
};
