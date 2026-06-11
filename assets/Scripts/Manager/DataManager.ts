import { sys } from 'cc';
import { MOCK_PLAYER_DATA, USE_DEBUG_MOCK_SAVE } from '../Config/DebugMockSave';
import {
    getOpticalLevelBestStepsFromFlat,
    isOpticalLevelClearedInFlat,
    mergeOpticalLevelClears,
    OpticalLevelClearsFlat,
    resolveOpticalMaxUnlockedLevelId,
    upsertOpticalLevelBestSteps,
} from '../Games/OpticalPuzzle/Infrastructure/OpticalPlayerPersist';
import { GAME_STATE_ENUM } from '../Utils/Enum';

export type { OpticalLevelClearsFlat } from '../Games/OpticalPuzzle/Infrastructure/OpticalPlayerPersist';

const PLAYER_DATA_STORAGE_KEY = 'LightPuzzle_player_v1';

/** 旧版字符串关卡 id → 现用整数 id（读档兼容） */
const LEGACY_OPTICAL_LEVEL_ID: Readonly<Record<string, number>> = {
    dev_minimal: 0,
    lvl_01_tutorial: 1,
    lvl_02_cross: 2,
    lvl_03_corridor: 3,
    lvl_04_gate: 4,
    lvl_05_source_target: 5,
    lvl_06_dual_targets: 6,
};

/** 持久化数据结构（可按玩法扩展字段） */
export interface IPlayerPersistData {
    /**
     * 继续游戏 / 上次退出时的关卡 id（菜单「开始游戏」、选关选中的关卡）。
     * 与解锁无关；解锁见 opticalLevelClears + getOpticalMaxUnlockedLevelId()。
     */
    opticalCurrentLevelId: number;
    /**
     * 已通关关卡最少步数：`[levelId, bestSteps, …]` 扁平 number 数组（紧凑 JSON）。
     */
    opticalLevelClears: OpticalLevelClearsFlat;
    bgmOn: boolean;
    sfxOn: boolean;
}

/** 新玩家默认存档（无本地档时使用） */
function cloneDefaultData(): IPlayerPersistData {
    return {
        opticalCurrentLevelId: DEFAULT_DATA.opticalCurrentLevelId,
        opticalLevelClears: [],
        bgmOn: DEFAULT_DATA.bgmOn,
        sfxOn: DEFAULT_DATA.sfxOn,
    };
}

/** 微信端或手动开启时打印存档诊断（Console 搜 [DataManager]） */
function shouldLogSaveDebug(): boolean {
    return sys.platform === sys.Platform.WECHAT_GAME
        || !!(globalThis as { LIGHT_PUZZLE_SAVE_DEBUG?: boolean }).LIGHT_PUZZLE_SAVE_DEBUG;
}

function logSaveDebug(message: string, detail?: unknown): void {
    if (!shouldLogSaveDebug()) {
        return;
    }
    if (detail === undefined) {
        console.log(`[DataManager] ${message}`);
        return;
    }
    console.log(`[DataManager] ${message}`, detail);
}

function summarizeClears(clears: OpticalLevelClearsFlat): string {
    const pairs: string[] = [];
    for (let i = 0; i + 1 < clears.length; i += 2) {
        pairs.push(`${clears[i]}:${clears[i + 1]}`);
    }
    return pairs.length > 0 ? pairs.join(',') : '(empty)';
}

/** 微信小游戏仅用 sys.localStorage（wx 存储）；浏览器预览才双读 window */
function isWeChatMiniGameStorage(): boolean {
    return sys.platform === sys.Platform.WECHAT_GAME;
}

function readRawStorageValue(key: string): unknown {
    if (isWeChatMiniGameStorage()) {
        try {
            return sys.localStorage.getItem(key);
        } catch (e) {
            logSaveDebug('wechat getItem failed', e);
            return null;
        }
    }

    let fromSys: unknown = null;
    let fromGlobal: unknown = null;
    try {
        fromSys = sys.localStorage.getItem(key);
        if (fromSys === '' || fromSys === undefined) {
            fromSys = null;
        }
    } catch {
        /* ignore */
    }
    try {
        const gl = (globalThis as { localStorage?: Storage }).localStorage;
        if (gl && typeof gl.getItem === 'function') {
            fromGlobal = gl.getItem(key);
            if (fromGlobal === '' || fromGlobal === undefined) {
                fromGlobal = null;
            }
        }
    } catch {
        /* ignore */
    }
    if (fromSys != null && fromGlobal != null && fromSys !== fromGlobal) {
        console.warn('[DataManager] sys 与 window.localStorage 同一 key 不一致，使用 window 中的值');
        return fromGlobal;
    }
    return fromGlobal ?? fromSys;
}

/**
 * 解析本地档：支持 JSON 字符串、微信已反序列化的 object、BOM、URI 编码字符串。
 */
