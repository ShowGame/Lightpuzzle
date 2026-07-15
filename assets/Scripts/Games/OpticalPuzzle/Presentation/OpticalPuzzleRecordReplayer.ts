import {
    Component,
    EventKeyboard,
    Input,
    KeyCode,
    _decorator,
    director,
    input,
} from 'cc';
import {
    RECORD_REPLAY_ACTIVE_SCRIPT,
    RECORD_REPLAY_AUTO_START,
    RECORD_REPLAY_COMPLETE_HOLD_SEC,
    RECORD_REPLAY_DEMO_HOLD_SEC,
    RECORD_REPLAY_ENABLED,
    RECORD_REPLAY_HIDE_HUD,
    RECORD_REPLAY_LEVEL_HOLD_SEC,
    RECORD_REPLAY_LOOP,
    RECORD_REPLAY_SCRIPTS,
    RECORD_REPLAY_SKIP_SAVE_AND_WIN_UI,
    RECORD_REPLAY_STEP_INTERVAL_SEC,
    RECORD_REPLAY_WIN_PRE_PANEL_DELAY_SEC,
    type OpticalRecordReplaySegment,
} from '../../../Config/OpticalRecordReplayConfig';
import { DataManager } from '../../../Manager/DataManager';
import { EVENT_ENUM, SCENE_ENUM } from '../../../Utils/Enum';
import { OPTICAL_PUZZLE } from '../../../Utils/Event';
import type { OpticalSnapshotNotify } from '../Application/OpticalPuzzleSession';
import { OpticalGameFlowState } from '../Application/OpticalPuzzleStateMachine';
import { getOpticalLevelById } from '../Config/OpticalPuzzleLevels';
import { Direction, MoveAttemptResult, normalizeDirection } from '../Core/OpticalPuzzleTypes';
import type { OpticalPuzzleBoardView } from './OpticalPuzzleBoardView';
import type { OpticalPuzzleInputHud } from './OpticalPuzzleInputHud';
import { OpticalPuzzleRoot } from './OpticalPuzzleRoot';
import {
    OpticalPuzzleWinPanelNextLevelButtonView,
    resolveWinPanelNextLevelNode,
} from './OpticalPuzzleWinPanelNextLevelButtonView';

const { ccclass } = _decorator;

type ReplayPhase =
    | 'idle'
    | 'hold_before'
    | 'step_wait'
    | 'wait_anim'
    | 'hold_after'
    | 'win_panel_wait'
    | 'script_pause'
    | 'back_to_menu_wait'
    | 'done';

/**
 * 录屏自动回放：按 OpticalRecordReplayConfig 脚本自动走关，带完整滑格/光路/音效。
 * 挂到 OpticalPuzzleRoot 同节点；由 Root 在 RECORD_REPLAY_ENABLED 时自动 addComponent。
 */
@ccclass('OpticalPuzzleRecordReplayer')
export class OpticalPuzzleRecordReplayer extends Component {
    private _root: OpticalPuzzleRoot | null = null;
    private _boardView: OpticalPuzzleBoardView | null = null;
    private _inputHud: OpticalPuzzleInputHud | null = null;

    private _segments: OpticalRecordReplaySegment[] = [];
    private _segmentIndex = 0;
    private _moves: string[] = [];
    private _stepIndex = 0;

    private _phase: ReplayPhase = 'idle';
    private _elapsed = 0;
    private _running = false;
    private _paused = false;
    private _hudWasActive = true;
    /** 当前段是否为「演示段」（maxSteps 截断，不必通关） */
    private _segmentIsDemo = false;
    /** 本段因 stopOnBlocked 结束 */
    private _stoppedOnBlocked = false;
    /** 脚本内 pause:N 停留秒数 */
    private _scriptPauseSec = 0;

    private readonly _onSnapshotChanged = (notify: OpticalSnapshotNotify): void => {
        if (!this._running || this._paused) {
            return;
        }
        if (notify.notifyReason === 'complete') {
            const seg = this._currentSegment();
            if (seg?.showWinPanel) {
                this._phase = 'win_panel_wait';
                this._elapsed = 0;
                console.info('[RecordReplayer] 通关，展示 winPanel…');
                return;
            }
            this._enterHoldAfter('complete');
        }
    };

