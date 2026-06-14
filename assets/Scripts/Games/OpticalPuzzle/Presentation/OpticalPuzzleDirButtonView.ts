import {
    _decorator,
    Component,
    Graphics,
    Node,
    UITransform,
} from 'cc';
import { Direction } from '../Core/OpticalPuzzleTypes';
import { drawDirButtonGlyph, DIR_BUTTON_DESIGN_SIZE } from './OpticalPuzzleDirButtonGlyph';
import { HudButtonPressController } from './OpticalPuzzleHudButtonCommon';

const { ccclass, property } = _decorator;

/** 教程黄呼吸光晕周期（秒） */
const TUTORIAL_BREATH_PERIOD_SEC = 1.8;

/** 四向虚拟键：按节点 UITransform 尺寸绘制键帽（位置由场景节点坐标决定） */
@ccclass('OpticalPuzzleDirButtonView')
export class OpticalPuzzleDirButtonView extends Component {
    /** 留空则按节点名 BtnUp / BtnDown / BtnLeft / BtnRight 推断 */
    @property
    direction: Direction = Direction.Up;

    private _graphics: Graphics | null = null;
    private _pressed = false;
    private _tutorialHint = false;
    private _breathPhase = 0;
    private _pressCtrl: HudButtonPressController | null = null;

    protected onLoad(): void {
        this.direction = this._resolveDirection(this.direction, this.node.name);
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

    protected update(dt: number): void {
        if (!this._tutorialHint || this._pressed) {
            return;
        }
        this._breathPhase += dt;
        this._redraw();
    }

    protected onDestroy(): void {
        this._pressCtrl?.unbind();
    }

    /** 改 UITransform 尺寸后可在编辑器调用来刷新 */
    refresh(): void {
        this._redraw();
    }

    /** 第 1 关步数 0 等教程态：黄框黄呼吸光晕；按下时仍走默认白描边/白光晕 */
    setTutorialHint(active: boolean): void {
        if (this._tutorialHint === active) {
            return;
        }
        this._tutorialHint = active;
        this._breathPhase = 0;
        this._redraw();
    }

    /** 键盘等非触摸输入：短暂显示按压发光（触摸中则已由 HudButtonPressController 驱动） */
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

    private _ensureTransform(): void {
        let ut = this.getComponent(UITransform);
        if (!ut) {
            ut = this.addComponent(UITransform);
            ut.setContentSize(DIR_BUTTON_DESIGN_SIZE, DIR_BUTTON_DESIGN_SIZE);
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
        const tutorialBreathT =
            !this._pressed && this._tutorialHint ? this._sampleTutorialBreathT() : null;
        drawDirButtonGlyph(g, left, bottom, w, h, this.direction, this._pressed, tutorialBreathT);
    }

    private _sampleTutorialBreathT(): number {
        const phase = (this._breathPhase / TUTORIAL_BREATH_PERIOD_SEC) * Math.PI * 2;
        return 0.5 + 0.5 * Math.sin(phase);
    }

    private _resolveDirection(fallback: Direction, nodeName: string): Direction {
        const key = nodeName.toLowerCase();
        if (key.includes('up')) {
            return Direction.Up;
        }
        if (key.includes('down')) {
            return Direction.Down;
        }
        if (key.includes('left')) {
            return Direction.Left;
        }
        if (key.includes('right')) {
            return Direction.Right;
        }
        return fallback;
    }
}

/** 为 DirPad 下四节点批量挂上绘制（InputHud 自动绑定前调用） */
export function ensureDirButtonViews(dirPad: Node | null): void {
    if (!dirPad?.isValid) {
        return;
    }
    for (const child of dirPad.children) {
        if (!child.getComponent(OpticalPuzzleDirButtonView)) {
            child.addComponent(OpticalPuzzleDirButtonView);
        }
    }
}
