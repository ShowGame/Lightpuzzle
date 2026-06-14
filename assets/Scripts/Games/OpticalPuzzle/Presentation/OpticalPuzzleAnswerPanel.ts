import {
    _decorator,
    BlockInputEvents,
    Button,
    Component,
    EventTouch,
    Graphics,
    Node,
    Sprite,
    UITransform,
} from 'cc';
import { MenuOverlayWindow } from '../../../MenuOverlayWindow';
import { AUDIO_EFFECT_ENUM, EVENT_ENUM } from '../../../Utils/Enum';
import { PLAY_AUDIO } from '../../../Utils/Event';
import {
    drawLevelSelectCloseGlyph,
    drawLevelSelectPanelChrome,
    drawLevelSelectTitleBar,
    LEVEL_SELECT_CLOSE_DESIGN_SIZE,
} from './OpticalPuzzleLevelSelectPanelGlyph';
import { HudButtonPressController } from './OpticalPuzzleHudButtonCommon';
import { ensureActionButtonView } from './OpticalPuzzleActionButtonView';
import {
    ensureAnswerReplayView,
    OpticalPuzzleAnswerReplayView,
} from './OpticalPuzzleAnswerReplayView';

const { ccclass } = _decorator;

/** 与 Game.scene answerPanel 占位布局一致（设计 px） */
const PANEL_WIDTH = 650;
const PANEL_HEIGHT = 800;
const PANEL_OFFSET_Y = -25;
const TITLE_WIDTH = 180;
const TITLE_HEIGHT = 80;
const TITLE_OFFSET_Y = 375;
const CLOSE_SIZE = LEVEL_SELECT_CLOSE_DESIGN_SIZE;
const CLOSE_OFFSET_X = 315;
const CLOSE_OFFSET_Y = 370;

const GFX_CHILD_NAME = 'gfx';

/**
 * 参考解弹层：panel / titlebar / closebtn 绘制与关闭；answer 子节点自动回放 bestSolution；resetbtn 从头重播。
 * 挂到 layerOverlay/answerPanel。
 */
@ccclass('OpticalPuzzleAnswerPanel')
export class OpticalPuzzleAnswerPanel extends Component {
    private _backdropNode: Node | null = null;
    private _panelNode: Node | null = null;
    private _titleNode: Node | null = null;
    private _closeNode: Node | null = null;
    private _resetNode: Node | null = null;
    private _panelGraphics: Graphics | null = null;
    private _titleGraphics: Graphics | null = null;
    private _closeGraphics: Graphics | null = null;
    private _closePressed = false;
    private _closePressCtrl: HudButtonPressController | null = null;

    protected onLoad(): void {
        this._disableLegacyOverlayWindow();
        this._hidePlaceholderSplashes();
        this._ensureRootLayout();
        this._buildUiTree();
        this._bindCloseButton();
        this._bindResetButton();
        this._redrawStaticChrome();
    }

    protected onEnable(): void {
        this._closePressCtrl?.bind();
    }

    protected onDisable(): void {
        this._closePressCtrl?.unbind();
        this._closePressed = false;
    }

    protected onDestroy(): void {
        this._closePressCtrl?.unbind();
        if (this._closeNode?.isValid) {
            this._closeNode.off(Button.EventType.CLICK, this._onCloseClick, this);
        }
        if (this._resetNode?.isValid) {
            this._resetNode.off(Button.EventType.CLICK, this._onResetClick, this);
        }
        if (this._backdropNode?.isValid) {
            this._backdropNode.off(Node.EventType.TOUCH_END, this._onBackdropTouchEnd, this);
        }
    }

    /** 关闭参考解面板 */
    close(): void {
        if (this.node?.isValid) {
            this.node.active = false;
        }
    }

    private _disableLegacyOverlayWindow(): void {
        const legacy = this.getComponent(MenuOverlayWindow);
        if (legacy) {
            legacy.destroy();
        }
    }

    private _ensureRootLayout(): void {
        if (!this.getComponent(UITransform)) {
            const ut = this.addComponent(UITransform);
            ut.setAnchorPoint(0.5, 0.5);
        }
    }

