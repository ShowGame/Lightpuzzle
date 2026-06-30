/**
 * 微信小游戏：右上角「转发 / 朋友圈 / 复制链接」需 showShareMenu + 分享回调，否则常为灰色。
 * 分享 query：`levelId=数字`，接收方经 wx.getEnterOptionsSync / wx.onShow 解析后直达该局内关卡。
 */

import { director } from 'cc';
import { getOpticalLevelById } from '../Games/OpticalPuzzle/Config/OpticalPuzzleLevels';
import { SCENE_ENUM } from './Enum';

/** 菜单页分享：转发好友标题 */
const SHARE_TITLE_FRIEND = '物理老师来了都要被硬控60s';
/** 菜单页分享：朋友圈标题 */
const SHARE_TITLE_TIMELINE = '光学解谜 — 光路大挑战';

/** 分享 query 键（须 key1=val1&key2=val2 格式） */
export const SHARE_QUERY_LEVEL_ID_KEY = 'levelId';

/**
 * 分享预览图（imageUrl）。
 * 留空：不传 imageUrl，微信会用当前游戏画面截图（稳定，推荐默认）
 */
const SHARE_PREVIEW_IMAGE_HTTPS = '';

const SHARE_FOREGROUND_DEBOUNCE_MS = 320;
const SHARE_RETURN_AFTER_HIDE_MS = 80;
const SHARE_NO_HIDE_FALLBACK_MS = 520;
const SHARE_FAIL_TIMEOUT_MS = 25000;

interface SharePayload {
    title: string;
    imageUrl?: string;
    query?: string;
}

interface ShareAppMessageOptions {
    title?: string;
    imageUrl?: string;
    query?: string;
    imageUrlId?: string;
}

interface IWxEnterOptions {
    query?: Record<string, string>;
}

interface IWxMiniGameShare {
    showShareMenu(opt: { withShareTicket?: boolean; menus?: string[] }): void;
    onShareAppMessage(fn: () => SharePayload): void;
    onShareTimeline?(fn: () => SharePayload): void;
    shareAppMessage?(opt: ShareAppMessageOptions): void;
    onShow?(fn: (res?: unknown) => void): void;
    onHide?(fn: () => void): void;
    offShow?(fn: (res?: unknown) => void): void;
    offHide?(fn: () => void): void;
    getEnterOptionsSync?(): IWxEnterOptions;
    getLaunchOptionsSync?(): IWxEnterOptions;
}

function getWx(): IWxMiniGameShare | undefined {
    const g = globalThis as unknown as { wx?: IWxMiniGameShare };
    return g.wx;
}

/** 局内分享标题（好友 / 朋友圈 / 主动 shareAppMessage 共用） */
export function formatInGameShareTitle(levelId: number): string {
    return `第${Math.trunc(levelId)}关的谜题有点烧脑`;
}

export function buildShareQueryString(levelId: number): string {
    return `${SHARE_QUERY_LEVEL_ID_KEY}=${Math.trunc(levelId)}`;
}

function withPreviewImage(base: SharePayload): SharePayload {
    if (!SHARE_PREVIEW_IMAGE_HTTPS) {
        return base;
    }
    return { ...base, imageUrl: SHARE_PREVIEW_IMAGE_HTTPS };
}

function buildMenuFriendSharePayload(): SharePayload {
    return withPreviewImage({ title: SHARE_TITLE_FRIEND });
}

function buildMenuTimelineSharePayload(): SharePayload {
    return withPreviewImage({ title: SHARE_TITLE_TIMELINE });
}

function buildInGameSharePayload(levelId: number): SharePayload {
    const id = Math.trunc(levelId);
    return withPreviewImage({
        title: formatInGameShareTitle(id),
        query: buildShareQueryString(id),
    });
}

