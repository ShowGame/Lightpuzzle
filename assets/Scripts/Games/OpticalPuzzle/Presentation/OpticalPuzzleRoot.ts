import { _decorator, Component, director, find, Node, UITransform, Vec3 } from 'cc';
import { DataManager } from '../../../Manager/DataManager';
import { ToastManager } from '../../../Manager/ToastManager';
import { AUDIO_EFFECT_ENUM, EVENT_ENUM } from '../../../Utils/Enum';
import { OPTICAL_PUZZLE, PLAY_AUDIO, SHOW_TOAST } from '../../../Utils/Event';
import {
    OpticalPuzzleSession,
    type OpticalSessionNotifyReason,
    type OpticalSnapshotNotify,
} from '../Application/OpticalPuzzleSession';
import { getOpticalLevelById } from '../Config/OpticalPuzzleLevels';
import { DEV_LEVEL_MINIMAL } from '../Config/OpticalPuzzleLevelSchema';
import { OpticalPuzzleBeamView } from './OpticalPuzzleBeamView';
import { OpticalPuzzleBoardView } from './OpticalPuzzleBoardView';
import { OpticalPuzzleInputHud } from './OpticalPuzzleInputHud';
import { computePlayLayerPosition, computePlayLayerScale } from './OpticalPuzzleLayout';
import {
    OpticalPuzzleWinPanelNextLevelButtonView,
    resolveWinPanelNextLevelNode,
} from './OpticalPuzzleWinPanelNextLevelButtonView';
import {
    resolveWinPanelNode,
    resolveWinPanelWindsNode,
} from './OpticalPuzzleWinPanelWindsView';

const { ccclass, property } = _decorator;

