import { _decorator, Button, Component, director, Node } from 'cc';
import {
    ensureAboutMePanel,
    resolveAboutMePanelNode,
} from '../Games/OpticalPuzzle/Presentation/OpticalPuzzleAboutMePanel';
import {
    ensureLevelSelectPanel,
    openLevelSelectPanel,
    prewarmLevelSelectPanel,
    resolveLevelSelectPanelNode,
} from '../Games/OpticalPuzzle/Presentation/OpticalPuzzleLevelSelectPanel';
import { ensureMenuGameTitleView } from '../MenuGameTitleView';
import { ensureMenuGameTitle2View } from '../MenuGameTitle2View';
import { ensureMenuGameTitleIconView } from '../MenuGameTitleIconView';
import { ensureMenuGameTitleIcon2View } from '../MenuGameTitleIcon2View';
import { ensureMenuAboutButtonView } from '../MenuAboutButtonView';
import { ensureMenuLevelSelectButtonView } from '../MenuLevelSelectButtonView';
import { ensureMenuShareButtonView } from '../MenuShareButtonView';
import { ensureMenuStartButtonView } from '../MenuStartButtonView';
import { DataManager } from './DataManager';
import { AUDIO_EFFECT_ENUM, EVENT_ENUM, SCENE_ENUM } from '../Utils/Enum';
import { PLAY_AUDIO } from '../Utils/Event';
import {
    ensureOfficialGameClubButtonHost,
    resolveOfficialGameClubHostNode,
} from '../Utils/OfficialGameClubButtonHost';
import { invokeWeChatFriendShare, scheduleShareEntryBootstrap } from '../Utils/WeChatShare';

const { ccclass, property } = _decorator;

/**
 * 菜单场景编排：读档、开始游戏、选关弹层等。
 * 挂在 MenuRoot；按钮拖入对应属性，勿在 Button Click Events 里重复绑逻辑。
 */
@ccclass('MenuManager')
export class MenuManager extends Component {
    /** 开始游戏按钮（MainPanel/BtnStart） */
    @property(Node)
    btnStart: Node = null;

    /** 打开选关面板（MainPanel/BtnLevelSelect） */
    @property(Node)
    btnLevelSelect: Node = null;

    /** 选关弹层根节点（layerOverlay/LevelSelectPanel） */
    @property(Node)
    levelSelectPanel: Node = null;

    /** 微信分享（MainPanel/BtnShare） */
    @property(Node)
    btnShare: Node = null;

    /** 关于（MainPanel/BtnAbout） */
    @property(Node)
    btnAbout: Node = null;

    /** 关于弹层（layerOverlay/aboutMePanel） */
    @property(Node)
    aboutMePanel: Node = null;

    /** 游戏标题（MainPanel/GameTitle，矢量描边） */
    @property(Node)
    gameTitle: Node = null;

    /** 副标题（MainPanel/GameTitle2，矢量描边） */
    @property(Node)
    gameTitle2: Node = null;

    /** 标题主角图标（MainPanel/GameTitleIcon，睁眼朝左看） */
    @property(Node)
    gameTitleIcon: Node = null;

    /** 标题白色光源（MainPanel/GameTitleIcon2，朝右 1000px 光束） */
    @property(Node)
    gameTitleIcon2: Node = null;

    protected onLoad(): void {
        DataManager.instance.init();
        director.preloadScene(SCENE_ENUM.GAME);
        this._resolveMenuNodes();
        ensureMenuStartButtonView(this.btnStart);
        ensureMenuLevelSelectButtonView(this.btnLevelSelect);
        ensureMenuShareButtonView(this.btnShare);
        ensureMenuAboutButtonView(this.btnAbout);
        ensureOfficialGameClubButtonHost(resolveOfficialGameClubHostNode(this.node));
        ensureLevelSelectPanel(this.levelSelectPanel);
        ensureAboutMePanel(this.aboutMePanel);
        ensureMenuGameTitleView(this.gameTitle);
        ensureMenuGameTitle2View(this.gameTitle2);
        ensureMenuGameTitleIconView(this.gameTitleIcon);
        ensureMenuGameTitleIcon2View(this.gameTitleIcon2);
        this.closeLevelSelect();
        this.closeAbout();
        prewarmLevelSelectPanel(this.levelSelectPanel);
        this.bindStartButton();
        this.bindLevelSelectButton();
        this.bindShareButton();
        this.bindAboutButton();
    }

    protected start(): void {
        /** 冷启动分享：等 PersistRoot 解析 query 后，下一帧切 Game（onLoad 内 loadScene 不可靠） */
        scheduleShareEntryBootstrap(this, 0);
    }

    protected onDestroy(): void {
        this.unbindStartButton();
        this.unbindLevelSelectButton();
        this.unbindShareButton();
        this.unbindAboutButton();
    }

    /** 进入局内场景（当前进度关卡由 DataManager.opticalCurrentLevelId 决定） */
    startGame(): void {
        director.loadScene(SCENE_ENUM.GAME);
    }

    /** 显示选关面板 */
    openLevelSelect(): void {
        openLevelSelectPanel(this.levelSelectPanel);
    }

