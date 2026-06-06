import {
    _decorator,
    Button,
    Component,
    Graphics,
    Node,
    UITransform,
} from 'cc';
import { drawLevelSelectButtonGlyph } from './OpticalPuzzleLevelSelectButtonGlyph';
import { HudButtonPressController } from './OpticalPuzzleHudButtonCommon';

const { ccclass } = _decorator;

/** 与四向键 Button.zoomScale 一致 */
const LEVEL_SELECT_BUTTON_ZOOM_SCALE = 0.95;

/** TopBar 选关键：仅绘制图标，按下缩放与四向键一致 */
@ccclass('OpticalPuzzleLevelSelectButtonView')
export class OpticalPuzzleLevelSelectButtonView extends Component {
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
        btn.zoomScale = LEVEL_SELECT_BUTTON_ZOOM_SCALE;
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
        drawLevelSelectButtonGlyph(g, left, bottom, w, h, this._pressed);
    }
}

/** 为 TopBar/BtnLevelSelect 挂上绘制与按压缩放 */
export function ensureLevelSelectButtonView(btnLevelSelect: Node | null): void {
    if (!btnLevelSelect?.isValid) {
        return;
    }
    if (!btnLevelSelect.getComponent(OpticalPuzzleLevelSelectButtonView)) {
        btnLevelSelect.addComponent(OpticalPuzzleLevelSelectButtonView);
    }
}