function normalizeShareLevelId(raw: unknown): number | null {
    if (raw == null) {
        return null;
    }
    const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw).trim(), 10);
    if (!Number.isFinite(n)) {
        return null;
    }
    const id = Math.trunc(n);
    if (id <= 0) {
        return null;
    }
    return getOpticalLevelById(id) ? id : null;
}

function parseQueryInput(raw: unknown): Record<string, string> | null {
    if (raw == null) {
        return null;
    }
    if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (!trimmed) {
            return null;
        }
        const out: Record<string, string> = {};
        for (const part of trimmed.split('&')) {
            if (!part) {
                continue;
            }
            const eq = part.indexOf('=');
            const key = decodeURIComponent(eq >= 0 ? part.slice(0, eq) : part);
            const val = decodeURIComponent(eq >= 0 ? part.slice(eq + 1) : '');
            if (key) {
                out[key] = val;
            }
        }
        return Object.keys(out).length > 0 ? out : null;
    }
    if (typeof raw === 'object') {
        return raw as Record<string, string>;
    }
    return null;
}

function readEnterQuery(res?: unknown): Record<string, string> | undefined {
    const fromRes = parseQueryInput((res as IWxEnterOptions | undefined)?.query);
    if (fromRes) {
        return fromRes;
    }
    const wxApi = getWx();
    if (!wxApi) {
        return undefined;
    }
    try {
        const enter = wxApi.getEnterOptionsSync?.();
        const fromEnter = parseQueryInput(enter?.query);
        if (fromEnter) {
            return fromEnter;
        }
        const launch = wxApi.getLaunchOptionsSync?.();
        const fromLaunch = parseQueryInput(launch?.query);
        if (fromLaunch) {
            return fromLaunch;
        }
    } catch {
        /* 非微信或 API 不可用 */
    }
    return undefined;
}

export function parseShareLevelIdFromQuery(query?: Record<string, string> | null): number | null {
    if (!query) {
        return null;
    }
    return normalizeShareLevelId(query[SHARE_QUERY_LEVEL_ID_KEY]);
}

/** 当前局内关卡（供右上角被动分享）；null 表示菜单或无局内上下文 */
let _activeShareLevelId: number | null = null;

export function setWeChatShareContext(levelId: number | null): void {
    if (levelId == null || levelId <= 0) {
        _activeShareLevelId = null;
        return;
    }
    _activeShareLevelId = getOpticalLevelById(levelId) ? Math.trunc(levelId) : null;
}

/** 待处理的分享进关 id（冷 / 热启动写入，Game 场景消费） */
let _pendingShareEntryLevelId: number | null = null;

/** 本会话已处理过的分享 query（getEnterOptionsSync 冷启动 query 会一直保留，回 Menu 勿重复 ingest） */
const _handledShareLaunchQueryKeys = new Set<string>();

function shareLaunchQueryKey(levelId: number): string {
    return buildShareQueryString(Math.trunc(levelId));
}

function shareLaunchQueryKeyFromQuery(query: Record<string, string>): string | null {
    const levelId = parseShareLevelIdFromQuery(query);
    return levelId != null ? shareLaunchQueryKey(levelId) : null;
}

function markShareLaunchQueryHandled(levelId: number): void {
    _handledShareLaunchQueryKeys.add(shareLaunchQueryKey(levelId));
    _pendingShareEntryLevelId = null;
    _shareGameSceneLoadScheduled = false;
}

export function peekShareEntryLevelId(): number | null {
    return _pendingShareEntryLevelId;
}

export function consumeShareEntryLevelId(): number | null {
    const id = _pendingShareEntryLevelId;
    if (id != null) {
        markShareLaunchQueryHandled(id);
    }
    return id;
}

/** 解析启动 / 回前台参数中的 levelId */
export function ingestWeChatShareLaunchQuery(res?: unknown): void {
    const query = readEnterQuery(res);
    if (!query) {
        return;
    }
    const queryKey = shareLaunchQueryKeyFromQuery(query);
    if (queryKey != null && _handledShareLaunchQueryKeys.has(queryKey)) {
        return;
    }
    const levelId = parseShareLevelIdFromQuery(query);
    if (levelId != null) {
        _pendingShareEntryLevelId = levelId;
    }
}

