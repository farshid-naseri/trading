import { 
  IDataProvider, 
  SymbolInfo, 
  CoinExApiConfig, 
  MockDataProviderConfig, 
  DataResult,
  CandleData
} from '@/types/data-provider';
import { Logger } from '@/lib/logging';

/**
 * پیاده‌سازی CoinEx Data Provider
 */
export class CoinExDataProvider implements IDataProvider {
  private config: CoinExApiConfig;
  private logger: Logger;

  constructor(config: CoinExApiConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  async getCandles(
    symbol: string,
    timeframe: string,
    limit: number,
    startDate?: Date,
    endDate?: Date
  ): Promise<CandleData[]> {
    try {
      this.logger.info(`📊 دریافت کندل‌های ${symbol} از CoinEx...`);
      
      // تبدیل تایم‌فریم به فرمت CoinEx
      const coinexTimeframe = this.convertTimeframe(timeframe);
      
      // استفاده از proxy برای جلوگیری از مشکل CORS
      const url = '/api/coinex-proxy';
      const params = {
        url: `${this.config.baseUrl}/v2/futures/kline`,
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        params: {
          market: symbol,
          period: coinexTimeframe,
          limit: limit.toString(),
          ...(startDate && { start_time: Math.floor(startDate.getTime() / 1000).toString() }),
          ...(endDate && { end_time: Math.floor(endDate.getTime() / 1000).toString() }),
        }
      };

      console.log(`🔍 Debug - CoinExDataProvider request:`, params);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      // اگر پاسخ از proxy خطا باشد، آن را به عنوان خطای CoinEx در نظر بگیر
      if (data.error) {
        throw new Error(`Proxy Error: ${data.message}`);
      }
      
      if (data.code !== 0 && data.code !== 200) {
        throw new Error(`CoinEx API Error: ${data.message}`);
      }

      // تبدیل داده‌ها به فرمت استاندارد
      const candles: CandleData[] = data.data.map((item: any) => ({
        timestamp: item.created_at * 1000, // تبدیل به میلی‌ثانیه
        open: parseFloat(item.open),
        high: parseFloat(item.high),
        low: parseFloat(item.low),
        close: parseFloat(item.close),
        volume: parseFloat(item.volume),
      }));

      this.logger.info(`✅ ${candles.length} کندل دریافت شد از CoinEx`);
      return candles;
    } catch (error) {
      this.logger.error(`❌ خطا در دریافت کندل‌ها از CoinEx: ${error}`);
      throw error;
    }
  }

  async getSymbolInfo(symbol: string): Promise<SymbolInfo> {
    try {
      this.logger.info(`📊 دریافت اطلاعات نماد ${symbol} از CoinEx...`);
      
      // استفاده از proxy برای جلوگیری از مشکل CORS
      const url = '/api/coinex-proxy';
      const params = {
        url: `${this.config.baseUrl}/v2/futures/market`,
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        params: {
          market: symbol,
        }
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      // اگر پاسخ از proxy خطا باشد، آن را به عنوان خطای CoinEx در نظر بگیر
      if (data.error) {
        throw new Error(`Proxy Error: ${data.message}`);
      }
      
      if (data.code !== 0 && data.code !== 200) {
        throw new Error(`CoinEx API Error: ${data.message}`);
      }

      const marketData = data.data[0] || data.data; // v2 API ممکن است آرایه برگرداند
      
      const symbolInfo: SymbolInfo = {
        symbol: marketData.market || symbol,
        name: marketData.name || symbol,
        baseAsset: marketData.base_ccy || symbol.replace('USDT', ''),
        quoteAsset: marketData.quote_ccy || 'USDT',
        minPrice: parseFloat(marketData.min_price || '0'),
        maxPrice: parseFloat(marketData.max_price || '999999'),
        pricePrecision: parseInt(marketData.price_precision || '8'),
        minQty: parseFloat(marketData.min_amount || '0'),
        maxQty: parseFloat(marketData.max_amount || '999999'),
        qtyPrecision: parseInt(marketData.amount_precision || '8'),
        status: marketData.status === '1' ? 'trading' : 'suspended',
      };

      this.logger.info(`✅ اطلاعات نماد ${symbol} دریافت شد`);
      return symbolInfo;
    } catch (error) {
      this.logger.error(`❌ خطا در دریافت اطلاعات نماد ${symbol}: ${error}`);
      throw error;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      this.logger.info('🔌 تست اتصال به CoinEx...');
      
      // استفاده از proxy برای جلوگیری از مشکل CORS
      const url = '/api/coinex-proxy';
      const params = {
        url: `${this.config.baseUrl}/v2/futures/markets`,
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        return false;
      }

      const data = await response.json();
      
      // اگر پاسخ از proxy خطا باشد، اتصال برقرار نیست
      if (data.error) {
        return false;
      }
      
      if (data.code !== 0 && data.code !== 200) {
        return false;
      }

      this.logger.info('✅ اتصال به CoinEx با موفقیت انجام شد');
      return true;
    } catch (error) {
      this.logger.error(`❌ خطا در تست اتصال به CoinEx: ${error}`);
      return false;
    }
  }

  /**
   * تبدیل تایم‌فریم به فرمت CoinEx
   */
  private convertTimeframe(timeframe: string): string {
    const mapping: { [key: string]: string } = {
      '1m': '1min',
      '3m': '3min',
      '5m': '5min',
      '15m': '15min',
      '30m': '30min',
      '1h': '1hour',
      '2h': '2hour',
      '4h': '4hour',
      '6h': '6hour',
      '12h': '12hour',
      '1d': '1day',
      '3d': '3day',
      '1w': '1week',
    };

    return mapping[timeframe] || '1min';
  }
}

/**
 * پیاده‌سازی Mock Data Provider
 */
export class MockDataProvider implements IDataProvider {
  private config: MockDataProviderConfig;
  private logger: Logger;

  constructor(config: MockDataProviderConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  async getCandles(
    symbol: string,
    timeframe: string,
    limit: number,
    startDate?: Date,
    endDate?: Date
  ): Promise<CandleData[]> {
    try {
      this.logger.info(`📊 تولید ${limit} کندل mock برای ${symbol}...`);
      
      // محاسبه زمان شروع و پایان
      const start = startDate || this.config.startDate;
      const end = endDate || this.config.endDate;
      
      // محاسبه فاصله زمانی بین کندل‌ها
      const timeframeMs = this.getTimeframeInMs(timeframe);
      const totalDuration = end.getTime() - start.getTime();
      const candleCount = Math.min(limit, Math.floor(totalDuration / timeframeMs));
      
      const candles: CandleData[] = [];
      let currentPrice = 100; // قیمت اولیه
      
      for (let i = 0; i < candleCount; i++) {
        const timestamp = start.getTime() + (i * timeframeMs);
        
        // تولید قیمت‌های تصادفی با روند و نوسان‌پذیری مشخص
        const trendComponent = this.config.trend * (timeframeMs / (1000 * 60 * 60 * 24)); // روند روزانه
        const randomComponent = (Math.random() - 0.5) * this.config.volatility;
        const priceChange = trendComponent + randomComponent;
        
        currentPrice *= (1 + priceChange);
        
        // تولید OHLC
        const volatility = currentPrice * this.config.volatility * 0.1;
        const high = currentPrice + Math.random() * volatility;
        const low = currentPrice - Math.random() * volatility;
        const open = i === 0 ? currentPrice : candles[i - 1].close;
        const close = currentPrice;
        
        // اطمینان از صحت OHLC
        const finalHigh = Math.max(open, high, close);
        const finalLow = Math.min(open, low, close);
        
        candles.push({
          timestamp,
          open,
          high: finalHigh,
          low: finalLow,
          close,
          volume: Math.random() * 10000, // حجم تصادفی
        });
      }

      this.logger.info(`✅ ${candles.length} کندل mock تولید شد`);
      return candles;
    } catch (error) {
      this.logger.error(`❌ خطا در تولید کندل‌های mock: ${error}`);
      throw error;
    }
  }

  async getSymbolInfo(symbol: string): Promise<SymbolInfo> {
    this.logger.info(`📊 تولید اطلاعات mock برای نماد ${symbol}...`);
    
    return {
      symbol,
      name: symbol,
      baseAsset: symbol.replace('USDT', ''),
      quoteAsset: 'USDT',
      minPrice: 0.00000001,
      maxPrice: 999999,
      pricePrecision: 8,
      minQty: 0.00000001,
      maxQty: 999999,
      qtyPrecision: 8,
      status: 'trading',
    };
  }

  async testConnection(): Promise<boolean> {
    this.logger.info('🔌 تست اتصال به Mock Data Provider...');
    // Mock data provider همیشه در دسترس است
    this.logger.info('✅ اتصال به Mock Data Provider با موفقیت انجام شد');
    return true;
  }

  /**
   * تبدیل تایم‌فریم به میلی‌ثانیه
   */
  private getTimeframeInMs(timeframe: string): number {
    const mapping: { [key: string]: number } = {
      '1m': 60 * 1000,
      '3m': 3 * 60 * 1000,
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      '30m': 30 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '2h': 2 * 60 * 60 * 1000,
      '4h': 4 * 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '12h': 12 * 60 * 60 * 1000,
      '1d': 24 * 60 * 60 * 1000,
      '3d': 3 * 24 * 60 * 60 * 1000,
      '1w': 7 * 24 * 60 * 60 * 1000,
    };

    return mapping[timeframe] || 60 * 1000;
  }
}

/**
 * فکتوری برای ایجاد Data Provider
 */
export class DataProviderFactory {
  static createCoinExProvider(config: CoinExApiConfig, logger: Logger): IDataProvider {
    return new CoinExDataProvider(config, logger);
  }

  static createMockProvider(config: MockDataProviderConfig, logger: Logger): IDataProvider {
    return new MockDataProvider(config, logger);
  }
}