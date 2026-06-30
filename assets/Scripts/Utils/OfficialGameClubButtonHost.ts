import { _decorator, Component, Enum, Node } from 'cc';

const { ccclass, property } = _decorator;

/** 调试完成后可改为 false，减少控制台噪音 */
const OFFICIAL_GAME_CLUB_DEBUG = false;

const LOG_TAG = '[OfficialGameClubButtonHost]';

function dbg(...args: unknown[]): void {
    if (OFFICIAL_GAME_CLUB_DEBUG) {
        console.log(LOG_TAG, ...args);
    }
}

/** MP - 游戏圈 - 基础设置 / 帖子「游戏内跳转」复制的 openlink（PageManager 打开页用） */
const GAME_CIRCLE_OPENLINK =
    '-SSEykJvFV3pORt5kTNpS8l7_-q8kWPX0oGmFWMK0VkoHVR-1L3Ta2L9DZA1F29u_tiEVEmdO8_wZOisKEoWlBM7DGxWZjN9qqhoOv6OW7u9TYyjyyTlDTVj_Qvl9zgeMTQQ-CDZY7NTqj-8asD5ZWmulcHhLc9ENLsBLPRDAnJuwIz9ZB-sd4D8NxcTbp3bybV_VBTFmm6oY3HmZFD2p8BrDvN9lg1m-7jRci81Wv5dNNceIAEcrE22s9dN1Dp2qAMClvU2YORsC9xNRYugpZdmQIZBVOCVez0XNLpLTf6l89Z_pxNATCu9qp_0Mi7kbfO1CyoCKgNCY8s5Pd50_w';

type GameClubButtonIcon = 'green' | 'white' | 'dark' | 'light';

interface IPageManager {
    load(opt: { openlink: string }): Promise<unknown>;
    show(): void;
}

interface OfficialGameClubButtonHandle {
    show(): void;
    hide(): void;
    destroy(): void;
    onTap?(fn: () => void): void;
    offTap?(fn: () => void): void;
}

interface IWxGameClub {
    createGameClubButton?(opt: Record<string, unknown>): OfficialGameClubButtonHandle | null;
    createPageManager?(): IPageManager | null;
}

function getWx(): IWxGameClub | undefined {
    const g = globalThis as unknown as { wx?: IWxGameClub };
    return g.wx;
}

/** 文档：小游戏打开游戏圈页用 PageManager + openlink（基础库 >= 3.6.7） */
function openGameClubPageByPageManager(openlink: string): Promise<void> {
    dbg('PageManager: 开始 openlink 前缀=', openlink.slice(0, 24), '… 长度=', openlink.length);
    const wxApi = getWx();
    if (typeof wxApi?.createPageManager !== 'function') {
        dbg('PageManager: 失败 — wx.createPageManager 不是函数（需基础库 3.6.7+）');
        return Promise.reject(new Error('需要基础库 3.6.7+ 的 createPageManager'));
    }
    const pm = wxApi.createPageManager();
    if (!pm || typeof pm.load !== 'function' || typeof pm.show !== 'function') {
        dbg('PageManager: 失败 — createPageManager() 返回无效或缺少 load/show', { pm: !!pm });
        return Promise.reject(new Error('createPageManager 不可用'));
    }
    dbg('PageManager: 调用 pm.load …');
    return pm
        .load({ openlink })
        .then(() => {
            dbg('PageManager: load 完成，调用 pm.show()');
            pm.show();
        })
        .then(() => {
            dbg('PageManager: show 已调用，流程结束');
            return undefined;
        });
}

/**
 * 不在此传入 openlink：传入后客户端会走内置 openPage，易出现 openPage:fail（如 -10000400），
 * 且往往不再走 onTap；跳转统一在 onTap 里用 createPageManager + load(openlink) 完成。
 */
function createOfficialGameClubButton(options: {
    icon: GameClubButtonIcon;
    style: { left: number; top: number; width: number; height: number };
}): OfficialGameClubButtonHandle | null {
    const wxApi = getWx();
    const factory = wxApi?.createGameClubButton;
    if (typeof factory !== 'function') {
        dbg('createGameClubButton: 不可用 — 无 wx 或 wx.createGameClubButton 不是函数');
        return null;
    }
    const payload: Record<string, unknown> = {
        type: 'image',
        icon: options.icon,
        style: options.style,
    };
    dbg('createGameClubButton: 调用中', {
        icon: options.icon,
        style: options.style,
    });
    try {
        const handle = factory.call(wxApi, payload) as OfficialGameClubButtonHandle | null;
        dbg('createGameClubButton: 返回', handle ? '非 null' : 'null', 'onTap=', typeof handle?.onTap);
        return handle;
    } catch (e) {
        dbg('createGameClubButton: 抛错', e);
        return null;
    }
}

/** 与 wx.createGameClubButton 的 icon 一致，供编辑器下拉选择 */
export enum OfficialGameClubIconKind {
    Green = 0,
    White = 1,
    Dark = 2,
    Light = 3,
}

