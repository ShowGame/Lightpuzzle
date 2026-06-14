import { _decorator, Button, Component, director, Label, Node } from 'cc';
import type { OpticalSnapshotNotify } from '../Games/OpticalPuzzle/Application/OpticalPuzzleSession';
import { ensureBackButtonView } from '../Games/OpticalPuzzle/Presentation/OpticalPuzzleBackButtonView';
import { ensureLevelSelectButtonView } from '../Games/OpticalPuzzle/Presentation/OpticalPuzzleLevelSelectButtonView';
import {
    ensureAnswerPanel,
    openAnswerPanel,
    resolveAnswerPanelNode,
} from '../Games/OpticalPuzzle/Presentation/OpticalPuzzleAnswerPanel';
import {
    ensureLevelSelectPanel,
    openLevelSelectPanel,
    prewarmLevelSelectPanel,
    syncLevelSelectPanelVisuals,
} from '../Games/OpticalPuzzle/Presentation/OpticalPuzzleLevelSelectPanel';
import { ensureStepViews } from '../Games/OpticalPuzzle/Presentation/OpticalPuzzleStepView';
import { ensureWinPanelNextLevelButtonView } from '../Games/OpticalPuzzle/Presentation/OpticalPuzzleWinPanelNextLevelButtonView';
import { ensureWinPanelStarsView } from '../Games/OpticalPuzzle/Presentation/OpticalPuzzleWinPanelStarsView';
import { ensureWinPanelStepViews } from '../Games/OpticalPuzzle/Presentation/OpticalPuzzleWinPanelStepView';
import { ensureWinPanelTitleView } from '../Games/OpticalPuzzle/Presentation/OpticalPuzzleWinPanelTitleView';
import { ensureWinPanelWindsView } from '../Games/OpticalPuzzle/Presentation/OpticalPuzzleWinPanelWindsView';
import { DataManager } from './DataManager';
import { AUDIO_EFFECT_ENUM, EVENT_ENUM, SCENE_ENUM } from '../Utils/Enum';
import { OPTICAL_PUZZLE, PLAY_AUDIO } from '../Utils/Event';

const { ccclass, property } = _decorator;

/**
 * Game 场景局内 UI 编排：返回菜单、局内选关弹层等。
 * 挂在 GameRoot；按钮与面板拖入对应属性，勿在 Button Click Events 里重复绑逻辑。
 */
@ccclass('GameUIManager')
export class GameUIManager extends Component {
    /** 返回菜单（TopBar/BtnBackMenu） */
    @property(Node)
    btnBackMenu: Node = null;

    /** 打开局内选关面板（TopBar/BtnLevelSelect） */
    @property(Node)
    btnLevelSelect: Node = null;

    /** 选关弹层根节点（layerOverlay/LevelSelectPanel） */
    @property(Node)
    levelSelectPanel: Node = null;

    /** 参考解弹层（layerOverlay/answerPanel） */
    @property(Node)
    answerPanel: Node = null;

    /** 当前关卡标题（TopBar/LabelLevel 的 cc.Label） */
    @property(Label)
    labelLevel: Label | null = null;

    private _displayedLevelId = -1;

    protected onLoad(): void {
        director.preloadScene(SCENE_ENUM.MENU);
        this._resolveLabelLevel();
        this._ensureTopBarIconButtons();
        ensureWinPanelWindsView(this.node);
        ensureWinPanelTitleView(this.node);
        ensureWinPanelStarsView(this.node);
        ensureWinPanelStepViews(this.node);
        ensureWinPanelNextLevelButtonView(this.node);
        this._resolveAnswerPanel();
        ensureLevelSelectPanel(this.levelSelectPanel);
        ensureAnswerPanel(this.answerPanel);
        this.closeLevelSelect();
        this.closeAnswerPanel();
        prewarmLevelSelectPanel(this.levelSelectPanel);
        this.bindBackMenuButton();
        this.bindLevelSelectButton();
        OPTICAL_PUZZLE.on(
            EVENT_ENUM.OPTICAL_SNAPSHOT_CHANGED,
            this._onOpticalSnapshotChanged,
            this,
        );
        this.refreshLevelLabel(DataManager.instance.opticalCurrentLevelId);
    }

    protected onDestroy(): void {
        OPTICAL_PUZZLE.off(
            EVENT_ENUM.OPTICAL_SNAPSHOT_CHANGED,
            this._onOpticalSnapshotChanged,
            this,
        );
        this.unbindBackMenuButton();
        this.unbindLevelSelectButton();
    }

