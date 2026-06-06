import {
    _decorator,
    Component,
    Graphics,
    Node,
    UITransform,
} from 'cc';
import {
    ActionButtonKind,
    drawActionButtonGlyph,
    ACTION_BUTTON_DESIGN_SIZE,
} from './OpticalPuzzleActionButtonGlyph';
import { HudButtonPressController } from './OpticalPuzzleHudButtonCommon';

const { ccclass, property } = _decorator;

/** 撤回 / 重置虚拟键：键帽风格与四向键一致，内部符号不同 */
@ccclass('OpticalPuzzleActionButtonView')
export class OpticalPuzzleActionButtonView extends Component {
    /** 留空则按节点名 BtnUndo / BtnReset 推断 */
    @property
    kind: ActionButtonKind = ActionButtonKind.Undo;

    private _graphics: Graphics | null = null;
    private _pressed = false;
    private _undoFillStage = 0;
    private _pressCtrl: HudButtonPressController | null = null;

    protected onLoad(): void {
        this.kind = this._resolveKind(this.kind, this.node.name);
        this._ensureTransform();
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

    /** 键盘等非触摸输入：短暂显示按压发光 */
    flashPressed(durationSec = 0.1): void {
        if (this._pressCtrl?.touchActive) {
            return;
        }
        this._pressed = true;
        this._redraw();
        this.unschedule(this._releaseKeyboardFlash);
        this.scheduleOnce(this._releaseKeyboardFlash, durationSec);
    }

    private _releaseKeyboardFlash = (): void => {
        if (this._pressCtrl?.touchActive) {
            return;
        }
        this._pressed = false;
        this._redraw();
    };

    /** 撤回键横向填充阶段（0 满填，3 空） */
    setUndoFillStage(stage: number): void {
        this._undoFillStage = stage;
        this._redraw();
    }

    private _ensureTransform(): void {
        let ut = this.getComponent(UITransform);
        if (!ut) {
            ut = this.addComponent(UITransform);
            ut.setContentSize(ACTION_BUTTON_DESIGN_SIZE, ACTION_BUTTON_DESIGN_SIZE);
        }
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
        drawActionButtonGlyph(
            g,
            left,
            bottom,
            w,
            h,
            this.kind,
            this._pressed,
            this.kind === ActionButtonKind.Undo ? this._undoFillStage : 0,
        );
    }

    private _resolveKind(fallback: ActionButtonKind, nodeName: string): ActionButtonKind {
        const key = nodeName.toLowerCase();
        if (key.includes('reset')) {
            return ActionButtonKind.Reset;
        }
        if (key.includes('undo')) {
            return ActionButtonKind.Undo;
        }
        return fallback;
    }
}

/** 为 ActionPad 下 BtnUndo / BtnReset 批量挂上绘制 */
export function ensureActionButtonViews(actionPad: Node | null): void {
    if (!actionPad?.isValid) {
        return;
    }
    for (const child of actionPad.children) {
        if (!child.getComponent(OpticalPuzzleActionButtonView)) {
            child.addComponent(OpticalPuzzleActionButtonView);
        }
    }
}
