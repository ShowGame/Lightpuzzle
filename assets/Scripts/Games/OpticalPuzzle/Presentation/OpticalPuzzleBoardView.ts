import {
    _decorator,
    Component,
    Graphics,
    Node,
    UITransform,
} from 'cc';
import type { OpticalSessionNotifyReason } from '../Application/OpticalPuzzleSession';
import type { OpticalBoardSnapshot } from '../Core/OpticalPuzzleTypes';
import { Direction, TerrainKind } from '../Core/OpticalPuzzleTypes';
import { drawConnectivityGlyph } from './OpticalPuzzlePieceGlyph';
import {
    animatedSquashedCellRect,
    buildMoveAnimEntities,
    buildFailedMovePlayerEntity,
    MOVE_ANIM_DURATION,
    moveAnimProgress,
    type MoveAnimEntity,
    type MoveAnimState,
    type SquashedCellRect,
} from './OpticalPuzzleMoveAnim';
import { drawPlayerEyes } from './OpticalPuzzlePlayerGlyph';
import { drawSourceEmitter } from './OpticalPuzzleSourceGlyph';
import { drawTargetLamp } from './OpticalPuzzleTargetGlyph';
import { OPTICAL_CELL_SIZE } from './OpticalPuzzleLayout';
import { cellScreenRect, fillBoardFloorBase, fillWallCell } from './OpticalPuzzleWallDraw';

const { ccclass } = _decorator;

