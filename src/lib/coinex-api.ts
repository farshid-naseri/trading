import { create } from 'zustand';
import axios from 'axios';
import https from 'https';
import { logger, logApiError } from './logging';

interface CoinExConfig {
  apiKey: string;
  apiSecret: string;
  baseUrl: string;
  futuresBaseUrl: string;
  useProxy?: boolean; // گزینه جدید برای استفاده از پروکسی
}

interface MarketData {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  quoteCcy: string; // Quote currency (e.g., USDT)
  baseCcy: string; // Base currency (e.g., BTC)
  minAmount: number; // Minimum amount for trading
  precision: {
    base: number; // Base currency precision
    quote: number; // Quote currency precision
  };
}

interface Balance {
  ccy: string;
  available: number;
  frozen: number;
}

interface CandleData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface CoinExAPIState {
  config: CoinExConfig | null;
  isConnected: boolean;
  balance: number;
  marketData: MarketData | null;
  candles: CandleData[];
  logs: string[];
  
  // Actions
  setConfig: (config: CoinExConfig) => void;
  connect: () => Promise<boolean>;
  testConnection: () => Promise<boolean>;
  disconnect: () => void;
  fetchBalance: () => Promise<number>;
  fetchMarketData: (symbol: string) => Promise<MarketData | null>;
  fetchCandles: (symbol: string, period: string, limit?: number) => Promise<CandleData[]>;
  placeOrder: (params: {
    market: string;
    side: 'buy' | 'sell';
    type: 'market' | 'limit';
    amount: number;
    price?: number;
    leverage?: number;
    margin_mode?: string;
  }) => Promise<any>;
  setTakeProfit: (market: string, price: number) => Promise<boolean>;
  setStopLoss: (market: string, price: number) => Promise<boolean>;
  adjustLeverage: (symbol: string, leverage: number, margin_mode: string) => Promise<boolean>;
  testSignatureGeneration: (params: {
    method: string;
    path: string;
    body: string;
    params?: Record<string, any>;
  }) => Promise<{
    timestamp: string;
    sortedQuery: string;
    preparedString: string;
    signature: string;
  }>;
  getPendingPositions: (market?: string) => Promise<any[]>;
  getFinishedPositions: (market?: string, start_time?: number, end_time?: number) => Promise<any[]>;
  getCurrentPositions: (market?: string) => Promise<any[]>;
  addLog: (message: string) => void;
  clearLogs: () => void;
}

// Helper function to format JSON string exactly like Python's json.dumps with separators=(',', ':')
const formatJsonLikePython = (obj: any): string => {
  // Python's json.dumps with separators=(',', ':') removes ALL whitespace
  // This includes spaces after commas, colons, braces, etc.
  const jsonStr = JSON.stringify(obj).replace(/\s/g, '');
  console.log('🔍 Debug - formatJsonLikePython input:', obj);
  console.log('🔍 Debug - formatJsonLikePython output:', jsonStr);
  return jsonStr;
};

const generateSignature = async (secret: string, method: string, path: string, body: string, timestamp: string, params: Record<string, any> = {}): Promise<string> => {
  // مرتب‌سازی و کدگذاری پارامترها - دقیقاً مانند Python
  const sortedParams = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .reduce((obj, [key, value]) => {
      obj[key] = value;
      return obj;
    }, {} as Record<string, any>);
  
  // استفاده از urlencode شبیه به Python
  const sortedQuery = Object.entries(sortedParams)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
    
  // ساخت رشته آماده برای امضا - دقیقاً مطابق با کد Python
  let preparedStr = '';
  if (sortedQuery) {
    preparedStr = `${method}${path}?${sortedQuery}${body}${timestamp}`;
  } else {
    preparedStr = `${method}${path}${body}${timestamp}`;
  }
  
  console.log('🔍 Debug - Signature Generation:');
  console.log('Method:', method);
  console.log('Path:', path);
  console.log('Sorted Query:', sortedQuery);
  console.log('Body:', body);
  console.log('Body Length:', body.length);
  console.log('Timestamp:', timestamp);
  console.log('Timestamp Length:', timestamp.length);
  console.log('Prepared String:', preparedStr);
  console.log('Prepared String Length:', preparedStr.length);
  
  // تولید امضا با HMAC-SHA256 - دقیقاً مانند Python
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(preparedStr);
  
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', key, messageData);
  
  // تبدیل به هگزادسیمال و حروف کوچک - دقیقاً مانند Python
  const signatureHex = Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .toLowerCase();
    
  console.log('Generated Signature:', signatureHex);
  console.log('Signature Length:', signatureHex.length);
  
  return signatureHex;
};

