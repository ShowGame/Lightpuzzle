import {
    _decorator,
    BlockInputEvents,
    Button,
    Component,
    director,
    EventTouch,
    Graphics,
    Layout,
    Mask,
    Node,
    ScrollView,
    Sprite,
    sys,
    UITransform,
    Vec2,
} from 'cc';
import { DataManager } from '../../../Manager/DataManager';
import { AUDIO_EFFECT_ENUM, EVENT_ENUM, SCENE_ENUM } from '../../../Utils/Enum';
import { PLAY_AUDIO, SHOW_TOAST } from '../../../Utils/Event';
import { OPTICAL_LEVELS } from '../Config/OpticalPuzzleLevels';
import type { IOpticalLevelConfig } from '../Config/OpticalPuzzleLevelSchema';
import {
    drawLevelSelectCloseGlyph,
    drawLevelSelectPanelChrome,
    drawLevelSelectScrollBottomFade,
    drawLevelSelectScrollTopFade,
    drawLevelSelectTitleBar,
    LEVEL_SELECT_CLOSE_DESIGN_SIZE,
    LEVEL_SELECT_ITEM_DESIGN_SIZE,
    LEVEL_SELECT_SCROLL_BOTTOM_FADE_HEIGHT,
    LEVEL_SELECT_SCROLL_BOTTOM_FADE_WIDTH,
    LEVEL_SELECT_SCROLL_TOP_FADE_HEIGHT,
    LEVEL_SELECT_SCROLL_TOP_FADE_WIDTH,
    LevelSelectItemVisualState,
} from './OpticalPuzzleLevelSelectPanelGlyph';
import {
    createLevelSelectItemNode,
    OpticalPuzzleLevelSelectItemView,
} from './OpticalPuzzleLevelSelectItemView';
import { OpticalPuzzleLevelSelectScrollFadePassThrough } from './OpticalPuzzleLevelSelectScrollFadePassThrough';
import { HudButtonPressController } from './OpticalPuzzleHudButtonCommon';

const { ccclass } = _decorator;

/** 与 Game 场景 levelSelectPanel 占位布局一致（设计 px） */
const PANEL_WIDTH = 650;
const PANEL_HEIGHT = 1200;
const PANEL_OFFSET_Y = -25;
const TITLE_WIDTH = 250;
const TITLE_HEIGHT = 80;
const TITLE_OFFSET_Y = 575;
const CLOSE_SIZE = LEVEL_SELECT_CLOSE_DESIGN_SIZE;
const CLOSE_OFFSET_X = 315;
const CLOSE_OFFSET_Y = 570;
const SCROLL_WIDTH = 650;
const SCROLL_HEIGHT = 1100;
const SCROLL_OFFSET_Y = -40;
const GRID_COLUMNS = 4;
/** 面板打开时分帧创建，避免点击瞬间卡顿 */
const LEVEL_LIST_BUILD_BATCH = 8;
/** 面板隐藏时预构建，每帧多画一些 */
const LEVEL_LIST_PREWARM_BATCH = 26;

const GFX_CHILD_NAME = 'gfx';
const SCROLL_FADE_TOP_CHILD_NAME = 'fadetop';
const SCROLL_FADE_BOTTOM_CHILD_NAME = 'fadebottom';

/** 四列网格等间距：左右边距与列间距相同，gap = (容器宽 - 4×cell) / 5 */
function computeLevelSelectGridGap(scrollWidth: number, columns: number, cellSize: number): number {
    return Math.max(0, (scrollWidth - columns * cellSize) / (columns + 1));
}

/** 第 col 列关卡项中心 x（与满行同列对齐；末行不足 4 个也靠左） */
function levelSelectItemCenterX(
    scrollWidth: number,
    cellSize: number,
    gap: number,
    col: number,
): number {
    return -scrollWidth * 0.5 + gap + col * (cellSize + gap) + cellSize * 0.5;
}

/** 局内入口能力（避免与 OpticalPuzzleRoot 循环引用） */
interface IOpticalPuzzleRootApi {
    getCurrentLevelId?(): number;
    loadLevelById(levelId: number): void;
}