    protected onLoad(): void {
        if (!RECORD_REPLAY_ENABLED) {
            this.enabled = false;
            return;
        }
        this._root = this.getComponent(OpticalPuzzleRoot);
        if (!this._root) {
            console.error('[RecordReplayer] 未找到 OpticalPuzzleRoot');
            this.enabled = false;
            return;
        }
        this._boardView = this._root.boardView;
        this._inputHud = this._root.inputHud;
        this._segments = this._resolveScriptSegments();
        if (this._segments.length === 0) {
            console.error('[RecordReplayer] 脚本为空，请检查 OpticalRecordReplayConfig');
            this.enabled = false;
        }
    }

    protected onEnable(): void {
        if (!RECORD_REPLAY_ENABLED) {
            return;
        }
        input.on(Input.EventType.KEY_DOWN, this._onKeyDown, this);
        OPTICAL_PUZZLE.on(EVENT_ENUM.OPTICAL_SNAPSHOT_CHANGED, this._onSnapshotChanged, this);
        if (RECORD_REPLAY_AUTO_START) {
            this.scheduleOnce(() => this.startReplay(), 0.35);
        }
    }

    protected onDisable(): void {
        input.off(Input.EventType.KEY_DOWN, this._onKeyDown, this);
        OPTICAL_PUZZLE.off(EVENT_ENUM.OPTICAL_SNAPSHOT_CHANGED, this._onSnapshotChanged, this);
        this._stopReplay(false);
    }

    protected update(dt: number): void {
        if (!this._running || this._paused) {
            return;
        }
        if (this._phase === 'wait_anim') {
            if (this._boardView?.isMoveAnimating()) {
                return;
            }
            this._phase = 'step_wait';
            this._elapsed = 0;
            this._checkSegmentMovesFinished();
            return;
        }
        if (
            this._phase === 'hold_before' ||
            this._phase === 'hold_after' ||
            this._phase === 'step_wait' ||
            this._phase === 'win_panel_wait' ||
            this._phase === 'script_pause' ||
            this._phase === 'back_to_menu_wait'
        ) {
            this._elapsed += dt;
        }
        switch (this._phase) {
            case 'hold_before':
                if (this._elapsed >= this._currentHoldBeforeSec()) {
                    this._phase = 'step_wait';
                    this._elapsed = 0;
                }
                break;
            case 'step_wait':
                if (this._boardView?.isMoveAnimating()) {
                    this._phase = 'wait_anim';
                    return;
                }
                if (this._elapsed < this._currentStepIntervalSec()) {
                    return;
                }
                this._elapsed = 0;
                this._applyNextMove();
                break;
            case 'hold_after':
                if (this._elapsed >= this._currentHoldAfterSec()) {
                    this._afterSegmentHold();
                }
                break;
            case 'win_panel_wait':
                if (this._elapsed >= this._winPanelTotalWaitSec()) {
                    this._autoAdvanceAfterWinPanel();
                }
                break;
            case 'script_pause':
                if (this._elapsed >= this._scriptPauseSec) {
                    console.info(`[RecordReplayer] 脚本停顿 ${this._scriptPauseSec}s 结束`);
                    if (this._stepIndex >= this._moves.length) {
                        this._finishMoveSequence();
                    } else {
                        this._phase = 'step_wait';
                        this._elapsed = 0;
                    }
                }
                break;
            case 'back_to_menu_wait': {
                const hold = this._currentSegment()?.backToMenuAfterSec ?? 2.5;
                if (this._elapsed >= hold) {
                    console.info('[RecordReplayer] 返回 Menu');
                    director.loadScene(SCENE_ENUM.MENU);
                    this._finishAll();
                }
                break;
            }
            default:
                break;
        }
    }

