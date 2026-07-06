import {
    Button,
    Color,
    Component,
    EventKeyboard,
    EventMouse,
    EventTouch,
    Graphics,
    Input,
    KeyCode,
    Label,
    Mask,
    Node,
    Sprite,
    UITransform,
    _decorator,
    input,
    sys,
} from 'cc';
import { OpticalPuzzleSession } from '../Application/OpticalPuzzleSession';
import { buildTeachScene2PushPlan } from '../Application/OpticalTeachScene2Plan';
import { OpticalGameFlowState } from '../Application/OpticalPuzzleStateMachine';
import { getFirstOpticalLevelId } from '../Config/OpticalPuzzleLevels';
import { Direction } from '../Core/OpticalPuzzleTypes';
import { DEBUG_SKIP_ALL_ADS } from '../../../Config/DebugMockSave';
import { AUDIO_EFFECT_ENUM, EVENT_ENUM } from '../../../Utils/Enum';
import { PLAY_AUDIO } from '../../../Utils/Event';
import { showWeChatInterstitialAd, showWeChatRewardedVideo } from '../../../Utils/WeChatRewardedVideoAd';
import { invokeWeChatFriendShare } from '../../../Utils/WeChatShare';
import { openAnswerPanel, resolveAnswerPanelNode } from './OpticalPuzzleAnswerPanel';
import { ensureActionButtonViews, OpticalPuzzleActionButtonView } from './OpticalPuzzleActionButtonView';
import type { OpticalPuzzleBoardView } from './OpticalPuzzleBoardView';
import { ensureDirButtonViews, OpticalPuzzleDirButtonView } from './OpticalPuzzleDirButtonView';
import {
    buildTutorialBreathGlowLayers,
    HUD_DIR_BUTTON_SCENE_SIZE,
    HUD_KEY_BORDER_DESIGN,
    scaleHudDesign,
    strokeGlowLayers,
    TUTORIAL_HINT_BORDER,
    TUTORIAL_HINT_GLOW_RGB,
} from './OpticalPuzzleHudButtonCommon';

const { ccclass, property } = _decorator;

/** 未在 teachPanel/bg Sprite 上配置颜色时的兜底蒙层 */
const TEACH_BG_DIM_FALLBACK = new Color(0, 0, 0, 77);

/** 挖孔圆角（设计 px） */
const TEACH_HOLE_CORNER_RADIUS = 20;

/** 教学第一幕：两枚挖孔（bg 本地坐标，设计 px） */
const TEACH_SCENE1_HOLES: readonly TeachSpotlightHole[] = [
    { cx: 210, cy: 332.5, width: 220, height: 300 },
    { cx: 0, cy: -500, width: 360, height: 340 },
];

/** 教学第二幕：仅保留上方镂空目标（取消下方镂空） */
const TEACH_SCENE2_HOLE: TeachSpotlightHole = {
    cx: -65,
    cy: 290,
    width: 580,
    height: 460,
};

/** 第一幕 → 第二幕：镂空缓动时长（秒） */
const TEACH_HOLE_TWEEN_DURATION = 0.55;

const enum TeachActPhase {
    Scene1 = 1,
    Scene2 = 2,
}

const TEACH_BG_CHILD_NAME = 'bg';

/** 与方向键教程黄呼吸光晕同周期（秒） */
const TUTORIAL_BREATH_PERIOD_SEC = 1.8;

/** 第一关教学：方向键循环顺序（左→下→右→上） */
const TEACH_DIR_CYCLE_ORDER: readonly Direction[] = [
    Direction.Left,
    Direction.Down,
    Direction.Right,
    Direction.Up,
];

/** 每个方向演示时长（秒）；四步共 4 秒一轮 */
const TEACH_DIR_STEP_SEC = 1;

/** 方向键按压反馈时长（秒） */
const TEACH_DIR_PRESS_SEC = 0.3;

/** 第一幕 teachPanel 文案 */
const TEACH_SCENE1_TEXT1 = '方向按钮可控制小咪运动。';
const TEACH_SCENE1_TEXT2 = '继续 >';

/** 第二幕 teachPanel 文案 */
const TEACH_SCENE2_TEXT1 = '推动元件，点亮灯光，即可通关。';
const TEACH_SCENE2_TEXT2 = '我学会了 >';

/** 挖孔描边层（叠在 dimMask 之上） */
const TEACH_HOLE_BORDER_CHILD_NAME = 'holeBorder';

/** 反向遮罩根节点（Mask.inverted + 子节点 dim 铺满半透明） */
const TEACH_DIM_MASK_NAME = 'dimMask';

/** 被 Mask 裁剪的半透明蒙层 */
const TEACH_DIM_CHILD_NAME = 'dim';

interface TeachSpotlightHole {
    cx: number;
    cy: number;
    width: number;
    height: number;
}

/**
 * 四向、撤回、重置。键盘：方向键 / WASD 移动，Z 撤回 1 步，R 重置（与 UI 按钮可同时使用）。
 */
@ccclass('OpticalPuzzleInputHud')
export class OpticalPuzzleInputHud extends Component {
    @property(Button)
    btnUp: Button | null = null;

    @property(Button)
    btnDown: Button | null = null;

    @property(Button)
    btnLeft: Button | null = null;

    @property(Button)
    btnRight: Button | null = null;

    @property(Button)
    btnUndo: Button | null = null;

    @property(Button)
    btnReset: Button | null = null;

    @property(Button)
    btnAnswer: Button | null = null;

    /** 微信分享（ActionPad/BtnShare） */
    @property(Button)
    btnShare: Button | null = null;