/**
 * 选关弹层：绘制 + 列表 + 选关逻辑一体。
 * 挂到 levelSelectPanel / LevelSelectPanel 根节点，Menu 与 Game 场景可直接复制节点复用。
 * 子节点 bg / panel / titlebar / closebtn / scrollpanel 的尺寸与位置由场景控制；
 * panel / titlebar / closebtn 的键帽底在各自根节点 Graphics 绘制（勿与 Sprite 同节点）。
 * 脚本仅在节点缺少 UITransform 时写入占位默认值。
 * 打开时由 MenuManager / GameUIManager 设 active=true；关闭由本脚本处理。
 */
@ccclass('OpticalPuzzleLevelSelectPanel')
export class OpticalPuzzleLevelSelectPanel extends Component {
    private _backdropNode: Node | null = null;
    private _panelNode: Node | null = null;
    private _titleNode: Node | null = null;
    private _closeNode: Node | null = null;
    private _scrollNode: Node | null = null;
    private _contentNode: Node | null = null;
    private _panelGraphics: Graphics | null = null;
    private _titleGraphics: Graphics | null = null;
    private _closeGraphics: Graphics | null = null;
    private _scrollFadeGraphics: Graphics | null = null;
    private _scrollBottomFadeGraphics: Graphics | null = null;
    private _closePressed = false;
    private _closePressCtrl: HudButtonPressController | null = null;
    private _itemNodes: Node[] = [];
    private readonly _onLevelItemSelectHandler = (levelId: number): void => {
        this._onLevelItemSelected(levelId);
    };
    private _sortedLevels: IOpticalLevelConfig[] = [];
    private _buildCursor = 0;
    private _listBuilding = false;

    protected onLoad(): void {
        this._hidePlaceholderSplashes();
        this._ensureRootLayout();
        this._buildUiTree();
        this._bindCloseButton();
        this._redrawStaticChrome();
        this.scheduleOnce(() => this.prewarmLevelList(), 0);
    }

    protected onEnable(): void {
        this._closePressCtrl?.bind();
        if (this.isLevelListReady()) {
            this.syncLevelListVisuals();
            this._scrollToCurrentLevelRowCenter();
        } else if (!this._listBuilding) {
            this.prewarmLevelList();
        }
    }

    /** 进入场景后分帧预构建（面板隐藏时加速，打开时不阻塞主线程） */
    prewarmLevelList(): void {
        this._startAsyncLevelListBuild(false);
    }

    /** 当前关 / 解锁进度变化后仅更新高亮，不重建节点 */
    syncLevelListVisuals(): void {
        if (!this.isLevelListReady()) {
            return;
        }
        this._applyLevelItemVisualStates();
    }

    /** 列表是否已全部创建并绘制完成 */
    isLevelListReady(): boolean {
        return !this._listBuilding && this._itemNodes.length === OPTICAL_LEVELS.length;
    }

    protected onDisable(): void {
        this._closePressCtrl?.unbind();
        this._closePressed = false;
    }

    protected onDestroy(): void {
        this.unschedule(this._processLevelListBuildBatch);
        this._closePressCtrl?.unbind();
        if (this._closeNode?.isValid) {
            this._closeNode.off(Button.EventType.CLICK, this._onCloseClick, this);
        }
        if (this._backdropNode?.isValid) {
            this._backdropNode.off(Node.EventType.TOUCH_END, this._onBackdropTouchEnd, this);
        }
    }

    /** 打开面板前/时调用：保证列表已构建并刷新解锁态（避免首次打开空白） */
    ensureLevelListReadyForOpen(): void {
        if (!this.isLevelListReady()) {
            if (!this._listBuilding) {
                this._startAsyncLevelListBuild(false);
            }
            while (this._listBuilding) {
                this._processLevelListBuildBatch();
            }
        }
        this.syncLevelListVisuals();
        this._scrollToCurrentLevelRowCenter();
        if (sys.platform === sys.Platform.WECHAT_GAME) {
            console.log('[LevelSelect] open', {
                maxUnlocked: this._resolveMaxUnlockedLevelId(),
                currentId: this._resolveCurrentPlayingLevelId(),
                clearPairs: DataManager.instance.getOpticalLevelClearPairCount(),
                level1Steps: DataManager.instance.getOpticalLevelBestSteps(1),
            });
        }
    }

    /** 关闭选关面板 */
    close(): void {
        if (this.node?.isValid) {
            this.node.active = false;
        }
    }

