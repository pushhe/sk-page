import axios from 'axios'
import { ElMessage, ElLoading } from 'element-plus'

let loadingCount = 0
let loadingInstance = null

// 开启 Loading
const startLoading = () => {
  if (loadingCount === 0) {
    loadingInstance = ElLoading.service({
      fullscreen: true,
      lock: true,
      text: 'loading...',
      background: 'rgba(0, 0, 0, 0.7)',
    })
  }
  loadingCount++
}

// 关闭 Loading
const stopLoading = () => {
  loadingCount--
  if (loadingCount <= 0) {
    loadingInstance?.close()
    loadingCount = 0 // 重置
  }
}

const service = axios.create({
  baseURL: import.meta.env.VITE_APP_BASE_API,
  timeout: 10000,
})

service.interceptors.request.use(
  (config) => {
    if (config.loading !== false) {
      startLoading()
    }

    const token = localStorage.getItem('token')
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  },
)

service.interceptors.response.use(
  (response) => {
    stopLoading()
    return response.data
  },
  (error) => {
    // 2. HTTP 网络级错误：处理 404, 500, 网络断开等
    let msg
    if (error.response) {
      switch (error.response.status) {
        case 401:
          msg = '登录状态过期，请重新登录'
          break
        case 403:
          msg = '权限不足，拒绝访问'
          break
        case 404:
          msg = '请求资源不存在'
          break
        case 500:
          msg = '服务器内部错误'
          break
        default:
          msg = '网络连接异常'
      }
    } else {
      msg = '连接服务器超时或网络异常'
    }

    // 统一显示错误提示
    ElMessage.error(msg)

    return Promise.reject(error)
  },
)

export default service
