import {
    _decorator,
    Button,
    Component,
    Graphics,
    Node,
    UITransform,
} from 'cc';
import { HudButtonPressController } from './Games/OpticalPuzzle/Presentation/OpticalPuzzleHudButtonPressController';
import { drawMenuLevelSelectButtonGlyph } from './Games/OpticalPuzzle/Presentation/MenuLevelSelectButtonGlyph';

const { ccclass } = _decorator;

/** 与开始键 Button.zoomScale 一致 */
const LEVEL_SELECT_MENU_BUTTON_ZOOM_SCALE = 0.95;

/** Menu/MainPanel/BtnLevelSelect：圆形键帽 + 四宫格 icon（点击由 MenuManager 绑定） */
@ccclass('MenuLevelSelectButtonView')
export class MenuLevelSelectButtonView extends Component {
    private _graphics: Graphics | null = null;
    private _pressed = false;
    private _pressCtrl: HudButtonPressController | null = null;

    protected onLoad(): void {
        this._hidePlaceholderSplash();
        this._ensureButton();
        this._pressCtrl = new HudButtonPressController(this.node, (pressed) => {
            this._pressed = pressed;
            this._redraw();
        });
        this._redraw();
    }

    protected onEnable(): void {
        this._pressCtrl?.bind();
        this._redraw();
    }

    protected onDisable(): void {
        this._pressCtrl?.unbind();
        this._pressed = false;
    }

    protected onDestroy(): void {
        this._pressCtrl?.unbind();
    }

    private _hidePlaceholderSplash(): void {
        const splash = this.node.getChildByName('SpriteSplash') ?? this.node.getChildByName('bg');
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
        btn.zoomScale = LEVEL_SELECT_MENU_BUTTON_ZOOM_SCALE;
        btn.transition = Button.Transition.SCALE;
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
        drawMenuLevelSelectButtonGlyph(g, left, bottom, w, h, this._pressed);
    }
}

/** 为 MainPanel/BtnLevelSelect 挂上键帽绘制与按压缩放 */
export function ensureMenuLevelSelectButtonView(btnLevelSelect: Node | null): void {
    if (!btnLevelSelect?.isValid) {
        return;
    }
    if (!btnLevelSelect.getComponent(MenuLevelSelectButtonView)) {
        btnLevelSelect.addComponent(MenuLevelSelectButtonView);
    }
}