    /** 刷新关卡项（进度变化后调用） */
    refresh(): void {
        if (this.isLevelListReady()) {
            this.syncLevelListVisuals();
            return;
        }
        this.prewarmLevelList();
    }

    //#region UI 构建

    private _ensureRootLayout(): void {
        // 弹层根节点尺寸/Widget 由场景控制，脚本不覆盖
        if (!this.getComponent(UITransform)) {
            const ut = this.addComponent(UITransform);
            ut.setAnchorPoint(0.5, 0.5);
        }
    }

    private _buildUiTree(): void {
        this._backdropNode = this._ensureNamedChild('bg');
        this._ensureBackdrop(this._backdropNode);

        this._panelNode = this._ensureNamedChild('panel');
        this._ensurePanelBody(this._panelNode);

        this._titleNode = this._ensureNamedChild('titlebar');
        this._ensureTitleBar(this._titleNode);

        this._closeNode = this._ensureNamedChild('closebtn');
        this._ensureCloseButton(this._closeNode);

        this._scrollNode = this._ensureNamedChild('scrollpanel');
        this._ensureScrollArea(this._scrollNode);
    }

    private _ensureNamedChild(name: string): Node {
        let child = this.node.getChildByName(name);
        if (!child) {
            child = new Node(name);
            child.setParent(this.node);
        }
        return child;
    }

    /**
     * 场景已挂 UITransform 时不改尺寸/位置；仅脚本新建占位节点时写入默认值。
     */
    private _applyDefaultNodeLayout(
        node: Node,
        width: number,
        height: number,
        x: number,
        y: number,
        anchorX = 0.5,
        anchorY = 0.5,
    ): void {
        const hadTransform = !!node.getComponent(UITransform);
        const ut = node.getComponent(UITransform) ?? node.addComponent(UITransform);
        if (hadTransform) {
            return;
        }
        ut.setContentSize(width, height);
        ut.setAnchorPoint(anchorX, anchorY);
        node.setPosition(x, y, 0);
    }

    /** bg 全屏遮罩由场景自行表现；脚本只补点击拦截与点空白关闭 */
    private _ensureBackdrop(node: Node): void {
        if (!node.getComponent(UITransform)) {
            node.addComponent(UITransform);
        }
        if (!node.getComponent(BlockInputEvents)) {
            node.addComponent(BlockInputEvents);
        }
        this._removeGfxChild(node);
        node.off(Node.EventType.TOUCH_END, this._onBackdropTouchEnd, this);
        node.on(Node.EventType.TOUCH_END, this._onBackdropTouchEnd, this);
    }

    /** 面板内容区拦截触摸，避免穿透到 bg 触发关闭 */
    private _ensureTouchBlocker(node: Node): void {
        if (!node.getComponent(UITransform)) {
            node.addComponent(UITransform);
        }
        if (!node.getComponent(BlockInputEvents)) {
            node.addComponent(BlockInputEvents);
        }
    }

    /** 移除历史 gfx 绘图层（已改在 host 根节点 Graphics 绘制） */
    private _removeGfxChild(host: Node): void {
        const gfxNode = host.getChildByName(GFX_CHILD_NAME);
        if (gfxNode?.isValid) {
            gfxNode.destroy();
        }
    }

    /** 占位 Sprite 由脚本绘制接管，关闭以免与根节点 Graphics 叠显 */
    private _disableHostSprite(host: Node): void {
        const sprite = host.getComponent(Sprite);
        if (sprite) {
            sprite.enabled = false;
        }
    }

    private _ensurePanelBody(node: Node): void {
        this._applyDefaultNodeLayout(node, PANEL_WIDTH, PANEL_HEIGHT, 0, PANEL_OFFSET_Y);
        this._ensureTouchBlocker(node);
        this._removeGfxChild(node);
        this._disableHostSprite(node);
        this._panelGraphics = node.getComponent(Graphics) ?? node.addComponent(Graphics);
    }

    private _ensureTitleBar(node: Node): void {
        this._applyDefaultNodeLayout(node, TITLE_WIDTH, TITLE_HEIGHT, 0, TITLE_OFFSET_Y);
        this._ensureTouchBlocker(node);
        // 与 closebtn 一致：Graphics 挂 titlebar 根节点；勿与 Sprite 同节点（UIRenderer 互斥）
        this._removeGfxChild(node);
        this._disableHostSprite(node);
        this._titleGraphics = node.getComponent(Graphics) ?? node.addComponent(Graphics);
    }

