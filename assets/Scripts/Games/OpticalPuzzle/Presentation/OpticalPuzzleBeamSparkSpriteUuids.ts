/** 主包内粒子火花 SpriteFrame UUID（与 assets/Sprites/OpticalFX 下 png.meta 中 f9941 一致） */
export const BEAM_SPARK_SPRITE_UUIDS: Readonly<Record<string, string>> = {
    red: '2752aa51-5e0c-476b-ab35-e9b6485d7056@f9941',
    green: '5d69d4f2-6998-4b22-8dfa-5331abffd135@f9941',
    blue: '7fb70a4a-c46c-45cd-acf6-6454a5680f2f@f9941',
    yellow: '4a39292d-6c36-4b85-84df-a6579a82f60e@f9941',
    cyan: '7208d0b3-e155-4c8c-8c23-5054c3574f5b@f9941',
    purple: '6accf15d-4ddf-4801-bce7-0a234dbccbd6@f9941',
    white: '4b9aae35-0034-4b5c-b7f9-1e61ea071125@f9941',
};

/** resources 目录路径（主包内置 bundle，非远程分包；微信构建必进包） */
export const BEAM_SPARK_RESOURCE_PATHS: Readonly<Record<string, string>> = {
    red: 'OpticalFX/beam_spark_red/spriteFrame',
    green: 'OpticalFX/beam_spark_green/spriteFrame',
    blue: 'OpticalFX/beam_spark_blue/spriteFrame',
    yellow: 'OpticalFX/beam_spark_yellow/spriteFrame',
    cyan: 'OpticalFX/beam_spark_cyan/spriteFrame',
    purple: 'OpticalFX/beam_spark_purple/spriteFrame',
    white: 'OpticalFX/beam_spark_white/spriteFrame',
};
