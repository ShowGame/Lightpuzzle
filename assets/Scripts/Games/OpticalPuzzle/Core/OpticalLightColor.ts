/** 光色键：基础四色 + 混色二次色（层 3 `Y`/`C`/`P` 或混色输出） */
export type LightColorKey = 'white' | 'red' | 'green' | 'blue';

export type BeamColorKey = LightColorKey | 'yellow' | 'cyan' | 'purple';

import type { ColorMode } from './OpticalPuzzleTypes';
import { ColorMode as ColorModeEnum } from './OpticalPuzzleTypes';

const BASE_KEYS: ReadonlySet<string> = new Set(['white', 'red', 'green', 'blue']);
const MIXED_KEYS: ReadonlySet<string> = new Set(['yellow', 'cyan', 'purple']);

export function isBeamColorKey(key: string): key is BeamColorKey {
    return BASE_KEYS.has(key) || MIXED_KEYS.has(key);
}

/** 基础四色（元件层 3 等）；未知回落为 white */
export function normalizeLightColorKey(key?: string): LightColorKey {
    if (key && BASE_KEYS.has(key)) {
        return key as LightColorKey;
    }
    return 'white';
}

/** 光追 / S/E 用色键：保留黄/青/紫，未知则回落为 white */
export function resolveBeamColorKey(key?: string): BeamColorKey {
    if (key && isBeamColorKey(key)) {
        return key as BeamColorKey;
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
