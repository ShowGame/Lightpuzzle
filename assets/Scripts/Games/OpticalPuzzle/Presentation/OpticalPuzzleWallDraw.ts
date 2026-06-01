import { Color, Graphics } from 'cc';
import type { OpticalBoardSnapshot } from '../Core/OpticalPuzzleTypes';
import { TerrainKind } from '../Core/OpticalPuzzleTypes';
import {
    OPTICAL_CELL_SIZE,
    WALL_ARM_FILL,
    WALL_ARM_THICK,
    WALL_BLOCK_PATCH_FILL,
    WALL_CORE_SIZE,
    WALL_CORNER_PATCH,
    WALL_DARK_FILL,
    WALL_LIGHT_FILL,
    WALL_OVERLAY_ARM,
    WALL_OVERLAY_CONNECT_PAD,
    WALL_OVERLAY_CONNECT_PAD_H,
    WALL_OVERLAY_FILL,
} from './OpticalPuzzleLayout';

export function cellScreenRect(
    ox: number,
    oy: number,
    x: number,
    y: number,
    cell: number = OPTICAL_CELL_SIZE,
): { left: number; bottom: number; size: number } {
    return {
        left: ox + x * cell,
        bottom: oy - (y + 1) * cell,
        size: cell,
    };
}

function isFloor(snapshot: OpticalBoardSnapshot, x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= snapshot.width || y >= snapshot.height) {
        return false;
    }
    return snapshot.terrain[y * snapshot.width + x] !== TerrainKind.Wall;
}

function isWall(snapshot: OpticalBoardSnapshot, x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= snapshot.width || y >= snapshot.height) {
        return false;
    }
    return snapshot.terrain[y * snapshot.width + x] === TerrainKind.Wall;
}

/** 外角圆角：两邻格均为地板（不判对角） */
function isWallCornerRound(
    snapshot: OpticalBoardSnapshot,
    gx: number,
    gy: number,
    corner: 'tl' | 'tr' | 'bl' | 'br',
): boolean {
    switch (corner) {
        case 'tl':
            return isFloor(snapshot, gx, gy - 1) && isFloor(snapshot, gx - 1, gy);
        case 'tr':
            return isFloor(snapshot, gx, gy - 1) && isFloor(snapshot, gx + 1, gy);
        case 'bl':
            return isFloor(snapshot, gx - 1, gy) && isFloor(snapshot, gx, gy + 1);
        case 'br':
            return isFloor(snapshot, gx + 1, gy) && isFloor(snapshot, gx, gy + 1);
    }
}

function isOutOfBounds(snapshot: OpticalBoardSnapshot, x: number, y: number): boolean {
    return x < 0 || y < 0 || x >= snapshot.width || y >= snapshot.height;
}

/** 外扩实际是否为 #226c8f（与 fillOutwardRect 规则唯一同步，角块只读此结果） */
function isOutwardExtDark(
    snapshot: OpticalBoardSnapshot,
    gx: number,
    gy: number,
    side: 'right' | 'bottom' | 'left' | 'top',
): boolean {
    switch (side) {
        case 'right':
            return isFloor(snapshot, gx + 1, gy);
        case 'bottom':
            return isFloor(snapshot, gx, gy + 1);
        case 'left':
        case 'top':
        default:
            return false;
    }
}

function fillRect(g: Graphics, color: Color, x: number, y: number, w: number, h: number): void {
    g.fillColor = color;
    g.rect(x, y, w, h);
    g.fill();
}

function fillTriangle(
    g: Graphics,
    color: Color,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    x3: number,
    y3: number,
): void {
    g.fillColor = color;
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.lineTo(x3, y3);
    g.close();
    g.fill();
}

/** 圆心 + 两径向边 + 弧段（折线近似，不依赖 arc 方向） */
function fillPieWedge(
    g: Graphics,
    cx: number,
    cy: number,
    r: number,
    startRad: number,
    endRad: number,
    color: Color,
    segments: number = 10,
): void {
    g.fillColor = color;
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(startRad) * r, cy + Math.sin(startRad) * r);
    for (let i = 1; i <= segments; i++) {
        const t = startRad + ((endRad - startRad) * i) / segments;
        g.lineTo(cx + Math.cos(t) * r, cy + Math.sin(t) * r);
    }
    g.close();
    g.fill();
}