    private _session: OpticalPuzzleSession | null = null;
    private _boardView: OpticalPuzzleBoardView | null = null;
    /** 激励 / 插屏拉起中，避免重复点击 */
    private _undoRewardAdPending = false;
    private _answerRewardAdPending = false;
    private _btnUndoBadge: Button | null = null;
    private _btnAnswerBadge: Button | null = null;
    /** teachPanel/bg 反向 Mask 镂空节点缓存 */
    private _teachBgNode: Node | null = null;
    private _teachMaskGraphics: Graphics | null = null;
    private _teachHoleBorderGraphics: Graphics | null = null;
    private _teachHoleBreathPhase = 0;
    /** 第一关步数 0 教学幕是否激活 */
    private _teachActActive = false;
    /** 用户已在第二幕点击关闭教学，本局不再自动弹出（重置关卡后清除） */
    private _teachActUserDismissed = false;
    private _teachDirCycleElapsed = 0;
    private _teachDirCycleIndex = 0;
    private _teachPhase = TeachActPhase.Scene1;
    /** 当前帧用于绘制的镂空（含缓动中间态） */
    private _teachHoles: TeachSpotlightHole[] = [];
    private _teachHoleTweenActive = false;
    private _teachHoleTweenElapsed = 0;
    private _teachHoleTweenFrom: TeachSpotlightHole | null = null;
    /** 已绑定点击的节点（teachPanel / bg） */
    private _teachTapNodes: Node[] = [];
    private _teachGlobalTapBound = false;
    private _teachTapConsumed = false;

    protected onLoad(): void {
        this._autoBindButtons();
    }

    /** 未在检查器拖引用时，按 DirPad / ActionPad 子节点名自动绑定并补 Button */
    private _autoBindButtons(): void {
        const dirPad = this.node.getChildByName('DirPad');
        ensureDirButtonViews(dirPad);
        this.btnUp = this._resolveButton(dirPad, 'BtnUp', this.btnUp);
        this.btnDown = this._resolveButton(dirPad, 'BtnDown', this.btnDown);
        this.btnLeft = this._resolveButton(dirPad, 'BtnLeft', this.btnLeft);
        this.btnRight = this._resolveButton(dirPad, 'BtnRight', this.btnRight);
        const actionPad = this.node.getChildByName('ActionPad');
        ensureActionButtonViews(actionPad);
        this.btnUndo = this._resolveButton(actionPad, 'BtnUndo', this.btnUndo);
        this.btnReset = this._resolveButton(actionPad, 'BtnReset', this.btnReset);
        this.btnAnswer = this._resolveButton(actionPad, 'BtnAnswer', this.btnAnswer);
        this.btnShare = this._resolveButton(actionPad, 'BtnShare', this.btnShare);
    }

    private _resolveButton(
        parent: Node | null,
        childName: string,
        existing: Button | null,
    ): Button | null {
        if (existing?.isValid) {
            return existing;
        }
        const node = parent?.getChildByName(childName) ?? null;
        if (!node) {
            return null;
        }
        let btn = node.getComponent(Button);
        if (!btn) {
            btn = node.addComponent(Button);
            btn.transition = Button.Transition.SCALE;
        }
        btn.zoomScale = 0.95;
        return btn;
    }

    setup(session: OpticalPuzzleSession, boardView?: OpticalPuzzleBoardView): void {
        this.teardown();
        this._autoBindButtons();
        this._session = session;
        this._boardView = boardView ?? null;
        this._boardView?.setTeachScene2PresentationHooks({
            onPushStep: () => this._applyTeachScene2LeftPress(),
        });
        this.btnUp?.node.on(Button.EventType.CLICK, this._onUp, this);
        this.btnDown?.node.on(Button.EventType.CLICK, this._onDown, this);
        this.btnLeft?.node.on(Button.EventType.CLICK, this._onLeft, this);
        this.btnRight?.node.on(Button.EventType.CLICK, this._onRight, this);
        this.btnUndo?.node.on(Button.EventType.CLICK, this._onUndo, this);
        this.btnReset?.node.on(Button.EventType.CLICK, this._onReset, this);
        this.btnAnswer?.node.on(Button.EventType.CLICK, this._onAnswer, this);
        this.btnShare?.node.on(Button.EventType.CLICK, this._onShare, this);
        this._bindUndoVideoBadgeHit();
        this._bindAnswerVideoBadgeHit();
        input.on(Input.EventType.KEY_DOWN, this._onKeyDown, this);
        this.refreshActionButtons();
        this._ensureTeachSpotlightNodes();
        this._teachHoleBreathPhase = 0;
        this.refreshTeachAct();
    }

    protected update(dt: number): void {
        if (!this._teachActActive) {
            return;
        }
        this._teachHoleBreathPhase += dt;

        if (this._teachHoleTweenActive) {
            this._tickTeachHoleTween(dt);
        }

        if (this._teachPhase === TeachActPhase.Scene1) {
            this._teachDirCycleElapsed += dt;
            while (this._teachDirCycleElapsed >= TEACH_DIR_STEP_SEC) {
                this._teachDirCycleElapsed -= TEACH_DIR_STEP_SEC;
                this._teachDirCycleIndex =
                    (this._teachDirCycleIndex + 1) % TEACH_DIR_CYCLE_ORDER.length;
                if (this._teachDirCycleIndex === 0) {
                    this._boardView?.resetTeachVisualPosition();
                }
                this._applyTeachDirDemoStep(this._teachDirCycleIndex);
            }
        }

        this._redrawTeachSpotlightGraphics();
    }