/** SHOW_TOAST 事件载荷（与 ToastManager.show 入参一致） */
interface ToastShowPayload {
    message: string;
    bgWidth?: number;
    localY?: number;
}

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

    /** 缩放后棋盘顶边距 Canvas 顶边（设计像素） */
    @property
    playAreaTopMargin = 125;

    private readonly _session = new OpticalPuzzleSession();

    protected onLoad(): void {
        DataManager.instance.init();

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
        SHOW_TOAST.on(EVENT_ENUM.SHOW_TOAST, this._onShowToast, this);

        if (this.inputHud) {
            this.inputHud.setup(this._session, this.boardView ?? undefined);
        } else {
            console.warn('[OpticalPuzzleRoot] 未绑定 OpticalPuzzleInputHud');
        }

        this.reloadCurrentLevel();
    }

    /** 本局当前关卡 id（来自 Session 快照，非存档） */
    getCurrentLevelId(): number {
        return this._session.getSnapshot().levelId;
    }

    /** 按 DataManager.opticalCurrentLevelId 重载关卡（菜单进局 / 读档） */
    reloadCurrentLevel(): void {
        this.loadLevelById(DataManager.instance.opticalCurrentLevelId);
    }

    /** 按关卡 id 加载本局（局内下一关等，不写存档） */
    loadLevelById(levelId: number): void {
        const resolved = getOpticalLevelById(levelId);
        const level = resolved ?? DEV_LEVEL_MINIMAL;
        if (!resolved) {
            console.warn(`[OpticalPuzzleRoot] 未知关卡 id=${levelId}，使用 DEV_LEVEL_MINIMAL`);
        }
        this._session.loadLevel(level);
        this._applyPlayLayerLayout(level.width, level.height);
        this._setWinPanelVisible(false);
    }

    protected onDestroy(): void {
        SHOW_TOAST.off(EVENT_ENUM.SHOW_TOAST, this._onShowToast, this);
        this._session.onStateChanged = null;
        this.inputHud?.teardown();
    }

    private _resolveGameRoot(): Node | null {
        let node: Node | null = this.node;
        while (node?.parent) {
            if (node.name === 'GameRoot') {
                return node;
            }
            node = node.parent;
        }
        return null;
    }

    private _setWinPanelVisible(visible: boolean): void {
        const panel = resolveWinPanelNode(this._resolveGameRoot());
        if (panel?.isValid) {
            panel.active = visible;
        }
    }

    private _showWinPanel(): void {
        const gameRoot = this._resolveGameRoot();
        this._setWinPanelVisible(true);
        const nextLevelBtn = resolveWinPanelNextLevelNode(gameRoot)?.getComponent(
            OpticalPuzzleWinPanelNextLevelButtonView,
        );
        nextLevelBtn?.setLabelForLevel(this.getCurrentLevelId());
        nextLevelBtn?.refresh();
    }

    /** 转发到场景内 ToastManager，不修改 ToastManager 本身 */
    private _onShowToast(payload: ToastShowPayload): void {
        if (!payload?.message) {
            return;
        }
        const scene = director.getScene();
        const mgr = scene
            ?.getComponentsInChildren(ToastManager)
            .find((m) => m?.isValid && m.enabled);
        mgr?.show(payload.message, payload.bgWidth, payload.localY ?? 0);
    }

    private _onSessionChanged(reason: OpticalSessionNotifyReason): void {
        const snap = this._session.getSnapshot();
        const beam = this._session.getBeamSnapshot();

        if (reason === 'move') {
            PLAY_AUDIO.emit(EVENT_ENUM.PLAY_AUDIO, AUDIO_EFFECT_ENUM.OPTICAL_PLAYER_MOVE);
        }
        if (reason === 'complete') {
            PLAY_AUDIO.emit(EVENT_ENUM.PLAY_AUDIO, AUDIO_EFFECT_ENUM.OPTICAL_LEVEL_COMPLETE);
            this._showWinPanel();
        }
        if (reason === 'face') {
            this.boardView?.notifyPlayerMoveBlocked();
        } else if (reason === 'move' || reason === 'push' || reason === 'complete') {
            this.boardView?.notifyPlayerDirectionInput();
        }
        if (reason === 'load' || reason === 'reset') {
            this.boardView?.resetPlayerEyeIdle();
        }

        this.boardView?.render(snap);
        this.beamView?.render(beam);
        this.boardView?.renderTargetsOverlay(snap);
        this.boardView?.syncPlaySnapshot(snap, reason);
        this.inputHud?.refreshActionButtons();
        const notify: OpticalSnapshotNotify = {
            snapshot: snap,
            moveCount: this._session.moveCount,
            notifyReason: reason,
        };
        OPTICAL_PUZZLE.emit(EVENT_ENUM.OPTICAL_SNAPSHOT_CHANGED, notify);
    }

    /** 按关卡尺寸缩放并定位 layerPlay：宽撑满、顶边距 Canvas 顶 playAreaTopMargin */
    private _applyPlayLayerLayout(levelWidth: number, levelHeight: number): void {
        const playLayer = this._resolveLayerPlay();
        if (!playLayer?.isValid) {
            return;
        }
        const targetWidth = this._resolvePlayAreaWidth();
        const scale = computePlayLayerScale(levelWidth, targetWidth);
        playLayer.setScale(new Vec3(scale, scale, 1));

        const canvasHeight = this._resolveCanvasHeight();
        const pos = computePlayLayerPosition(
            levelHeight,
            scale,
            canvasHeight,
            this.playAreaTopMargin,
        );
        const current = playLayer.position;
        playLayer.setPosition(new Vec3(pos.x, pos.y, current.z));
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
        const canvasWidth = this._resolveCanvasSize().width;
        const padding = Math.max(0, this.playAreaWidthPadding);
        if (canvasWidth > padding) {
            return canvasWidth - padding;
        }
        return canvasWidth > 0 ? canvasWidth : 750;
    }

    /** Canvas 设计高（与宽度同为 UI 坐标系） */
    private _resolveCanvasHeight(): number {
        const h = this._resolveCanvasSize().height;
        return h > 0 ? h : 1334;
    }

    private _resolveCanvasSize(): { width: number; height: number } {
        const canvas = find('Canvas');
        const size = canvas?.getComponent(UITransform)?.contentSize;
        return {
            width: size?.width ?? 0,
            height: size?.height ?? 0,
        };
    }
}