/** 外角圆角补块：圆心在内角，仅画补块内可见的 90° 四分之一弧 */
function fillCornerQuarter(
    g: Graphics,
    cx: number,
    cy: number,
    r: number,
    corner: 'tl' | 'tr' | 'bl' | 'br',
    color: Color,
): void {
    switch (corner) {
        case 'tl':
            fillPieWedge(g, cx, cy, r, Math.PI / 2, Math.PI, color);
            break;
        case 'tr':
            fillPieWedge(g, cx, cy, r, 0, Math.PI / 2, color);
            break;
        case 'bl':
            fillPieWedge(g, cx, cy, r, Math.PI, (3 * Math.PI) / 2, color);
            break;
        case 'br':
            fillPieWedge(g, cx, cy, r, (3 * Math.PI) / 2, 2 * Math.PI, color);
            break;
    }
}

function fillCornerSquare(
    g: Graphics,
    left: number,
    bottom: number,
    right: number,
    top: number,
    p: number,
    corner: 'tl' | 'tr' | 'bl' | 'br',
    color: Color,
): void {
    switch (corner) {
        case 'tl':
            fillRect(g, color, left, top - p, p, p);
            break;
        case 'tr':
            fillRect(g, color, right - p, top - p, p, p);
            break;
        case 'bl':
            fillRect(g, color, left, bottom, p, p);
            break;
        case 'br':
            fillRect(g, color, right - p, bottom, p, p);
            break;
    }
}

/**
 * 仅一种 L 内凹地形（地板在 2×2 右下，墙占其余三格）：
 * 地板在 (fx,fy)，三墙分别为 (fx-1,fy-1)(fx,fy-1)(fx-1,fy)：
 *   ##        左上 (fx-1,fy-1) → BR 整块深色
 *   #.        右上 (fx,fy-1)   → BL 整块深色
 *             左下 (fx-1,fy)   → TR 整块深色
 * 其余拐角仍走原有外扩 / 分半规则。
 */
function isLConcaveFloor(snapshot: OpticalBoardSnapshot, fx: number, fy: number): boolean {
    return (
        isFloor(snapshot, fx, fy) &&
        isWall(snapshot, fx - 1, fy - 1) &&
        isWall(snapshot, fx, fy - 1) &&
        isWall(snapshot, fx - 1, fy)
    );
}

/**
 * ## / #. 内凹 L（地板在 2×2 右下）：按格坐标唯一映射补块，作强制补丁。
 * 不依赖外扩分半；在 fillWallCell 末尾覆盖绘制。
 */
function getLConcavePatchCorner(
    snapshot: OpticalBoardSnapshot,
    gx: number,
    gy: number,
): 'tl' | 'tr' | 'bl' | 'br' | null {
    if (isLConcaveFloor(snapshot, gx + 1, gy + 1)) {
        return 'br';
    }
    if (isLConcaveFloor(snapshot, gx, gy + 1)) {
        return 'bl';
    }
    if (isLConcaveFloor(snapshot, gx + 1, gy)) {
        return 'tr';
    }
    return null;
}

/** 内层 L 内凹强制补丁：整角 14×14 #226c8f（须在叠层之前绘制） */
export function applyLConcaveForcedPatch(
    g: Graphics,
    snapshot: OpticalBoardSnapshot,
    gx: number,
    gy: number,
    left: number,
    bottom: number,
    right: number,
    top: number,
    p: number,
): void {
    const corner = getLConcavePatchCorner(snapshot, gx, gy);
    if (!corner) {
        return;
    }
    fillCornerSquare(g, left, bottom, right, top, p, corner, WALL_DARK_FILL);
}

