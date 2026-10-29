<script lang="tsx" setup>
import { NConfigProvider, NLoadingBarProvider, NMessageProvider, zhCN, dateZhCN } from 'naive-ui'
import type { GlobalThemeOverrides } from 'naive-ui'

const themeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#245d76',
    primaryColorHover: '#194c62',
    primaryColorPressed: '#103c50',
    primaryColorSuppl: '#245d76',
    borderRadius: '12px',
    fontSize: '16px',
    textColorBase: '#273139',
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
  },
  Tree: { nodeHeight: '50px', fontSize: '16px' },
  Button: { heightMedium: '44px', fontSizeMedium: '16px' },
  Input: { heightMedium: '48px', fontSizeMedium: '16px' }
}
import filePage from './components/filePage.vue'
</script>

<template>
  <NConfigProvider :theme-overrides="themeOverrides" :locale="zhCN" :date-locale="dateZhCN">
    <NLoadingBarProvider>
      <NMessageProvider>
        <filePage />
      </NMessageProvider>
    </NLoadingBarProvider>
  </NConfigProvider>
</template>

<style></style>
