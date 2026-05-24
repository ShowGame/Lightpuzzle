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
 * 关卡源数据：四张同尺寸二维字符表（`[y][x]` 单字符），解析见 `parseLayeredGridsToLevelConfig`。
 *
 * ── 层 1 `staticLayout`（静态地形，局内不可推动）──
 * - `#` 墙 / 石块（统一挡光、不可进入，不再单独区分 stone）
 * - `.` 或空格 可走地板
 *
 * ── 层 2 `objects`（玩家、光源、目标、可推动光学元件）──
 * - `#` `.` 与层 1 对齐（墙格写 `#`，空地写 `.`）
 * - `@` 玩家出生（全关唯一）
 * - `S` 光源（颜色见层 3，朝向见层 4）
 * - `E` 目标（期望颜色见层 3，层 4 一般为 `.`）
 * - 元件类型（每格仅几何类型，颜色在层 3）：`o` glass，`-` glass-h，`|` glass-v，
 *   `/` mirror-slash，`\\` mirror-backslash，`T` splitter-t，`+` splitter-cross，
 *   `{` portal-a，`}` portal-b
 *
 * ── 层 3 `colors`（光色 RGBW，仅标注有物件的格子）──
 * - `#` 墙；无物件的地板 / 玩家格为 `.`（不要整图铺 `W`）
 * - 层 2 为 `S` / `E` / 光学元件时写 `W`/`R`/`G`/`B`；该格写 `.` 表示默认 `W`
 * - 关卡数据须四层齐全；`overlayLayersFromObjects` 仅作编辑辅助，不替代正式配置
 *
 * ── 层 4 `directions`（朝向，仅标注需要朝向的物件）──
 * - `#` 墙；无物件 / 玩家 / 目标为 `.`
 * - `S`、定向元件等写 `w` `a` `s` `d`；未写 `.` 时解析默认（如光源朝下）
 */
export interface IOpticalLevelLayeredData {
    height: number;
    width: number;
    staticLayout: readonly string[];
    objects: readonly string[];
    colors: readonly string[];
    directions: readonly string[];
}

