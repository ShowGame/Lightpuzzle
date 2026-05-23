import { _decorator, Button, Component, director, Node } from 'cc';
import { DataManager } from './DataManager';
import { AUDIO_EFFECT_ENUM, EVENT_ENUM, SCENE_ENUM } from '../Utils/Enum';
import { PLAY_AUDIO } from '../Utils/Event';

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

    protected onLoad(): void {
        DataManager.instance.restore();
        director.preloadScene(SCENE_ENUM.GAME);
        this.closeLevelSelect();
        this.bindStartButton();
        this.bindLevelSelectButton();
    }

    protected onDestroy(): void {
        this.unbindStartButton();
        this.unbindLevelSelectButton();
    }

    /** 进入局内场景（当前进度关卡由 DataManager.opticalCurrentLevelId 决定） */
    startGame(): void {
        director.loadScene(SCENE_ENUM.GAME);
    }

    /** 显示选关面板 */
    openLevelSelect(): void {
        if (!this.levelSelectPanel?.isValid) {
            return;
        }
        this.levelSelectPanel.active = true;
    }

    /** 隐藏选关面板（MenuOverlayWindow 关闭时也可调） */
    closeLevelSelect(): void {
        if (!this.levelSelectPanel?.isValid) {
            return;
        }
        this.levelSelectPanel.active = false;
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
}
