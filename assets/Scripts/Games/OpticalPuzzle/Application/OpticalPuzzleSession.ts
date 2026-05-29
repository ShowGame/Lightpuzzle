import { DEV_LEVEL_MINIMAL, type IOpticalLevelConfig } from '../Config/OpticalPuzzleLevelSchema';
import { OpticalPuzzleCore, type OpticalPlayStateSnapshot } from '../Core/OpticalPuzzleCore';
import type { OpticalBeamSnapshot } from '../Core/OpticalPuzzleCore';
import { Direction, MoveAttemptResult, type OpticalBoardSnapshot } from '../Core/OpticalPuzzleTypes';
import { AUDIO_EFFECT_ENUM, EVENT_ENUM } from '../../../Utils/Enum';
import { PLAY_AUDIO } from '../../../Utils/Event';
import { OpticalGameFlowState } from './OpticalPuzzleStateMachine';

const UNDO_BATCH = 5;

export type OpticalSessionNotifyReason = 'load' | 'move' | 'push' | 'undo' | 'reset' | 'complete';

/**
 * 关卡会话：加载配置、维护历史栈、撤回 5 步、重置。
 * 不依赖场景节点。
 */
export class OpticalPuzzleSession {
    readonly core = new OpticalPuzzleCore();

    private _level: IOpticalLevelConfig | null = null;
    private _history: OpticalPlayStateSnapshot[] = [];
    private _flow: OpticalGameFlowState = OpticalGameFlowState.BOOT;

    /** Presentation 订阅；参数用于区分移动 / 撤回 / 重置等（音效与埋点） */
    onStateChanged: ((reason: OpticalSessionNotifyReason) => void) | null = null;

    get flowState(): OpticalGameFlowState {
        return this._flow;
    }

    /** 使用内置开发关启动（可改为 loadLevel(cfg)） */
    startWithDevLevel(): void {
        this.loadLevel(DEV_LEVEL_MINIMAL);
    }

    loadLevel(level: IOpticalLevelConfig): void {
        this._level = level;
        this.core.reset(level);
        this._history.length = 0;
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

    /** 四向按钮入口 */
    applyDirection(dir: Direction): void {
        if (this._flow !== OpticalGameFlowState.RUNNING) {
            return;
        }
        const r = this.core.tryMove(dir);
        if (r === MoveAttemptResult.Blocked) {
            if (this.core.hasPieceAhead(dir)) {
                PLAY_AUDIO.emit(EVENT_ENUM.PLAY_AUDIO, AUDIO_EFFECT_ENUM.OPTICAL_PIECE_PUSH_FAIL);
            }
            return;
        }
        if (r === MoveAttemptResult.PlayerMoved || r === MoveAttemptResult.PiecePushed) {
            this._pushHistory();
            if (this.core.isAllTargetsLit()) {
                this._flow = OpticalGameFlowState.SETTLEMENT;
                this._emit('complete');
            } else if (r === MoveAttemptResult.PiecePushed) {
                PLAY_AUDIO.emit(EVENT_ENUM.PLAY_AUDIO, AUDIO_EFFECT_ENUM.OPTICAL_PIECE_PUSH_SUCCESS);
                this._emit('push');
            } else {
                this._emit('move');
            }
        }
    }

    /** 撤回按钮：最多连续撤销 UNDO_BATCH 步有效操作 */
    undoBatch(): void {
        if (this._flow !== OpticalGameFlowState.RUNNING || this._history.length <= 1) {
            return;
        }
        const pops = Math.min(UNDO_BATCH, this._history.length - 1);
        for (let i = 0; i < pops; i++) {
            this._history.pop();
        }
        const snap = this._history[this._history.length - 1];
        this.core.restorePlayState(snap);
        this._emit('undo');
    }

    resetLevel(): void {
        if (!this._level) {
            return;
        }
        this.core.reset(this._level);
        this._history.length = 0;
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