    private _ensureCloseButton(node: Node): void {
        this._applyDefaultNodeLayout(node, CLOSE_SIZE, CLOSE_SIZE, CLOSE_OFFSET_X, CLOSE_OFFSET_Y);

        // 与 TopBar 返回键一致：Graphics 挂按钮根节点，避免 gfx 子节点抢触摸
        this._removeGfxChild(node);
        this._disableHostSprite(node);

        let btn = node.getComponent(Button);
        const createdBtn = !btn;
        if (!btn) {
            btn = node.addComponent(Button);
        }
        if (createdBtn) {
            btn.transition = Button.Transition.SCALE;
            btn.zoomScale = 0.95;
        }

        this._closeGraphics = node.getComponent(Graphics) ?? node.addComponent(Graphics);
        this._closePressCtrl = new HudButtonPressController(
            node,
            (pressed) => {
                this._closePressed = pressed;
                this._redrawCloseButton();
            },
            true,
        );
    }

    private _ensureScrollArea(node: Node): void {
        this._applyDefaultNodeLayout(node, SCROLL_WIDTH, SCROLL_HEIGHT, 0, SCROLL_OFFSET_Y);
        this._ensureTouchBlocker(node);
        this._disableHostSprite(node);
        node.getComponent(Mask) ?? node.addComponent(Mask);

        let scrollView = node.getComponent(ScrollView);
        const createdScrollView = !scrollView;
        if (!scrollView) {
            scrollView = node.addComponent(ScrollView);
        }
        if (createdScrollView) {
            scrollView.horizontal = false;
            scrollView.vertical = true;
            scrollView.inertia = true;
            scrollView.brake = 0.75;
            scrollView.elastic = true;
        }

        const scrollUt = node.getComponent(UITransform);
        const scrollW = scrollUt?.width ?? SCROLL_WIDTH;
        const scrollH = scrollUt?.height ?? SCROLL_HEIGHT;

        // CC 3.8：view 为只读 UITransform，Mask 挂在 ScrollView 节点；仅 content 可赋值
        let contentNode = this._resolveScrollContentNode(node);
        this._contentNode = contentNode;
        const hadContentTransform = !!contentNode.getComponent(UITransform);
        const contentUt = contentNode.getComponent(UITransform) ?? contentNode.addComponent(UITransform);
        if (!hadContentTransform) {
            contentUt.setAnchorPoint(0.5, 1);
            contentUt.setContentSize(scrollW, scrollH);
            contentNode.setPosition(0, scrollH * 0.5, 0);
        }

        scrollView.content = contentNode;
        this._scrollNode = node;

        const legacyView = node.getChildByName('view');
        if (legacyView?.isValid) {
            legacyView.active = false;
        }

        this._ensureScrollTopFade(node);
        this._ensureScrollBottomFade(node);
    }

    /** 滚动视口顶部渐隐蒙层（固定不随 content 滚动） */
    private _ensureScrollTopFade(scrollNode: Node): void {
        let fadeNode = scrollNode.getChildByName(SCROLL_FADE_TOP_CHILD_NAME);
        if (!fadeNode) {
            fadeNode = new Node(SCROLL_FADE_TOP_CHILD_NAME);
            fadeNode.setParent(scrollNode);
            fadeNode.addComponent(OpticalPuzzleLevelSelectScrollFadePassThrough);
        }
        fadeNode.setSiblingIndex(scrollNode.children.length - 1);

        const scrollUt = scrollNode.getComponent(UITransform);
        if (!scrollUt) {
            return;
        }
        const scrollH = scrollUt.height;
        const fadeW = LEVEL_SELECT_SCROLL_TOP_FADE_WIDTH;
        const fadeH = LEVEL_SELECT_SCROLL_TOP_FADE_HEIGHT;

        const ut = fadeNode.getComponent(UITransform) ?? fadeNode.addComponent(UITransform);
        ut.setAnchorPoint(0.5, 1);
        ut.setContentSize(fadeW, fadeH);
        fadeNode.setPosition(0, scrollH * 0.5, 0);

        this._scrollFadeGraphics = fadeNode.getComponent(Graphics) ?? fadeNode.addComponent(Graphics);
        this._redrawScrollTopFade();
    }

