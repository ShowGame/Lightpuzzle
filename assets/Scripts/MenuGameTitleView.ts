import { _decorator, Component, Graphics, Node, Sprite, UITransform } from 'cc';
import { drawGameTitleOutline } from './Games/OpticalPuzzle/Presentation/MenuGameTitleGlyph';

const { ccclass } = _decorator;

/** Menu/MainPanel/GameTitle：矢量轮廓标题（替代 PNG Sprite） */
@ccclass('MenuGameTitleView')
export class MenuGameTitleView extends Component {
    private _graphics: Graphics | null = null;

    protected onLoad(): void {
        this._disableRasterTitle();
        this._ensureGraphics();
        this._redraw();
    }

    protected onEnable(): void {
        this._redraw();
    }

    private _disableRasterTitle(): void {
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
        drawGameTitleOutline(g, left, bottom, w, h);
    }
}

/** 为 GameTitle 节点挂上矢量标题绘制 */
export function ensureMenuGameTitleView(titleNode: Node | null): void {
    if (!titleNode?.isValid) {
        return;
    }
    if (!titleNode.getComponent(MenuGameTitleView)) {
        titleNode.addComponent(MenuGameTitleView);
    }
}
