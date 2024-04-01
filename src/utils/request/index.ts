import type { AxiosProgressEvent, AxiosResponse, GenericAbortSignal } from 'axios'
import axios from 'axios'

const request = axios.create({
  baseURL: import.meta.env.VITE_GLOB_API_URL,
})

request.interceptors.response.use(
  (response: AxiosResponse): AxiosResponse => {
    if (response.status === 200)
      return response

    throw new Error(response.status.toString())
  },
  (error) => {
    return Promise.reject(error)
  },
)

export interface HttpOption {
  url: string
  data?: any
  method?: Methods
  headers?: any
  onDownloadProgress?: (progressEvent: AxiosProgressEvent) => void
  signal?: GenericAbortSignal
  beforeRequest?: () => void
  afterRequest?: () => void
  responseType?: 'arraybuffer' | 'blob' | 'document' | 'json' | 'text' | 'stream'
}

export interface Response<T = any> {
  code: number
  data: T
  message: string
  status: 'Success' | 'Fail' | 'Unauthorized'
}

enum Methods {
  GET = 'GET',
  POST = 'POST',
  DELETE = 'DELETE',
  PUT = 'PUT',
}

function http<T = any>(
  { url, data, method, headers, onDownloadProgress, signal, beforeRequest, afterRequest, responseType }: HttpOption,
) {
  const successHandler = (res: AxiosResponse<Response<T>>) => {
    if (res.data.status === 'Success' || typeof res.data === 'string' || responseType === 'blob')
      return res.data

    if (res.data.status === 'Unauthorized') {
      window.location.reload()
    }

    return Promise.reject(res.data)
  }

  const failHandler = (error: Response<Error>) => {
    afterRequest?.()
    throw new Error(error?.message || 'Error')
  }

  beforeRequest?.()

  method = method || Methods.GET

  const params = Object.assign(typeof data === 'function' ? data() : data ?? {}, {})

  switch (method) {
    case Methods.GET:
      return request.get(url, { params, signal, onDownloadProgress, responseType }).then(successHandler, failHandler)
    case Methods.POST:
      return request.post(url, params, { headers, signal, onDownloadProgress }).then(successHandler, failHandler)
    case Methods.DELETE:
      return request.delete(url, { params, signal, onDownloadProgress }).then(successHandler, failHandler)
    case Methods.PUT:
      return request.put(url, params, { headers, signal, onDownloadProgress }).then(successHandler, failHandler)
    default:
      throw new Error(`Invalid HTTP method: ${method}`)
  }
}

export function get<T = any>(
  { url, data, method = Methods.GET, onDownloadProgress, signal, beforeRequest, afterRequest, responseType }: HttpOption,
): Promise<Response<T>> {
  return http<T>({
    url,
    method,
    data,
    onDownloadProgress,
    signal,
    beforeRequest,
    afterRequest,
    responseType,
  })
}

export function post<T = any>(
  { url, data, method = Methods.POST, headers, onDownloadProgress, signal, beforeRequest, afterRequest }: HttpOption,
): Promise<Response<T>> {
  return http<T>({
    url,
    method,
    data,
    headers,
    onDownloadProgress,
    signal,
    beforeRequest,
    afterRequest,
  })
}

export function Delete<T = any>(
  { url, data, method = Methods.DELETE, headers, onDownloadProgress, signal, beforeRequest, afterRequest }: HttpOption,
): Promise<Response<T>> {
  return http<T>({
    url,
    method,
    data,
    headers,
    onDownloadProgress,
    signal,
    beforeRequest,
    afterRequest,
  })
}

export function put<T = any>(
  { url, data, method = Methods.PUT, headers, onDownloadProgress, signal, beforeRequest, afterRequest }: HttpOption,
): Promise<Response<T>> {
  return http<T>({
    url,
    method,
    data,
    headers,
    onDownloadProgress,
    signal,
    beforeRequest,
    afterRequest,
  })
}