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
const DEFAULT_DATA: IPlayerPersistData = {
    opticalCurrentLevelId: 1,
    opticalLevelClears: [],
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
        return { ...DEFAULT_DATA, opticalLevelClears: [] };
    }
    const o = raw as Record<string, unknown>;
    const opticalCurrentLevelId = mergeOpticalCurrentLevelId(o.opticalCurrentLevelId);
    const opticalLevelClears = mergeOpticalLevelClears(o.opticalLevelClears);
    return {
        opticalCurrentLevelId,
        opticalLevelClears,
        bgmOn: typeof o.bgmOn === 'boolean' ? o.bgmOn : DEFAULT_DATA.bgmOn,
        sfxOn: typeof o.sfxOn === 'boolean' ? o.sfxOn : DEFAULT_DATA.sfxOn,
    };
}

/**
 * 全局数据（单例）。与 project-rules 一致：重要字段经 setter 可触发 save。
 */
export class DataManager {
    private static _instance: DataManager | null = null;

    /** USE_DEBUG_MOCK_SAVE 时仅第一次 init 写入 mock */
    private static _debugMockSeededThisRun = false;

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
        this._data = { ...DEFAULT_DATA, opticalLevelClears: [] };
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
        upsertOpticalLevelBestSteps(this._data.opticalLevelClears, id, steps);
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