    private _tickTeachHoleTween(dt: number): void {
        const from = this._teachHoleTweenFrom;
        if (!from) {
            return;
        }
        this._teachHoleTweenElapsed += dt;
        const t = Math.min(1, this._teachHoleTweenElapsed / TEACH_HOLE_TWEEN_DURATION);
        const eased = easeOutCubic(t);
        this._teachHoles = [lerpTeachHole(from, TEACH_SCENE2_HOLE, eased)];
        if (t >= 1) {
            this._teachHoleTweenActive = false;
            this._teachHoleTweenFrom = null;
            this._teachHoles = [{ ...TEACH_SCENE2_HOLE }];
            if (this._teachPhase === TeachActPhase.Scene2) {
                const snap = this._session?.getSnapshot();
                if (snap) {
                    const plan = buildTeachScene2PushPlan(snap);
                    if (plan) {
                        this._boardView?.startTeachScene2PushLoop(plan, snap);
                    }
                }
            }
        }
    }

    /** 点击屏幕任意处：第一幕 → 第二幕；第二幕 → 关闭教学 */
    private _onTeachScreenTap(_e: EventTouch): void {
        this._handleTeachScreenAdvance();
    }

    private _onTeachScreenMouseUp(_e: EventMouse): void {
        this._handleTeachScreenAdvance();
    }

    private _handleTeachScreenAdvance(): void {
        if (!this._teachActActive) {
            return;
        }
        if (this._teachTapConsumed) {
            return;
        }
        this._teachTapConsumed = true;
        this.scheduleOnce(this._resetTeachTapConsumed, 0.2);
        if (this._teachPhase === TeachActPhase.Scene1) {
            this._enterTeachScene2();
            return;
        }
        if (this._teachPhase === TeachActPhase.Scene2) {
            this._dismissTeachActByUser();
        }
    }

    private _resetTeachTapConsumed = (): void => {
        this._teachTapConsumed = false;
    };

    private _enterTeachScene2(): void {
        this._teachPhase = TeachActPhase.Scene2;
        this._teachDirCycleElapsed = 0;
        this._releaseAllTeachDirButtonPress();
        this._resetDirPadButtonScale();
        this._boardView?.stopTeachDirectionDemo();
        this._updateTeachPanelTexts(TEACH_SCENE2_TEXT1, TEACH_SCENE2_TEXT2);

        const snap = this._session?.getSnapshot();
        if (snap) {
            this._boardView?.setTeachVisualUpperLeftOfSpawn(snap);
        }

        const topHole = this._teachHoles[0] ?? { ...TEACH_SCENE1_HOLES[0] };
        this._teachHoleTweenFrom = { ...topHole };
        this._teachHoleTweenElapsed = 0;
        this._teachHoleTweenActive = true;
    }

    private _bindTeachScreenTap(): void {
        this._ensureTeachSpotlightNodes();
        const panel = this._resolveTeachPanelNode();
        const candidates: Node[] = [];
        if (panel?.isValid) {
            candidates.push(panel);
        }
        if (this._teachBgNode?.isValid) {
            candidates.push(this._teachBgNode);
        }
        for (const node of candidates) {
            if (this._teachTapNodes.indexOf(node) >= 0) {
                continue;
            }
            node.on(Node.EventType.TOUCH_END, this._onTeachScreenTap, this);
            node.on(Node.EventType.MOUSE_UP, this._onTeachScreenMouseUp, this);
            this._teachTapNodes.push(node);
        }
        if (!this._teachGlobalTapBound) {
            input.on(Input.EventType.TOUCH_END, this._onTeachScreenTap, this);
            input.on(Input.EventType.MOUSE_UP, this._onTeachScreenMouseUp, this);
            this._teachGlobalTapBound = true;
        }
    }

    private _unbindTeachScreenTap(): void {
        for (const node of this._teachTapNodes) {
            if (!node?.isValid) {
                continue;
            }
            node.off(Node.EventType.TOUCH_END, this._onTeachScreenTap, this);
            node.off(Node.EventType.MOUSE_UP, this._onTeachScreenMouseUp, this);
        }
        this._teachTapNodes = [];
        if (this._teachGlobalTapBound) {
            input.off(Input.EventType.TOUCH_END, this._onTeachScreenTap, this);
            input.off(Input.EventType.MOUSE_UP, this._onTeachScreenMouseUp, this);
            this._teachGlobalTapBound = false;
        }
        this.unschedule(this._resetTeachTapConsumed);
        this._teachTapConsumed = false;
    }

    private _initTeachScene1State(): void {
        this._teachPhase = TeachActPhase.Scene1;
        this._teachHoles = TEACH_SCENE1_HOLES.map((h) => ({ ...h }));
        this._teachHoleTweenActive = false;
        this._teachHoleTweenElapsed = 0;
        this._teachHoleTweenFrom = null;
        this._updateTeachPanelTexts(TEACH_SCENE1_TEXT1, TEACH_SCENE1_TEXT2);
    }

    /** 第一关步数 0：显示 teachPanel、刷新挖孔，并启动方向键 + @ 循环演示 */
    refreshTeachAct(clearDismissed = false): void {
        if (clearDismissed) {
            this._teachActUserDismissed = false;
        }
        const shouldShow = this._shouldShowTeachAct();
        const panelNode = this._resolveTeachPanelNode();
        if (panelNode?.isValid) {
            panelNode.active = shouldShow;
        }

        if (shouldShow && !this._teachActActive) {
            this._teachActActive = true;
            this._teachHoleBreathPhase = 0;
            this._teachDirCycleElapsed = 0;
            this._teachDirCycleIndex = 0;
            this._initTeachScene1State();
            this._ensureTeachSpotlightNodes();
            this._bindTeachScreenTap();
            this.refreshTeachSpotlight();
            this._boardView?.resetTeachVisualPosition();
            this._applyTeachDirDemoStep(0);
            return;
        }

        if (!shouldShow && this._teachActActive) {
            this._stopTeachAct();
            return;
        }

        if (shouldShow) {
            this._bindTeachScreenTap();
            this.refreshTeachSpotlight();
        }
    }

