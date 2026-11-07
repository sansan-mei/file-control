<script lang="tsx" setup>
import {
  deleteFile,
  deleteFiles,
  fetchAdminStatus,
  fetchDirectorySize,
  fetchDirectoryTree,
  uploadFile
} from '@/api'
import { filePwd_K, isPublic_K, showFileSize_K } from '@/constant'
import { useIsMobile } from '@/hoooks'
import { createTransferNotifier, refreshNotifications } from '@/pwa'
import PwaSettings from './PwaSettings.vue'
import { copyToClip, downloadFile, formatFileSize, getCookieValue, openUrlByKey, setCookieValue } from '@/utils'
import { countFiles, describeFolderDate, fileKind, formatUploadTime, hasSearchMatch, type FileKind } from '@/utils/fileMeta'
import {
  ArchiveOutline,
  CloudUploadOutline,
  CodeSlashOutline,
  DocumentOutline,
  DocumentTextOutline,
  DownloadOutline,
  EllipsisHorizontalOutline,
  EllipsisVertical,
  FileTrayFullOutline,
  Folder,
  FolderOpen,
  FolderOpenOutline,
  GlobeOutline,
  ImageOutline,
  KeyOutline,
  LinkOutline,
  LockClosed,
  LockClosedOutline,
  MusicalNotesOutline,
  OpenOutline,
  ReaderOutline,
  SearchOutline,
  ShieldCheckmarkOutline,
  TrashOutline,
  VideocamOutline
} from '@vicons/ionicons5'
import type { TreeOption, UploadFileInfo } from 'naive-ui'
import {
  NButton,
  NDrawer,
  NDrawerContent,
  NDropdown,
  NForm,
  NFormItem,
  NIcon,
  NInput,
  NModal,
  NScrollbar,
  NSwitch,
  NTree,
  NUpload,
  NUploadDragger,
  useMessage
} from 'naive-ui'
import type { TreeOptions } from 'naive-ui/es/tree/src/interface'
import { computed, h, onBeforeMount, onMounted, onUnmounted, ref, watch, type Component, type VNode } from 'vue'

const msg = useMessage()
const transferNotifier = createTransferNotifier()
const fileList = ref<TreeOptions>([])
const rawFiles = ref<DirectoryNode[]>([])
const valueMap = new Map<TreeOption['key'], boolean>()

const defaultExpandedKeys = ref<AnyArray>([])
const checkedKeys = ref<Array<string | number>>([])
const checkedFileKeys = ref<Array<string | number>>([])
const pattern = ref('')
const searchInput = ref<{ focus: () => void } | null>(null)
const noSearchResults = computed(() => !!pattern.value && !hasSearchMatch(rawFiles.value, pattern.value))
const isActive = ref(false)
const mobilePanel = ref<'search' | 'actions' | null>(null)
const showTransfers = ref(false)
const switchMode = ref((getCookieValue(filePwd_K) && getCookieValue(isPublic_K) !== '1') || false)
const formDisabled = computed(() => !isActive.value)
const filePwd = ref(getCookieValue(filePwd_K))
// The password becomes part of the stored file name on the server.
const filePwdInvalid = computed(() => /[\\/]/.test(filePwd.value || ''))
const INVALID_FILE_PASSWORD_MESSAGE = '文件密码不能包含 / 或 \\'

// Sizes are shown unless the user explicitly turned them off.
const showFileSize = ref(getCookieValue(showFileSize_K) !== '0')
const isMobile = useIsMobile()
const isAdmin = ref(false)

const updatePrefixWithExpaned = (
  _keys: Array<string | number>,
  _option: Array<TreeOption | null>,
  meta: {
    node: TreeOption | null
    action: 'expand' | 'collapse' | 'filter'
  }
) => {
  if (!meta.node) return
  switch (meta.action) {
    case 'expand':
      meta.node.prefix = () => (
        <NIcon>
          <FolderOpen></FolderOpen>
        </NIcon>
      )
      break
    case 'collapse':
      meta.node.prefix = () => (
        <NIcon>
          <Folder></Folder>
        </NIcon>
      )
      break
  }
}

// Locked files need a password unless the visitor is admin or already carries one.
const needsPasswordPrompt = (item: DirectoryNode) => !!item.locked && !isAdmin.value && !filePwd.value

