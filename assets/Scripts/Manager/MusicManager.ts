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
import { AUDIO_EFFECT_ENUM, BGM_KIND_ENUM, EVENT_ENUM, SCENE_ENUM } from '../Utils/Enum';
import { PLAY_AUDIO, PLAY_BGM } from '../Utils/Event';
import {
    cancelWeChatRewardedVideoPreloadSchedule,
    scheduleWeChatRewardedVideoPreloadForGame,
} from '../Utils/WeChatRewardedVideoAd';

const { ccclass, property } = _decorator;

/**
 * 音频管理：PersistRoot + 事件驱动（project-rules）。
 * BGM 随场景 Menu / Game 切换；音效经 PLAY_AUDIO 播放。
 * 未绑定 AudioClip 或 AudioSource 时跳过，避免空引用。
 */
@ccclass('MusicManager')
export class MusicManager extends Component {
    //#region 编辑器绑定

    /** 菜单场景背景音乐（循环） */
    @property({ type: AudioClip, tooltip: '菜单场景 BGM' })
    bgmMenu: AudioClip | null = null;

    /** 局内关卡背景音乐（循环） */
    @property({ type: AudioClip, tooltip: 'Game 场景 BGM' })
    bgmGame: AudioClip | null = null;

    /** UI 通用按钮点击 */
    @property({ type: AudioClip, tooltip: '通用按钮点击音效' })
    clickButton: AudioClip | null = null;

    /** 关卡通关成功 */
    @property({ type: AudioClip, tooltip: '关卡通关成功音效' })
    opticalLevelComplete: AudioClip | null = null;

    /** 成功推动光学元件 */
    @property({ type: AudioClip, tooltip: '成功推动光学元件' })
    opticalPiecePushSuccess: AudioClip | null = null;

    /** 推动失败 */
    @property({ type: AudioClip, tooltip: '推动失败（不可推/被挡）' })
    opticalPiecePushFail: AudioClip | null = null;

    /** 用于循环 BGM；音效使用 playOneShot 播在同一 AudioSource 上 */
    @property(AudioSource)
    audioSource: AudioSource | null = null;

    //#endregion

    private static _persistRegistered = false;

    /** 当前正在播放的 BGM Clip，避免同曲重复 stop/play */
    private _currentBgmClip: AudioClip | null = null;

    protected onLoad(): void {
        this.registerPersistRoot();
        director.on(Director.EVENT_AFTER_SCENE_LAUNCH, this.onAfterSceneLaunch, this);
        PLAY_AUDIO.on(EVENT_ENUM.PLAY_AUDIO, this.onAudioPlay, this);
        PLAY_BGM.on(EVENT_ENUM.PLAY_BGM, this.onPlayBgmEvent, this);
    }

    protected onDestroy(): void {
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

    /** 设置页切换 BGM 开关后可 emit PLAY_BGM 刷新当前场景 BGM */
    onPlayBgmEvent(kind?: BGM_KIND_ENUM): void {
        if (kind === BGM_KIND_ENUM.MENU || kind === BGM_KIND_ENUM.GAME) {
            this.playBgmKind(kind);
            return;
        }
        this.onAfterSceneLaunch();
    }

    switchBgmBySceneName(sceneName: string): void {
        if (sceneName === SCENE_ENUM.MENU) {
            this.playBgmKind(BGM_KIND_ENUM.MENU);
        } else if (sceneName === SCENE_ENUM.GAME) {
            this.playBgmKind(BGM_KIND_ENUM.GAME);
        } else {
            this.stopBgm();
        }
    }

    playBgmKind(kind: BGM_KIND_ENUM): void {
        if (!DataManager.instance.bgmOn) {
            this.stopBgm();
            return;
        }
        const clip = kind === BGM_KIND_ENUM.MENU ? this.bgmMenu : this.bgmGame;
        this.playBgmClip(clip);
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

    onAudioPlay(type: AUDIO_EFFECT_ENUM): void {
        if (!DataManager.instance.sfxOn || !this.audioSource) {
            return;
        }
        const clip = this.resolveSfxClip(type);
        if (clip) {
            this.audioSource.playOneShot(clip);
        }
    }

    private resolveSfxClip(type: AUDIO_EFFECT_ENUM): AudioClip | null {
        switch (type) {
            case AUDIO_EFFECT_ENUM.CLICK_BUTTON:
                return this.clickButton;
            case AUDIO_EFFECT_ENUM.OPTICAL_LEVEL_COMPLETE:
                return this.opticalLevelComplete;
            case AUDIO_EFFECT_ENUM.OPTICAL_PIECE_PUSH_SUCCESS:
                return this.opticalPiecePushSuccess;
            case AUDIO_EFFECT_ENUM.OPTICAL_PIECE_PUSH_FAIL:
                return this.opticalPiecePushFail;
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
}