    /** 滚动视口底部渐隐蒙层（固定不随 content 滚动） */
    private _ensureScrollBottomFade(scrollNode: Node): void {
        let fadeNode = scrollNode.getChildByName(SCROLL_FADE_BOTTOM_CHILD_NAME);
        if (!fadeNode) {
            fadeNode = new Node(SCROLL_FADE_BOTTOM_CHILD_NAME);
            fadeNode.setParent(scrollNode);
            fadeNode.addComponent(OpticalPuzzleLevelSelectScrollFadePassThrough);
        }
        fadeNode.setSiblingIndex(scrollNode.children.length - 1);

        const scrollUt = scrollNode.getComponent(UITransform);
        if (!scrollUt) {
            return;
        }
        const scrollH = scrollUt.height;
        const fadeW = LEVEL_SELECT_SCROLL_BOTTOM_FADE_WIDTH;
        const fadeH = LEVEL_SELECT_SCROLL_BOTTOM_FADE_HEIGHT;

        const ut = fadeNode.getComponent(UITransform) ?? fadeNode.addComponent(UITransform);
        ut.setAnchorPoint(0.5, 0);
        ut.setContentSize(fadeW, fadeH);
        fadeNode.setPosition(0, -scrollH * 0.5, 0);

        this._scrollBottomFadeGraphics = fadeNode.getComponent(Graphics) ?? fadeNode.addComponent(Graphics);
        this._redrawScrollBottomFade();
    }

    private _redrawScrollTopFade(): void {
        const g = this._scrollFadeGraphics;
        const ut = g?.node.getComponent(UITransform);
        if (!g?.isValid || !ut) {
            return;
        }
        g.clear();
        const w = ut.width;
        const h = ut.height;
        drawLevelSelectScrollTopFade(g, -w * 0.5, -h, w, h);
    }

    private _redrawScrollBottomFade(): void {
        const g = this._scrollBottomFadeGraphics;
        const ut = g?.node.getComponent(UITransform);
        if (!g?.isValid || !ut) {
            return;
        }
        g.clear();
        const w = ut.width;
        const h = ut.height;
        drawLevelSelectScrollBottomFade(g, -w * 0.5, 0, w, h);
    }

    /** 解析 content 节点：优先 scrollpanel/content，兼容旧结构 scrollpanel/view/content */
    private _resolveScrollContentNode(scrollNode: Node): Node {
        let contentNode = scrollNode.getChildByName('content');
        if (contentNode?.isValid) {
            if (contentNode.parent !== scrollNode) {
                contentNode.setParent(scrollNode);
            }
            return contentNode;
        }

        const legacyView = scrollNode.getChildByName('view');
        contentNode = legacyView?.getChildByName('content') ?? null;
        if (contentNode?.isValid) {
            contentNode.setParent(scrollNode);
            return contentNode;
        }

        contentNode = new Node('content');
        contentNode.setParent(scrollNode);
        return contentNode;
    }

    private _bindCloseButton(): void {
        if (!this._closeNode?.isValid) {
            return;
        }
        this._closeNode.off(Button.EventType.CLICK, this._onCloseClick, this);
        this._closeNode.on(Button.EventType.CLICK, this._onCloseClick, this);
    }

    private _hidePlaceholderSplashes(): void {
        const walk = (node: Node): void => {
            if (node.name === 'SpriteSplash') {
                node.active = false;
            }
            for (const child of node.children) {
                walk(child);
            }
        };
        for (const child of this.node.children) {
            walk(child);
        }
    }

    //#endregion

    //#region 绘制

    private _redrawStaticChrome(): void {
        this._redrawPanelBody();
        this._redrawTitleBar();
        this._redrawCloseButton();
        this._redrawScrollTopFade();
        this._redrawScrollBottomFade();
    }

    private _redrawPanelBody(): void {
        const g = this._panelGraphics;
        const ut = this._panelNode?.getComponent(UITransform);
        if (!g?.isValid || !ut) {
            return;
        }
        g.clear();
        const w = ut.width;
        const h = ut.height;
        drawLevelSelectPanelChrome(g, -w * 0.5, -h * 0.5, w, h);
    }