/** 右上角圆角：四分之一圆在 45° 处分两段（左下角的镜像） */
function fillTrRoundSplit(
    g: Graphics,
    cx: number,
    cy: number,
    r: number,
    upperColor: Color,
    lowerColor: Color,
): void {
    const a45 = Math.PI / 4;
    const a90 = Math.PI / 2;
    fillPieWedge(g, cx, cy, r, 0, a45, lowerColor);
    fillPieWedge(g, cx, cy, r, a45, a90, upperColor);
}

/** 左下角圆角：四分之一圆在 225° 处分两段（与方角三角对角线一致） */
function fillBlRoundSplit(
    g: Graphics,
    cx: number,
    cy: number,
    r: number,
    upperColor: Color,
    lowerColor: Color,
): void {
    const a180 = Math.PI;
    const a225 = (5 * Math.PI) / 4;
    const a270 = (3 * Math.PI) / 2;
    fillPieWedge(g, cx, cy, r, a225, a270, lowerColor);
    fillPieWedge(g, cx, cy, r, a180, a225, upperColor);
}

/** 外扩矩形：邻格为地板时按方向加深（仅右、下两向） */
function fillOutwardRect(
    g: Graphics,
    snapshot: OpticalBoardSnapshot,
    gx: number,
    gy: number,
    x: number,
    y: number,
    w: number,
    h: number,
    side: 'right' | 'bottom' | 'left' | 'top',
): void {
    const color = isOutwardExtDark(snapshot, gx, gy, side) ? WALL_DARK_FILL : WALL_ARM_FILL;
    fillRect(g, color, x, y, w, h);
}

/** 邻格墙的外扩色（非墙格无外扩，不参与角块着色） */
function wallOutwardExtDark(
    snapshot: OpticalBoardSnapshot,
    gx: number,
    gy: number,
    side: 'right' | 'bottom' | 'left' | 'top',
): boolean {
    if (!isWall(snapshot, gx, gy)) {
        return false;
    }
    return isOutwardExtDark(snapshot, gx, gy, side);
}

/**
 * 左下角补块：沿外角对角线（225°）拆成两半着色。
 * 圆角：可见四分之一弧 180°–270° 在 225° 处分段；方角：沿对角线切三角。
 * 上半：本色左扩或左邻墙下扩为深色；下半：本色下扩或下邻墙左扩为深色。
 */
function fillBottomLeftCorner(
    g: Graphics,
    snapshot: OpticalBoardSnapshot,
    gx: number,
    gy: number,
    left: number,
    bottom: number,
    right: number,
    top: number,
    cx: number,
    cy: number,
    p: number,
    blRound: boolean,
): void {
    const upperDark =
        isOutwardExtDark(snapshot, gx, gy, 'left') ||
        wallOutwardExtDark(snapshot, gx - 1, gy, 'bottom');
    const lowerDark =
        isOutwardExtDark(snapshot, gx, gy, 'bottom') ||
        wallOutwardExtDark(snapshot, gx, gy + 1, 'left');
    const upperColor = upperDark ? WALL_DARK_FILL : WALL_ARM_FILL;
    const lowerColor = lowerDark ? WALL_DARK_FILL : WALL_ARM_FILL;

    if (blRound) {
        fillBlRoundSplit(g, cx, cy, p, upperColor, lowerColor);
        return;
    }

    const outerX = left;
    const outerY = bottom;
    const innerX = left + p;
    const innerY = bottom + p;
    fillTriangle(g, upperColor, outerX, innerY, outerX, outerY, innerX, innerY);
    fillTriangle(g, lowerColor, outerX, outerY, innerX, outerY, innerX, innerY);
}

/**
 * 右上角补块：沿外角对角线（45°）拆成两半着色（左下角镜像）。
 * 圆角：可见四分之一弧 0°–90° 在 45° 处分段；方角：沿对角线切三角。
 * 上半：本色上扩或上邻墙右扩为深色；下半：本色右扩或右邻墙上扩为深色。
 */
