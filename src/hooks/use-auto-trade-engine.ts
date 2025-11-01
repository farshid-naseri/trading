'use client';

import { useEffect, useCallback, useState } from 'react';
import { useTradingEngine } from './use-trading-engine';
import { AutoTradeEngine, AutoTradeConfig, CandleData } from '@/lib/auto-trade-engine';

export function useAutoTradeEngine() {
  const { tradingEngine, isConnected, candles, config, isInitialized, initialize, start } = useTradingEngine();
  const [autoTradeEngine, setAutoTradeEngine] = useState<AutoTradeEngine | null>(null);
  const [autoTradeError, setAutoTradeError] = useState<string | null>(null);

  // Debug log to track trading engine state
  useEffect(() => {
    console.log('🤖 AutoTradeEngine Hook Debug:', {
      tradingEngine: !!tradingEngine,
      isInitialized,
      isConnected,
      hasConfig: !!config,
      config: config ? { ...config, apiSecret: '***' } : null,
      candlesCount: candles?.length || 0
    });
  }, [tradingEngine, isInitialized, isConnected, config, candles]);

  // Try to initialize and start trading engine if it's not initialized but we have config
  useEffect(() => {
    if (!isInitialized && config && tradingEngine && isValidConfig(config)) {
      console.log('🔧 Attempting to initialize trading engine from AutoTradeEngine hook...');
      
      // Build a complete TradingConfig object with all required fields
      const completeConfig: any = {
        apiKey: config.apiKey,
        apiSecret: config.apiSecret,
        symbol: config.symbol || 'XRPUSDT',
        timeframe: config.timeframe || '5m',
        atrPeriod: 10, // Default value
        multiplier: 3, // Default value
        profitPercent: 1, // Default value
        lossPercent: 1, // Default value
        trailPercent: 0.5, // Default value
        amountUsdt: 20, // Default value
        leverage: 5, // Default value
        marginMode: 'cross', // Default value
        useAI: false, // Default value
        autoTrade: true // We're in auto trade mode
      };
      
      console.log('🔧 Complete config for initialization:', {
        ...completeConfig,
        apiSecret: `${completeConfig.apiSecret.substring(0, 4)}...`
      });
      
      initialize(completeConfig).then(success => {
        if (success) {
          console.log('✅ Trading engine initialized successfully from AutoTradeEngine hook');
          // Try to start the trading engine as well
          console.log('🚀 Attempting to start trading engine...');
          tradingEngine.start().then(startSuccess => {
            if (startSuccess) {
              console.log('✅ Trading engine started successfully');
            } else {
              console.error('❌ Failed to start trading engine');
            }
          }).catch(startError => {
            console.error('❌ Error starting trading engine:', startError);
          });
        } else {
          console.error('❌ Failed to initialize trading engine from AutoTradeEngine hook');
        }
      }).catch(error => {
        console.error('❌ Error initializing trading engine from AutoTradeEngine hook:', error);
      });
    }
  }, [isInitialized, config, tradingEngine, initialize, start]);

  // Helper function to validate config
  const isValidConfig = useCallback((config: any) => {
    if (!config) return false;
    
    // Check if we have the basic required fields
    const hasApiKey = config.apiKey && config.apiKey !== '';
    const hasApiSecret = config.apiSecret && config.apiSecret !== '';
    
    // More lenient validation - accept temporary configs for initialization
    const isValidSecret = config.apiSecret && 
                         config.apiSecret !== 'your-api-secret-here' && 
                         config.apiSecret.length > 3; // Basic length check
    
    console.log('🔍 Config validation:', {
      hasConfig: !!config,
      hasApiKey,
      hasApiSecret,
      isValidSecret,
      apiKey: config.apiKey ? `${config.apiKey.substring(0, 8)}...` : 'missing',
      apiSecret: config.apiSecret ? `${config.apiSecret.substring(0, 4)}...` : 'missing'
    });
    
    return hasApiKey && hasApiSecret && isValidSecret;
  }, []);

  // Initialize auto-trade engine when trading engine is ready
  useEffect(() => {
    console.log('🤖 Auto-trade engine initialization check:', {
      tradingEngine: !!tradingEngine,
      isInitialized,
      isConnected,
      config: !!config,
      isValidConfig: config ? isValidConfig(config) : false
    });

    // More lenient initialization - don't require all conditions to be perfect
    const canInitialize = tradingEngine && config && isValidConfig(config);
    
    // Log detailed initialization status
    console.log('🤖 Can initialize auto trade engine:', {
      canInitialize,
      hasTradingEngine: !!tradingEngine,
      isInitialized,
      isConnected,
      hasConfig: !!config,
      hasApiKey: config?.apiKey,
      hasApiSecret: config?.apiSecret,
      isValidSecret: config?.apiSecret && config.apiSecret !== 'your-api-secret-here' && config.apiSecret.length > 3
    });

    if (canInitialize) {
      try {
        console.log('🚀 Initializing auto trade engine...', { 
          hasTradingEngine: !!tradingEngine, 
          isInitialized, 
          hasConfig: !!config,
          isConnected,
          hasApiKey: !!config.apiKey,
          hasApiSecret: !!config.apiSecret,
          config: config ? 'Valid' : 'Null'
        });
        const engine = new AutoTradeEngine(tradingEngine);
        setAutoTradeEngine(engine);
        setAutoTradeError(null);

        // Set up event listeners for logging
        engine.on('started', (config) => {
          console.log('🚀 Auto trade engine started:', config);
        });

        engine.on('stopped', () => {
          console.log('🛑 Auto trade engine stopped');
        });

        engine.on('error', (error) => {
          console.error('❌ Auto trade engine error:', error);
          setAutoTradeError(error instanceof Error ? error.message : 'Unknown error');
        });

        engine.on('signal', (signalLog) => {
          console.log('📡 Trading signal received:', signalLog);
        });

        engine.on('tradeExecuted', (data) => {
          console.log('✅ Trade executed:', data);
        });

        engine.on('tradeError', (data) => {
          console.error('❌ Trade execution error:', data);
        });

        console.log('✅ Auto trade engine initialized successfully');
        return () => {
          console.log('🧹 Cleaning up auto trade engine...');
          engine.stop();
          engine.removeAllListeners();
        };
      } catch (error) {
        console.error('❌ Failed to initialize auto trade engine:', error);
        setAutoTradeError(error instanceof Error ? error.message : 'Unknown error');
      }
    } else {
      // Clear auto trade engine if trading engine is not available
      setAutoTradeEngine(null);
      if (!tradingEngine) {
        const errorMessage = 'Trading engine not available';
        console.log('❌', errorMessage);
        setAutoTradeError(errorMessage);
      } else if (!config) {
        const errorMessage = 'Trading configuration not available';
        console.log('⚠️', errorMessage);
        setAutoTradeError(errorMessage);
      } else if (!isValidConfig(config)) {
        const errorMessage = 'Invalid API credentials. Please check your API Key and API Secret.';
        console.log('⚠️', errorMessage);
        setAutoTradeError(errorMessage);
      } else {
        // If we have trading engine and config but not initialized/connected, 
        // still try to initialize with a warning
        console.log('⚠️ Trading engine not fully initialized, but attempting auto-trade engine initialization anyway');
        try {
          const engine = new AutoTradeEngine(tradingEngine);
          setAutoTradeEngine(engine);
          setAutoTradeError('Trading engine not fully initialized, but auto-trade engine is ready');
        } catch (error) {
          console.error('❌ Failed to initialize auto trade engine in degraded mode:', error);
          setAutoTradeError(error instanceof Error ? error.message : 'Unknown error');
        }
      }
    }
  }, [tradingEngine, config, isValidConfig]); // Removed isInitialized and isConnected from dependencies to allow partial initialization

  // 处理K线数据更新
  useEffect(() => {
    if (!autoTradeEngine || !candles || candles.length === 0) {
      console.log('🚫 No candle data to update:', { 
        hasEngine: !!autoTradeEngine, 
        hasCandles: !!candles, 
        candleCount: candles?.length || 0 
      });
      return;
    }

    // 获取最新的K线数据
    const latestCandle = candles[candles.length - 1];
    
    console.log('🕯️ Updating candle data:', {
      symbol: latestCandle.symbol || 'unknown',
      timestamp: latestCandle.timestamp,
      close: latestCandle.close,
      volume: latestCandle.volume,
      totalCandles: candles.length
    });
    
    // 转换为CandleData格式
    const candleData: CandleData = {
      timestamp: latestCandle.timestamp,
      open: latestCandle.open,
      high: latestCandle.high,
      low: latestCandle.low,
      close: latestCandle.close,
      volume: latestCandle.volume
    };

    // 更新自动交易引擎的K线数据
    autoTradeEngine.updateCandleData(candleData);
  }, [candles, autoTradeEngine]);

  // 批量更新K线数据（初始化时）
  useEffect(() => {
    if (!autoTradeEngine || !candles || candles.length === 0) {
      console.log('🚫 No candle data for batch update:', { 
        hasEngine: !!autoTradeEngine, 
        hasCandles: !!candles, 
        candleCount: candles?.length || 0 
      });
      return;
    }

    console.log('📦 Batch updating candle data:', {
      candleCount: candles.length,
      firstCandle: candles[0] ? { timestamp: candles[0].timestamp, close: candles[0].close } : null,
      lastCandle: candles[candles.length - 1] ? { timestamp: candles[candles.length - 1].timestamp, close: candles[candles.length - 1].close } : null
    });

    // 转换所有K线数据
    const candleDataList: CandleData[] = candles.map(candle => ({
      timestamp: candle.timestamp,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume
    }));

    // 批量更新自动交易引擎的K线数据
    autoTradeEngine.updateCandleBatch(candleDataList);
  }, [autoTradeEngine]);

  // 启动自动交易
  const startAutoTrade = useCallback((strategyConfig: AutoTradeConfig) => {
    if (!autoTradeEngine) {
      const errorMessage = 'Auto trade engine not initialized';
      console.error(errorMessage);
      setAutoTradeError(errorMessage);
      throw new Error(errorMessage);
    }

    console.log('🚀 Starting auto trade with config:', strategyConfig);
    
    try {
      const result = autoTradeEngine.start(strategyConfig);
      if (result) {
        console.log('✅ Auto trade started successfully');
        setAutoTradeError(null);
      } else {
        const errorMessage = 'Failed to start auto trade';
        console.error(errorMessage);
        setAutoTradeError(errorMessage);
      }
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error starting auto trade';
      console.error(errorMessage, error);
      setAutoTradeError(errorMessage);
      throw error;
    }
  }, [autoTradeEngine]); // Removed isInitialized and isConnected from dependencies

  // 停止自动交易
  const stopAutoTrade = useCallback(() => {
    if (!autoTradeEngine) {
      return;
    }

    autoTradeEngine.stop();
  }, [autoTradeEngine]);

  // 获取信号日志
  const getSignalLogs = useCallback(() => {
    if (!autoTradeEngine) {
      return [];
    }

    return autoTradeEngine.getSignalLogs();
  }, [autoTradeEngine]);

  // 清除信号日志
  const clearSignalLogs = useCallback(() => {
    if (!autoTradeEngine) {
      return;
    }

    autoTradeEngine.clearSignalLogs();
  }, [autoTradeEngine]);

  // 获取状态
  const getStatus = useCallback(() => {
    if (!autoTradeEngine) {
      return null;
    }

    return autoTradeEngine.getStatus();
  }, [autoTradeEngine]);

  return {
    autoTradeEngine,
    isConnected,
    isInitialized,
    autoTradeError,
    startAutoTrade,
    stopAutoTrade,
    getSignalLogs,
    clearSignalLogs,
    getStatus,
    config
  };
}