    private _buildUiTree(): void {
        this._backdropNode = this._ensureNamedChild('bg');
        this._ensureBackdrop(this._backdropNode);

        this._panelNode = this._ensureNamedChild('panel');
        this._ensurePanelBody(this._panelNode);

        this._titleNode = this._ensureNamedChild('titlebar');
        this._ensureTitleBar(this._titleNode);

        this._closeNode = this._ensureNamedChild('closebtn');
        this._ensureCloseButton(this._closeNode);

        ensureAnswerReplayView(this._ensureNamedChild('answer'));
        this._ensureResetButton(this._ensureNamedChild('resetbtn'));
    }

    private _ensureNamedChild(name: string): Node {
        let child = this.node.getChildByName(name);
        if (!child) {
            child = new Node(name);
            child.setParent(this.node);
        }
        return child;
    }

    private _applyDefaultNodeLayout(
        node: Node,
        width: number,
        height: number,
        x: number,
        y: number,
        anchorX = 0.5,
        anchorY = 0.5,
    ): void {
        const hadTransform = !!node.getComponent(UITransform);
        const ut = node.getComponent(UITransform) ?? node.addComponent(UITransform);
        if (hadTransform) {
            return;
        }
        ut.setContentSize(width, height);
        ut.setAnchorPoint(anchorX, anchorY);
        node.setPosition(x, y, 0);
    }

    private _ensureBackdrop(node: Node): void {
        if (!node.getComponent(UITransform)) {
            node.addComponent(UITransform);
        }
        if (!node.getComponent(BlockInputEvents)) {
            node.addComponent(BlockInputEvents);
        }
        this._removeGfxChild(node);
        node.off(Node.EventType.TOUCH_END, this._onBackdropTouchEnd, this);
        node.on(Node.EventType.TOUCH_END, this._onBackdropTouchEnd, this);
    }

    private _ensureTouchBlocker(node: Node): void {
        if (!node.getComponent(UITransform)) {
            node.addComponent(UITransform);
        }
        if (!node.getComponent(BlockInputEvents)) {
            node.addComponent(BlockInputEvents);
        }
    }

    private _removeGfxChild(host: Node): void {
        const gfxNode = host.getChildByName(GFX_CHILD_NAME);
        if (gfxNode?.isValid) {
            gfxNode.destroy();
        }
    }

    private _disableHostSprite(host: Node): void {
        const sprite = host.getComponent(Sprite);
        if (sprite) {
            sprite.enabled = false;
        }
    }

    private _ensurePanelBody(node: Node): void {
        this._applyDefaultNodeLayout(node, PANEL_WIDTH, PANEL_HEIGHT, 0, PANEL_OFFSET_Y);
        this._ensureTouchBlocker(node);
        this._removeGfxChild(node);
        this._disableHostSprite(node);
        this._panelGraphics = node.getComponent(Graphics) ?? node.addComponent(Graphics);
    }

    private _ensureTitleBar(node: Node): void {
        this._applyDefaultNodeLayout(node, TITLE_WIDTH, TITLE_HEIGHT, 0, TITLE_OFFSET_Y);
        this._ensureTouchBlocker(node);
        this._removeGfxChild(node);
        this._disableHostSprite(node);
        this._titleGraphics = node.getComponent(Graphics) ?? node.addComponent(Graphics);
    }

    private _ensureCloseButton(node: Node): void {
        this._applyDefaultNodeLayout(node, CLOSE_SIZE, CLOSE_SIZE, CLOSE_OFFSET_X, CLOSE_OFFSET_Y);
        this._removeGfxChild(node);
        this._disableHostSprite(node);

        let btn = node.getComponent(Button);
        if (!btn) {
            btn = node.addComponent(Button);
        }
        btn.transition = Button.Transition.SCALE;
        btn.zoomScale = 0.95;

        this._closeGraphics = node.getComponent(Graphics) ?? node.addComponent(Graphics);
        this._closePressCtrl = new HudButtonPressController(
            node,
            (pressed) => {
                this._closePressed = pressed;
                this._redrawCloseButton();
            },
            true,
        );
    }

    /** resetbtn：样式与 ActionPad BtnReset 一致（OpticalPuzzleActionButtonView） */
    private _ensureResetButton(node: Node): void {
        this._resetNode = node;
        ensureActionButtonView(node);
    }

    private _bindResetButton(): void {
        if (!this._resetNode?.isValid) {
            return;
        }
        this._resetNode.off(Button.EventType.CLICK, this._onResetClick, this);
        this._resetNode.on(Button.EventType.CLICK, this._onResetClick, this);
    }

