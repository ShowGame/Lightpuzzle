import type { IOpticalLevelConfig } from '../Config/OpticalPuzzleLevelSchema';
import {
    Direction,
    MoveAttemptResult,
    OpticalBoardSnapshot,
    TerrainKind,
} from './OpticalPuzzleTypes';

const DIR_DX: ReadonlyArray<number> = [1, 0, -1, 0];
const DIR_DY: ReadonlyArray<number> = [0, -1, 0, 1];

/**
 * 纯规则层：不引用 Node / Prefab。
 * 当前仅实现「地板 + 墙框」上的四向行走占位；推箱子与光追后续接入。
 */
export class OpticalPuzzleCore {
    private _levelId = 0;
    private _levelName = '';
    private _w = 0;
    private _h = 0;
    private _terrain: TerrainKind[] = [];
    private _px = 0;
    private _py = 0;

    reset(level: IOpticalLevelConfig): void {
        const n = level.width * level.height;
        if (level.terrain.length !== n) {
            throw new Error(
                `[OpticalPuzzleCore] terrain length ${level.terrain.length} != ${n}`,
            );
        }
        this._levelId = level.levelId;
        this._levelName = level.levelName;
        this._w = level.width;
        this._h = level.height;
        this._terrain = level.terrain.slice();
        this._px = level.player.x;
        this._py = level.player.y;
    }

    getSnapshot(): OpticalBoardSnapshot {
        return {
            levelId: this._levelId,
            levelName: this._levelName,
            width: this._w,
            height: this._h,
            terrain: this._terrain.slice(),
            player: { x: this._px, y: this._py },
        };
    }

    /** 尝试朝某向移动主角一步（占位：仅处理地板与墙）。 */
    tryMove(dir: Direction): MoveAttemptResult {
        const nx = this._px + DIR_DX[dir];
        const ny = this._py + DIR_DY[dir];
        if (nx < 0 || ny < 0 || nx >= this._w || ny >= this._h) {
            return MoveAttemptResult.Blocked;
        }
        const t = this._terrain[ny * this._w + nx];
        if (t !== TerrainKind.Floor) {
            return MoveAttemptResult.Blocked;
        }
        this._px = nx;
        this._py = ny;
        return MoveAttemptResult.PlayerMoved;
    }

    cloneDeepTerrainAndPlayer(): { terrain: TerrainKind[]; player: { x: number; y: number } } {
        return {
            terrain: this._terrain.slice(),
            player: { x: this._px, y: this._py },
        };
    }

    restoreTerrainAndPlayer(data: { terrain: TerrainKind[]; player: { x: number; y: number } }): void {
        this._terrain = data.terrain.slice();
        this._px = data.player.x;
        this._py = data.player.y;
    }
}
