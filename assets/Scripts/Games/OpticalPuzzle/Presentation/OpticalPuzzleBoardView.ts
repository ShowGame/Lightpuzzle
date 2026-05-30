import {
    _decorator,
    Color,
    Component,
    Graphics,
    Node,
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

const CELL = 56;

/** 棋盘占位绘制：墙/地板/光源/目标/主角；元件在光路之上单独层绘制 */
@ccclass('OpticalPuzzleBoardView')
export class OpticalPuzzleBoardView extends Component {
    private _graphics: Graphics | null = null;
    private _pieceGraphics: Graphics | null = null;

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

    /** 光路层之上的元件层（避免窄光线完全盖住元件本色） */
    private _ensurePieceGraphics(): Graphics | null {
        if (this._pieceGraphics?.isValid) {
            return this._pieceGraphics;
        }
        const root = this.node.parent ?? this.node;
        let layer = root.getChildByName('PieceLayer');
        if (!layer) {
            layer = new Node('PieceLayer');
            root.addChild(layer);
            const ut = layer.addComponent(UITransform);
            const boardUt = this.node.getComponent(UITransform);
            if (boardUt) {
                ut.setContentSize(boardUt.contentSize);
            } else {
                ut.setContentSize(700, 700);
            }
            const beam = root.getChildByName('BeamLayer');
            if (beam) {
                layer.setSiblingIndex(beam.getSiblingIndex() + 1);
            }
        }
        this._pieceGraphics = layer.getComponent(Graphics) ?? layer.addComponent(Graphics);
        return this._pieceGraphics;
    }

    private _cellLayout(snapshot: OpticalBoardSnapshot): { cell: number; ox: number; oy: number } {
        const cell = CELL;
        return {
            cell,
            ox: (-snapshot.width * cell) / 2,
            oy: (snapshot.height * cell) / 2,
        };
    }

    /** 仅绘制元件（须在 BeamView.render 之后调用） */
    renderPiecesOverlay(snapshot: OpticalBoardSnapshot): void {
        const g = this._ensurePieceGraphics();
        if (!g) {
            return;
        }
        g.clear();
        const { cell, ox, oy } = this._cellLayout(snapshot);
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
    }

    render(snapshot: OpticalBoardSnapshot): void {
        const g = this._ensureGraphics();
        if (!g) {
            return;
        }
        g.clear();
        const { cell, ox, oy } = this._cellLayout(snapshot);

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

        const { x: px, y: py } = snapshot.player;
        g.fillColor = new Color(120, 210, 255, 255);
        g.rect(ox + px * cell + 8, oy - (py + 1) * cell + 8, cell - 16, cell - 16);
        g.fill();
    }
}
