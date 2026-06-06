const paths = [
    'M166.979 483.65h209.045c57.605 0 104.553-46.948 104.553-104.555V170.052c0-57.738-46.947-104.557-104.553-104.557H166.98c-57.674 0-104.555 46.817-104.555 104.557v209.043c0 57.607 46.882 104.554 104.555 104.554z',
    'm-34.788-313.598c0-19.225 15.562-34.917 34.785-34.917h209.046c19.225 0 34.786 15.692 34.786 34.917v209.043c0 19.16-15.561 34.785-34.786 34.785H166.979c-19.226 0-34.786-15.625-34.786-34.785V170.052h-0.002z',
    'M855.263 65.496H646.22c-57.674 0-104.557 46.818-104.557 104.557v209.045c0 57.606 46.883 104.554 104.557 104.554h209.043c57.606 0 104.555-46.947 104.555-104.554V170.052c0-57.739-46.951-104.556-104.555-104.556z',
    'm34.785 313.599c0 19.16-15.562 34.785-34.785 34.785H646.22c-19.227 0-34.787-15.625-34.787-34.785V170.052c0-19.225 15.56-34.917 34.785-34.917h209.045c19.223 0 34.785 15.692 34.785 34.917v209.043z',
    'M480.578 854.85V645.804c0-57.74-46.948-104.557-104.554-104.557H166.98c-57.674 0-104.555 46.817-104.555 104.557v209.047c0 57.604 46.882 104.553 104.555 104.553h209.045c57.605 0 104.553-46.95 104.553-104.554z',
    'm-69.77 0c0 19.159-15.561 34.784-34.786 34.784H166.979c-19.226 0-34.786-15.626-34.786-34.784V645.804c0-19.226 15.562-34.919 34.784-34.919h209.047c19.224 0 34.786 15.692 34.786 34.92V854.85h-0.002v-0.001z',
    'm444.455-313.603H646.22c-57.674 0-104.557 46.818-104.557 104.557v209.047c0 57.605 46.883 104.554 104.557 104.554h209.043c57.606 0 104.555-46.95 104.555-104.554V645.804c0-57.739-46.951-104.557-104.555-104.557z',
    'm34.785 313.603c0 19.159-15.562 34.784-34.785 34.784H646.22c-19.227 0-34.787-15.626-34.787-34.784V645.804c0-19.226 15.56-34.919 34.785-34.919h209.045c19.223 0 34.785 15.692 34.785 34.92V854.85z',
];

const CX = 512;
const CY = 512;
const iconR = 10;
const sc = iconR / 512;
const r = (v) => +v.toFixed(3);
function norm(x, y) {
    return { x: r((x - CX) * sc), y: r(-(y - CY) * sc) };
}

function parsePath(path) {
    const tokens = path.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g);
    let i = 0;
    let cmd = '';
    let cur = { x: 0, y: 0 };
    let start = { x: 0, y: 0 };
    const segs = [];
    while (i < tokens.length) {
        const t = tokens[i];
        if (/[a-zA-Z]/.test(t)) {
            cmd = tokens[i++];
        } else if (!cmd) {
            break;
        }
        switch (cmd) {
            case 'M': {
                const x = +tokens[i++];
                const y = +tokens[i++];
                cur = { x, y };
                start = { x, y };
                segs.push({ t: 'M', ...norm(x, y) });
                cmd = 'L';
                break;
            }
            case 'm': {
                cur = { x: cur.x + +tokens[i++], y: cur.y + +tokens[i++] };
                start = { x: cur.x, y: cur.y };
                segs.push({ t: 'M', ...norm(cur.x, cur.y) });
                cmd = 'l';
                break;
            }
            case 'L': {
                const x = +tokens[i++];
                const y = +tokens[i++];
                cur = { x, y };
                segs.push({ t: 'L', ...norm(x, y) });
                break;
            }
            case 'l': {
                cur = { x: cur.x + +tokens[i++], y: cur.y + +tokens[i++] };
                segs.push({ t: 'L', ...norm(cur.x, cur.y) });
                break;
            }
            case 'H': {
                cur = { x: +tokens[i++], y: cur.y };
                segs.push({ t: 'L', ...norm(cur.x, cur.y) });
                break;
            }
            case 'h': {
                cur = { x: cur.x + +tokens[i++], y: cur.y };
                segs.push({ t: 'L', ...norm(cur.x, cur.y) });
                break;
            }
            case 'V': {
                cur = { x: cur.x, y: +tokens[i++] };
                segs.push({ t: 'L', ...norm(cur.x, cur.y) });
                break;
            }
            case 'v': {
                cur = { x: cur.x, y: cur.y + +tokens[i++] };
                segs.push({ t: 'L', ...norm(cur.x, cur.y) });
                break;
            }
            case 'c': {
                const x1 = cur.x + +tokens[i++];
                const y1 = cur.y + +tokens[i++];
                const x2 = cur.x + +tokens[i++];
                const y2 = cur.y + +tokens[i++];
                const x = cur.x + +tokens[i++];
                const y = cur.y + +tokens[i++];
                const n1 = norm(x1, y1);
                const n2 = norm(x2, y2);
                const n = norm(x, y);
                cur = { x, y };
                segs.push({ t: 'C', x1: n1.x, y1: n1.y, x2: n2.x, y2: n2.y, x: n.x, y: n.y });
                break;
            }
            case 'C': {
                const x1 = +tokens[i++];
                const y1 = +tokens[i++];
                const x2 = +tokens[i++];
                const y2 = +tokens[i++];
                const x = +tokens[i++];
                const y = +tokens[i++];
                const n1 = norm(x1, y1);
                const n2 = norm(x2, y2);
                const n = norm(x, y);
                cur = { x, y };
                segs.push({ t: 'C', x1: n1.x, y1: n1.y, x2: n2.x, y2: n2.y, x: n.x, y: n.y });
                break;
            }
            case 'z':
            case 'Z':
                segs.push({ t: 'Z' });
                cur = start;
                break;
            default:
                throw new Error(cmd);
        }
    }
    return segs;
}

const all = [];
for (const p of paths) {
    all.push(...parsePath(p));
}
let max = 0;
for (const s of all) {
    for (const k of ['x', 'x1', 'x2']) {
        if (s[k] != null) {
            max = Math.max(max, Math.abs(s[k]));
        }
    }
    for (const k of ['y', 'y1', 'y2']) {
        if (s[k] != null) {
            max = Math.max(max, Math.abs(s[k]));
        }
    }
}
console.log('PATH_UNIT', max, 'segs', all.length);
for (const s of all) {
    if (s.t === 'M') {
        console.log(`    { t: 'M', x: ${s.x}, y: ${s.y} },`);
    } else if (s.t === 'L') {
        console.log(`    { t: 'L', x: ${s.x}, y: ${s.y} },`);
    } else if (s.t === 'C') {
        console.log(
            `    { t: 'C', x1: ${s.x1}, y1: ${s.y1}, x2: ${s.x2}, y2: ${s.y2}, x: ${s.x}, y: ${s.y} },`,
        );
    } else {
        console.log(`    { t: 'Z' },`);
    }
}
