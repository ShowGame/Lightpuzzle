import {
    _decorator,
    Color,
    Component,
    Graphics,
    UITransform,
} from 'cc';
import type { OpticalBoardSnapshot } from '../Core/OpticalPuzzleTypes';
import { TerrainKind } from '../Core/OpticalPuzzleTypes';

const { ccclass } = _decorator;

/** 棋盘占位绘制：墙/地板/主角（后续换 Sprite） */
@ccclass('OpticalPuzzleBoardView')
export class OpticalPuzzleBoardView extends Component {
    private _graphics: Graphics | null = null;

    protected onLoad(): void {
        this._ensureGraphics();
        let ut = this.getComponent(UITransform);
        if (!ut) {
            ut = this.addComponent(UITransform);
            ut.setContentSize(700, 700);
        }
    }

    /** 父节点 onLoad 可能早于本组件，绘制前须保证 Graphics 已存在 */
    private _ensureGraphics(): Graphics | null {
        if (!this._graphics?.isValid) {
            this._graphics = this.getComponent(Graphics) ?? this.addComponent(Graphics);
        }
        return this._graphics;
    }

    render(snapshot: OpticalBoardSnapshot): void {
        const g = this._ensureGraphics();
        if (!g) {
            return;
        }
        g.clear();
        const cell = 56;
        const ox = (-snapshot.width * cell) / 2;
        const oy = (snapshot.height * cell) / 2;
        for (let y = 0; y < snapshot.height; y++) {
            for (let x = 0; x < snapshot.width; x++) {
                const t = snapshot.terrain[y * snapshot.width + x];
                if (t === TerrainKind.Wall) {
                    g.fillColor = new Color(55, 58, 70, 255);
                } else if (t === TerrainKind.Source) {
                    g.fillColor = new Color(240, 200, 90, 255);
                } else if (t === TerrainKind.Target) {
                    g.fillColor = new Color(90, 200, 130, 255);
                } else {
                    g.fillColor = new Color(32, 36, 48, 255);
                }
                g.rect(ox + x * cell + 1, oy - (y + 1) * cell + 1, cell - 2, cell - 2);
                g.fill();
            }
        }
        const { x: px, y: py } = snapshot.player;
        g.fillColor = new Color(120, 210, 255, 255);
        g.rect(ox + px * cell + 8, oy - (py + 1) * cell + 8, cell - 16, cell - 16);
        g.fill();
    }
}