const ICON_BY_KIND: GameClubButtonIcon[] = ['green', 'white', 'dark', 'light'];

/** 默认微信窗口坐标（左上原点），真机可微调 */
export const OFFICIAL_GAME_CLUB_DEFAULT_WX_STYLE = {
    left: 10,
    top: 45,
    width: 32,
    height: 32,
} as const;

/**
 * 在微信小游戏里创建**原生**游戏圈入口（官方图标），盖在 Cocos 画布之上。
 * 坐标为微信客户端**窗口像素**（左上原点），与 Cocos UI 坐标系不同。
 * 创建时不传 openlink；点击通过 onTap → PageManager 打开游戏圈页。
 */
@ccclass('OfficialGameClubButtonHost')
export class OfficialGameClubButtonHost extends Component {
    @property({ type: Enum(OfficialGameClubIconKind), tooltip: '微信官方提供的四种图标样式' })
    iconKind: OfficialGameClubIconKind = OfficialGameClubIconKind.White;

    @property({ tooltip: '微信窗口坐标 left（像素）' })
    wxLeft = OFFICIAL_GAME_CLUB_DEFAULT_WX_STYLE.left;

    @property({ tooltip: '微信窗口坐标 top（像素）' })
    wxTop = OFFICIAL_GAME_CLUB_DEFAULT_WX_STYLE.top;

    @property({ tooltip: '按钮宽度（像素）' })
    wxWidth = OFFICIAL_GAME_CLUB_DEFAULT_WX_STYLE.width;

    @property({ tooltip: '按钮高度（像素）' })
    wxHeight = OFFICIAL_GAME_CLUB_DEFAULT_WX_STYLE.height;

    @property({ tooltip: '留空则用内置常量；若 MP 更换了跳转 ID 可在此覆盖' })
    openlinkOverride = '';

    private _btn: OfficialGameClubButtonHandle | null = null;
    private _onTapHandler: (() => void) | null = null;

    onEnable(): void {
        dbg('onEnable: 节点=', this.node?.name, 'wx=', !!getWx());
        this.ensureNativeButton();
        if (this._btn) {
            dbg('onEnable: 调用原生按钮 show()');
            this._btn.show();
        } else {
            dbg('onEnable: 无 _btn，未显示');
        }
    }

    onDisable(): void {
        dbg('onDisable');
        this._btn?.hide();
    }

    onDestroy(): void {
        if (this._btn && this._onTapHandler && typeof this._btn.offTap === 'function') {
            this._btn.offTap(this._onTapHandler);
        }
        this._onTapHandler = null;
        this._btn?.destroy();
        this._btn = null;
    }

    private ensureNativeButton(): void {
        if (this._btn) {
            dbg('ensureNativeButton: 已有实例，跳过');
            return;
        }
        const icon = ICON_BY_KIND[this.iconKind] ?? 'green';
        const link = (this.openlinkOverride && this.openlinkOverride.trim()) || GAME_CIRCLE_OPENLINK;
        dbg('ensureNativeButton: icon=', icon, 'style=', {
            left: this.wxLeft,
            top: this.wxTop,
            width: this.wxWidth,
            height: this.wxHeight,
        });
        const btn = createOfficialGameClubButton({
            icon,
            style: {
                left: this.wxLeft,
                top: this.wxTop,
                width: this.wxWidth,
                height: this.wxHeight,
            },
        });
        this._btn = btn;
        if (btn && typeof btn.onTap === 'function') {
            this._onTapHandler = (): void => {
                dbg('onTap: 收到点击');
                openGameClubPageByPageManager(link).catch((err: unknown) => {
                    dbg('PageManager: 异常', err);
                    const msg = err instanceof Error ? err.message : String(err);
                    console.warn(LOG_TAG, '打开游戏圈失败', msg);
                });
            };
            btn.onTap(this._onTapHandler);
            dbg('ensureNativeButton: 已注册 onTap');
        } else if (btn) {
            dbg('ensureNativeButton: 有按钮但无 onTap — 可能走 openlink 内置跳转，或需升级基础库');
            console.warn(LOG_TAG, '当前基础库无 GameClubButton.onTap，请升级微信后再试');
        } else {
            dbg('ensureNativeButton: createGameClubButton 返回 null');
        }
    }
}

/** 在 host 节点上挂载游戏圈原生按钮（无节点则跳过） */
export function ensureOfficialGameClubButtonHost(hostNode: Node | null): OfficialGameClubButtonHost | null {
    if (!hostNode?.isValid) {
        return null;
    }
    return (
        hostNode.getComponent(OfficialGameClubButtonHost) ??
        hostNode.addComponent(OfficialGameClubButtonHost)
    );
}

/** 在 parent 下查找或创建 OfficialGameClubHost 子节点 */
export function resolveOfficialGameClubHostNode(parent: Node | null): Node | null {
    if (!parent?.isValid) {
        return null;
    }
    let host = parent.getChildByName('OfficialGameClubHost');
    if (!host?.isValid) {
        host = new Node('OfficialGameClubHost');
        host.setParent(parent);
    }
    return host;
}
