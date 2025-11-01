import { create } from 'zustand'

interface ApiCredentialsState {
  apiKey: string
  apiSecret: string
  isConfigured: boolean
  setCredentials: (apiKey: string, apiSecret: string) => void
  clearCredentials: () => void
  getCredentials: () => { apiKey: string; apiSecret: string }
  validateCredentials: () => boolean
}

export const useApiCredentialsStore = create<ApiCredentialsState>((set, get) => ({
  apiKey: '',
  apiSecret: '',
  isConfigured: false,

  setCredentials: (apiKey: string, apiSecret: string) => {
    set({ 
      apiKey: apiKey.trim(), 
      apiSecret: apiSecret.trim(),
      isConfigured: apiKey.trim() !== '' && apiSecret.trim() !== '' && 
                   apiSecret !== 'your-api-secret-here' && 
                   apiSecret !== 'temp'
    })
    
    // Also save to localStorage for persistence
    if (typeof window !== 'undefined') {
      localStorage.setItem('coinex_api_key', apiKey.trim())
      localStorage.setItem('coinex_api_secret', apiSecret.trim())
    }
  },

  clearCredentials: () => {
    set({ 
      apiKey: '', 
      apiSecret: '',
      isConfigured: false 
    })
    
    // Clear from localStorage
    if (typeof window !== 'undefined') {
      localStorage.removeItem('coinex_api_key')
      localStorage.removeItem('coinex_api_secret')
    }
  },

  getCredentials: () => {
    const { apiKey, apiSecret } = get()
    return { apiKey, apiSecret }
  },

  validateCredentials: () => {
    const { apiKey, apiSecret } = get()
    return apiKey.trim() !== '' && 
           apiSecret.trim() !== '' && 
           apiSecret !== 'your-api-secret-here' && 
           apiSecret !== 'temp'
  }
}))

// Initialize from localStorage on client side
if (typeof window !== 'undefined') {
  const savedApiKey = localStorage.getItem('coinex_api_key') || ''
  const savedApiSecret = localStorage.getItem('coinex_api_secret') || ''
  
  if (savedApiKey && savedApiSecret) {
    useApiCredentialsStore.getState().setCredentials(savedApiKey, savedApiSecret)
  }
}