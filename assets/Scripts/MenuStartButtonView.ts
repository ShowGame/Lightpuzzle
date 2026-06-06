import {
    _decorator,
    Button,
    Component,
    Graphics,
    Label,
    Node,
    UITransform,
} from 'cc';
import { getFirstOpticalLevelId } from './Games/OpticalPuzzle/Config/OpticalPuzzleLevels';
import { drawWinPanelNextLevelButtonGlyph } from './Games/OpticalPuzzle/Presentation/OpticalPuzzleWinPanelNextLevelButtonGlyph';
import { HudButtonPressController } from './Games/OpticalPuzzle/Presentation/OpticalPuzzleHudButtonCommon';
import { DataManager } from './Manager/DataManager';

const { ccclass } = _decorator;

/** 与 nextlevel / 四向键 Button.zoomScale 一致 */
const START_BUTTON_ZOOM_SCALE = 0.95;

const MENU_START_TEXT = '开 始 游 戏';
const MENU_CONTINUE_TEXT = '继 续 游 戏';

/** Menu/MainPanel/BtnStart：绘制样式同 winds/nextlevel（点击逻辑由 MenuManager 绑定） */
@ccclass('MenuStartButtonView')
export class MenuStartButtonView extends Component {
    private _graphics: Graphics | null = null;
    private _label: Label | null = null;
    private _pressed = false;
    private _pressCtrl: HudButtonPressController | null = null;

    protected onLoad(): void {
        this._hidePlaceholderBg();
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
        this._refreshLabelText();
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
        this._refreshLabelText();
        this._redraw();
    }

    private _refreshLabelText(): void {
        if (!this._label?.isValid) {
            return;
        }
        const levelId = DataManager.instance.opticalCurrentLevelId;
        this._label.string =
            levelId === getFirstOpticalLevelId() ? MENU_START_TEXT : MENU_CONTINUE_TEXT;
    }

    private _hidePlaceholderBg(): void {
        const bg = this.node.getChildByName('bg');
        if (bg?.isValid) {
            bg.active = false;
        }
    }

    private _ensureButton(): void {
        let btn = this.getComponent(Button);
        if (!btn) {
            btn = this.addComponent(Button);
            btn.transition = Button.Transition.SCALE;
        }
        btn.zoomScale = START_BUTTON_ZOOM_SCALE;
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
        drawWinPanelNextLevelButtonGlyph(g, left, bottom, w, h, this._pressed);
    }
}

/** 为 MainPanel/BtnStart 挂上键帽绘制与按压缩放 */
export function ensureMenuStartButtonView(btnStart: Node | null): void {
    if (!btnStart?.isValid) {
        return;
    }
    if (!btnStart.getComponent(MenuStartButtonView)) {
        btnStart.addComponent(MenuStartButtonView);
    }
}
