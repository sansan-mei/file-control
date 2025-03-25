import { NextFunction, Request, Response } from 'express'

export interface DirectoryNode {
  key: string
  label: string
  isFile: boolean
  children?: DirectoryNode[]
  size?: number
}

export type RouterConfig = {
  // 不写默认get
  method?: 'get' | 'post' | 'put' | 'delete' | 'patch' | 'options' | 'head' | 'all'
  // 写一个ts体操，必须path以/开头，且不能以/结尾
  path: `/${string}`
  middleware?: any[]
  handler: (req: Request<any>, res: Response<any>, next: NextFunction) => void
}[]

export interface CatchErrorType<S = 'stream' | 'other'> {
  res: Response<any>
  callback: () => S extends 'stream' ? void : Promise<Partial<MyResponseType<any>> | string>
  errorMsg?: string | Function
}

export interface MyResponseType<T> {
  code: number
  message: string
  data: T
  status: 'Success' | 'Fail' | 'Unauthorized'
}
