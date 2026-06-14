import { _decorator, Component, Node, Sprite, UITransform } from 'cc';
import { DataManager } from '../../../Manager/DataManager';
import { getOpticalLevelById } from '../Config/OpticalPuzzleLevels';
import type { IOpticalLevelConfig } from '../Config/OpticalPuzzleLevelSchema';
import { DEV_LEVEL_MINIMAL } from '../Config/OpticalPuzzleLevelSchema';
import { OpticalPuzzleCore } from '../Core/OpticalPuzzleCore';
import {
    Direction,
    MoveAttemptResult,
    normalizeDirection,
} from '../Core/OpticalPuzzleTypes';
import type { OpticalSessionNotifyReason } from '../Application/OpticalPuzzleSession';
import { OpticalPuzzleBeamView } from './OpticalPuzzleBeamView';
import { OpticalPuzzleBoardView } from './OpticalPuzzleBoardView';
import {
    boardPixelHeight,
    boardPixelWidth,
    OPTICAL_CELL_SIZE,
} from './OpticalPuzzleLayout';

const { ccclass } = _decorator;

const REPLAY_ROOT_NAME = 'replayRoot';
const BOARD_LAYER_NAME = 'BoardLayer';
const BEAM_LAYER_NAME = 'BeamLayer';
const ANSWER_BOARD_PADDING = 16;
const STEP_INTERVAL_SEC = 0.5;

/** 参考解回放：按 bestSolution 逐步演示，结束后停留在通关解法 */
@ccclass('OpticalPuzzleAnswerReplayView')
export class OpticalPuzzleAnswerReplayView extends Component {
    private readonly _core = new OpticalPuzzleCore();
    private _replayRoot: Node | null = null;
    private _boardView: OpticalPuzzleBoardView | null = null;
    private _beamView: OpticalPuzzleBeamView | null = null;
    private _level: IOpticalLevelConfig | null = null;
    private _solution: readonly string[] = [];
    private _stepIndex = 0;
    private _elapsed = 0;
    private _running = false;

    /** 从初始局面重新播放参考解（answerPanel resetbtn） */
    restartFromBeginning(): void {
        if (!this._level) {
            this._startReplay();
            return;
        }
        this._restartFromInitial();
        this._running = this._solution.length > 0;
    }

    protected onLoad(): void {
        this._hidePlaceholderSplash();
        this._ensureReplayLayers();
    }

    protected onEnable(): void {
        this._startReplay();
    }

    protected onDisable(): void {
        this._stopReplay();
    }

    protected update(dt: number): void {
        if (!this._running || !this._level) {
            return;
        }
        this._elapsed += dt;
        if (this._elapsed < STEP_INTERVAL_SEC) {
            return;
        }
        this._elapsed = 0;
        if (this._stepIndex >= this._solution.length) {
            this._running = false;
            return;
        }
        const result = this._applySolutionStep(this._solution[this._stepIndex]);
        this._stepIndex += 1;
        this._renderSnapshot(this._notifyReasonForMove(result));
        if (this._stepIndex >= this._solution.length) {
            this._running = false;
        }
    }

    private _hidePlaceholderSplash(): void {
        const splash = this.node.getChildByName('SpriteSplash');
        if (splash?.isValid) {
            splash.active = false;
        }
        const sprite = this.node.getComponent(Sprite);
        if (sprite) {
            sprite.enabled = false;
        }
    }