    private _shouldShowTeachAct(): boolean {
        if (!this._session) {
            return false;
        }
        if (this._session.flowState !== OpticalGameFlowState.RUNNING) {
            return false;
        }
        if (this._session.getSnapshot().levelId !== getFirstOpticalLevelId()) {
            return false;
        }
        if (this._teachActUserDismissed) {
            return false;
        }
        return this._session.moveCount === 0;
    }

    /** 第二幕：点击「学会了」关闭教学，恢复本关正常局面 */
    private _dismissTeachActByUser(): void {
        this._teachActUserDismissed = true;
        this._stopTeachAct();
    }

    private _stopTeachAct(): void {
        this._teachActActive = false;
        this._teachDirCycleElapsed = 0;
        this._teachDirCycleIndex = 0;
        this._unbindTeachScreenTap();
        this._teachHoleTweenActive = false;
        this._teachHoleTweenFrom = null;
        this._teachHoles = [];
        this._teachPhase = TeachActPhase.Scene1;
        this._releaseAllTeachDirButtonPress();
        this._resetDirPadButtonScale();
        this._boardView?.stopTeachScene2PushLoop();
        this._boardView?.stopTeachDirectionDemo();
        this._boardView?.restoreSessionPresentationAfterTeach();
        const panelNode = this._resolveTeachPanelNode();
        if (panelNode?.isValid) {
            panelNode.active = false;
        }
    }

    private _updateTeachPanelTexts(text1: string, text2: string): void {
        const panel = this._resolveTeachPanelNode();
        if (!panel?.isValid) {
            return;
        }
        const label1 = panel.getChildByName('text1')?.getComponent(Label);
        const label2 = panel.getChildByName('text2')?.getComponent(Label);
        if (label1) {
            label1.string = text1;
        }
        if (label2) {
            label2.string = text2;
        }
    }

    /** 第二幕：左方向键按压反馈（与推箱演示同步） */
    private _applyTeachScene2LeftPress(): void {
        this._releaseAllTeachDirButtonPress();
        this._resetDirPadButtonScale();
        const btn = this.btnLeft;
        const view = btn?.node.getComponent(OpticalPuzzleDirButtonView);
        view?.flashPressed(TEACH_DIR_PRESS_SEC);
        this._pulseTeachDirButtonScale(btn);
    }

    private _applyTeachDirDemoStep(index: number): void {
        const dir = TEACH_DIR_CYCLE_ORDER[index];
        if (dir == null) {
            return;
        }
        this._releaseAllTeachDirButtonPress();
        this._resetDirPadButtonScale();
        const btn = this._buttonForDirection(dir);
        const view = btn?.node.getComponent(OpticalPuzzleDirButtonView);
        view?.flashPressed(TEACH_DIR_PRESS_SEC);
        this._pulseTeachDirButtonScale(btn);
        this._boardView?.playTeachDirectionDemo(dir, this._session?.getSnapshot());
    }

    private _resetDirPadButtonScale(): void {
        const dirPad = this.node.getChildByName('DirPad');
        if (!dirPad?.isValid) {
            return;
        }
        for (const child of dirPad.children) {
            child.setScale(1, 1, 1);
        }
    }

    private _releaseAllTeachDirButtonPress(): void {
        const dirPad = this.node.getChildByName('DirPad');
        if (!dirPad?.isValid) {
            return;
        }
        for (const child of dirPad.children) {
            child.getComponent(OpticalPuzzleDirButtonView)?.setTeachDemoPressed(false);
        }
    }

    /** 教学演示时同步 Button 缩放（与真实点击一致，持续 TEACH_DIR_PRESS_SEC） */
    private _pulseTeachDirButtonScale(btn: Button | null): void {
        const node = btn?.node;
        if (!node?.isValid) {
            return;
        }
        const ox = node.scale.x;
        const oy = node.scale.y;
        const oz = node.scale.z;
        const zoom = btn.zoomScale > 0 ? btn.zoomScale : 0.95;
        node.setScale(ox * zoom, oy * zoom, oz);
        this.unschedule(this._restoreTeachDirButtonScale);
        this._teachDirScaleNode = node;
        this._teachDirScaleRestore = { x: ox, y: oy, z: oz };
        this.scheduleOnce(this._restoreTeachDirButtonScale, TEACH_DIR_PRESS_SEC);
    }

    private _teachDirScaleNode: Node | null = null;
    private _teachDirScaleRestore: { x: number; y: number; z: number } | null = null;

    private _restoreTeachDirButtonScale = (): void => {
        const node = this._teachDirScaleNode;
        const restore = this._teachDirScaleRestore;
        if (node?.isValid && restore) {
            node.setScale(restore.x, restore.y, restore.z);
        }
        this._teachDirScaleNode = null;
        this._teachDirScaleRestore = null;
    };

    /** 教学蒙层：两枚固定矩形挖孔（Mask 反向遮罩） */
    refreshTeachSpotlight(): void {
        const panelNode = this._resolveTeachPanelNode();
        if (!panelNode?.isValid || !panelNode.activeInHierarchy) {
            return;
        }
        this._ensureTeachSpotlightNodes();
        const maskG = this._teachMaskGraphics;
        if (!maskG?.isValid) {
            return;
        }

        drawTeachMaskHoles(maskG, this._teachHoles);
        this._redrawTeachHoleBorders();
    }

