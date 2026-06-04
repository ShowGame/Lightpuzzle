/**
 * 兼容入口：激励视频实现见 `WeChatMiniGameAds.ts`（与 MemoMaster 一致）。
 */
export {
    WECHAT_REWARDED_VIDEO_AD_UNIT_ID,
    USE_DEBUG_MOCK_REWARDED_AD_SUCCESS,
    isWeChatRewardedVideoAdConfigured,
    initWeChatRewardedVideoAd,
    cancelWeChatRewardedVideoPreloadSchedule,
    scheduleWeChatRewardedVideoPreloadForGame,
    showWeChatRewardedVideo,
    preloadWeChatRewardedVideo,
} from './WeChatMiniGameAds';