const passwordPrompt = ref<{ item: DirectoryNode; value: string; intent: 'open' | 'download' } | null>(null)
const confirmPasswordPrompt = () => {
  const prompt = passwordPrompt.value
  if (!prompt?.value) return
  passwordPrompt.value = null
  if (prompt.intent === 'download') downloadFile(prompt.item, prompt.value)
  else openUrlByKey(prompt.item, prompt.value)
}

const openFile = (item: DirectoryNode) => {
  if (needsPasswordPrompt(item)) {
    passwordPrompt.value = { item, value: '', intent: 'open' }
    return
  }
  if (valueMap.has(item.key)) return
  valueMap.set(item.key, true)
  requestIdleCallback(() => {
    const win = openUrlByKey({ key: item.key, label: item.label })
    win?.addEventListener('load', () => valueMap.delete(item.key))
    setTimeout(() => valueMap.delete(item.key), 2000)
  })
}

const nodeProps = ({ option }: { option: TreeOption }) => {
  return {
    async onClick() {
      if (!option.children && !option.disabled) openFile(option.raw as DirectoryNode)
    }
  }
}

interface UploadState {
  id: number
  name: string
  phase: 'checking' | 'uploading' | 'processing' | 'success' | 'error'
  loaded: number
  total?: number
  percent?: number
  error?: string
}
const uploads = ref<UploadState[]>([])
const uploadCleanupTimers = new Map<number, ReturnType<typeof setTimeout>>()
let isUnmounted = false
let nextUploadId = 0

const dismissUpload = (id: number) => {
  clearTimeout(uploadCleanupTimers.get(id))
  uploadCleanupTimers.delete(id)
  uploads.value = uploads.value.filter((upload) => upload.id !== id)
}

const scheduleUploadCleanup = (id: number, delay: number) => {
  if (isUnmounted) return
  uploadCleanupTimers.set(id, setTimeout(() => dismissUpload(id), delay))
}

// A separate state entry belongs to each request, never to the shared loading bar.
const runUpload = async (file: File) => {
  const state = ref<UploadState>({ id: ++nextUploadId, name: file.name, phase: 'checking', loaded: 0 })
  uploads.value.push(state.value)
  try {
    if (switchMode.value && filePwdInvalid.value) throw new Error(INVALID_FILE_PASSWORD_MESSAGE)
    const checkResult = await fetchDirectorySize<{ uploadToken: string | null }>(file.size)
    const body = new FormData()
    body.append('file', file)
    if (checkResult.data?.uploadToken) body.append('uploadToken', checkResult.data.uploadToken)
    setCookieValue(isPublic_K, switchMode.value ? '0' : '1')
    state.value.phase = 'uploading'
    await uploadFile(body, (event) => {
      state.value.loaded = event.loaded
      const total = event.lengthComputable !== false && event.total && event.total > 0 ? event.total : undefined
      state.value.total = total
      state.value.percent = total ? Math.min(100, Math.floor(event.loaded / total * 100)) : undefined
      state.value.phase = total && event.loaded >= total ? 'processing' : 'uploading'
    }, checkResult.data?.uploadToken)
    state.value.phase = 'success'
    scheduleUploadCleanup(state.value.id, 5000)
    if (!isUnmounted && !transferNotifier.complete(state.value.id, 'success')) msg.success(`文件 ${file.name} 上传成功`)
    await createData()
  } catch (error: any) {
    state.value.phase = 'error'
    state.value.error = error?.message || '上传失败'
    scheduleUploadCleanup(state.value.id, 12000)
    if (!isUnmounted && !transferNotifier.complete(state.value.id, 'error')) msg.error(state.value.error!)
  }
}

const uploadPicker = ref<HTMLInputElement | null>(null)
const handlePickerChange = (event: Event) => {
  const input = event.target as HTMLInputElement
  for (const file of Array.from(input.files || [])) void runUpload(file)
  input.value = ''
}

const handlePasteUpload = runUpload

// 监听剪切板粘贴事件
const handlePaste = async (e: ClipboardEvent) => {
  const items = e.clipboardData?.items
  if (!items) return

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    
    // 检查是否为图片类型
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) {
        // 生成文件名
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const extension = item.type.split('/')[1] || 'png'
        const fileName = `paste-${timestamp}.${extension}`
        
        // 创建新的File对象with proper name
        const namedFile = new File([file], fileName, { type: file.type })
        
        void handlePasteUpload(namedFile)
      }
    }
  }
}