function parseStoragePayload(raw: unknown): Record<string, unknown> | null {
    if (raw == null || raw === '') {
        return null;
    }
    if (typeof raw === 'object' && !Array.isArray(raw)) {
        return raw as Record<string, unknown>;
    }
    if (typeof raw !== 'string') {
        logSaveDebug('storage raw 类型异常', typeof raw);
        return null;
    }

    let text = raw.trim().replace(/^\uFEFF/, '');
    if (!text) {
        return null;
    }

    const tryParse = (s: string): Record<string, unknown> | null => {
        try {
            const parsed = JSON.parse(s);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return parsed as Record<string, unknown>;
            }
            logSaveDebug('JSON 根节点不是 object', parsed);
        } catch (e) {
            logSaveDebug('JSON.parse 失败', { head: s.slice(0, 160), error: e });
        }
        return null;
    };

    const direct = tryParse(text);
    if (direct) {
        return direct;
    }

    if (/%7B|%22/i.test(text)) {
        try {
            const decoded = decodeURIComponent(text);
            const fromUri = tryParse(decoded);
            if (fromUri) {
                logSaveDebug('storage 经 URI 解码后读档成功');
                return fromUri;
            }
        } catch (e) {
            logSaveDebug('URI 解码失败', e);
        }
    }

    return null;
}

function readStoragePayload(key: string): Record<string, unknown> | null {
    const raw = readRawStorageValue(key);
    logSaveDebug('read raw', {
        type: typeof raw,
        preview: typeof raw === 'string' ? raw.slice(0, 160) : raw,
    });
    return parseStoragePayload(raw);
}

/** 新玩家默认存档字段（无本地档时使用） */
const DEFAULT_DATA: IPlayerPersistData = {
    opticalCurrentLevelId: 1,
    opticalLevelClears: [],
    bgmOn: true,
    sfxOn: true,
};

function setStorageItem(key: string, value: string): void {
    if (isWeChatMiniGameStorage()) {
        try {
            sys.localStorage.setItem(key, value);
            logSaveDebug('save wechat ok', {
                bytes: value.length,
                clears: value.includes('opticalLevelClears') ? 'present' : 'missing',
            });
        } catch (e) {
            console.warn('[DataManager] save failed (wechat)', e);
        }
        return;
    }

    try {
        sys.localStorage.setItem(key, value);
    } catch {
        /* ignore */
    }
    try {
        const gl = (globalThis as { localStorage?: Storage }).localStorage;
        if (gl && typeof gl.setItem === 'function') {
            gl.setItem(key, value);
        }
    } catch {
        /* ignore */
    }
}

function mergeOpticalCurrentLevelId(raw: unknown): number {
    if (typeof raw === 'number' && Number.isFinite(raw)) {
        return Math.trunc(raw);
    }
    if (typeof raw === 'string') {
        const trimmed = raw.trim();
        const legacy = LEGACY_OPTICAL_LEVEL_ID[trimmed];
        if (legacy !== undefined) {
            return legacy;
        }
        const n = Number.parseInt(trimmed, 10);
        if (Number.isFinite(n)) {
            return n;
        }
    }
    return DEFAULT_DATA.opticalCurrentLevelId;
}

function mergePlayerData(raw: unknown): IPlayerPersistData {
    if (!raw || typeof raw !== 'object') {
        return cloneDefaultData();
    }
    const o = raw as Record<string, unknown>;
    const opticalCurrentLevelId = mergeOpticalCurrentLevelId(o.opticalCurrentLevelId);
    const opticalLevelClears = mergeOpticalLevelClears(o.opticalLevelClears);
    const merged: IPlayerPersistData = {
        opticalCurrentLevelId,
        opticalLevelClears,
        bgmOn: typeof o.bgmOn === 'boolean' ? o.bgmOn : DEFAULT_DATA.bgmOn,
        sfxOn: typeof o.sfxOn === 'boolean' ? o.sfxOn : DEFAULT_DATA.sfxOn,
    };
    logSaveDebug('mergePlayerData', {
        currentLevelId: merged.opticalCurrentLevelId,
        clears: summarizeClears(merged.opticalLevelClears),
        rawClearsType: typeof o.opticalLevelClears,
        rawClearsPreview: typeof o.opticalLevelClears === 'string'
            ? (o.opticalLevelClears as string).slice(0, 120)
            : o.opticalLevelClears,
    });
    return merged;
}

/**
 * 全局数据（单例）。与 project-rules 一致：重要字段经 setter 可触发 save。
 */
export class DataManager {
    private static _instance: DataManager | null = null;

    /** USE_DEBUG_MOCK_SAVE 时仅第一次 init 写入 mock */
    private static _debugMockSeededThisRun = false;

