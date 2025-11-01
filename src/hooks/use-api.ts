'use client'

import { useState } from 'react'

interface ApiResponse<T = any> {
  success: boolean
  data?: T
  message?: string
}

export function useApi() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const getApiUrl = (endpoint: string): string => {
    // اگر در محیط توسعه و در preview chat هستیم، از localhost استفاده کن
    if (typeof window !== 'undefined' && window.location.hostname.includes('space.z.ai')) {
      // برای محیط preview، از URL نسبی استفاده کن که به همان سرور اشاره کند
      return endpoint
    }
    return endpoint
  }

  const request = async <T = any>(
    endpoint: string,
    options: RequestInit = {},
    timeout: number = 30000, // 30 ثانیه تایم‌اوت
    maxRetries: number = 2 // حداکثر تعداد تلاش مجدد
  ): Promise<ApiResponse<T>> => {
    try {
      setLoading(true)
      setError(null)

      let lastError: Error | null = null

      for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
        try {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), timeout)

          const url = getApiUrl(endpoint)
          console.log(`API Request URL (Attempt ${attempt}/${maxRetries + 1}):`, url)
          console.log('API Request Options:', options)
          
          const response = await fetch(url, {
            headers: {
              'Content-Type': 'application/json',
              ...options.headers,
            },
            signal: controller.signal,
            ...options,
          })

          clearTimeout(timeoutId)
          console.log('API Response Status:', response.status)

          // اگر خطای سرور 5xx بود و تلاش مجدد باقی مانده، صبر کن و دوباره تلاش کن
          if (response.status >= 500 && attempt <= maxRetries) {
            console.log(`Server error ${response.status}, retrying in ${attempt * 1000}ms...`)
            await new Promise(resolve => setTimeout(resolve, attempt * 1000))
            continue
          }

          if (!response.ok) {
            // برای خطاهای 4xx، مستقیماً خطا را پرتاب کن
            if (response.status >= 400 && response.status < 500) {
              const errorData = await response.text()
              throw new Error(`HTTP error! status: ${response.status} - ${errorData}`)
            }
            // برای خطاهای دیگر، اگر تلاش مجدد باقی مانده، ادامه بده
            if (attempt <= maxRetries) {
              console.log(`Request failed with status ${response.status}, retrying...`)
              await new Promise(resolve => setTimeout(resolve, attempt * 1000))
              continue
            }
            throw new Error(`HTTP error! status: ${response.status}`)
          }

          const data = await response.json()
          console.log('API Response Data:', data)
          
          setLoading(false)
          return data

        } catch (err) {
          lastError = err as Error
          console.error(`API Request Error (Attempt ${attempt}/${maxRetries + 1}):`, err)
          
          // اگر این آخرین تلاش بود یا خطا از نوع AbortError نبود، ادامه بده
          if (attempt > maxRetries || (err as Error).name === 'AbortError') {
            break
          }
          
          // برای سایر خطاها، صبر کن و دوباره تلاش کن
          console.log(`Retrying in ${attempt * 1000}ms...`)
          await new Promise(resolve => setTimeout(resolve, attempt * 1000))
        }
      }

      // اگر همه تلاش‌ها ناموفق بود، خطا را تنظیم کن
      let errorMessage = 'Unknown error occurred'
      
      if (lastError instanceof Error) {
        if (lastError.name === 'AbortError') {
          errorMessage = 'درخواست زمان‌بر بود. لطفاً دوباره تلاش کنید.'
        } else if (lastError.message.includes('Failed to fetch')) {
          errorMessage = 'خطا در ارتباط با سرور. لطفاً اتصال اینترنت خود را بررسی کنید.'
        } else if (lastError.message.includes('HTTP error! status: 502')) {
          errorMessage = 'سرور در حال به‌روزرسانی است. لطفاً چند لحظه دیگر دوباره تلاش کنید.'
        } else if (lastError.message.includes('HTTP error! status: 5')) {
          errorMessage = 'خطای داخلی سرور. لطفاً دوباره تلاش کنید.'
        } else {
          errorMessage = lastError.message
        }
      }
      
      setError(errorMessage)
      setLoading(false)
      return {
        success: false,
        message: errorMessage,
      }
    } finally {
      setLoading(false)
    }
  }

  const post = async <T = any>(
    endpoint: string,
    data: any,
    timeout?: number
  ): Promise<ApiResponse<T>> => {
    return request<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    }, timeout)
  }

  const get = async <T = any>(
    endpoint: string,
    timeout?: number
  ): Promise<ApiResponse<T>> => {
    return request<T>(endpoint, {
      method: 'GET',
    }, timeout)
  }

  return {
    loading,
    error,
    post,
    get,
    request,
  }
}