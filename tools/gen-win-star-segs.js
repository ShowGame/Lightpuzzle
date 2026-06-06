const fs = require('fs');

const d =
    'M1004.16 393.6c-9.6-29.44-34.56-50.56-64.64-55.04l-245.12-35.84-109.44-222.08C571.52 53.12 544 35.84 512.64 35.84s-58.24 17.28-72.32 44.8L330.88 302.72l-245.12 35.84c-30.72 4.48-55.04 25.6-64.64 55.04-9.6 29.44-1.92 60.8 20.48 82.56l177.28 172.8-42.24 244.48A80.256 80.256 0 0 0 256 987.52c12.8 0 25.6-3.2 37.12-9.6l219.52-115.2 219.52 115.2c27.52 14.08 59.52 12.16 84.48-5.76s37.12-48 32-78.72l-42.24-244.48 177.28-172.8c21.76-21.76 30.08-53.12 20.48-82.56z';

function reflect(cx, cy, x, y) {
    return { x: 2 * cx - x, y: 2 * cy - y };
}

/** SVG 椭圆弧 → 三次贝塞尔（与 tools/gen-svg-trace.js 一致，W3C 端点参数化） */
function arcToCubics(x0, y0, rx, ry, phiDeg, largeArc, sweep, x1, y1) {
    if (Math.abs(x0 - x1) < 1e-6 && Math.abs(y0 - y1) < 1e-6) {
        return [];
    }
    if (rx === 0 || ry === 0) {
        return [{ t: 'L', x: x1, y: y1 }];
    }

    const angle = (phiDeg * Math.PI) / 180;
    const sinPhi = Math.sin(angle);
    const cosPhi = Math.cos(angle);
    const dx = (x0 - x1) * 0.5;
    const dy = (y0 - y1) * 0.5;
    const x1p = cosPhi * dx + sinPhi * dy;
    const y1p = -sinPhi * dx + cosPhi * dy;

    rx = Math.abs(rx);
    ry = Math.abs(ry);

    let lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
    if (lambda > 1) {
        const s = Math.sqrt(lambda);
        rx *= s;
        ry *= s;
    }

    const rx2 = rx * rx;
    const ry2 = ry * ry;
    const x1p2 = x1p * x1p;
    const y1p2 = y1p * y1p;
    let radicant = (rx2 * ry2 - rx2 * y1p2 - ry2 * x1p2) / (rx2 * y1p2 + ry2 * x1p2);
    radicant = Math.max(0, radicant);
    const root = (largeArc === sweep ? -1 : 1) * Math.sqrt(radicant);
    const cxp = root * ((rx * y1p) / ry);
    const cyp = root * (-(ry * x1p) / rx);
    const cxArc = cosPhi * cxp - sinPhi * cyp + (x0 + x1) * 0.5;
    const cyArc = sinPhi * cxp + cosPhi * cyp + (y0 + y1) * 0.5;

    const vectorAngle = (ux, uy, vx, vy) => {
        const sign = ux * vy - uy * vx < 0 ? -1 : 1;
        const um = Math.hypot(ux, uy);
        const vm = Math.hypot(vx, vy);
        let dot = (ux * vx + uy * vy) / (um * vm);
        dot = Math.max(-1, Math.min(1, dot));
        return sign * Math.acos(dot);
    };

    const theta1 = vectorAngle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
    let deltaTheta = vectorAngle(
        (x1p - cxp) / rx,
        (y1p - cyp) / ry,
        (-x1p - cxp) / rx,
        (-y1p - cyp) / ry,
    );

    const TAU = Math.PI * 2;
    if (!sweep && deltaTheta > 0) {
        deltaTheta -= TAU;
    }
    if (sweep && deltaTheta < 0) {
        deltaTheta += TAU;
    }

    const segments = Math.max(1, Math.ceil(Math.abs(deltaTheta / (TAU / 4))));
    const delta = deltaTheta / segments;
    const out = [];

    for (let s = 0; s < segments; s++) {
        const t1 = theta1 + delta * s;
        const t2 = theta1 + delta * (s + 1);
        const cos1 = Math.cos(t1);
        const sin1 = Math.sin(t1);
        const cos2 = Math.cos(t2);
        const sin2 = Math.sin(t2);
        const ex1 = cxArc + rx * cosPhi * cos1 - ry * sinPhi * sin1;
        const ey1 = cyArc + rx * sinPhi * cos1 + ry * cosPhi * sin1;
        const ex2 = cxArc + rx * cosPhi * cos2 - ry * sinPhi * sin2;
        const ey2 = cyArc + rx * sinPhi * cos2 + ry * cosPhi * sin2;
        const tan = (4 / 3) * Math.tan(delta / 4);
        const c1x = ex1 + tan * (-rx * cosPhi * sin1 - ry * sinPhi * cos1);
        const c1y = ey1 + tan * (-rx * sinPhi * sin1 + ry * cosPhi * cos1);
        const c2x = ex2 + tan * (rx * cosPhi * sin2 + ry * sinPhi * cos2);
        const c2y = ey2 + tan * (rx * sinPhi * sin2 - ry * cosPhi * cos2);
        out.push({ t: 'C', x1: c1x, y1: c1y, x2: c2x, y2: c2y, x: ex2, y: ey2 });
    }

    return out;
}