    private _redrawTeachSpotlightGraphics(): void {
        const maskG = this._teachMaskGraphics;
        if (!maskG?.isValid || this._teachHoles.length === 0) {
            this._redrawTeachHoleBorders();
            return;
        }
        drawTeachMaskHoles(maskG, this._teachHoles);
        this._redrawTeachHoleBorders();
    }

    private _redrawTeachHoleBorders(): void {
        const borderG = this._teachHoleBorderGraphics;
        if (!borderG?.isValid || this._teachHoles.length === 0) {
            return;
        }
        drawTeachHoleBorders(borderG, this._sampleTeachHoleBreathT(), this._teachHoles);
    }

    private _sampleTeachHoleBreathT(): number {
        const phase = (this._teachHoleBreathPhase / TUTORIAL_BREATH_PERIOD_SEC) * Math.PI * 2;
        return 0.5 + 0.5 * Math.sin(phase);
    }

    private _bindUndoVideoBadgeHit(): void {
        this._btnUndoBadge = this._resolveUndoVideoBadgeButton();
        if (!this._btnUndoBadge?.node.isValid) {
            return;
        }
        this._btnUndoBadge.node.on(Button.EventType.CLICK, this._onUndoBadgeClick, this);
    }

    /** 撤回 +3 角标：与主键相同逻辑；CLICK 时必播 UI 点击音 */
    private _onUndoBadgeClick(): void {
        this._onUndo();
    }

    private _resolveUndoVideoBadgeButton(): Button | null {
        const view = this.btnUndo?.node.getComponent(OpticalPuzzleActionButtonView);
        return view?.getVideoBadgeHitButton() ?? null;
    }

    private _bindAnswerVideoBadgeHit(): void {
        this._btnAnswerBadge = this._resolveAnswerVideoBadgeButton();
        if (!this._btnAnswerBadge?.node.isValid) {
            return;
        }
        this._btnAnswerBadge.node.on(Button.EventType.CLICK, this._onAnswerBadgeClick, this);
    }

    /** 角标热区：与主键相同逻辑；CLICK 时必播 UI 点击音 */
    private _onAnswerBadgeClick(): void {
        this._onAnswer();
    }

    private _resolveAnswerVideoBadgeButton(): Button | null {
        const view = this.btnAnswer?.node.getComponent(OpticalPuzzleActionButtonView);
        return view?.getVideoBadgeHitButton() ?? null;
    }

    teardown(): void {
        input.off(Input.EventType.KEY_DOWN, this._onKeyDown, this);
        this._unbindBtnClick(this.btnUp, this._onUp);
        this._unbindBtnClick(this.btnDown, this._onDown);
        this._unbindBtnClick(this.btnLeft, this._onLeft);
        this._unbindBtnClick(this.btnRight, this._onRight);
        this._unbindBtnClick(this.btnUndo, this._onUndo);
        this._unbindBtnClick(this.btnReset, this._onReset);
        this._unbindBtnClick(this.btnAnswer, this._onAnswer);
        this._unbindBtnClick(this.btnShare, this._onShare);
        this._unbindUndoBadgeClick();
        this._unbindAnswerBadgeClick();
        this._btnUndoBadge = null;
        this._btnAnswerBadge = null;
        this._stopTeachAct();
        this._teachActUserDismissed = false;
        this._session = null;
        this._boardView = null;
        this._undoRewardAdPending = false;
        this._answerRewardAdPending = false;
    }

    private _unbindBtnClick(btn: Button | null, handler: () => void): void {
        const node = btn?.node;
        if (!node?.isValid) {
            return;
        }
        node.off(Button.EventType.CLICK, handler, this);
    }

    private _unbindUndoBadgeClick(): void {
        const node = this._btnUndoBadge?.node;
        if (!node?.isValid) {
            return;
        }
        node.off(Button.EventType.CLICK, this._onUndoBadgeClick, this);
    }

    private _unbindAnswerBadgeClick(): void {
        const node = this._btnAnswerBadge?.node;
        if (!node?.isValid) {
            return;
        }
        node.off(Button.EventType.CLICK, this._onAnswerBadgeClick, this);
    }

    /** 移动动画中或已进入结算等非 RUNNING 状态时，与遮罩挡按钮一致禁止局内输入 */
    private _isPlayInputLocked(): boolean {
        if (this._boardView?.isMoveAnimating()) {
            return true;
        }
        return !this._session || this._session.flowState !== OpticalGameFlowState.RUNNING;
    }

    private _applyDirection(dir: Direction, playClickOnButton = false): void {
        if (this._isPlayInputLocked()) {
            return;
        }
        const result = this._session.applyDirection(dir);
        if (!playClickOnButton || result === null) {
            return;
        }
        // 玩法音在 Session 内播；按钮仍叠加通用点击音
        this._playUiClick();
    }

    protected onDestroy(): void {
        this.teardown();
    }

    private _playUiClick(): void {
        PLAY_AUDIO.emit(EVENT_ENUM.PLAY_AUDIO, AUDIO_EFFECT_ENUM.CLICK_BUTTON);
    }

    private _buttonForDirection(dir: Direction): Button | null {
        switch (dir) {
            case Direction.Up:
                return this.btnUp;
            case Direction.Down:
                return this.btnDown;
            case Direction.Left:
                return this.btnLeft;
            case Direction.Right:
                return this.btnRight;
            default:
                return null;
        }
    }