const createAxiosInstance = (config: CoinExConfig) => {
  const axiosConfig: any = {
    timeout: 30000, // 30 seconds timeout
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  };

  // اگر پروکسی فعال باشد، از API route پروکسی استفاده کن
  if (config.useProxy) {
    axiosConfig.baseURL = '/api/coinex-proxy';
    axiosConfig.adapter = async (config: any) => {
      const { url, method, headers, data, params } = config;
      
      // استخراج URL واقعی از درخواست
      let realUrl = url.replace('/api/coinex-proxy', '');
      
      // اگر پارامترهای وجود دارند، به URL اضافه کن
      if (params && Object.keys(params).length > 0) {
        const queryString = new URLSearchParams(params).toString();
        realUrl += (realUrl.includes('?') ? '&' : '?') + queryString;
      }
      
      try {
        const response = await fetch('/api/coinex-proxy', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: realUrl,
            method: method?.toUpperCase() || 'GET',
            headers: headers || {},
            data: data // فقط data را به عنوان body ارسال کن
          })
        });
        
        const responseData = await response.json();
        
        return {
          data: responseData,
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
          config: config
        };
      } catch (error) {
        throw error;
      }
    };
  }

  return axios.create(axiosConfig);
};

// تابع کمکی برای مدیریت خطاها
const handleApiError = (error: any, context: string, logger: any) => {
  const errorMessage = logApiError(error, context, 'API');
  
  // نمایش اطلاعات دیباگ بیشتر
  if (error.config) {
    logger.debug(`Request URL: ${error.config.url}`, context);
    logger.debug(`Request Method: ${error.config.method}`, context);
    if (error.config.headers) {
      logger.debug(`Request Headers: ${JSON.stringify(error.config.headers)}`, context);
    }
  }
  
  return errorMessage;
};

// تابع عمومی برای درخواست‌های API - دقیقاً مانند پایتون
const apiRequest = async (
  config: CoinExConfig,
  method: string,
  path: string,
  body: string = '',
  params: Record<string, any> = {}
) => {
  // تولید timestamp در میلی‌ثانیه - دقیقاً مانند پایتون
  const timestamp = Date.now().toString();
  
  // مرتب‌سازی و کدگذاری پارامترها - دقیقاً مانند Python
  const sortedParams = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .reduce((obj, [key, value]) => {
      obj[key] = value;
      return obj;
    }, {} as Record<string, any>);
  
  // استفاده از encodeURIComponent شبیه به urlencode در Python
  const sortedQuery = Object.entries(sortedParams)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  
  // ساخت URL کامل با پارامترهای کوئری
  const url = `${config.baseUrl}${path}`;
  const fullUrl = sortedQuery ? `${url}?${sortedQuery}` : url;
  
  // تولید امضا
  const signature = await generateSignature(config.apiSecret, method.toUpperCase(), path, body, timestamp, params);
  
  // افزودن لاگ‌های دیباگ برای عیب‌یابی امضا
  if (path === '/v2/futures/order' || path === '/v2/futures/set-position-take-profit' || path === '/v2/futures/set-position-stop-loss' || path === '/v2/futures/adjust-position-leverage' || path === '/v2/assets/futures/balance') {
    console.log('🔍 Debug - API Request Summary:');
    console.log('Full URL:', fullUrl);
    console.log('Body Length:', body.length);
    console.log('Body contains spaces:', body.includes(' '));
    
    // لاگ اطلاعات هدرها
    console.log('🔍 Debug - Headers:');
    console.log('X-COINEX-KEY:', config.apiKey.substring(0, 8) + '...');
    console.log('X-COINEX-SIGN:', signature);
    console.log('X-COINEX-TIMESTAMP:', timestamp);
    console.log('Content-Type:', 'application/json');
  }
  
  const headers = {
    'X-COINEX-KEY': config.apiKey,
    'X-COINEX-SIGN': signature,
    'X-COINEX-TIMESTAMP': timestamp,
    'Content-Type': 'application/json'
  };
  
  try {
    const axiosInstance = createAxiosInstance(config);
    
    let response;
    if (method.toUpperCase() === 'GET') {
      response = await axiosInstance.get(fullUrl, { headers });
    } else {
      // برای POST درخواست‌ها، body باید به صورت رشته‌ای ارسال شود
      response = await axiosInstance.post(fullUrl, body, { 
        headers,
        // مهم: نباید داده را دوباره parse کنه
        transformRequest: [(data) => data],
        transformResponse: [(data) => data]
      });
    }
    
    // لاگ کردن پاسخ برای عیب‌یابی
    let responseData;
    try {
      responseData = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
    } catch (e) {
      responseData = response.data;
    }
    console.log(`📥 API Response: ${response.status} - ${JSON.stringify(responseData)}`);
    
    // لاگ کردن پاسخ تنها در صورت خطا
    if (responseData.code !== 200 && responseData.code !== 0) {
      console.log(`❌ API Error Response: ${response.status} - ${JSON.stringify(responseData)}`);
    }
    
    if (responseData.code !== 0 && responseData.code !== 200) {
      throw new Error(responseData.message || `API Error: ${responseData.code}`);
    }
    
    return responseData;
  } catch (error: any) {
    console.error(`API درخواست خطا: ${error.message}`);
    throw error;
  }
};

