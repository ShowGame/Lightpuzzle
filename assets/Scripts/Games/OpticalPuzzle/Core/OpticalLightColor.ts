/** 光色键（与关卡层 3 RGBW 解析的 colorKey 一致） */
export type LightColorKey = 'white' | 'red' | 'green' | 'blue';

import type { ColorMode } from './OpticalPuzzleTypes';
import { ColorMode as ColorModeEnum } from './OpticalPuzzleTypes';

const VALID_KEYS: ReadonlySet<string> = new Set(['white', 'red', 'green', 'blue']);
const MIXED_KEYS: ReadonlySet<string> = new Set(['yellow', 'cyan', 'purple']);

export function normalizeLightColorKey(key?: string): LightColorKey {
    if (key && VALID_KEYS.has(key)) {
        return key as LightColorKey;
    }
    return 'white';
}

/** 光追用色键：保留黄/青/紫等混色结果，未知则回落为白 */
export function resolveBeamColorKey(key?: string): string {
    if (key && (VALID_KEYS.has(key) || MIXED_KEYS.has(key))) {
        return key;
    }
    return 'white';
}

/** 入射光色是否满足目标期望色（严格同色，含黄/青/紫混色） */
export function lightMatchesTarget(beamKey: string | undefined, targetKey: string | undefined): boolean {
    return resolveBeamColorKey(beamKey) === resolveBeamColorKey(targetKey);
}

/** 元件 `colorMode` → 混色/显示用 colorKey */
export function colorModeToKey(mode: ColorMode): string {
    switch (mode) {
        case ColorModeEnum.FilterRed:
            return 'red';
        case ColorModeEnum.FilterGreen:
            return 'green';
        case ColorModeEnum.FilterBlue:
            return 'blue';
        default:
            return 'white';
    }
}

/**
 * 单束光经元件后的出射色（§3.4 透传 / 滤光）。
 * `through` 保持入射色；滤光格将白光染成对应单色、同色直过，异色返回 `null`（阻挡）。
 */
export function applyPieceColorMode(incomingKey: string, colorMode: ColorMode): string | null {
    const inKey = resolveBeamColorKey(incomingKey);

    if (colorMode === ColorModeEnum.Through) {
        return inKey;
    }

    const filterKey = colorModeToKey(colorMode);
    if (inKey === 'white') {
        return filterKey;
    }
    if (inKey === filterKey) {
        return inKey;
    }
    return null;
}