    /** 手动开始/重开整条脚本 */
    startReplay(): void {
        if (!this._root || this._segments.length === 0) {
            return;
        }
        this._root.setRecordReplayMode(true);
        this._prepareHudForRecording();
        this._segmentIndex = 0;
        this._running = true;
        this._paused = false;
        this._stoppedOnBlocked = false;
        this._loadCurrentSegment();
        console.info('[RecordReplayer] 开始录屏脚本', RECORD_REPLAY_ACTIVE_SCRIPT);
    }

    private _stopReplay(restoreHud: boolean): void {
        this._running = false;
        this._paused = false;
        this._phase = 'idle';
        this._elapsed = 0;
        this._root?.setRecordReplayMode(false);
        this._root?.setRecordReplaySuppressWin(false);
        if (restoreHud) {
            this._restoreHudAfterRecording();
        }
    }

    private _resolveScriptSegments(): OpticalRecordReplaySegment[] {
        const script = RECORD_REPLAY_SCRIPTS[RECORD_REPLAY_ACTIVE_SCRIPT];
        if (!script?.length) {
            console.error(
                `[RecordReplayer] 未知脚本 "${RECORD_REPLAY_ACTIVE_SCRIPT}"，可选:`,
                Object.keys(RECORD_REPLAY_SCRIPTS).join(', '),
            );
            return [];
        }
        return [...script];
    }

    private _applySegmentRecordFlags(seg: OpticalRecordReplaySegment): void {
        const showWin = seg.showWinPanel === true;
        this._root?.setRecordReplaySuppressWin(!showWin && RECORD_REPLAY_SKIP_SAVE_AND_WIN_UI);
        if (!showWin) {
            this._root?.setRecordReplayMode(true);
        }
    }

    private _loadCurrentSegment(): void {
        const seg = this._segments[this._segmentIndex];
        if (!seg || !this._root) {
            this._finishAll();
            return;
        }
        const level = getOpticalLevelById(seg.levelId);
        if (!level) {
            console.error(`[RecordReplayer] 关卡不存在 id=${seg.levelId}`);
            this._advanceSegment();
            return;
        }
        const moves = seg.moves?.length ? [...seg.moves] : level.bestSolution ? [...level.bestSolution] : [];
        if (moves.length === 0) {
            console.error(
                `[RecordReplayer] 关卡 ${seg.levelId} 无 moves 且无 bestSolution，请先运行 gen-level-solutions`,
            );
            this._advanceSegment();
            return;
        }
        const capped =
            seg.maxSteps != null && seg.maxSteps > 0 ? moves.slice(0, seg.maxSteps) : moves;
        this._moves = capped;
        this._segmentIsDemo = capped.length < moves.length;
        this._stepIndex = 0;
        this._stoppedOnBlocked = false;
        this._applySegmentRecordFlags(seg);
        this._root.loadLevelById(seg.levelId);
        this._inputHud?.prepareForRecordReplay(RECORD_REPLAY_HIDE_HUD);
        this._phase = 'hold_before';
        this._elapsed = 0;
        const modeLabel = this._segmentIsDemo ? `演示 ${capped.length}/${moves.length} 步` : `通关 ${capped.length} 步`;
        console.info(
            `[RecordReplayer] 段 ${this._segmentIndex + 1}/${this._segments.length} 关卡 ${seg.levelId} ${modeLabel}`,
        );
    }

    /** 通关 winPanel 展示后：改存档关卡 id → 自动点「下一关」→ 进入下一段 */
    private _autoAdvanceAfterWinPanel(): void {
        const seg = this._currentSegment();
        if (!seg || !this._root) {
            this._finishAll();
            return;
        }
        const jumpId = seg.jumpToLevelId;
        if (jumpId != null) {
            DataManager.instance.opticalCurrentLevelId = jumpId;
        }
        const gameRoot = this._resolveGameRoot();
        const nextBtn = resolveWinPanelNextLevelNode(gameRoot)?.getComponent(
            OpticalPuzzleWinPanelNextLevelButtonView,
        );
        if (nextBtn) {
            nextBtn.triggerRecordReplayClick();
            console.info(
                `[RecordReplayer] 自动点下一关 → 关卡 ${DataManager.instance.opticalCurrentLevelId}`,
            );
        } else {
            console.warn('[RecordReplayer] 未找到 nextlevel 按钮，直接 loadLevel');
            if (jumpId != null) {
                this._root.loadLevelById(jumpId);
            }
        }
        this._root.setRecordReplayMode(true);
        this._segmentIndex += 1;
        if (this._segmentIndex >= this._segments.length) {
            this._finishAll();
            return;
        }
        this._prepareMovesForCurrentSegment();
    }

