import { Color } from 'cc';

/** 棋盘逻辑格边长（像素） */
export const OPTICAL_CELL_SIZE = 56;

/** 墙心 / 默认外扩 / 左上补块 #40c3f9 */
export const WALL_LIGHT_FILL = new Color(0x40, 0xc3, 0xf9, 255);

/** 默认外扩（同 WALL_LIGHT_FILL）；贴地板侧外扩改用 WALL_DARK_FILL */
export const WALL_ARM_FILL = WALL_LIGHT_FILL;

/** 贴地板侧深臂 / 右下补块 #226c8f */
export const WALL_DARK_FILL = new Color(0x22, 0x6c, 0x8f, 255);

/** 墙心正方形边长 */
export const WALL_CORE_SIZE = 28;

/** 四向臂厚度（与墙角缺口一致） */
export const WALL_ARM_THICK = 14;

/** 墙角补块边长 / 圆角半径 */
export const WALL_CORNER_PATCH = 14;

/** 2×2 墙块内角强制补丁色 #3093bc */
export const WALL_BLOCK_PATCH_FILL = new Color(0x30, 0x93, 0xbc, 255);

/** 叠层统一色（墙心 + 外臂 + 角补） #3093bc */
export const WALL_OVERLAY_FILL = new Color(0x30, 0x93, 0xbc, 255);

/** 叠层四向臂厚度 / 角补边长（自墙心面向外，4×4） */
export const WALL_OVERLAY_ARM = 4;

/** 叠层邻墙连通扩展额外重叠（消除接缝，用于上下） */
export const WALL_OVERLAY_CONNECT_PAD = 1;

/** 叠层左右连通扩展额外重叠（跨格缝再压 1px） */
export const WALL_OVERLAY_CONNECT_PAD_H = 1;

/** 地板（透明） */
export const FLOOR_FILL = new Color(0x12, 0x37, 0x49, 0);
