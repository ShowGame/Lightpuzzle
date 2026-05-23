import { _decorator, Button, Component, director, Node } from 'cc';
import { AUDIO_EFFECT_ENUM, EVENT_ENUM, SCENE_ENUM } from '../Utils/Enum';
import { PLAY_AUDIO } from '../Utils/Event';

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

    protected onLoad(): void {
        director.preloadScene(SCENE_ENUM.MENU);
        this.closeLevelSelect();
        this.bindBackMenuButton();
        this.bindLevelSelectButton();
    }

    protected onDestroy(): void {
        this.unbindBackMenuButton();
        this.unbindLevelSelectButton();
    }

    /** 返回 Menu 场景 */
    backToMenu(): void {
        director.loadScene(SCENE_ENUM.MENU);
    }

    /** 显示局内选关面板（跳关列表后续在 Panel 脚本中处理） */
    openLevelSelect(): void {
        if (!this.levelSelectPanel?.isValid) {
            return;
        }
        this.levelSelectPanel.active = true;
    }

    /** 隐藏局内选关面板 */
    closeLevelSelect(): void {
        if (!this.levelSelectPanel?.isValid) {
            return;
        }
        this.levelSelectPanel.active = false;
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
        if (button) {
            button.node.off(Button.EventType.CLICK, handler, this);
            return;
        }
        node.off(Node.EventType.TOUCH_END, handler, this);
    }

    private onBackMenuClick(): void {
        PLAY_AUDIO.emit(EVENT_ENUM.PLAY_AUDIO, AUDIO_EFFECT_ENUM.CLICK_BUTTON);
        this.backToMenu();
    }

    private onLevelSelectClick(): void {
        PLAY_AUDIO.emit(EVENT_ENUM.PLAY_AUDIO, AUDIO_EFFECT_ENUM.CLICK_BUTTON);
        this.openLevelSelect();
    }
}
