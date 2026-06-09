import { _decorator, Component, EventTouch, NodeEventType } from 'cc';

const { ccclass } = _decorator;

const PASS_THROUGH_TOUCH_TYPES = [
    NodeEventType.TOUCH_START,
    NodeEventType.TOUCH_MOVE,
    NodeEventType.TOUCH_END,
    NodeEventType.TOUCH_CANCEL,
] as const;

/** 渐隐蒙层不参与触摸吞噬，ScrollView 仍可拖动 */
@ccclass('OpticalPuzzleLevelSelectScrollFadePassThrough')
export class OpticalPuzzleLevelSelectScrollFadePassThrough extends Component {
    protected onLoad(): void {
        for (const type of PASS_THROUGH_TOUCH_TYPES) {
            this.node.on(type, this._passTouch, this, true);
        }
    }

    protected onDestroy(): void {
        for (const type of PASS_THROUGH_TOUCH_TYPES) {
            this.node.off(type, this._passTouch, this, true);
        }
    }

    private _passTouch(event: EventTouch): void {
        event.preventSwallow = true;
    }
}
