import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import type { RspressPlugin } from '@rspress/core';

// navbar 项里额外支持自定义字段 scanDir，用于声明需要扫描的目录
export interface AutoSidebarNavItem {
    text: string;
    link?: string;
    items?: AutoSidebarNavItem[];
    children?: AutoSidebarNavItem[];
    scanDir?: string;
    reverse?: boolean;
    // 允许透传其它字段
    [key: string]: unknown;
}

export interface AutoSidebarOptions {
    /**
     * 用户传入的 navbar 配置
     */
    navbar?: AutoSidebarNavItem[];
    /**
     * 文档根目录，相对于项目 root，默认 'docs'
     */
    docsDir?: string;
    /**
     * 全局默认排序方向，可被 navbar 单项覆盖
     */
    reverse?: boolean;
}

interface ScanEntry {
    scanDir: string;
    text?: string;
    reverse: boolean;
}

function collectScanEntries(navbarItems: AutoSidebarNavItem[], defaultReverse: boolean): ScanEntry[] {
    const entries: ScanEntry[] = [];

    const traverse = (items: AutoSidebarNavItem[], inheritedReverse: boolean) => {
        for (const item of items) {
            const currentReverse = item.reverse ?? inheritedReverse;

            if (item.items && item.items.length > 0) {
                traverse(item.items as AutoSidebarNavItem[], currentReverse);
            } else if (item.children && item.children.length > 0) {
                traverse(item.children as AutoSidebarNavItem[], currentReverse);
            }

            if (item.scanDir) {
                entries.push({
                    scanDir: item.scanDir,
                    text: item.text,
                    reverse: currentReverse,
                });
            }
        }
    };

    if (navbarItems && navbarItems.length > 0) {
        traverse(navbarItems, defaultReverse);
    }
    return entries;
}

function splitPath(itemPath: string, docsDir: string): string {
    const docsRoot = path.resolve(process.cwd(), docsDir);
    const relativePath = path.relative(docsRoot, itemPath);
    return `/${relativePath.replace(/\\/g, '/')}`;
}

// 递归遍历目录，生成单个 scanDir 下的 sidebar items
function listFilesInDirectory(
    directoryPath: string,
    docsDir: string,
    array: { text: string; link: string }[],
    reverse: boolean,
): void {
    if (!fs.existsSync(directoryPath)) {
        return;
    }

    const items = fs.readdirSync(directoryPath);
    const allItems: { text: string; link: string; sort?: number; isOverview: boolean }[] = [];

    for (const item of items) {
        if (item.startsWith('_') || item.startsWith('.')) continue;
        const itemPath = path.join(directoryPath, item);
        const stats = fs.statSync(itemPath);

        if (stats.isDirectory()) {
            listFilesInDirectory(itemPath, docsDir, array, reverse);
        } else {
            if (!itemPath.endsWith('.md') && !itemPath.endsWith('.mdx')) continue;

            const content = fs.readFileSync(itemPath, 'utf-8');

            let title = '';
            let isOverview = false;
            let sort: number | undefined;
            try {
                const parsed = matter(content);
                const { title: rawTitle, overview, sort: rawSort } = parsed.data;
                title = typeof rawTitle === 'string' ? rawTitle : '';
                isOverview = overview === true;
                sort = typeof rawSort === 'number' ? rawSort : undefined;
            } catch {
                // 忽略 frontmatter 错误
            }

            const fileName = path.basename(itemPath, path.extname(itemPath));
            const linkPath = splitPath(itemPath, docsDir).replace(/\.(md|mdx)$/, '');
            const sidebarItem = {
                text: title || fileName,
                link: linkPath,
                sort,
                isOverview,
            };

            allItems.push(sidebarItem);
        }
    }

    // 按优先级排序：
    // 1. overview 排在最前面
    // 2. 有 sort 字段的排在前面
    // 3. sort 字段值根据 reverse 决定升序或降序
    // 4. 没有 sort 字段的，保持默认顺序
    allItems.sort((a, b) => {
        // 1. overview 优先 (true 在前)
        const overviewSort = Number(b.isOverview) - Number(a.isOverview);
        if (overviewSort !== 0) {
            return overviewSort;
        }

        // 2. 按 sort 字段排序，undefined 始终排在最后
        if (a.sort === undefined) {
            return b.sort === undefined ? 0 : 1;
        }
        if (b.sort === undefined) {
            return -1;
        }

        return reverse ? b.sort - a.sort : a.sort - b.sort;
    });

    // 移除 isOverview 属性，只保留必要字段
    const processedItems = allItems.map(({ isOverview, sort, ...item }) => item);
    array.push(...processedItems);

}

export function generateSidebarFromNavbar(
    navbar: AutoSidebarNavItem[],
    docsDir = 'docs',
    defaultReverse = false,
): Record<string, { text: string; link?: string; items?: { text: string; link: string }[] }[]> {
    const scanEntries = collectScanEntries(navbar, defaultReverse);
    const sidebar: Record<string, { text: string; link?: string; items?: { text: string; link: string }[] }[]> = {};

    for (const { scanDir, reverse } of scanEntries) {
        const cleanScanDir = scanDir.replace(/^\/+/, '').replace(/\/+$/, '');
        const directoryToScan = path.resolve(process.cwd(), docsDir, cleanScanDir);
        const items: { text: string; link: string }[] = [];
        listFilesInDirectory(directoryToScan, docsDir, items, reverse);

        if (items.length === 0) continue;

        const key = `/${cleanScanDir}/`;

        sidebar[key] = items;
    }

    return sidebar;
}

export function pluginAutoSidebar(options: AutoSidebarOptions = {}): RspressPlugin {
    const docsDir = options.docsDir ?? 'docs';
    const reverse = options.reverse ?? false;

    return {
        name: 'rspress-plugin-auto-sidebar',
        config(config) {
            const themeConfig = (config as any).themeConfig ?? {};
            const navbar = options.navbar ?? themeConfig.nav ?? [];

            const generatedSidebar = generateSidebarFromNavbar(navbar, docsDir, reverse);

            const newThemeConfig = {
                ...themeConfig,
                sidebar: {
                    ...(themeConfig.sidebar || {}),
                    ...generatedSidebar,
                },
            };

            if (options.navbar) {
                newThemeConfig.nav = options.navbar;
            }

            return {
                ...config,
                themeConfig: newThemeConfig,
            };
        },
    };
}
