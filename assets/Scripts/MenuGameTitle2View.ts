import { _decorator, Component, Graphics, Node, Sprite, UITransform } from 'cc';
import { drawGameSubtitleOutline } from './Games/OpticalPuzzle/Presentation/MenuGameSubtitleGlyph';

const { ccclass } = _decorator;

/** Menu/MainPanel/GameTitle2：副标题矢量描边（替代 PNG Sprite） */
@ccclass('MenuGameTitle2View')
export class MenuGameTitle2View extends Component {
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
        drawGameSubtitleOutline(g, left, bottom, w, h);
    }
}

/** 为 GameTitle2 节点挂上矢量副标题绘制 */
export function ensureMenuGameTitle2View(titleNode: Node | null): void {
    if (!titleNode?.isValid) {
        return;
    }
    if (!titleNode.getComponent(MenuGameTitle2View)) {
        titleNode.addComponent(MenuGameTitle2View);
    }
}
