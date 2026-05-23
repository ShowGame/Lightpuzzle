import { _decorator, Component, Node } from 'cc';
import { RoundBox } from '../RoundBox';
import { EVENT_ENUM, AUDIO_EFFECT_ENUM } from './Utils/Enum';
import { PLAY_AUDIO } from './Utils/Event';

const { ccclass, property } = _decorator;

/**
 * 菜单简单弹层：挂在窗口根节点上，关闭键（及可选子节点 `bg` 衬底）点击后隐藏本节点
 */
@ccclass('MenuOverlayWindow')
export class MenuOverlayWindow extends Component {
    /** 关闭按钮 */
    @property(Node)
    closeButtonNode: Node = null;

    private _backdropBgNode: Node | null = null;

    protected onLoad(): void {
        this._backdropBgNode = this.node.getChildByName('bg') ?? null;
        if (this._backdropBgNode) {
            this._backdropBgNode.on(Node.EventType.TOUCH_END, this.onCloseClick, this);
        }
        if (this.closeButtonNode) {
            this.closeButtonNode.on(Node.EventType.TOUCH_END, this.onCloseClick, this);
        }
    }

    protected onEnable(): void {
        // 根节点从场景初始 inactive 首次打开时，子节点 RoundBox 可能首帧未拿到 texture/chunk
        this.scheduleOnce(this.refreshChildRoundBoxes, 0);
    }

    private refreshChildRoundBoxes(): void {
        if (!this.node?.isValid || !this.node.activeInHierarchy) {
            return;
        }
        const list = this.node.getComponentsInChildren(RoundBox);
        for (let i = 0; i < list.length; i++) {
            list[i].forceRefreshRender();
        }
    }

    protected onDestroy(): void {
        if (this._backdropBgNode?.isValid) {
            this._backdropBgNode.off(Node.EventType.TOUCH_END, this.onCloseClick, this);
        }
        this._backdropBgNode = null;
        if (this.closeButtonNode?.isValid) {
            this.closeButtonNode.off(Node.EventType.TOUCH_END, this.onCloseClick, this);
        }
    }

    private onCloseClick(): void {
        PLAY_AUDIO.emit(EVENT_ENUM.PLAY_AUDIO, AUDIO_EFFECT_ENUM.CLICK_BUTTON);
        this.node.active = false;
    }
}