function fillTopRightCorner(
    g: Graphics,
    snapshot: OpticalBoardSnapshot,
    gx: number,
    gy: number,
    left: number,
    bottom: number,
    right: number,
    top: number,
    cx: number,
    cy: number,
    p: number,
    trRound: boolean,
): void {
    const upperDark =
        isOutwardExtDark(snapshot, gx, gy, 'top') ||
        wallOutwardExtDark(snapshot, gx, gy - 1, 'right');
    const lowerDark =
        isOutwardExtDark(snapshot, gx, gy, 'right') ||
        wallOutwardExtDark(snapshot, gx + 1, gy, 'top');
    const upperColor = upperDark ? WALL_DARK_FILL : WALL_ARM_FILL;
    const lowerColor = lowerDark ? WALL_DARK_FILL : WALL_ARM_FILL;

    if (trRound) {
        fillTrRoundSplit(g, cx, cy, p, upperColor, lowerColor);
        return;
    }

    const outerX = right;
    const outerY = top;
    const innerX = right - p;
    const innerY = top - p;
    fillTriangle(g, upperColor, innerX, outerY, outerX, outerY, innerX, innerY);
    fillTriangle(g, lowerColor, outerX, outerY, outerX, innerY, innerX, innerY);
}

function fillOverlayCornerSquare(
    g: Graphics,
    coreX: number,
    coreY: number,
    arm: number,
    corner: 'tl' | 'tr' | 'bl' | 'br',
    color: Color,
): void {
    switch (corner) {
        case 'bl':
            fillRect(g, color, coreX - arm, coreY - arm, arm, arm);
            break;
        case 'br':
            fillRect(g, color, coreX + WALL_CORE_SIZE, coreY - arm, arm, arm);
            break;
        case 'tl':
            fillRect(g, color, coreX - arm, coreY + WALL_CORE_SIZE, arm, arm);
            break;
        case 'tr':
            fillRect(g, color, coreX + WALL_CORE_SIZE, coreY + WALL_CORE_SIZE, arm, arm);
            break;
    }
}

/**
 * 叠层：28×28 墙心 + 四向 4px 臂 + 四角 4×4 补块；邻墙连通时先上下、后左右补至格边界。
 */
function fillWallOverlayLayer(
    g: Graphics,
    snapshot: OpticalBoardSnapshot,
    gx: number,
    gy: number,
    left: number,
    bottom: number,
    size: number,
    inset: number,
): void {
    const arm = WALL_OVERLAY_ARM;
    const coreX = left + inset;
    const coreY = bottom + inset;

    fillRect(g, WALL_OVERLAY_FILL, coreX, coreY, WALL_CORE_SIZE, WALL_CORE_SIZE);

    fillRect(g, WALL_OVERLAY_FILL, coreX, coreY - arm, WALL_CORE_SIZE, arm);
    fillRect(g, WALL_OVERLAY_FILL, coreX, coreY + WALL_CORE_SIZE, WALL_CORE_SIZE, arm);
    fillRect(g, WALL_OVERLAY_FILL, coreX - arm, coreY, arm, WALL_CORE_SIZE);
    fillRect(g, WALL_OVERLAY_FILL, coreX + WALL_CORE_SIZE, coreY, arm, WALL_CORE_SIZE);

    const tlRound = isWallCornerRound(snapshot, gx, gy, 'tl');
    const blRound = isWallCornerRound(snapshot, gx, gy, 'bl');
    const trRound = isWallCornerRound(snapshot, gx, gy, 'tr');
    const brRound = isWallCornerRound(snapshot, gx, gy, 'br');

    const blCx = coreX;
    const blCy = coreY;
    const brCx = coreX + WALL_CORE_SIZE;
    const brCy = coreY;
    const tlCx = coreX;
    const tlCy = coreY + WALL_CORE_SIZE;
    const trCx = coreX + WALL_CORE_SIZE;
    const trCy = coreY + WALL_CORE_SIZE;

    if (tlRound) {
        fillCornerQuarter(g, tlCx, tlCy, arm, 'tl', WALL_OVERLAY_FILL);
    } else {
        fillOverlayCornerSquare(g, coreX, coreY, arm, 'tl', WALL_OVERLAY_FILL);
    }

    if (trRound) {
        fillCornerQuarter(g, trCx, trCy, arm, 'tr', WALL_OVERLAY_FILL);
    } else {
        fillOverlayCornerSquare(g, coreX, coreY, arm, 'tr', WALL_OVERLAY_FILL);
    }

    if (blRound) {
        fillCornerQuarter(g, blCx, blCy, arm, 'bl', WALL_OVERLAY_FILL);
    } else {
        fillOverlayCornerSquare(g, coreX, coreY, arm, 'bl', WALL_OVERLAY_FILL);
    }

    if (brRound) {
        fillCornerQuarter(g, brCx, brCy, arm, 'br', WALL_OVERLAY_FILL);
    } else {
        fillOverlayCornerSquare(g, coreX, coreY, arm, 'br', WALL_OVERLAY_FILL);
    }

    fillWallOverlayConnectExtensions(g, snapshot, gx, gy, left, bottom, size, inset);
}

