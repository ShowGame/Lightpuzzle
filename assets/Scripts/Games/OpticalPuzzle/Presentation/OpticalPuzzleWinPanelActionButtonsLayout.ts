import { Node } from 'cc';
import { getOpticalLevelById } from '../Config/OpticalPuzzleLevels';
import { isPerfectClear } from '../Core/OpticalPuzzleStarRating';
import { resolveWinPanelNextLevelNode } from './OpticalPuzzleWinPanelNextLevelButtonView';
import { resolveWinPanelRetryNode } from './OpticalPuzzleWinPanelRetryButtonView';

/** 非完美通关：双按钮横坐标 */
export const WIN_PANEL_NEXT_LEVEL_X_DUAL = 115;
export const WIN_PANEL_RETRY_X = -115;

/** 完美通关：仅下一关，居中 */
export const WIN_PANEL_NEXT_LEVEL_X_SOLO = 0;

/**
 * 按是否完美通关调整 retry / nextlevel 显隐与横坐标。
 * @returns 是否完美通关
 */
export function syncWinPanelActionButtonsLayout(
    root: Node | null,
    levelId: number,
    moveCount: number,
): boolean {
    const nextNode = resolveWinPanelNextLevelNode(root);
    if (!nextNode?.isValid) {
        return false;
    }

    const level = getOpticalLevelById(levelId);
    const perfect = level?.starThresholds
        ? isPerfectClear(moveCount, level.starThresholds)
        : false;

    const retryNode = resolveWinPanelRetryNode(root);
    const nextPos = nextNode.position;

    if (perfect) {
        if (retryNode?.isValid) {
            retryNode.active = false;
        }
        nextNode.setPosition(WIN_PANEL_NEXT_LEVEL_X_SOLO, nextPos.y, nextPos.z);
    } else {
        if (retryNode?.isValid) {
            retryNode.active = true;
            const retryPos = retryNode.position;
            retryNode.setPosition(WIN_PANEL_RETRY_X, retryPos.y, retryPos.z);
        }
        nextNode.setPosition(WIN_PANEL_NEXT_LEVEL_X_DUAL, nextPos.y, nextPos.z);
    }

    return perfect;
}
