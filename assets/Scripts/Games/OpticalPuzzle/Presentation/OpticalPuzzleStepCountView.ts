import { _decorator, Component, Label, Node } from 'cc';
import { EVENT_ENUM } from '../../../Utils/Enum';
import { OPTICAL_PUZZLE } from '../../../Utils/Event';
import type { OpticalSnapshotNotify } from '../Application/OpticalPuzzleSession';

const { ccclass } = _decorator;

/** 最近一次快照事件（供 inactive 节点 onEnable 时补刷） */
let _lastSnapshotNotify: OpticalSnapshotNotify | null = null;

export function getLastOpticalSnapshotNotify(): OpticalSnapshotNotify | null {
    return _lastSnapshotNotify;
}

/** Step/StepCount：显示本局移动步数（TopBar 与 winPanel/winds/step 共用） */
@ccclass('OpticalPuzzleStepCountView')
export class OpticalPuzzleStepCountView extends Component {
    private _label: Label | null = null;

    protected onLoad(): void {
        this._label = this.getComponent(Label) ?? this.getComponentInChildren(Label);
    }

    protected onEnable(): void {
        OPTICAL_PUZZLE.on(EVENT_ENUM.OPTICAL_SNAPSHOT_CHANGED, this._onSnapshotChanged, this);
        const cached = _lastSnapshotNotify?.moveCount;
        if (typeof cached === 'number') {
            this._refreshLabel(cached);
        } else {
            this._refreshLabel(0);
        }
    }

    protected onDisable(): void {
        OPTICAL_PUZZLE.off(EVENT_ENUM.OPTICAL_SNAPSHOT_CHANGED, this._onSnapshotChanged, this);
    }

    protected onDestroy(): void {
        OPTICAL_PUZZLE.off(EVENT_ENUM.OPTICAL_SNAPSHOT_CHANGED, this._onSnapshotChanged, this);
    }

    /** 直接刷新步数（开局或事件未到前） */
    setMoveCount(count: number): void {
        this._refreshLabel(count);
    }

    private _onSnapshotChanged(payload: OpticalSnapshotNotify): void {
        if (!payload || typeof payload.moveCount !== 'number') {
            return;
        }
        _lastSnapshotNotify = payload;
        this._refreshLabel(payload.moveCount);
    }

    private _refreshLabel(count: number): void {
        if (!this._label?.isValid) {
            return;
        }
        this._label.string = String(Math.max(0, Math.floor(count)));
    }
}

/** 自 TopBar 子树解析 StepCount（兼容 TopBar/StepCount 与 TopBar/Step/StepCount） */
export function resolveStepCountNode(topBar: Node | null): Node | null {
    if (!topBar?.isValid) {
        return null;
    }
    const direct = topBar.getChildByName('StepCount');
    if (direct?.isValid) {
        return direct;
    }
    const underStep = topBar.getChildByName('Step')?.getChildByName('StepCount') ?? null;
    if (underStep?.isValid) {
        return underStep;
    }
    return _findDescendantByName(topBar, 'StepCount');
}

function _findDescendantByName(root: Node, name: string): Node | null {
    for (const child of root.children) {
        if (!child.isValid) {
            continue;
        }
        if (child.name === name) {
            return child;
        }
        const found = _findDescendantByName(child, name);
        if (found?.isValid) {
            return found;
        }
    }
    return null;
}

/** 为 StepCount 挂上步数 Label 同步 */
export function ensureStepCountView(stepCount: Node | null): void {
    if (!stepCount?.isValid) {
        return;
    }
    if (!stepCount.getComponent(OpticalPuzzleStepCountView)) {
        stepCount.addComponent(OpticalPuzzleStepCountView);
    }
}
