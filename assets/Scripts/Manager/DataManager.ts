import { sys } from 'cc';
import { MOCK_PLAYER_DATA, USE_DEBUG_MOCK_SAVE } from '../Config/DebugMockSave';
import { GAME_STATE_ENUM } from '../Utils/Enum';

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
    /** 光学解谜当前关卡整数 id，与 `IOpticalLevelLayeredSource.levelId` 对齐 */
    opticalCurrentLevelId: number;
    bgmOn: boolean;
    sfxOn: boolean;
}

/** 新玩家默认存档（无本地档时使用） */
const DEFAULT_DATA: IPlayerPersistData = {
    opticalCurrentLevelId: 1,
    bgmOn: true,
    sfxOn: true,
};

/** 浏览器预览里 sys 与 window.localStorage 可能不同步，统一读写 */
function getStorageItem(key: string): string | null {
    let fromSys: string | null = null;
    let fromGlobal: string | null = null;
    try {
        const a = sys.localStorage.getItem(key);
        if (a != null && a !== '') {
            fromSys = a;
        }
    } catch {
        /* ignore */
    }
    try {
        const gl = (globalThis as { localStorage?: Storage }).localStorage;
        if (gl && typeof gl.getItem === 'function') {
            const b = gl.getItem(key);
            if (b != null && b !== '') {
                fromGlobal = b;
            }
        }
    } catch {
        /* ignore */
    }
    if (fromSys && fromGlobal && fromSys !== fromGlobal) {
        console.warn('[DataManager] sys 与 window.localStorage 同一 key 不一致，使用 window 中的值');
        return fromGlobal;
    }
    return fromGlobal ?? fromSys;
}

function setStorageItem(key: string, value: string): void {
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
        return LEGACY_OPTICAL_LEVEL_ID[raw] ?? DEFAULT_DATA.opticalCurrentLevelId;
    }
    return DEFAULT_DATA.opticalCurrentLevelId;
}

function mergePlayerData(raw: unknown): IPlayerPersistData {
    if (!raw || typeof raw !== 'object') {
        return { ...DEFAULT_DATA };
    }
    const o = raw as Record<string, unknown>;
    return {
        opticalCurrentLevelId: mergeOpticalCurrentLevelId(o.opticalCurrentLevelId),
        bgmOn: typeof o.bgmOn === 'boolean' ? o.bgmOn : DEFAULT_DATA.bgmOn,
        sfxOn: typeof o.sfxOn === 'boolean' ? o.sfxOn : DEFAULT_DATA.sfxOn,
    };
}

/**
 * 全局数据（单例）。与 project-rules 一致：重要字段经 setter 可触发 save。
 */
export class DataManager {
    private static _instance: DataManager | null = null;

    /** 本进程是否已执行过 init（避免切场景再次 restore / 重复套 mock） */
    private static _initializedThisRun = false;

    static get instance(): DataManager {
        if (this._instance === null) {
            this._instance = new DataManager();
        }
        return this._instance;
    }

    /** 与规则示例一致：全局游戏状态 */
    gameStatus: GAME_STATE_ENUM = GAME_STATE_ENUM.INIT;

    private _data: IPlayerPersistData = { ...DEFAULT_DATA };

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
        this._data = { ...DEFAULT_DATA };
        this.gameStatus = GAME_STATE_ENUM.INIT;
        this.save();
    }

    save(): void {
        try {
            setStorageItem(PLAYER_DATA_STORAGE_KEY, JSON.stringify(this._data));
        } catch (e) {
            console.warn('[DataManager] save failed', e);
        }
    }

    /**
     * 初始化：进程内仅执行一次。先读本地档合并默认值，再可选把 mock 覆盖进内存（不落盘）。
     */
    init(): void {
        if (DataManager._initializedThisRun) {
            return;
        }
        DataManager._initializedThisRun = true;

        this.restore();

        if (USE_DEBUG_MOCK_SAVE) {
            this._applyDebugMockToMemory();
        }
    }

    /** 将 MOCK_PLAYER_DATA 合并进内存，不触发 save */
    private _applyDebugMockToMemory(): void {
        this._data = mergePlayerData({ ...this._data, ...MOCK_PLAYER_DATA });
    }

    restore(): void {
        try {
            const raw = getStorageItem(PLAYER_DATA_STORAGE_KEY);
            if (!raw) {
                this._data = { ...DEFAULT_DATA };
                return;
            }
            this._data = mergePlayerData(JSON.parse(raw));
        } catch (e) {
            console.warn('[DataManager] restore failed', e);
            this._data = { ...DEFAULT_DATA };
        }
    }
}