    /** 键盘输入时同步按钮缩放 + 发光（与触摸按压一致） */
    private _pulseButtonFeedback(btn: Button | null, flashView?: { flashPressed(): void } | null): void {
        flashView?.flashPressed();
        const node = btn?.node;
        if (!node?.isValid) {
            return;
        }
        const ox = node.scale.x;
        const oy = node.scale.y;
        const oz = node.scale.z;
        const zoom = btn.zoomScale > 0 ? btn.zoomScale : 0.95;
        node.setScale(ox * zoom, oy * zoom, oz);
        this.scheduleOnce(() => {
            if (node.isValid) {
                node.setScale(ox, oy, oz);
            }
        }, 0.1);
    }

    private _pulseDirButton(dir: Direction): void {
        const btn = this._buttonForDirection(dir);
        this._pulseButtonFeedback(btn, btn?.node.getComponent(OpticalPuzzleDirButtonView) ?? null);
    }

    private _pulseActionButton(btn: Button | null): void {
        this._pulseButtonFeedback(btn, btn?.node.getComponent(OpticalPuzzleActionButtonView) ?? null);
    }

    private _onDirectionClick(dir: Direction): void {
        this._applyDirection(dir, true);
    }

    private _onUp(): void {
        this._onDirectionClick(Direction.Up);
    }

    private _onDown(): void {
        this._onDirectionClick(Direction.Down);
    }

    private _onLeft(): void {
        this._onDirectionClick(Direction.Left);
    }

    private _onRight(): void {
        this._onDirectionClick(Direction.Right);
    }

    private _onUndo(): void {
        if (this._isPlayInputLocked()) {
            return;
        }
        this._playUiClick();
        this._handleUndoRequest();
    }

    /**
     * 撤回：无可撤回步时不变化、不扣次数；填充未耗尽时正常撤回；
     * 耗尽后拉起插屏广告，展示成功则恢复满填（不执行撤回）。
     */
    private _handleUndoRequest(): void {
        const session = this._session;
        if (!session) {
            return;
        }
        if (DEBUG_SKIP_ALL_ADS && session.isUndoIconFillExhausted()) {
            session.restoreUndoFillFromRewardedAd();
        }
        if (
            !DEBUG_SKIP_ALL_ADS &&
            session.isUndoIconFillExhausted() &&
            session.canUndo()
        ) {
            this._requestUndoRewardAd(session);
            return;
        }
        if (!session.canUndo()) {
            session.undoBatch();
            return;
        }
        session.registerUndoButtonPress();
        session.undoBatch();
        this.refreshActionButtons();
    }

    private _requestUndoRewardAd(session: OpticalPuzzleSession): void {
        if (this._undoRewardAdPending) {
            return;
        }
        this._undoRewardAdPending = true;
        showWeChatInterstitialAd()
            .then((shown) => {
                if (!this.isValid) {
                    return;
                }
                if (shown) {
                    session.restoreUndoFillFromRewardedAd();
                    this.refreshActionButtons();
                }
            })
            .then(
                () => {
                    if (this.isValid) {
                        this._undoRewardAdPending = false;
                    }
                },
                () => {
                    if (this.isValid) {
                        this._undoRewardAdPending = false;
                    }
                },
            );
    }

    private _onReset(): void {
        if (this._isPlayInputLocked()) {
            return;
        }
        this._playUiClick();
        this._session?.resetLevel();
    }

    /** 微信好友分享（局内带 levelId query + 动态标题） */
    private _onShare(): void {
        this._playUiClick();
        const levelId = this._session?.getSnapshot().levelId;
        invokeWeChatFriendShare({
            levelId: levelId && levelId > 0 ? levelId : undefined,
            onSuccess: () => {
                /* 可按需加分享奖励 */
            },
            onFail: () => {
                /* 浏览器预览等环境无 wx.shareAppMessage */
            },
        });
    }

    private _onAnswer(): void {
        if (this._isPlayInputLocked()) {
            return;
        }
        this._playUiClick();
        const session = this._session;
        if (!session) {
            return;
        }
        if (session.isAnswerUnlocked()) {
            openAnswerPanel(this._resolveAnswerPanelNode());
            return;
        }
        if (DEBUG_SKIP_ALL_ADS) {
            session.unlockAnswerForCurrentLevel();
            this.refreshActionButtons();
            openAnswerPanel(this._resolveAnswerPanelNode());
            return;
        }
        this._requestAnswerRewardAd();
    }

    private _requestAnswerRewardAd(): void {
        if (this._answerRewardAdPending) {
            return;
        }
        this._answerRewardAdPending = true;
        showWeChatRewardedVideo()
            .then((watched) => {
                if (!this.isValid) {
                    return;
                }
                if (!watched || !this._session) {
                    return;
                }
                this._session.unlockAnswerForCurrentLevel();
                this.refreshActionButtons();
                openAnswerPanel(this._resolveAnswerPanelNode());
            })
            .then(
                () => {
                    if (this.isValid) {
                        this._answerRewardAdPending = false;
                    }
                },
                () => {
                    if (this.isValid) {
                        this._answerRewardAdPending = false;
                    }
                },
            );
    }

    private _resolveAnswerPanelNode(): Node | null {
        let cursor: Node | null = this.node;
        while (cursor) {
            if (cursor.name === 'GameRoot') {
                return resolveAnswerPanelNode(cursor);
            }
            cursor = cursor.parent;
        }
        return null;
    }

