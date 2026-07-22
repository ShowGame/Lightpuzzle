import { DEV_LEVEL_MINIMAL, type IOpticalLevelConfig } from '../Config/OpticalPuzzleLevelSchema';
import { OpticalPuzzleCore, type OpticalPlayStateSnapshot } from '../Core/OpticalPuzzleCore';
import type { OpticalBeamSnapshot } from '../Core/OpticalPuzzleCore';
import { Direction, MoveAttemptResult, type OpticalBoardSnapshot } from '../Core/OpticalPuzzleTypes';

/** OPTICAL_SNAPSHOT_CHANGED 载荷：棋盘快照 + 本局移动步数 + 触发原因 */
export interface OpticalSnapshotNotify {
    snapshot: OpticalBoardSnapshot;
    moveCount: number;
    notifyReason?: OpticalSessionNotifyReason;
}
import { AUDIO_EFFECT_ENUM, EVENT_ENUM } from '../../../Utils/Enum';
import { PLAY_AUDIO, SHOW_TOAST } from '../../../Utils/Event';
import { OpticalGameFlowState } from './OpticalPuzzleStateMachine';

const UNDO_STEPS = 1;
/** 撤回键图标横向耗尽阶段：0 满 → 3 空（每按一次 +1，各减 33% 右缘填充） */
export const UNDO_ICON_FILL_STAGES = 3;

export type OpticalSessionNotifyReason = 'load' | 'move' | 'face' | 'push' | 'undo' | 'reset' | 'complete';

/** 已在初始状态时撤回/重开的 Toast 参数 */
const INITIAL_STATE_TOAST = {
    message: '已在初始状态',
    bgWidth: 360,
    localY: -250,
} as const;

/**
 * 关卡会话：加载配置、维护历史栈、撤回、重置。
 * 不依赖场景节点。
 */
export class OpticalPuzzleSession {
    readonly core = new OpticalPuzzleCore();

    private _level: IOpticalLevelConfig | null = null;
    private _history: OpticalPlayStateSnapshot[] = [];
    private _flow: OpticalGameFlowState = OpticalGameFlowState.BOOT;
    /** 撤回键图标填充阶段 0～UNDO_ICON_FILL_STAGES */
    private _undoFillStage = 0;
    /** 本局有效移动步数（成功移动/推箱 +1，撤回 -1，重开/开局 0） */
    private _moveCount = 0;
    /** 本局已观看激励视频解锁参考解的关卡 id（换关清零；重开本关不清） */
    private _answerUnlockedLevelId = -1;

    /** Presentation 订阅；参数用于区分移动 / 撤回 / 重置等（音效与埋点） */
    onStateChanged: ((reason: OpticalSessionNotifyReason) => void) | null = null;

    get flowState(): OpticalGameFlowState {
        return this._flow;
    }

    /** 撤回键图标填充阶段（0 全填，3 不填） */
    get undoFillStage(): number {
        return this._undoFillStage;
    }

    /** 本局已消耗移动步数 */
    get moveCount(): number {
        return this._moveCount;
    }

    /** 是否存在可撤回的有效操作（玩家或元件相对上一检查点有变化） */
    canUndo(): boolean {
        return this._flow === OpticalGameFlowState.RUNNING && this._history.length > 1;
    }

    /** 局内进行中且相对开局无任何操作记录 */
    isAtInitialPlayState(): boolean {
        return this._flow === OpticalGameFlowState.RUNNING && this._history.length <= 1;
    }

    private _emitInitialStateToast(): void {
        SHOW_TOAST.emit(EVENT_ENUM.SHOW_TOAST, { ...INITIAL_STATE_TOAST });
    }

    /** 撤回键按下：图标右缘按 33% 递进清空（仅在实际撤回成功时调用） */
    registerUndoButtonPress(): void {
        if (this._undoFillStage < UNDO_ICON_FILL_STAGES) {
            this._undoFillStage += 1;
        }
    }

    /** 图标填充已耗尽（stage=3），再按撤回应走激励广告 */
    isUndoIconFillExhausted(): boolean {
        return this._undoFillStage >= UNDO_ICON_FILL_STAGES;
    }

    /** 激励广告完整观看后：恢复撤回图标满填，可再按三次 */
    restoreUndoFillFromRewardedAd(): void {
        this._resetUndoFillStage();
    }

    private _resetUndoFillStage(): void {
        this._undoFillStage = 0;
    }

    /** 使用内置开发关启动（可改为 loadLevel(cfg)） */
    startWithDevLevel(): void {
        this.loadLevel(DEV_LEVEL_MINIMAL);
    }

