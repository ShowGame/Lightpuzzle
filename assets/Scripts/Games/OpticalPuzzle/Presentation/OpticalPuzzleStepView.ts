import { _decorator, Component, Graphics, Node, UITransform } from 'cc';
import { drawHudButtonChrome, HUD_DIR_BUTTON_SCENE_SIZE } from './OpticalPuzzleHudButtonCommon';
import { ensureStepCountView, resolveStepCountNode } from './OpticalPuzzleStepCountView';
import { ensureStepIconView } from './OpticalPuzzleStepIconView';

const { ccclass } = _decorator;

/** TopBar 步数区外框：圆角 + 白边 + 键帽底色；非按钮，仅绘制底图 */
@ccclass('OpticalPuzzleStepView')
export class OpticalPuzzleStepView extends Component {
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
        drawHudButtonChrome(g, left, bottom, w, h, false, HUD_DIR_BUTTON_SCENE_SIZE);
    }
}

/** 为 TopBar/Step 挂上外框；StepIcon 仍在子节点上单独绘制爪印 */
export function ensureStepViews(topBar: Node | null): void {
    const step = topBar?.getChildByName('Step') ?? null;
    if (step?.isValid && !step.getComponent(OpticalPuzzleStepView)) {
        step.addComponent(OpticalPuzzleStepView);
    }
    const stepIcon = step?.getChildByName('StepIcon') ?? topBar?.getChildByName('StepIcon') ?? null;
    ensureStepIconView(stepIcon);
    ensureStepCountView(resolveStepCountNode(topBar));
}