    /** 下一段已在「下一关」点击中加载时，只重置走子序列 */
    private _prepareMovesForCurrentSegment(): void {
        const seg = this._segments[this._segmentIndex];
        if (!seg || !this._root) {
            this._finishAll();
            return;
        }
        const level = getOpticalLevelById(seg.levelId);
        if (!level) {
            this._advanceSegment();
            return;
        }
        const moves = seg.moves?.length ? [...seg.moves] : level.bestSolution ? [...level.bestSolution] : [];
        const capped =
            seg.maxSteps != null && seg.maxSteps > 0 ? moves.slice(0, seg.maxSteps) : moves;
        this._moves = capped;
        this._segmentIsDemo = capped.length < moves.length;
        this._stepIndex = 0;
        this._stoppedOnBlocked = false;
        this._applySegmentRecordFlags(seg);
        this._inputHud?.prepareForRecordReplay(RECORD_REPLAY_HIDE_HUD);
        this._phase = 'hold_before';
        this._elapsed = 0;
        console.info(
            `[RecordReplayer] 段 ${this._segmentIndex + 1}/${this._segments.length} 关卡 ${seg.levelId} 续播`,
        );
    }

    private _winPanelTotalWaitSec(): number {
        const seg = this._currentSegment();
        return RECORD_REPLAY_WIN_PRE_PANEL_DELAY_SEC + (seg?.winPanelHoldSec ?? 2.5);
    }

    private _checkSegmentMovesFinished(): void {
        if (this._stepIndex < this._moves.length) {
            return;
        }
        const session = this._root?.getSession();
        if (session?.flowState === OpticalGameFlowState.RUNNING) {
            this._enterHoldAfter('demo');
        }
    }

    private _applyNextMove(): void {
        const session = this._root?.getSession();
        if (!session || session.flowState !== OpticalGameFlowState.RUNNING) {
            return;
        }
        if (this._stepIndex >= this._moves.length) {
            return;
        }
        const step = this._moves[this._stepIndex];
        const pauseSec = this._parseScriptPause(step);
        if (pauseSec != null) {
            this._scriptPauseSec = pauseSec;
            this._stepIndex += 1;
            this._phase = 'script_pause';
            this._elapsed = 0;
            console.info(`[RecordReplayer] 脚本停顿 ${pauseSec}s（口播）`);
            return;
        }
        if (step === 'reset') {
            const ok = this._inputHud?.applyReplayReset() ?? false;
            if (!ok) {
                return;
            }
            this._stepIndex += 1;
            this._phase = 'wait_anim';
            return;
        }
        const dir = normalizeDirection(step, Direction.Down);
        const result =
            this._inputHud?.applyReplayDirection(dir) ?? session.applyDirection(dir);
        if (result === null) {
            return;
        }
        this._stepIndex += 1;
        if (result === MoveAttemptResult.Blocked) {
            console.warn(
                `[RecordReplayer] 第 ${this._stepIndex} 步被阻挡 (${step})`,
            );
            if (this._currentSegment()?.stopOnBlocked) {
                this._stoppedOnBlocked = true;
                this._enterHoldAfter('blocked');
                return;
            }
        }
        this._phase = 'wait_anim';
    }

    private _enterHoldAfter(reason: 'demo' | 'complete' | 'blocked'): void {
        if (this._phase === 'hold_after' || this._phase === 'done') {
            return;
        }
        this._phase = 'hold_after';
        this._elapsed = 0;
        const label =
            reason === 'complete' ? '通关' : reason === 'blocked' ? '阻挡停' : '演示段结束';
        console.info(`[RecordReplayer] ${label}，停留 ${this._currentHoldAfterSec()}s`);
    }

