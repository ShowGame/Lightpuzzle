import type { ColorMode, Direction } from '../Core/OpticalPuzzleTypes';
import { ColorMode as ColorModeEnum, Direction as DirEnum, PieceType, TerrainKind } from '../Core/OpticalPuzzleTypes';

export interface IOpticalLightSource {
    x: number;
    y: number;
    direction: Direction;
    colorKey?: string;
}

export interface IOpticalTarget {
    x: number;
    y: number;
    colorKey?: string;
}

export interface IOpticalPiece {
    id: string;
    type: string;
    colorMode: ColorMode;
    x: number;
    y: number;
    portalGroup?: string;
}

/**
 * 关卡字符网格：`grid[y][x]` 单字符。
 *
 * 下列清单为字符表；`parseGridToLevelConfig` 已按此表解析。全表按「区分大小写」无重复字符（见上 R/r 等说明）。
 *
 * ── 地形（TerrainKind）──
 * - 墙 Wall —— 字符：#
 * - 地板 Floor —— 字符：.
 * - 光源 Source —— 字符：S
 * - 目标 Target（白）—— 字符：E
 * - 目标 TargetRed —— 字符：R
 * - 目标 TargetGreen —— 字符：G
 * - 目标 TargetBlue —— 字符：B
 * （大写 R/G/B 为接收点；小写 r/g/b 为玻璃滤色，互不冲突。）
 *
 * ── 角色 ──
 * - 玩家出生点（底层地板）—— 字符：@
 *
 * ── 光学元件：仅以下 7 种 `PieceType`，每种须配齐 4 种 `ColorMode`（through / filterRed / filterGreen / filterBlue）──
 *
 * glass
 * - through —— 字符：o
 * - filterRed —— 字符：r
 * - filterGreen —— 字符：g
 * - filterBlue —— 字符：b
 *
 * glass-h
 * - through —— 字符：-
 * - filterRed —— 字符：1
 * - filterGreen —— 字符：2
 * - filterBlue —— 字符：3
 *
 * glass-v
 * - through —— 字符：|
 * - filterRed —— 字符：4
 * - filterGreen —— 字符：5
 * - filterBlue —— 字符：6
 *
 * mirror-slash
 * - through —— 字符：/
 * - filterRed —— 字符：c
 * - filterGreen —— 字符：d
 * - filterBlue —— 字符：e
 *
 * mirror-backslash
 * - through —— 字符：\
 * - filterRed —— 字符：h
 * - filterGreen —— 字符：i
 * - filterBlue —— 字符：j
 *
 * splitter-t
 * - through —— 字符：T
 * - filterRed —— 字符：u
 * - filterGreen —— 字符：v
 * - filterBlue —— 字符：w
 *
 * splitter-cross
 * - through —— 字符：+
 * - filterRed —— 字符：x
 * - filterGreen —— 字符：y
 * - filterBlue —— 字符：z
 *
 * ── 传送门（不按上表四色扩写；`portal-*a` / `portal-*b` 成对，多组可多用不同字符对）──
 * - 端 A（portal-a）—— 字符：{
 * - 端 B（portal-b）—— 字符：}
 *
 */
export interface IOpticalLevelGridData {
    height: number;
    width: number;
    grid: readonly string[];
}

export type IOpticalLevelGridSource = IOpticalLevelGridData & {
    levelId: number;
    levelName: string;
};

/** 运行时关卡（terrain 行优先：i = y * width + x） */
export interface IOpticalLevelConfig {
    levelId: number;
    levelName: string;
    width: number;
    height: number;
    terrain: TerrainKind[];
    player: { x: number; y: number };
    pieces: IOpticalPiece[];
    sources: IOpticalLightSource[];
    targets: IOpticalTarget[];
}

/** 元件格：字符 → `PieceType` + `ColorMode`（与文件头注释表一致） */
const GRID_PIECE_CHAR: Readonly<
    Record<string, readonly [pieceType: PieceType, colorMode: ColorModeEnum]>
> = {
    o: [PieceType.Glass, ColorModeEnum.Through],
    r: [PieceType.Glass, ColorModeEnum.FilterRed],
    g: [PieceType.Glass, ColorModeEnum.FilterGreen],
    b: [PieceType.Glass, ColorModeEnum.FilterBlue],
    '-': [PieceType.GlassH, ColorModeEnum.Through],
    '1': [PieceType.GlassH, ColorModeEnum.FilterRed],
    '2': [PieceType.GlassH, ColorModeEnum.FilterGreen],
    '3': [PieceType.GlassH, ColorModeEnum.FilterBlue],
    '|': [PieceType.GlassV, ColorModeEnum.Through],
    '4': [PieceType.GlassV, ColorModeEnum.FilterRed],
    '5': [PieceType.GlassV, ColorModeEnum.FilterGreen],
    '6': [PieceType.GlassV, ColorModeEnum.FilterBlue],
    '/': [PieceType.MirrorSlash, ColorModeEnum.Through],
    c: [PieceType.MirrorSlash, ColorModeEnum.FilterRed],
    d: [PieceType.MirrorSlash, ColorModeEnum.FilterGreen],
    e: [PieceType.MirrorSlash, ColorModeEnum.FilterBlue],
    '\\': [PieceType.MirrorBackslash, ColorModeEnum.Through],
    h: [PieceType.MirrorBackslash, ColorModeEnum.FilterRed],
    i: [PieceType.MirrorBackslash, ColorModeEnum.FilterGreen],
    j: [PieceType.MirrorBackslash, ColorModeEnum.FilterBlue],
    T: [PieceType.SplitterT, ColorModeEnum.Through],
    u: [PieceType.SplitterT, ColorModeEnum.FilterRed],
    v: [PieceType.SplitterT, ColorModeEnum.FilterGreen],
    w: [PieceType.SplitterT, ColorModeEnum.FilterBlue],
    '+': [PieceType.SplitterCross, ColorModeEnum.Through],
    x: [PieceType.SplitterCross, ColorModeEnum.FilterRed],
    y: [PieceType.SplitterCross, ColorModeEnum.FilterGreen],
    z: [PieceType.SplitterCross, ColorModeEnum.FilterBlue],
};

