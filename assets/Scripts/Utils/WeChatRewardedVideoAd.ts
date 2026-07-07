/**
 * 兼容入口：激励视频 / 插屏实现见 `WeChatMiniGameAds.ts`。
 */
export {
    WECHAT_REWARDED_VIDEO_AD_UNIT_ID,
    WECHAT_INTERSTITIAL_AD_UNIT_ID,
    USE_DEBUG_MOCK_REWARDED_AD_SUCCESS,
    USE_DEBUG_MOCK_INTERSTITIAL_AD_SUCCESS,
    isWeChatRewardedVideoAdConfigured,
    initWeChatRewardedVideoAd,
    cancelWeChatRewardedVideoPreloadSchedule,
    scheduleWeChatRewardedVideoPreloadForGame,
    setWeChatGameSceneAdPreloadEnabled,
    showWeChatRewardedVideo,
    preloadWeChatRewardedVideo,
    isWeChatInterstitialAdConfigured,
    showWeChatInterstitialAd,
    preloadWeChatInterstitialAd,
    destroyWeChatInterstitialAd,
} from './WeChatMiniGameAds';
