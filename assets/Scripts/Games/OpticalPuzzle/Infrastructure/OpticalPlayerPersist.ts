import { getNextOpticalLevelId } from '../Config/OpticalPuzzleLevels';

/**
 * 已解锁 / 已通关关卡记录（紧凑存储）。
 * 扁平数组 `[levelId, steps, levelId, steps, …]`，JSON 里全是 number，无重复字段名。
 * - 真实通关：`steps` 为本关最少步数。
 * - 仅解锁未通：`steps === OPTICAL_LEVEL_UNLOCK_PLACEHOLDER_STEPS`（通关上一关时写入下一关，支持跳关）。
 * 某 levelId 未出现在数组中 = 未解锁；后续新增关卡 id 无需迁移旧档。
 */
export type OpticalLevelClearsFlat = number[];

/** 仅解锁、尚未真实通关时的占位步数（不参与评星与最佳步数展示） */
export const OPTICAL_LEVEL_UNLOCK_PLACEHOLDER_STEPS = 999999;

export function isOpticalUnlockPlaceholderSteps(steps: number): boolean {
    return steps >= OPTICAL_LEVEL_UNLOCK_PLACEHOLDER_STEPS;
}

function toFiniteNumber(raw: unknown): number | null {
    if (typeof raw === 'number' && Number.isFinite(raw)) {
        return raw;
    }
    if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (!trimmed) {
            return null;
        }
        const n = Number(trimmed);
        if (Number.isFinite(n)) {
            return n;
        }
    }
    if (raw != null && typeof raw === 'object') {
        const valueOf = (raw as { valueOf?: () => unknown }).valueOf;
        if (typeof valueOf === 'function') {
            const n = Number(valueOf.call(raw));
            if (Number.isFinite(n)) {
                return n;
            }
        }
    }
    return null;
}

function normalizeLevelId(raw: unknown): number | null {
    const n = toFiniteNumber(raw);
    if (n == null) {
        return null;
    }
    const id = Math.trunc(n);
    return id > 0 ? id : null;
}

function normalizeBestSteps(raw: unknown): number | null {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        const steps = (raw as Record<string, unknown>).bestSteps;
        const nested = normalizeBestSteps(steps);
        if (nested != null) {
            return nested;
        }
    }
    const n = toFiniteNumber(raw);
    if (n == null) {
        return null;
    }
    return Math.max(0, Math.floor(n));
}

/** 微信端勿依赖 Map（部分基础库实现异常）；用 plain object 聚合 */
type LevelClearPairMap = Record<number, number>;

function putLevelClearPair(pairMap: LevelClearPairMap, levelId: number, steps: number): void {
    if (levelId <= 0) {
        return;
    }
    const prev = pairMap[levelId];
    if (prev === undefined || steps < prev) {
        pairMap[levelId] = steps;
    }
}

function buildSortedFlatPairs(pairMap: LevelClearPairMap): OpticalLevelClearsFlat {
    const sortedIds = Object.keys(pairMap)
        .map((k) => Number.parseInt(k, 10))
        .filter((id) => Number.isFinite(id) && id > 0)
        .sort((a, b) => a - b);
    const out: OpticalLevelClearsFlat = [];
    for (const id of sortedIds) {
        const steps = pairMap[id];
        if (steps != null && Number.isFinite(steps)) {
            out.push(id, steps);
        }
    }
    return out;
}

/**
 * 从 JSON 还原 flat 数组；兼容 Array、类数组（含 length）、数字键对象。
 * 微信端 JSON.parse 后的数组偶发 `Array.isArray === false` 或仅有 length 可枚举。
 */
function extractFlatPairValues(raw: unknown): unknown[] | null {
    if (raw == null) {
        return null;
    }

    if (Array.isArray(raw)) {
        return Array.from(raw);
    }

    if (typeof raw !== 'object') {
        return null;
    }

    const obj = raw as Record<string | number, unknown> & { length?: unknown };

    const lengthValue = toFiniteNumber(obj.length);
    if (lengthValue != null && lengthValue >= 0) {
        const len = Math.floor(lengthValue);
        if (len > 0 && len % 2 === 0) {
            const fromLength: unknown[] = [];
            let hasValue = false;
            for (let i = 0; i < len; i++) {
                const v = obj[i];
                fromLength.push(v);
                if (v !== undefined && v !== null) {
                    hasValue = true;
                }
            }
            if (hasValue) {
                return fromLength;
            }
        }
    }

    const numericKeys = Object.keys(obj)
        .filter((k) => /^\d+$/.test(k))
        .sort((a, b) => Number(a) - Number(b));
    if (numericKeys.length > 0 && numericKeys[0] === '0') {
        return numericKeys.map((k) => obj[k]);
    }

    return null;
}