// Export apiRequest for external use
export { apiRequest };

export const useCoinExAPI = create<CoinExAPIState>((set, get) => ({
  config: null,
  isConnected: false,
  balance: 0,
  marketData: null,
  candles: [],
  logs: [],

  setConfig: (config) => {
    // Validate config before setting
    if (!config.apiKey || !config.apiSecret) {
      throw new Error('API Key and API Secret are required');
    }
    set({ config });
  },

  connect: async () => {
    const { config } = get();
    if (!config) {
      get().addLog('❌ تنظیمات API تنظیم نشده است');
      return false;
    }

    try {
      get().addLog('🔄 در حال اتصال به API کوینکس...');
      
      // First test the connection with a simple public request
      const axiosInstance = createAxiosInstance(config);
      
      try {
        const publicResponse = await axiosInstance.get(`${config.baseUrl}/v1/market/list`);
        if (publicResponse.data.code === 0) {
          get().addLog('✅ اتصال به سرور CoinEx برقرار است');
        } else {
          get().addLog('⚠️ خطا در اتصال عمومی به CoinEx');
          return false;
        }
      } catch (publicError) {
        get().addLog('❌ خطا در اتصال به سرور CoinEx: ' + (publicError instanceof Error ? publicError.message : 'خطای شبکه'));
        return false;
      }
      
      // Now test the authenticated connection
      const balance = await get().fetchBalance();
      if (balance >= 0) {
        set({ isConnected: true });
        get().addLog('✅ اتصال به API کوینکس برقرار شد');
        return true;
      }
      return false;
    } catch (error: any) {
      handleApiError(error, 'اتصال به API', get());
      return false;
    }
  },

  testConnection: async () => {
    const { config } = get();
    if (!config) {
      get().addLog('❌ تنظیمات API تنظیم نشده است');
      return false;
    }

    try {
      get().addLog('🔄 تست اتصال به API...');
      const axiosInstance = createAxiosInstance(config);
      
      // تست اولیه با یک درخواست عمومی بدون نیاز به احراز هویت
      try {
        const publicResponse = await axiosInstance.get(`${config.baseUrl}/v1/market/list`);
        if (publicResponse.data.code === 0) {
          get().addLog('✅ اتصال به سرور CoinEx برقرار است');
        }
      } catch (publicError) {
        get().addLog('⚠️ خطا در اتصال عمومی: ممکن است مشکل شبکه یا CORS وجود داشته باشد');
      }
      
      // تست درخواست احراز هویت شده
      const response = await apiRequest(config, 'GET', '/v2/assets/futures/balance', '', {});
      
      if (response.code === 0) {
        get().addLog('✅ تست اتصال موفق بود - احراز هویت صحیح است');
        return true;
      } else {
        throw new Error(response.message || 'API response error');
      }
    } catch (error: any) {
      handleApiError(error, 'تست اتصال', get());
      return false;
    }
  },

  disconnect: () => {
    set({ 
      isConnected: false, 
      balance: 0, 
      marketData: null,
      candles: []
    });
    get().addLog('✅ اتصال به API قطع شد');
  },

  fetchBalance: async () => {
    const { config } = get();
    if (!config) {
      throw new Error('API config not set');
    }

    try {
      const response = await apiRequest(config, 'GET', '/v2/assets/futures/balance', '', {});
      
      if (response.code === 0) {
        const usdtBalance = response.data.find((b: Balance) => b.ccy.toUpperCase() === 'USDT');
        const balance = usdtBalance ? parseFloat(usdtBalance.available) : 0;
        set({ balance });
        get().addLog(`✅ موجودی حساب: ${balance} USDT`);
        return balance;
      } else {
        throw new Error(response.message || `API Error: ${response.code}`);
      }
    } catch (error: any) {
      handleApiError(error, 'دریافت موجودی', get());
      throw error;
    }
  },

  fetchMarketData: async (symbol: string) => {
    const { config } = get();
    if (!config) {
      throw new Error('API config not set');
    }

    if (!symbol) {
      throw new Error('Symbol is required');
    }

    try {
      const axiosInstance = createAxiosInstance(config);
      // Use v2 API to get market data including quote currency info
      const response = await axiosInstance.get(`${config.futuresBaseUrl}/v2/futures/market`, {
        params: { market: symbol }
      });
      
      if (response.data.code === 0) {
        const data = response.data.data[0]; // v2 API returns array
        const marketData: MarketData = {
          symbol,
          price: parseFloat(data.last || data.price || 0),
          change24h: parseFloat(data.change || 0),
          volume24h: parseFloat(data.vol || data.volume || 0),
          high24h: parseFloat(data.high || 0),
          low24h: parseFloat(data.low || 0),
          quoteCcy: data.quote_ccy || 'USDT', // Add quote currency info
          baseCcy: data.base_ccy || symbol.replace('USDT', ''), // Add base currency info
          minAmount: parseFloat(data.min_amount || 0),
          precision: {
            base: data.base_ccy_precision || 4,
            quote: data.quote_ccy_precision || 2
          }
        };
        set({ marketData });
        get().addLog(`✅ داده‌های بازار دریافت شد: ${symbol} - قیمت: ${marketData.price} (${marketData.quoteCcy})`);
        return marketData;
      } else {
        throw new Error(response.data.message || `API Error: ${response.data.code}`);
      }
    } catch (error) {
      handleApiError(error, 'دریافت داده‌های بازار', get());
      throw error;
    }
  },

  

  

  fetchCandles: async (symbol: string, period: string, limit = 100) => {
    const { config } = get();
    if (!config) throw new Error('API config not set');

    try {
      const axiosInstance = createAxiosInstance(config);
      // تبدیل period به type بر اساس مستندات کوینکس
      const typeMap: Record<string, string> = {
        '1min': '1min',
        '3min': '3min',
        '5min': '5min',
        '15min': '15min',
        '30min': '30min',
        '1hour': '1hour',
        '2hour': '2hour',
        '4hour': '4hour',
        '6hour': '6hour',
        '12hour': '12hour',
        '1day': '1day',
        '3day': '3day',
        '1week': '1week'
      };
      
      const type = typeMap[period] || '1min';
      
      console.log(`🔍 Debug - Fetching candles for ${symbol} with period ${type} (limit: ${limit})`);
      
      const response = await axiosInstance.get(`${config.futuresBaseUrl}/v2/futures/kline`, {
        params: {
          market: symbol,
          period: type, // استفاده از period به جای type
          limit
        }
      });
      
      if (response.data.code === 0) {
        const candles: CandleData[] = response.data.data.map((c: any) => ({
          timestamp: c.created_at,
          open: parseFloat(c.open),
          high: parseFloat(c.high),
          low: parseFloat(c.low),
          close: parseFloat(c.close),
          volume: parseFloat(c.volume)
        }));
        set({ candles });
        get().addLog(`✅ کندل‌ها دریافت شد: ${candles.length} کندل برای ${symbol}`);
        return candles;
      } else {
        throw new Error(response.data.message);
      }
    } catch (error) {
      handleApiError(error, 'دریافت کندل‌ها', get());
      throw error;
    }
  },

  fetchHistoricalCandles: async (symbol: string, period: string, limit = 1000) => {
    const { config } = get();
    if (!config) throw new Error('API config not set');

    try {
      const axiosInstance = createAxiosInstance(config);
      // تبدیل period به type بر اساس مستندات کوینکس
      const typeMap: Record<string, string> = {
        '1min': '1min',
        '3min': '3min',
        '5min': '5min',
        '15min': '15min',
        '30min': '30min',
        '1hour': '1hour',
        '2hour': '2hour',
        '4hour': '4hour',
        '6hour': '6hour',
        '12hour': '12hour',
        '1day': '1day',
        '3day': '3day',
        '1week': '1week'
      };
      
      const type = typeMap[period] || '1min';
      
      console.log(`🔍 Debug - Fetching historical candles for ${symbol} with period ${type} (limit: ${limit})`);
      
      const response = await axiosInstance.get(`${config.futuresBaseUrl}/v2/futures/kline`, {
        params: {
          market: symbol,
          period: type,
          limit
        }
      });
      
      if (response.data.code === 0) {
        const candles: CandleData[] = response.data.data.map((c: any) => ({
          timestamp: c.created_at,
          open: parseFloat(c.open),
          high: parseFloat(c.high),
          low: parseFloat(c.low),
          close: parseFloat(c.close),
          volume: parseFloat(c.volume)
        }));
        
        // Sort by timestamp to ensure chronological order
        candles.sort((a, b) => a.timestamp - b.timestamp);
        
        console.log(`✅ Historical candles fetched: ${candles.length} candles for ${symbol}`);
        return candles;
      } else {
        throw new Error(response.data.message || `API Error: ${response.data.code}`);
      }
    } catch (error) {
      console.error('Error fetching historical candles:', error);
      throw error;
    }
  },

  placeOrder: async (params) => {
    const { config } = get();
    if (!config) throw new Error('API config not set');

    try {
      const path = '/v2/futures/order';
      const method = 'POST';
      
      // ایجاد client_id منحصر به فرد - دقیقاً مانند Python
      const clientId = `${params.side}_signal_${Date.now()}`;
      
      const body = {
        market: params.market,
        market_type: 'FUTURES',
        side: params.side,
        type: params.type,
        amount: params.amount.toString(),
        client_id: clientId, // افزودن client_id که در Python وجود دارد
        ...(params.price && { price: params.price.toString() }),
        // اطمینان از ارسال اهرم و مارجین مد حتی اگر مقدار پیش‌فرض دارن
        leverage: params.leverage || 1,
        margin_mode: params.margin_mode || 'cross',
        is_hide: false
      };
      
      const bodyStr = formatJsonLikePython(body); // فرمت کردن دقیقاً مانند Python
      
      // Debug: Show the formatted JSON for placeOrder
      console.log('🔍 Debug - Formatted Body (placeOrder):', bodyStr);
      console.log('🔍 Debug - Original JSON (placeOrder):', JSON.stringify(body));
      
      // استفاده از apiRequest برای حفظ یکپارچگی
      const response = await apiRequest(config, method, path, bodyStr, {});
      
      if (response.code === 0) {
        get().addLog(`✅ سفارش ${params.side} با موفقیت ثبت شد: ${JSON.stringify(response.data)}`);
        return response.data;
      } else {
        get().addLog(`❌ خطا در ثبت سفارش: ${response.message} (کد: ${response.code})`);
        throw new Error(response.message || `API Error: ${response.code}`);
      }
    } catch (error) {
      handleApiError(error, 'ثبت سفارش', get());
      throw error;
    }
  },

  setTakeProfit: async (market: string, price: number) => {
    const { config } = get();
    if (!config) throw new Error('API config not set');

    try {
      const path = '/v2/futures/set-position-take-profit';
      const method = 'POST';
      
      const body = {
        market,
        market_type: 'FUTURES',
        take_profit_type: 'latest_price',
        take_profit_price: price.toString()
      };
      
      const bodyStr = formatJsonLikePython(body); // فرمت کردن دقیقاً مانند Python
      
      // استفاده از apiRequest برای حفظ یکپارچگی
      const response = await apiRequest(config, method, path, bodyStr, {});
      
      if (response.code === 0) {
        get().addLog(`✅ حد سود تنظیم شد: ${price}`);
        return true;
      } else {
        get().addLog(`❌ خطا در تنظیم حد سود: ${response.message} (کد: ${response.code})`);
        throw new Error(response.message || `API Error: ${response.code}`);
      }
    } catch (error) {
      handleApiError(error, 'تنظیم حد سود', get());
      throw error;
    }
  },

  setStopLoss: async (market: string, price: number) => {
    const { config } = get();
    if (!config) throw new Error('API config not set');

    try {
      const path = '/v2/futures/set-position-stop-loss';
      const method = 'POST';
      
      const body = {
        market,
        market_type: 'FUTURES',
        stop_loss_type: 'latest_price',
        stop_loss_price: price.toString()
      };
      
      const bodyStr = formatJsonLikePython(body); // فرمت کردن دقیقاً مانند Python
      
      // استفاده از apiRequest برای حفظ یکپارچگی
      const response = await apiRequest(config, method, path, bodyStr, {});
      
      if (response.code === 0) {
        get().addLog(`✅ حد ضرر تنظیم شد: ${price}`);
        return true;
      } else {
        get().addLog(`❌ خطا در تنظیم حد ضرر: ${response.message} (کد: ${response.code})`);
        throw new Error(response.message || `API Error: ${response.code}`);
      }
    } catch (error) {
      handleApiError(error, 'تنظیم حد ضرر', get());
      throw error;
    }
  },

  adjustLeverage: async (symbol: string, leverage: number, margin_mode: string) => {
    const { config } = get();
    if (!config) throw new Error('API config not set');

    try {
      const path = '/v2/futures/adjust-position-leverage';
      const method = 'POST';
      
      const body = {
        market: symbol,
        market_type: 'FUTURES',
        margin_mode,
        leverage
      };
      
      const bodyStr = formatJsonLikePython(body); // فرمت کردن دقیقاً مانند Python
      
      // استفاده از apiRequest برای حفظ یکپارچگی
      const response = await apiRequest(config, method, path, bodyStr, {});
      
      if (response.code === 0) {
        get().addLog(`✅ اهرم تنظیم شد: ${leverage}x (${margin_mode})`);
        return true;
      } else {
        get().addLog(`❌ خطا در تنظیم اهرم: ${response.message} (کد: ${response.code})`);
        throw new Error(response.message || `API Error: ${response.code}`);
      }
    } catch (error) {
      handleApiError(error, 'تنظیم اهرم', get());
      throw error;
    }
  },

  addLog: (message) => {
    logger.info(message, 'CoinExAPI');
    set((state) => ({
      logs: [...state.logs, `${new Date().toLocaleTimeString()}: ${message}`]
    }));
  },

  testSignatureGeneration: async (params) => {
    const { config } = get();
    if (!config) throw new Error('API config not set');

    const timestamp = Date.now().toString();
    const { method, path, body, params: requestParams = {} } = params;
    
    // مرتب‌سازی و کدگذاری پارامترها - دقیقاً مانند Python
    const sortedParams = Object.entries(requestParams)
      .sort(([a], [b]) => a.localeCompare(b))
      .reduce((obj, [key, value]) => {
        obj[key] = value;
        return obj;
      }, {} as Record<string, any>);
    
    // استفاده از encodeURIComponent شبیه به urlencode در Python
    const sortedQuery = Object.entries(sortedParams)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');
    
    // ساخت رشته آماده برای امضا - دقیقاً مانند Python
    const preparedStr = sortedQuery 
      ? `${method}${path}?${sortedQuery}${body}${timestamp}`
      : `${method}${path}${body}${timestamp}`;
    
    // تولید امضا با HMAC-SHA256 - دقیقاً مانند Python
    const signature = await generateSignature(config.apiSecret, method, path, body, timestamp, sortedQuery);
    
    console.log('🔍 Signature Test Results:');
    console.log('Method:', method);
    console.log('Path:', path);
    console.log('Body:', body);
    console.log('Timestamp:', timestamp);
    console.log('Sorted Params:', JSON.stringify(sortedParams));
    console.log('Sorted Query:', sortedQuery);
    console.log('Prepared String:', preparedStr);
    console.log('Generated Signature:', signature);
    
    return {
      timestamp,
      sortedQuery,
      preparedString: preparedStr,
      signature
    };
  },

  clearLogs: () => {
    set({ logs: [] });
  },

  getPendingPositions: async (market?: string) => {
    const { config } = get();
    if (!config) throw new Error('API config not set');

    try {
      const params: any = {
        market_type: 'FUTURES',
        page: 1,
        limit: 100
      };
      
      if (market) {
        params.market = market;
      }

      console.log('🔍 Debug - Fetching pending positions with params:', params);
      
      // Try the main endpoint first
      let response = await apiRequest(config, 'GET', '/v2/futures/pending-position', '', params);
      console.log('🔍 Debug - Pending positions response from /v2/futures/pending-position:', response);
      
      // If the first endpoint fails or returns empty, try alternative endpoints
      if (response.code !== 0 || !response.data || response.data.length === 0) {
        console.log('🔍 Debug - Trying alternative endpoint for current positions...');
        
        // Try alternative endpoint
        try {
          const altResponse = await apiRequest(config, 'GET', '/v2/futures/current-position', '', params);
          console.log('🔍 Debug - Alternative endpoint response from /v2/futures/current-position:', altResponse);
          
          if (altResponse.code === 0 && altResponse.data && altResponse.data.length > 0) {
            response = altResponse;
          }
        } catch (altError) {
          console.log('🔍 Debug - Alternative endpoint failed:', altError);
        }
        
        // Try another alternative endpoint
        try {
          const altResponse2 = await apiRequest(config, 'GET', '/v2/futures/position', '', params);
          console.log('🔍 Debug - Alternative endpoint response from /v2/futures/position:', altResponse2);
          
          if (altResponse2.code === 0 && altResponse2.data && altResponse2.data.length > 0) {
            response = altResponse2;
          }
        } catch (altError2) {
          console.log('🔍 Debug - Second alternative endpoint failed:', altError2);
        }
      }
      
      if (response.code === 0) {
        const positions = response.data || [];
        console.log('🔍 Debug - Final extracted positions:', positions);
        get().addLog(`✅ دریافت ${positions.length} پوزیشن فعال`);
        return positions;
      } else {
        console.log('🔍 Debug - All API endpoints failed, last error response:', response);
        throw new Error(response.message || `API Error: ${response.code}`);
      }
    } catch (error: any) {
      console.log('🔍 Debug - Error in getPendingPositions:', error);
      handleApiError(error, 'دریافت پوزیشن‌های فعال', get());
      throw error;
    }
  },

  getFinishedPositions: async (market?: string, start_time?: number, end_time?: number) => {
    const { config } = get();
    if (!config) throw new Error('API config not set');

    try {
      const params: any = {
        market_type: 'FUTURES',
        page: 1,
        limit: 100
      };
      
      if (market) {
        params.market = market;
      }
      
      if (start_time) {
        params.start_time = start_time;
      }
      
      if (end_time) {
        params.end_time = end_time;
      }

      const response = await apiRequest(config, 'GET', '/v2/futures/finished-position', '', params);
      
      if (response.code === 0) {
        const positions = response.data || [];
        get().addLog(`✅ دریافت ${positions.length} پوزیشن بسته شده`);
        return positions;
      } else {
        throw new Error(response.message || `API Error: ${response.code}`);
      }
    } catch (error: any) {
      handleApiError(error, 'دریافت پوزیشن‌های بسته شده', get());
      throw error;
    }
  },

  getCurrentPositions: async (market?: string) => {
    // Alias for getPendingPositions for compatibility
    return get().getPendingPositions(market);
  }
}));
