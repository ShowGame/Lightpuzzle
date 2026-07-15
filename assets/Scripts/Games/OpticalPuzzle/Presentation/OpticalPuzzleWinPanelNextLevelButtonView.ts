import {
    _decorator,
    Button,
    Component,
    director,
    Graphics,
    Label,
    Node,
    UITransform,
} from 'cc';
import { AUDIO_EFFECT_ENUM, EVENT_ENUM, SCENE_ENUM } from '../../../Utils/Enum';
import { PLAY_AUDIO } from '../../../Utils/Event';
import { getNextOpticalLevelId } from '../Config/OpticalPuzzleLevels';
import { HudButtonPressController } from './OpticalPuzzleHudButtonCommon';
import { drawWinPanelNextLevelButtonGlyph } from './OpticalPuzzleWinPanelNextLevelButtonGlyph';
import {
    resolveWinPanelNode,
    resolveWinPanelWindsNode,
} from './OpticalPuzzleWinPanelWindsView';

const { ccclass } = _decorator;

/** 与四向键 Button.zoomScale 一致 */
const NEXT_LEVEL_BUTTON_ZOOM_SCALE = 0.95;

/** nextlevel/label 文案 */
const WIN_NEXT_LEVEL_TEXT = '下 一 关';
const WIN_RETURN_TEXT = '返   回';

/** 局内入口能力（避免与 OpticalPuzzleRoot 循环引用） */
interface IOpticalPuzzleRootApi {
    getCurrentLevelId(): number;
    reloadCurrentLevel(): void;
}

/** winPanel/winds/nextlevel：下一关 / 返回主菜单 */
@ccclass('OpticalPuzzleWinPanelNextLevelButtonView')
export class OpticalPuzzleWinPanelNextLevelButtonView extends Component {
    private _graphics: Graphics | null = null;
    private _label: Label | null = null;
    private _pressed = false;
    private _pressCtrl: HudButtonPressController | null = null;

    protected onLoad(): void {
        this._hidePlaceholderSplash();
        this._label = this.node.getChildByName('label')?.getComponent(Label) ?? null;
        this._ensureButton();
        this._pressCtrl = new HudButtonPressController(this.node, (pressed) => {
            this._pressed = pressed;
            this._redraw();
        });
        this._redraw();
    }

    protected onEnable(): void {
        this._pressCtrl?.bind();
        this.node.on(Button.EventType.CLICK, this._onClick, this);
        this._refreshLabelText();
        this._redraw();
    }

    protected onDisable(): void {
        this._pressCtrl?.unbind();
        this.node.off(Button.EventType.CLICK, this._onClick, this);
        this._pressed = false;
    }

    protected onDestroy(): void {
        this._pressCtrl?.unbind();
        this.node.off(Button.EventType.CLICK, this._onClick, this);
    }

    /** 按关卡 id 设置 label 文案（由通关面板弹出方传入，避免 onEnable 时机不准） */
    setLabelForLevel(levelId: number): void {
        if (!this._label?.isValid) {
            return;
        }
        const nextId = getNextOpticalLevelId(levelId);
        this._label.string = nextId != null ? WIN_NEXT_LEVEL_TEXT : WIN_RETURN_TEXT;
    }

    refresh(): void {
        this._redraw();
    }

    private _refreshLabelText(): void {
        const levelId = this._resolveOpticalPuzzleRoot()?.getCurrentLevelId() ?? 0;
        this.setLabelForLevel(levelId);
    }

    private _hidePlaceholderSplash(): void {
        const splash = this.node.getChildByName('SpriteSplash');
        if (splash?.isValid) {
            splash.active = false;
        }
    }

    private _ensureButton(): void {
        let btn = this.getComponent(Button);
        if (!btn) {
            btn = this.addComponent(Button);
            btn.transition = Button.Transition.SCALE;
        }
        btn.zoomScale = NEXT_LEVEL_BUTTON_ZOOM_SCALE;
    }

    /** 录屏回放：模拟点击下一关（跳转 id 须事先写入 DataManager.opticalCurrentLevelId） */
    triggerRecordReplayClick(): void {
        this._onClick();
    }

    private _onClick(): void {
        PLAY_AUDIO.emit(EVENT_ENUM.PLAY_AUDIO, AUDIO_EFFECT_ENUM.CLICK_BUTTON);

        const gameRoot = this._resolveGameRoot();
        const winPanel = resolveWinPanelNode(gameRoot);
        if (winPanel?.isValid) {
            winPanel.active = false;
        }

        const puzzleRoot = this._resolveOpticalPuzzleRoot(gameRoot);
        const currentId = puzzleRoot?.getCurrentLevelId() ?? 0;
        const nextId = getNextOpticalLevelId(currentId);
        if (nextId != null) {
            // opticalCurrentLevelId 已在通关瞬间写入下一关 id
            puzzleRoot?.reloadCurrentLevel();
            return;
        }

        // 最后一关：opticalCurrentLevelId 已在通关瞬间写回首关 id
        director.loadScene(SCENE_ENUM.MENU);
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

    private _resolveOpticalPuzzleRoot(gameRoot?: Node | null): IOpticalPuzzleRootApi | null {
        const root = gameRoot ?? this._resolveGameRoot();
        if (!root?.isValid) {
            return null;
        }
        const comp =
            root.getComponent('OpticalPuzzleRoot') ??
            root.getComponentInChildren('OpticalPuzzleRoot');
        return comp as unknown as IOpticalPuzzleRootApi | null;
    }

    private _ensureGraphics(): Graphics | null {
        if (!this._graphics?.isValid) {
            this._graphics = this.getComponent(Graphics) ?? this.addComponent(Graphics);
        }
        return this._graphics;
    }

    private _redraw(): void {
        const g = this._ensureGraphics();
        const ut = this.getComponent(UITransform);
        if (!g || !ut) {
            return;
        }
        g.clear();
        const w = ut.width;
        const h = ut.height;
        const left = -ut.anchorX * w;
        const bottom = -ut.anchorY * h;
        drawWinPanelNextLevelButtonGlyph(g, left, bottom, w, h, this._pressed);
    }
}

/** 自 GameRoot 子树解析 layerOverlay/winPanel/winds/nextlevel */
export function resolveWinPanelNextLevelNode(root: Node | null): Node | null {
    return resolveWinPanelWindsNode(root)?.getChildByName('nextlevel') ?? null;
}

/** 为 winds/nextlevel 挂上键帽绘制与点击逻辑 */
export function ensureWinPanelNextLevelButtonView(root: Node | null): void {
    const nextLevel = resolveWinPanelNextLevelNode(root);
    if (!nextLevel?.isValid) {
        return;
    }
    if (!nextLevel.getComponent(OpticalPuzzleWinPanelNextLevelButtonView)) {
        nextLevel.addComponent(OpticalPuzzleWinPanelNextLevelButtonView);
    }
}
