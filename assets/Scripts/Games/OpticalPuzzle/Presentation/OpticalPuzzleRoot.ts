import { _decorator, Component } from 'cc';
import { DataManager } from '../../../Manager/DataManager';
import { AUDIO_EFFECT_ENUM, EVENT_ENUM } from '../../../Utils/Enum';
import { OPTICAL_PUZZLE, PLAY_AUDIO } from '../../../Utils/Event';
import { OpticalPuzzleSession, type OpticalSessionNotifyReason } from '../Application/OpticalPuzzleSession';
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
        if (!this.inputHud) {
            this.inputHud =
                this.getComponent(OpticalPuzzleInputHud) ??
                this.getComponentInChildren(OpticalPuzzleInputHud);
        }

        this._session.onStateChanged = (reason) => this._onSessionChanged(reason);
        this._session.startWithDevLevel();

        if (this.inputHud) {
            this.inputHud.setup(this._session);
        } else {
            console.warn('[OpticalPuzzleRoot] 未绑定 OpticalPuzzleInputHud');
        }
    }

    protected onDestroy(): void {
        this._session.onStateChanged = null;
        this.inputHud?.teardown();
    }

    private _onSessionChanged(reason: OpticalSessionNotifyReason): void {
        const snap = this._session.getSnapshot();
        if (reason === 'move') {
            PLAY_AUDIO.emit(EVENT_ENUM.PLAY_AUDIO, AUDIO_EFFECT_ENUM.OPTICAL_PLAYER_MOVE);
        }

        this.boardView?.render(snap);
        OPTICAL_PUZZLE.emit(EVENT_ENUM.OPTICAL_SNAPSHOT_CHANGED, snap);
    }
}
