import type { IOpticalLevelConfig, IOpticalLevelGridSource } from './OpticalPuzzleLevelSchema';
import { parseGridToLevelConfig } from './OpticalPuzzleLevelSchema';

/**
 * 关卡源数据：`levelId`（整数）+ `levelName` + `height` + `width` + `grid`。
 * 字符含义见 `IOpticalLevelGridData`（`OpticalPuzzleLevelSchema.ts`）文件内注释。
 */
export const OPTICAL_LEVEL_GRID_SOURCES: IOpticalLevelGridSource[] = [
    {
        levelId: 1,
        levelName: '教学',
        height: 7,
        width: 7,
        grid: [
            '#######',
            '#.....#',
            '#.....#',
            '#..@..#',
            '#.....#',
            '#.....#',
            '#######',
        ],
    },
    {
        levelId: 2,
        levelName: '十字墙',
        height: 9,
        width: 9,
        grid: [
            '#########',
            '#@......#',
            '#.......#',
            '#...#...#',
            '#..###..#',
            '#...#...#',
            '#.......#',
            '#.......#',
            '#########',
        ],
    },
    {
        levelId: 3,
        levelName: '柱廊',
        height: 7,
        width: 11,
        grid: [
            '###########',
            '#@........#',
            '#..#...#..#',
            '#.........#',
            '#....#...##',
            '#.........#',
            '###########',
        ],
    },
    {
        levelId: 4,
        levelName: '门洞',
        height: 9,
        width: 13,
        grid: [
            '#############',
            '#...........#',
            '#.....#.....#',
            '#.....#.....#',
            '#.@.........#',
            '#.....#.....#',
            '#.....#.....#',
            '#...........#',
            '#############',
        ],
    },
    {
        levelId: 5,
        levelName: '光源与目标',
        height: 11,
        width: 9,
        grid: [
            '#########',
            '#...S...#',
            '#.......#',
            '#.......#',
            '#.......#',
            '#.@.....#',
            '#.......#',
            '#.......#',
            '#.......#',
            '#...E...#',
            '#########',
        ],
    },
    {
        levelId: 6,
        levelName: '双目标',
        height: 8,
        width: 10,
        grid: [
            '##########',
            '#....S...#',
            '#........#',
            '#........#',
            '#@.......#',
            '#........#',
            '#.E....E.#',
            '##########',
        ],
    },
];

export const OPTICAL_LEVELS: IOpticalLevelConfig[] = OPTICAL_LEVEL_GRID_SOURCES.map((src) =>
    parseGridToLevelConfig(src),
);

const _byId = new Map<number, IOpticalLevelConfig>(OPTICAL_LEVELS.map((lv) => [lv.levelId, lv]));

export function getOpticalLevelById(levelId: number): IOpticalLevelConfig | undefined {
    return _byId.get(levelId);
}