export type IOpticalLevelLayeredSource = IOpticalLevelLayeredData & {
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

/** 层 2：几何类型 → PieceType（颜色由层 3 决定） */
const OBJECT_PIECE_CHAR: Readonly<Record<string, PieceType>> = {
    o: PieceType.Glass,
    '-': PieceType.GlassH,
    '|': PieceType.GlassV,
    '/': PieceType.MirrorSlash,
    '\\': PieceType.MirrorBackslash,
    T: PieceType.SplitterT,
    '+': PieceType.SplitterCross,
};

const DIR_CHAR: Readonly<Record<string, DirEnum>> = {
    d: DirEnum.Right,
    w: DirEnum.Up,
    a: DirEnum.Left,
    s: DirEnum.Down,
};

/** 层 3 光色字符（RGBW；`W` 为默认白光） */
export type Layer3ColorChar = 'W' | 'R' | 'G' | 'B';

/**
 * 由静态层生成层 3/4 全占位（墙 `#`，其余 `.`）。仅适合无 objects 信息时；有关卡物件请用 `overlayLayersFromObjects`。
 */
export function blankOverlayLayersFromStatic(staticLayout: readonly string[]): {
    colors: string[];
    directions: string[];
} {
    const pad = staticLayout.map((row) =>
        row
            .split('')
            .map((ch) => (ch === '#' ? '#' : '.'))
            .join(''),
    );
    return { colors: pad, directions: pad.map((row) => row) };
}

/** 层 4 需要写明或默认解析朝向的物件 */
function objectUsesDirection(obj: string): boolean {
    if (obj === 'S') {
        return true;
    }
    return obj === '-' || obj === '|' || obj === 'T' || obj === '+';
}

/**
 * 将 `staticLayout` 中 `#` 的格同步到另一层（层 3/4 须与静态墙对齐，否则解析报错）。
 */
export function applyStaticWallsToLayer(
    staticLayout: readonly string[],
    layer: readonly string[],
): string[] {
    return staticLayout.map((stRow, y) => {
        const row = layer[y] ?? '';
        let out = '';
        for (let x = 0; x < stRow.length; x++) {
            out += stRow.charAt(x) === '#' ? '#' : row.charAt(x) || '.';
        }
        return out;
    });
}

/**
 * 按层 2 `objects` 生成稀疏的层 3/4 草稿；**须再** `applyStaticWallsToLayer` 对齐内部墙 `#`。
 */
export function overlayLayersFromObjects(objects: readonly string[]): {
    colors: string[];
    directions: string[];
} {
    const colors: string[] = [];
    const directions: string[] = [];
    for (const row of objects) {
        let c = '';
        let d = '';
        for (const obj of row) {
            if (obj === '#') {
                c += '#';
                d += '#';
            } else if (obj === 'S' || obj === 'E' || OBJECT_PIECE_CHAR[obj]) {
                c += 'W';
                if (obj === 'S') {
                    d += 's';
                } else if (objectUsesDirection(obj)) {
                    d += 's';
                } else {
                    d += '.';
                }
            } else {
                c += '.';
                d += '.';
            }
        }
        colors.push(c);
        directions.push(d);
    }
    return { colors, directions };
}

function assertLayer3Padding(
    ch: string,
    levelId: number,
    x: number,
    y: number,
    label: string,
): void {
    if (!isEmptyChar(ch)) {
        throw new Error(
            `[parseLayeredGrids] id=${levelId}: ${label}（${x},${y}）层3 应为 .，当前 '${ch}'`,
        );
    }
}

/** 解析层 3 光色（仅用于 S / E / 光学元件）；`.` 表示默认 `W` */
function resolveLayer3Color(
    ch: string,
    levelId: number,
    x: number,
    y: number,
): Layer3ColorChar {
    const upper = ch === 'w' ? 'W' : ch;
    if (isEmptyChar(ch) || upper === 'W') {
        return 'W';
    }
    if (upper === 'R' || upper === 'G' || upper === 'B') {
        return upper;
    }
    throw new Error(
        `[parseLayeredGrids] id=${levelId}: 层3（${x},${y}）须为 W/R/G/B 或 .，当前 '${ch}'`,
    );
}

function layer3ToColorMode(c: Layer3ColorChar): ColorModeEnum {
    switch (c) {
        case 'W':
            return ColorModeEnum.Through;
        case 'R':
            return ColorModeEnum.FilterRed;
        case 'G':
            return ColorModeEnum.FilterGreen;
        case 'B':
            return ColorModeEnum.FilterBlue;
    }
}

function layer3ToColorKey(c: Layer3ColorChar): string {
    switch (c) {
        case 'W':
            return 'white';
        case 'R':
            return 'red';
        case 'G':
            return 'green';
        case 'B':
            return 'blue';
    }
}

function parseColorCell(ch: string, levelId: number, x: number, y: number): ColorModeEnum {
    return layer3ToColorMode(resolveLayer3Color(ch, levelId, x, y));
}

function parseColorKey(ch: string, levelId: number, x: number, y: number): string {
    return layer3ToColorKey(resolveLayer3Color(ch, levelId, x, y));
}

function parseDirectionCell(
    ch: string,
    levelId: number,
    x: number,
    y: number,
    defaultDir: DirEnum,
): DirEnum {
    if (ch === '.' || ch === ' ') {
        return defaultDir;
    }
    const dir = DIR_CHAR[ch];
    if (dir === undefined) {
        throw new Error(
            `[parseLayeredGrids] id=${levelId}: 层4 非法方向 '${ch}'（${x},${y}），应为 wasd 或 .`,
        );
    }
    return dir;
}

function assertLayerGrid(
    name: string,
    rows: readonly string[],
    levelId: number,
    height: number,
    width: number,
): void {
    if (rows.length !== height) {
        throw new Error(`[parseLayeredGrids] id=${levelId}: ${name} 行数 ${rows.length} ≠ height ${height}`);
    }
    for (let y = 0; y < height; y++) {
        if (rows[y].length !== width) {
            throw new Error(
                `[parseLayeredGrids] id=${levelId}: ${name} 第 ${y} 行列数 ${rows[y].length} ≠ width ${width}`,
            );
        }
    }
}

function isWallChar(ch: string): boolean {
    return ch === '#';
}

function isEmptyChar(ch: string): boolean {
    return ch === '.' || ch === ' ';
}

export function parseLayeredGridsToLevelConfig(src: IOpticalLevelLayeredSource): IOpticalLevelConfig {
    const { levelId, levelName, height, width, staticLayout, objects, colors, directions } = src;

    assertLayerGrid('staticLayout', staticLayout, levelId, height, width);
    assertLayerGrid('objects', objects, levelId, height, width);
    assertLayerGrid('colors', colors, levelId, height, width);
    assertLayerGrid('directions', directions, levelId, height, width);

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
        for (let x = 0; x < width; x++) {
            const st = staticLayout[y].charAt(x);
            const obj = objects[y].charAt(x);
            const col = colors[y].charAt(x);
            const dir = directions[y].charAt(x);

            if (isWallChar(st)) {
                if (!isWallChar(obj) || !isWallChar(col) || !isWallChar(dir)) {
                    throw new Error(
                        `[parseLayeredGrids] id=${levelId}: 静态墙（${x},${y}）在 static/objects/colors/directions 四层须均为 #`,
                    );
                }
                terrain.push(TerrainKind.Wall);
                continue;
            }

            if (!isEmptyChar(st)) {
                throw new Error(
                    `[parseLayeredGrids] id=${levelId}: 层1 未定义字符 '${st}'（${x},${y}）`,
                );
            }

            if (isWallChar(obj)) {
                throw new Error(
                    `[parseLayeredGrids] id=${levelId}: 层1 为地板但层2 为墙（${x},${y}）`,
                );
            }
            if (isWallChar(col) || isWallChar(dir)) {
                throw new Error(
                    `[parseLayeredGrids] id=${levelId}: 层3/4 地板格（${x},${y}）不应为 #`,
                );
            }

            switch (obj) {
                case '.':
                case ' ':
                    terrain.push(TerrainKind.Floor);
                    assertLayer3Padding(col, levelId, x, y, '空地');
                    if (!isEmptyChar(dir)) {
                        throw new Error(
                            `[parseLayeredGrids] id=${levelId}: 空地（${x},${y}）层4 应为 .`,
                        );
                    }
                    break;
                case '@':
                    terrain.push(TerrainKind.Floor);
                    if (playerFound) {
                        throw new Error(`[parseLayeredGrids] id=${levelId}: 重复的 @`);
                    }
                    playerFound = true;
                    px = x;
                    py = y;
                    assertLayer3Padding(col, levelId, x, y, '玩家');
                    if (!isEmptyChar(dir)) {
                        throw new Error(
                            `[parseLayeredGrids] id=${levelId}: 玩家格（${x},${y}）层4 应为 .`,
                        );
                    }
                    break;
                case 'S':
                    terrain.push(TerrainKind.Source);
                    sources.push({
                        x,
                        y,
                        direction: parseDirectionCell(dir, levelId, x, y, DirEnum.Down),
                        colorKey: parseColorKey(col, levelId, x, y),
                    });
                    break;
                case 'E':
                    terrain.push(TerrainKind.Target);
                    targets.push({
                        x,
                        y,
                        colorKey: parseColorKey(col, levelId, x, y),
                    });
                    if (!isEmptyChar(dir)) {
                        throw new Error(
                            `[parseLayeredGrids] id=${levelId}: 目标格（${x},${y}）层4 应为 .`,
                        );
                    }
                    break;
                case '{': {
                    const g = portalGroupSeq++;
                    portalStack.push(g);
                    pushPiece(
                        PieceType.PortalA,
                        parseColorCell(col, levelId, x, y),
                        x,
                        y,
                        String(g),
                    );
                    parseDirectionCell(dir, levelId, x, y, DirEnum.Down);
                    break;
                }
                case '}': {
                    if (portalStack.length === 0) {
                        throw new Error(`[parseLayeredGrids] id=${levelId}: 多余的 }（${x},${y}）`);
                    }
                    const g = portalStack.pop()!;
                    pushPiece(
                        PieceType.PortalB,
                        parseColorCell(col, levelId, x, y),
                        x,
                        y,
                        String(g),
                    );
                    parseDirectionCell(dir, levelId, x, y, DirEnum.Down);
                    break;
                }
                default: {
                    const pieceType = OBJECT_PIECE_CHAR[obj];
                    if (pieceType) {
                        pushPiece(
                            pieceType,
                            parseColorCell(col, levelId, x, y),
                            x,
                            y,
                        );
                        parseDirectionCell(dir, levelId, x, y, DirEnum.Down);
                        break;
                    }
                    throw new Error(
                        `[parseLayeredGrids] id=${levelId}: 层2 未定义字符 '${obj}'（${x},${y}）`,
                    );
                }
            }
        }
    }

    if (!playerFound) {
        throw new Error(`[parseLayeredGrids] id=${levelId}: 缺少 @`);
    }
    if (portalStack.length > 0) {
        throw new Error(`[parseLayeredGrids] id=${levelId}: 未闭合的 { 传送门（缺 }）`);
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

const DEV_STATIC = [
    '#######',
    '#.....#',
    '#.....#',
    '#.....#',
    '#.....#',
    '#.....#',
    '#######',
];

const DEV_OBJECTS = [
    '#######',
    '#.....#',
    '#.....#',
    '#..@..#',
    '#.....#',
    '#.....#',
    '#######',
];

const { colors: DEV_COLORS, directions: DEV_DIRECTIONS } =
    overlayLayersFromObjects(DEV_OBJECTS);

export const DEV_LEVEL_MINIMAL: IOpticalLevelConfig = parseLayeredGridsToLevelConfig({
    levelId: 0,
    levelName: '开发最小',
    height: 7,
    width: 7,
    staticLayout: DEV_STATIC,
    objects: DEV_OBJECTS,
    colors: DEV_COLORS,
    directions: DEV_DIRECTIONS,
});