    private _resolveAnswerReplayView(): OpticalPuzzleAnswerReplayView | null {
        const answer = this.node.getChildByName('answer');
        return answer?.getComponent(OpticalPuzzleAnswerReplayView) ?? null;
    }

    private _bindCloseButton(): void {
        if (!this._closeNode?.isValid) {
            return;
        }
        this._closeNode.off(Button.EventType.CLICK, this._onCloseClick, this);
        this._closeNode.on(Button.EventType.CLICK, this._onCloseClick, this);
    }

    /** 隐藏占位 Splash；保留 answer 子树占位 */
    private _hidePlaceholderSplashes(): void {
        const walk = (node: Node, skipSubtree: boolean): void => {
            if (node.name === 'SpriteSplash' && !skipSubtree) {
                node.active = false;
            }
            const childSkip = skipSubtree || node.name === 'answer';
            for (const child of node.children) {
                walk(child, childSkip);
            }
        };
        for (const child of this.node.children) {
            walk(child, false);
        }
    }

    private _redrawStaticChrome(): void {
        this._redrawPanelBody();
        this._redrawTitleBar();
        this._redrawCloseButton();
    }

    private _redrawPanelBody(): void {
        const g = this._panelGraphics;
        const ut = this._panelNode?.getComponent(UITransform);
        if (!g?.isValid || !ut) {
            return;
        }
        g.clear();
        const w = ut.width;
        const h = ut.height;
        drawLevelSelectPanelChrome(g, -w * 0.5, -h * 0.5, w, h);
    }

    private _redrawTitleBar(): void {
        const g = this._titleGraphics;
        const ut = this._titleNode?.getComponent(UITransform);
        if (!g?.isValid || !ut) {
            return;
        }
        g.clear();
        const w = ut.width;
        const h = ut.height;
        drawLevelSelectTitleBar(g, -w * 0.5, -h * 0.5, w, h);
    }

    private _redrawCloseButton(): void {
        const g = this._closeGraphics;
        const ut = this._closeNode?.getComponent(UITransform);
        if (!g?.isValid || !ut) {
            return;
        }
        g.clear();
        const w = ut.width;
        const h = ut.height;
        drawLevelSelectCloseGlyph(g, -w * 0.5, -h * 0.5, w, h, this._closePressed);
    }

    private _onCloseClick(): void {
        PLAY_AUDIO.emit(EVENT_ENUM.PLAY_AUDIO, AUDIO_EFFECT_ENUM.CLICK_BUTTON);
        this.close();
    }

    private _onResetClick(): void {
        PLAY_AUDIO.emit(EVENT_ENUM.PLAY_AUDIO, AUDIO_EFFECT_ENUM.CLICK_BUTTON);
        this._resolveAnswerReplayView()?.restartFromBeginning();
    }

    /** 仅点击 bg 空白遮罩时关闭 */
    private _onBackdropTouchEnd(event: EventTouch): void {
        if (event.target !== this._backdropNode) {
            return;
        }
        PLAY_AUDIO.emit(EVENT_ENUM.PLAY_AUDIO, AUDIO_EFFECT_ENUM.CLICK_BUTTON);
        this.close();
    }
}

/** 为 answerPanel 根节点挂上绘制与关闭逻辑 */
export function ensureAnswerPanel(panelNode: Node | null): void {
    if (!panelNode?.isValid) {
        return;
    }
    const legacy = panelNode.getComponent(MenuOverlayWindow);
    if (legacy) {
        legacy.destroy();
    }
    if (!panelNode.getComponent(OpticalPuzzleAnswerPanel)) {
        panelNode.addComponent(OpticalPuzzleAnswerPanel);
    }
}

/** 打开参考解面板 */
export function openAnswerPanel(panelNode: Node | null): void {
    if (!panelNode?.isValid) {
        return;
    }
    ensureAnswerPanel(panelNode);
    panelNode.active = true;
}

/** 自 GameRoot 解析 layerOverlay 下参考解面板 */
export function resolveAnswerPanelNode(root: Node | null): Node | null {
    const overlay = root?.getChildByName('layerOverlay') ?? null;
    if (!overlay?.isValid) {
        return null;
    }
    return (
        overlay.getChildByName('answerPanel') ??
        overlay.getChildByName('AnswerPanel') ??
        null
    );
}