export function parseGridToLevelConfig(src: IOpticalLevelGridSource): IOpticalLevelConfig {
    const { levelId, levelName, height, width, grid } = src;
    if (grid.length !== height) {
        throw new Error(`[parseGridToLevelConfig] id=${levelId}: grid 行数 ${grid.length} ≠ height ${height}`);
    }
    const terrain: TerrainKind[] = [];
    const sources: IOpticalLightSource[] = [];
    const targets: IOpticalTarget[] = [];
    const pieces: IOpticalPiece[] = [];
    let px = 0;
    let py = 0;
    let playerFound = false;
    const portalStack: number[] = [];
    let portalGroupSeq = 0;
    let pieceSeq = 0;

    const pushPiece = (
        pieceType: PieceType,
        colorMode: ColorModeEnum,
        x: number,
        y: number,
        portalGroup?: string,
    ): void => {
        terrain.push(TerrainKind.Floor);
        pieces.push({
            id: `piece_${levelId}_${pieceSeq++}`,
            type: pieceType,
            colorMode,
            x,
            y,
            portalGroup,
        });
    };

    for (let y = 0; y < height; y++) {
        const row = grid[y];
        if (row.length !== width) {
            throw new Error(`[parseGridToLevelConfig] id=${levelId}: 第 ${y} 行列数 ${row.length} ≠ width ${width}`);
        }
        for (let x = 0; x < width; x++) {
            const ch = row.charAt(x);
            switch (ch) {
                case '#':
                    terrain.push(TerrainKind.Wall);
                    break;
                case '.':
                case ' ':
                    terrain.push(TerrainKind.Floor);
                    break;
                case '@':
                    terrain.push(TerrainKind.Floor);
                    if (playerFound) {
                        throw new Error(`[parseGridToLevelConfig] id=${levelId}: 重复的 @`);
                    }
                    playerFound = true;
                    px = x;
                    py = y;
                    break;
                case 'S':
                    terrain.push(TerrainKind.Source);
                    sources.push({ x, y, direction: DirEnum.Down, colorKey: 'white' });
                    break;
                case 'E':
                    terrain.push(TerrainKind.Target);
                    targets.push({ x, y, colorKey: 'white' });
                    break;
                case 'R':
                    terrain.push(TerrainKind.Target);
                    targets.push({ x, y, colorKey: 'red' });
                    break;
                case 'G':
                    terrain.push(TerrainKind.Target);
                    targets.push({ x, y, colorKey: 'green' });
                    break;
                case 'B':
                    terrain.push(TerrainKind.Target);
                    targets.push({ x, y, colorKey: 'blue' });
                    break;
                case '{': {
                    const g = portalGroupSeq++;
                    portalStack.push(g);
                    pushPiece(PieceType.PortalA, ColorModeEnum.Through, x, y, String(g));
                    break;
                }
                case '}': {
                    if (portalStack.length === 0) {
                        throw new Error(`[parseGridToLevelConfig] id=${levelId}: 多余的 }（${x},${y}）`);
                    }
                    const g = portalStack.pop()!;
                    pushPiece(PieceType.PortalB, ColorModeEnum.Through, x, y, String(g));
                    break;
                }
                default: {
                    const spec = GRID_PIECE_CHAR[ch];
                    if (spec) {
                        const [pt, cm] = spec;
                        pushPiece(pt, cm, x, y);
                    } else {
                        throw new Error(
                            `[parseGridToLevelConfig] id=${levelId}: 未定义字符 '${ch}'（${x},${y}）`,
                        );
                    }
                }
            }
        }
    }

    if (!playerFound) {
        throw new Error(`[parseGridToLevelConfig] id=${levelId}: 缺少 @`);
    }
    if (portalStack.length > 0) {
        throw new Error(`[parseGridToLevelConfig] id=${levelId}: 未闭合的 { 传送门（缺 }）`);
    }

    return {
        levelId,
        levelName,
        width,
        height,
        terrain,
        player: { x: px, y: py },
        pieces,
        sources,
        targets,
    };
}

export const DEV_LEVEL_MINIMAL: IOpticalLevelConfig = parseGridToLevelConfig({
    levelId: 0,
    levelName: '开发最小',
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
});
