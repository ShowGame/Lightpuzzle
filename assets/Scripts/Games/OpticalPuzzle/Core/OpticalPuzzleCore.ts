import type {
    IOpticalLevelConfig,
    IOpticalLightSource,
    IOpticalPiece,
    IOpticalTarget,
} from '../Config/OpticalPuzzleLevelSchema';
import { colorModeToKey, resolveBeamColorKey } from './OpticalLightColor';
import {
    type OpticalBeamBlockContact,
    type OpticalBeamSegment,
    type OpticalBeamTraceInput,
    traceBeams,
} from './OpticalBeamTracer';
import {
    Direction,
    MoveAttemptResult,
    normalizeDirection,
    type OpticalBoardSnapshot,
    type OpticalPieceSnapshot,
    type OpticalSourceSnapshot,
    type OpticalTargetSnapshot,
    TerrainKind,
} from './OpticalPuzzleTypes';

const DIR_DX: ReadonlyArray<number> = [1, 0, -1, 0];
const DIR_DY: ReadonlyArray<number> = [0, -1, 0, 1];

export interface OpticalBeamSnapshot {
    width: number;
    height: number;
    segments: OpticalBeamSegment[];
    blockContacts: OpticalBeamBlockContact[];
}

/** 撤回栈条目：玩家位置 + 元件布局（地形本关不变） */
export interface OpticalPlayStateSnapshot {
    player: { x: number; y: number };
    playerFacing: Direction;
    pieces: IOpticalPiece[];
}

/**
 * 纯规则层：不引用 Node / Prefab。
 * 行走、推箱子式推动、光追、通关判定。
 */
