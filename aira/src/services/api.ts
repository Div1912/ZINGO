import axios from 'axios'

export const DEFAULT_API_BASE_URL = 'https://lbs-litigation-really-tap.trycloudflare.com'

// Configured Axios instance connecting to the Qwen cluster tunnel
export const api = axios.create({
  baseURL: DEFAULT_API_BASE_URL,
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
    'X-AIRA-Client': 'MRPL-Sovereign-Workbench/1.0.0',
  },
})

// Request interceptor
api.interceptors.request.use(
  (config) => {
    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.warn('[AIRA Network] Cluster response error:', error.message)
    return Promise.reject(error)
  }
)
