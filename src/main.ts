import { createApp } from 'vue'
import App from './App.vue'
import './css/input.css'
import { initInstallTracking, refreshNotifications, registerPwa } from './pwa'

initInstallTracking()
refreshNotifications()
if (import.meta.env.PROD) void registerPwa()

createApp(App).mount('#app')