/** 无操作多久后触发一次眨眼（秒） */
const PLAYER_IDLE_BLINK_AT = 4;
/** 无操作多久后闭眼（秒） */
const PLAYER_IDLE_CLOSE_AT = 10;
/** 眨眼 / 闭眼动画时长（秒） */
const PLAYER_BLINK_DURATION = 0.25;
/** 移动被阻拦时 >< 眼形保持时长（秒） */
const PLAYER_BLOCKED_EYES_DURATION = 0.35;

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
    /** 移动被阻拦：>< 眼形 */
    private _blockedEyes = false;
    private _blockedElapsed = 0;
    /** 动画结束后的棋盘快照（用于下一帧 move/push 的起点） */
    private _settledSnapshot: OpticalBoardSnapshot | null = null;
    /** 主角 / 元件滑格 + 挤压 */
    private _moveAnim: MoveAnimState | null = null;

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

    /** 任意方向操作：打破睡眠 / 打断闲置眨眼，回到 Active 以重新开始 4s→10s 周期 */
    private _wakeFromDirectionInput(): void {
        if (
            this._eyeState === PlayerEyeIdleState.Closed ||
            this._eyeState === PlayerEyeIdleState.Closing ||
            this._eyeState === PlayerEyeIdleState.Opening ||
            this._eyeState === PlayerEyeIdleState.IdleBlinking ||
            this._eyeState === PlayerEyeIdleState.IdleAfterBlink
        ) {
            this._eyeState = PlayerEyeIdleState.Active;
            this._animElapsed = 0;
        }
    }

    /** 方向键 / 四向按钮（移动成功）：重置闲置；若已闭眼则半时长睁眼；取消 >< 阻拦眼 */
    notifyPlayerDirectionInput(): void {
        if (this._blockedEyes) {
            this._clearBlockedEyes();
        }
        const wasSleeping =
            this._eyeState === PlayerEyeIdleState.Closed ||
            this._eyeState === PlayerEyeIdleState.Closing;
        if (wasSleeping) {
            this._eyeState = PlayerEyeIdleState.Opening;
            this._animElapsed = 0;
            this._idleTime = 0;
            this._idleBlinkDone = false;
            if (this._lastPiecesSnapshot) {
                this.renderPiecesOverlay(this._lastPiecesSnapshot);
            }
            return;
        }
        this._wakeFromDirectionInput();
        this._idleTime = 0;
        this._idleBlinkDone = false;
    }

    /** 移动被阻拦：>< 眼形 0.5s；期间再次阻拦则重新计时 0.5s，并打破睡眠 */
    notifyPlayerMoveBlocked(): void {
        this._wakeFromDirectionInput();
        this._idleTime = 0;
        this._idleBlinkDone = false;

        if (this._blockedEyes) {
            this._blockedElapsed = 0;
        } else {
            this._blockedEyes = true;
            this._blockedElapsed = 0;
        }

        if (this._lastPiecesSnapshot) {
            this.renderPiecesOverlay(this._lastPiecesSnapshot);
        }
    }

    private _clearBlockedEyes(): void {
        this._blockedEyes = false;
        this._blockedElapsed = 0;
    }

    private _endBlockedEyes(): void {
        this._clearBlockedEyes();
    }

    /** 关卡加载 / 重置时恢复眼部闲置逻辑 */
    resetPlayerEyeIdle(): void {
        this._clearBlockedEyes();
        this._eyeState = PlayerEyeIdleState.Active;
        this._idleTime = 0;
        this._idleBlinkDone = false;
        this._animElapsed = 0;
    }

    /** 滑格动画进行中（Presentation 输入锁） */
    isMoveAnimating(): boolean {
        return this._moveAnim !== null;
    }

    /** 根据 Session 通知更新元件层：move/push 播滑格，load/undo/reset 瞬变 */
    syncPlaySnapshot(snapshot: OpticalBoardSnapshot, reason: OpticalSessionNotifyReason): void {
        if (reason === 'load' || reason === 'reset' || reason === 'undo') {
            this._cancelMoveAnim();
            this._settledSnapshot = snapshot;
        } else if (reason === 'move' || reason === 'push' || reason === 'complete') {
            this._beginMoveAnim(snapshot);
        } else if (reason === 'face') {
            this._beginFailedMoveAnim(snapshot);
        }
        this.renderPiecesOverlay(snapshot);
    }

    private _cancelMoveAnim(): void {
        this._moveAnim = null;
    }

    private _beginMoveAnim(snapshot: OpticalBoardSnapshot): void {
        if (!this._settledSnapshot) {
            this._settledSnapshot = snapshot;
            return;
        }
        const entities = buildMoveAnimEntities(this._settledSnapshot, snapshot);
        if (entities.length === 0) {
            this._settledSnapshot = snapshot;
            return;
        }
        this._moveAnim = { elapsed: 0, snapshot, entities };
    }

    /** 推墙 / 推不动：仅主角原地挤压，元件不参与 */
    private _beginFailedMoveAnim(snapshot: OpticalBoardSnapshot): void {
        if (!this._settledSnapshot) {
            this._settledSnapshot = snapshot;
        }
        this._moveAnim = {
            elapsed: 0,
            snapshot,
            entities: [buildFailedMovePlayerEntity(snapshot)],
        };
    }

    private _finishMoveAnim(): void {
        if (this._moveAnim) {
            this._settledSnapshot = this._moveAnim.snapshot;
            this._moveAnim = null;
        }
    }

    private _animRectForEntity(
        entity: MoveAnimEntity,
        ox: number,
        oy: number,
        cell: number,
    ): SquashedCellRect {
        const progress = moveAnimProgress(this._moveAnim!.elapsed);
        return animatedSquashedCellRect(
            ox,
            oy,
            cell,
            entity.fromX,
            entity.fromY,
            entity.toX,
            entity.toY,
            progress,
            entity.direction,
        );
    }

    private _playerAnimEntity(): MoveAnimEntity | null {
        return this._moveAnim?.entities.find((e) => e.kind === 'player') ?? null;
    }

    private _pieceAnimEntity(index: number): MoveAnimEntity | null {
        return (
            this._moveAnim?.entities.find(
                (e) => e.kind === 'piece' && e.pieceIndex === index,
            ) ?? null
        );
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

        if (this._blockedEyes) {
            this._blockedElapsed += dt;
            needRender = true;
            if (this._blockedElapsed >= PLAYER_BLOCKED_EYES_DURATION) {
                this._endBlockedEyes();
            }
        }

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

        if (this._moveAnim) {
            this._moveAnim.elapsed += dt;
            needRender = true;
            if (this._moveAnim.elapsed >= MOVE_ANIM_DURATION) {
                this._finishMoveAnim();
            }
        }

        if (needRender && this._lastPiecesSnapshot) {
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
        snapshot.pieces.forEach((piece, index) => {
            const anim = this._pieceAnimEntity(index);
            if (anim) {
                const rect = this._animRectForEntity(anim, ox, oy, cell);
                drawConnectivityGlyph(
                    g,
                    rect.left,
                    rect.bottom + rect.height,
                    rect.width,
                    piece.connectivity,
                    piece.direction,
                    piece.colorKey,
                    rect.height,
                );
                return;
            }
            const { left, bottom, size } = cellScreenRect(ox, oy, piece.x, piece.y, cell);
            drawConnectivityGlyph(
                g,
                left,
                bottom + size,
                size,
                piece.connectivity,
                piece.direction,
                piece.colorKey,
            );
        });

        const playerAnim = this._playerAnimEntity();
        if (playerAnim) {
            const rect = this._animRectForEntity(playerAnim, ox, oy, cell);
            drawPlayerEyes(
                g,
                rect.left,
                rect.bottom,
                rect.width,
                snapshot.playerFacing ?? Direction.Left,
                this._blockedEyes ? 0 : this._currentBlinkAmount(),
                this._blockedEyes,
                rect.height,
            );
        } else {
            const { x: px, y: py } = snapshot.player;
            const playerRect = cellScreenRect(ox, oy, px, py, cell);
            drawPlayerEyes(
                g,
                playerRect.left,
                playerRect.bottom,
                playerRect.size,
                snapshot.playerFacing ?? Direction.Left,
                this._blockedEyes ? 0 : this._currentBlinkAmount(),
                this._blockedEyes,
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
        fillBoardFloorBase(g, snapshot.width, snapshot.height, ox, oy, cell);

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
                }
            }
        }
    }
}