    private _redrawTitleBar(): void {
        const g = this._titleGraphics;
        const ut = this._titleNode?.getComponent(UITransform);
        if (!g?.isValid || !ut) {
            return;
        }
        g.clear();
        const w = ut.width;
        const h = ut.height;
        drawLevelSelectTitleBar(g, -w * 0.5, -h * 0.5, w, h);
    }

    private _redrawCloseButton(): void {
        const g = this._closeGraphics;
        const ut = this._closeNode?.getComponent(UITransform);
        if (!g?.isValid || !ut) {
            return;
        }
        g.clear();
        const w = ut.width;
        const h = ut.height;
        drawLevelSelectCloseGlyph(g, -w * 0.5, -h * 0.5, w, h, this._closePressed);
    }

    //#endregion

    //#region 关卡列表

    /** 进度或关卡表变化后全量重建 */
    private _refreshLevelList(): void {
        this._startAsyncLevelListBuild(true);
    }

    private _startAsyncLevelListBuild(force = false): void {
        const content = this._contentNode;
        if (!content?.isValid) {
            return;
        }
        if (this._listBuilding) {
            return;
        }
        if (!force && this.isLevelListReady()) {
            return;
        }

        for (const item of this._itemNodes) {
            if (item?.isValid) {
                item.destroy();
            }
        }
        this._itemNodes = [];

        this._sortedLevels = [...OPTICAL_LEVELS].sort((a, b) => a.levelId - b.levelId);
        this._buildCursor = 0;
        this._listBuilding = true;
        this._updateContentHeight(this._sortedLevels.length);

        this.unschedule(this._processLevelListBuildBatch);
        this.schedule(this._processLevelListBuildBatch, 0);
    }

    private _processLevelListBuildBatch = (): void => {
        if (!this._listBuilding || !this.isValid) {
            this.unschedule(this._processLevelListBuildBatch);
            return;
        }
        const content = this._contentNode;
        if (!content?.isValid) {
            this._listBuilding = false;
            this.unschedule(this._processLevelListBuildBatch);
            return;
        }

        const maxUnlocked = this._resolveMaxUnlockedLevelId();
        const currentId = this._resolveCurrentPlayingLevelId();
        const batch = this.node.activeInHierarchy
            ? LEVEL_LIST_BUILD_BATCH
            : LEVEL_LIST_PREWARM_BATCH;
        const end = Math.min(this._buildCursor + batch, this._sortedLevels.length);

        for (let i = this._buildCursor; i < end; i++) {
            const level = this._sortedLevels[i];
            const itemNode = createLevelSelectItemNode(`LevelItem_${level.levelId}`);
            itemNode.setParent(content);
            this._layoutSingleLevelItem(itemNode, i);

            let visualState = LevelSelectItemVisualState.Normal;
            if (level.levelId > maxUnlocked) {
                visualState = LevelSelectItemVisualState.Locked;
            } else if (level.levelId === currentId) {
                visualState = LevelSelectItemVisualState.Current;
            }

            itemNode.getComponent(OpticalPuzzleLevelSelectItemView)?.setup(
                level.levelId,
                visualState,
                this._onLevelItemSelectHandler,
            );
            this._itemNodes.push(itemNode);
        }
        this._buildCursor = end;

        if (this._buildCursor >= this._sortedLevels.length) {
            this._listBuilding = false;
            this.unschedule(this._processLevelListBuildBatch);
            this.syncLevelListVisuals();
            if (this.node.activeInHierarchy) {
                this._scrollToCurrentLevelRowCenter();
            }
        }
    };

