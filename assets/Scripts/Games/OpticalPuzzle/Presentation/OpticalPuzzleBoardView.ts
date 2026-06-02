import {
    _decorator,
    Color,
    Component,
    Graphics,
    Node,
    UITransform,
} from 'cc';
import type { OpticalBoardSnapshot } from '../Core/OpticalPuzzleTypes';
import { Direction, TerrainKind } from '../Core/OpticalPuzzleTypes';
import { drawConnectivityGlyph } from './OpticalPuzzlePieceGlyph';
import { drawPlayerEyes } from './OpticalPuzzlePlayerGlyph';
import { drawSourceEmitter } from './OpticalPuzzleSourceGlyph';
import { drawTargetLamp } from './OpticalPuzzleTargetGlyph';
import { FLOOR_FILL, OPTICAL_CELL_SIZE } from './OpticalPuzzleLayout';
import { cellScreenRect, fillWallCell } from './OpticalPuzzleWallDraw';

const { ccclass } = _decorator;

/** 无操作多久后触发一次眨眼（秒） */
const PLAYER_IDLE_BLINK_AT = 3;
/** 无操作多久后闭眼（秒） */
const PLAYER_IDLE_CLOSE_AT = 10;
/** 眨眼 / 闭眼动画时长（秒） */
const PLAYER_BLINK_DURATION = 0.25;

/** 主角眼部闲置状态 */
enum PlayerEyeIdleState {
    /** 正常睁开，累计闲置时间 */
    Active,
    /** 3s 闲置触发的单次眨眼 */
    IdleBlinking,
    /** 3s 眨眼结束，等待 10s 闭眼（此阶段不再眨眼） */
    IdleAfterBlink,
    /** 10s 闲置，闭眼动画中 */
    Closing,
    /** 已闭眼静止 */
    Closed,
    /** 按方向键后睁眼（半时长） */
    Opening,
}

/** 棋盘占位绘制：墙/地板/光源；目标/元件/主角在光路之上单独层绘制 */
@ccclass('OpticalPuzzleBoardView')
export class OpticalPuzzleBoardView extends Component {
    private _graphics: Graphics | null = null;
    private _targetGraphics: Graphics | null = null;
    private _pieceGraphics: Graphics | null = null;
    /** 最近一次元件层快照，供眨眼动画刷新主角 */
    private _lastPiecesSnapshot: OpticalBoardSnapshot | null = null;
    private _eyeState = PlayerEyeIdleState.Active;
    /** 自上次方向输入起的闲置时长（秒） */
    private _idleTime = 0;
    /** 本段闲置是否已在 3s 触发过眨眼 */
    private _idleBlinkDone = false;
    private _animElapsed = 0;

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

