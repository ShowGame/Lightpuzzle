import { Node } from 'cc';
import { ensureStepCountView } from './OpticalPuzzleStepCountView';
import { ensureStepIconView } from './OpticalPuzzleStepIconView';
import { resolveWinPanelWindsNode } from './OpticalPuzzleWinPanelWindsView';

/** 自 GameRoot 子树解析 layerOverlay/winPanel/winds/step */
export function resolveWinPanelStepNode(root: Node | null): Node | null {
    return resolveWinPanelWindsNode(root)?.getChildByName('step') ?? null;
}

function _hideSpriteSplash(node: Node | null): void {
    const splash = node?.getChildByName('SpriteSplash');
    if (splash?.isValid) {
        splash.active = false;
    }
}

/**
 * winPanel/winds/step：不绘制外框，仅挂 StepIcon 爪印与 StepCount 步数同步（逻辑同 TopBar/Step）。
 */
export function ensureWinPanelStepViews(root: Node | null): void {
    const step = resolveWinPanelStepNode(root);
    if (!step?.isValid) {
        return;
    }
    _hideSpriteSplash(step);

    const stepIcon = step.getChildByName('StepIcon');
    _hideSpriteSplash(stepIcon);
    ensureStepIconView(stepIcon);

    const stepCount = step.getChildByName('StepCount');
    _hideSpriteSplash(stepCount);
    ensureStepCountView(stepCount);
}
