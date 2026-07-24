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

export type AutoSidebarItem = { text: string; link: string };
export type AutoSidebar = Record<string, AutoSidebarItem[]>;

export interface AutoSidebarLocaleOptions {
    /**
     * 当前语言，如 'en'、'zh'
     */
    lang: string;
    /**
     * 语言显示名称，若已在 Rspress 顶层 locales 或 themeConfig.locales 中配置，可省略
     */
    label?: string;
    title?: string;
    description?: string;
    /**
     * 当前语言的 navbar 配置
     */
    navbar?: AutoSidebarNavItem[];
    /**
     * 与 Rspress themeConfig.locales[].nav 对齐的别名
     */
    nav?: AutoSidebarNavItem[];
    /**
     * 当前语言的文档根目录，相对于项目 root，默认继承全局 docsDir
     */
    docsDir?: string;
    /**
     * 当前语言默认排序方向，可覆盖全局 reverse
     */
    reverse?: boolean;
    /**
     * 当前语言已有 sidebar，会和自动生成结果合并
     */
    sidebar?: AutoSidebar;
    [key: string]: unknown;
}

export interface AutoSidebarOptions {
    /**
     * 用户传入的 navbar 配置
     */
    navbar?: AutoSidebarNavItem[];
    /**
     * 多语言配置。单语言无需配置，继续使用 navbar 或 themeConfig.nav 即可
     */
    locales?: AutoSidebarLocaleOptions[];
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

interface LocaleContext {
    lang: string;
    defaultLang: string;
}

type ThemeLocaleConfig = AutoSidebarLocaleOptions;

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

function splitPath(itemPath: string, routeRootDir: string): string {
    const docsRoot = path.resolve(process.cwd(), routeRootDir);
    const relativePath = path.relative(docsRoot, itemPath);
    return `/${relativePath.replace(/\\/g, '/')}`;
}

function cleanRoutePath(input: string): string {
    return input.replace(/^\/+/, '').replace(/\/+$/, '');
}

function normalizeSidebarKey(cleanPath: string): string {
    return cleanPath ? `/${cleanPath}/` : '/';
}

function stripLocalePrefix(cleanPath: string, lang: string): string {
    const cleanLang = cleanRoutePath(lang);
    if (!cleanLang) return cleanPath;
    if (cleanPath === cleanLang) return '';
    if (cleanPath.startsWith(`${cleanLang}/`)) {
        return cleanPath.slice(cleanLang.length + 1);
    }
    return cleanPath;
}

function getLocaleRoutePrefix(locale: LocaleContext): string {
    return locale.lang && locale.lang !== locale.defaultLang ? cleanRoutePath(locale.lang) : '';
}

function getSidebarKey(cleanScanDir: string, locale?: LocaleContext): string {
    if (!locale) {
        return normalizeSidebarKey(cleanScanDir);
    }

    const scanDirWithoutLang = stripLocalePrefix(cleanScanDir, locale.lang);
    const localePrefix = getLocaleRoutePrefix(locale);
    return normalizeSidebarKey([localePrefix, scanDirWithoutLang].filter(Boolean).join('/'));
}

// 递归遍历目录，生成单个 scanDir 下的 sidebar items
function listFilesInDirectory(
    directoryPath: string,
    routeRootDir: string,
    array: AutoSidebarItem[],
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
            listFilesInDirectory(itemPath, routeRootDir, array, reverse);
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
            const linkPath = splitPath(itemPath, routeRootDir).replace(/\.(md|mdx)$/, '');
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
    locale?: LocaleContext,
): AutoSidebar {
    const scanEntries = collectScanEntries(navbar, defaultReverse);
    const sidebar: AutoSidebar = {};

    for (const { scanDir, reverse } of scanEntries) {
        const cleanScanDir = cleanRoutePath(scanDir);
        const scanDirWithoutLang = locale ? stripLocalePrefix(cleanScanDir, locale.lang) : cleanScanDir;
        const routeRootDir = locale ? path.join(docsDir, locale.lang) : docsDir;
        const directoryToScan = path.resolve(process.cwd(), routeRootDir, scanDirWithoutLang);
        const items: AutoSidebarItem[] = [];
        listFilesInDirectory(directoryToScan, routeRootDir, items, reverse);

        if (items.length === 0) continue;

        const key = getSidebarKey(cleanScanDir, locale);

        sidebar[key] = items;
    }

    return sidebar;
}

function getConfiguredLocales(config: any, themeConfig: any, optionLocales: AutoSidebarLocaleOptions[]): ThemeLocaleConfig[] {
    const localesByLang = new Map<string, ThemeLocaleConfig>();

    for (const locale of [
        ...((config.locales ?? []) as ThemeLocaleConfig[]),
        ...((themeConfig.locales ?? []) as ThemeLocaleConfig[]),
        ...optionLocales,
    ]) {
        if (!locale?.lang) continue;
        const previousLocale = localesByLang.get(locale.lang) ?? {};
        localesByLang.set(locale.lang, {
            ...previousLocale,
            ...locale,
        } as ThemeLocaleConfig);
    }

    return Array.from(localesByLang.values());
}

function getLocaleNavbar(
    locale: ThemeLocaleConfig,
    optionLocales: AutoSidebarLocaleOptions[],
    themeLocales: ThemeLocaleConfig[],
    fallbackNavbar: AutoSidebarNavItem[],
): AutoSidebarNavItem[] {
    const optionLocale = optionLocales.find(item => item.lang === locale.lang);
    const themeLocale = themeLocales.find(item => item.lang === locale.lang);
    return optionLocale?.navbar ?? optionLocale?.nav ?? themeLocale?.nav ?? locale.nav ?? fallbackNavbar;
}

function stripPluginOnlyLocaleFields(locale: ThemeLocaleConfig): ThemeLocaleConfig {
    const { navbar, docsDir, reverse, ...restLocale } = locale;
    return restLocale;
}

export function pluginAutoSidebar(options: AutoSidebarOptions = {}): RspressPlugin {
    const docsDir = options.docsDir ?? 'docs';
    const reverse = options.reverse ?? false;

    return {
        name: 'rspress-plugin-auto-sidebar',
        config(config) {
            const themeConfig = (config as any).themeConfig ?? {};
            const optionLocales = options.locales ?? [];
            const themeLocales = (themeConfig.locales ?? []) as ThemeLocaleConfig[];
            const configuredLocales = getConfiguredLocales(config, themeConfig, optionLocales);
            const navbar = options.navbar ?? themeConfig.nav ?? [];

            if (configuredLocales.length > 0) {
                const defaultLang = (config as any).lang ?? 'en';
                const locales = configuredLocales.map((locale) => {
                    const localeNavbar = getLocaleNavbar(locale, optionLocales, themeLocales, navbar);
                    const localeDocsDir = locale.docsDir ?? docsDir;
                    const localeReverse = locale.reverse ?? reverse;
                    const generatedSidebar = generateSidebarFromNavbar(localeNavbar, localeDocsDir, localeReverse, {
                        lang: locale.lang,
                        defaultLang,
                    });
                    const localeSidebar = locale.sidebar ?? themeConfig.sidebar ?? {};

                    return {
                        label: locale.lang,
                        ...stripPluginOnlyLocaleFields(locale),
                        nav: localeNavbar,
                        sidebar: {
                            ...localeSidebar,
                            ...generatedSidebar,
                        },
                    };
                });

                return {
                    ...config,
                    themeConfig: {
                        ...themeConfig,
                        locales,
                    },
                };
            }

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
