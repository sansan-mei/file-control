<script lang="tsx" setup>
import { deleteFile, fetchDirectorySize, fetchDirectoryTree, uploadFile } from '@/api'
import { filePwd_K, isPublic_K } from '@/constant'
import type { DirectoryNode } from '@/types'
import { getCookieValue, openUrlByKey, setCookieValue } from '@/utils'
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
import { onBeforeMount, ref, watch } from 'vue'

const msg = useMessage()
const fileList = ref<TreeOptions>([])
const valueMap = new Map<TreeOption['key'], boolean>()
let timer: any
const defaultExpandedKeys = ref<any[]>([])
const pattern = ref('')
const isSetting = ref(false)
const isActive = ref(false)
const switchMode = ref((getCookieValue(filePwd_K) && getCookieValue('isPublic') !== '1') || false)
const formDisabled = ref(true)
const filePwd = ref(getCookieValue('filePwd'))
const loading = useLoadingBar()

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
          const win = openUrlByKey({ key: option.key, label: option.label })
          win?.addEventListener('load', () => valueMap.delete(option.key))
          setTimeout(() => valueMap.delete(option.key), 2000)
        })
      }
    }
  }
}
onBeforeMount(createData)

async function createData() {
  try {
    const { data } = await fetchDirectoryTree<DirectoryNode>()
    if (data?.children?.length) {
      fileList.value = generateFileListData(data.children)
      defaultExpandedKeys.value = [data.children.at(-1)?.key]
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
    onClick={(e) => {
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

const formatFileSize = (size: number) => {
  if (size < 1024) return `${size.toFixed(2)}B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)}KB`
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(2)}MB`
  return `${(size / (1024 * 1024 * 1024)).toFixed(2)}GB`
}

const renderLabel = (item: DirectoryNode) => (
  <div class="flex items-center gap-2">
    <span class="mr-3">{item.label}</span>
    {item.isFile && item.size && (
      <NTag size="small" type="info" class="whitespace-nowrap">
        {formatFileSize(item.size)}
      </NTag>
    )}
  </div>
)

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
    })
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
</script>

<template>
  <NLayout class="z-40 transition min-h-screen" has-sider>
    <NLayoutContent class="h-full py-8">
      <NScrollbar x-scrollable>
        <div class="grid gap-4 grid-box ml-2">
          <NButton type="primary" @click="createData"> 刷新数据 </NButton>
          <NUpload
            directory-dnd
            class="flex-1"
            :action="undefined"
            multiple
            :show-file-list="false"
            with-credentials
            :default-upload="false"
            :on-before-upload="beforeUpload"
          >
            <NUploadDragger style="padding: 0; border: 0; background-color: white">
              <NButton>上传文件</NButton>
            </NUploadDragger>
          </NUpload>
          <NButton secondary :type="isSetting ? 'success' : 'tertiary'" @click="changeMode">
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
          <NTree
            block-line
            :pattern="pattern"
            expand-on-click
            :data="fileList"
            :node-props="nodeProps"
            :on-update:expanded-keys="updatePrefixWithExpaned"
            :default-expanded-keys="defaultExpandedKeys"
          />
        </div>
        <NDrawer
          v-model:show="isActive"
          default-width="31rem"
          style="max-width: 70%; padding: 20px"
        >
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
            </NForm>
          </NCard>
        </NDrawer>
      </NScrollbar>
    </NLayoutContent>
  </NLayout>
</template>

<style>
.grid-box {
  grid-template-columns: repeat(2, 6.25rem) 6.25rem;
}
</style>
