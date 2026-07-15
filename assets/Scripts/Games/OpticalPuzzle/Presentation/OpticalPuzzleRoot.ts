import { _decorator, Component, director, find, Node, SpriteFrame, UITransform, Vec3 } from 'cc';
import {
    RECORD_REPLAY_ACTIVE_SCRIPT,
    RECORD_REPLAY_ENABLED,
    RECORD_REPLAY_SCRIPTS,
    RECORD_REPLAY_WIN_PRE_PANEL_DELAY_SEC,
} from '../../../Config/OpticalRecordReplayConfig';
import { DataManager } from '../../../Manager/DataManager';
import { ToastManager } from '../../../Manager/ToastManager';
import { AUDIO_EFFECT_ENUM, EVENT_ENUM } from '../../../Utils/Enum';
import { OPTICAL_PUZZLE, PLAY_AUDIO, SHOW_TOAST } from '../../../Utils/Event';
import { OpticalGameFlowState } from '../Application/OpticalPuzzleStateMachine';
import {
    OpticalPuzzleSession,
    type OpticalSessionNotifyReason,
    type OpticalSnapshotNotify,
} from '../Application/OpticalPuzzleSession';
import { getOpticalLevelById } from '../Config/OpticalPuzzleLevels';
import { DEV_LEVEL_MINIMAL } from '../Config/OpticalPuzzleLevelSchema';
import type { OpticalBeamSnapshot } from '../Core/OpticalPuzzleCore';
import { OpticalPuzzleBeamView } from './OpticalPuzzleBeamView';
import { OpticalPuzzleBoardView } from './OpticalPuzzleBoardView';
import { OpticalPuzzleInputHud } from './OpticalPuzzleInputHud';
import { computePlayLayerPosition, computePlayLayerScale, opticalBoardLayout, syncOpticalPlayBoardLayers } from './OpticalPuzzleLayout';
import {
    consumeShareEntryLevelId,
    setWeChatShareContext,
    setWeChatShareEntryRouteHandler,
} from '../../../Utils/WeChatShare';
import {
    OpticalPuzzleWinPanelNextLevelButtonView,
    resolveWinPanelNextLevelNode,
} from './OpticalPuzzleWinPanelNextLevelButtonView';
import {
    resolvePreWinPanelNode,
    resolveWinPanelNode,
    resolveWinPanelWindsNode,
} from './OpticalPuzzleWinPanelWindsView';

const { ccclass, property } = _decorator;

/** 通关后先挡输入，再展示 winPanel 的等待时长（秒） */
const PRE_WIN_PANEL_DELAY_SEC = 0.75;

/** 阻挡点粒子视图（按 ccclass 名运行时解析，避免与 Root 强耦合） */
interface IBeamImpactView {
    render(snapshot: OpticalBeamSnapshot): void;
    applyExternalSparkSpriteFrames?(frames: ReadonlyArray<SpriteFrame>): void;
    setVisualScale?(scale: number): void;
}

