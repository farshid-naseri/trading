import { strategyManager, StrategyManager } from './strategies/strategy-manager';
import { StrategySignal, CandleData } from './strategies/strategy';
import { TradingEngine } from './trading-engine';
import { EventEmitter } from 'events';

// 自动交易配置接口
export interface AutoTradeConfig {
  symbol: string;
  timeframe: string;
  amount: number;
  amountUnit: 'usdt' | 'coin'; // Add amount unit selection
  leverage: number;
  marginMode: 'cross' | 'isolated';
  takeProfitPercent: number;
  stopLossPercent: number;
  enableTakeProfit: boolean; // Enable take profit
  enableStopLoss: boolean; // Enable stop loss
  usePercentageForTP: boolean; // Use percentage for take profit
  usePercentageForSL: boolean; // Use percentage for stop loss
  enableTrailingTP: boolean; // Enable trailing take profit
  enableTrailingSL: boolean; // Enable trailing stop loss
  trailingDistance: number; // Trailing distance percentage
  strategy: string;
  strategyParams: Record<string, any>;
}

// 信号日志接口
export interface SignalLog {
  id: string;
  timestamp: number;
  strategy: string;
  signalType: 'buy' | 'sell';
  price: number;
  executed: boolean;
  orderId?: string;
  error?: string;
}

export class AutoTradeEngine extends EventEmitter {
  private tradingEngine: TradingEngine;
  private strategyManager: StrategyManager;
  private isActive: boolean = false;
  private config: AutoTradeConfig | null = null;
  private candleBuffer: CandleData[] = [];
  private maxBufferSize: number = 100;
  private signalLogs: SignalLog[] = [];
  private lastCandleTime: number = 0;
  private checkInterval: NodeJS.Timeout | null = null;
  private strategyStartTime: number = 0; // زمان شروع استراتژی برای فیلتر کردن سیگنال‌های قدیمی

  constructor(tradingEngine: TradingEngine) {
    super();
    this.tradingEngine = tradingEngine;
    this.strategyManager = strategyManager;
  }

  // 启动自动交易
  public start(config: AutoTradeConfig): boolean {
    if (this.isActive) {
      this.emit('error', new Error('Auto trade is already active'));
      return false;
    }

    try {
      console.log('🚀 Starting auto trade with config:', config);

      // 验证配置
      if (!this.validateConfig(config)) {
        this.emit('error', new Error('Invalid auto trade configuration'));
        return false;
      }

      // 激活策略
      console.log(`🎯 Activating strategy: ${config.strategy} with params:`, config.strategyParams);
      if (!this.strategyManager.activateStrategy(config.strategy, config.strategyParams)) {
        this.emit('error', new Error(`Failed to activate strategy: ${config.strategy}`));
        return false;
      }
      console.log('✅ Strategy activated successfully');

      this.config = config;
      this.isActive = true;
      this.candleBuffer = [];
      this.signalLogs = [];
      this.lastCandleTime = 0;
      this.strategyStartTime = Date.now(); // ثبت زمان شروع استراتژی

      console.log(`🚀 Auto trade started successfully at ${new Date(this.strategyStartTime).toISOString()}`);

      // 启动检查间隔
      this.startCheckInterval();

      this.emit('started', config);
      return true;
    } catch (error) {
      this.emit('error', error);
      return false;
    }
  }

  // 停止自动交易
  public stop(): void {
    if (!this.isActive) {
      return;
    }

    this.isActive = false;
    this.config = null;

    // 停止检查间隔
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    // 停用策略
    this.strategyManager.deactivateStrategy();

    this.emit('stopped');
  }

