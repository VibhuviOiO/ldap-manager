import { toast as sonnerToast } from 'sonner'

export const toast = {
  success: (message: string) => {
    sonnerToast.success(message)
  },
  error: (message: string) => {
    sonnerToast.error(message)
  },
  info: (message: string) => {
    sonnerToast.info(message)
  },
  warning: (message: string) => {
    sonnerToast.warning(message)
  },
  loading: (message: string) => {
    return sonnerToast.loading(message)
  },
  promise: <T,>(
    promise: Promise<T>,
    {
      loading,
      success,
      error,
    }: {
      loading: string
      success: string | ((data: T) => string)
      error: string | ((error: any) => string)
    }
  ) => {
    return sonnerToast.promise(promise, { loading, success, error })
  },
}

export const getErrorMessage = (error: any): string => {
  if (error.response?.data?.detail) {
    return error.response.data.detail
  }
  if (error.message) {
    return error.message
  }
  return 'An unexpected error occurred'
}