const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) || [];
let i = 0;
let cmd = '';
let x = 0;
let y = 0;
let sx = 0;
let sy = 0;
let px2 = null;
let py2 = null;
const segs = [];
const rd = () => parseFloat(tokens[i++]);

while (i < tokens.length) {
    const t = tokens[i];
    if (/[a-zA-Z]/.test(t)) {
        cmd = tokens[i++];
    }
    const rel = cmd === cmd.toLowerCase() && cmd !== 'z' && cmd !== 'Z';
    const C = cmd.toUpperCase();
    switch (C) {
        case 'M': {
            const nx = rd();
            const ny = rd();
            x = sx = nx;
            y = sy = ny;
            segs.push({ t: 'M', x, y });
            cmd = rel ? 'l' : 'L';
            break;
        }
        case 'L': {
            x = rel ? x + rd() : rd();
            y = rel ? y + rd() : rd();
            segs.push({ t: 'L', x, y });
            px2 = py2 = null;
            break;
        }
        case 'C': {
            const x1 = rel ? x + rd() : rd();
            const y1 = rel ? y + rd() : rd();
            const x2 = rel ? x + rd() : rd();
            const y2 = rel ? y + rd() : rd();
            x = rel ? x + rd() : rd();
            y = rel ? y + rd() : rd();
            segs.push({ t: 'C', x1, y1, x2, y2, x, y });
            px2 = x2;
            py2 = y2;
            break;
        }
        case 'S': {
            let x1;
            let y1;
            if (px2 != null && py2 != null) {
                const r = reflect(x, y, px2, py2);
                x1 = r.x;
                y1 = r.y;
            } else {
                x1 = x;
                y1 = y;
            }
            const x2 = rel ? x + rd() : rd();
            const y2 = rel ? y + rd() : rd();
            x = rel ? x + rd() : rd();
            y = rel ? y + rd() : rd();
            segs.push({ t: 'C', x1, y1, x2, y2, x, y });
            px2 = x2;
            py2 = y2;
            break;
        }
        case 'A': {
            const rx = rd();
            const ry = rd();
            const phi = rd();
            const laf = rd() !== 0;
            const sf = rd() !== 0;
            const nx = rel ? x + rd() : rd();
            const ny = rel ? y + rd() : rd();
            segs.push(...arcToCubics(x, y, rx, ry, phi, laf, sf, nx, ny));
            x = nx;
            y = ny;
            px2 = py2 = null;
            break;
        }
        case 'Z':
            segs.push({ t: 'Z' });
            x = sx;
            y = sy;
            px2 = py2 = null;
            break;
        default:
            throw new Error(`bad ${cmd}`);
    }
}

let minX = 1e9;
let maxX = -1e9;
let minY = 1e9;
let maxY = -1e9;
for (const s of segs) {
    for (const k of ['x', 'x1', 'x2']) {
        if (s[k] != null) {
            minX = Math.min(minX, s[k]);
            maxX = Math.max(maxX, s[k]);
        }
    }
    for (const k of ['y', 'y1', 'y2']) {
        if (s[k] != null) {
            minY = Math.min(minY, s[k]);
            maxY = Math.max(maxY, s[k]);
        }
    }
}

const fmt = (n) => Number(n.toFixed(3));
const lines = segs.map((s) => {
    if (s.t === 'M') {
        return `    { t: 'M', x: ${fmt(s.x)}, y: ${fmt(s.y)} },`;
    }
    if (s.t === 'L') {
        return `    { t: 'L', x: ${fmt(s.x)}, y: ${fmt(s.y)} },`;
    }
    if (s.t === 'C') {
        return `    { t: 'C', x1: ${fmt(s.x1)}, y1: ${fmt(s.y1)}, x2: ${fmt(s.x2)}, y2: ${fmt(s.y2)}, x: ${fmt(s.x)}, y: ${fmt(s.y)} },`;
    }
    return `    { t: 'Z' },`;
});

const out = `// AUTO-GENERATED by tools/gen-win-star-segs.js — do not edit by hand
export const WIN_STAR_VIEW_MIN_X = ${fmt(minX)};
export const WIN_STAR_VIEW_MAX_X = ${fmt(maxX)};
export const WIN_STAR_VIEW_MIN_Y = ${fmt(minY)};
export const WIN_STAR_VIEW_MAX_Y = ${fmt(maxY)};
export const WIN_STAR_VIEW_W = ${fmt(maxX - minX)};
export const WIN_STAR_VIEW_H = ${fmt(maxY - minY)};
export const WIN_STAR_VIEW_CX = ${fmt((minX + maxX) * 0.5)};
export const WIN_STAR_VIEW_CY = ${fmt((minY + maxY) * 0.5)};

export type WinStarPathSeg =
    | { t: 'M'; x: number; y: number }
    | { t: 'L'; x: number; y: number }
    | { t: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
    | { t: 'Z' };

/** 用户 SVG 五角星路径（含圆角贝塞尔与弧段） */
export const WIN_STAR_SEGS: ReadonlyArray<WinStarPathSeg> = [
${lines.join('\n')}
];
`;

const outPath = 'assets/Scripts/Games/OpticalPuzzle/Presentation/OpticalPuzzleWinPanelStarSegs.generated.ts';
fs.writeFileSync(outPath, out);
console.log('wrote', outPath, segs.length, 'segs');
