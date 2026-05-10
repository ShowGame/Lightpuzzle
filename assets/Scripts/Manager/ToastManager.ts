import { _decorator, Component, Prefab, instantiate, Node, Label, UITransform, UIOpacity, tween, Tween } from 'cc';
import { RoundBox } from '../../RoundBox';

const { ccclass, property } = _decorator;

/**
 * Toast：展示文案 + 背景宽度；显示 DISPLAY_SEC 秒后，FADE_SEC 秒内透明度变为 0。
 * 新一次 show 会立刻打断上一次动画并展示新内容。
 * 预制体根节点下需有子节点：text（挂 Label）、bg（挂 UITransform 可调宽度）。
 */
@ccclass('ToastManager')
export class ToastManager extends Component {
    // Toast 预制体（根节点下子节点：text、bg）
    @property(Prefab)
    toastPrefab: Prefab = null;

    private static readonly DISPLAY_SEC = 1;
    private static readonly FADE_SEC = 1;
    /** 未传或非法 bgWidth 时使用（避免 undefined → NaN 导致 UITransform.width 无效） */
    private static readonly DEFAULT_BG_WIDTH = 320;

    private _toastRoot: Node | null = null;

    private static resolveBgWidth(bgWidth: number | undefined): number {
        if (typeof bgWidth !== 'number' || !Number.isFinite(bgWidth)) {
            return ToastManager.DEFAULT_BG_WIDTH;
        }
        return Math.max(0, bgWidth);
    }

    private static resolveLocalY(localY: number | undefined): number {
        if (typeof localY !== 'number' || !Number.isFinite(localY)) {
            return 0;
        }
        return localY;
    }

    /**
     * @param message 提示文本
     * @param bgWidth 背景节点 `bg` 的 **宽度**（像素）。注意第二参是宽度不是 Y；若误传 `undefined`（如可选链未绑到值）会走默认宽 320。
     * @param localY 弹窗根节点本地坐标 **Y**；省略或非法时为 0。要只调纵向位置请写 `show(msg, undefined, 450)` 或先传宽度再传 Y。
     */
    show(message: string, bgWidth?: number, localY: number = 0): void {
        if (!this.toastPrefab) {
            console.warn('[ToastManager] 未绑定 toastPrefab');
            return;
        }

        if (!this._toastRoot || !this._toastRoot.isValid) {
            this._toastRoot = instantiate(this.toastPrefab);
            this._toastRoot.setParent(this.node);
        }

        const root = this._toastRoot;
        const py = ToastManager.resolveLocalY(localY);
        root.setPosition(0, py, 0);
        const uiOp = root.getComponent(UIOpacity) ?? root.addComponent(UIOpacity);
        Tween.stopAllByTarget(uiOp);

        /** 先定 bg 宽并立刻刷新 RoundBox：仅改 UITransform 时 onSizeChanged 不会重算 UV，若只 schedule 下一帧强刷，首帧仍会按旧网格绘制 → 背景宽度闪一下 */
        const bgNode = root.getChildByName('bg');
        const bgUt = bgNode?.getComponent(UITransform);
        const wResolved = ToastManager.resolveBgWidth(bgWidth);
        if (bgUt) {
            bgUt.width = wResolved;
            const rb = bgNode?.getComponent(RoundBox);
            if (rb?.isValid) {
                rb.forceRefreshRender();
                /** 首帧 chunk/texture 未就绪时补一次（与 MenuOverlayWindow 等场景一致） */
                this.scheduleOnce(() => {
                    if (rb.isValid && bgUt.isValid) {
                        rb.forceRefreshRender();
                    }
                }, 0);
            }
        } else {
            console.warn('[ToastManager] 预制体根下未找到子节点 bg 或未挂 UITransform');
        }

        const textNode = root.getChildByName('text');
        const label = textNode?.getComponent(Label);
        if (label) {
            label.string = message;
        } else {
            console.warn('[ToastManager] 预制体根下未找到子节点 text 或未挂 Label');
        }

        root.active = true;
        uiOp.opacity = 255;

        tween(uiOp)
            .delay(ToastManager.DISPLAY_SEC)
            .to(ToastManager.FADE_SEC, { opacity: 0 })
            .call(() => {
                // 下一帧再关节点，避免与最后一帧 UI 提交叠在同一时刻，圆角 VERTEX 底图容易「到 0 突然没」
                this.scheduleOnce(() => {
                    if (root?.isValid) {
                        root.active = false;
                    }
                }, 0);
            })
            .start();
    }
}
