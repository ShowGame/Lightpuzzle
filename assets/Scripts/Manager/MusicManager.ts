import {
    _decorator,
    AudioClip,
    AudioSource,
    Component,
    director,
    Director,
    Node,
} from 'cc';
import { DataManager } from './DataManager';
import { AUDIO_EFFECT_ENUM, EVENT_ENUM, SCENE_ENUM } from '../Utils/Enum';
import { PLAY_AUDIO, PLAY_BGM } from '../Utils/Event';
import {
    cancelWeChatRewardedVideoPreloadSchedule,
    scheduleWeChatRewardedVideoPreloadForGame,
} from '../Utils/WeChatRewardedVideoAd';
import { initWeChatMiniGameShare, trySettlePendingShareAfterWxOnShow } from '../Utils/WeChatShare';

const { ccclass, property } = _decorator;

/**
 * 音频管理：PersistRoot + 事件驱动（project-rules）。
 * 全局 BGM（如 Bg.mp3）在 Menu / Game 场景循环播放；音效经 PLAY_AUDIO 播放。
 * 未绑定 AudioClip 或 AudioSource 时跳过，避免空引用。
 */
@ccclass('MusicManager')
export class MusicManager extends Component {
    //#region 编辑器绑定

    /** 全局背景音乐（如 assets/Audio/Bg.mp3，Menu / Game 共用） */
    @property({ type: AudioClip, tooltip: '全局 BGM（Bg.mp3）' })
    bgm: AudioClip | null = null;

    /** UI 通用按钮点击（建议 assets/Audio/Click.mp3） */
    @property({ type: AudioClip, tooltip: '通用按钮点击（Click.mp3）' })
    clickButton: AudioClip | null = null;

    /** 四向键移动成功：主角走一格或推动元件（建议 Right.mp3） */
    @property({ type: AudioClip, tooltip: '四向键移动成功（Right.mp3）' })
    opticalMoveSuccess: AudioClip | null = null;

    /** 四向键移动失败：与主角阻拦脸同级（建议 Failed.mp3） */
    @property({ type: AudioClip, tooltip: '四向键移动失败（Failed.mp3）' })
    opticalMoveFail: AudioClip | null = null;

    /** 单个目标灯被点亮（待加资源，如 Light.mp3） */
    @property({ type: AudioClip, tooltip: '单个目标灯点亮（待加 Light.mp3 等）' })
    opticalTargetLit: AudioClip | null = null;

    /** 关卡通关成功（建议 Pass.mp3；winPanel 展示时播放，前有 PRE_WIN_PANEL_DELAY_SEC） */
    @property({ type: AudioClip, tooltip: '关卡通关（Pass.mp3；结算 winPanel 弹出时播放）' })
    opticalLevelComplete: AudioClip | null = null;

    /** 用于循环 BGM；音效使用 playOneShot 播在同一 AudioSource 上 */
    @property(AudioSource)
    audioSource: AudioSource | null = null;

    //#endregion

    private static _persistRegistered = false;

    /** 当前正在播放的 BGM Clip，避免同曲重复 stop/play */
    private _currentBgmClip: AudioClip | null = null;

    private readonly _wxOnShowHandler = (): void => {
        trySettlePendingShareAfterWxOnShow();
    };

    protected onLoad(): void {
        this.registerPersistRoot();
        director.on(Director.EVENT_AFTER_SCENE_LAUNCH, this.onAfterSceneLaunch, this);
        PLAY_AUDIO.on(EVENT_ENUM.PLAY_AUDIO, this.onAudioPlay, this);
        PLAY_BGM.on(EVENT_ENUM.PLAY_BGM, this.onPlayBgmEvent, this);
        initWeChatMiniGameShare();
        this._bindWeChatOnShow();
    }

    protected onDestroy(): void {
        this._unbindWeChatOnShow();
        cancelWeChatRewardedVideoPreloadSchedule();
        director.off(Director.EVENT_AFTER_SCENE_LAUNCH, this.onAfterSceneLaunch, this);
        PLAY_AUDIO.off(EVENT_ENUM.PLAY_AUDIO, this.onAudioPlay, this);
        PLAY_BGM.off(EVENT_ENUM.PLAY_BGM, this.onPlayBgmEvent, this);
    }

