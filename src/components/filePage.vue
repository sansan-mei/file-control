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
import { copyToClip, formatFileSize, getCookieValue, openUrlByKey, setCookieValue } from '@/utils'
import {
  FileTrayFullOutline,
  Folder,
  FolderOpenOutline,
  SettingsOutline
} from '@vicons/ionicons5'
import type { TreeOption, UploadFileInfo } from 'naive-ui'
import {
  NButton,
  NDrawer,
  NDrawerContent,
  NForm,
  NFormItem,
  NIcon,
  NInput,
  NScrollbar,
  NSwitch,
  NTag,
  NTree,
  NUpload,
  NUploadDragger,
  useMessage
} from 'naive-ui'
import type { TreeOptions } from 'naive-ui/es/tree/src/interface'
import { onBeforeMount, onMounted, onUnmounted, ref, watch } from 'vue'

const msg = useMessage()
const fileList = ref<TreeOptions>([])
const valueMap = new Map<TreeOption['key'], boolean>()

const defaultExpandedKeys = ref<AnyArray>([])
const checkedKeys = ref<Array<string | number>>([])
const checkedFileKeys = ref<Array<string | number>>([])
const pattern = ref('')
const isActive = ref(false)
const switchMode = ref((getCookieValue(filePwd_K) && getCookieValue(isPublic_K) !== '1') || false)
const formDisabled = ref(true)
const filePwd = ref(getCookieValue(filePwd_K))

const showFileSize = ref(getCookieValue(showFileSize_K) === '1')
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
          <FolderOpenOutline></FolderOpenOutline>
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

