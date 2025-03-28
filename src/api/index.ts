import { initAxios, Delete, get, post } from 'mei-utils/client-http'

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
export function uploadFile<T>(data: FormData) {
  return post<T>({
    url: '/upload-file',
    data,
  })
}

// 删除文件
export function deleteFile<T>(hash: string) {
  return Delete<T>({
    url: '/delete-file',
    data: { hash },
  })
}

// 获取目录结构
export function fetchDirectoryTree<T>() {
  return get<T>({
    url: '/directory-tree',
  })
}