/**
 * 2×2 墙块内角补丁（内层 14×14）：叠层之前用 #3093bc 补块内对角。
 * 本格为块左上 → 补 BR；块右上 → BL；块左下 → TR；块右下 → TL。
 */
function applyWallBlockInnerCornerPatch(
    g: Graphics,
    snapshot: OpticalBoardSnapshot,
    gx: number,
    gy: number,
    left: number,
    bottom: number,
    right: number,
    top: number,
    p: number,
): void {
    const wallAt = (dx: number, dy: number) => isWall(snapshot, gx + dx, gy + dy);

    if (wallAt(1, 0) && wallAt(0, 1) && wallAt(1, 1)) {
        fillCornerSquare(g, left, bottom, right, top, p, 'br', WALL_BLOCK_PATCH_FILL);
    }
    if (wallAt(-1, 0) && wallAt(0, 1) && wallAt(-1, 1)) {
        fillCornerSquare(g, left, bottom, right, top, p, 'bl', WALL_BLOCK_PATCH_FILL);
    }
    if (wallAt(1, 0) && wallAt(0, -1) && wallAt(1, -1)) {
        fillCornerSquare(g, left, bottom, right, top, p, 'tr', WALL_BLOCK_PATCH_FILL);
    }
    if (wallAt(-1, 0) && wallAt(0, -1) && wallAt(-1, -1)) {
        fillCornerSquare(g, left, bottom, right, top, p, 'tl', WALL_BLOCK_PATCH_FILL);
    }
}

/**
 * 叠层连通扩展：先上下、后左右。
 * 邻格为墙 → 沿十字臂带宽补缝；越界 → 整侧 inset 带补满。
 */
function fillWallOverlayConnectExtensions(
    g: Graphics,
    snapshot: OpticalBoardSnapshot,
    gx: number,
    gy: number,
    left: number,
    bottom: number,
    size: number,
    inset: number,
): void {
    const arm = WALL_OVERLAY_ARM;
    const padV = WALL_OVERLAY_CONNECT_PAD;
    const padH = WALL_OVERLAY_CONNECT_PAD_H;
    const gapV = inset - arm + padV;
    const gapH = inset - arm + padV;
    const coreX = left + inset;
    const coreY = bottom + inset;
    const top = bottom + size;
    const right = left + size;
    const crossSpan = WALL_CORE_SIZE + arm * 2;

    if (isOutOfBounds(snapshot, gx, gy + 1)) {
        fillRect(g, WALL_OVERLAY_FILL, left, bottom, size, inset);
    } else if (isWall(snapshot, gx, gy + 1)) {
        fillRect(g, WALL_OVERLAY_FILL, coreX - arm, bottom, crossSpan, gapV);
    }

    if (isOutOfBounds(snapshot, gx, gy - 1)) {
        fillRect(g, WALL_OVERLAY_FILL, left, top - inset, size, inset);
    } else if (isWall(snapshot, gx, gy - 1)) {
        fillRect(
            g,
            WALL_OVERLAY_FILL,
            coreX - arm,
            coreY + WALL_CORE_SIZE + arm - padV,
            crossSpan,
            gapV,
        );
    }

    if (isOutOfBounds(snapshot, gx - 1, gy)) {
        fillRect(g, WALL_OVERLAY_FILL, left, bottom, inset, size);
    } else if (isWall(snapshot, gx - 1, gy)) {
        fillRect(g, WALL_OVERLAY_FILL, left - padH, coreY - arm, gapH + padH, crossSpan);
    }

    if (isOutOfBounds(snapshot, gx + 1, gy)) {
        fillRect(g, WALL_OVERLAY_FILL, right - inset, bottom, inset, size);
    } else if (isWall(snapshot, gx + 1, gy)) {
        fillRect(g, WALL_OVERLAY_FILL, right - gapH, coreY - arm, gapH + padH, crossSpan);
    }
}

