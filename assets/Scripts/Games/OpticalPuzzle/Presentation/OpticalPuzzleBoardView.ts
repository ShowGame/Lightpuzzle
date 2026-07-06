import {
    _decorator,
    Component,
    Graphics,
    Node,
    UITransform,
} from 'cc';
import type { OpticalSessionNotifyReason } from '../Application/OpticalPuzzleSession';
import type { OpticalTeachScene2Plan } from '../Application/OpticalTeachScene2Plan';
import type { OpticalBeamSnapshot } from '../Core/OpticalPuzzleCore';
import type { OpticalBoardSnapshot } from '../Core/OpticalPuzzleTypes';
import { Direction, TerrainKind } from '../Core/OpticalPuzzleTypes';
import { drawConnectivityGlyph } from './OpticalPuzzlePieceGlyph';
import {
    animatedSquashedCellRect,
    buildMoveAnimEntities,
    buildFailedMovePlayerEntity,
    buildTeachDemoPlayerEntity,
    MOVE_ANIM_DURATION,
    moveAnimProgress,
    TEACH_DEMO_ANIM_DURATION,
    teachDemoMoveProgress,
    type MoveAnimEntity,
    type MoveAnimState,
    type SquashedCellRect,
    type TeachDemoAnimState,
} from './OpticalPuzzleMoveAnim';
import { drawPlayerEyes } from './OpticalPuzzlePlayerGlyph';
import { drawSourceEmitter } from './OpticalPuzzleSourceGlyph';
import { drawTargetLamp } from './OpticalPuzzleTargetGlyph';
import { OPTICAL_CELL_SIZE, opticalBoardLayout, syncOpticalPlayBoardLayers } from './OpticalPuzzleLayout';
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

/** 教学第二幕：推箱点亮后停留时长（秒） */
const TEACH_SCENE2_HOLD_SEC = 1.5;

/** 教学第二幕：每次推动前停顿（秒） */
const TEACH_SCENE2_PRE_PUSH_SEC = 1;

