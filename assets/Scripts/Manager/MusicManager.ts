import {
    _decorator,
    AudioClip,
    AudioSource,
    Component,
    director,
    Director,
} from 'cc';
import { AUDIO_EFFECT_ENUM, EVENT_ENUM } from '../Utils/Enum';
import { PLAY_AUDIO } from '../Utils/Event';

const { ccclass, property } = _decorator;

/**
 * 音频管理：持久化节点 + 事件驱动播放（project-rules）。
 * 未在编辑器绑定 AudioClip 时跳过 playOneShot，避免空引用。
 */
@ccclass('MusicManager')
export class MusicManager extends Component {
    /** 通用按钮音效 */
    @property(AudioClip)
    clickButton: AudioClip = null!;

    @property(AudioSource)
    audioSource: AudioSource = null!;

    protected onLoad(): void {
        director.addPersistRootNode(this.node);
        director.on(Director.EVENT_AFTER_SCENE_LAUNCH, this.onAfterSceneLaunch, this);
        PLAY_AUDIO.on(EVENT_ENUM.PLAY_AUDIO, this.onAudioPlay, this);
    }

    protected onDestroy(): void {
        director.off(Director.EVENT_AFTER_SCENE_LAUNCH, this.onAfterSceneLaunch, this);
        PLAY_AUDIO.off(EVENT_ENUM.PLAY_AUDIO, this.onAudioPlay, this);
    }

    onAfterSceneLaunch(): void {
        const sceneName = director.getScene()?.name ?? '';
        this.updateBackGroundMusic(sceneName);
    }

    updateBackGroundMusic(sceneName: string): void {
        if (!this.audioSource) {
            return;
        }
        this.audioSource.stop();
        if (this.audioSource.clip) {
            this.audioSource.play();
        }
        void sceneName;
    }

    onAudioPlay(type: AUDIO_EFFECT_ENUM): void {
        if (!this.audioSource) {
            return;
        }
        switch (type) {
            case AUDIO_EFFECT_ENUM.CLICK_BUTTON:
                if (this.clickButton) {
                    this.audioSource.playOneShot(this.clickButton);
                }
                break;
            case AUDIO_EFFECT_ENUM.OPTICAL_PLAYER_MOVE:
            case AUDIO_EFFECT_ENUM.OPTICAL_PIECE_PUSH:
                if (this.clickButton) {
                    this.audioSource.playOneShot(this.clickButton);
                }
                break;
            default:
                break;
        }
    }
}