function ingestLegacyLevelMap(raw: Record<string, unknown>, pairMap: LevelClearPairMap): void {
    for (const [key, value] of Object.entries(raw)) {
        if (key === 'length') {
            continue;
        }
        const levelId = Number.parseInt(key, 10);
        const steps = normalizeBestSteps(value);
        if (Number.isFinite(levelId) && levelId > 0 && steps != null) {
            putLevelClearPair(pairMap, levelId, steps);
        }
    }
}

function ingestFlatPairs(values: unknown[], pairMap: LevelClearPairMap): void {
    for (let i = 0; i + 1 < values.length; i += 2) {
        const levelId = normalizeLevelId(values[i]);
        const steps = normalizeBestSteps(values[i + 1]);
        if (levelId != null && steps != null) {
            putLevelClearPair(pairMap, levelId, steps);
        }
    }
}

/** 已是合法 flat number 数组时直接拷贝，避免二次聚合丢数据 */
function tryCopyValidFlatClears(raw: unknown): OpticalLevelClearsFlat | null {
    const values = extractFlatPairValues(raw);
    if (!values || values.length === 0 || values.length % 2 !== 0) {
        return null;
    }
    const out: OpticalLevelClearsFlat = [];
    for (let i = 0; i + 1 < values.length; i += 2) {
        const levelId = normalizeLevelId(values[i]);
        const steps = normalizeBestSteps(values[i + 1]);
        if (levelId == null || steps == null) {
            return null;
        }
        out.push(levelId, steps);
    }
    return out;
}

/** 读档合并：支持 flat 数组、JSON 字符串数组、旧版 `{ "1": { bestSteps } }`、过渡版 `{ "1": 4 }` */
export function mergeOpticalLevelClears(raw: unknown): OpticalLevelClearsFlat {
    if (raw == null) {
        return [];
    }

    if (typeof raw === 'string') {
        const trimmed = raw.trim().replace(/^\uFEFF/, '');
        if (!trimmed) {
            return [];
        }
        try {
            return mergeOpticalLevelClears(JSON.parse(trimmed));
        } catch (e) {
            console.warn('[OpticalPlayerPersist] opticalLevelClears 字符串解析失败', trimmed.slice(0, 120), e);
            return [];
        }
    }

    const quick = tryCopyValidFlatClears(raw);
    if (quick && quick.length > 0) {
        return quick;
    }

    const pairMap: LevelClearPairMap = {};
    const flatValues = extractFlatPairValues(raw);
    if (flatValues) {
        ingestFlatPairs(flatValues, pairMap);
    } else if (typeof raw === 'object') {
        ingestLegacyLevelMap(raw as Record<string, unknown>, pairMap);
    }

    const built = buildSortedFlatPairs(pairMap);
    if (built.length > 0) {
        return built;
    }

    // 微信端：parse 后的 Array 可能 length 正确但下标读不到，stringify 再 parse 可恢复
    try {
        const roundTrip = JSON.stringify(raw);
        if (roundTrip.startsWith('[')) {
            const viaJson = mergeOpticalLevelClears(roundTrip);
            if (viaJson.length > 0) {
                return viaJson;
            }
        }
    } catch {
        /* ignore */
    }

    return built;
}

/** 从完整存档 JSON 文本中提取 opticalLevelClears（parse 后数组异常时的兜底） */
export function mergeOpticalLevelClearsFromPlayerJsonText(jsonText: string): OpticalLevelClearsFlat {
    const match = jsonText.match(/"opticalLevelClears"\s*:\s*(\[[\d\s,]*\])/);
    if (!match) {
        return [];
    }
    try {
        return mergeOpticalLevelClears(match[1]);
    } catch {
        return [];
    }
}

export function getOpticalLevelRawStepsFromFlat(
    clears: OpticalLevelClearsFlat,
    levelId: number,
): number | null {
    const id = Math.trunc(levelId);
    const normalized = mergeOpticalLevelClears(clears);
    for (let i = 0; i + 1 < normalized.length; i += 2) {
        if (normalized[i] === id) {
            return normalized[i + 1];
        }
    }
    return null;
}

