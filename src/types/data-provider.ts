/**
 * داده‌های کندل
 */
export interface CandleData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * اینترفیس برای تأمین‌کننده داده‌های تاریخی
 */
export interface IDataProvider {
  /**
   * دریافت داده‌های کندل تاریخی
   * @param symbol نماد معاملاتی
   * @param timeframe تایم‌فریم
   * @param limit تعداد کندل‌ها
   * @param startDate تاریخ شروع (اختیاری)
   * @param endDate تاریخ پایان (اختیاری)
   * @returns Promise که آرایه‌ای از داده‌های کندل را برمی‌گرداند
   */
  getCandles(
    symbol: string,
    timeframe: string,
    limit: number,
    startDate?: Date,
    endDate?: Date
  ): Promise<CandleData[]>;
  
  /**
   * دریافت اطلاعات نماد
   * @param symbol نماد معاملاتی
   * @returns Promise که اطلاعات نماد را برمی‌گرداند
   */
  getSymbolInfo(symbol: string): Promise<SymbolInfo>;
  
  /**
   * تست اتصال بهdataProvider
   * @returns Promise که وضعیت اتصال را برمی‌گرداند
   */
  testConnection(): Promise<boolean>;
}

/**
 * اطلاعات نماد معاملاتی
 */
export interface SymbolInfo {
  symbol: string;
  name: string;
  baseAsset: string;
  quoteAsset: string;
  minPrice: number;
  maxPrice: number;
  pricePrecision: number;
  minQty: number;
  maxQty: number;
  qtyPrecision: number;
  status: 'trading' | 'suspended' | 'delisted';
}

/**
 * تنظیمات CoinEx API
 */
export interface CoinExApiConfig {
  apiKey: string;
  apiSecret: string;
  baseUrl: string;
  timeout: number;
}

/**
 * تنظیمات Mock Data Provider
 */
export interface MockDataProviderConfig {
  symbol: string;
  timeframe: string;
  startDate: Date;
  endDate: Date;
  volatility: number; // نوسان‌پذیری (0.01 = 1%)
  trend: number; // روند (0 = بدون روند، مثبت = صعودی، منفی = نزولی)
}

/**
 * نتیجه دریافت داده‌ها
 */
export interface DataResult {
  candles: CandleData[];
  symbolInfo: SymbolInfo;
  isRealData: boolean;
  dataSource: string;
  totalCandles: number;
  dateRange: {
    start: Date;
    end: Date;
  };
}