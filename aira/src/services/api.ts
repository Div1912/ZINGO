import axios from 'axios'

// Sovereign offline Axios instance
export const api = axios.create({
  baseURL: 'http://192.168.1.10:8080/api',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    'X-AIRA-Client': 'MRPL-Sovereign-Workbench/1.0.0',
  },
})

// Request interceptor logging local Sovereign headers
api.interceptors.request.use(
  (config) => {
    // Ensuring zero external calls
    if (config.url && !config.url.startsWith('http://192.168.') && !config.url.startsWith('/')) {
      console.warn('[AIRA Sovereign Security] Blocked external outbound request:', config.url)
      return Promise.reject(new Error('Outbound traffic blocked by MRPL Air-Gap Policy'))
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.warn('[AIRA Network] Local cluster response:', error.message)
    return Promise.reject(error)
  }
)
