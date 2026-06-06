import {
    _decorator,
    Button,
    Component,
    Graphics,
    Node,
    UITransform,
} from 'cc';
import { drawBackButtonGlyph } from './OpticalPuzzleBackButtonGlyph';
import { HudButtonPressController } from './OpticalPuzzleHudButtonCommon';

const { ccclass } = _decorator;

/** 与四向键 Button.zoomScale 一致 */
const BACK_BUTTON_ZOOM_SCALE = 0.95;

/** TopBar 返回键：仅绘制图标，按下缩放与四向键一致 */
@ccclass('OpticalPuzzleBackButtonView')
export class OpticalPuzzleBackButtonView extends Component {
    private _graphics: Graphics | null = null;
    private _pressed = false;
    private _pressCtrl: HudButtonPressController | null = null;

    protected onLoad(): void {
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

    refresh(): void {
        this._redraw();
    }

    private _ensureButton(): void {
        let btn = this.getComponent(Button);
        if (!btn) {
            btn = this.addComponent(Button);
            btn.transition = Button.Transition.SCALE;
        }
        btn.zoomScale = BACK_BUTTON_ZOOM_SCALE;
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
        drawBackButtonGlyph(g, left, bottom, w, h, this._pressed);
    }
}

/** 为 TopBar/BtnBackMenu 挂上绘制与按压缩放 */
export function ensureBackButtonView(btnBackMenu: Node | null): void {
    if (!btnBackMenu?.isValid) {
        return;
    }
    if (!btnBackMenu.getComponent(OpticalPuzzleBackButtonView)) {
        btnBackMenu.addComponent(OpticalPuzzleBackButtonView);
    }
}
