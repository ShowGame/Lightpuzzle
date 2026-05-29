import type { LightColorKey } from './OpticalLightColor';

/** 运行时混色结果（含二次色） */
export type MixedLightColorKey =
    | LightColorKey
    | 'yellow'
    | 'cyan'
    | 'purple';

export interface RgbScores {
    r: number;
    g: number;
    b: number;
}

const BASE_KEYS: readonly LightColorKey[] = ['red', 'green', 'blue', 'white'];
const MIXED_KEYS: readonly MixedLightColorKey[] = [
    'red',
    'green',
    'blue',
    'white',
    'yellow',
    'cyan',
    'purple',
];

export function isMixedLightColorKey(key: string): key is MixedLightColorKey {
    return (MIXED_KEYS as readonly string[]).includes(key);
}

/** 第一步：单色分解为 R/G/B 得分（可累加） */
export function decomposeToRgbScores(colorKey: string): RgbScores {
    switch (colorKey) {
        case 'red':
            return { r: 1, g: 0, b: 0 };
        case 'green':
            return { r: 0, g: 1, b: 0 };
        case 'blue':
            return { r: 0, g: 0, b: 1 };
        case 'yellow':
            return { r: 1, g: 1, b: 0 };
        case 'cyan':
            return { r: 0, g: 1, b: 1 };
        case 'purple':
            return { r: 1, g: 0, b: 1 };
        case 'white':
        default:
            return { r: 1, g: 1, b: 1 };
    }
}

export function addRgbScores(a: RgbScores, b: RgbScores): RgbScores {
    return { r: a.r + b.r, g: a.g + b.g, b: a.b + b.b };
}

export function sumRgbScores(colors: readonly string[]): RgbScores {
    let acc: RgbScores = { r: 0, g: 0, b: 0 };
    for (const c of colors) {
        acc = addRgbScores(acc, decomposeToRgbScores(c));
    }
    return acc;
}

/**
 * 三步混色（入射光 + 元件本色均参与第一步累加）：
 * 1. 分解累加 → 2. 若 R/G/B 得分均 ≥1 则各减最小值 → 3. 两色合成 / 单色直出 / 无则白
 */
export function mixLightColors(colors: readonly string[]): MixedLightColorKey {
    let scores = sumRgbScores(colors);

    if (scores.r >= 1 && scores.g >= 1 && scores.b >= 1) {
        const min = Math.min(scores.r, scores.g, scores.b);
        scores = {
            r: scores.r - min,
            g: scores.g - min,
            b: scores.b - min,
        };
    }

    const present: LightColorKey[] = [];
    if (scores.r > 0) {
        present.push('red');
    }
    if (scores.g > 0) {
        present.push('green');
    }
    if (scores.b > 0) {
        present.push('blue');
    }

    if (present.length === 0) {
        return 'white';
    }
    if (present.length === 1) {
        return present[0];
    }
    if (present.length === 2) {
        const has = (c: LightColorKey) => present.includes(c);
        if (has('red') && has('green')) {
            return 'yellow';
        }
        if (has('red') && has('blue')) {
            return 'purple';
        }
        if (has('green') && has('blue')) {
            return 'cyan';
        }
    }

    return 'white';
}