const nodeProps = ({ option }: { option: TreeOption }) => {
  return {
    async onClick() {
      if (!option.children && !option.disabled) {
        if (valueMap.has(option.key)) return
        valueMap.set(option.key, true)
        requestIdleCallback(() => {
          const win = openUrlByKey({ key: option.key, label: (option.raw as DirectoryNode).label })
          win?.addEventListener('load', () => valueMap.delete(option.key))
          setTimeout(() => valueMap.delete(option.key), 2000)
        })
      }
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
let nextUploadId = 0

// A separate state entry belongs to each request, never to the shared loading bar.
const runUpload = async (file: File) => {
  const state = ref<UploadState>({ id: ++nextUploadId, name: file.name, phase: 'checking', loaded: 0 })
  uploads.value.push(state.value)
  try {
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
    })
    state.value.phase = 'success'
    msg.success(`文件 ${file.name} 上传成功`)
    await createData()
  } catch (error: any) {
    state.value.phase = 'error'
    state.value.error = error?.message || '上传失败'
    msg.error(state.value.error!)
  }
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

onMounted(() => {
  // 添加全局粘贴事件监听
  document.addEventListener('paste', handlePaste)
})

onUnmounted(() => {
  // 清理事件监听器
  document.removeEventListener('paste', handlePaste)
})

async function createData() {
  try {
    const { data } = await fetchDirectoryTree<DirectoryNode>()
    if (data?.children?.length) {
      fileList.value = generateFileListData(data.children.reverse())
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

const renderFileIcon = (isFile: boolean) => (
  <NIcon>{isFile ? <FileTrayFullOutline /> : <Folder />}</NIcon>
)

const renderDeleteButton = (key: string) => (
  <NButton
    text={true}
    type="error"
    style={{ padding: '0 0.5rem' }}
    onClick={(e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      handleDeleteFile(key)
    }}
  >
    删除
  </NButton>
)

const handleDeleteFile = async (key: string) => {
  try {
    await deleteFile(key)
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

const renderLabel = (item: DirectoryNode) => {
  const elementProps = {
    onContextmenu: (e: MouseEvent) => {
      e.preventDefault()
      copyToClip(openUrlByKey.getFullPath({ key: item.key, label: item.label }))
      msg.success('已复制文件名')
    },
    class: 'cursor-context-menu select-none'
  }
  const hoverClass = item.isFile && !isMobile.value ? 'group' : ''
  return (
    <div class={`${hoverClass}`}>
      <div class="file-label flex items-center gap-3">
        <span {...elementProps}>{item.label}</span>
        {item.isFile && item.size && showFileSize.value && (
          <NTag size="small" type="info" class="whitespace-nowrap">
            {formatFileSize(item.size)}
          </NTag>
        )}
      </div>
    </div>
  )
}

function generateFileListData<T extends DirectoryNode[]>(data: T): TreeOptions {
  return data.map((item) => ({
    key: item.key,
    label: () => renderLabel(item),
    prefix: () => renderFileIcon(!!item.isFile),
    ...(item.children && {
      children: generateFileListData(item.children)
    }),
    ...(item.isFile && {
      suffix: () => renderDeleteButton(item.key)
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
  isActive.value = true
}

const onFilter = (val: string, node: AnyObject) => {
  if (node?.raw.label.includes(val)) return true
  return false
}

watch(isActive, (val) => {
  requestIdleCallback(() => (formDisabled.value = !val))
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
      <a class="brand" href="#" aria-label="文件空间首页">
        <span class="brand-mark"><NIcon :size="22"><FolderOpenOutline /></NIcon></span>
        <span>文件空间<span class="brand-caption">简单存储 · 随时分享</span></span>
      </a>
      <div class="header-actions">
        <span class="access-badge">{{ isAdmin ? '管理员' : '访客空间' }}</span>
        <NButton quaternary @click="changeMode" aria-label="打开设置">
          <template #icon><NIcon><SettingsOutline /></NIcon></template>
          设置
        </NButton>
      </div>
    </header>
    <div class="workspace-body">
      <aside class="workspace-sidebar">
        <div class="sidebar-label">工作空间</div>
        <nav aria-label="主导航">
          <a href="#files" class="nav-item nav-item-active" aria-current="page"><NIcon :size="19"><FolderOpenOutline /></NIcon>全部文件</a>
          <button class="nav-item" @click="changeMode"><NIcon :size="19"><SettingsOutline /></NIcon>空间设置</button>
        </nav>
        <div class="sidebar-note"><NIcon :size="22"><FileTrayFullOutline /></NIcon><strong>让文件井然有序</strong><p>上传、查找与分享，<br />在一个空间轻松完成。</p></div>
        <div class="sidebar-footer">文件空间 <span>·</span> 轻量文件管理</div>
      </aside>
      <main class="workspace-main" id="files">
        <div class="page-heading">
          <div><div class="eyebrow">我的工作空间</div><h1>全部文件</h1><p>管理你的文件，让每一次分享更简单。</p></div>
          <NButton class="refresh-button" @click="createData">刷新数据</NButton>
        </div>
        <section class="upload-panel" aria-label="上传文件">
          <NUpload directory-dnd :action="undefined" multiple :show-file-list="false" with-credentials :default-upload="false" :on-before-upload="beforeUpload">
            <NUploadDragger class="upload-dropzone">
              <div class="upload-prompt">
                <span class="upload-symbol"><NIcon :size="28"><FileTrayFullOutline /></NIcon></span>
                <div class="upload-copy"><h2>把文件放在这里</h2><p>拖拽文件到此处，或点击选择文件上传</p><span>支持多文件上传，也可直接粘贴剪贴板图片</span></div>
                <button type="button" class="upload-cta">＋ 上传文件</button>
              </div>
            </NUploadDragger>
          </NUpload>
        </section>
        <section v-if="uploads.length" aria-label="上传进度" class="upload-progress-panel">
          <div class="section-heading"><h2>传输记录</h2><span>{{ uploads.length }} 个任务</span></div>
          <div class="upload-grid">
            <div v-for="upload in uploads" :key="upload.id" class="upload-entry" :class="`upload-${upload.phase}`">
              <div class="upload-file-name"><NIcon :size="18"><FileTrayFullOutline /></NIcon><strong>{{ upload.name }}</strong></div>
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
        <section class="file-panel" aria-label="文件列表">
          <div class="file-toolbar">
            <div class="file-panel-title"><NIcon :size="20"><FolderOpenOutline /></NIcon><h2>文件目录</h2></div>
            <div class="file-toolbar-actions">
              <NInput v-model:value="pattern" clearable placeholder="搜索文件或文件夹" aria-label="搜索文件或文件夹" class="file-search" />
              <NButton v-if="isAdmin" secondary type="error" :disabled="!checkedFileKeys.length" @click="handleBatchDelete">批量删除{{ checkedFileKeys.length ? `(${checkedFileKeys.length})` : '' }}</NButton>
            </div>
          </div>
          <div class="file-list-caption"><span>名称</span><span>{{ isAdmin ? '选择文件以批量管理' : '点击文件打开 · 右键复制链接' }}</span></div>
          <NScrollbar x-scrollable y-scrollable class="file-scrollbar">
            <NTree v-if="fileList.length" class="file-tree" block-line :pattern="pattern" expand-on-click :checkable="isAdmin" :data="fileList" :node-props="nodeProps" :on-update:expanded-keys="updatePrefixWithExpaned" :checked-keys="checkedKeys" :on-update:checked-keys="handleCheckedKeysUpdate" :default-expanded-keys="defaultExpandedKeys" :filter="onFilter" virtual-scroll />
            <div v-else class="empty-state"><span class="empty-icon"><NIcon :size="36"><FolderOpenOutline /></NIcon></span><h3>暂无文件</h3><p>上传第一个文件，开启你的文件空间。</p></div>
          </NScrollbar>
          <div class="file-panel-footer"><span>{{ switchMode ? '已开启文件密码保护' : '当前上传模式：公开文件' }}</span><button @click="changeMode">管理偏好设置 →</button></div>
        </section>
        <footer class="workspace-footer">支持拖拽上传与图片粘贴<span>你的文件，触手可及。</span></footer>
      </main>
    </div>
    <NDrawer v-model:show="isActive" :width="440" class="settings-drawer" aria-label="空间设置">
      <NDrawerContent title="空间设置" closable>
        <p class="settings-intro">调整访问密码与文件显示偏好，设置将自动保存到当前浏览器。</p>
        <NForm :disabled="formDisabled" label-placement="top">
          <div class="settings-section-title">访问与隐私</div>
          <NFormItem label="文件密码"><NInput v-model:value="filePwd" aria-label="文件密码" type="password" show-password-on="click" placeholder="输入文件访问密码" /></NFormItem>
          <NFormItem label="携带文件密码">
            <div class="setting-row"><p>开启后，只有输入相同密码才能查看上传的文件。</p><NSwitch v-model:value="switchMode" aria-label="携带文件密码" :disabled="!filePwd"><template #checked>开启</template><template #unchecked>关闭</template></NSwitch></div>
          </NFormItem>
          <div class="settings-section-title">显示偏好</div>
          <NFormItem label="显示文件大小"><div class="setting-row"><p>在文件名称旁显示文件大小。</p><NSwitch v-model:value="showFileSize" aria-label="显示文件大小"><template #checked>显示</template><template #unchecked>隐藏</template></NSwitch></div></NFormItem>
        </NForm>
        <template #footer><NButton @click="isActive = false" type="primary" block>完成设置</NButton></template>
      </NDrawerContent>
    </NDrawer>
  </div>
</template>
