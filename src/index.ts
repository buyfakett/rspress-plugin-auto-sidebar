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
}

interface ScanEntry {
    scanDir: string;
    text?: string;
}

function collectScanEntries(navbarItems: AutoSidebarNavItem[]): ScanEntry[] {
    const entries: ScanEntry[] = [];

    const traverse = (items: AutoSidebarNavItem[]) => {
        for (const item of items) {
            if (item.items && item.items.length > 0) {
                traverse(item.items as AutoSidebarNavItem[]);
            } else if (item.children && item.children.length > 0) {
                traverse(item.children as AutoSidebarNavItem[]);
            }

            if (item.scanDir) {
                entries.push({
                    scanDir: item.scanDir,
                    text: item.text,
                });
            }
        }
    };

    if (navbarItems && navbarItems.length > 0) {
        traverse(navbarItems);
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
            listFilesInDirectory(itemPath, docsDir, array);
        } else {
            if (!itemPath.endsWith('.md') && !itemPath.endsWith('.mdx')) continue;

            const content = fs.readFileSync(itemPath, 'utf-8');

            let title = '';
            let isOverview = false;
            let sort: number | undefined;
            try {
                const parsed = matter(content);
                title = (parsed.data as any).title || '';
                isOverview = (parsed.data as any).overview === true;
                sort = (parsed.data as any).sort;
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
    // 3. sort 字段值小的排在前面
    // 4. 没有 sort 字段的，保持默认顺序
    allItems.sort((a, b) => {
        // overview 优先
        if (a.isOverview && !b.isOverview) {
            return -1;
        }
        if (!a.isOverview && b.isOverview) {
            return 1;
        }
        // 都为 overview 或都不为 overview，按 sort 字段排序
        // 有 sort 字段的排在前面
        if (a.sort !== undefined && b.sort === undefined) {
            return -1;
        }
        if (a.sort === undefined && b.sort !== undefined) {
            return 1;
        }
        // 都有 sort 字段，按值排序
        if (a.sort !== undefined && b.sort !== undefined) {
            return a.sort - b.sort;
        }
        // 都没有 sort 字段，保持默认顺序
        return 0;
    });

    // 移除 isOverview 属性，只保留必要字段
    const processedItems = allItems.map(({ isOverview, sort, ...item }) => item);
    array.push(...processedItems);

}

export function generateSidebarFromNavbar(
    navbar: AutoSidebarNavItem[],
    docsDir = 'docs',
): Record<string, { text: string; link?: string; items?: { text: string; link: string }[] }[]> {
    const scanEntries = collectScanEntries(navbar);
    const sidebar: Record<string, { text: string; link?: string; items?: { text: string; link: string }[] }[]> = {};

    for (const { scanDir, text } of scanEntries) {
        const cleanScanDir = scanDir.replace(/^\/+/, '').replace(/\/+$/, '');
        const directoryToScan = path.resolve(process.cwd(), docsDir, cleanScanDir);
        const items: { text: string; link: string }[] = [];
        listFilesInDirectory(directoryToScan, docsDir, items);

        if (items.length === 0) continue;

        const key = `/${cleanScanDir}/`;

        sidebar[key] = items;
    }

    return sidebar;
}

export function pluginAutoSidebar(options: AutoSidebarOptions = {}): RspressPlugin {
    const docsDir = options.docsDir ?? 'docs';

    return {
        name: 'rspress-plugin-auto-sidebar',
        config(config) {
            const themeConfig = (config as any).themeConfig ?? {};
            const navbar = options.navbar ?? themeConfig.nav ?? [];

            const generatedSidebar = generateSidebarFromNavbar(navbar, docsDir);

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