  // 更新K线数据
  public updateCandleData(candle: CandleData): void {
    if (!this.isActive || !this.config) {
      console.log(`🚫 Candle update skipped: isActive=${this.isActive}, hasConfig=${!!this.config}`);
      return;
    }

    console.log(`🕯️ Updating candle data: ${candle.timestamp} - Open: ${candle.open}, High: ${candle.high}, Low: ${candle.low}, Close: ${candle.close}`);

    // 添加到缓冲区
    this.candleBuffer.push(candle);

    // 保持缓冲区大小
    if (this.candleBuffer.length > this.maxBufferSize) {
      this.candleBuffer.shift();
    }

    // 检查是否需要执行策略（在新K线开始时）
    const candleTime = Math.floor(candle.timestamp / (this.getTimeframeSeconds() * 1000)) * (this.getTimeframeSeconds() * 1000);
    
    console.log(`🕯️ Candle time check: current=${candleTime}, last=${this.lastCandleTime}, timeframe=${this.getTimeframeSeconds()}s`);
    
    if (candleTime !== this.lastCandleTime && this.candleBuffer.length >= 2) {
      console.log(`🎯 New candle detected, executing strategy...`);
      this.lastCandleTime = candleTime;
      
      // 延迟执行，确保K线完全关闭
      setTimeout(() => {
        this.executeStrategy();
      }, 100);
    }
  }

  // 批量更新K线数据（用于初始化）
  public updateCandleBatch(candles: CandleData[]): void {
    if (!this.isActive || !this.config) {
      console.log(`🚫 Batch candle update skipped: isActive=${this.isActive}, hasConfig=${!!this.config}`);
      return;
    }

    console.log(`📦 Batch updating ${candles.length} candles`);

    // 添加到缓冲区
    this.candleBuffer.push(...candles);

    // 保持缓冲区大小，只保留最新的100根K线
    if (this.candleBuffer.length > this.maxBufferSize) {
      this.candleBuffer = this.candleBuffer.slice(-this.maxBufferSize);
    }

    console.log(`📦 Candle buffer size after batch update: ${this.candleBuffer.length}`);

    // 更新最后K线时间
    if (this.candleBuffer.length > 0) {
      const lastCandle = this.candleBuffer[this.candleBuffer.length - 1];
      this.lastCandleTime = Math.floor(lastCandle.timestamp / (this.getTimeframeSeconds() * 1000)) * (this.getTimeframeSeconds() * 1000);
      console.log(`📦 Last candle time set to: ${this.lastCandleTime}`);
    }
  }

  // 获取信号日志
  public getSignalLogs(): SignalLog[] {
    return [...this.signalLogs];
  }

  // 清除信号日志
  public clearSignalLogs(): void {
    this.signalLogs = [];
  }

  // 获取当前状态
  public getStatus(): {
    isActive: boolean;
    config: AutoTradeConfig | null;
    bufferSize: number;
    lastSignalTime: number | null;
  } {
    const lastSignal = this.signalLogs[this.signalLogs.length - 1];
    return {
      isActive: this.isActive,
      config: this.config,
      bufferSize: this.candleBuffer.length,
      lastSignalTime: lastSignal ? lastSignal.timestamp : null
    };
  }

  // 验证配置
  private validateConfig(config: AutoTradeConfig): boolean {
    return !!(
      config.symbol &&
      config.timeframe &&
      config.amount > 0 &&
      config.leverage > 0 &&
      config.marginMode &&
      config.takeProfitPercent >= 0 &&
      config.stopLossPercent >= 0 &&
      config.strategy &&
      this.strategyManager.getStrategy(config.strategy)
    );
  }

  // 获取时间框架秒数
  private getTimeframeSeconds(): number {
    if (!this.config) return 60;

    const timeframeMap: Record<string, number> = {
      '1m': 60,
      '3m': 180,
      '5m': 300,
      '15m': 900,
      '30m': 1800,
      '1h': 3600,
      '2h': 7200,
      '4h': 14400,
      '6h': 21600,
      '12h': 43200,
      '1d': 86400,
      '3d': 259200,
      '1w': 604800
    };

    return timeframeMap[this.config.timeframe] || 60;
  }

  // 启动检查间隔
  private startCheckInterval(): void {
    // 每5秒检查一次状态
    this.checkInterval = setInterval(() => {
      if (this.isActive) {
        this.emit('statusUpdate', this.getStatus());
      }
    }, 5000);
  }