/**
 * 墙格：内层 28×28 + 臂 14 + 角补；叠层 #3093bc 墙心 + 臂 4 + 角补 4×4。
 */
export function fillWallCell(
    g: Graphics,
    snapshot: OpticalBoardSnapshot,
    gx: number,
    gy: number,
    left: number,
    bottom: number,
    size: number = OPTICAL_CELL_SIZE,
): void {
    const inset = (size - WALL_CORE_SIZE) * 0.5;
    const top = bottom + size;
    const right = left + size;
    const p = WALL_CORNER_PATCH;
    const tlCx = left + inset;
    const tlCy = top - inset;
    const trCx = right - inset;
    const trCy = top - inset;
    const blCx = left + inset;
    const blCy = bottom + inset;
    const brCx = right - inset;
    const brCy = bottom + inset;

    fillRect(g, WALL_LIGHT_FILL, left + inset, bottom + inset, WALL_CORE_SIZE, WALL_CORE_SIZE);

    fillOutwardRect(g, snapshot, gx, gy, left + inset, bottom, WALL_CORE_SIZE, WALL_ARM_THICK, 'bottom');
    fillOutwardRect(g, snapshot, gx, gy, left + inset, top - WALL_ARM_THICK, WALL_CORE_SIZE, WALL_ARM_THICK, 'top');
    fillOutwardRect(g, snapshot, gx, gy, left, bottom + inset, WALL_ARM_THICK, WALL_CORE_SIZE, 'left');
    fillOutwardRect(g, snapshot, gx, gy, right - WALL_ARM_THICK, bottom + inset, WALL_ARM_THICK, WALL_CORE_SIZE, 'right');

    const tlRound = isWallCornerRound(snapshot, gx, gy, 'tl');
    const blRound = isWallCornerRound(snapshot, gx, gy, 'bl');
    const trRound = isWallCornerRound(snapshot, gx, gy, 'tr');
    const brRound = isWallCornerRound(snapshot, gx, gy, 'br');

    if (tlRound) {
        fillCornerQuarter(g, tlCx, tlCy, p, 'tl', WALL_ARM_FILL);
    } else {
        fillCornerSquare(g, left, bottom, right, top, p, 'tl', WALL_ARM_FILL);
    }

    fillTopRightCorner(g, snapshot, gx, gy, left, bottom, right, top, trCx, trCy, p, trRound);

    fillBottomLeftCorner(g, snapshot, gx, gy, left, bottom, right, top, blCx, blCy, p, blRound);

    const brColor =
        isOutwardExtDark(snapshot, gx, gy, 'right') || isOutwardExtDark(snapshot, gx, gy, 'bottom')
            ? WALL_DARK_FILL
            : WALL_ARM_FILL;
    if (brRound) {
        fillCornerQuarter(g, brCx, brCy, p, 'br', brColor);
    } else {
        fillCornerSquare(g, left, bottom, right, top, p, 'br', brColor);
    }

    // 内层 L 内凹补丁（叠层之前）
    applyLConcaveForcedPatch(g, snapshot, gx, gy, left, bottom, right, top, p);

    applyWallBlockInnerCornerPatch(g, snapshot, gx, gy, left, bottom, right, top, p);

    fillWallOverlayLayer(g, snapshot, gx, gy, left, bottom, size, inset);
}