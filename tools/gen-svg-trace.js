const d = process.argv[2];
const vb = parseFloat(process.argv[3] || '1024');
const iconR = parseFloat(process.argv[4] || '10');
const cx = vb / 2;
const cy = vb / 2;

const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g);
let i = 0;
let x = 0;
let y = 0;
let sx = 0;
let sy = 0;
let lastCmd = '';
const segs = [];

const TAU = Math.PI * 2;

function norm(px, py) {
    return {
        x: parseFloat(((px - cx) / (vb / 2) * iconR).toFixed(3)),
        y: parseFloat(((cy - py) / (vb / 2) * iconR).toFixed(3)),
    };
}

function read() {
    return parseFloat(tokens[i++]);
}

function pushSeg(seg) {
    segs.push(seg);
}

/** SVG 椭圆弧 → 多段三次贝塞尔（W3C 端点参数化） */
function arcToBezier(x1, y1, rx, ry, angle, largeArc, sweep, x2, y2) {
    if (Math.abs(x1 - x2) < 1e-6 && Math.abs(y1 - y2) < 1e-6) {
        return [];
    }
    if (rx === 0 || ry === 0) {
        return [{ x1: x2, y1: y2, x2: x2, y2: y2, x: x2, y: y2 }];
    }

    const sinPhi = Math.sin(angle);
    const cosPhi = Math.cos(angle);
    const dx = (x1 - x2) * 0.5;
    const dy = (y1 - y2) * 0.5;
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
    const cxArc = cosPhi * cxp - sinPhi * cyp + (x1 + x2) * 0.5;
    const cyArc = sinPhi * cxp + cosPhi * cyp + (y1 + y2) * 0.5;

    function vectorAngle(ux, uy, vx, vy) {
        const sign = ux * vy - uy * vx < 0 ? -1 : 1;
        const um = Math.hypot(ux, uy);
        const vm = Math.hypot(vx, vy);
        let dot = (ux * vx + uy * vy) / (um * vm);
        dot = Math.max(-1, Math.min(1, dot));
        return sign * Math.acos(dot);
    }

    const theta1 = vectorAngle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
    let deltaTheta = vectorAngle(
        (x1p - cxp) / rx,
        (y1p - cyp) / ry,
        (-x1p - cxp) / rx,
        (-y1p - cyp) / ry,
    );

    if (!sweep && deltaTheta > 0) {
        deltaTheta -= TAU;
    }
    if (sweep && deltaTheta < 0) {
        deltaTheta += TAU;
    }

    const segments = Math.max(1, Math.ceil(Math.abs(deltaTheta / (TAU / 4))));
    const delta = deltaTheta / segments;
    const result = [];

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
        const cp1x = ex1 + tan * (-rx * cosPhi * sin1 - ry * sinPhi * cos1);
        const cp1y = ey1 + tan * (-rx * sinPhi * sin1 + ry * cosPhi * cos1);
        const cp2x = ex2 + tan * (rx * cosPhi * sin2 + ry * sinPhi * cos2);
        const cp2y = ey2 + tan * (rx * sinPhi * sin2 - ry * cosPhi * cos2);
        result.push({ x1: cp1x, y1: cp1y, x2: cp2x, y2: cp2y, x: ex2, y: ey2 });
    }

    return result;
}

function cmd(c) {
    if (c.length === 1 && /[a-zA-Z]/.test(c)) {
        lastCmd = c;
    } else if (/[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/.test(c)) {
        i--;
        c = lastCmd;
    } else {
        throw new Error(`Unknown ${c}`);
    }

    switch (c) {
        case 'M':
            x = read();
            y = read();
            sx = x;
            sy = y;
            pushSeg({ t: 'M', ...norm(x, y) });
            break;
        case 'm':
            x += read();
            y += read();
            sx = x;
            sy = y;
            pushSeg({ t: 'M', ...norm(x, y) });
            break;
        case 'L':
            x = read();
            y = read();
            pushSeg({ t: 'L', ...norm(x, y) });
            break;
        case 'l':
            x += read();
            y += read();
            pushSeg({ t: 'L', ...norm(x, y) });
            break;
        case 'H':
            x = read();
            pushSeg({ t: 'L', ...norm(x, y) });
            break;
        case 'h':
            x += read();
            pushSeg({ t: 'L', ...norm(x, y) });
            break;
        case 'V':
            y = read();
            pushSeg({ t: 'L', ...norm(x, y) });
            break;
        case 'v':
            y += read();
            pushSeg({ t: 'L', ...norm(x, y) });
            break;
        case 'C': {
            const x1 = read();
            const y1 = read();
            const x2 = read();
            const y2 = read();
            x = read();
            y = read();
            const n1 = norm(x1, y1);
            const n2 = norm(x2, y2);
            const n = norm(x, y);
            pushSeg({ t: 'C', x1: n1.x, y1: n1.y, x2: n2.x, y2: n2.y, x: n.x, y: n.y });
            break;
        }
        case 'c': {
            const x1 = x + read();
            const y1 = y + read();
            const x2 = x + read();
            const y2 = y + read();
            x += read();
            y += read();
            const n1 = norm(x1, y1);
            const n2 = norm(x2, y2);
            const n = norm(x, y);
            pushSeg({ t: 'C', x1: n1.x, y1: n1.y, x2: n2.x, y2: n2.y, x: n.x, y: n.y });
            break;
        }
        case 'a':
        case 'A': {
            const rx = read();
            const ry = read();
            const rot = read() * (Math.PI / 180);
            const laf = read();
            const sf = read();
            const ex = c === 'a' ? x + read() : read();
            const ey = c === 'a' ? y + read() : read();
            const beziers = arcToBezier(x, y, rx, ry, rot, laf, sf, ex, ey);
            for (const b of beziers) {
                const n1 = norm(b.x1, b.y1);
                const n2 = norm(b.x2, b.y2);
                const n = norm(b.x, b.y);
                pushSeg({ t: 'C', x1: n1.x, y1: n1.y, x2: n2.x, y2: n2.y, x: n.x, y: n.y });
            }
            x = ex;
            y = ey;
            break;
        }
        case 'z':
        case 'Z':
            pushSeg({ t: 'Z' });
            x = sx;
            y = sy;
            break;
        default:
            throw new Error(`Unhandled ${c}`);
    }
}

while (i < tokens.length) {
    cmd(tokens[i++]);
}

console.log(JSON.stringify(segs, null, 2));