type TeachScene2Phase = 'wait' | 'push' | 'hold';

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
    /** 第一关教学：主角沿方向演示（不改规则层状态） */
    private _teachDemoAnim: TeachDemoAnimState | null = null;
    /** 第一关教学：演示路径上 @ 的累积格坐标（左→下→右→上 四步后回起点） */
    private _teachVisualPlayer: { x: number; y: number } | null = null;
    /** 教学第二幕：左推元件循环演示 */
    private _teachScene2Active = false;
    private _teachScene2Phase: TeachScene2Phase = 'wait';
    private _teachScene2PhaseElapsed = 0;
    private _teachScene2FromSnap: OpticalBoardSnapshot | null = null;
    private _teachScene2ToSnap: OpticalBoardSnapshot | null = null;
    private _teachScene2DisplaySnap: OpticalBoardSnapshot | null = null;
    private _teachScene2BeamFrom: OpticalBeamSnapshot | null = null;
    private _teachScene2BeamTo: OpticalBeamSnapshot | null = null;
    private _teachScene2MoveAnim: MoveAnimState | null = null;
    private _onTeachScene2Present: ((snap: OpticalBoardSnapshot, beam: OpticalBeamSnapshot) => void) | null =
        null;
    private _onTeachScene2Restore: (() => void) | null = null;
    private _onTeachScene2PushStep: (() => void) | null = null;

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
        const layout = opticalBoardLayout(snapshot.width, snapshot.height, OPTICAL_CELL_SIZE);
        const playRoot = this.node.parent ?? this.node;
        syncOpticalPlayBoardLayers(playRoot, layout);
        return { cell: layout.cell, ox: layout.ox, oy: layout.oy };
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

    /** 第一关教学：@ 沿方向正常滑格（从当前演示位置再移一格，四步循环后回起点） */
    playTeachDirectionDemo(direction: Direction, snapshot?: OpticalBoardSnapshot): void {
        const snap = snapshot ?? this._settledSnapshot ?? this._lastPiecesSnapshot;
        if (!snap) {
            return;
        }
        this._finalizeTeachDemoAnimIfDone();
        const fromX = this._teachVisualPlayer?.x ?? snap.player.x;
        const fromY = this._teachVisualPlayer?.y ?? snap.player.y;
        this._teachDemoAnim = {
            elapsed: 0,
            snapshot: snap,
            entity: buildTeachDemoPlayerEntity(fromX, fromY, direction),
        };
        this.notifyPlayerDirectionInput();
        this.renderPiecesOverlay(snap);
    }

    /** 重置教学演示位（新循环 / 关闭蒙层时从关卡起点开始） */
    resetTeachVisualPosition(): void {
        this._teachVisualPlayer = null;
        this._teachDemoAnim = null;
    }

    stopTeachDirectionDemo(): void {
        this.resetTeachVisualPosition();
    }
    setTeachVisualUpperLeftOfSpawn(snapshot: OpticalBoardSnapshot): void {
        const { x, y } = snapshot.player;
        this._teachDemoAnim = null;
        this._teachVisualPlayer = { x: x - 1, y: y - 1 };
        this.renderPiecesOverlay(snapshot);
    }

    /** 绑定第二幕光路/目标刷新与结束恢复（可多次调用，仅覆盖传入字段） */
    setTeachScene2PresentationHooks(hooks: {
        onPresent?: (snap: OpticalBoardSnapshot, beam: OpticalBeamSnapshot) => void;
        onRestore?: () => void;
        onPushStep?: () => void;
    }): void {
        if (hooks.onPresent) {
            this._onTeachScene2Present = hooks.onPresent;
        }
        if (hooks.onRestore) {
            this._onTeachScene2Restore = hooks.onRestore;
        }
        if (hooks.onPushStep) {
            this._onTeachScene2PushStep = hooks.onPushStep;
        }
    }

    /** 镂空到位后：左推元件 1 → 点亮 → 停顿 → 复位，循环演示 */
    startTeachScene2PushLoop(plan: OpticalTeachScene2Plan, sessionSnap: OpticalBoardSnapshot): void {
        this.stopTeachDirectionDemo();
        this._teachVisualPlayer = null;
        this._teachScene2Active = true;
        this._teachScene2Phase = 'wait';
        this._teachScene2PhaseElapsed = 0;
        this._teachScene2MoveAnim = null;
        this._teachScene2FromSnap = this._cloneBoardSnapshot(plan.fromSnap);
        this._teachScene2ToSnap = this._cloneBoardSnapshot(plan.toSnap);
        this._teachScene2DisplaySnap = this._cloneBoardSnapshot(plan.fromSnap);
        this._teachScene2BeamFrom = plan.beamFrom;
        this._teachScene2BeamTo = plan.beamTo;
        this.notifyPlayerDirectionInput();
        this._emitTeachScene2Presentation(plan.fromSnap, plan.beamFrom);
        this.renderPiecesOverlay(sessionSnap);
    }

    stopTeachScene2PushLoop(): void {
        if (!this._teachScene2Active) {
            return;
        }
        this._teachScene2Active = false;
        this._teachScene2MoveAnim = null;
        this._teachScene2FromSnap = null;
        this._teachScene2ToSnap = null;
        this._teachScene2DisplaySnap = null;
        this._teachScene2BeamFrom = null;
        this._teachScene2BeamTo = null;
        this._teachScene2Phase = 'wait';
        this._teachScene2PhaseElapsed = 0;
        this._onTeachScene2Restore?.();
    }

    /** 关闭教学蒙层后恢复 Session 棋盘、光路与目标灯 */
    restoreSessionPresentationAfterTeach(): void {
        this._onTeachScene2Restore?.();
    }

    private _beginTeachScene2Push(): void {
        const from = this._teachScene2FromSnap;
        const to = this._teachScene2ToSnap;
        if (!from || !to || !this._teachScene2Active) {
            return;
        }
        this._teachScene2DisplaySnap = this._cloneBoardSnapshot(from);
        const entities = buildMoveAnimEntities(from, to);
        if (entities.length === 0) {
            return;
        }
        this._teachScene2MoveAnim = { elapsed: 0, snapshot: to, entities };
        this._teachScene2Phase = 'push';
        this.notifyPlayerDirectionInput();
        this._onTeachScene2PushStep?.();
    }

    private _finishTeachScene2Push(): void {
        const to = this._teachScene2ToSnap;
        const beamTo = this._teachScene2BeamTo;
        if (!to || !beamTo) {
            this._teachScene2MoveAnim = null;
            return;
        }
        this._teachScene2MoveAnim = null;
        this._teachScene2DisplaySnap = this._cloneBoardSnapshot(to);
        this._teachScene2Phase = 'hold';
        this._teachScene2PhaseElapsed = 0;
        this._emitTeachScene2Presentation(to, beamTo);
        if (this._lastPiecesSnapshot) {
            this.renderPiecesOverlay(this._lastPiecesSnapshot);
        }
    }

    private _tickTeachScene2(dt: number): void {
        if (!this._teachScene2Active || !this._teachScene2DisplaySnap) {
            return;
        }
        if (this._teachScene2Phase === 'wait') {
            this._teachScene2PhaseElapsed += dt;
            if (this._teachScene2PhaseElapsed >= TEACH_SCENE2_PRE_PUSH_SEC) {
                this._teachScene2PhaseElapsed = 0;
                this._beginTeachScene2Push();
            }
            return;
        }
        if (this._teachScene2Phase === 'hold') {
            this._teachScene2PhaseElapsed += dt;
            if (this._teachScene2PhaseElapsed >= TEACH_SCENE2_HOLD_SEC) {
                this._teachScene2PhaseElapsed = 0;
                this._teachScene2Phase = 'wait';
                const from = this._teachScene2FromSnap;
                const beamFrom = this._teachScene2BeamFrom;
                if (from && beamFrom) {
                    this._teachScene2DisplaySnap = this._cloneBoardSnapshot(from);
                    this._teachScene2MoveAnim = null;
                    this._emitTeachScene2Presentation(from, beamFrom);
                    if (this._lastPiecesSnapshot) {
                        this.renderPiecesOverlay(this._lastPiecesSnapshot);
                    }
                }
            }
            return;
        }
        if (!this._teachScene2MoveAnim) {
            return;
        }
        const wasDone = this._teachScene2MoveAnim.elapsed >= MOVE_ANIM_DURATION;
        this._teachScene2MoveAnim.elapsed += dt;
        if (!wasDone && this._teachScene2MoveAnim.elapsed >= MOVE_ANIM_DURATION) {
            this._finishTeachScene2Push();
        }
        if (this._lastPiecesSnapshot) {
            this.renderPiecesOverlay(this._lastPiecesSnapshot);
        }
    }

    private _emitTeachScene2Presentation(
        snap: OpticalBoardSnapshot,
        beam: OpticalBeamSnapshot,
    ): void {
        this._onTeachScene2Present?.(snap, beam);
    }

    private _cloneBoardSnapshot(snap: OpticalBoardSnapshot): OpticalBoardSnapshot {
        return {
            ...snap,
            terrain: snap.terrain.slice(),
            player: { ...snap.player },
            sources: snap.sources.map((s) => ({ ...s })),
            targets: snap.targets.map((t) => ({ ...t })),
            pieces: snap.pieces.map((p) => ({ ...p })),
        };
    }

    private _finalizeTeachDemoAnimIfDone(): void {
        if (!this._teachDemoAnim || this._teachDemoAnim.elapsed < TEACH_DEMO_ANIM_DURATION) {
            return;
        }
        const { entity } = this._teachDemoAnim;
        this._teachVisualPlayer = { x: entity.toX, y: entity.toY };
        this._teachDemoAnim = null;
    }

    private _commitTeachDemoArrival(): void {
        if (!this._teachDemoAnim) {
            return;
        }
        const { entity } = this._teachDemoAnim;
        this._teachVisualPlayer = { x: entity.toX, y: entity.toY };
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
        if (!this._moveAnim) {
            return;
        }
        this._settledSnapshot = this._moveAnim.snapshot;
        this._moveAnim = null;
    }

    private _animRectForEntity(
        entity: MoveAnimEntity,
        ox: number,
        oy: number,
        cell: number,
        elapsed?: number,
    ): SquashedCellRect {
        const animElapsed = elapsed ?? this._moveAnim!.elapsed;
        const progress = moveAnimProgress(animElapsed);
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

    private _teachDemoRect(ox: number, oy: number, cell: number): SquashedCellRect | null {
        if (!this._teachDemoAnim) {
            return null;
        }
        const { entity, elapsed } = this._teachDemoAnim;
        const t = teachDemoMoveProgress(elapsed, TEACH_DEMO_ANIM_DURATION);
        return animatedSquashedCellRect(
            ox,
            oy,
            cell,
            entity.fromX,
            entity.fromY,
            entity.toX,
            entity.toY,
            t,
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

    private _teachScene2PlayerAnimEntity(): MoveAnimEntity | null {
        return this._teachScene2MoveAnim?.entities.find((e) => e.kind === 'player') ?? null;
    }

    private _teachScene2PieceAnimEntity(index: number): MoveAnimEntity | null {
        return (
            this._teachScene2MoveAnim?.entities.find(
                (e) => e.kind === 'piece' && e.pieceIndex === index,
            ) ?? null
        );
    }

    private _tickIdleTime(dt: number): void {
        if (this._teachScene2Active) {
            return;
        }
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

        if (this._teachDemoAnim) {
            const wasDone = this._teachDemoAnim.elapsed >= TEACH_DEMO_ANIM_DURATION;
            this._teachDemoAnim.elapsed += dt;
            if (!wasDone && this._teachDemoAnim.elapsed >= TEACH_DEMO_ANIM_DURATION) {
                this._commitTeachDemoArrival();
            }
            needRender = true;
        }

        if (this._teachScene2Active) {
            this._tickTeachScene2(dt);
            needRender = true;
        }

        if (needRender && this._lastPiecesSnapshot) {
            this.renderPiecesOverlay(this._lastPiecesSnapshot);
        }
    }

    /** 绘制元件与主角（须在 BeamView.render 之后调用） */
    renderPiecesOverlay(snapshot: OpticalBoardSnapshot): void {
        this._lastPiecesSnapshot = snapshot;
        const displaySnap =
            this._teachScene2Active && this._teachScene2DisplaySnap
                ? this._teachScene2DisplaySnap
                : snapshot;
        const g = this._ensurePieceGraphics();
        if (!g) {
            return;
        }
        g.clear();
        const { cell, ox, oy } = this._cellLayout(displaySnap);
        const teachScene2Anim = this._teachScene2MoveAnim;
        displaySnap.pieces.forEach((piece, index) => {
            const teach2Anim = teachScene2Anim
                ? this._teachScene2PieceAnimEntity(index)
                : null;
            const anim = teach2Anim ?? this._pieceAnimEntity(index);
            if (anim) {
                const elapsed = teach2Anim
                    ? teachScene2Anim!.elapsed
                    : this._moveAnim!.elapsed;
                const rect = this._animRectForEntity(anim, ox, oy, cell, elapsed);
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

        const teach2PlayerAnim = teachScene2Anim ? this._teachScene2PlayerAnimEntity() : null;
        const playerAnim = teach2PlayerAnim ?? this._playerAnimEntity();
        const teachDemoRect =
            !playerAnim && !teach2PlayerAnim ? this._teachDemoRect(ox, oy, cell) : null;
        if (playerAnim) {
            const elapsed = teach2PlayerAnim
                ? teachScene2Anim!.elapsed
                : this._moveAnim!.elapsed;
            const rect = this._animRectForEntity(playerAnim, ox, oy, cell, elapsed);
            drawPlayerEyes(
                g,
                rect.left,
                rect.bottom,
                rect.width,
                displaySnap.playerFacing ?? Direction.Left,
                this._blockedEyes ? 0 : this._currentBlinkAmount(),
                this._blockedEyes,
                rect.height,
            );
        } else if (teachDemoRect) {
            drawPlayerEyes(
                g,
                teachDemoRect.left,
                teachDemoRect.bottom,
                teachDemoRect.width,
                this._teachDemoAnim!.entity.direction,
                this._blockedEyes ? 0 : this._currentBlinkAmount(),
                this._blockedEyes,
                teachDemoRect.height,
            );
        } else if (this._teachVisualPlayer && !this._teachScene2Active) {
            const vp = this._teachVisualPlayer;
            const playerRect = cellScreenRect(ox, oy, vp.x, vp.y, cell);
            drawPlayerEyes(
                g,
                playerRect.left,
                playerRect.bottom,
                playerRect.size,
                displaySnap.playerFacing ?? Direction.Left,
                this._blockedEyes ? 0 : this._currentBlinkAmount(),
                this._blockedEyes,
            );
        } else {
            const { x: px, y: py } = displaySnap.player;
            const playerRect = cellScreenRect(ox, oy, px, py, cell);
            drawPlayerEyes(
                g,
                playerRect.left,
                playerRect.bottom,
                playerRect.size,
                displaySnap.playerFacing ?? Direction.Left,
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
