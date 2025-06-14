<script lang="tsx" setup>
import { deleteFile, fetchDirectorySize, fetchDirectoryTree, uploadFile } from '@/api'
import { filePwd_K, isPublic_K, showFileSize_K } from '@/constant'
import { useIsMobile } from '@/hoooks'
import { copyToClip, formatFileSize, getCookieValue, openUrlByKey, setCookieValue } from '@/utils'
import {
  FileTrayFullOutline,
  Folder,
  FolderOpenOutline,
  Settings,
  SettingsOutline
} from '@vicons/ionicons5'
import type { TreeOption, UploadFileInfo } from 'naive-ui'
import {
  NButton,
  NCard,
  NDrawer,
  NForm,
  NFormItem,
  NIcon,
  NInput,
  NLayout,
  NLayoutContent,
  NScrollbar,
  NSwitch,
  NTag,
  NTree,
  NUpload,
  NUploadDragger,
  useLoadingBar,
  useMessage
} from 'naive-ui'
import type { TreeOptions } from 'naive-ui/es/tree/src/interface'
import { onBeforeMount, onMounted, onUnmounted, ref, watch } from 'vue'

const msg = useMessage()
const fileList = ref<TreeOptions>([])
const valueMap = new Map<TreeOption['key'], boolean>()
let timer: any
const defaultExpandedKeys = ref<AnyArray>([])
const pattern = ref('')
const isSetting = ref(false)
const isActive = ref(false)
const switchMode = ref((getCookieValue(filePwd_K) && getCookieValue(isPublic_K) !== '1') || false)
const formDisabled = ref(true)
const filePwd = ref(getCookieValue(filePwd_K))
const loading = useLoadingBar()
const showFileSize = ref(getCookieValue(showFileSize_K) === '1')
const isMobile = useIsMobile()

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

const nodeProps = ({ option }: { option: TreeOption & { raw: AnyObject } }) => {
  return {
    async onClick() {
      if (!option.children && !option.disabled) {
        if (valueMap.has(option.key)) return
        valueMap.set(option.key, true)
        requestIdleCallback(() => {
          const win = openUrlByKey({ key: option.key, label: option.raw.label })
          win?.addEventListener('load', () => valueMap.delete(option.key))
          setTimeout(() => valueMap.delete(option.key), 2000)
        })
      }
    }
  }
}

// 处理剪切板图片粘贴上传
const handlePasteUpload = async (file: File) => {
  try {
    loading.start()
    await fetchDirectorySize(file.size / 1024 / 1024)
    const body = new FormData()
    body.append('file', file)

    setCookieValue(isPublic_K, switchMode.value ? '0' : '1')

    const res = await uploadFile(body)
    if (res) {
      msg.success(`图片 ${file.name} 上传成功`)
      if (timer) {
        clearTimeout(timer)
        timer = null
        timer = setTimeout(() => {
          createData()
          loading.finish()
        }, 500)
      } else {
        timer = setTimeout(() => {
          createData()
          loading.finish()
        }, 500)
      }
    }
  } catch (error: any) {
    console.warn(error)
    msg.error(error?.message || '粘贴上传失败')
    loading.error()
  }
}

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
        
        await handlePasteUpload(namedFile)
        break // 只处理第一个图片
      }
    }
  }
}

onBeforeMount(createData)

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
      <div class="flex items-center gap-3 group-hover:scale-105 group-hover:-translate-y-0.5 transform transition-all duration-300 ease-out group-hover:font-medium origin-left">
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
  let res
  try {
    loading.start()
    const file = options.file.file!
    await fetchDirectorySize(file.size / 1024 / 1024)
    const body = new FormData()
    body.append('file', file)

    setCookieValue(isPublic_K, switchMode.value ? '0' : '1')

    res = await uploadFile(body)
    if (timer) {
      clearTimeout(timer)
      timer = null
      timer = setTimeout(() => {
        createData()
        loading.finish()
      }, 500)
    } else {
      timer = setTimeout(() => {
        createData()
        loading.finish()
      }, 500)
    }
  } catch (error: any) {
    console.warn(error)
    msg.error(error?.message || '上传失败')
  } finally {
    return !!res
  }
}

const changeMode = () => {
  isActive.value = true
}

const onFilter = (val: string, node: AnyObject) => {
  if (node?.raw.label.includes(val)) return true
  return false
}

watch(isActive, (val) => {
  isSetting.value = val
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
  <NLayout class="z-40 transition min-h-screen" has-sider>
    <NLayoutContent class="h-full py-8">
      <div class="grid gap-4 md:grid-cols-[repeat(2,6.25rem)_6.25rem] grid-cols-3 ml-2 max-w-[95%]">
        <NButton type="primary" @click="createData" class="md:w-auto w-full"> 刷新数据 </NButton>
        <NUpload
          directory-dnd
          class="md:w-auto w-full"
          :action="undefined"
          multiple
          :show-file-list="false"
          with-credentials
          :default-upload="false"
          :on-before-upload="beforeUpload"
        >
          <NUploadDragger
            style="padding: 0; border: 0; background-color: white"
            class="md:w-auto w-full"
          >
            <NButton class="md:w-auto w-full">上传文件</NButton>
          </NUploadDragger>
        </NUpload>
        <NButton
          secondary
          :type="isSetting ? 'success' : 'tertiary'"
          @click="changeMode"
          class="md:w-auto w-full"
        >
          <template #icon>
            <NIcon>
              <Settings v-if="isSetting" />
              <SettingsOutline v-else />
            </NIcon>
          </template>
          {{ !isSetting ? '设置' : '设置中' }}
        </NButton>
      </div>
      <div class="grid gap-y-2 mt-4">
        <NInput v-model:value="pattern" placeholder="搜索" style="width: 96%; margin-left: 2%" />
        <NScrollbar x-scrollable y-scrollable>
          <NTree
            block-line
            :pattern="pattern"
            expand-on-click
            :data="fileList"
            :node-props="nodeProps"
            :on-update:expanded-keys="updatePrefixWithExpaned"
            :default-expanded-keys="defaultExpandedKeys"
            :filter="onFilter"
            virtual-scroll
          />
        </NScrollbar>
      </div>
      <NDrawer v-model:show="isActive" default-width="31rem" class="max-w-[70%] p-4">
        <NCard>
          <NForm :disabled="formDisabled">
            <NFormItem label="文件密码">
              <NInput v-model:value="filePwd" placeholder="输入密码" />
            </NFormItem>
            <NFormItem label="携带文件密码（只有输入相同密码才能查看该文件)">
              <NSwitch v-model:value="switchMode" :disabled="!filePwd" :round="false">
                <template #checked> 已开启 </template>
                <template #unchecked> 已关闭 </template>
              </NSwitch>
            </NFormItem>
            <NFormItem label="显示文件大小">
              <NSwitch v-model:value="showFileSize" :round="false">
                <template #checked> 显示 </template>
                <template #unchecked> 隐藏 </template>
              </NSwitch>
            </NFormItem>
          </NForm>
        </NCard>
      </NDrawer>
    </NLayoutContent>
  </NLayout>
</template>