const BEAM_IMPACT_VIEW_CLASS = 'OpticalPuzzleBeamImpactView';

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

    /** 构建保活：七色 beam_spark SpriteFrame，微信端依赖贴图烘焙色（非顶点色） */
    @property({ type: [SpriteFrame], tooltip: 'Sprites/OpticalFX 下 beam_spark 七色' })
    beamSparkKeepAlive: SpriteFrame[] = [];

    private readonly _session = new OpticalPuzzleSession();
    private _beamImpactView: IBeamImpactView | null = null;
    /** 录屏自动回放：自动化进行中（隐藏通关面板等） */
    private _recordReplayMode = false;
    /** 录屏自动回放：通关时不弹 winPanel、不写存档 */
    private _suppressWinOnComplete = false;

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
        this._resolveBeamImpactView();
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

        this._wireTeachScene2Presentation();

        setWeChatShareEntryRouteHandler((levelId) => this.enterFromShareLink(levelId));

        const shareLevelId = consumeShareEntryLevelId();
        if (shareLevelId != null) {
            DataManager.instance.applyShareLinkEntry(shareLevelId);
            this.loadLevelById(shareLevelId);
        } else if (RECORD_REPLAY_ENABLED) {
            const firstSeg = RECORD_REPLAY_SCRIPTS[RECORD_REPLAY_ACTIVE_SCRIPT]?.[0];
            this.loadLevelById(firstSeg?.levelId ?? DataManager.instance.opticalCurrentLevelId);
        } else {
            this.reloadCurrentLevel();
        }

        if (RECORD_REPLAY_ENABLED && !this.getComponent('OpticalPuzzleRecordReplayer')) {
            this.addComponent('OpticalPuzzleRecordReplayer');
        }
    }

    /** 录屏自动回放模式（由 OpticalPuzzleRecordReplayer 开关） */
    setRecordReplayMode(active: boolean): void {
        this._recordReplayMode = active;
        if (active) {
            this._cancelWinRevealSchedule();
            this._setPreWinPanelVisible(false);
            this._setWinPanelVisible(false);
        }
    }

    /** 录屏段内是否抑制通关 UI / 存档（showWinPanel 段须为 false） */
    setRecordReplaySuppressWin(suppress: boolean): void {
        this._suppressWinOnComplete = suppress;
    }

    isRecordReplayMode(): boolean {
        return this._recordReplayMode;
    }

    /** 局内 Session（录屏回放等开发工具使用） */
    getSession(): OpticalPuzzleSession {
        return this._session;
    }

    /** 分享链接热启动：解锁占位 + 加载对应关（不写 opticalCurrentLevelId） */
    enterFromShareLink(levelId: number): void {
        DataManager.instance.applyShareLinkEntry(levelId);
        this.loadLevelById(levelId);
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
        setWeChatShareContext(resolved ? level.levelId : null);
        this._applyPlayLayerLayout(level.width, level.height);
        this._session.loadLevel(level);
        this._cancelWinRevealSchedule();
        this._setPreWinPanelVisible(false);
        this._setWinPanelVisible(false);
    }

    protected onDestroy(): void {
        setWeChatShareEntryRouteHandler(null);
        setWeChatShareContext(null);
        SHOW_TOAST.off(EVENT_ENUM.SHOW_TOAST, this._onShowToast, this);
        this._cancelWinRevealSchedule();
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

    private _setPreWinPanelVisible(visible: boolean): void {
        const panel = resolvePreWinPanelNode(this._resolveGameRoot());
        if (!panel?.isValid) {
            if (visible) {
                console.warn('[OpticalPuzzleRoot] layerOverlay/preWinPanel 未找到，无法挡通关前输入');
            }
            return;
        }
        if (visible) {
            const overlay = panel.parent;
            if (overlay?.isValid) {
                panel.setSiblingIndex(overlay.children.length - 1);
            }
        }
        panel.active = visible;
    }

    private _cancelWinRevealSchedule(): void {
        this.unschedule(this._revealWinPanelAfterPreWin);
    }

    /** 通关：先 preWinPanel 挡输入，延迟后再展示 winPanel 并播通关音 */
    private _beginWinRevealSequence(): void {
        this._setWinPanelVisible(false);
        this._setPreWinPanelVisible(true);
        this._cancelWinRevealSchedule();
        const preWinDelay = this._recordReplayMode
            ? RECORD_REPLAY_WIN_PRE_PANEL_DELAY_SEC
            : PRE_WIN_PANEL_DELAY_SEC;
        this.scheduleOnce(this._revealWinPanelAfterPreWin, preWinDelay);
    }

    private _revealWinPanelAfterPreWin = (): void => {
        this._setPreWinPanelVisible(false);
        this._showWinPanel();
    };

    private _showWinPanel(): void {
        const gameRoot = this._resolveGameRoot();
        this._setWinPanelVisible(true);
        PLAY_AUDIO.emit(EVENT_ENUM.PLAY_AUDIO, AUDIO_EFFECT_ENUM.OPTICAL_LEVEL_COMPLETE);
        // winPanel 默认 inactive，子组件 onLoad 晚于 complete 事件；展示后补发一次同步步数/星级
        this._replayWinPanelSnapshotNotify();
        const nextLevelBtn = resolveWinPanelNextLevelNode(gameRoot)?.getComponent(
            OpticalPuzzleWinPanelNextLevelButtonView,
        );
        nextLevelBtn?.setLabelForLevel(this.getCurrentLevelId());
        nextLevelBtn?.refresh();
    }

    /** winPanel 首次激活时其监听尚未注册，需用最近一次通关快照刷新 winds 内 UI */
    private _replayWinPanelSnapshotNotify(): void {
        if (this._session.flowState !== OpticalGameFlowState.SETTLEMENT) {
            return;
        }
        const notify: OpticalSnapshotNotify = {
            snapshot: this._session.getSnapshot(),
            moveCount: this._session.moveCount,
            notifyReason: 'complete',
        };
        OPTICAL_PUZZLE.emit(EVENT_ENUM.OPTICAL_SNAPSHOT_CHANGED, notify);
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

    private _renderBeamFromSession(): void {
        const beam = this._session.getBeamSnapshot();
        this.beamView?.render(beam);
        this._beamImpactView?.render(beam);
    }

    /** 教学第二幕：演示态光路与目标灯（结束演示时 onRestore 恢复 Session 态） */
    private _wireTeachScene2Presentation(): void {
        this.boardView?.setTeachScene2PresentationHooks({
            onPresent: (snap, beam) => {
                this.beamView?.render(beam);
                this._beamImpactView?.render(beam);
                this.boardView?.renderTargetsOverlay(snap);
            },
            onRestore: () => {
                const snap = this._session.getSnapshot();
                this._renderBeamFromSession();
                this.boardView?.renderTargetsOverlay(snap);
                this.boardView?.renderPiecesOverlay(snap);
            },
        });
    }

    private _onSessionChanged(reason: OpticalSessionNotifyReason): void {
        const snap = this._session.getSnapshot();

        if (reason === 'complete') {
            if (!this._suppressWinOnComplete) {
                DataManager.instance.recordOpticalLevelClear(
                    this.getCurrentLevelId(),
                    this._session.moveCount,
                );
                this._beginWinRevealSequence();
            }
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
        this._renderBeamFromSession();
        this.boardView?.renderTargetsOverlay(snap);
        this.boardView?.syncPlaySnapshot(snap, reason);
        if (reason === 'load' || reason === 'reset') {
            this.inputHud?.refreshTeachAct(true);
        }
        this.inputHud?.refreshActionButtons();
        const notify: OpticalSnapshotNotify = {
            snapshot: snap,
            moveCount: this._session.moveCount,
            notifyReason: reason,
        };
        OPTICAL_PUZZLE.emit(EVENT_ENUM.OPTICAL_SNAPSHOT_CHANGED, notify);
    }

    private _resolveBeamImpactView(): void {
        if (this._beamImpactView) {
            this._syncBeamSparkKeepAlive(this._beamImpactView);
            return;
        }
        const playRoot = this.boardView?.node.parent ?? this.node;
        let impactLayer = playRoot.getChildByName('BeamImpactLayer');
        if (!impactLayer?.isValid) {
            impactLayer = new Node('BeamImpactLayer');
            playRoot.addChild(impactLayer);
            impactLayer.addComponent(UITransform);
            const beamLayer = playRoot.getChildByName('BeamLayer');
            if (beamLayer?.isValid) {
                impactLayer.setSiblingIndex(beamLayer.getSiblingIndex() + 1);
            }
        }
        const onImpact =
            impactLayer.getComponent(BEAM_IMPACT_VIEW_CLASS) ??
            impactLayer.addComponent(BEAM_IMPACT_VIEW_CLASS);
        this._beamImpactView = onImpact as unknown as IBeamImpactView;
        this._syncBeamSparkKeepAlive(this._beamImpactView);
    }

    private _syncBeamSparkKeepAlive(view: IBeamImpactView | null): void {
        if (!view?.applyExternalSparkSpriteFrames) {
            return;
        }
        if (this.beamSparkKeepAlive.length === 0) {
            console.warn('[OpticalPuzzleRoot] beamSparkKeepAlive 未绑定，微信包可能缺少 beam_spark 贴图');
            return;
        }
        view.applyExternalSparkSpriteFrames(this.beamSparkKeepAlive);
    }

    /** 按关卡尺寸缩放并定位 layerPlay：宽撑满屏宽；高超过屏宽时同步压缩 */
    private _applyPlayLayerLayout(levelWidth: number, levelHeight: number): void {
        const playLayer = this._resolveLayerPlay();
        if (!playLayer?.isValid) {
            return;
        }
        const scaleRoot = this.boardView?.node.parent ?? this.node;
        const targetWidth = this._resolvePlayAreaWidth();
        const scale = computePlayLayerScale(levelWidth, levelHeight, targetWidth);
        const boardLayout = opticalBoardLayout(levelWidth, levelHeight);

        // 与参考解一致：缩放落在棋盘容器（OpticalPuzzle），layerPlay 仅负责位移
        scaleRoot.setScale(new Vec3(scale, scale, 1));
        playLayer.setScale(new Vec3(1, 1, 1));
        syncOpticalPlayBoardLayers(scaleRoot, boardLayout);
        this._beamImpactView?.setVisualScale?.(scale);

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