    /** 同步操作键图标（撤回填充阶段、参考解看视频角标、方向键教程提示等） */
    refreshActionButtons(): void {
        const stage = DEBUG_SKIP_ALL_ADS ? 0 : (this._session?.undoFillStage ?? 0);
        const answerUnlocked =
            DEBUG_SKIP_ALL_ADS || (this._session?.isAnswerUnlocked() ?? false);
        const actionPad = this.node.getChildByName('ActionPad');
        if (actionPad?.isValid) {
            for (const child of actionPad.children) {
                const view = child.getComponent(OpticalPuzzleActionButtonView);
                if (!view) {
                    continue;
                }
                view.setUndoFillStage(stage);
                view.setAnswerVideoBadgeVisible(!answerUnlocked);
            }
        }
        this._refreshDirTutorialHints();
        this._rebindUndoVideoBadgeHit();
        this._rebindAnswerVideoBadgeHit();
        this._refreshDirTutorialHints();
        this.refreshTeachAct();
    }

    /** 关闭方向键黄呼吸教程提示（改由 teachPanel 蒙层挖孔引导） */
    private _refreshDirTutorialHints(): void {
        const dirPad = this.node.getChildByName('DirPad');
        if (!dirPad?.isValid) {
            return;
        }
        for (const child of dirPad.children) {
            const view = child.getComponent(OpticalPuzzleDirButtonView);
            if (!view) {
                continue;
            }
            view.setTutorialHint(false);
        }
    }

    /** 角标热区在 refresh 后可能才显示，需补绑 CLICK */
    private _rebindUndoVideoBadgeHit(): void {
        const badge = this._resolveUndoVideoBadgeButton();
        if (badge === this._btnUndoBadge) {
            return;
        }
        this._unbindUndoBadgeClick();
        this._btnUndoBadge = badge;
        if (this._btnUndoBadge?.node.isValid) {
            this._btnUndoBadge.node.on(Button.EventType.CLICK, this._onUndoBadgeClick, this);
        }
    }

    /** 角标热区在 refresh 后可能才创建，需补绑 CLICK */
    private _rebindAnswerVideoBadgeHit(): void {
        const badge = this._resolveAnswerVideoBadgeButton();
        if (badge === this._btnAnswerBadge) {
            return;
        }
        this._unbindAnswerBadgeClick();
        this._btnAnswerBadge = badge;
        if (this._btnAnswerBadge?.node.isValid) {
            this._btnAnswerBadge.node.on(Button.EventType.CLICK, this._onAnswerBadgeClick, this);
        }
    }

    private _directionFromKey(keyCode: number): Direction | null {
        switch (keyCode) {
            case KeyCode.ARROW_UP:
            case KeyCode.KEY_W:
            case 38:
                return Direction.Up;
            case KeyCode.ARROW_DOWN:
            case KeyCode.KEY_S:
            case 40:
                return Direction.Down;
            case KeyCode.ARROW_LEFT:
            case KeyCode.KEY_A:
            case 37:
                return Direction.Left;
            case KeyCode.ARROW_RIGHT:
            case KeyCode.KEY_D:
            case 39:
                return Direction.Right;
            default:
                return null;
        }
    }

    /** 浏览器预览时避免方向键触发页面滚动 */
    private _suppressBrowserKeyDefault(e: EventKeyboard, keyCode: number): void {
        if (!sys.isBrowser) {
            return;
        }
        const isArrow =
            keyCode === KeyCode.ARROW_UP ||
            keyCode === KeyCode.ARROW_DOWN ||
            keyCode === KeyCode.ARROW_LEFT ||
            keyCode === KeyCode.ARROW_RIGHT ||
            keyCode === 37 ||
            keyCode === 38 ||
            keyCode === 39 ||
            keyCode === 40;
        if (!isArrow) {
            return;
        }
        const raw = (e as unknown as { rawEvent?: KeyboardEvent }).rawEvent;
        raw?.preventDefault?.();
    }

    private _onKeyDown(e: EventKeyboard): void {
        if (this._isPlayInputLocked()) {
            return;
        }
        const keyCode = e.keyCode as number;
        const dir = this._directionFromKey(keyCode);
        if (dir !== null) {
            this._suppressBrowserKeyDefault(e, keyCode);
            this._pulseDirButton(dir);
            this._applyDirection(dir, true);
            return;
        }
        switch (keyCode) {
            case KeyCode.KEY_Z:
                this._pulseActionButton(this.btnUndo);
                this._playUiClick();
                this._handleUndoRequest();
                break;
            case KeyCode.KEY_R:
                this._pulseActionButton(this.btnReset);
                this._playUiClick();
                this._session.resetLevel();
                break;
            default:
                break;
        }
    }

    private _resolveGameRoot(): Node | null {
        let node: Node | null = this.node;
        while (node?.parent) {
            if (node.name === 'GameRoot') {
                return node;
            }
            node = node.parent;
        }
        return null;
    }

    private _resolveTeachPanelNode(): Node | null {
        const overlay = this._resolveGameRoot()?.getChildByName('layerOverlay') ?? null;
        if (!overlay?.isValid) {
            return null;
        }
        return overlay.getChildByName('teachPanel') ?? overlay.getChildByName('TeachPanel') ?? null;
    }