    /** 隐藏选关面板（MenuOverlayWindow 关闭时也可调） */
    closeLevelSelect(): void {
        if (!this.levelSelectPanel?.isValid) {
            return;
        }
        this.levelSelectPanel.active = false;
    }

    /** 显示关于弹层 */
    openAbout(): void {
        if (!this.aboutMePanel?.isValid) {
            return;
        }
        this.closeLevelSelect();
        this.aboutMePanel.active = true;
    }

    /** 隐藏关于弹层 */
    closeAbout(): void {
        if (!this.aboutMePanel?.isValid) {
            return;
        }
        this.aboutMePanel.active = false;
    }

    /** 未在检查器绑定时，按 MenuRoot 子节点名解析 */
    private _resolveMenuNodes(): void {
        if (!this.btnStart?.isValid) {
            this.btnStart = this._findMainPanel()?.getChildByName('BtnStart') ?? null;
        }
        if (!this.btnLevelSelect?.isValid) {
            this.btnLevelSelect = this._findMainPanel()?.getChildByName('BtnLevelSelect') ?? null;
        }
        if (!this.btnShare?.isValid) {
            this.btnShare = this._findMainPanel()?.getChildByName('BtnShare') ?? null;
        }
        if (!this.btnAbout?.isValid) {
            this.btnAbout = this._findMainPanel()?.getChildByName('BtnAbout') ?? null;
        }
        if (!this.levelSelectPanel?.isValid) {
            this.levelSelectPanel = resolveLevelSelectPanelNode(this.node);
        }
        if (!this.aboutMePanel?.isValid) {
            this.aboutMePanel = resolveAboutMePanelNode(this.node);
        }
        if (!this.gameTitle?.isValid) {
            this.gameTitle = this._findMainPanel()?.getChildByName('GameTitle') ?? null;
        }
        if (!this.gameTitle2?.isValid) {
            this.gameTitle2 = this._findMainPanel()?.getChildByName('GameTitle2') ?? null;
        }
        if (!this.gameTitleIcon?.isValid) {
            this.gameTitleIcon = this._findMainPanel()?.getChildByName('GameTitleIcon') ?? null;
        }
        if (!this.gameTitleIcon2?.isValid) {
            this.gameTitleIcon2 = this._findMainPanel()?.getChildByName('GameTitleIcon2') ?? null;
        }
    }

    private _findMainPanel(): Node | null {
        return this.node.getChildByName('layerMain')?.getChildByName('MainPanel') ?? null;
    }

    private bindStartButton(): void {
        this.bindNodeClick(this.btnStart, this.onStartClick);
    }

    private unbindStartButton(): void {
        this.unbindNodeClick(this.btnStart, this.onStartClick);
    }

    private bindLevelSelectButton(): void {
        this.bindNodeClick(this.btnLevelSelect, this.onLevelSelectClick);
    }

    private unbindLevelSelectButton(): void {
        this.unbindNodeClick(this.btnLevelSelect, this.onLevelSelectClick);
    }

    private bindShareButton(): void {
        this.bindNodeClick(this.btnShare, this.onShareClick);
    }

    private unbindShareButton(): void {
        this.unbindNodeClick(this.btnShare, this.onShareClick);
    }

    private bindAboutButton(): void {
        this.bindNodeClick(this.btnAbout, this.onAboutClick);
    }

    private unbindAboutButton(): void {
        this.unbindNodeClick(this.btnAbout, this.onAboutClick);
    }

    private bindNodeClick(node: Node | null, handler: () => void): void {
        if (!node?.isValid) {
            return;
        }
        const button = node.getComponent(Button);
        if (button) {
            button.node.on(Button.EventType.CLICK, handler, this);
            return;
        }
        node.on(Node.EventType.TOUCH_END, handler, this);
    }

    private unbindNodeClick(node: Node | null, handler: () => void): void {
        if (!node?.isValid) {
            return;
        }
        const button = node.getComponent(Button);
        if (button) {
            button.node.off(Button.EventType.CLICK, handler, this);
            return;
        }
        node.off(Node.EventType.TOUCH_END, handler, this);
    }

    private onStartClick(): void {
        PLAY_AUDIO.emit(EVENT_ENUM.PLAY_AUDIO, AUDIO_EFFECT_ENUM.CLICK_BUTTON);
        this.startGame();
    }

    private onLevelSelectClick(): void {
        PLAY_AUDIO.emit(EVENT_ENUM.PLAY_AUDIO, AUDIO_EFFECT_ENUM.CLICK_BUTTON);
        this.openLevelSelect();
    }

    /** 微信好友分享（非微信环境 onFail） */
    private onShareClick(): void {
        invokeWeChatFriendShare({
            onSuccess: () => {
                /* 可按需加分享奖励 */
            },
            onFail: () => {
                /* 浏览器预览等环境无 wx.shareAppMessage */
            },
        });
        PLAY_AUDIO.emit(EVENT_ENUM.PLAY_AUDIO, AUDIO_EFFECT_ENUM.CLICK_BUTTON);
    }

    private onAboutClick(): void {
        PLAY_AUDIO.emit(EVENT_ENUM.PLAY_AUDIO, AUDIO_EFFECT_ENUM.CLICK_BUTTON);
        this.openAbout();
    }
}
