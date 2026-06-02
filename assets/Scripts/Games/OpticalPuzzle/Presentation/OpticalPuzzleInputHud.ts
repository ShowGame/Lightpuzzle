import {
    Button,
    Component,
    EventKeyboard,
    Input,
    KeyCode,
    _decorator,
    input,
    sys,
} from 'cc';
import { OpticalPuzzleSession } from '../Application/OpticalPuzzleSession';
import { Direction } from '../Core/OpticalPuzzleTypes';
import { AUDIO_EFFECT_ENUM, EVENT_ENUM } from '../../../Utils/Enum';
import { PLAY_AUDIO } from '../../../Utils/Event';

const { ccclass, property } = _decorator;

/**
 * 四向、撤回、重置。键盘：方向键 / WASD 移动，Z 撤回，R 重置（与 UI 按钮可同时使用）。
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

    setup(session: OpticalPuzzleSession): void {
        this.teardown();
        this._session = session;
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
        this.btnUp?.node.off(Button.EventType.CLICK, this._onUp, this);
        this.btnDown?.node.off(Button.EventType.CLICK, this._onDown, this);
        this.btnLeft?.node.off(Button.EventType.CLICK, this._onLeft, this);
        this.btnRight?.node.off(Button.EventType.CLICK, this._onRight, this);
        this.btnUndo?.node.off(Button.EventType.CLICK, this._onUndo, this);
        this.btnReset?.node.off(Button.EventType.CLICK, this._onReset, this);
        this._session = null;
    }

    protected onDestroy(): void {
        this.teardown();
    }

    private _playUiClick(): void {
        PLAY_AUDIO.emit(EVENT_ENUM.PLAY_AUDIO, AUDIO_EFFECT_ENUM.CLICK_BUTTON);
    }

    private _onUp(): void {
        this._session?.applyDirection(Direction.Up);
    }

    private _onDown(): void {
        this._session?.applyDirection(Direction.Down);
    }

    private _onLeft(): void {
        this._session?.applyDirection(Direction.Left);
    }

    private _onRight(): void {
        this._session?.applyDirection(Direction.Right);
    }

    private _onUndo(): void {
        this._playUiClick();
        this._session?.undoBatch();
    }

    private _onReset(): void {
        this._playUiClick();
        this._session?.resetLevel();
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
        if (!this._session) {
            return;
        }
        const keyCode = e.keyCode as number;
        const dir = this._directionFromKey(keyCode);
        if (dir !== null) {
            this._suppressBrowserKeyDefault(e, keyCode);
            this._session.applyDirection(dir);
            return;
        }
        switch (keyCode) {
            case KeyCode.KEY_Z:
                this._session.undoBatch();
                break;
            case KeyCode.KEY_R:
                this._session.resetLevel();
                break;
            default:
                break;
        }
    }
}
