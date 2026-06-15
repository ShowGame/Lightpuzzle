import { Color, Graphics } from 'cc';
import { Direction } from '../Core/OpticalPuzzleTypes';
import { fillBeamCrossSection } from './OpticalPuzzleBeamGradient';
import { OPTICAL_CELL_SIZE } from './OpticalPuzzleLayout';
import { sourceEmitterColors, sourceFillColor } from './OpticalPuzzleColorUtil';

/** 发射器外轮廓圆角（设计像素，随格宽等比缩放） */
const EMITTER_CORNER_RADIUS = 4;
/** 六边形框路径半宽（viewBox 1024，iconR=10） */
const SOURCE_HEX_FRAME_HALF_W = 7.646;
type SvgSeg =
    | { t: 'M'; x: number; y: number }
    | { t: 'L'; x: number; y: number }
    | { t: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
    | { t: 'Z' };

/** 发射器四角框：用户 SVG 外六边形 + 内孔（iconR=10） */
const SOURCE_HEX_FRAME_FILL_SEGS: ReadonlyArray<SvgSeg> = [
    { t: 'M', x: 0, y: -8.738 },
    { t: 'C', x1: -0.102, y1: -8.738, x2: -0.203, y2: -8.713, x: -0.293, y: -8.66 },
    { t: 'L', x: -7.354, y: -4.584 },
    { t: 'C', x1: -7.535, y1: -4.479, x2: -7.646, y2: -4.285, x: -7.646, y: -4.076 },
    { t: 'L', x: -7.646, y: 4.076 },
    { t: 'C', x1: -7.646, y1: 4.285, x2: -7.535, y2: 4.479, x: -7.354, y: 4.584 },
    { t: 'L', x: -0.293, y: 8.66 },
    { t: 'C', x1: -0.111, y1: 8.766, x2: 0.111, y2: 8.766, x: 0.293, y: 8.66 },
    { t: 'L', x: 7.354, y: 4.584 },
    { t: 'C', x1: 7.535, y1: 4.479, x2: 7.646, y2: 4.285, x: 7.646, y: 4.076 },
    { t: 'L', x: 7.646, y: -4.076 },
    { t: 'C', x1: 7.646, y1: -4.285, x2: 7.535, y2: -4.479, x: 7.354, y: -4.584 },
    { t: 'L', x: 0.293, y: -8.66 },
    { t: 'C', x1: 0.203, y1: -8.713, x2: 0.102, y2: -8.738, x: 0, y: -8.738 },
    { t: 'Z' },
    { t: 'M', x: -6.475, y: -3.738 },
    { t: 'L', x: 0, y: -7.477 },
    { t: 'L', x: 6.475, y: -3.738 },
    { t: 'L', x: 6.475, y: 3.738 },
    { t: 'L', x: 0, y: 7.477 },
    { t: 'L', x: -6.475, y: 3.738 },
    { t: 'L', x: -6.475, y: -3.738 },
    { t: 'Z' },
];

/** 仅外轮廓描边，内孔只参与填充 */
const SOURCE_HEX_FRAME_STROKE_SEGS: ReadonlyArray<SvgSeg> = SOURCE_HEX_FRAME_FILL_SEGS.slice(0, 16);
/** 内六边形（挖孔） */
const SOURCE_HEX_FRAME_INNER_SEGS: ReadonlyArray<SvgSeg> = SOURCE_HEX_FRAME_FILL_SEGS.slice(16);

const SCREEN_DIR_DX: ReadonlyArray<number> = [1, 0, -1, 0];
const SCREEN_DIR_DY: ReadonlyArray<number> = [0, 1, 0, -1];

type LocalPoint = { lx: number; ly: number };

function emitLocalToWorld(
    cx: number,
    cy: number,
    lx: number,
    ly: number,
    dx: number,
    dy: number,
    px: number,
    py: number,
): { x: number; y: number } {
    return {
        x: cx + lx * px + ly * dx,
        y: cy + lx * py + ly * dy,
    };
}

function fillLocalPoly(
    g: Graphics,
    cx: number,
    cy: number,
    dx: number,
    dy: number,
    px: number,
    py: number,
    points: readonly LocalPoint[],
    color: Color,
): void {
    if (points.length < 3) {
        return;
    }
    const first = emitLocalToWorld(cx, cy, points[0].lx, points[0].ly, dx, dy, px, py);
    g.fillColor = color;
    g.moveTo(first.x, first.y);
    for (let i = 1; i < points.length; i++) {
        const p = emitLocalToWorld(cx, cy, points[i].lx, points[i].ly, dx, dy, px, py);
        g.lineTo(p.x, p.y);
    }
    g.close();
    g.fill();
}

function strokeLocalPoly(
    g: Graphics,
    cx: number,
    cy: number,
    dx: number,
    dy: number,
    px: number,
    py: number,
    points: readonly LocalPoint[],
    color: Color,
    lineWidth: number,
): void {
    if (points.length < 2) {
        return;
    }
    const first = emitLocalToWorld(cx, cy, points[0].lx, points[0].ly, dx, dy, px, py);
    g.strokeColor = color;
    g.lineWidth = lineWidth;
    g.moveTo(first.x, first.y);
    for (let i = 1; i < points.length; i++) {
        const p = emitLocalToWorld(cx, cy, points[i].lx, points[i].ly, dx, dy, px, py);
        g.lineTo(p.x, p.y);
    }
    g.close();
    g.stroke();
}

function traceScreenSegs(
    g: Graphics,
    segs: ReadonlyArray<SvgSeg>,
    cx: number,
    cy: number,
    scale: number,
): void {
    for (const seg of segs) {
        switch (seg.t) {
            case 'M':
                g.moveTo(cx + seg.x * scale, cy + seg.y * scale);
                break;
            case 'L':
                g.lineTo(cx + seg.x * scale, cy + seg.y * scale);
                break;
            case 'C':
                g.bezierCurveTo(
                    cx + seg.x1 * scale,
                    cy + seg.y1 * scale,
                    cx + seg.x2 * scale,
                    cy + seg.y2 * scale,
                    cx + seg.x * scale,
                    cy + seg.y * scale,
                );
                break;
            case 'Z':
                g.close();
                break;
            default:
                break;
        }
    }
}

/** 格心对称六边形框：外环填充 + 内孔 */
function fillSourceHexFrame(
    g: Graphics,
    cx: number,
    cy: number,
    size: number,
    halfW: number,
    fillColor: Color,
    holeColor: Color,
): void {
    const frameHalf = halfW + size * 0.12;
    const scale = frameHalf / SOURCE_HEX_FRAME_HALF_W;
    g.fillColor = fillColor;
    traceScreenSegs(g, SOURCE_HEX_FRAME_STROKE_SEGS, cx, cy, scale);
    g.fill();
    g.fillColor = holeColor;
    traceScreenSegs(g, SOURCE_HEX_FRAME_INNER_SEGS, cx, cy, scale);
    g.fill();
}

/** 六边形外轮廓描边 */
function strokeSourceHexFrame(
    g: Graphics,
    cx: number,
    cy: number,
    size: number,
    halfW: number,
    strokeColor: Color,
    lineWidth: number,
): void {
    const frameHalf = halfW + size * 0.12;
    const scale = frameHalf / SOURCE_HEX_FRAME_HALF_W;
    g.strokeColor = strokeColor;
    g.lineWidth = lineWidth;
    g.lineJoin = Graphics.LineJoin.ROUND;
    g.lineCap = Graphics.LineCap.ROUND;
    traceScreenSegs(g, SOURCE_HEX_FRAME_STROKE_SEGS, cx, cy, scale);
    g.stroke();
}

/** 六边形框四角指示点（本色调实心圆，同 Target 四角小圆） */
function drawSourceCornerDots(
    g: Graphics,
    cx: number,
    cy: number,
    size: number,
    halfW: number,
    fillColor: Color,
): void {
    const corner = halfW + size * 0.12;
    const dotR = size * 0.035;
    const corners = [
        { x: -corner, y: -corner },
        { x: corner, y: -corner },
        { x: corner, y: corner },
        { x: -corner, y: corner },
    ];
    g.fillColor = fillColor;
    for (const c of corners) {
        g.circle(cx + c.x, cy + c.y, dotR);
        g.fill();
    }
}

function scaledCornerRadius(size: number): number {
    return EMITTER_CORNER_RADIUS * (size / OPTICAL_CELL_SIZE);
}

/** 局部坐标系圆角矩形（lx 横向，ly 沿发射方向） */
function buildLocalRoundRectOutline(
    halfW: number,
    minLy: number,
    maxLy: number,
    radius: number,
    segsPerCorner = 5,
): LocalPoint[] {
    const r = Math.min(radius, halfW - 0.5, (maxLy - minLy) * 0.5 - 0.5);
    if (r <= 0.5) {
        return [
            { lx: -halfW, ly: minLy },
            { lx: halfW, ly: minLy },
            { lx: halfW, ly: maxLy },
            { lx: -halfW, ly: maxLy },
        ];
    }
    const pts: LocalPoint[] = [];
    const pushArc = (cx: number, cy: number, a0: number, a1: number): void => {
        for (let i = 1; i <= segsPerCorner; i++) {
            const a = a0 + ((a1 - a0) * i) / segsPerCorner;
            pts.push({ lx: cx + Math.cos(a) * r, ly: cy + Math.sin(a) * r });
        }
    };

    pts.push({ lx: -halfW + r, ly: minLy });
    pts.push({ lx: halfW - r, ly: minLy });
    pushArc(halfW - r, minLy + r, -Math.PI / 2, 0);
    pts.push({ lx: halfW, ly: maxLy - r });
    pushArc(halfW - r, maxLy - r, 0, Math.PI / 2);
    pts.push({ lx: -halfW + r, ly: maxLy });
    pushArc(-halfW + r, maxLy - r, Math.PI / 2, Math.PI);
    pts.push({ lx: -halfW, ly: minLy + r });
    pushArc(-halfW + r, minLy + r, Math.PI, (Math.PI * 3) / 2);
    return pts;
}

/**
 * 激光发射器：圆角金属机身 + 定向炮筒；炮口对齐格边。
 */
export function drawSourceEmitter(
    g: Graphics,
    left: number,
    bottom: number,
    size: number,
    colorKey: string | undefined,
    direction: Direction,
): void {
    const cx = left + size * 0.5;
    const cy = bottom + size * 0.5;
    const dx = SCREEN_DIR_DX[direction];
    const dy = SCREEN_DIR_DY[direction];
    const px = -dy;
    const py = dx;

    const colors = sourceEmitterColors(colorKey);
    const half = size * 0.5;
    /** 炮口略伸出格边，与光路衔接更自然 */
    const muzzleLy = half + size * 0.045;

    const cornerR = scaledCornerRadius(size);

    g.fillColor = new Color(8, 12, 20, 255);
    g.roundRect(left, bottom, size, size, cornerR);
    g.fill();

    /** 机身半宽（lx 横向，垂直于炮口方向）；整宽 = halfW × 2 */
    const halfW = size * 0.24;
    const hexFill = new Color(
        Math.floor(colors.accent.r * 0.55),
        Math.floor(colors.accent.g * 0.55),
        Math.floor(colors.accent.b * 0.55),
        200,
    );
    const hexLineW = Math.max(2.2, size * 0.05);

    // 格心对称六边形框（用户 SVG，先铺底再画机身）
    fillSourceHexFrame(g, cx, cy, size, halfW, hexFill, new Color(8, 12, 20, 255));

    // 光点锚点（不随机身/梯形调整而移动）
    const bodyCx = cx - dx * size * 0.05;
    const bodyCy = cy - dy * size * 0.05;
    /** 机身后缘 / 前缘（ly 沿发射方向，backY 为负=炮口反侧） */
    const backY = -size * 0.26;
    const frontY = size * 0.04;
    const lw = Math.max(1.5, size * 0.024);

    // 仅机身前移；梯形窄端固定、宽端跟随机身 → 梯形长度缩短
    const chassisForward = size * 0.075;
    const emitCx = bodyCx + dx * chassisForward;
    const emitCy = bodyCy + dy * chassisForward;
    const barrelFrontY = muzzleLy - size * 0.018;
    const barrelBackY = chassisForward + frontY;

    const chassis = buildLocalRoundRectOutline(halfW, backY, frontY, cornerR);
    fillLocalPoly(g, emitCx, emitCy, dx, dy, px, py, chassis, colors.chassis);
    strokeLocalPoly(g, emitCx, emitCy, dx, dy, px, py, chassis, colors.chassisEdge, lw);

    const innerHalfW = halfW - size * 0.045;
    const innerBackY = backY + size * 0.025;
    const innerFrontY = frontY - size * 0.01;
    const innerR = Math.max(1, cornerR - size * 0.012);
    const innerChassis = buildLocalRoundRectOutline(innerHalfW, innerBackY, innerFrontY, innerR);
    fillLocalPoly(
        g,
        emitCx,
        emitCy,
        dx,
        dy,
        px,
        py,
        innerChassis,
        new Color(
            Math.floor(colors.chassis.r * 0.85 + 8),
            Math.floor(colors.chassis.g * 0.85 + 10),
            Math.floor(colors.chassis.b * 0.85 + 14),
            255,
        ),
    );

    strokeSourceHexFrame(g, cx, cy, size, halfW, colors.accent, hexLineW);

    drawSourceCornerDots(g, cx, cy, size, halfW, sourceFillColor(colorKey));

    const railLen = size * 0.14;
    for (const side of [-1, 1]) {
        const lx = side * (halfW - size * 0.07);
        const r0 = emitLocalToWorld(emitCx, emitCy, lx, backY + size * 0.07, dx, dy, px, py);
        const r1 = emitLocalToWorld(emitCx, emitCy, lx, backY + size * 0.07 + railLen, dx, dy, px, py);
        g.strokeColor = colors.chassisEdge;
        g.lineWidth = Math.max(1, size * 0.016);
        g.moveTo(r0.x, r0.y);
        g.lineTo(r1.x, r1.y);
        g.stroke();
    }

    // 梯形窄端固定（随 body 系），宽端 = 机身前缘；机身越靠前梯形越短
    const barrelBackHalf = size * 0.115;
    const barrelFrontHalf = size * 0.07;
    const barrel: LocalPoint[] = [
        { lx: -barrelBackHalf, ly: barrelBackY },
        { lx: barrelBackHalf, ly: barrelBackY },
        { lx: barrelFrontHalf, ly: barrelFrontY },
        { lx: -barrelFrontHalf, ly: barrelFrontY },
    ];
    fillLocalPoly(g, bodyCx, bodyCy, dx, dy, px, py, barrel, colors.chassisEdge);
    strokeLocalPoly(g, bodyCx, bodyCy, dx, dy, px, py, barrel, colors.accent, lw * 0.85);

    const muzzle = emitLocalToWorld(bodyCx, bodyCy, 0, muzzleLy, dx, dy, px, py);

    // 外层扩散光晕（先画，位于渐变截面之下）
    const glowRadii = [size * 0.22, size * 0.17, size * 0.13];
    const glowAlphas = [42, 78, 115];
    for (let i = 0; i < glowRadii.length; i++) {
        g.fillColor = new Color(colors.beam.r, colors.beam.g, colors.beam.b, glowAlphas[i]);
        g.circle(muzzle.x, muzzle.y, glowRadii[i]);
        g.fill();
    }

    // 与光路相同的白芯→本色渐变截面（叠在光晕之上，与光束衔接）
    fillBeamCrossSection(g, muzzle.x, muzzle.y, colors.beam, size);
}

/** 炮口中心（屏幕坐标，与 drawSourceEmitter 内计算一致） */
export function sourceMuzzleScreenPoint(
    left: number,
    bottom: number,
    size: number,
    direction: Direction,
): { x: number; y: number } {
    const cx = left + size * 0.5;
    const cy = bottom + size * 0.5;
    const dx = SCREEN_DIR_DX[direction];
    const dy = SCREEN_DIR_DY[direction];
    const px = -dy;
    const py = dx;
    const half = size * 0.5;
    const muzzleLy = half + size * 0.045;
    const bodyCx = cx - dx * size * 0.05;
    const bodyCy = cy - dy * size * 0.05;
    return emitLocalToWorld(bodyCx, bodyCy, 0, muzzleLy, dx, dy, px, py);
}