    /** 是否已成功从本地读过至少一次（避免微信端二次 restore 读空覆盖内存） */
    private _everRestoredFromDisk = false;

    static get instance(): DataManager {
        if (this._instance === null) {
            this._instance = new DataManager();
        }
        return this._instance;
    }

    /** 与规则示例一致：全局游戏状态 */
    gameStatus: GAME_STATE_ENUM = GAME_STATE_ENUM.INIT;

    private _data: IPlayerPersistData = cloneDefaultData();

    /** 诊断：当前内存中通关记录条数 */
    getOpticalLevelClearPairCount(): number {
        return Math.floor(this._data.opticalLevelClears.length / 2);
    }

    get opticalCurrentLevelId(): number {
        return this._data.opticalCurrentLevelId;
    }

    set opticalCurrentLevelId(id: number) {
        if (this._data.opticalCurrentLevelId === id) {
            return;
        }
        this._data.opticalCurrentLevelId = id;
        this.save();
    }

    get bgmOn(): boolean {
        return this._data.bgmOn;
    }

    set bgmOn(v: boolean) {
        this._data.bgmOn = v;
        this.save();
    }

    get sfxOn(): boolean {
        return this._data.sfxOn;
    }

    set sfxOn(v: boolean) {
        this._data.sfxOn = v;
        this.save();
    }

    reset(): void {
        this._data = cloneDefaultData();
        this.gameStatus = GAME_STATE_ENUM.INIT;
        this.save();
    }

    /** 解锁前沿（由通关记录推算；无 clears 时回退 opticalCurrentLevelId 以兼容旧档） */
    getOpticalMaxUnlockedLevelId(): number {
        return resolveOpticalMaxUnlockedLevelId(
            this._data.opticalCurrentLevelId,
            this._data.opticalLevelClears,
        );
    }

    isOpticalLevelCleared(levelId: number): boolean {
        return isOpticalLevelClearedInFlat(this._data.opticalLevelClears, levelId);
    }

    getOpticalLevelBestSteps(levelId: number): number | null {
        return getOpticalLevelBestStepsFromFlat(this._data.opticalLevelClears, levelId);
    }

    /** 关卡通关：仅写入/刷新最少步数；不修改 opticalCurrentLevelId（继续关卡由选关/下一关按钮等单独设置） */
    recordOpticalLevelClear(levelId: number, steps: number): void {
        const id = Math.trunc(levelId);
        if (id <= 0) {
            return;
        }
        const changed = upsertOpticalLevelBestSteps(this._data.opticalLevelClears, id, steps);
        logSaveDebug('recordOpticalLevelClear', {
            levelId: id,
            steps,
            changed,
            clears: summarizeClears(this._data.opticalLevelClears),
        });
        this.save();
    }

    save(): void {
        try {
            const json = JSON.stringify(this._data);
            setStorageItem(PLAYER_DATA_STORAGE_KEY, json);
            if (isWeChatMiniGameStorage()) {
                const verify = parseStoragePayload(readRawStorageValue(PLAYER_DATA_STORAGE_KEY));
                const verifyClears = verify
                    ? mergeOpticalLevelClears(verify.opticalLevelClears)
                    : [];
                logSaveDebug('save verify readback', {
                    ok: verify != null,
                    clears: summarizeClears(verifyClears),
                });
            }
        } catch (e) {
            console.warn('[DataManager] save failed', e);
        }
    }

    /**
     * 初始化：可选首次写入 mock 到本地，再 restore 合并默认存档。
     */
    init(): void {
        if (USE_DEBUG_MOCK_SAVE && !DataManager._debugMockSeededThisRun) {
            try {
                setStorageItem(PLAYER_DATA_STORAGE_KEY, JSON.stringify(MOCK_PLAYER_DATA));
                DataManager._debugMockSeededThisRun = true;
            } catch (e) {
                console.warn('[DataManager] 调试写入本地存档失败', e);
            }
        }
        this.restore();
    }

    restore(): void {
        try {
            const parsed = readStoragePayload(PLAYER_DATA_STORAGE_KEY);
            if (!parsed) {
                if (!this._everRestoredFromDisk) {
                    this._data = cloneDefaultData();
                    logSaveDebug('restore: 无本地档，使用默认');
                } else {
                    logSaveDebug('restore: 读档为空，保留内存', {
                        currentLevelId: this._data.opticalCurrentLevelId,
                        clears: summarizeClears(this._data.opticalLevelClears),
                    });
                }
                this._everRestoredFromDisk = true;
                return;
            }
            this._data = mergePlayerData(parsed);
            this._everRestoredFromDisk = true;
        } catch (e) {
            console.warn('[DataManager] restore failed', e);
            if (!this._everRestoredFromDisk) {
                this._data = cloneDefaultData();
            }
            this._everRestoredFromDisk = true;
        }
    }
}
