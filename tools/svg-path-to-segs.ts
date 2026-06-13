/**
 * SVG path → UndoSeg（中心 512,512，iconR=10）
 * npx.cmd --yes tsx tools/svg-path-to-segs.ts
 */
const PATH =
    'M453.973333 168.533333a283.946667 283.946667 0 1 1 116.906667 472.021334l-138.794667 138.752-40.106666-40.192a56.789333 56.789333 0 0 0-76.288-3.669334l-4.053334 3.669334a56.789333 56.789333 0 0 0-3.669333 76.245333l3.669333 4.053333 40.106667 40.192-67.925333 67.968a37.845333 37.845333 0 0 1-29.696 10.965334l-124.288-9.557334a37.845333 37.845333 0 0 1-34.816-34.816l-9.557334-124.288a37.845333 37.845333 0 0 1 10.965334-29.696l287.018666-287.018666A283.904 283.904 0 0 1 453.973333 168.533333z' +
    'm133.845334 133.802667a94.634667 94.634667 0 1 0 133.845333 133.845333 94.634667 94.634667 0 0 0-133.845333-133.845333z';

const CX = 512;
const CY = 512;
const UNIT = 51.2;

type Seg =
    | { t: 'M'; x: number; y: number }
    | { t: 'L'; x: number; y: number }
    | { t: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
    | { t: 'Z' };

function norm(x: number, y: number): { x: number; y: number } {
    return { x: (x - CX) / UNIT, y: -(y - CY) / UNIT };
}

function tokenizePath(d: string): string[] {
    const tokens: string[] = [];
    const re = /([MmLlHhVvCcSsAaZz])|(-?\d*\.?\d+(?:e[-+]?\d+)?)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(d)) !== null) {
        if (m[1]) tokens.push(m[1]);
        else if (m[2]) tokens.push(m[2]);
    }
    return tokens;
}

const CMD_RE = /^[MLHVCSAZmlhvcsaz]$/;

function readNums(tokens: string[], i: number, n: number): { nums: number[]; i: number } {
    const nums: number[] = [];
    let j = i;
    while (nums.length < n && j < tokens.length && !CMD_RE.test(tokens[j]!)) {
        nums.push(Number(tokens[j]));
        j++;
    }
    return { nums, i: j };
}

/** SVG 椭圆弧 → 三次贝塞尔（可返回多段） */
function arcToCubics(
    x0: number,
    y0: number,
    rx: number,
    ry: number,
    angleDeg: number,
    largeArc: number,
    sweep: number,
    x1: number,
    y1: number,
): Array<{ x1: number; y1: number; x2: number; y2: number; x: number; y: number }> {
    if (rx === 0 || ry === 0) {
        return [{ x1: x0, y1: y0, x2: x1, y2: y1, x: x1, y: y1 }];
    }
    const phi = (angleDeg * Math.PI) / 180;
    const cosPhi = Math.cos(phi);
    const sinPhi = Math.sin(phi);
    const dx = (x0 - x1) / 2;
    const dy = (y0 - y1) / 2;
    const x1p = cosPhi * dx + sinPhi * dy;
    const y1p = -sinPhi * dx + cosPhi * dy;
    let rxSq = rx * rx;
    let rySq = ry * ry;
    const x1pSq = x1p * x1p;
    const y1pSq = y1p * y1p;
    let rad = x1pSq / rxSq + y1pSq / rySq;
    if (rad > 1) {
        const s = Math.sqrt(rad);
        rx *= s;
        ry *= s;
        rxSq = rx * rx;
        rySq = ry * ry;
    }
    let sq = (rxSq * rySq - rxSq * y1pSq - rySq * x1pSq) / (rxSq * y1pSq + rySq * x1pSq);
    sq = Math.max(0, sq);
    const coef = (largeArc === sweep ? -1 : 1) * Math.sqrt(sq);
    const cxp = (coef * rx * y1p) / ry;
    const cyp = (coef * -ry * x1p) / rx;
    const cx = cosPhi * cxp - sinPhi * cyp + (x0 + x1) / 2;
    const cy = sinPhi * cxp + cosPhi * cyp + (y0 + y1) / 2;
    const unit = (vx: number, vy: number) => {
        const len = Math.hypot(vx, vy);
        return len === 0 ? { x: 0, y: 0 } : { x: vx / len, y: vy / len };
    };
    const v1 = unit((x1p - cxp) / rx, (y1p - cyp) / ry);
    const v2 = unit((-x1p - cxp) / rx, (-y1p - cyp) / ry);
    let theta1 = Math.atan2(v1.y, v1.x);
    let delta = Math.atan2(v1.x * v2.y - v1.y * v2.x, v1.x * v2.x + v1.y * v2.y);
    if (sweep === 0 && delta > 0) delta -= 2 * Math.PI;
    if (sweep === 1 && delta < 0) delta += 2 * Math.PI;
    const segs = Math.ceil(Math.abs(delta) / (Math.PI / 2));
    const dTheta = delta / segs;
    const out: Array<{ x1: number; y1: number; x2: number; y2: number; x: number; y: number }> = [];
    let px = x0;
    let py = y0;
    for (let i = 0; i < segs; i++) {
        const t1 = theta1 + i * dTheta;
        const t2 = t1 + dTheta;
        const cosT1 = Math.cos(t1);
        const sinT1 = Math.sin(t1);
        const cosT2 = Math.cos(t2);
        const sinT2 = Math.sin(t2);
        const e1x = cx + rx * cosT1 * cosPhi - ry * sinT1 * sinPhi;
        const e1y = cy + rx * cosT1 * sinPhi + ry * sinT1 * cosPhi;
        const e2x = cx + rx * cosT2 * cosPhi - ry * sinT2 * sinPhi;
        const e2y = cy + rx * cosT2 * sinPhi + ry * sinT2 * cosPhi;
        const alpha = (4 / 3) * Math.tan(dTheta / 4);
        const c1x = e1x + alpha * (-rx * sinT1 * cosPhi - ry * cosT1 * sinPhi);
        const c1y = e1y + alpha * (-rx * sinT1 * sinPhi + ry * cosT1 * cosPhi);
        const c2x = e2x + alpha * (rx * sinT2 * cosPhi + ry * cosT2 * sinPhi);
        const c2y = e2y + alpha * (rx * sinT2 * sinPhi - ry * cosT2 * cosPhi);
        out.push({ x1: c1x, y1: c1y, x2: c2x, y2: c2y, x: e2x, y: e2y });
        px = e2x;
        py = e2y;
    }
    void px;
    void py;
    return out;
}

