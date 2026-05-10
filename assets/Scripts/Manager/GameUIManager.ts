import { _decorator, Component } from 'cc';

const { ccclass } = _decorator;

/** 局内 HUD 通用逻辑占位（返回菜单、暂停等）；光学解谜专用 UI 见 OpticalPuzzleInputHud */
@ccclass('GameUIManager')
export class GameUIManager extends Component {}
