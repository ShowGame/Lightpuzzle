import { _decorator, Component, Graphics, Node, UITransform } from 'cc';
import { drawStepIconGlyph } from './OpticalPuzzleStepIconGlyph';

const { ccclass } = _decorator;

/** TopBar 步数爪印：仅绘制，无按钮交互 */
@ccclass('OpticalPuzzleStepIconView')
export class OpticalPuzzleStepIconView extends Component {
    private _graphics: Graphics | null = null;

    protected onLoad(): void {
        this._redraw();
    }

    protected onEnable(): void {
        this._redraw();
    }

    refresh(): void {
        this._redraw();
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
        drawStepIconGlyph(g, left, bottom, w, h);
    }
}

/** 为 TopBar/StepIcon 挂上爪印绘制 */
export function ensureStepIconView(stepIcon: Node | null): void {
    if (!stepIcon?.isValid) {
        return;
    }
    if (!stepIcon.getComponent(OpticalPuzzleStepIconView)) {
        stepIcon.addComponent(OpticalPuzzleStepIconView);
    }
}