    private _ensureTeachSpotlightNodes(): void {
        const panelNode = this._resolveTeachPanelNode();
        if (!panelNode?.isValid) {
            return;
        }
        if (!this._teachBgNode?.isValid) {
            this._teachBgNode = panelNode.getChildByName(TEACH_BG_CHILD_NAME);
        }
        if (!this._teachBgNode?.isValid) {
            console.warn('[OpticalPuzzleInputHud] teachPanel 未找到子节点 bg');
            return;
        }

        const sprite = this._teachBgNode.getComponent(Sprite);
        const dimColor = sprite ? sprite.color.clone() : TEACH_BG_DIM_FALLBACK.clone();
        if (sprite) {
            sprite.enabled = false;
        }

        const bgUt = this._teachBgNode.getComponent(UITransform);
        if (!bgUt) {
            return;
        }

        const legacyGfx = this._teachBgNode.getChildByName('gfx');
        if (legacyGfx?.isValid) {
            legacyGfx.destroy();
        }

        let maskNode = this._teachBgNode.getChildByName(TEACH_DIM_MASK_NAME);
        if (!maskNode?.isValid) {
            maskNode = new Node(TEACH_DIM_MASK_NAME);
            this._teachBgNode.addChild(maskNode);
        }
        this._syncTeachChildLayout(maskNode, bgUt);

        let mask = maskNode.getComponent(Mask);
        if (!mask) {
            mask = maskNode.addComponent(Mask);
        }
        mask.type = Mask.Type.GRAPHICS_STENCIL;
        mask.inverted = true;
        this._teachMaskGraphics = maskNode.getComponent(Graphics);

        let dimNode = maskNode.getChildByName(TEACH_DIM_CHILD_NAME);
        if (!dimNode?.isValid) {
            dimNode = new Node(TEACH_DIM_CHILD_NAME);
            maskNode.addChild(dimNode);
        }
        this._syncTeachChildLayout(dimNode, bgUt);

        const dimG = dimNode.getComponent(Graphics) ?? dimNode.addComponent(Graphics);
        dimG.clear();
        dimG.fillColor = dimColor;
        const hw = bgUt.width * 0.5;
        const hh = bgUt.height * 0.5;
        dimG.rect(-hw, -hh, bgUt.width, bgUt.height);
        dimG.fill();

        let borderNode = this._teachBgNode.getChildByName(TEACH_HOLE_BORDER_CHILD_NAME);
        if (!borderNode?.isValid) {
            borderNode = new Node(TEACH_HOLE_BORDER_CHILD_NAME);
            this._teachBgNode.addChild(borderNode);
        }
        this._syncTeachChildLayout(borderNode, bgUt);
        this._teachHoleBorderGraphics =
            borderNode.getComponent(Graphics) ?? borderNode.addComponent(Graphics);
    }

    private _syncTeachChildLayout(node: Node, bgUt: UITransform): void {
        const ut = node.getComponent(UITransform) ?? node.addComponent(UITransform);
        ut.setAnchorPoint(bgUt.anchorX, bgUt.anchorY);
        ut.setContentSize(bgUt.width, bgUt.height);
        node.setPosition(0, 0, 0);
    }
}

function teachHoleCorner(hole: TeachSpotlightHole): number {
    return Math.min(TEACH_HOLE_CORNER_RADIUS, hole.width * 0.5, hole.height * 0.5);
}

function easeOutCubic(t: number): number {
    const x = Math.max(0, Math.min(1, t));
    return 1 - (1 - x) ** 3;
}

function lerpTeachHole(
    from: TeachSpotlightHole,
    to: TeachSpotlightHole,
    t: number,
): TeachSpotlightHole {
    const k = Math.max(0, Math.min(1, t));
    return {
        cx: from.cx + (to.cx - from.cx) * k,
        cy: from.cy + (to.cy - from.cy) * k,
        width: from.width + (to.width - from.width) * k,
        height: from.height + (to.height - from.height) * k,
    };
}

function drawTeachMaskHoles(maskG: Graphics, holes: readonly TeachSpotlightHole[]): void {
    maskG.clear();
    maskG.fillColor = new Color(255, 255, 255, 255);
    for (const hole of holes) {
        const left = hole.cx - hole.width * 0.5;
        const bottom = hole.cy - hole.height * 0.5;
        maskG.roundRect(left, bottom, hole.width, hole.height, teachHoleCorner(hole));
    }
    maskG.fill();
}

/** 两孔黄描边 + 黄呼吸光晕（与教程方向键 drawHudButtonChromeTutorialHint 同款） */
function drawTeachHoleBorders(
    borderG: Graphics,
    breathT: number,
    holes: readonly TeachSpotlightHole[],
): void {
    borderG.clear();
    const glowLayers = buildTutorialBreathGlowLayers(breathT);
    // 与场景四向键 100×100 的 drawHudButtonChromeTutorialHint 缩放基准一致
    const chromeSize = HUD_DIR_BUTTON_SCENE_SIZE;
    const borderW = Math.max(1, scaleHudDesign(chromeSize, HUD_KEY_BORDER_DESIGN));

    borderG.lineJoin = Graphics.LineJoin.ROUND;
    for (const hole of holes) {
        const left = hole.cx - hole.width * 0.5;
        const bottom = hole.cy - hole.height * 0.5;
        const corner = teachHoleCorner(hole);
        strokeGlowLayers(
            borderG,
            chromeSize,
            glowLayers,
            () => {
                borderG.roundRect(left, bottom, hole.width, hole.height, corner);
            },
            false,
            TUTORIAL_HINT_GLOW_RGB,
        );
    }

    borderG.strokeColor = TUTORIAL_HINT_BORDER;
    borderG.lineWidth = borderW;
    for (const hole of holes) {
        const left = hole.cx - hole.width * 0.5;
        const bottom = hole.cy - hole.height * 0.5;
        borderG.roundRect(left, bottom, hole.width, hole.height, teachHoleCorner(hole));
    }
    borderG.stroke();
}
