import {
    _decorator,
    Button,
    Component,
    Graphics,
    Label,
    Node,
    UITransform,
} from 'cc';
import { DataManager } from '../../../Manager/DataManager';
import { AUDIO_EFFECT_ENUM, EVENT_ENUM } from '../../../Utils/Enum';
import { PLAY_AUDIO } from '../../../Utils/Event';
import { HudButtonPressController } from './OpticalPuzzleHudButtonCommon';
import { drawWinPanelNextLevelButtonGlyph } from './OpticalPuzzleWinPanelNextLevelButtonGlyph';
import {
    resolveWinPanelNode,
    resolveWinPanelWindsNode,
} from './OpticalPuzzleWinPanelWindsView';

const { ccclass } = _decorator;

/** 与 nextlevel / 四向键 Button.zoomScale 一致 */
const RETRY_BUTTON_ZOOM_SCALE = 0.95;

/** retry/label 文案（场景未配置时的兜底） */
const WIN_RETRY_TEXT = '再 次 挑 战';

/** 局内入口能力（避免与 OpticalPuzzleRoot 循环引用） */
interface IOpticalPuzzleRootApi {
    getCurrentLevelId(): number;
    loadLevelById(levelId: number): void;
}

/** winPanel/winds/retry：非完美通关时重开本关 */
@ccclass('OpticalPuzzleWinPanelRetryButtonView')
export class OpticalPuzzleWinPanelRetryButtonView extends Component {
    private _graphics: Graphics | null = null;
    private _label: Label | null = null;
    private _pressed = false;
    private _pressCtrl: HudButtonPressController | null = null;

    protected onLoad(): void {
        this._hidePlaceholderSplash();
        this._label = this.node.getChildByName('label')?.getComponent(Label) ?? null;
        if (this._label?.isValid && !this._label.string) {
            this._label.string = WIN_RETRY_TEXT;
        }
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

    refresh(): void {
        this._redraw();
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
        btn.zoomScale = RETRY_BUTTON_ZOOM_SCALE;
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
        if (currentId <= 0) {
            return;
        }
        DataManager.instance.opticalCurrentLevelId = currentId;
        puzzleRoot?.loadLevelById(currentId);
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

/** 自 GameRoot 子树解析 layerOverlay/winPanel/winds/retry */
export function resolveWinPanelRetryNode(root: Node | null): Node | null {
    return resolveWinPanelWindsNode(root)?.getChildByName('retry') ?? null;
}

/** 为 winds/retry 挂上键帽绘制与点击逻辑 */
export function ensureWinPanelRetryButtonView(root: Node | null): void {
    const retry = resolveWinPanelRetryNode(root);
    if (!retry?.isValid) {
        return;
    }
    if (!retry.getComponent(OpticalPuzzleWinPanelRetryButtonView)) {
        retry.addComponent(OpticalPuzzleWinPanelRetryButtonView);
    }
}
