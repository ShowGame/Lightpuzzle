#!/usr/bin/env node
/**
 * 将 assets 目录下所有源码合并为单文件（软著提交用），并删除空白行。
 *
 * 用法:
 *   node tools/merge-assets-code.js
 *   node tools/merge-assets-code.js -o 软著申请材料/光学迷宫软件代码.txt
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const ASSETS_DIR = path.join(PROJECT_ROOT, 'assets');
const DEFAULT_OUT = path.join(PROJECT_ROOT, '软著申请材料', '光学迷宫软件代码合并.txt');

const CODE_EXTS = new Set(['.ts', '.js', '.tsx', '.jsx']);

/** 递归收集 assets 下源码文件 */
function collectCodeFiles(dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules') continue;
            collectCodeFiles(full, out);
            continue;
        }
        if (!entry.isFile()) continue;
        const ext = path.extname(entry.name).toLowerCase();
        if (CODE_EXTS.has(ext) || entry.name.endsWith('.d.ts')) {
            out.push(full);
        }
    }
    return out;
}

/** 删除空白行（含仅含空格/制表符的行） */
function stripBlankLines(text) {
    return text
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0)
        .join('\n');
}

function parseArgs(argv) {
    let outPath = DEFAULT_OUT;
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '-o' && argv[i + 1]) {
            outPath = path.resolve(PROJECT_ROOT, argv[i + 1]);
            i++;
        } else if (argv[i] === '-h' || argv[i] === '--help') {
            console.log(`用法: node tools/merge-assets-code.js [-o 输出路径]`);
            console.log(`默认输出: ${DEFAULT_OUT}`);
            process.exit(0);
        }
    }
    return outPath;
}

function main() {
    if (!fs.existsSync(ASSETS_DIR)) {
        console.error(`未找到 assets 目录: ${ASSETS_DIR}`);
        process.exit(1);
    }

    const outPath = parseArgs(process.argv.slice(2));
    const files = collectCodeFiles(ASSETS_DIR).sort((a, b) =>
        a.localeCompare(b, 'en', { sensitivity: 'base' }),
    );

    const parts = [
        '// ===== LightPuzzle / 光学迷宫 assets 源码合并（软著用） =====',
        `// 生成时间: ${new Date().toLocaleString('zh-CN', { hour12: false })}`,
        `// 源文件数: ${files.length}`,
    ];

    for (const file of files) {
        const rel = path.relative(PROJECT_ROOT, file).replace(/\\/g, '/');
        const raw = fs.readFileSync(file, 'utf8');
        parts.push(`// -------- ${rel} --------`);
        parts.push(stripBlankLines(raw));
    }

    const merged = `${parts.join('\n')}\n`;
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, merged, 'utf8');

    const lineCount = merged.split('\n').length - 1;
    console.log(`已合并 ${files.length} 个文件`);
    console.log(`输出: ${outPath}`);
    console.log(`总行数（已去空白行）: ${lineCount}`);
}

main();
