import { _decorator, Component, Graphics, Node, Sprite, UITransform } from 'cc';
import { Direction } from './Games/OpticalPuzzle/Core/OpticalPuzzleTypes';
import { drawPlayerEyes } from './Games/OpticalPuzzle/Presentation/OpticalPuzzlePlayerGlyph';

const { ccclass } = _decorator;

/** Menu/MainPanel/GameTitleIcon：主角图标（睁眼、朝左看） */
@ccclass('MenuGameTitleIconView')
export class MenuGameTitleIconView extends Component {
    private _graphics: Graphics | null = null;

    protected onLoad(): void {
        this._disableRasterPlaceholder();
        this._ensureGraphics();
        this._redraw();
    }

    protected onEnable(): void {
        this._redraw();
    }

    private _disableRasterPlaceholder(): void {
        const splash = this.node.getChildByName('SpriteSplash');
        if (splash?.isValid) {
            splash.active = false;
        }
        const sprite = this.getComponent(Sprite);
        if (sprite) {
            sprite.enabled = false;
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
        const size = Math.min(w, h);
        const left = -ut.anchorX * w + (w - size) * 0.5;
        const bottom = -ut.anchorY * h + (h - size) * 0.5;
        drawPlayerEyes(g, left, bottom, size, Direction.Left, 0, false);
    }
}

/** 为 GameTitleIcon 节点挂上主角图标绘制 */
export function ensureMenuGameTitleIconView(iconNode: Node | null): void {
    if (!iconNode?.isValid) {
        return;
    }
    if (!iconNode.getComponent(MenuGameTitleIconView)) {
        iconNode.addComponent(MenuGameTitleIconView);
    }
}
