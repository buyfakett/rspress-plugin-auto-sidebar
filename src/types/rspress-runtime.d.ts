declare module '@rspress/core/runtime' {
  // 简化声明，仅声明当前插件需要的 API
  export function usePageData(): any;
  export function useLocation(): {
    pathname: string;
    search: string;
    hash: string;
  };
}

