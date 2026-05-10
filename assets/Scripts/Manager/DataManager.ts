import { sys } from 'cc';
import { GAME_STATE_ENUM } from '../Utils/Enum';

const PLAYER_DATA_STORAGE_KEY = 'LightPuzzle_player_v1';

/** 持久化数据结构（可按玩法扩展字段） */
export interface IPlayerPersistData {
    /** 光学解谜当前解锁关卡 id（占位） */
    opticalCurrentLevelId: string;
    bgmOn: boolean;
    sfxOn: boolean;
}

const DEFAULT_DATA: IPlayerPersistData = {
    opticalCurrentLevelId: 'dev_minimal',
    bgmOn: true,
    sfxOn: true,
};

function mergePlayerData(raw: unknown): IPlayerPersistData {
    if (!raw || typeof raw !== 'object') {
        return { ...DEFAULT_DATA };
    }
    const o = raw as Record<string, unknown>;
    return {
        opticalCurrentLevelId:
            typeof o.opticalCurrentLevelId === 'string'
                ? o.opticalCurrentLevelId
                : DEFAULT_DATA.opticalCurrentLevelId,
        bgmOn: typeof o.bgmOn === 'boolean' ? o.bgmOn : DEFAULT_DATA.bgmOn,
        sfxOn: typeof o.sfxOn === 'boolean' ? o.sfxOn : DEFAULT_DATA.sfxOn,
    };
}

/**
 * 全局数据（单例）。与 project-rules 一致：重要字段经 setter 可触发 save。
 */
export class DataManager {
    private static _instance: DataManager | null = null;

    static get instance(): DataManager {
        if (this._instance === null) {
            this._instance = new DataManager();
        }
        return this._instance;
    }

    /** 与规则示例一致：全局游戏状态 */
    gameStatus: GAME_STATE_ENUM = GAME_STATE_ENUM.INIT;

    private _data: IPlayerPersistData = { ...DEFAULT_DATA };

    get opticalCurrentLevelId(): string {
        return this._data.opticalCurrentLevelId;
    }

    set opticalCurrentLevelId(id: string) {
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
            sys.localStorage.setItem(PLAYER_DATA_STORAGE_KEY, JSON.stringify(this._data));
        } catch (e) {
            console.warn('[DataManager] save failed', e);
        }
    }

    restore(): void {
        try {
            const raw = sys.localStorage.getItem(PLAYER_DATA_STORAGE_KEY);
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
