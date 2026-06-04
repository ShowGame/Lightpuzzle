import { director } from 'cc';
import { EVENT_ENUM, SCENE_ENUM } from './Enum';
import { PLAY_BGM } from './Event';

/**
 * 微信小游戏流量主 — 激励视频（参考 MemoMaster）。
 * 文档：https://developers.weixin.qq.com/minigame/dev/api/ad/wx.createRewardedVideoAd.html
 */

const LOG = '[WeChatMiniGameAds]';

/**
 * 开发测试：true 时不拉真实广告，直接 resolve true。
 * 发版前务必改回 false。
 */
export let USE_DEBUG_MOCK_REWARDED_AD_SUCCESS = true;//mock广告返回true

/** 激励式视频广告位 id（流量主后台；留空则 show 直接 resolve false） */
export let WECHAT_REWARDED_VIDEO_AD_UNIT_ID = '';

interface RewardedVideoCloseResult {
    isEnded?: boolean;
}

interface IRewardedVideoAd {
    load(): Promise<void>;
    show(): Promise<void>;
    onClose(listener: (res?: RewardedVideoCloseResult) => void): void;
    offClose(listener: (res?: RewardedVideoCloseResult) => void): void;
    onError(listener: (err: unknown) => void): void;
}

interface IWxAds {
    createRewardedVideoAd?(opt: { adUnitId: string; multiton?: boolean }): IRewardedVideoAd | null;
}

function getWx(): IWxAds | undefined {
    const g = globalThis as unknown as { wx?: IWxAds };
    return g.wx;
}

let _rewarded: IRewardedVideoAd | null = null;
let _rewardedErrorBound = false;
let _rewardedShowInFlight = false;
let _warnedEmptyRewardedId = false;
let _firstPreloadTimer: ReturnType<typeof setTimeout> | null = null;

const REWARDED_PRELOAD_DELAY_MS = 2000;
const REWARDED_RESUME_BGM_DELAY_MS = 100;

function scheduleResumeBgmAfterRewardedAd(): void {
    setTimeout(() => {
        const scene = director.getScene()?.name;
        if (scene === SCENE_ENUM.MENU || scene === SCENE_ENUM.GAME) {
            PLAY_BGM.emit(EVENT_ENUM.PLAY_BGM, scene);
        }
    }, REWARDED_RESUME_BGM_DELAY_MS);
}

function bindRewardedErrorOnce(ad: IRewardedVideoAd): void {
    if (_rewardedErrorBound) {
        return;
    }
    _rewardedErrorBound = true;
    ad.onError((err: unknown) => {
        console.warn(LOG, 'Rewarded onError', err);
    });
}

function getOrCreateRewarded(adUnitId: string): IRewardedVideoAd | null {
    const wxApi = getWx();
    if (typeof wxApi?.createRewardedVideoAd !== 'function') {
        return null;
    }
    if (!_rewarded) {
        const ad = wxApi.createRewardedVideoAd({ adUnitId });
        if (!ad) {
            return null;
        }
        _rewarded = ad;
        bindRewardedErrorOnce(ad);
    }
    return _rewarded;
}

export function isWeChatRewardedVideoAdConfigured(): boolean {
    return WECHAT_REWARDED_VIDEO_AD_UNIT_ID.trim().length > 0;
}

export function cancelWeChatRewardedVideoPreloadSchedule(): void {
    if (_firstPreloadTimer !== null) {
        clearTimeout(_firstPreloadTimer);
        _firstPreloadTimer = null;
    }
}

export function initWeChatRewardedVideoAd(delayMs: number): void {
    cancelWeChatRewardedVideoPreloadSchedule();
    const run = (): void => {
        _firstPreloadTimer = null;
        preloadWeChatRewardedVideo();
    };
    if (delayMs <= 0) {
        run();
        return;
    }
    _firstPreloadTimer = setTimeout(run, delayMs);
}

/** Game 场景：延迟预载，避开开局动画 */
export function scheduleWeChatRewardedVideoPreloadForGame(): void {
    initWeChatRewardedVideoAd(REWARDED_PRELOAD_DELAY_MS);
}

/** 展示激励视频；完整观看返回 true，否则 false */
export function showWeChatRewardedVideo(): Promise<boolean> {
    if (USE_DEBUG_MOCK_REWARDED_AD_SUCCESS) {
        console.warn(LOG, 'USE_DEBUG_MOCK_REWARDED_AD_SUCCESS=true，模拟观看成功');
        return Promise.resolve(true);
    }
    const id = WECHAT_REWARDED_VIDEO_AD_UNIT_ID.trim();
    if (!id) {
        if (!_warnedEmptyRewardedId) {
            _warnedEmptyRewardedId = true;
            console.warn(LOG, 'WECHAT_REWARDED_VIDEO_AD_UNIT_ID 为空，已跳过激励视频');
        }
        return Promise.resolve(false);
    }
    const wxApi = getWx();
    if (typeof wxApi?.createRewardedVideoAd !== 'function') {
        return Promise.resolve(false);
    }
    if (_rewardedShowInFlight) {
        console.warn(LOG, '激励视频已在展示/加载中，忽略本次');
        return Promise.resolve(false);
    }
    const ad = getOrCreateRewarded(id);
    if (!ad) {
        return Promise.resolve(false);
    }
    _rewardedShowInFlight = true;
    return new Promise<boolean>((resolve) => {
        let settled = false;
        const finish = (ok: boolean): void => {
            if (settled) {
                return;
            }
            settled = true;
            _rewardedShowInFlight = false;
            ad.offClose(onClose);
            resolve(ok);
        };
        const onClose = (res?: RewardedVideoCloseResult): void => {
            const ok = !res || res.isEnded === true;
            finish(ok);
            scheduleResumeBgmAfterRewardedAd();
            preloadWeChatRewardedVideo();
        };
        ad.onClose(onClose);
        ad.show()
            .catch(() => ad.load().then(() => ad.show()))
            .catch((err: unknown) => {
                console.warn(LOG, '激励视频 广告显示失败', err);
                finish(false);
            });
    });
}

export function preloadWeChatRewardedVideo(): void {
    const id = WECHAT_REWARDED_VIDEO_AD_UNIT_ID.trim();
    if (!id) {
        return;
    }
    const ad = getOrCreateRewarded(id);
    if (!ad) {
        return;
    }
    ad.load().catch((err: unknown) => {
        console.warn(LOG, 'Rewarded preload 失败', err);
    });
}
