import { _decorator, Component, find, Node, UITransform, Vec3 } from 'cc';
import { DataManager } from '../../../Manager/DataManager';
import { AUDIO_EFFECT_ENUM, EVENT_ENUM } from '../../../Utils/Enum';
import { OPTICAL_PUZZLE, PLAY_AUDIO } from '../../../Utils/Event';
import { OpticalPuzzleSession, type OpticalSessionNotifyReason } from '../Application/OpticalPuzzleSession';
import { getOpticalLevelById } from '../Config/OpticalPuzzleLevels';
import { DEV_LEVEL_MINIMAL } from '../Config/OpticalPuzzleLevelSchema';
import { OpticalPuzzleBeamView } from './OpticalPuzzleBeamView';
import { OpticalPuzzleBoardView } from './OpticalPuzzleBoardView';
import { OpticalPuzzleInputHud } from './OpticalPuzzleInputHud';
import { computePlayLayerScale } from './OpticalPuzzleLayout';

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

    /** 玩法区容器（默认向上查找名为 layerPlay 的父节点） */
    @property(Node)
    layerPlay: Node | null = null;

    /** 棋盘左右留白（设计像素，从 Canvas 可用宽中扣除） */
    @property
    playAreaWidthPadding = 0;

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
        this._applyPlayLayerScale(level.width);
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
        if (reason === 'move' || reason === 'face' || reason === 'push') {
            this.boardView?.notifyPlayerDirectionInput();
        }
        if (reason === 'load' || reason === 'reset') {
            this.boardView?.resetPlayerEyeIdle();
        }

        this.boardView?.render(snap);
        this.beamView?.render(beam);
        this.boardView?.renderTargetsOverlay(snap);
        this.boardView?.renderPiecesOverlay(snap);
        OPTICAL_PUZZLE.emit(EVENT_ENUM.OPTICAL_SNAPSHOT_CHANGED, snap);
    }

    /** 按关卡 width 缩放 layerPlay，使棋盘宽撑满 Canvas 可用宽度 */
    private _applyPlayLayerScale(levelWidth: number): void {
        const playLayer = this._resolveLayerPlay();
        if (!playLayer?.isValid) {
            return;
        }
        const targetWidth = this._resolvePlayAreaWidth();
        const scale = computePlayLayerScale(levelWidth, targetWidth);
        playLayer.setScale(new Vec3(scale, scale, 1));
    }

    private _resolveLayerPlay(): Node | null {
        if (this.layerPlay?.isValid) {
            return this.layerPlay;
        }
        let node: Node | null = this.node;
        while (node) {
            if (node.name === 'layerPlay') {
                return node;
            }
            node = node.parent;
        }
        return this.node.parent;
    }

    /** Canvas 设计宽（Widget 拉伸后即为当前屏宽坐标） */
    private _resolvePlayAreaWidth(): number {
        const canvas = find('Canvas');
        const canvasWidth = canvas?.getComponent(UITransform)?.contentSize.width ?? 0;
        const padding = Math.max(0, this.playAreaWidthPadding);
        if (canvasWidth > padding) {
            return canvasWidth - padding;
        }
        return canvasWidth > 0 ? canvasWidth : 750;
    }
}
