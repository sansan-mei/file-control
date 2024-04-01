<script lang="tsx" setup>
import { NLoadingBarProvider, NMessageProvider } from 'naive-ui'
import filePage from './components/filePage.vue'
</script>

<template>
  <NLoadingBarProvider>
    <NMessageProvider>
      <filePage />
    </NMessageProvider>
  </NLoadingBarProvider>
</template>

<style></style>