    /** 光路层之上的目标层（指示灯须在光束之上才可见） */
    private _ensureTargetGraphics(): Graphics | null {
        if (this._targetGraphics?.isValid) {
            return this._targetGraphics;
        }
        const root = this.node.parent ?? this.node;
        let layer = root.getChildByName('TargetLayer');
        if (!layer) {
            layer = new Node('TargetLayer');
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
        this._targetGraphics = layer.getComponent(Graphics) ?? layer.addComponent(Graphics);
        return this._targetGraphics;
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
                const target = root.getChildByName('TargetLayer');
                const insertAfter = target ?? beam;
                layer.setSiblingIndex(insertAfter.getSiblingIndex() + 1);
            }
        }
        this._pieceGraphics = layer.getComponent(Graphics) ?? layer.addComponent(Graphics);
        return this._pieceGraphics;
    }

    private _cellLayout(snapshot: OpticalBoardSnapshot): { cell: number; ox: number; oy: number } {
        const cell = OPTICAL_CELL_SIZE;
        return {
            cell,
            ox: (-snapshot.width * cell) / 2,
            oy: (snapshot.height * cell) / 2,
        };
    }

    /** 绘制目标指示灯（须在 BeamView.render 之后调用） */
    renderTargetsOverlay(snapshot: OpticalBoardSnapshot): void {
        const g = this._ensureTargetGraphics();
        if (!g) {
            return;
        }
        g.clear();
        const { cell, ox, oy } = this._cellLayout(snapshot);
        for (const tgt of snapshot.targets) {
            const { left, bottom, size } = cellScreenRect(ox, oy, tgt.x, tgt.y, cell);
            drawTargetLamp(g, left, bottom, size, tgt.colorKey, tgt.lit);
        }
    }

    /** 当前眨眼强度：0 睁开，1 闭眼峰值 */
    private _currentBlinkAmount(): number {
        switch (this._eyeState) {
            case PlayerEyeIdleState.Active:
            case PlayerEyeIdleState.IdleAfterBlink:
                return 0;
            case PlayerEyeIdleState.IdleBlinking: {
                const p = Math.min(1, this._animElapsed / PLAYER_BLINK_DURATION);
                return Math.sin(p * Math.PI);
            }
            case PlayerEyeIdleState.Closing: {
                const p = Math.min(1, this._animElapsed / PLAYER_BLINK_DURATION);
                return Math.sin(p * Math.PI * 0.5);
            }
            case PlayerEyeIdleState.Closed:
                return 1;
            case PlayerEyeIdleState.Opening: {
                const openDur = PLAYER_BLINK_DURATION * 0.5;
                const p = Math.min(1, this._animElapsed / openDur);
                return 1 - Math.sin(p * Math.PI * 0.5);
            }
            default:
                return 0;
        }
    }

    /** 方向键 / 四向按钮：重置闲置；若已闭眼则半时长睁眼 */
    notifyPlayerDirectionInput(): void {
        const wasSleeping =
            this._eyeState === PlayerEyeIdleState.Closed ||
            this._eyeState === PlayerEyeIdleState.Closing;
        if (wasSleeping) {
            this._eyeState = PlayerEyeIdleState.Opening;
            this._animElapsed = 0;
            if (this._lastPiecesSnapshot) {
                this.renderPiecesOverlay(this._lastPiecesSnapshot);
            }
            return;
        }
        if (this._eyeState === PlayerEyeIdleState.IdleBlinking) {
            this._eyeState = PlayerEyeIdleState.Active;
            this._animElapsed = 0;
            if (this._lastPiecesSnapshot) {
                this.renderPiecesOverlay(this._lastPiecesSnapshot);
            }
        }
        this._idleTime = 0;
        this._idleBlinkDone = false;
    }

    /** 关卡加载 / 重置时恢复眼部闲置逻辑 */
    resetPlayerEyeIdle(): void {
        this._eyeState = PlayerEyeIdleState.Active;
        this._idleTime = 0;
        this._idleBlinkDone = false;
        this._animElapsed = 0;
    }

    private _tickIdleTime(dt: number): void {
        if (
            this._eyeState === PlayerEyeIdleState.Active ||
            this._eyeState === PlayerEyeIdleState.IdleAfterBlink ||
            this._eyeState === PlayerEyeIdleState.IdleBlinking ||
            this._eyeState === PlayerEyeIdleState.Closing
        ) {
            this._idleTime += dt;
        }
    }

    protected update(dt: number): void {
        if (!this._lastPiecesSnapshot) {
            return;
        }
        let needRender = false;

        this._tickIdleTime(dt);

        switch (this._eyeState) {
            case PlayerEyeIdleState.Active:
                if (this._idleTime >= PLAYER_IDLE_BLINK_AT && !this._idleBlinkDone) {
                    this._eyeState = PlayerEyeIdleState.IdleBlinking;
                    this._animElapsed = 0;
                    needRender = true;
                } else if (this._idleTime >= PLAYER_IDLE_CLOSE_AT) {
                    this._eyeState = PlayerEyeIdleState.Closing;
                    this._animElapsed = 0;
                    needRender = true;
                }
                break;
            case PlayerEyeIdleState.IdleBlinking:
                this._animElapsed += dt;
                needRender = true;
                if (this._animElapsed >= PLAYER_BLINK_DURATION) {
                    this._eyeState = PlayerEyeIdleState.IdleAfterBlink;
                    this._idleBlinkDone = true;
                    this._animElapsed = 0;
                }
                break;
            case PlayerEyeIdleState.IdleAfterBlink:
                if (this._idleTime >= PLAYER_IDLE_CLOSE_AT) {
                    this._eyeState = PlayerEyeIdleState.Closing;
                    this._animElapsed = 0;
                    needRender = true;
                }
                break;
            case PlayerEyeIdleState.Closing:
                this._animElapsed += dt;
                needRender = true;
                if (this._animElapsed >= PLAYER_BLINK_DURATION) {
                    this._eyeState = PlayerEyeIdleState.Closed;
                    this._animElapsed = 0;
                }
                break;
            case PlayerEyeIdleState.Closed:
                break;
            case PlayerEyeIdleState.Opening:
                this._animElapsed += dt;
                needRender = true;
                if (this._animElapsed >= PLAYER_BLINK_DURATION * 0.5) {
                    this._eyeState = PlayerEyeIdleState.Active;
                    this._idleTime = 0;
                    this._idleBlinkDone = false;
                    this._animElapsed = 0;
                }
                break;
            default:
                break;
        }

        if (needRender) {
            this.renderPiecesOverlay(this._lastPiecesSnapshot);
        }
    }

    /** 绘制元件与主角（须在 BeamView.render 之后调用） */
    renderPiecesOverlay(snapshot: OpticalBoardSnapshot): void {
        this._lastPiecesSnapshot = snapshot;
        const g = this._ensurePieceGraphics();
        if (!g) {
            return;
        }
        g.clear();
        const { cell, ox, oy } = this._cellLayout(snapshot);
        for (const piece of snapshot.pieces) {
            const { left, bottom, size } = cellScreenRect(ox, oy, piece.x, piece.y, cell);
            const top = bottom + size;
            drawConnectivityGlyph(
                g,
                left,
                top,
                size,
                piece.connectivity,
                piece.direction,
                piece.colorKey,
            );
        }
        const { x: px, y: py } = snapshot.player;
        const playerRect = cellScreenRect(ox, oy, px, py, cell);
        drawPlayerEyes(
            g,
            playerRect.left,
            playerRect.bottom,
            playerRect.size,
            snapshot.playerFacing ?? Direction.Left,
            this._currentBlinkAmount(),
        );
    }

    render(snapshot: OpticalBoardSnapshot): void {
        const g = this._ensureGraphics();
        if (!g) {
            return;
        }
        g.clear();
        const { cell, ox, oy } = this._cellLayout(snapshot);

        const sourceAt = new Map<string, { colorKey: string; direction: Direction }>();
        for (const s of snapshot.sources) {
            sourceAt.set(`${s.x},${s.y}`, { colorKey: s.colorKey, direction: s.direction });
        }

        for (let y = 0; y < snapshot.height; y++) {
            for (let x = 0; x < snapshot.width; x++) {
                const t = snapshot.terrain[y * snapshot.width + x];
                const { left, bottom, size } = cellScreenRect(ox, oy, x, y, cell);

                if (t === TerrainKind.Wall) {
                    fillWallCell(g, snapshot, x, y, left, bottom, size);
                    continue;
                }

                if (t === TerrainKind.Source) {
                    const src = sourceAt.get(`${x},${y}`);
                    drawSourceEmitter(
                        g,
                        left,
                        bottom,
                        size,
                        src?.colorKey,
                        src?.direction ?? Direction.Up,
                    );
                } else if (t === TerrainKind.Target) {
                    if (FLOOR_FILL.a > 0) {
                        g.fillColor = FLOOR_FILL;
                        g.rect(left, bottom, size, size);
                        g.fill();
                    }
                } else if (FLOOR_FILL.a > 0) {
                    g.fillColor = FLOOR_FILL;
                    g.rect(left, bottom, size, size);
                    g.fill();
                }
            }
        }
    }
}
