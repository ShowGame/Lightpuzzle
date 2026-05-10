import { _decorator, Component } from 'cc';

const { ccclass } = _decorator;

/** 关卡列表与切换占位；光学解谜关卡 id 可与 DataManager.opticalCurrentLevelId 对齐 */
@ccclass('LevelManager')
export class LevelManager extends Component {}
