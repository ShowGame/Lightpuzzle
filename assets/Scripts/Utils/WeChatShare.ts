/**
 * 微信小游戏：右上角「转发 / 朋友圈 / 复制链接」需 showShareMenu + 分享回调，否则常为灰色。
 * `ensureWxShareMenuAndPassiveHooks` 可多次调用：重复执行 `showShareMenu`（点击前再补一次可避免「不调起面板」）。
 */

/** 与转发、朋友圈展示文案一致时可改此处 */
const SHARE_TITLE_FRIEND = '物理老师来了都要被硬控60s';
const SHARE_TITLE_TIMELINE = '光学解谜 — 光路大挑战';

/**
 * 分享预览图（imageUrl）。
 * 留空：不传 imageUrl，微信会用当前游戏画面截图（稳定，推荐默认）
 */
const SHARE_PREVIEW_IMAGE_HTTPS = '';

const SHARE_FOREGROUND_DEBOUNCE_MS = 320;
const SHARE_RETURN_AFTER_HIDE_MS = 80;
const SHARE_NO_HIDE_FALLBACK_MS = 520;
const SHARE_FAIL_TIMEOUT_MS = 25000;

interface ShareAppMessageOptions {
    title?: string;
    imageUrl?: string;
    query?: string;
    imageUrlId?: string;
}

interface IWxMiniGameShare {
    showShareMenu(opt: { withShareTicket?: boolean; menus?: string[] }): void;
    onShareAppMessage(fn: () => { title?: string; imageUrl?: string; query?: string }): void;
    onShareTimeline?(fn: () => { title?: string; imageUrl?: string; query?: string }): void;
    shareAppMessage?(opt: ShareAppMessageOptions): void;
    onShow?(fn: (res?: unknown) => void): void;
    onHide?(fn: () => void): void;
    offShow?(fn: (res?: unknown) => void): void;
    offHide?(fn: () => void): void;
}

function getWx(): IWxMiniGameShare | undefined {
    const g = globalThis as unknown as { wx?: IWxMiniGameShare };
    return g.wx;
}

function buildFriendSharePayload(): { title: string; imageUrl?: string } {
    const o: { title: string; imageUrl?: string } = { title: SHARE_TITLE_FRIEND };
    if (SHARE_PREVIEW_IMAGE_HTTPS) {
        o.imageUrl = SHARE_PREVIEW_IMAGE_HTTPS;
    }
    return o;
}

let _hooksBound = false;

function ensureWxShareMenuAndPassiveHooks(): void {
    const wxApi = getWx();
    if (!wxApi) {
        return;
    }
    try {
        if (typeof wxApi.showShareMenu === 'function') {
            wxApi.showShareMenu({
                withShareTicket: true,
                menus: ['shareAppMessage', 'shareTimeline'],
            });
        }
    } catch {
        /* 部分环境首帧不可用，稍后点击再调 */
    }

    if (_hooksBound) {
        return;
    }
    if (typeof wxApi.onShareAppMessage !== 'function') {
        return;
    }

    wxApi.onShareAppMessage(() => buildFriendSharePayload());

    const sharePayloadTimeline = () => {
        const o: { title: string; imageUrl?: string } = { title: SHARE_TITLE_TIMELINE };
        if (SHARE_PREVIEW_IMAGE_HTTPS) {
            o.imageUrl = SHARE_PREVIEW_IMAGE_HTTPS;
        }
        return o;
    };

    if (typeof wxApi.onShareTimeline === 'function') {
        wxApi.onShareTimeline(sharePayloadTimeline);
    }

    _hooksBound = true;
}

export function trySettlePendingShareAfterWxOnShow(): void {
    handleShareAwaitOnForeground();
}

type ShareAwait = {
    onSuccess: () => void;
    onFail: (reason?: string) => void;
    startAt: number;
    hideAt: number | null;
    settled: boolean;
    hideListener: (() => void) | null;
    failTimer: ReturnType<typeof setTimeout> | null;
};

let _shareAwait: ShareAwait | null = null;

function cancelShareAwaitHooks(s: ShareAwait): void {
    const wxApi = getWx();
    if (s.hideListener && typeof wxApi?.offHide === 'function') {
        wxApi.offHide(s.hideListener);
    }
    s.hideListener = null;
    if (s.failTimer != null) {
        clearTimeout(s.failTimer);
        s.failTimer = null;
    }
}

function cancelPendingShareAwaitSilent(): void {
    const s = _shareAwait;
    if (!s || s.settled) {
        return;
    }
    s.settled = true;
    cancelShareAwaitHooks(s);
    _shareAwait = null;
}

function settleShareAwait(mode: 'success' | 'fail', reason?: string): void {
    const s = _shareAwait;
    if (!s || s.settled) {
        return;
    }
    s.settled = true;
    cancelShareAwaitHooks(s);
    _shareAwait = null;
    if (mode === 'success') {
        s.onSuccess();
    } else {
        s.onFail(reason);
    }
}

function handleShareAwaitOnForeground(): void {
    const s = _shareAwait;
    if (!s || s.settled) {
        return;
    }
    const now = Date.now();
    const sinceStart = now - s.startAt;
    if (sinceStart < SHARE_FOREGROUND_DEBOUNCE_MS) {
        return;
    }

    if (s.hideAt != null && now - s.hideAt >= SHARE_RETURN_AFTER_HIDE_MS) {
        settleShareAwait('success');
        return;
    }

    if (s.hideAt == null && sinceStart >= SHARE_NO_HIDE_FALLBACK_MS) {
        settleShareAwait('success');
    }
}

export function initWeChatMiniGameShare(): void {
    ensureWxShareMenuAndPassiveHooks();
}

export function invokeWeChatFriendShare(cb: {
    onSuccess?: () => void;
    onFail?: (reason?: string) => void;
}): void {
    const wxApi = getWx();
    if (!wxApi || typeof wxApi.shareAppMessage !== 'function') {
        cb.onFail?.('unsupported');
        return;
    }

    ensureWxShareMenuAndPassiveHooks();
    cancelPendingShareAwaitSilent();

    const onSuccess = cb.onSuccess ?? (() => undefined);
    const onFail = cb.onFail ?? (() => undefined);

    const hideListener = (): void => {
        const s = _shareAwait;
        if (!s || s.settled) {
            return;
        }
        s.hideAt = Date.now();
    };

    const awaitState: ShareAwait = {
        onSuccess,
        onFail,
        startAt: Date.now(),
        hideAt: null,
        settled: false,
        hideListener: null,
        failTimer: null,
    };
    _shareAwait = awaitState;

    if (typeof wxApi.onHide === 'function') {
        awaitState.hideListener = hideListener;
        wxApi.onHide(hideListener);
    }

    awaitState.failTimer = setTimeout(() => {
        settleShareAwait('fail', 'timeout');
    }, SHARE_FAIL_TIMEOUT_MS);

    try {
        const base = buildFriendSharePayload();
        wxApi.shareAppMessage({
            title: base.title,
            ...(base.imageUrl ? { imageUrl: base.imageUrl } : {}),
        });
    } catch {
        settleShareAwait('fail', 'error');
    }
}