/** 是否在 clears 中有该关记录（含仅解锁占位） */
export function hasOpticalLevelRecordInFlat(clears: OpticalLevelClearsFlat, levelId: number): boolean {
    return getOpticalLevelRawStepsFromFlat(clears, levelId) != null;
}

export function isOpticalLevelUnlockedInFlat(clears: OpticalLevelClearsFlat, levelId: number): boolean {
    return hasOpticalLevelRecordInFlat(clears, levelId);
}

/** 真实通关最少步数；仅解锁占位返回 null */
export function getOpticalLevelBestStepsFromFlat(
    clears: OpticalLevelClearsFlat,
    levelId: number,
): number | null {
    const raw = getOpticalLevelRawStepsFromFlat(clears, levelId);
    if (raw == null || isOpticalUnlockPlaceholderSteps(raw)) {
        return null;
    }
    return raw;
}

export function isOpticalLevelClearedInFlat(clears: OpticalLevelClearsFlat, levelId: number): boolean {
    return getOpticalLevelBestStepsFromFlat(clears, levelId) != null;
}

/** 写入/刷新最少步数（更少才更新）；始终返回规范化后的新 flat 数组，避免污染原数组 */
export function upsertOpticalLevelBestSteps(
    clears: OpticalLevelClearsFlat,
    levelId: number,
    steps: number,
): { changed: boolean; clears: OpticalLevelClearsFlat } {
    const id = Math.trunc(levelId);
    const bestSteps = Math.max(0, Math.floor(steps));
    if (id <= 0) {
        return { changed: false, clears: mergeOpticalLevelClears(clears) };
    }

    const next = mergeOpticalLevelClears(clears);
    for (let i = 0; i + 1 < next.length; i += 2) {
        if (next[i] !== id) {
            continue;
        }
        if (bestSteps >= next[i + 1]) {
            return { changed: false, clears: next };
        }
        next[i + 1] = bestSteps;
        return { changed: true, clears: next };
    }

    next.push(id, bestSteps);
    return { changed: true, clears: next };
}

/** 该关尚无记录时写入解锁占位；已有记录（含真实步数）则不覆盖 */
export function ensureOpticalLevelUnlockInFlat(
    clears: OpticalLevelClearsFlat,
    levelId: number,
): { changed: boolean; clears: OpticalLevelClearsFlat } {
    const id = Math.trunc(levelId);
    if (id <= 0) {
        return { changed: false, clears: mergeOpticalLevelClears(clears) };
    }
    if (hasOpticalLevelRecordInFlat(clears, id)) {
        return { changed: false, clears: mergeOpticalLevelClears(clears) };
    }
    const next = mergeOpticalLevelClears(clears);
    next.push(id, OPTICAL_LEVEL_UNLOCK_PLACEHOLDER_STEPS);
    return { changed: true, clears: next };
}

/** 通关后：若存在下一关且下一关尚无记录，则写入 (nextId, 999999) */
export function markNextOpticalLevelUnlockedIfAbsent(
    clears: OpticalLevelClearsFlat,
    clearedLevelId: number,
): { changed: boolean; clears: OpticalLevelClearsFlat } {
    const nextId = getNextOpticalLevelId(Math.trunc(clearedLevelId));
    if (nextId == null) {
        return { changed: false, clears: mergeOpticalLevelClears(clears) };
    }
    return ensureOpticalLevelUnlockInFlat(clears, nextId);
}

/** 新档 / 旧档无第 1 关记录时，保证第 1 关可玩 */
export function ensureDefaultFirstLevelUnlock(clears: OpticalLevelClearsFlat): OpticalLevelClearsFlat {
    const { changed, clears: next } = ensureOpticalLevelUnlockInFlat(clears, 1);
    return changed ? next : mergeOpticalLevelClears(clears);
}

/** @deprecated 仅诊断用：clears 中出现过的最大 levelId；选关解锁请用 isOpticalLevelUnlockedInFlat */
export function resolveOpticalMaxUnlockedLevelId(
    opticalCurrentLevelId: number,
    clears: OpticalLevelClearsFlat,
): number {
    const normalized = mergeOpticalLevelClears(clears);
    let maxId = normalized.length === 0 ? Math.max(1, Math.trunc(opticalCurrentLevelId)) : 1;
    for (let i = 0; i + 1 < normalized.length; i += 2) {
        const id = normalized[i];
        if (Number.isFinite(id) && id > 0) {
            maxId = Math.max(maxId, id);
        }
    }
    return maxId;
}
