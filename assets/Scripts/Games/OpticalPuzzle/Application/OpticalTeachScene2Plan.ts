import { getOpticalLevelById } from '../Config/OpticalPuzzleLevels';
import type { OpticalBeamSnapshot } from '../Core/OpticalPuzzleCore';
import { OpticalPuzzleCore } from '../Core/OpticalPuzzleCore';
import type { OpticalBoardSnapshot } from '../Core/OpticalPuzzleTypes';
import { Direction } from '../Core/OpticalPuzzleTypes';

export interface OpticalTeachScene2Plan {
    fromSnap: OpticalBoardSnapshot;
    toSnap: OpticalBoardSnapshot;
    beamFrom: OpticalBeamSnapshot;
    beamTo: OpticalBeamSnapshot;
}

function cloneBoardSnapshot(snap: OpticalBoardSnapshot): OpticalBoardSnapshot {
    return {
        ...snap,
        terrain: snap.terrain.slice(),
        player: { ...snap.player },
        sources: snap.sources.map((s) => ({ ...s })),
        targets: snap.targets.map((t) => ({ ...t })),
        pieces: snap.pieces.map((p) => ({ ...p })),
    };
}

/** 第一关第二幕：@ 在出生格左上方左推元件 1 并点亮目标 */
export function buildTeachScene2PushPlan(sessionSnap: OpticalBoardSnapshot): OpticalTeachScene2Plan | null {
    const level = getOpticalLevelById(sessionSnap.levelId);
    if (!level) {
        return null;
    }
    const core = new OpticalPuzzleCore();
    core.reset(level);
    const teachPx = sessionSnap.player.x - 1;
    const teachPy = sessionSnap.player.y - 1;
    const initial = core.clonePlayState();
    core.restorePlayState({
        player: { x: teachPx, y: teachPy },
        playerFacing: Direction.Left,
        pieces: initial.pieces,
    });
    const fromSnap = core.getSnapshot();
    const beamFrom = core.getBeamSnapshot();
    core.setPlayerFacing(Direction.Left);
    core.tryMove(Direction.Left);
    const toSnap = core.getSnapshot();
    const beamTo = core.getBeamSnapshot();
    return {
        fromSnap: cloneBoardSnapshot(fromSnap),
        toSnap: cloneBoardSnapshot(toSnap),
        beamFrom,
        beamTo,
    };
}
