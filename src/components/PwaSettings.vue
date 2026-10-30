<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { initInstallTracking, installApp, installState, notificationState, refreshNotifications, setNotifications } from '@/pwa'
initInstallTracking()
refreshNotifications()
onMounted(() => window.addEventListener('focus', refreshNotifications))
onUnmounted(() => window.removeEventListener('focus', refreshNotifications))
</script>

<template>
  <section aria-label="应用与通知">
    <div class="settings-section-title">桌面应用</div>
    <p v-if="installState.installed" role="status">已添加到桌面</p>
    <button v-else-if="installState.available" type="button" data-testid="install-app" class="upload-cta" :disabled="installState.busy" @click="installApp">添加到桌面</button>
    <p v-else class="drawer-hint">添加到桌面：使用浏览器菜单中的「安装应用」或「添加到主屏幕」。iPhone / iPad 请在 Safari 点「分享」→「添加到主屏幕」；若没有该选项，请先在系统浏览器打开。此浏览器可能不支持安装。</p>
    <p v-if="installState.error" role="status">{{ installState.error }}</p>
    <div class="settings-section-title">传输系统通知</div>
    <p class="drawer-hint">仅在页面仍打开且切到后台或失去焦点时，提醒上传成功或失败；前台保留原有提示。关闭应用后不支持 Web Push；系统可能暂停后台页面和上传。</p>
    <p v-if="!notificationState.supported" role="status">当前浏览器不支持系统通知，或未使用 HTTPS。iOS 需先添加到主屏幕并从桌面打开（iOS 16.4+）。</p>
    <p v-else-if="notificationState.permission === 'denied'" role="status">通知权限已拒绝，请在浏览器网站设置中手动允许后重试。</p>
    <button v-else type="button" class="upload-cta" :data-testid="notificationState.enabled ? 'disable-notifications' : 'enable-notifications'" :disabled="notificationState.busy" @click="setNotifications(!notificationState.enabled)">{{ notificationState.enabled ? '关闭传输通知' : '开启传输通知' }}</button>
    <p v-if="notificationState.enabled" role="status">传输通知已开启（不显示文件名或密码）。</p>
    <p v-if="notificationState.error" role="status">{{ notificationState.error }}</p>
  </section>
</template>