    private _ensureReplayLayers(): void {
        let root = this.node.getChildByName(REPLAY_ROOT_NAME);
        if (!root) {
            root = new Node(REPLAY_ROOT_NAME);
            root.setParent(this.node);
        }
        this._replayRoot = root;

        let boardNode = root.getChildByName(BOARD_LAYER_NAME);
        if (!boardNode) {
            boardNode = new Node(BOARD_LAYER_NAME);
            boardNode.setParent(root);
            boardNode.addComponent(UITransform);
            boardNode.addComponent(OpticalPuzzleBoardView);
        }
        this._boardView =
            boardNode.getComponent(OpticalPuzzleBoardView) ??
            boardNode.addComponent(OpticalPuzzleBoardView);

        let beamNode = root.getChildByName(BEAM_LAYER_NAME);
        if (!beamNode) {
            beamNode = new Node(BEAM_LAYER_NAME);
            beamNode.setParent(root);
            beamNode.addComponent(UITransform);
            beamNode.addComponent(OpticalPuzzleBeamView);
        }
        this._beamView =
            beamNode.getComponent(OpticalPuzzleBeamView) ??
            beamNode.addComponent(OpticalPuzzleBeamView);
    }

    private _resolveCurrentLevel(): IOpticalLevelConfig {
        const levelId = DataManager.instance.opticalCurrentLevelId;
        return getOpticalLevelById(levelId) ?? DEV_LEVEL_MINIMAL;
    }

    private _applyBoardFit(level: IOpticalLevelConfig): void {
        const hostUt = this.node.getComponent(UITransform);
        const root = this._replayRoot;
        if (!hostUt || !root?.isValid) {
            return;
        }
        const boardW = boardPixelWidth(level.width, OPTICAL_CELL_SIZE);
        const boardH = boardPixelHeight(level.height, OPTICAL_CELL_SIZE);
        const availW = Math.max(1, hostUt.width - ANSWER_BOARD_PADDING * 2);
        const scale = availW / boardW;
        root.setScale(scale, scale, 1);
        root.setPosition(0, 0, 0);

        const boardUt =
            root.getChildByName(BOARD_LAYER_NAME)?.getComponent(UITransform) ??
            null;
        boardUt?.setContentSize(boardW, boardH);
        const beamUt = root.getChildByName(BEAM_LAYER_NAME)?.getComponent(UITransform) ?? null;
        beamUt?.setContentSize(boardW, boardH);
    }

    private _startReplay(): void {
        this._level = this._resolveCurrentLevel();
        this._solution = this._level.bestSolution?.length ? this._level.bestSolution : [];
        this._applyBoardFit(this._level);
        this._restartFromInitial();
        this._running = this._solution.length > 0;
    }

    private _stopReplay(): void {
        this._running = false;
        this._elapsed = 0;
        this._stepIndex = 0;
    }

    private _restartFromInitial(): void {
        if (!this._level) {
            return;
        }
        this._core.reset(this._level);
        this._boardView?.resetPlayerEyeIdle();
        this._stepIndex = 0;
        this._elapsed = 0;
        this._renderSnapshot('reset');
    }

    private _applySolutionStep(step: string): MoveAttemptResult {
        const dir = normalizeDirection(step, Direction.Down);
        this._core.setPlayerFacing(dir);
        return this._core.tryMove(dir);
    }

    private _notifyReasonForMove(result: MoveAttemptResult): OpticalSessionNotifyReason {
        if (result === MoveAttemptResult.PiecePushed) {
            return 'push';
        }
        if (result === MoveAttemptResult.PlayerMoved) {
            return 'move';
        }
        return 'load';
    }

    private _renderSnapshot(reason: OpticalSessionNotifyReason = 'load'): void {
        const snap = this._core.getSnapshot();
        const beam = this._core.getBeamSnapshot();
        if (reason === 'move' || reason === 'push') {
            this._boardView?.notifyPlayerDirectionInput();
        }
        this._boardView?.render(snap);
        this._beamView?.render(beam);
        this._boardView?.renderTargetsOverlay(snap);
        this._boardView?.syncPlaySnapshot(snap, reason);
    }
}

/** 为 answer 节点挂上参考解回放 */
export function ensureAnswerReplayView(answerNode: Node | null): void {
    if (!answerNode?.isValid) {
        return;
    }
    if (!answerNode.getComponent(OpticalPuzzleAnswerReplayView)) {
        answerNode.addComponent(OpticalPuzzleAnswerReplayView);
    }
}
