# rspress-plugin-auto-sidebar

Rspress 插件：基于顶部导航栏 (`navbar`) 配置自动生成侧边栏 (`sidebar`)。

## 安装

```bash
npm install rspress-plugin-auto-sidebar
# 或者
yarn add rspress-plugin-auto-sidebar
# 或者
pnpm add rspress-plugin-auto-sidebar
```

## 使用方法

在 `rspress.config.ts` 中引入本插件。只需在 `navbar` 的某一项中添加自定义属性 `scanDir`，插件就会自动扫描该目录下的 Markdown/MDX 文件，并自动生成侧边栏。

### 方式一：在插件选项中配置 navbar

```typescript
import { defineConfig } from 'rspress/config';
import { pluginAutoSidebar } from 'rspress-plugin-auto-sidebar';

export default defineConfig({
  plugins: [
    pluginAutoSidebar({
      reverse: true, // 可选：全局默认按 sort 降序
      navbar: [
        {
          text: '指南',
          link: '/guide/',
          scanDir: '/guide/', // 扫描 docs/guide 目录生成侧边栏
        },
        {
          text: 'API',
          link: '/api/',
          scanDir: '/api/',   // 扫描 docs/api 目录生成侧边栏
        }
      ],
      // 可选：如果你的文档根目录不是 docs，可配置 docsDir
      // docsDir: 'docs'
    }),
  ],
});
```

*注意：如果通过插件选项传入 `navbar`，它会自动覆盖到 `themeConfig.nav` 中，你就不需要再在 `themeConfig` 里额外写一遍导航配置。*

### 方式二：自动读取 themeConfig.nav

如果你不想把导航栏配置传给插件，也可以向平常一样直接在 `themeConfig.nav` 中配置，只要加上 `scanDir` 属性即可。

```typescript
import { defineConfig } from 'rspress/config';
import { pluginAutoSidebar } from 'rspress-plugin-auto-sidebar';

export default defineConfig({
  themeConfig: {
    nav: [
       {
          text: '指南',
          link: '/guide/',
          scanDir: '/guide/',
          reverse: true, // 可选：当前导航项覆盖全局排序方向
       }
    ],
  },
  plugins: [
    pluginAutoSidebar(), // 无需传参
  ],
});
```

### 多语言：英文 + 中文

多语言场景下，文档目录通常按语言分开，例如：

```text
docs/
  en/
    guide/
      index.md
  zh/
    guide/
      index.md
```

这时可以在插件选项中配置 `locales`。`scanDir` 仍然写业务路径即可，例如 `/guide/`，插件会分别扫描 `docs/en/guide` 和 `docs/zh/guide`。

```typescript
import { defineConfig } from 'rspress/config';
import { pluginAutoSidebar } from 'rspress-plugin-auto-sidebar';

export default defineConfig({
  lang: 'en',
  locales: [
    { lang: 'en', label: 'English' },
    { lang: 'zh', label: '简体中文' },
  ],
  plugins: [
    pluginAutoSidebar({
      locales: [
        {
          lang: 'en',
          navbar: [
            {
              text: 'Guide',
              link: '/guide/',
              scanDir: '/guide/',
            },
          ],
        },
        {
          lang: 'zh',
          navbar: [
            {
              text: '指南',
              link: '/guide/',
              scanDir: '/guide/',
            },
          ],
        },
      ],
    }),
  ],
});
```

如果你更习惯把多语言导航写在 `themeConfig.locales`，也可以继续这么写，插件会自动读取每个语言下的 `nav`。

```typescript
import { defineConfig } from 'rspress/config';
import { pluginAutoSidebar } from 'rspress-plugin-auto-sidebar';

export default defineConfig({
  lang: 'en',
  themeConfig: {
    locales: [
      {
        lang: 'en',
        label: 'English',
        nav: [
          {
            text: 'Guide',
            link: '/guide/',
            scanDir: '/guide/',
          },
        ],
      },
      {
        lang: 'zh',
        label: '简体中文',
        nav: [
          {
            text: '指南',
            link: '/guide/',
            scanDir: '/guide/',
          },
        ],
      },
    ],
  },
  plugins: [
    pluginAutoSidebar(),
  ],
});
```

## 功能特点

1. **自动生成侧边栏**：自动读取 `scanDir` 对应路径（如 `docs/guide`）下的所有文档文件，生成 `text` 和 `link` 的平铺侧边栏列表项目。不会添加多余的一层嵌套父级。
2. **支持 Overview 排序**：自动解析 Markdown Frontmatter，如果该文件内包含 `overview: true`，会被优先排在页面的最上方。
3. **提取 Title**：如果文件包含 `title: xxx` 的 Frontmatter，会自动用作侧边栏的文本展示名称，否则自动退化使用文件名。
4. **支持 Sort 排序**：如果文件包含 `sort: number` 的 Frontmatter，会按照数字大小排序，数值越小越靠前。有 `sort` 字段的文件会排在没有 `sort` 字段的文件前面。
5. **支持反向 Sort 排序**：可通过 `pluginAutoSidebar({ reverse: true })` 设置全局默认降序，也可在单个 `scanDir` 导航项上通过 `reverse: true` 覆盖全局配置。启用后会按 `sort` 降序排列，`sort` 未定义的页面仍排在最后。
6. **支持中英文多语言**：配置 `locales` 或 `themeConfig.locales[].nav` 后，会按语言目录分别扫描，并为非默认语言生成带语言前缀的 sidebar 匹配路径。

## API

```ts
export type AutoSidebarItem = { text: string; link: string };
export type AutoSidebar = Record<string, AutoSidebarItem[]>;

export interface AutoSidebarNavItem {
  text: string;
  link?: string;
  items?: AutoSidebarNavItem[];
  children?: AutoSidebarNavItem[];
  scanDir?: string;
  reverse?: boolean;
}

export interface AutoSidebarOptions {
  navbar?: AutoSidebarNavItem[];
  locales?: AutoSidebarLocaleOptions[];
  docsDir?: string;
  reverse?: boolean;
}

export interface AutoSidebarLocaleOptions {
  lang: string;
  label?: string;
  title?: string;
  description?: string;
  navbar?: AutoSidebarNavItem[];
  nav?: AutoSidebarNavItem[];
  docsDir?: string;
  reverse?: boolean;
  sidebar?: AutoSidebar;
}
```
