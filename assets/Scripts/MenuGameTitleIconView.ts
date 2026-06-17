import { _decorator, Component, Graphics, Node, Sprite, UITransform } from 'cc';
import { Direction } from './Games/OpticalPuzzle/Core/OpticalPuzzleTypes';
import { drawPlayerEyes } from './Games/OpticalPuzzle/Presentation/OpticalPuzzlePlayerGlyph';

const { ccclass } = _decorator;

/** 与 OpticalPuzzleBoardView 主角闲置眨眼一致 */
const MENU_PLAYER_BLINK_INTERVAL = 4;
const MENU_PLAYER_BLINK_DURATION = 0.25;

/** Menu/MainPanel/GameTitleIcon：主角图标（睁眼、朝左看，每 4s 眨一次） */
@ccclass('MenuGameTitleIconView')
export class MenuGameTitleIconView extends Component {
    private _graphics: Graphics | null = null;
    /** 眨眼周期计时（秒） */
    private _blinkClock = 0;

    protected onLoad(): void {
        this._disableRasterPlaceholder();
        this._ensureGraphics();
        this._redraw();
    }

    protected onEnable(): void {
        this._blinkClock = 0;
        this._redraw();
    }

    protected update(dt: number): void {
        this._blinkClock += dt;
        this._redraw();
    }

    private _currentBlinkAmount(): number {
        const cycle = MENU_PLAYER_BLINK_INTERVAL + MENU_PLAYER_BLINK_DURATION;
        const t = this._blinkClock % cycle;
        if (t < MENU_PLAYER_BLINK_INTERVAL) {
            return 0;
        }
        const p = (t - MENU_PLAYER_BLINK_INTERVAL) / MENU_PLAYER_BLINK_DURATION;
        return Math.sin(Math.min(1, p) * Math.PI);
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
        drawPlayerEyes(
            g,
            left,
            bottom,
            size,
            Direction.Left,
            this._currentBlinkAmount(),
            false,
        );
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