    /** 当前关所在行滚到视口垂直中心；不够居中则滚到顶/底 */
    private _scrollToCurrentLevelRowCenter(): void {
        const scrollView = this._scrollNode?.getComponent(ScrollView);
        if (!scrollView?.isValid || !this._contentNode?.isValid) {
            return;
        }

        const scrollUt = this._scrollNode!.getComponent(UITransform);
        if (!scrollUt) {
            return;
        }

        const currentId = this._resolveCurrentPlayingLevelId();
        const levels = this._sortedLevels.length > 0
            ? this._sortedLevels
            : [...OPTICAL_LEVELS].sort((a, b) => a.levelId - b.levelId);
        const index = levels.findIndex((lv) => lv.levelId === currentId);
        if (index < 0) {
            scrollView.scrollToTop(0);
            return;
        }

        const scrollH = scrollUt.height;
        const cellSize = LEVEL_SELECT_ITEM_DESIGN_SIZE;
        const gap = computeLevelSelectGridGap(scrollUt.width, GRID_COLUMNS, cellSize);
        const row = Math.floor(index / GRID_COLUMNS);
        const rowCenterFromTop = gap + row * (cellSize + gap) + cellSize * 0.5;
        const targetOffsetY = rowCenterFromTop - scrollH * 0.5;

        const contentH = this._contentNode.getComponent(UITransform)?.height ?? scrollH;
        const maxOffsetY = Math.max(0, contentH - scrollH);
        if (targetOffsetY <= 0 || maxOffsetY <= 0) {
            scrollView.scrollToTop(0);
            return;
        }
        if (targetOffsetY >= maxOffsetY) {
            scrollView.scrollToBottom(0);
            return;
        }
        scrollView.scrollToOffset(new Vec2(0, targetOffsetY), 0);
    }

    private _applyLevelItemVisualStates(): void {
        const maxUnlocked = this._resolveMaxUnlockedLevelId();
        const currentId = this._resolveCurrentPlayingLevelId();
        for (const itemNode of this._itemNodes) {
            if (!itemNode?.isValid) {
                continue;
            }
            const view = itemNode.getComponent(OpticalPuzzleLevelSelectItemView);
            const levelId = view?.getLevelId() ?? 0;
            if (levelId <= 0) {
                continue;
            }
            let visualState = LevelSelectItemVisualState.Normal;
            if (levelId > maxUnlocked) {
                visualState = LevelSelectItemVisualState.Locked;
            } else if (levelId === currentId) {
                visualState = LevelSelectItemVisualState.Current;
            }
            view?.applyVisualState(visualState);
            view?.refresh();
        }
    }

    private _layoutSingleLevelItem(node: Node, index: number): void {
        const scrollUt = this._scrollNode?.getComponent(UITransform);
        const scrollW = scrollUt?.width ?? SCROLL_WIDTH;
        const cellSize = LEVEL_SELECT_ITEM_DESIGN_SIZE;
        const cols = GRID_COLUMNS;
        const gap = computeLevelSelectGridGap(scrollW, cols, cellSize);
        const row = Math.floor(index / cols);
        const col = index % cols;
        const cx = levelSelectItemCenterX(scrollW, cellSize, gap, col);
        const cy = -gap - row * (cellSize + gap) - cellSize * 0.5;
        node.setPosition(cx, cy, 0);
    }

    private _updateContentHeight(itemCount: number): void {
        const content = this._contentNode;
        if (!content?.isValid) {
            return;
        }
        const legacyLayout = content.getComponent(Layout);
        if (legacyLayout) {
            legacyLayout.enabled = false;
        }

        const scrollUt = this._scrollNode?.getComponent(UITransform);
        const scrollW = scrollUt?.width ?? SCROLL_WIDTH;
        const scrollH = scrollUt?.height ?? SCROLL_HEIGHT;
        const cellSize = LEVEL_SELECT_ITEM_DESIGN_SIZE;
        const gap = computeLevelSelectGridGap(scrollW, GRID_COLUMNS, cellSize);
        const rowCount = Math.max(1, Math.ceil(itemCount / GRID_COLUMNS));

        const contentUt = content.getComponent(UITransform);
        if (contentUt) {
            contentUt.setAnchorPoint(0.5, 1);
            contentUt.width = scrollW;
            const contentH = gap + rowCount * cellSize + Math.max(0, rowCount - 1) * gap + gap;
            contentUt.height = Math.max(scrollH, contentH);
        }
    }

    /** Menu 场景用存档进度；Game 场景优先用局内当前关卡 */
    private _resolveCurrentPlayingLevelId(): number {
        if (director.getScene()?.name === SCENE_ENUM.GAME) {
            const root = this._resolveOpticalPuzzleRoot();
            const inGameId = root?.getCurrentLevelId?.() ?? 0;
            if (inGameId > 0) {
                return inGameId;
            }
        }
        return DataManager.instance.opticalCurrentLevelId;
    }

