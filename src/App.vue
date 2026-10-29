<script lang="tsx" setup>
import { NConfigProvider, NLoadingBarProvider, NMessageProvider, zhCN, dateZhCN } from 'naive-ui'
import type { GlobalThemeOverrides } from 'naive-ui'

const themeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#3568d4',
    primaryColorHover: '#2858bd',
    primaryColorPressed: '#214a9e',
    primaryColorSuppl: '#3568d4',
    borderRadius: '8px',
    textColorBase: '#263247',
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
  },
  Tree: { nodeHeight: '42px' },
  Button: { heightMedium: '38px' },
  Input: { heightMedium: '38px' }
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