onBeforeMount(() => {
  Promise.all([fetchAdminState(), createData()])
})

// "/" focuses the desktop search box, as in most file managers.
const handleShortcut = (event: KeyboardEvent) => {
  if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey || isMobile.value) return
  const target = event.target as HTMLElement | null
  if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return
  event.preventDefault()
  searchInput.value?.focus()
}

onMounted(() => {
  // 添加全局粘贴事件监听
  document.addEventListener('paste', handlePaste)
  document.addEventListener('keydown', handleShortcut)
})

onUnmounted(() => {
  isUnmounted = true
  transferNotifier.dispose()
  uploadCleanupTimers.forEach(clearTimeout)
  uploadCleanupTimers.clear()
  // 清理事件监听器
  document.removeEventListener('paste', handlePaste)
  document.removeEventListener('keydown', handleShortcut)
})

async function createData() {
  try {
    const { data } = await fetchDirectoryTree<DirectoryNode>()
    rawFiles.value = data?.children ?? []
    if (data?.children?.length) {
      fileList.value = generateFileListData(data.children)
      defaultExpandedKeys.value = [data.children.at(0)?.key]
    } else {
      fileList.value = []
      defaultExpandedKeys.value = []
    }
  } catch (error) {
    console.warn(error)
  }
}

async function fetchAdminState() {
  try {
    const { data } = await fetchAdminStatus<{ isAdmin: boolean }>()
    isAdmin.value = !!data?.isAdmin
    if (!isAdmin.value) {
      checkedKeys.value = []
      checkedFileKeys.value = []
    }
  } catch (error) {
    console.warn(error)
    isAdmin.value = false
  }
}

const KIND_ICONS: Record<FileKind, Component> = {
  image: ImageOutline,
  video: VideocamOutline,
  audio: MusicalNotesOutline,
  pdf: ReaderOutline,
  archive: ArchiveOutline,
  code: CodeSlashOutline,
  text: DocumentTextOutline,
  document: DocumentOutline,
  other: FileTrayFullOutline
}

const renderFileIcon = (item: DirectoryNode) => {
  if (!item.isFile) return <NIcon><Folder /></NIcon>
  const kind = fileKind(item.label)
  const Icon = KIND_ICONS[kind]
  return <NIcon class={`file-kind file-kind-${kind}`}>{h(Icon)}</NIcon>
}

/** Public files can only be deleted by the admin; locked ones also by their password holder. */
const canDelete = (item: DirectoryNode) => isAdmin.value || !!item.locked

const copyLink = (item: DirectoryNode, withPassword = false) => {
  copyToClip(openUrlByKey.getFullPath(item, withPassword ? filePwd.value : undefined))
  msg.success(withPassword ? '已复制带密码的链接' : '已复制文件链接')
}

const fileActionOptions = (item: DirectoryNode) => {
  const icon = (Icon: Component) => () => <NIcon>{h(Icon)}</NIcon>
  const options: Array<Record<string, unknown>> = [
    { key: 'open', label: '打开', icon: icon(OpenOutline) },
    { key: 'download', label: '下载', icon: icon(DownloadOutline) },
    { key: 'copy', label: '复制链接', icon: icon(LinkOutline) }
  ]
  if (item.locked && filePwd.value) options.push({ key: 'copy-password', label: '复制带密码的链接', icon: icon(KeyOutline) })
  if (canDelete(item)) {
    options.push({ type: 'divider', key: 'divider' })
    options.push({ key: 'delete', label: '删除', icon: icon(TrashOutline), props: { class: 'danger-option' } })
  }
  return options
}

const handleFileAction = (action: string, item: DirectoryNode) => {
  if (action === 'open') openFile(item)
  else if (action === 'download') {
    if (needsPasswordPrompt(item)) passwordPrompt.value = { item, value: '', intent: 'download' }
    else downloadFile(item)
  } else if (action === 'copy') copyLink(item)
  else if (action === 'copy-password') copyLink(item, true)
  else if (action === 'delete') handleDeleteFile(item)
}

const stopTreeClick = (event: Event) => event.stopPropagation()

