import { getNextOpticalLevelId } from '../Config/OpticalPuzzleLevels';

/**
 * 已通关关卡最少步数表（紧凑存储）。
 * 扁平数组 `[levelId, bestSteps, levelId, bestSteps, …]`，JSON 里全是 number，无重复字段名。
 * 缺某 levelId = 未通关；后续新增关卡 id 无需迁移旧档。
 */
export type OpticalLevelClearsFlat = number[];

function normalizeLevelId(raw: unknown): number | null {
    if (typeof raw === 'number' && Number.isFinite(raw)) {
        return Math.trunc(raw);
    }
    if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (!trimmed) {
            return null;
        }
        const n = Number.parseInt(trimmed, 10);
        if (Number.isFinite(n)) {
            return n;
        }
    }
    return null;
}

function normalizeBestSteps(raw: unknown): number | null {
    if (typeof raw === 'number' && Number.isFinite(raw)) {
        return Math.max(0, Math.floor(raw));
    }
    if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (!trimmed) {
            return null;
        }
        const n = Number.parseInt(trimmed, 10);
        if (Number.isFinite(n)) {
            return Math.max(0, n);
        }
    }
    if (raw && typeof raw === 'object') {
        const steps = (raw as Record<string, unknown>).bestSteps;
        if (typeof steps === 'number' && Number.isFinite(steps)) {
            return Math.max(0, Math.floor(steps));
        }
        if (typeof steps === 'string') {
            return normalizeBestSteps(steps);
        }
    }
    return null;
}

/** 读档合并：支持 flat 数组、JSON 字符串数组、旧版 `{ "1": { bestSteps } }`、过渡版 `{ "1": 4 }` */
export function mergeOpticalLevelClears(raw: unknown): OpticalLevelClearsFlat {
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

    const pairMap = new Map<number, number>();

    const put = (levelId: number, steps: number): void => {
        if (levelId <= 0) {
            return;
        }
        const prev = pairMap.get(levelId);
        if (prev === undefined || steps < prev) {
            pairMap.set(levelId, steps);
        }
    };

    if (Array.isArray(raw)) {
        for (let i = 0; i + 1 < raw.length; i += 2) {
            const levelId = normalizeLevelId(raw[i]);
            const steps = normalizeBestSteps(raw[i + 1]);
            if (levelId != null && levelId > 0 && steps != null) {
                put(levelId, steps);
            }
        }
    } else if (raw && typeof raw === 'object') {
        for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
            const levelId = Number.parseInt(key, 10);
            const steps = normalizeBestSteps(value);
            if (Number.isFinite(levelId) && steps != null) {
                put(levelId, steps);
            }
        }
    }

    const sortedIds = [...pairMap.keys()].sort((a, b) => a - b);
    const out: OpticalLevelClearsFlat = [];
    for (const id of sortedIds) {
        out.push(id, pairMap.get(id)!);
    }
    return out;
}

export function getOpticalLevelBestStepsFromFlat(
    clears: OpticalLevelClearsFlat,
    levelId: number,
): number | null {
    const id = Math.trunc(levelId);
    for (let i = 0; i + 1 < clears.length; i += 2) {
        if (clears[i] === id) {
            return clears[i + 1];
        }
    }
    return null;
}

export function isOpticalLevelClearedInFlat(clears: OpticalLevelClearsFlat, levelId: number): boolean {
    return getOpticalLevelBestStepsFromFlat(clears, levelId) != null;
}

/** 写入/刷新最少步数（更少才更新）；返回是否变更 */
export function upsertOpticalLevelBestSteps(
    clears: OpticalLevelClearsFlat,
    levelId: number,
    steps: number,
): boolean {
    const id = Math.trunc(levelId);
    const bestSteps = Math.max(0, Math.floor(steps));
    if (id <= 0) {
        return false;
    }
    for (let i = 0; i + 1 < clears.length; i += 2) {
        if (clears[i] !== id) {
            continue;
        }
        if (bestSteps >= clears[i + 1]) {
            return false;
        }
        clears[i + 1] = bestSteps;
        return true;
    }
    clears.push(id, bestSteps);
    return true;
}

/** 由通关表推算解锁前沿；无 clears 时用 opticalCurrentLevelId 兼容旧档（旧版曾混用该字段表示解锁） */
export function resolveOpticalMaxUnlockedLevelId(
    opticalCurrentLevelId: number,
    clears: OpticalLevelClearsFlat,
): number {
    let frontier = 1;
    if (clears.length === 0) {
        frontier = Math.max(1, Math.trunc(opticalCurrentLevelId));
    }
    for (let i = 0; i + 1 < clears.length; i += 2) {
        const clearedId = clears[i];
        if (!Number.isFinite(clearedId) || clearedId <= 0) {
            continue;
        }
        const nextId = getNextOpticalLevelId(clearedId);
        if (nextId != null) {
            frontier = Math.max(frontier, nextId);
        } else {
            frontier = Math.max(frontier, clearedId);
        }
    }
    return frontier;
}
