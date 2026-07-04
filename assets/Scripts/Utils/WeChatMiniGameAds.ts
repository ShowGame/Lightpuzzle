import { director } from 'cc';
import { EVENT_ENUM, SCENE_ENUM } from './Enum';
import { PLAY_BGM } from './Event';

/**
 * 微信小游戏流量主 — 激励视频 / 插屏（参考 MemoMaster）。
 * - 激励视频 https://developers.weixin.qq.com/minigame/dev/api/ad/wx.createRewardedVideoAd.html
 * - 插屏 https://developers.weixin.qq.com/minigame/dev/api/ad/wx.createInterstitialAd.html
 */

const LOG = '[WeChatMiniGameAds]';

/**
 * 开发测试：true 时不拉真实广告，直接 resolve true。
 * 发版前务必改回 false。
 */
export let USE_DEBUG_MOCK_REWARDED_AD_SUCCESS = false;

/** 开发测试：true 时插屏不拉真实广告，直接 resolve true */
export let USE_DEBUG_MOCK_INTERSTITIAL_AD_SUCCESS = false;

/** 激励式视频（参考解解锁等需完整观看才发奖） */
export let WECHAT_REWARDED_VIDEO_AD_UNIT_ID = 'adunit-b12879d569227597';

/** 插屏（撤回次数耗尽后 +3 次） */
export let WECHAT_INTERSTITIAL_AD_UNIT_ID = 'adunit-460706b96b20c908';

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

interface IInterstitialAd {
    load?(): Promise<void>;
    show(): Promise<void>;
    destroy?(): void;
    onClose?(listener: () => void): void;
    offClose?(listener: () => void): void;
    onError(listener: (err: unknown) => void): void;
}

interface IWxAds {
    createRewardedVideoAd?(opt: { adUnitId: string; multiton?: boolean }): IRewardedVideoAd | null;
    createInterstitialAd?(opt: { adUnitId: string }): IInterstitialAd | null;
}

function getWx(): IWxAds | undefined {
    const g = globalThis as unknown as { wx?: IWxAds };
    return g.wx;
}

const REWARDED_PRELOAD_DELAY_MS = 2000;
const REWARDED_RESUME_BGM_DELAY_MS = 200;

function scheduleResumeBgmAfterFullScreenAd(): void {
    setTimeout(() => {
        const scene = director.getScene()?.name;
        if (scene === SCENE_ENUM.MENU || scene === SCENE_ENUM.GAME) {
            PLAY_BGM.emit(EVENT_ENUM.PLAY_BGM, scene);
        }
    }, REWARDED_RESUME_BGM_DELAY_MS);
}

// #region —— 激励视频

let _rewarded: IRewardedVideoAd | null = null;
let _rewardedErrorBound = false;
let _rewardedShowInFlight = false;
let _warnedEmptyRewardedId = false;
let _firstPreloadTimer: ReturnType<typeof setTimeout> | null = null;

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
        preloadWeChatInterstitialAd();
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
            scheduleResumeBgmAfterFullScreenAd();
            preloadWeChatRewardedVideo();
        };
        ad.onClose(onClose);
        ad.show()
            .catch(() => ad.load().then(() => ad.show()))
            .catch((err: unknown) => {
                console.warn(LOG, '激励视频 广告显示失败', err);
                finish(false);
                scheduleResumeBgmAfterFullScreenAd();
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

// #endregion

// #region —— 插屏

let _interstitial: IInterstitialAd | null = null;
let _interstitialErrorBound = false;
let _interstitialShowInFlight = false;

function getOrCreateInterstitial(adUnitId: string): IInterstitialAd | null {
    const wxApi = getWx();
    if (typeof wxApi?.createInterstitialAd !== 'function') {
        return null;
    }
    if (!_interstitial) {
        const ad = wxApi.createInterstitialAd({ adUnitId });
        if (!ad) {
            return null;
        }
        _interstitial = ad;
        if (!_interstitialErrorBound) {
            _interstitialErrorBound = true;
            ad.onError((err: unknown) => {
                console.warn(LOG, 'Interstitial onError', err);
            });
        }
    }
    return _interstitial;
}

export function isWeChatInterstitialAdConfigured(): boolean {
    return WECHAT_INTERSTITIAL_AD_UNIT_ID.trim().length > 0;
}

/** 展示插屏；show 成功返回 true（与微信示例一致，失败时尝试 load → show） */
export function showWeChatInterstitialAd(): Promise<boolean> {
    if (USE_DEBUG_MOCK_INTERSTITIAL_AD_SUCCESS) {
        console.warn(LOG, 'USE_DEBUG_MOCK_INTERSTITIAL_AD_SUCCESS=true，模拟插屏成功');
        return Promise.resolve(true);
    }
    const id = WECHAT_INTERSTITIAL_AD_UNIT_ID.trim();
    if (!id) {
        return Promise.resolve(false);
    }
    if (_interstitialShowInFlight) {
        console.warn(LOG, '插屏已在展示/加载中，忽略本次');
        return Promise.resolve(false);
    }
    const ad = getOrCreateInterstitial(id);
    if (!ad) {
        return Promise.resolve(false);
    }
    _interstitialShowInFlight = true;
    const showWithRetry = (): Promise<void> =>
        ad
            .show()
            .catch(() => {
                if (typeof ad.load === 'function') {
                    return ad.load().then(() => ad.show());
                }
                return ad.show();
            });
    return showWithRetry()
        .then(() => {
            preloadWeChatInterstitialAd();
            bindInterstitialCloseForBgmResume(ad);
            return true;
        })
        .catch((err: unknown) => {
            console.warn(LOG, '插屏广告显示失败', err);
            return false;
        })
        .finally(() => {
            _interstitialShowInFlight = false;
        });
}

function bindInterstitialCloseForBgmResume(ad: IInterstitialAd): void {
    if (typeof ad.onClose !== 'function') {
        scheduleResumeBgmAfterFullScreenAd();
        return;
    }
    const onClose = (): void => {
        ad.offClose?.(onClose);
        scheduleResumeBgmAfterFullScreenAd();
    };
    ad.onClose(onClose);
}

export function preloadWeChatInterstitialAd(): void {
    const id = WECHAT_INTERSTITIAL_AD_UNIT_ID.trim();
    if (!id) {
        return;
    }
    const ad = getOrCreateInterstitial(id);
    if (!ad || typeof ad.load !== 'function') {
        return;
    }
    ad.load().catch((err: unknown) => {
        console.warn(LOG, 'Interstitial preload 失败', err);
    });
}

export function destroyWeChatInterstitialAd(): void {
    _interstitial?.destroy?.();
    _interstitial = null;
    _interstitialErrorBound = false;
}

// #endregion
