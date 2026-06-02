import { Color, Graphics } from 'cc';
import { Direction } from '../Core/OpticalPuzzleTypes';
import { fillBeamCrossSection } from './OpticalPuzzleBeamGradient';
import { OPTICAL_CELL_SIZE } from './OpticalPuzzleLayout';
import { sourceEmitterColors } from './OpticalPuzzleColorUtil';

/** 发射器外轮廓圆角（设计像素，随格宽等比缩放） */
const EMITTER_CORNER_RADIUS = 4;

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

/** 格心对称四角 L（连续折线 + 圆角连接，避免转折处漏像素） */
function drawScreenSymmetricBrackets(
    g: Graphics,
    cx: number,
    cy: number,
    half: number,
    arm: number,
    color: Color,
    lineWidth: number,
): void {
    g.strokeColor = color;
    g.lineWidth = lineWidth;
    g.lineCap = Graphics.LineCap.SQUARE;
    g.lineJoin = Graphics.LineJoin.ROUND;
    const corners: Array<{ x: number; y: number; ax: number; ay: number }> = [
        { x: -half, y: -half, ax: 1, ay: 1 },
        { x: half, y: -half, ax: -1, ay: 1 },
        { x: half, y: half, ax: -1, ay: -1 },
        { x: -half, y: half, ax: 1, ay: -1 },
    ];
    for (const c of corners) {
        const p0x = cx + c.x;
        const p0y = cy + c.y;
        g.moveTo(p0x + c.ax * arm, p0y);
        g.lineTo(p0x, p0y);
        g.lineTo(p0x, p0y + c.ay * arm);
        g.stroke();
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

    // 光点锚点（不随机身/梯形调整而移动）
    const bodyCx = cx - dx * size * 0.05;
    const bodyCy = cy - dy * size * 0.05;
    /** 机身半宽（lx 横向，垂直于炮口方向）；整宽 = halfW × 2 */
    const halfW = size * 0.24;
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

    // 四角 L：格心 screen 对称，不随朝向 / 机身前移
    drawScreenSymmetricBrackets(
        g,
        cx,
        cy,
        halfW + size * 0.12,//L距离中心点距离
        size * 0.11,
        colors.accent,
        Math.max(2.2, size * 0.05),
    );

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

    const ledLy = backY + size * 0.12;
    const led = emitLocalToWorld(emitCx, emitCy, 0, ledLy, dx, dy, px, py);
    g.fillColor = colors.accent;
    g.circle(led.x, led.y, size * 0.084);
    g.fill();
    g.fillColor = colors.beam;
    g.circle(led.x, led.y, size * 0.056);
    g.fill();
}
