import { _decorator, Component, Graphics, Node, Sprite, UITransform } from 'cc';
import { drawMenuTitleWhiteSourceRightBeam } from './Games/OpticalPuzzle/Presentation/MenuGameTitleIcon2Glyph';

const { ccclass } = _decorator;

/** Menu/MainPanel/GameTitleIcon2：白色光源发射器朝右 + 1000px 光束 */
@ccclass('MenuGameTitleIcon2View')
export class MenuGameTitleIcon2View extends Component {
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
        const left = -ut.anchorX * w;
        const bottom = -ut.anchorY * h;
        drawMenuTitleWhiteSourceRightBeam(g, left, bottom, w, h);
    }
}

/** 为 GameTitleIcon2 节点挂上光源图标绘制 */
export function ensureMenuGameTitleIcon2View(iconNode: Node | null): void {
    if (!iconNode?.isValid) {
        return;
    }
    if (!iconNode.getComponent(MenuGameTitleIcon2View)) {
        iconNode.addComponent(MenuGameTitleIcon2View);
    }
}