    loadLevel(level: IOpticalLevelConfig): void {
        const prevLevelId = this._level?.levelId ?? -1;
        this._level = level;
        if (prevLevelId !== level.levelId) {
            this._answerUnlockedLevelId = -1;
        }
        this.core.reset(level);
        this._history.length = 0;
        this._resetUndoFillStage();
        this._moveCount = 0;
        this._pushHistory();
        this._flow = OpticalGameFlowState.RUNNING;
        this._emit('load');
    }

    getSnapshot(): OpticalBoardSnapshot {
        return this.core.getSnapshot();
    }

    getBeamSnapshot(): OpticalBeamSnapshot {
        return this.core.getBeamSnapshot();
    }

    /** 本关参考解是否已在本局通过激励视频解锁 */
    isAnswerUnlocked(): boolean {
        return this._level != null && this._answerUnlockedLevelId === this._level.levelId;
    }

    /** 激励视频完整观看后解锁本关参考解（仅本局有效） */
    unlockAnswerForCurrentLevel(): void {
        this._answerUnlockedLevelId = this._level?.levelId ?? -1;
    }

    /** 四向按钮 / 键盘入口；非 RUNNING 时返回 null */
    applyDirection(dir: Direction): MoveAttemptResult | null {
        if (this._flow !== OpticalGameFlowState.RUNNING) {
            return null;
        }
        this.core.setPlayerFacing(dir);
        const prevTargetLit = this.core.getSnapshot().targets.map((t) => t.lit);
        const r = this.core.tryMove(dir);
        if (r === MoveAttemptResult.Blocked) {
            // 与 BoardView「><」阻拦表情（reason=face）同一条件：凡 Blocked 即失败反馈
            PLAY_AUDIO.emit(EVENT_ENUM.PLAY_AUDIO, AUDIO_EFFECT_ENUM.OPTICAL_MOVE_FAIL);
            this._emit('face');
            return r;
        }
        if (r === MoveAttemptResult.PlayerMoved || r === MoveAttemptResult.PiecePushed) {
            this._moveCount += 1;
            this._pushHistory();
            this._emitMoveSuccessSounds(prevTargetLit);
            if (this.core.isAllTargetsLit()) {
                this._flow = OpticalGameFlowState.SETTLEMENT;
                this._emit('complete');
            } else if (r === MoveAttemptResult.PiecePushed) {
                this._emit('push');
            } else {
                this._emit('move');
            }
        }
        return r;
    }

    /** 本步有新亮灯时播放点亮音 */
    private _emitMoveSuccessSounds(prevLit: boolean[]): void {
        if (!this._hasNewlyLitTarget(prevLit)) {
            return;
        }
        PLAY_AUDIO.emit(EVENT_ENUM.PLAY_AUDIO, AUDIO_EFFECT_ENUM.OPTICAL_TARGET_LIT);
    }

    private _hasNewlyLitTarget(prevLit: boolean[]): boolean {
        const targets = this.core.getSnapshot().targets;
        for (let i = 0; i < targets.length; i++) {
            if (targets[i].lit && !prevLit[i]) {
                return true;
            }
        }
        return false;
    }

    /** 撤回：撤销 UNDO_STEPS 步有效操作（当前为 1 步）；无可撤回步时弹 Toast 并返回 false */
    undoBatch(): boolean {
        if (!this.canUndo()) {
            if (this.isAtInitialPlayState()) {
                this._emitInitialStateToast();
            }
            return false;
        }
        const pops = Math.min(UNDO_STEPS, this._history.length - 1);
        for (let i = 0; i < pops; i++) {
            this._history.pop();
        }
        const snap = this._history[this._history.length - 1];
        this.core.restorePlayState(snap);
        this._moveCount = Math.max(0, this._moveCount - pops);
        this._emit('undo');
        return true;
    }

    resetLevel(): void {
        if (!this._level) {
            return;
        }
        if (this.isAtInitialPlayState()) {
            this._emitInitialStateToast();
            return;
        }
        this.core.reset(this._level);
        this._history.length = 0;
        this._resetUndoFillStage();
        this._moveCount = 0;
        this._pushHistory();
        this._flow = OpticalGameFlowState.RUNNING;
        this._emit('reset');
    }

    private _pushHistory(): void {
        this._history.push(this.core.clonePlayState());
    }

    private _emit(reason: OpticalSessionNotifyReason): void {
        this.onStateChanged?.(reason);
    }
}