const renderFileActions = (item: DirectoryNode) => (
  <div class="file-actions" onClick={stopTreeClick}>
    <NDropdown
      trigger="click"
      placement="bottom-end"
      options={fileActionOptions(item)}
      onSelect={(action: string) => handleFileAction(action, item)}
    >
      <button type="button" class="icon-button file-action-button" aria-label={`${item.label} 的更多操作`}>
        <NIcon size={20}><EllipsisVertical /></NIcon>
      </button>
    </NDropdown>
  </div>
)

const handleDeleteFile = async (item: DirectoryNode) => {
  if (!window.confirm(`确认删除「${item.label}」？删除后无法恢复。`)) return
  try {
    await deleteFile(item.key)
    msg.success('删除成功')
    createData()
  } catch (res: any) {
    msg.error(res?.message || '删除失败')
  }
}

const collectCheckedFileKeys = (
  list: TreeOptions,
  checkedKeySet: Set<string | number>,
  parentChecked = false
) => {
  const keys: Array<string | number> = []

  list.forEach((item) => {
    const option = item as TreeOption & { raw?: DirectoryNode; children?: TreeOptions }
    const key = option.key
    const isChecked = (key !== undefined && checkedKeySet.has(key)) || parentChecked
    if (isChecked && option.raw?.isFile && key !== undefined) keys.push(key)
    if (option.children?.length) {
      keys.push(...collectCheckedFileKeys(option.children, checkedKeySet, isChecked))
    }
  })

  return keys
}

const handleCheckedKeysUpdate = (keys: Array<string | number>) => {
  checkedKeys.value = keys
  checkedFileKeys.value = collectCheckedFileKeys(fileList.value, new Set(keys))
}

const handleBatchDelete = async () => {
  if (!checkedFileKeys.value.length) return
  if (!window.confirm(`确认删除选中的 ${checkedFileKeys.value.length} 个文件？`)) return

  try {
    await deleteFiles(checkedFileKeys.value)
    msg.success('批量删除成功')
    checkedKeys.value = []
    checkedFileKeys.value = []
    createData()
  } catch (res: any) {
    msg.error(res?.message || '批量删除失败')
  }
}

const renderMeta = (item: DirectoryNode, folderLabel?: string) => {
  const parts: Array<string | VNode> = []
  if (item.isFile) {
    if (item.locked) {
      parts.push(
        <em class="file-lock" title="需要密码才能打开">
          <NIcon size={13}><LockClosed /></NIcon>需密码
        </em>
      )
    }
    if (showFileSize.value && item.size !== undefined) parts.push(formatFileSize(item.size))
    if (item.uploadedAt) parts.push(formatUploadTime(item.uploadedAt, folderLabel))
  } else {
    const relative = describeFolderDate(item.label)
    if (relative) parts.push(relative)
    parts.push(`${countFiles(item)} 个文件`)
  }
  if (!parts.length) return null
  return (
    <div class="file-meta">
      {parts.map((part, index) => (
        <em key={index} class="file-meta-item">{part}</em>
      ))}
    </div>
  )
}

const renderLabel = (item: DirectoryNode, folderLabel?: string) => {
  const elementProps = {
    // Desktop shortcut kept from earlier versions: right-click copies the file link.
    onContextmenu: (e: MouseEvent) => {
      if (!item.isFile) return
      e.preventDefault()
      copyLink(item)
    },
    class: 'file-name cursor-context-menu select-none'
  }
  return (
    <div class={`file-row ${item.isFile ? 'is-file' : 'is-folder'}`}>
      <div class="file-label">
        <span {...elementProps}>{item.label}</span>
      </div>
      {renderMeta(item, folderLabel)}
    </div>
  )
}

function generateFileListData<T extends DirectoryNode[]>(data: T, folderLabel?: string): TreeOptions {
  return data.map((item) => ({
    key: item.key,
    label: () => renderLabel(item, folderLabel),
    prefix: () => renderFileIcon(item),
    ...(item.children && {
      children: generateFileListData(item.children, item.label)
    }),
    ...(item.isFile && {
      suffix: () => renderFileActions(item)
    }),
    raw: item
  })) as unknown as TreeOptions
}

const beforeUpload: (options: {
  file: UploadFileInfo
  fileList: UploadFileInfo[]
}) => Promise<boolean> = async (options) => {
  const file = options.file.file
  if (file) await runUpload(file)
  // Upload is fully handled here; do not retain a hidden Naive UI queue.
  return false
}