    //#region BGM

    onAfterSceneLaunch(): void {
        const sceneName = director.getScene()?.name ?? '';
        this.switchBgmBySceneName(sceneName);
        cancelWeChatRewardedVideoPreloadSchedule();
        if (sceneName === SCENE_ENUM.GAME) {
            scheduleWeChatRewardedVideoPreloadForGame();
        }
    }

    /** 设置页切换 BGM 开关后可 emit PLAY_BGM 刷新当前 BGM */
    onPlayBgmEvent(): void {
        const sceneName = director.getScene()?.name ?? '';
        this.switchBgmBySceneName(sceneName);
    }

    switchBgmBySceneName(sceneName: string): void {
        if (sceneName === SCENE_ENUM.MENU || sceneName === SCENE_ENUM.GAME) {
            this.playGlobalBgm();
        } else {
            this.stopBgm();
        }
    }

    playGlobalBgm(): void {
        if (!DataManager.instance.bgmOn) {
            this.stopBgm();
            return;
        }
        this.playBgmClip(this.bgm);
    }

    private playBgmClip(clip: AudioClip | null): void {
        const source = this.audioSource;
        if (!source) {
            return;
        }
        if (!clip) {
            this.stopBgm();
            return;
        }
        if (this._currentBgmClip === clip && source.playing) {
            return;
        }
        source.stop();
        source.clip = clip;
        source.loop = true;
        source.play();
        this._currentBgmClip = clip;
    }

    private stopBgm(): void {
        if (this.audioSource) {
            this.audioSource.stop();
        }
        this._currentBgmClip = null;
    }

    //#endregion

    //#region 音效

    onAudioPlay(type: AUDIO_EFFECT_ENUM | AUDIO_EFFECT_ENUM[]): void {
        if (!DataManager.instance.sfxOn || !this.audioSource) {
            return;
        }
        const types = Array.isArray(type) ? type : [type];
        for (const sfxType of types) {
            const clip = this.resolveSfxClip(sfxType);
            if (clip) {
                this.audioSource.playOneShot(clip);
            }
        }
    }

    private resolveSfxClip(type: AUDIO_EFFECT_ENUM): AudioClip | null {
        switch (type) {
            case AUDIO_EFFECT_ENUM.CLICK_BUTTON:
                return this.clickButton;
            case AUDIO_EFFECT_ENUM.OPTICAL_MOVE_SUCCESS:
                return this.opticalMoveSuccess;
            case AUDIO_EFFECT_ENUM.OPTICAL_MOVE_FAIL:
                return this.opticalMoveFail;
            case AUDIO_EFFECT_ENUM.OPTICAL_TARGET_LIT:
                return this.opticalTargetLit;
            case AUDIO_EFFECT_ENUM.OPTICAL_LEVEL_COMPLETE:
                return this.opticalLevelComplete;
            default:
                return null;
        }
    }

    //#endregion

    /** 持久化 PersistRoot（含 AudioService / ToastService 兄弟节点） */
    private registerPersistRoot(): void {
        if (MusicManager._persistRegistered) {
            return;
        }
        const root = this.findPersistRootNode();
        director.addPersistRootNode(root);
        MusicManager._persistRegistered = true;
    }

    private findPersistRootNode(): Node {
        let node: Node | null = this.node;
        while (node) {
            if (node.name === 'PersistRoot') {
                return node;
            }
            node = node.parent;
        }
        return this.node;
    }

    private _bindWeChatOnShow(): void {
        const wxApi = (globalThis as { wx?: { onShow?(fn: () => void): void; offShow?(fn: () => void): void } }).wx;
        wxApi?.onShow?.(this._wxOnShowHandler);
    }

    private _unbindWeChatOnShow(): void {
        const wxApi = (globalThis as { wx?: { offShow?(fn: () => void): void } }).wx;
        wxApi?.offShow?.(this._wxOnShowHandler);
    }
}