export class OpticalPuzzleCore {
    private _levelId = 0;
    private _levelName = '';
    private _w = 0;
    private _h = 0;
    private _terrain: TerrainKind[] = [];
    private _px = 0;
    private _py = 0;
    private _playerFacing: Direction = Direction.Left;
    private _sources: IOpticalLightSource[] = [];
    private _targets: IOpticalTarget[] = [];
    private _pieces: IOpticalPiece[] = [];
    private _beamSegments: OpticalBeamSegment[] = [];
    private _beamBlockContacts: OpticalBeamBlockContact[] = [];
    private _targetLit: boolean[] = [];

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
        this._playerFacing = Direction.Left;
        this._sources = level.sources.map((s) => ({
            ...s,
            direction: normalizeDirection(s.direction, Direction.Down),
        }));
        this._targets = level.targets.map((t) => ({ ...t }));
        this._pieces = level.pieces.map((p) => ({
            ...p,
            direction: normalizeDirection(p.direction, Direction.Up),
        }));
        this._recomputeLighting();
    }

    getSnapshot(): OpticalBoardSnapshot {
        return {
            levelId: this._levelId,
            levelName: this._levelName,
            width: this._w,
            height: this._h,
            terrain: this._terrain.slice(),
            player: { x: this._px, y: this._py },
            playerFacing: this._playerFacing,
            sources: this._buildSourceSnapshots(),
            targets: this._buildTargetSnapshots(),
            pieces: this._buildPieceSnapshots(),
            allTargetsLit: this.isAllTargetsLit(),
        };
    }

    getBeamSnapshot(): OpticalBeamSnapshot {
        return {
            width: this._w,
            height: this._h,
            segments: this._beamSegments.map((s) => ({ ...s })),
            blockContacts: this._beamBlockContacts.map((c) => ({ ...c })),
        };
    }

    isAllTargetsLit(): boolean {
        if (this._targets.length === 0) {
            return false;
        }
        return this._targetLit.every(Boolean);
    }

    /** 更新朝向（与是否移动成功无关，由输入层在 tryMove 前调用） */
    setPlayerFacing(dir: Direction): void {
        this._playerFacing = dir;
    }

    /**
     * 推动方向若连续两格都有元件则推不动。
     */
    tryMove(dir: Direction): MoveAttemptResult {
        const dx = DIR_DX[dir];
        const dy = DIR_DY[dir];
        const nx = this._px + dx;
        const ny = this._py + dy;

        if (!this._inBounds(nx, ny)) {
            return MoveAttemptResult.Blocked;
        }

        const piece = this._pieceAt(nx, ny);
        if (!piece) {
            if (!this._canEnterFloor(nx, ny)) {
                return MoveAttemptResult.Blocked;
            }
            this._px = nx;
            this._py = ny;
            this._recomputeLighting();
            return MoveAttemptResult.PlayerMoved;
        }

        const bx = nx + dx;
        const by = ny + dy;
        if (!this._canPushPieceTo(bx, by)) {
            return MoveAttemptResult.Blocked;
        }

        piece.x = bx;
        piece.y = by;
        this._px = nx;
        this._py = ny;
        this._recomputeLighting();
        return MoveAttemptResult.PiecePushed;
    }

    clonePlayState(): OpticalPlayStateSnapshot {
        return {
            player: { x: this._px, y: this._py },
            playerFacing: this._playerFacing,
            pieces: this._pieces.map((p) => ({ ...p })),
        };
    }

    restorePlayState(data: OpticalPlayStateSnapshot, options?: { deferLighting?: boolean }): void {
        this._px = data.player.x;
        this._py = data.player.y;
        this._playerFacing = data.playerFacing ?? Direction.Left;
        this._pieces = data.pieces.map((p) => ({ ...p }));
        if (!options?.deferLighting) {
            this._recomputeLighting();
        }
    }

    /** 目标点亮位掩码（求解器剪枝用，低位对应 targets 顺序） */
    getTargetLitMask(): number {
        let mask = 0;
        for (let i = 0; i < this._targetLit.length; i++) {
            if (this._targetLit[i]) {
                mask |= 1 << i;
            }
        }
        return mask;
    }

    get targetCount(): number {
        return this._targets.length;
    }

    private _inBounds(x: number, y: number): boolean {
        return x >= 0 && y >= 0 && x < this._w && y < this._h;
    }

    private _pieceAt(x: number, y: number): IOpticalPiece | undefined {
        return this._pieces.find((p) => p.x === x && p.y === y);
    }

    /** 主角走入：须为地板且非光源/目标格 */
    private _canEnterFloor(x: number, y: number): boolean {
        if (!this._inBounds(x, y)) {
            return false;
        }
        return this._terrain[y * this._w + x] === TerrainKind.Floor && !this._pieceAt(x, y);
    }

    /** 元件被推到：须为地板、无其他元件、非光源/目标 */
    private _canPushPieceTo(x: number, y: number): boolean {
        if (!this._inBounds(x, y)) {
            return false;
        }
        if (this._terrain[y * this._w + x] !== TerrainKind.Floor) {
            return false;
        }
        if (this._pieceAt(x, y)) {
            return false;
        }
        return true;
    }

    private _buildSourceSnapshots(): OpticalSourceSnapshot[] {
        return this._sources.map((s) => ({
            x: s.x,
            y: s.y,
            colorKey: resolveBeamColorKey(s.colorKey),
            direction: s.direction,
        }));
    }

    private _buildPieceSnapshots(): OpticalPieceSnapshot[] {
        return this._pieces.map((p) => ({
            x: p.x,
            y: p.y,
            connectivity: p.connectivity,
            direction: p.direction,
            colorKey: colorModeToKey(p.colorMode),
        }));
    }

    private _buildTargetSnapshots(): OpticalTargetSnapshot[] {
        return this._targets.map((t, i) => ({
            x: t.x,
            y: t.y,
            colorKey: resolveBeamColorKey(t.colorKey),
            lit: this._targetLit[i] ?? false,
        }));
    }

    private _recomputeLighting(): void {
        const input: OpticalBeamTraceInput = {
            width: this._w,
            height: this._h,
            terrain: this._terrain,
            player: { x: this._px, y: this._py },
            pieces: this._pieces,
            sources: this._sources,
            targets: this._targets,
        };
        const result = traceBeams(input);
        this._beamSegments = result.segments;
        this._beamBlockContacts = result.blockContacts;
        this._targetLit = result.targetLit;
    }
}
