import {
    Button,
    Component,
    EventKeyboard,
    Input,
    KeyCode,
    Node,
    _decorator,
    input,
    sys,
} from 'cc';
import { OpticalPuzzleSession } from '../Application/OpticalPuzzleSession';
import { OpticalGameFlowState } from '../Application/OpticalPuzzleStateMachine';
import { Direction } from '../Core/OpticalPuzzleTypes';
import { AUDIO_EFFECT_ENUM, EVENT_ENUM } from '../../../Utils/Enum';
import { PLAY_AUDIO } from '../../../Utils/Event';
import { showWeChatRewardedVideo } from '../../../Utils/WeChatRewardedVideoAd';
import { ensureActionButtonViews, OpticalPuzzleActionButtonView } from './OpticalPuzzleActionButtonView';
import type { OpticalPuzzleBoardView } from './OpticalPuzzleBoardView';
import { ensureDirButtonViews, OpticalPuzzleDirButtonView } from './OpticalPuzzleDirButtonView';

const { ccclass, property } = _decorator;

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

    private _session: OpticalPuzzleSession | null = null;
    private _boardView: OpticalPuzzleBoardView | null = null;
    /** 激励广告拉起中，避免重复点击 */
    private _undoRewardAdPending = false;

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
        this.btnUp?.node.on(Button.EventType.CLICK, this._onUp, this);
        this.btnDown?.node.on(Button.EventType.CLICK, this._onDown, this);
        this.btnLeft?.node.on(Button.EventType.CLICK, this._onLeft, this);
        this.btnRight?.node.on(Button.EventType.CLICK, this._onRight, this);
        this.btnUndo?.node.on(Button.EventType.CLICK, this._onUndo, this);
        this.btnReset?.node.on(Button.EventType.CLICK, this._onReset, this);
        input.on(Input.EventType.KEY_DOWN, this._onKeyDown, this);
    }

    teardown(): void {
        input.off(Input.EventType.KEY_DOWN, this._onKeyDown, this);
        this._unbindBtnClick(this.btnUp, this._onUp);
        this._unbindBtnClick(this.btnDown, this._onDown);
        this._unbindBtnClick(this.btnLeft, this._onLeft);
        this._unbindBtnClick(this.btnRight, this._onRight);
        this._unbindBtnClick(this.btnUndo, this._onUndo);
        this._unbindBtnClick(this.btnReset, this._onReset);
        this._session = null;
        this._boardView = null;
        this._undoRewardAdPending = false;
    }

    private _unbindBtnClick(btn: Button | null, handler: () => void): void {
        const node = btn?.node;
        if (!node?.isValid) {
            return;
        }
        node.off(Button.EventType.CLICK, handler, this);
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
        // 与推成功一致：先玩法反馈音（Session），再 CLICK_BUTTON
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
     * 耗尽后拉起激励广告，完整观看则恢复满填（不执行撤回）。
     */
    private _handleUndoRequest(): void {
        const session = this._session;
        if (!session) {
            return;
        }
        if (session.isUndoIconFillExhausted() && session.canUndo()) {
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
        showWeChatRewardedVideo()
            .then((watched) => {
                if (!this.isValid) {
                    return;
                }
                if (watched) {
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

    /** 同步操作键图标（如撤回键横向填充阶段） */
    refreshActionButtons(): void {
        const stage = this._session?.undoFillStage ?? 0;
        const actionPad = this.node.getChildByName('ActionPad');
        if (!actionPad?.isValid) {
            return;
        }
        for (const child of actionPad.children) {
            const view = child.getComponent(OpticalPuzzleActionButtonView);
            if (!view) {
                continue;
            }
            view.setUndoFillStage(stage);
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
}
