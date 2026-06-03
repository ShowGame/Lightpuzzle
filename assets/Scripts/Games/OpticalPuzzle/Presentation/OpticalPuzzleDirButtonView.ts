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

/** 四向虚拟键：按节点 UITransform 尺寸绘制键帽（位置由场景节点坐标决定） */
@ccclass('OpticalPuzzleDirButtonView')
export class OpticalPuzzleDirButtonView extends Component {
    /** 留空则按节点名 BtnUp / BtnDown / BtnLeft / BtnRight 推断 */
    @property
    direction: Direction = Direction.Up;

    private _graphics: Graphics | null = null;
    private _pressed = false;
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

    protected onDestroy(): void {
        this._pressCtrl?.unbind();
    }

    /** 改 UITransform 尺寸后可在编辑器调用来刷新 */
    refresh(): void {
        this._redraw();
    }

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
        drawDirButtonGlyph(g, left, bottom, w, h, this.direction, this._pressed);
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
