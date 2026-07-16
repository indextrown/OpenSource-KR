import * as path from 'node:path';
import { defineConfig } from '@rspress/core';

export default defineConfig({
  root: path.join(__dirname, 'docs'),
  base: '/OpenSource-KR/',
  globalStyles: path.join(__dirname, 'theme/index.css'),
  lang: 'ko',
  title: 'Open Source KR',
  description: '오픈소스 공식 문서를 한국어로 읽는 곳',
  icon: '/open-source-docs.svg',
  logo: {
    light: '/open-source-docs.svg',
    dark: '/open-source-docs.svg',
  },
  themeConfig: {
    darkMode: false, // 다크모드
    showNavDivider: false, // 상단 네비게이션바 가로줄
    showSidebarDivider: false, // 사이드바 구분선
    searchPlaceholderText: '검색',
    socialLinks: [
      {
        icon: 'github',
        mode: 'link',
        content: 'https://github.com/indextrown/OpenSource-KR',
      },
    ],
  },
});