    private _afterSegmentHold(): void {
        this._finishMoveSequence();
    }

    /** 本段走子序列结束：回 Menu 或进下一段 */
    private _finishMoveSequence(): void {
        const seg = this._currentSegment();
        if (seg?.backToMenuAfterSec != null && this._segmentIndex >= this._segments.length - 1) {
            this._phase = 'back_to_menu_wait';
            this._elapsed = 0;
            console.info(`[RecordReplayer] 段末停留 ${seg.backToMenuAfterSec}s 后回 Menu`);
            return;
        }
        this._advanceSegment();
    }

    /** 解析 pause:5 等脚本停顿令牌 */
    private _parseScriptPause(step: string): number | null {
        const m = /^pause:([\d.]+)$/.exec(step);
        if (!m) {
            return null;
        }
        const sec = parseFloat(m[1]);
        return Number.isFinite(sec) && sec > 0 ? sec : null;
    }

    private _advanceSegment(): void {
        this._segmentIndex += 1;
        if (this._segmentIndex >= this._segments.length) {
            if (RECORD_REPLAY_LOOP) {
                console.info('[RecordReplayer] 脚本播完，循环重播');
                this._segmentIndex = 0;
                this._loadCurrentSegment();
                return;
            }
            this._finishAll();
            return;
        }
        this._loadCurrentSegment();
    }

    private _finishAll(): void {
        this._phase = 'done';
        this._running = false;
        console.info('[RecordReplayer] 全部播完。按 R 重播当前段，或重新运行场景');
    }

    private _resolveGameRoot(): import('cc').Node | null {
        let node: import('cc').Node | null = this.node;
        while (node?.parent) {
            if (node.name === 'GameRoot') {
                return node;
            }
            node = node.parent;
        }
        return null;
    }

    private _currentSegment(): OpticalRecordReplaySegment | null {
        return this._segments[this._segmentIndex] ?? null;
    }

    private _currentHoldBeforeSec(): number {
        return this._currentSegment()?.holdBeforeSec ?? RECORD_REPLAY_LEVEL_HOLD_SEC;
    }

    private _currentHoldAfterSec(): number {
        const seg = this._currentSegment();
        if (seg?.holdAfterSec != null) {
            return seg.holdAfterSec;
        }
        return this._segmentIsDemo || this._stoppedOnBlocked
            ? RECORD_REPLAY_DEMO_HOLD_SEC
            : RECORD_REPLAY_COMPLETE_HOLD_SEC;
    }

    private _currentStepIntervalSec(): number {
        return this._currentSegment()?.stepIntervalSec ?? RECORD_REPLAY_STEP_INTERVAL_SEC;
    }

    private _prepareHudForRecording(): void {
        if (!this._inputHud?.node?.isValid) {
            return;
        }
        this._hudWasActive = this._inputHud.node.active;
    }

    private _restoreHudAfterRecording(): void {
        if (!this._inputHud?.node?.isValid) {
            return;
        }
        this._inputHud.node.active = this._hudWasActive;
    }

    private _restartCurrentSegment(): void {
        if (!this._root) {
            return;
        }
        this._running = true;
        this._paused = false;
        this._loadCurrentSegment();
    }

    private _onKeyDown(ev: EventKeyboard): void {
        if (!RECORD_REPLAY_ENABLED) {
            return;
        }
        switch (ev.keyCode) {
            case KeyCode.KEY_P:
                if (!this._running) {
                    this.startReplay();
                    return;
                }
                this._paused = !this._paused;
                console.info(this._paused ? '[RecordReplayer] 已暂停 (P)' : '[RecordReplayer] 继续 (P)');
                break;
            case KeyCode.KEY_R:
                this._restartCurrentSegment();
                console.info('[RecordReplayer] 重播当前段 (R)');
                break;
            case KeyCode.KEY_N:
                this._advanceSegment();
                console.info('[RecordReplayer] 下一段 (N)');
                break;
            default:
                break;
        }
    }
}