    /** 解锁前沿：仅由通关记录推算（无 clears 时 DataManager 回退 currentLevelId 兼容旧档） */
    private _resolveMaxUnlockedLevelId(): number {
        return DataManager.instance.getOpticalMaxUnlockedLevelId();
    }

    //#endregion

    //#region 交互

    /** 仅点击 bg 空白遮罩时关闭（不响应 panel/titlebar 等穿透或冒泡） */
    private _onBackdropTouchEnd(event: EventTouch): void {
        if (event.target !== this._backdropNode) {
            return;
        }
        PLAY_AUDIO.emit(EVENT_ENUM.PLAY_AUDIO, AUDIO_EFFECT_ENUM.CLICK_BUTTON);
        this.close();
    }

    private _onCloseClick(): void {
        PLAY_AUDIO.emit(EVENT_ENUM.PLAY_AUDIO, AUDIO_EFFECT_ENUM.CLICK_BUTTON);
        this.close();
    }

    private _onLevelItemSelected(levelId: number): void {
        const maxUnlocked = this._resolveMaxUnlockedLevelId();
        if (levelId > maxUnlocked) {
            SHOW_TOAST.emit(EVENT_ENUM.SHOW_TOAST, {
                message: '关卡尚未解锁',
                bgWidth: 320,
            });
            return;
        }

        PLAY_AUDIO.emit(EVENT_ENUM.PLAY_AUDIO, AUDIO_EFFECT_ENUM.CLICK_BUTTON);
        DataManager.instance.opticalCurrentLevelId = levelId;
        this.close();

        if (director.getScene()?.name === SCENE_ENUM.GAME) {
            this._resolveOpticalPuzzleRoot()?.loadLevelById(levelId);
            return;
        }
        director.loadScene(SCENE_ENUM.GAME);
    }

    private _resolveGameRoot(): Node | null {
        let node: Node | null = this.node;
        while (node?.parent) {
            if (node.name === 'GameRoot') {
                return node;
            }
            node = node.parent;
        }
        return null;
    }

    private _resolveOpticalPuzzleRoot(): IOpticalPuzzleRootApi | null {
        const gameRoot = this._resolveGameRoot();
        if (!gameRoot?.isValid) {
            return null;
        }
        const comp =
            gameRoot.getComponent('OpticalPuzzleRoot') ??
            gameRoot.getComponentInChildren('OpticalPuzzleRoot');
        return comp as unknown as IOpticalPuzzleRootApi | null;
    }

    //#endregion
}

/** 为选关面板根节点挂上完整逻辑（复制空节点时可由 Manager 调用） */
export function ensureLevelSelectPanel(panelNode: Node | null): void {
    if (!panelNode?.isValid) {
        return;
    }
    if (!panelNode.getComponent(OpticalPuzzleLevelSelectPanel)) {
        panelNode.addComponent(OpticalPuzzleLevelSelectPanel);
    }
}

/** 进入场景后预构建选关列表（Game / Menu 的 Manager onLoad 调用） */
export function prewarmLevelSelectPanel(panelNode: Node | null): void {
    panelNode?.getComponent(OpticalPuzzleLevelSelectPanel)?.prewarmLevelList();
}

/** 打开选关面板并刷新解锁状态 */
export function openLevelSelectPanel(panelNode: Node | null): void {
    if (!panelNode?.isValid) {
        return;
    }
    panelNode.active = true;
    panelNode.getComponent(OpticalPuzzleLevelSelectPanel)?.ensureLevelListReadyForOpen();
}

/** 同步当前关 / 解锁高亮（换关、通关后调用） */
export function syncLevelSelectPanelVisuals(panelNode: Node | null): void {
    panelNode?.getComponent(OpticalPuzzleLevelSelectPanel)?.syncLevelListVisuals();
}

/** 自场景根解析 layerOverlay 下选关面板（兼容 levelSelectPanel / LevelSelectPanel 命名） */
export function resolveLevelSelectPanelNode(root: Node | null): Node | null {
    const overlay = root?.getChildByName('layerOverlay') ?? null;
    if (!overlay?.isValid) {
        return null;
    }
    return (
        overlay.getChildByName('levelSelectPanel') ??
        overlay.getChildByName('LevelSelectPanel') ??
        null
    );
}
