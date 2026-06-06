import { _decorator, Color, Component, Graphics, Node, UITransform } from 'cc';
import { HUD_KEY_FILL } from './OpticalPuzzleHudButtonCommon';

const { ccclass } = _decorator;

/** 胜利面板内容区圆角（设计 px，不随节点缩放） */
const WIN_WINDS_CORNER_PX = 20;
/** 胜利面板内容区白边线宽（设计 px） */
const WIN_WINDS_BORDER_PX = 5;
const WIN_WINDS_BORDER_COLOR = new Color(255, 255, 255, 255);

/** 绘制 winPanel/winds：键帽底色 + 纯白圆角描边 */
export function drawWinPanelWindsChrome(
    g: Graphics,
    left: number,
    bottom: number,
    width: number,
    height: number,
): void {
    g.fillColor = HUD_KEY_FILL;
    g.roundRect(left, bottom, width, height, WIN_WINDS_CORNER_PX);
    g.fill();

    g.strokeColor = WIN_WINDS_BORDER_COLOR;
    g.lineWidth = WIN_WINDS_BORDER_PX;
    g.roundRect(left, bottom, width, height, WIN_WINDS_CORNER_PX);
    g.stroke();
}

/** winPanel/winds：圆角面板底图（非按钮） */
@ccclass('OpticalPuzzleWinPanelWindsView')
export class OpticalPuzzleWinPanelWindsView extends Component {
    private _graphics: Graphics | null = null;

    protected onLoad(): void {
        this._hidePlaceholderSplash();
        this._redraw();
    }

    protected onEnable(): void {
        this._redraw();
    }

    refresh(): void {
        this._redraw();
    }

    private _hidePlaceholderSplash(): void {
        const splash = this.node.getChildByName('SpriteSplash');
        if (splash?.isValid) {
            splash.active = false;
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
        drawWinPanelWindsChrome(g, left, bottom, w, h);
    }
}

/** 自 GameRoot 子树解析 layerOverlay/winPanel */
export function resolveWinPanelNode(root: Node | null): Node | null {
    return root?.getChildByName('layerOverlay')?.getChildByName('winPanel') ?? null;
}

/** 自 GameRoot 子树解析 layerOverlay/winPanel/winds */
export function resolveWinPanelWindsNode(root: Node | null): Node | null {
    return resolveWinPanelNode(root)?.getChildByName('winds') ?? null;
}

/** 为 winPanel/winds 挂上面板底图绘制 */
export function ensureWinPanelWindsView(root: Node | null): void {
    const winds = resolveWinPanelWindsNode(root);
    if (!winds?.isValid) {
        return;
    }
    if (!winds.getComponent(OpticalPuzzleWinPanelWindsView)) {
        winds.addComponent(OpticalPuzzleWinPanelWindsView);
    }
}