  // 执行策略
  private async executeStrategy(): Promise<void> {
    if (!this.isActive || !this.config || this.candleBuffer.length < 2) {
      console.log(`🚫 Strategy execution skipped: isActive=${this.isActive}, hasConfig=${!!this.config}, bufferSize=${this.candleBuffer.length}`);
      return;
    }

    try {
      console.log(`🎯 Executing strategy for ${this.config.symbol} (${this.config.timeframe}) with ${this.candleBuffer.length} candles`);
      
      // 计算策略信号
      const result = this.strategyManager.calculateSignals(this.candleBuffer);
      
      if (!result || !result.signals || result.signals.length === 0) {
        console.log(`📭 No signals generated by strategy`);
        return;
      }

      console.log(`📡 Strategy generated ${result.signals.length} signals`);
      
      // 获取最新的信号
      const latestSignal = result.signals[result.signals.length - 1];
      console.log(`🎯 Latest signal: ${latestSignal.type} at ${latestSignal.price} (timestamp: ${latestSignal.timestamp})`);
      
      // 检查是否已经处理过这个信号
      const signalId = `${latestSignal.timestamp}_${latestSignal.type}`;
      const existingSignal = this.signalLogs.find(log => log.id === signalId);
      
      if (existingSignal) {
        console.log(`🔄 Signal ${signalId} already processed, skipping`);
        return;
      }

      // فیلتر کردن سیگنال‌های قدیمی: فقط سیگنال‌هایی که بعد از زمان شروع استراتژی هستند را اجرا کن
      // اما به استثنای سیگنال‌های بسیار نزدیک به زمان شروع (برای جلوگیری از丢弃 سیگنال‌های معتبر)
      const timeDiff = latestSignal.timestamp - this.strategyStartTime;
      if (timeDiff < -5000) { // فقط سیگنال‌های قدیمی‌تر از 5 ثانیه را فیلتر کن
        console.log(`🚫 Filtered out old signal: ${timeDiff}ms before start time`);
        return;
      }
      if (timeDiff < 0) {
        console.log(`⚠️ Signal slightly before start time: ${timeDiff}ms, but executing anyway`);
      }

      console.log(`✅ Signal accepted for execution: ${latestSignal.type} at ${latestSignal.price}`);

      // 记录信号
      const signalLog: SignalLog = {
        id: signalId,
        timestamp: latestSignal.timestamp,
        strategy: this.config.strategy,
        signalType: latestSignal.type,
        price: latestSignal.price,
        executed: false
      };

      this.signalLogs.push(signalLog);
      this.emit('signal', signalLog);

      // 执行交易
      console.log(`🎯 Executing trade for signal: ${latestSignal.type} ${this.config.symbol} at ${latestSignal.price}`);
      await this.executeTrade(signalLog);

    } catch (error) {
      this.emit('error', error);
    }
  }

  // 执行交易
  private async executeTrade(signalLog: SignalLog): Promise<void> {
    if (!this.config) {
      return;
    }

    try {
      // 准备交易参数
      const tradeParams = {
        symbol: this.config.symbol,
        side: signalLog.signalType,
        type: 'market' as const,
        amount: this.config.amount,
        amountUnit: this.config.amountUnit,
        leverage: this.config.leverage,
        marginMode: this.config.marginMode,
        enableTakeProfit: this.config.enableTakeProfit,
        enableStopLoss: this.config.enableStopLoss,
        usePercentageForTP: this.config.usePercentageForTP,
        usePercentageForSL: this.config.usePercentageForSL,
        enableTrailingTP: this.config.enableTrailingTP,
        enableTrailingSL: this.config.enableTrailingSL,
        trailingDistance: this.config.trailingDistance,
        takeProfitPercent: this.config.enableTakeProfit && this.config.usePercentageForTP ? this.config.takeProfitPercent : undefined,
        stopLossPercent: this.config.enableStopLoss && this.config.usePercentageForSL ? this.config.stopLossPercent : undefined,
      };

      // 执行交易
      const result = await this.tradingEngine.executeManualTrade(tradeParams);

      if (result.success) {
        signalLog.executed = true;
        signalLog.orderId = result.orderId;
        this.emit('tradeExecuted', { signalLog, result });
      } else {
        signalLog.error = result.error;
        this.emit('tradeError', { signalLog, error: result.error });
      }

    } catch (error) {
      signalLog.error = error instanceof Error ? error.message : 'Unknown error';
      this.emit('tradeError', { signalLog, error });
    }
  }
}