function parsePath(d: string): Seg[] {
    const tokens = tokenizePath(d);
    const segs: Seg[] = [];
    let i = 0;
    let x = 0;
    let y = 0;
    let sx = 0;
    let sy = 0;
    let prevCx = 0;
    let prevCy = 0;
    let prevCmd = '';

    const pushM = (px: number, py: number) => {
        const n = norm(px, py);
        segs.push({ t: 'M', x: n.x, y: n.y });
    };
    const pushL = (px: number, py: number) => {
        const n = norm(px, py);
        segs.push({ t: 'L', x: n.x, y: n.y });
    };
    const pushC = (x1: number, y1: number, x2: number, y2: number, px: number, py: number) => {
        const a = norm(x1, y1);
        const b = norm(x2, y2);
        const c = norm(px, py);
        segs.push({ t: 'C', x1: a.x, y1: a.y, x2: b.x, y2: b.y, x: c.x, y: c.y });
    };
    const pushArc = (
        rx: number,
        ry: number,
        angle: number,
        large: number,
        sweep: number,
        px: number,
        py: number,
        rel: boolean,
    ) => {
        const x2 = rel ? x + px : px;
        const y2 = rel ? y + py : py;
        for (const c of arcToCubics(x, y, rx, ry, angle, large, sweep, x2, y2)) {
            pushC(c.x1, c.y1, c.x2, c.y2, c.x, c.y);
        }
        x = x2;
        y = y2;
    };

    while (i < tokens.length) {
        let cmd = prevCmd;
        if (CMD_RE.test(tokens[i]!)) {
            cmd = tokens[i]!;
            i++;
            prevCmd = cmd;
        } else if (!prevCmd) {
            break;
        }

        switch (cmd) {
            case 'M': {
                const { nums, i: ni } = readNums(tokens, i, 2);
                i = ni;
                x = nums[0]!;
                y = nums[1]!;
                sx = x;
                sy = y;
                pushM(x, y);
                prevCmd = 'L';
                break;
            }
            case 'm': {
                const { nums, i: ni } = readNums(tokens, i, 2);
                i = ni;
                x += nums[0]!;
                y += nums[1]!;
                sx = x;
                sy = y;
                pushM(x, y);
                prevCmd = 'l';
                break;
            }
            case 'L': {
                const { nums, i: ni } = readNums(tokens, i, 2);
                i = ni;
                x = nums[0]!;
                y = nums[1]!;
                pushL(x, y);
                break;
            }
            case 'l': {
                const { nums, i: ni } = readNums(tokens, i, 2);
                i = ni;
                x += nums[0]!;
                y += nums[1]!;
                pushL(x, y);
                break;
            }
            case 'H': {
                const { nums, i: ni } = readNums(tokens, i, 1);
                i = ni;
                x = nums[0]!;
                pushL(x, y);
                break;
            }
            case 'h': {
                const { nums, i: ni } = readNums(tokens, i, 1);
                i = ni;
                x += nums[0]!;
                pushL(x, y);
                break;
            }
            case 'V': {
                const { nums, i: ni } = readNums(tokens, i, 1);
                i = ni;
                y = nums[0]!;
                pushL(x, y);
                break;
            }
            case 'v': {
                const { nums, i: ni } = readNums(tokens, i, 1);
                i = ni;
                y += nums[0]!;
                pushL(x, y);
                break;
            }
            case 'C': {
                const { nums, i: ni } = readNums(tokens, i, 6);
                i = ni;
                pushC(nums[0]!, nums[1]!, nums[2]!, nums[3]!, nums[4]!, nums[5]!);
                prevCx = nums[2]!;
                prevCy = nums[3]!;
                x = nums[4]!;
                y = nums[5]!;
                break;
            }
            case 'c': {
                const { nums, i: ni } = readNums(tokens, i, 6);
                i = ni;
                pushC(x + nums[0]!, y + nums[1]!, x + nums[2]!, y + nums[3]!, x + nums[4]!, y + nums[5]!);
                prevCx = x + nums[2]!;
                prevCy = y + nums[3]!;
                x += nums[4]!;
                y += nums[5]!;
                break;
            }
            case 'S': {
                const { nums, i: ni } = readNums(tokens, i, 4);
                i = ni;
                pushC(2 * x - prevCx, 2 * y - prevCy, nums[0]!, nums[1]!, nums[2]!, nums[3]!);
                prevCx = nums[0]!;
                prevCy = nums[1]!;
                x = nums[2]!;
                y = nums[3]!;
                break;
            }
            case 's': {
                const { nums, i: ni } = readNums(tokens, i, 4);
                i = ni;
                const x2 = x + nums[0]!;
                const y2 = y + nums[1]!;
                pushC(2 * x - prevCx, 2 * y - prevCy, x2, y2, x + nums[2]!, y + nums[3]!);
                prevCx = x2;
                prevCy = y2;
                x += nums[2]!;
                y += nums[3]!;
                break;
            }
            case 'A':
            case 'a': {
                const rel = cmd === 'a';
                while (i < tokens.length && !CMD_RE.test(tokens[i]!)) {
                    const { nums, i: ni } = readNums(tokens, i, 7);
                    i = ni;
                    if (nums.length < 7) break;
                    pushArc(nums[0]!, nums[1]!, nums[2]!, nums[3]!, nums[4]!, nums[5]!, nums[6]!, rel);
                }
                break;
            }
            case 'Z':
            case 'z':
                segs.push({ t: 'Z' });
                x = sx;
                y = sy;
                break;
        }
    }
    return segs;
}

