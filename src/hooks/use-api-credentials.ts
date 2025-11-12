import { useEffect } from 'react'
import { useApiCredentialsStore } from '@/lib/api-credentials-store'

/**
 * Hook to get API credentials and configuration status
 */
export function useApiCredentials() {
  const { 
    apiKey, 
    apiSecret, 
    isConfigured, 
    getCredentials, 
    validateCredentials 
  } = useApiCredentialsStore()

  return {
    apiKey,
    apiSecret,
    isConfigured,
    getCredentials,
    validateCredentials,
    hasValidCredentials: validateCredentials()
  }
}

/**
 * Hook to get API config for CoinEx API
 */
export function useCoinExApiConfig() {
  const { getCredentials, isConfigured } = useApiCredentialsStore()
  
  if (!isConfigured) {
    return {
      apiKey: 'temp',
      apiSecret: 'temp',
      baseUrl: 'https://api.coinex.com',
      futuresBaseUrl: 'https://api.coinex.com',
      useProxy: true
    }
  }

  const { apiKey, apiSecret } = getCredentials()
  
  return {
    apiKey,
    apiSecret,
    baseUrl: 'https://api.coinex.com',
    futuresBaseUrl: 'https://api.coinex.com',
    useProxy: true
  }
}

/**
 * Hook to initialize API config in stores
 */
export function useInitializeApiConfig() {
  const { isConfigured, getCredentials } = useApiCredentialsStore()

  useEffect(() => {
    if (isConfigured) {
      const { apiKey, apiSecret } = getCredentials()
      
      // Initialize CoinEx API store
      import('@/lib/coinex-api').then(({ useCoinExAPI }) => {
        const api = useCoinExAPI.getState()
        api.setConfig({
          apiKey,
          apiSecret,
          baseUrl: 'https://api.coinex.com',
          futuresBaseUrl: 'https://api.coinex.com',
          useProxy: true
        })
      })
      
      // Initialize trading engine config
      import('@/lib/trading-engine').then(({ TradingEngine }) => {
        // TradingEngine is a class, not a Zustand store
        // We'll let the trading-dashboard handle the engine initialization
        console.log('TradingEngine class imported successfully');
      })
    }
  }, [isConfigured, getCredentials])
}