    /** 将 TopBar 关卡标题设为「第 X 关」 */
    refreshLevelLabel(levelId: number): void {
        if (!this.labelLevel?.isValid || levelId <= 0) {
            return;
        }
        this.labelLevel.string = `第 ${levelId} 关`;
        this._displayedLevelId = levelId;
    }

    /** 返回 Menu 场景 */
    backToMenu(): void {
        director.loadScene(SCENE_ENUM.MENU);
    }

    /** 显示局内选关面板（列表已在进入场景时预构建，打开前刷新解锁） */
    openLevelSelect(): void {
        openLevelSelectPanel(this.levelSelectPanel);
    }

    /** 隐藏局内选关面板 */
    closeLevelSelect(): void {
        if (!this.levelSelectPanel?.isValid) {
            return;
        }
        this.levelSelectPanel.active = false;
    }

    /** 显示参考解面板 */
    openAnswerPanel(): void {
        openAnswerPanel(this.answerPanel);
    }

    /** 隐藏参考解面板 */
    closeAnswerPanel(): void {
        if (!this.answerPanel?.isValid) {
            return;
        }
        this.answerPanel.active = false;
    }

    private bindBackMenuButton(): void {
        this.bindNodeClick(this.btnBackMenu, this.onBackMenuClick);
    }

    private unbindBackMenuButton(): void {
        this.unbindNodeClick(this.btnBackMenu, this.onBackMenuClick);
    }

    private bindLevelSelectButton(): void {
        this.bindNodeClick(this.btnLevelSelect, this.onLevelSelectClick);
    }

    private unbindLevelSelectButton(): void {
        this.unbindNodeClick(this.btnLevelSelect, this.onLevelSelectClick);
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
        const clickNode = button?.node;
        if (clickNode?.isValid) {
            clickNode.off(Button.EventType.CLICK, handler, this);
            return;
        }
        node.off(Node.EventType.TOUCH_END, handler, this);
    }

    private onBackMenuClick(): void {
        PLAY_AUDIO.emit(EVENT_ENUM.PLAY_AUDIO, AUDIO_EFFECT_ENUM.CLICK_BUTTON);
        // 下一帧切场景，避免与 Button 缩放/绘制抢同一帧主线程
        this.scheduleOnce(() => this.backToMenu(), 0);
    }

    private onLevelSelectClick(): void {
        PLAY_AUDIO.emit(EVENT_ENUM.PLAY_AUDIO, AUDIO_EFFECT_ENUM.CLICK_BUTTON);
        this.openLevelSelect();
    }

    /** TopBar 图标键：Graphics 绘制 + 与四向键一致的按压缩放 */
    private _ensureTopBarIconButtons(): void {
        const topBar = this.node.getChildByName('layHub')?.getChildByName('TopBar') ?? null;
        if (!this.btnBackMenu?.isValid) {
            this.btnBackMenu = topBar?.getChildByName('BtnBackMenu') ?? null;
        }
        if (!this.btnLevelSelect?.isValid) {
            this.btnLevelSelect = topBar?.getChildByName('BtnLevelSelect') ?? null;
        }
        ensureBackButtonView(this.btnBackMenu);
        ensureLevelSelectButtonView(this.btnLevelSelect);
        ensureStepViews(topBar);
    }

    /** 未在检查器绑定时，按 layerOverlay/answerPanel 解析 */
    private _resolveAnswerPanel(): void {
        if (this.answerPanel?.isValid) {
            return;
        }
        this.answerPanel = resolveAnswerPanelNode(this.node);
    }

    /** 未在检查器绑定时，按 GameRoot/layHub/TopBar/LabelLevel 解析 */
    private _resolveLabelLevel(): void {
        if (this.labelLevel?.isValid) {
            return;
        }
        const labelNode =
            this.node.getChildByName('layHub')?.getChildByName('TopBar')?.getChildByName('LabelLevel') ??
            null;
        if (!labelNode?.isValid) {
            return;
        }
        this.labelLevel = labelNode.getComponent(Label);
    }

    private _onOpticalSnapshotChanged(payload: OpticalSnapshotNotify): void {
        const snap = payload?.snapshot;
        if (!snap) {
            return;
        }
        if (snap.levelId !== this._displayedLevelId) {
            this.refreshLevelLabel(snap.levelId);
        }
        syncLevelSelectPanelVisuals(this.levelSelectPanel);
    }
}
