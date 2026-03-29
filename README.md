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
       }
    ],
  },
  plugins: [
    pluginAutoSidebar(), // 无需传参
  ],
});
```

## 功能特点

1. **自动生成侧边栏**：自动读取 `scanDir` 对应路径（如 `docs/guide`）下的所有文档文件，生成 `text` 和 `link` 的平铺侧边栏列表项目。不会添加多余的一层嵌套父级。
2. **支持 Overview 排序**：自动解析 Markdown Frontmatter，如果该文件内包含 `overview: true`，会被优先排在页面的最上方。
3. **提取 Title**：如果文件包含 `title: xxx` 的 Frontmatter，会自动用作侧边栏的文本展示名称，否则自动退化使用文件名。
4. **支持 Sort 排序**：如果文件包含 `sort: number` 的 Frontmatter，会按照数字大小排序，数值越小越靠前。有 `sort` 字段的文件会排在没有 `sort` 字段的文件前面。