const changeMode = () => {
  refreshNotifications()
  mobilePanel.value = null
  isActive.value = true
}

const onFilter = (val: string, node: AnyObject) => {
  if (node?.raw.label.includes(val)) return true
  return false
}

watch(() => uploads.value.length, (count) => {
  if (!count) showTransfers.value = false
})
watch(isMobile, () => {
  mobilePanel.value = null
})
watch(filePwd, (val) => {
  !val && switchMode.value && (switchMode.value = false)
  setCookieValue(filePwd_K, val)
})
watch(switchMode, (val) => {
  setCookieValue(isPublic_K, val ? '0' : '1')
})
watch(showFileSize, (val) => {
  setCookieValue(showFileSize_K, val ? '1' : '0')
  showFileSize.value = val
})
</script>

<template>
  <div class="workspace-shell">
    <header class="app-header">
      <a class="brand" href="#files" aria-label="文件首页"><NIcon :size="isMobile ? 24 : 30"><FolderOpenOutline /></NIcon><span>{{ isMobile ? '我的文件' : '文件' }}</span></a>
      <NInput v-if="!isMobile" ref="searchInput" v-model:value="pattern" clearable placeholder="搜索文件或文件夹" aria-label="搜索文件或文件夹" class="global-search" @keydown.esc="pattern = ''">
        <template #prefix><NIcon :size="22"><SearchOutline /></NIcon></template>
        <template #suffix><kbd v-if="!pattern" class="search-shortcut" title="按 / 快速搜索">/</kbd></template>
      </NInput>
      <div v-else class="mobile-header-actions">
        <button type="button" class="icon-button" :class="{ 'has-filter': pattern }" aria-label="搜索文件" :aria-pressed="!!pattern" @click="mobilePanel = 'search'"><NIcon :size="22"><SearchOutline /></NIcon></button>
        <button type="button" class="mobile-upload-button" aria-label="上传文件" @click="uploadPicker?.click()"><NIcon :size="20"><CloudUploadOutline /></NIcon><span>上传</span></button>
        <button type="button" class="icon-button more-button" aria-label="更多文件操作" @click="mobilePanel = 'actions'"><NIcon :size="24"><EllipsisHorizontalOutline /></NIcon><span v-if="uploads.length" class="task-count" :aria-label="`${uploads.length} 条传输记录`">{{ uploads.length }}</span></button>
      </div>
    </header>
    <div class="workspace-body">
      <main class="workspace-main" id="files">
        <section class="file-panel" aria-label="文件列表">
          <div v-if="!isMobile" class="page-heading">
            <h1>我的文件</h1>
            <div class="file-toolbar-actions">
              <NButton v-if="uploads.length" quaternary @click="showTransfers = true">传输记录 ({{ uploads.length }})</NButton>
              <NButton v-if="isAdmin" secondary type="error" :disabled="!checkedFileKeys.length" @click="handleBatchDelete">批量删除{{ checkedFileKeys.length ? `(${checkedFileKeys.length})` : '' }}</NButton>
              <NButton quaternary class="refresh-button" @click="createData" aria-label="刷新文件">刷新</NButton>
              <NButton quaternary class="settings-button" @click="changeMode" aria-label="空间设置">设置</NButton>
            </div>
          </div>
          <div v-if="!isMobile" class="workspace-status">
            <button type="button" class="status-chip" :class="{ 'is-protected': switchMode }" :title="switchMode ? '新上传的文件需要密码才能打开，点击修改' : '新上传的文件所有人可见，点击设置密码'" @click="changeMode">
              <NIcon :size="15"><LockClosedOutline v-if="switchMode" /><GlobeOutline v-else /></NIcon>{{ switchMode ? '密码保护上传' : '公开上传' }}
            </button>
            <em v-if="isAdmin" class="status-chip is-admin"><NIcon :size="15"><ShieldCheckmarkOutline /></NIcon>管理员</em>
          </div>
          <input ref="uploadPicker" type="file" multiple hidden aria-label="选择上传文件" @change="handlePickerChange" />
          <NUpload v-if="!isMobile" directory-dnd :action="undefined" multiple :show-file-list="false" with-credentials :default-upload="false" :on-before-upload="beforeUpload" class="workspace-upload">
            <NUploadDragger class="upload-dropzone"><button type="button" class="upload-cta" @click.stop="uploadPicker?.click()">点击/拖放文件上传</button><span class="drop-secondary">也可粘贴图片</span></NUploadDragger>
          </NUpload>

          <div v-if="isMobile && pattern" class="search-filter-bar" role="status">
            <em>搜索「{{ pattern }}」</em>
            <button type="button" class="link-button" @click="pattern = ''">清除</button>
          </div>
          <NScrollbar x-scrollable y-scrollable class="file-scrollbar">
            <div v-if="noSearchResults" class="empty-state search-empty">
              <NIcon :size="44"><SearchOutline /></NIcon>
              <h2>没有找到相关文件</h2>
              <p>没有名称包含「{{ pattern }}」的文件或文件夹。</p>
              <NButton class="clear-search" @click="pattern = ''">清除搜索</NButton>
            </div>
            <NTree v-if="fileList.length" v-show="!noSearchResults" class="file-tree" block-line :pattern="pattern" :show-irrelevant-nodes="false" expand-on-click :checkable="isAdmin" :data="fileList" :node-props="nodeProps" :on-update:expanded-keys="updatePrefixWithExpaned" :checked-keys="checkedKeys" :on-update:checked-keys="handleCheckedKeysUpdate" :default-expanded-keys="defaultExpandedKeys" :filter="onFilter" />
            <div v-else class="empty-state"><NIcon :size="48"><FolderOpenOutline /></NIcon><h2>暂无文件</h2><p>{{ isMobile ? '点击右上角「上传」添加文件' : '选择文件或拖放到上方上传' }}</p></div>
          </NScrollbar>
        </section>
      </main>
    </div>
    <NDrawer :show="isMobile && mobilePanel !== null" placement="bottom" height="auto" class="workspace-drawer mobile-tools-drawer" @update:show="mobilePanel = $event ? mobilePanel : null">
      <NDrawerContent :title="mobilePanel === 'search' ? '搜索文件' : '文件操作'" closable>
        <template v-if="mobilePanel === 'search'">
          <NInput v-model:value="pattern" autofocus clearable placeholder="搜索文件或文件夹" aria-label="搜索文件或文件夹" @keydown.enter="mobilePanel = null"><template #prefix><NIcon :size="20"><SearchOutline /></NIcon></template></NInput>
          <p class="drawer-hint">按文件名筛选，关闭后查看结果。清空搜索可显示全部文件。</p>
        </template>
        <div v-else class="mobile-action-list">
          <div class="drawer-status">
            <em class="status-chip" :class="{ 'is-protected': switchMode }"><NIcon :size="15"><LockClosedOutline v-if="switchMode" /><GlobeOutline v-else /></NIcon>{{ switchMode ? '密码保护上传' : '公开上传' }}</em>
            <em v-if="isAdmin" class="status-chip is-admin"><NIcon :size="15"><ShieldCheckmarkOutline /></NIcon>管理员</em>
          </div>
          <NButton block @click="createData(); mobilePanel = null">刷新文件</NButton>
          <NButton block @click="showTransfers = true; mobilePanel = null">传输记录{{ uploads.length ? ` (${uploads.length})` : '' }}</NButton>
          <NButton block @click="changeMode">空间设置</NButton>
          <NButton v-if="isAdmin" block secondary type="error" :disabled="!checkedFileKeys.length" @click="handleBatchDelete(); mobilePanel = null">批量删除{{ checkedFileKeys.length ? ` (${checkedFileKeys.length})` : '' }}</NButton>
        </div>
        <template #footer><NButton type="primary" block @click="mobilePanel = null">{{ mobilePanel === 'search' ? '查看文件' : '完成' }}</NButton></template>
      </NDrawerContent>
    </NDrawer>
    <NDrawer v-model:show="showTransfers" :placement="isMobile ? 'bottom' : 'right'" :width="isMobile ? undefined : 440" :height="isMobile ? 'auto' : undefined" class="workspace-drawer transfers-drawer" aria-label="传输记录">
      <NDrawerContent title="传输记录" closable>
        <p class="drawer-hint">成功记录 5 秒后移除，失败记录保留 12 秒。关闭面板不会中断上传。</p>
        <section v-if="uploads.length" aria-label="上传进度" class="upload-progress-panel">
          <div class="upload-grid">
            <div v-for="upload in uploads" :key="upload.id" class="upload-entry" :class="`upload-${upload.phase}`">
              <div class="upload-file-name"><NIcon :size="18"><FileTrayFullOutline /></NIcon><strong>{{ upload.name }}</strong><button v-if="upload.phase === 'success' || upload.phase === 'error'" type="button" class="dismiss-upload" :aria-label="`移除 ${upload.name} 的上传记录`" @click="dismissUpload(upload.id)">×</button></div>
              <progress v-if="upload.phase !== 'success' && upload.phase !== 'error'" :aria-label="upload.name" :value="upload.phase === 'processing' ? undefined : upload.percent" max="100" />
              <div role="status" class="upload-status">
                <span v-if="upload.phase === 'checking'">检查上传权限…</span>
                <span v-else-if="upload.phase === 'processing'">100% 已发送，服务器处理中…</span>
                <span v-else-if="upload.phase === 'success'">上传成功</span>
                <span v-else-if="upload.phase === 'error'" role="alert">上传失败：{{ upload.error }}</span>
                <span v-else>{{ upload.percent === undefined ? '上传中（总大小未知）' : `${upload.percent}%` }} · {{ formatFileSize(upload.loaded) }}<template v-if="upload.total"> / {{ formatFileSize(upload.total) }}</template></span>
              </div>
            </div>
          </div>
        </section>
        <p v-else class="drawer-hint">暂无传输任务</p>
        <template #footer><NButton block @click="showTransfers = false">返回文件</NButton></template>
      </NDrawerContent>
    </NDrawer>
    <NModal :show="!!passwordPrompt" preset="card" class="password-modal" :title="'需要密码'" :bordered="false" size="small" :mask-closable="true" aria-label="输入文件密码" @update:show="(show: boolean) => { if (!show) passwordPrompt = null }">
      <form v-if="passwordPrompt" class="password-form" @submit.prevent="confirmPasswordPrompt">
        <p class="drawer-hint">「{{ passwordPrompt.item.label }}」受密码保护，请输入上传者设置的密码。</p>
        <NInput v-model:value="passwordPrompt.value" type="password" show-password-on="click" placeholder="文件密码" aria-label="打开文件的密码" autofocus />
        <div class="password-actions">
          <NButton @click="passwordPrompt = null">取消</NButton>
          <NButton type="primary" attr-type="submit" :disabled="!passwordPrompt.value">{{ passwordPrompt.intent === 'download' ? '下载文件' : '打开文件' }}</NButton>
        </div>
      </form>
    </NModal>
    <NDrawer v-model:show="isActive" :placement="isMobile ? 'bottom' : 'right'" :width="isMobile ? undefined : 440" :height="isMobile ? 'auto' : undefined" class="workspace-drawer settings-drawer" aria-label="空间设置">
      <NDrawerContent title="空间设置" closable>
        <p class="settings-intro">调整访问密码与文件显示偏好，设置将自动保存到当前浏览器。</p>
        <NForm :disabled="formDisabled" label-placement="top">
          <div class="settings-section-title">访问与隐私</div>
          <NFormItem label="文件密码" :validation-status="filePwdInvalid ? 'error' : undefined" :feedback="filePwdInvalid ? INVALID_FILE_PASSWORD_MESSAGE : undefined"><NInput v-model:value="filePwd" aria-label="文件密码" type="password" show-password-on="click" placeholder="输入文件访问密码" /></NFormItem>
          <NFormItem label="上传时加密码">
            <div class="setting-row"><p>{{ filePwd ? '开启后，新上传的文件需要输入相同密码才能打开；已上传的文件不受影响。' : '先填写上方的文件密码，才能开启加密上传。' }}</p><NSwitch v-model:value="switchMode" aria-label="携带文件密码" :disabled="!filePwd"><template #checked>开启</template><template #unchecked>关闭</template></NSwitch></div>
          </NFormItem>
          <div class="settings-section-title">显示偏好</div>
          <NFormItem label="显示文件大小"><div class="setting-row"><p>在文件信息中显示文件大小。</p><NSwitch v-model:value="showFileSize" aria-label="显示文件大小"><template #checked>显示</template><template #unchecked>隐藏</template></NSwitch></div></NFormItem>
        </NForm>
        <PwaSettings />
        <template #footer><NButton @click="isActive = false" type="primary" block>完成设置</NButton></template>
      </NDrawerContent>
    </NDrawer>
  </div>
</template>
