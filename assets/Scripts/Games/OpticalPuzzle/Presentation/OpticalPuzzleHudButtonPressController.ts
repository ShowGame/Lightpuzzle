import { EventTouch, Node, NodeEventType, UITransform } from 'cc';

/** 触摸按下态：移出按钮区域时与 Button 缩放同步取消发光 */
export class HudButtonPressController {
    private _pressed = false;
    private _touchActive = false;

    constructor(
        private readonly _node: Node,
        private readonly _onChange: (pressed: boolean) => void,
        /** 与 Button 同节点时须 true，否则 Button 抢先消费触摸导致不发光 */
        private readonly _useCapture = false,
    ) {}

    bind(): void {
        if (!this._node?.isValid) {
            return;
        }
        this._unbindListeners();
        this._node.on(NodeEventType.TOUCH_START, this._onPressStart, this, this._useCapture);
        this._node.on(NodeEventType.TOUCH_MOVE, this._onTouchMove, this, this._useCapture);
        this._node.on(NodeEventType.TOUCH_END, this._onPressEnd, this, this._useCapture);
        this._node.on(NodeEventType.TOUCH_CANCEL, this._onPressEnd, this, this._useCapture);
    }

    /** 是否处于触摸按压中（键盘脉冲发光时勿覆盖） */
    get touchActive(): boolean {
        return this._touchActive;
    }

    unbind(): void {
        this._unbindListeners();
        this._touchActive = false;
        if (this._pressed) {
            this._pressed = false;
        }
    }

    private _unbindListeners(): void {
        if (!this._node?.isValid) {
            return;
        }
        this._node.off(NodeEventType.TOUCH_START, this._onPressStart, this, this._useCapture);
        this._node.off(NodeEventType.TOUCH_MOVE, this._onTouchMove, this, this._useCapture);
        this._node.off(NodeEventType.TOUCH_END, this._onPressEnd, this, this._useCapture);
        this._node.off(NodeEventType.TOUCH_CANCEL, this._onPressEnd, this, this._useCapture);
    }

    private _onPressStart(): void {
        if (!this._node?.isValid) {
            return;
        }
        this._touchActive = true;
        this._setPressed(true);
    }

    private _onTouchMove(event: EventTouch): void {
        if (!this._touchActive || !this._node?.isValid) {
            return;
        }
        this._setPressed(this._isTouchInside(event));
    }

    private _onPressEnd(): void {
        this._touchActive = false;
        if (!this._node?.isValid) {
            this._pressed = false;
            return;
        }
        this._setPressed(false);
    }

    private _isTouchInside(event: EventTouch): boolean {
        const ut = this._node.getComponent(UITransform);
        if (!ut) {
            return false;
        }
        return ut.getBoundingBoxToWorld().contains(event.getUILocation());
    }

    private _setPressed(pressed: boolean): void {
        if (this._pressed === pressed) {
            return;
        }
        this._pressed = pressed;
        this._onChange(pressed);
    }
}
