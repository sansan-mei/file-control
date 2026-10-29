import { initAxios, Delete, get } from 'mei-utils/client-http'
// mei-utils may bundle an older Axios whose normalized event has no lengthComputable.
export interface UploadProgressEvent { loaded: number; total?: number; lengthComputable?: boolean }
import type { MyResponse } from 'mei-utils/type'

const request = initAxios({
  baseURL: import.meta.env.VITE_GLOB_API_URL,
  withCredentials: true,
  withXSRFToken: true
})

request.interceptors.response.use(
  (response) => {
    if (response.status === 200)
      return response

    throw new Error(response.status.toString())
  },
  (error) => {
    return Promise.reject(error)
  },
)

// 查询文件夹大小
export function fetchDirectorySize<T>(size: number) {
  return get<T>({
    url: '/check-memory',
    data: { size },
  })
}

// 上传文件
export function uploadFile<T>(data: FormData, onUploadProgress?: (event: UploadProgressEvent) => void): Promise<MyResponse<T>> {
  // mei-utils' post helper drops onUploadProgress. Keep its shared Axios instance,
  // response contract and error semantics, but pass the upload callback directly.
  return request.post<MyResponse<T>>('/upload-file', data, { onUploadProgress }).then(
    (response) => {
      if (response.data.status === 'Success' || typeof response.data === 'string') return response.data
      return Promise.reject(response.data)
    },
    (error) => { throw new Error(error?.message || 'Error') }
  )
}

// 删除文件
export function deleteFile<T>(hash: string) {
  return Delete<T>({
    url: '/delete-file',
    data: { hash },
  })
}

// 批量删除文件
export function deleteFiles<T>(hashes: Array<string | number>) {
  return Delete<T>({
    url: '/delete-files',
    data: { hashes: hashes.join(',') },
  })
}

// 查询管理员状态
export function fetchAdminStatus<T>() {
  return get<T>({
    url: '/admin-status',
  })
}

// 获取目录结构
export function fetchDirectoryTree<T>() {
  return get<T>({
    url: '/directory-tree',
  })
}