type ShareEntryRouteHandler = (levelId: number) => void;

let _shareEntryRouteHandler: ShareEntryRouteHandler | null = null;

export function setWeChatShareEntryRouteHandler(handler: ShareEntryRouteHandler | null): void {
    _shareEntryRouteHandler = handler;
}

/** 分享链接进关：Menu 切 Game；已在 Game 时交给 Root 热加载 */
export function routeShareEntryLevel(): void {
    ingestWeChatShareLaunchQuery();
    tryRouteShareEntryLevel();
}

let _shareGameSceneLoadScheduled = false;

/** 将分享 query 路由到 Game 或热加载关卡（勿在 onLoad 里直接 loadScene） */
function tryRouteShareEntryLevel(): void {
    const levelId = peekShareEntryLevelId();
    if (levelId == null) {
        return;
    }
    if (_shareEntryRouteHandler) {
        _shareEntryRouteHandler(levelId);
        markShareLaunchQueryHandled(levelId);
        return;
    }
    const sceneName = director.getScene()?.name ?? '';
    if (sceneName !== SCENE_ENUM.MENU) {
        return;
    }
    if (_shareGameSceneLoadScheduled) {
        return;
    }
    _shareGameSceneLoadScheduled = true;
    director.loadScene(SCENE_ENUM.GAME);
}

type ShareBootstrapScheduler = {
    scheduleOnce(fn: () => void, delaySeconds: number): void;
};

/**
 * 冷启动分享进关：先 ingest query，再延迟到下一帧 loadScene（避免 onLoad 内切场景失效）。
 * MenuManager.start / MusicManager / wx.onShow 均可调用。
 */
export function scheduleShareEntryBootstrap(
    scheduler: ShareBootstrapScheduler | null,
    delaySeconds = 0,
): void {
    const run = (): void => {
        routeShareEntryLevel();
    };
    if (scheduler?.scheduleOnce) {
        scheduler.scheduleOnce(run, delaySeconds);
        return;
    }
    globalThis.setTimeout(run, Math.max(0, delaySeconds * 1000));
}

function resolvePassiveSharePayload(forTimeline: boolean): SharePayload {
    if (_activeShareLevelId != null) {
        return buildInGameSharePayload(_activeShareLevelId);
    }
    return forTimeline ? buildMenuTimelineSharePayload() : buildMenuFriendSharePayload();
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

    wxApi.onShareAppMessage(() => resolvePassiveSharePayload(false));

    if (typeof wxApi.onShareTimeline === 'function') {
        wxApi.onShareTimeline(() => resolvePassiveSharePayload(true));
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
    ingestWeChatShareLaunchQuery();
}

export function invokeWeChatFriendShare(cb: {
    /** 局内分享时传入当前关卡 id，会附带 query 与动态标题 */
    levelId?: number;
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

    const shareLevelId =
        cb.levelId != null && cb.levelId > 0 ? normalizeShareLevelId(cb.levelId) : null;
    const payload =
        shareLevelId != null ? buildInGameSharePayload(shareLevelId) : buildMenuFriendSharePayload();

    try {
        wxApi.shareAppMessage({
            title: payload.title,
            ...(payload.query ? { query: payload.query } : {}),
            ...(payload.imageUrl ? { imageUrl: payload.imageUrl } : {}),
        });
    } catch {
        settleShareAwait('fail', 'error');
    }
}

/** wx.onShow：解析分享 query 并尝试路由进关 */
export function handleWeChatOnShow(res?: unknown): void {
    ingestWeChatShareLaunchQuery(res);
    scheduleShareEntryBootstrap(null, 0);
    trySettlePendingShareAfterWxOnShow();
}
