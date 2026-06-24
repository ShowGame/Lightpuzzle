import { Graphics, Node } from 'cc';
import {
    ensureStepCountView,
    OpticalPuzzleStepCountView,
    resolveStepCountNode,
} from './OpticalPuzzleStepCountView';
import { ensureStepIconView } from './OpticalPuzzleStepIconView';
import { OpticalPuzzleStepView } from './OpticalPuzzleStepView';

function _hideSpriteSplash(node: Node | null): void {
    const splash = node?.getChildByName('SpriteSplash');
    if (splash?.isValid) {
        splash.active = false;
    }
}

/** 自 answerPanel 子树解析 Step 节点 */
export function resolveAnswerPanelStepNode(panel: Node | null): Node | null {
    return panel?.getChildByName('Step') ?? null;
}

/** 解析 answerPanel 下 StepCount 的步数视图 */
export function resolveAnswerPanelStepCountView(panel: Node | null): OpticalPuzzleStepCountView | null {
    const stepCount = resolveStepCountNode(panel);
    return stepCount?.getComponent(OpticalPuzzleStepCountView) ?? null;
}

function _removeStepChrome(step: Node): void {
    const chrome = step.getComponent(OpticalPuzzleStepView);
    if (chrome) {
        chrome.destroy();
    }
    const g = step.getComponent(Graphics);
    if (g) {
        g.clear();
        g.destroy();
    }
}

/**
 * answerPanel/Step：不绘制外框，仅挂 StepIcon 爪印与 StepCount 步数。
 * 步数由参考解回放手动刷新，不跟随局内快照。
 */
export function ensureAnswerPanelStepViews(panel: Node | null): void {
    if (!panel?.isValid) {
        return;
    }
    const step = resolveAnswerPanelStepNode(panel);
    if (!step?.isValid) {
        return;
    }
    _hideSpriteSplash(step);
    _removeStepChrome(step);

    const stepIcon = step.getChildByName('StepIcon');
    _hideSpriteSplash(stepIcon);
    ensureStepIconView(stepIcon);

    const stepCount = resolveStepCountNode(panel);
    _hideSpriteSplash(stepCount);
    ensureStepCountView(stepCount, { manualOnly: true });
}
