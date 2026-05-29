import {
    _decorator,
    Color,
    Component,
    Graphics,
    UITransform,
} from 'cc';
import type { OpticalBoardSnapshot } from '../Core/OpticalPuzzleTypes';
import { TerrainKind } from '../Core/OpticalPuzzleTypes';
import {
    sourceFillColor,
    targetDimFillColor,
    targetLitFillColor,
} from './OpticalPuzzleColorUtil';
import { drawConnectivityGlyph } from './OpticalPuzzlePieceGlyph';

const { ccclass } = _decorator;

/** 棋盘占位绘制：墙/地板/光源/目标/通道元件/主角（后续换 Sprite） */
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

        const sourceAt = new Map<string, string>();
        for (const s of snapshot.sources) {
            sourceAt.set(`${s.x},${s.y}`, s.colorKey);
        }
        const targetAt = new Map<string, { lit: boolean; colorKey: string }>();
        for (const t of snapshot.targets) {
            targetAt.set(`${t.x},${t.y}`, { lit: t.lit, colorKey: t.colorKey });
        }

        for (let y = 0; y < snapshot.height; y++) {
            for (let x = 0; x < snapshot.width; x++) {
                const t = snapshot.terrain[y * snapshot.width + x];
                if (t === TerrainKind.Wall) {
                    g.fillColor = new Color(55, 58, 70, 255);
                } else if (t === TerrainKind.Source) {
                    g.fillColor = sourceFillColor(sourceAt.get(`${x},${y}`));
                } else if (t === TerrainKind.Target) {
                    const tgt = targetAt.get(`${x},${y}`);
                    g.fillColor = tgt?.lit
                        ? targetLitFillColor(tgt.colorKey)
                        : targetDimFillColor(tgt?.colorKey);
                } else {
                    g.fillColor = new Color(32, 36, 48, 255);
                }
                g.rect(ox + x * cell + 1, oy - (y + 1) * cell + 1, cell - 2, cell - 2);
                g.fill();
            }
        }

        const inner = cell - 2;
        for (const piece of snapshot.pieces) {
            const left = ox + piece.x * cell + 1;
            const top = oy - piece.y * cell - 1;
            drawConnectivityGlyph(
                g,
                left,
                top,
                inner,
                piece.connectivity,
                piece.direction,
                piece.colorKey,
            );
        }

        const { x: px, y: py } = snapshot.player;
        g.fillColor = new Color(120, 210, 255, 255);
        g.rect(ox + px * cell + 8, oy - (py + 1) * cell + 8, cell - 16, cell - 16);
        g.fill();
    }
}
