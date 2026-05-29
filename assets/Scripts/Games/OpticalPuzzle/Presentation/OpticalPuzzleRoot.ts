import { _decorator, Component } from 'cc';
import { DataManager } from '../../../Manager/DataManager';
import { AUDIO_EFFECT_ENUM, EVENT_ENUM } from '../../../Utils/Enum';
import { OPTICAL_PUZZLE, PLAY_AUDIO } from '../../../Utils/Event';
import { OpticalPuzzleSession, type OpticalSessionNotifyReason } from '../Application/OpticalPuzzleSession';
import { getOpticalLevelById } from '../Config/OpticalPuzzleLevels';
import { DEV_LEVEL_MINIMAL } from '../Config/OpticalPuzzleLevelSchema';
import { OpticalPuzzleBeamView } from './OpticalPuzzleBeamView';
import { OpticalPuzzleBoardView } from './OpticalPuzzleBoardView';
import { OpticalPuzzleInputHud } from './OpticalPuzzleInputHud';

const { ccclass, property } = _decorator;

/**
 * 光学解谜局内入口：创建 Session、绑定视图与输入、广播快照事件。
 * 挂到带 Canvas 的节点上，并为同节点或子节点挂上 BoardView / InputHud。
 */
@ccclass('OpticalPuzzleRoot')
export class OpticalPuzzleRoot extends Component {
    @property(OpticalPuzzleBoardView)
    boardView: OpticalPuzzleBoardView | null = null;

    @property(OpticalPuzzleBeamView)
    beamView: OpticalPuzzleBeamView | null = null;

    @property(OpticalPuzzleInputHud)
    inputHud: OpticalPuzzleInputHud | null = null;

    private readonly _session = new OpticalPuzzleSession();

    protected onLoad(): void {
        DataManager.instance.restore();

        if (!this.boardView) {
            this.boardView =
                this.getComponent(OpticalPuzzleBoardView) ??
                this.getComponentInChildren(OpticalPuzzleBoardView);
        }
        if (!this.beamView) {
            this.beamView =
                this.getComponent(OpticalPuzzleBeamView) ??
                this.getComponentInChildren(OpticalPuzzleBeamView);
        }
        if (!this.beamView) {
            const beamNode = this.node.getChildByName('BeamLayer');
            if (beamNode?.isValid) {
                this.beamView =
                    beamNode.getComponent(OpticalPuzzleBeamView) ??
                    beamNode.addComponent(OpticalPuzzleBeamView);
            }
        }
        if (!this.inputHud) {
            this.inputHud =
                this.getComponent(OpticalPuzzleInputHud) ??
                this.getComponentInChildren(OpticalPuzzleInputHud);
        }

        this._session.onStateChanged = (reason) => this._onSessionChanged(reason);

        if (this.inputHud) {
            this.inputHud.setup(this._session);
        } else {
            console.warn('[OpticalPuzzleRoot] 未绑定 OpticalPuzzleInputHud');
        }

        this.reloadCurrentLevel();
    }

    /** 按 DataManager.opticalCurrentLevelId 重载关卡（局内跳关时调用） */
    reloadCurrentLevel(): void {
        const id = DataManager.instance.opticalCurrentLevelId;
        const resolved = getOpticalLevelById(id);
        const level = resolved ?? DEV_LEVEL_MINIMAL;
        if (!resolved) {
            console.warn(`[OpticalPuzzleRoot] 未知关卡 id=${id}，使用 DEV_LEVEL_MINIMAL`);
        }
        this._session.loadLevel(level);
    }

    protected onDestroy(): void {
        this._session.onStateChanged = null;
        this.inputHud?.teardown();
    }

    private _onSessionChanged(reason: OpticalSessionNotifyReason): void {
        const snap = this._session.getSnapshot();
        const beam = this._session.getBeamSnapshot();

        if (reason === 'move') {
            PLAY_AUDIO.emit(EVENT_ENUM.PLAY_AUDIO, AUDIO_EFFECT_ENUM.OPTICAL_PLAYER_MOVE);
        }
        if (reason === 'complete') {
            PLAY_AUDIO.emit(EVENT_ENUM.PLAY_AUDIO, AUDIO_EFFECT_ENUM.OPTICAL_LEVEL_COMPLETE);
        }

        this.boardView?.render(snap);
        this.beamView?.render(beam);
        OPTICAL_PUZZLE.emit(EVENT_ENUM.OPTICAL_SNAPSHOT_CHANGED, snap);
    }
}