const segs = parsePath(PATH);
let maxR = 0;
for (const s of segs) {
    const pts =
        s.t === 'M' || s.t === 'L'
            ? [{ x: s.x, y: s.y }]
            : s.t === 'C'
              ? [
                    { x: s.x1, y: s.y1 },
                    { x: s.x2, y: s.y2 },
                    { x: s.x, y: s.y },
                ]
              : [];
    for (const p of pts) {
        maxR = Math.max(maxR, Math.abs(p.x), Math.abs(p.y));
    }
}
console.log('normHalf', maxR.toFixed(3));
console.log('segCount', segs.length);
for (const s of segs) {
    if (s.t === 'M') console.log(`    { t: 'M', x: ${s.x.toFixed(3)}, y: ${s.y.toFixed(3)} },`);
    else if (s.t === 'L') console.log(`    { t: 'L', x: ${s.x.toFixed(3)}, y: ${s.y.toFixed(3)} },`);
    else if (s.t === 'C')
        console.log(
            `    { t: 'C', x1: ${s.x1.toFixed(3)}, y1: ${s.y1.toFixed(3)}, x2: ${s.x2.toFixed(3)}, y2: ${s.y2.toFixed(3)}, x: ${s.x.toFixed(3)}, y: ${s.y.toFixed(3)} },`,
        );
    else console.log(`    { t: 'Z' },`);
}
