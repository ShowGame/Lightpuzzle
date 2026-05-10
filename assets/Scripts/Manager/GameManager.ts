import { _decorator, Component } from 'cc';

const { ccclass } = _decorator;

/**
 * 全局局内编排入口占位。
 * 光学解谜当前由 `OpticalPuzzleRoot` + `OpticalPuzzleSession` 承担；后续多玩法时可在此分发。
 */
@ccclass('GameManager')
export class GameManager extends Component {
    protected onLoad(): void {
        // 预留：读档、切关、与 Menu 场景衔接等
    }
}
