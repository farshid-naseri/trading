'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAutoTradeEngine } from '@/hooks/use-auto-trade-engine';
import { useCoinExApiConfig } from '@/hooks/use-api-credentials';
import { strategyManager } from '@/lib/strategies/strategy-manager';
import { AutoTradeEngine, AutoTradeConfig, SignalLog } from '@/lib/auto-trade-engine';
import { CandleData } from '@/lib/strategies/strategy';
import { Play, Square, RotateCcw, Settings, Activity, AlertTriangle, WifiOff, AlertCircle, Brain } from 'lucide-react';
import { ApiConfigForm } from '@/components/api-config-form';

interface StrategyParam {
  name: string;
  label: string;
  type: 'number' | 'boolean' | 'select';
  min?: number;
  max?: number;
  step?: number;
  default: any;
  options?: Array<{ value: any; label: string }>;
}

interface AutoTradeTabProps {
  isConnected: boolean;
  isInitialized: boolean;
  onExecuteTrade?: (params: {
    symbol: string;
    amount: number;
    side: 'buy' | 'sell';
    leverage: number;
    marginMode: 'cross' | 'isolated';
    takeProfitPercent?: number;
    stopLossPercent?: number;
    enableTakeProfit?: boolean;
    enableStopLoss?: boolean;
  }) => Promise<{ success: boolean; message?: string }>;
  // تنظیمات کارت ترید دستی برای همگام‌سازی
  manualTradingConfig?: {
    symbol: string;
    timeframe: string;
    amount: number;
    amountUnit: 'usdt' | 'coin';
    leverage: number;
    marginMode: 'cross' | 'isolated';
    takeProfitPercent: number;
    stopLossPercent: number;
    enableTakeProfit: boolean;
    enableStopLoss: boolean;
    enableTrailingTP: boolean;
    enableTrailingSL: boolean;
    trailingDistance: number;
  };
  // callback برای همگام‌سازی تغییرات از auto-trade به manual trading
  onAutoTradeConfigChange?: (config: {
    symbol: string;
    timeframe: string;
    amount: number;
    amountUnit: 'usdt' | 'coin';
    leverage: number;
    marginMode: 'cross' | 'isolated';
    takeProfitPercent: number;
    stopLossPercent: number;
    enableTakeProfit: boolean;
    enableStopLoss: boolean;
    enableTrailingTP: boolean;
    enableTrailingSL: boolean;
    trailingDistance: number;
  }) => void;
}

export function AutoTradeTab({ isConnected: propIsConnected, isInitialized: propIsInitialized, onExecuteTrade, manualTradingConfig, onAutoTradeConfigChange }: AutoTradeTabProps) {
  const {
    autoTradeEngine,
    isConnected: hookIsConnected,
    isInitialized: hookIsInitialized,
    autoTradeError,
    startAutoTrade,
    stopAutoTrade,
    getSignalLogs,
    clearSignalLogs,
    getStatus,
    config
  } = useAutoTradeEngine();

  // Get API config from central store
  const apiConfig = useCoinExApiConfig();

  // Use hook state directly (more reliable than props)
  const isConnected = hookIsConnected;
  const isInitialized = hookIsInitialized;

  // Candles data for strategy execution (moved up to be used in useEffect)
  const [candles, setCandles] = useState<any[]>([]);

  // Local trading configuration (will be synced with manual trading) - moved up to be used in refs
  const [autoTradeConfig, setAutoTradeConfig] = useState({
    symbol: 'XRPUSDT',
    timeframe: '5m',
    amount: 20,
    amountUnit: 'coin' as 'usdt' | 'coin', // هماهنگ با manualTradeForm
    leverage: 5,
    marginMode: 'cross' as 'cross' | 'isolated',
    takeProfitPercent: 1,
    stopLossPercent: 1,
    enableTakeProfit: false, // هماهنگ با manualTradeForm
    enableStopLoss: false, // هماهنگ با manualTradeForm
    usePercentageForTP: true,
    usePercentageForSL: true,
    enableTrailingTP: false,
    enableTrailingSL: false,
    trailingDistance: 0.5,
  });

  // Refs to track previous values and prevent infinite loops (moved up to be used in useEffect)
  const prevManualTradingConfigRef = useRef(manualTradingConfig);
  const prevAutoTradeConfigRef = useRef(autoTradeConfig);
  const isUpdatingRef = useRef(false);
  const prevCandlesRef = useRef<any[]>([]); // Track previous candles for comparison

  // Strategy configuration (local) - moved up to be used in useEffect
  const [strategyConfig, setStrategyConfig] = useState({
    strategy: 'range-filter',
    strategyParams: {}
  });

  // Strategy configs - moved up to be used in useEffect
  const [strategyConfigs, setStrategyConfigs] = useState<Array<{
    name: string;
    displayName: string;
    params: StrategyParam[];
  }>>([]);

  // Auto-execution state - moved up to be used in useEffect
  const [autoExecuteStrategy, setAutoExecuteStrategy] = useState(false);
  const [lastExecutionTime, setLastExecutionTime] = useState<number | null>(null);

  // Dedicated auto trade logs - persist in localStorage
  const [autoTradeLogs, setAutoTradeLogs] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('autoTradeLogs');
        return saved ? JSON.parse(saved) : [];
      } catch (error) {
        console.error('Error loading auto trade logs from localStorage:', error);
        return [];
      }
    }
    return [];
  });

  // Function to add auto trade logs - moved up to be used in useEffect
  const addAutoTradeLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const logMessage = `[${timestamp}] ${message}`;
    setAutoTradeLogs(prev => [...prev, logMessage]);
    console.log(`🤖 AutoTrade: ${message}`);
  }, []);

  // Clear auto trade logs - moved up to be used in useEffect
  const clearAutoTradeLogs = useCallback(() => {
    setAutoTradeLogs([]);
  }, []);

  // Function to fetch fresh candle data - moved up to be used in useEffect
  const fetchFreshCandles = useCallback(async () => {
    if (!apiConfig || !apiConfig.apiKey || !apiConfig.apiSecret) {
      addAutoTradeLog('❌ API configuration not available for fetching candles');
      return;
    }

    try {
      addAutoTradeLog('🔄 Fetching fresh candle data...');
      
      const { useCoinExAPI } = await import('@/lib/coinex-api');
      const api = useCoinExAPI.getState();
      
      // Set up API config
      api.setConfig(apiConfig);

      // Map timeframe to API format
      const timeframeMap: { [key: string]: string } = {
        '1m': '1min',
        '3m': '3min',
        '5m': '5min',
        '15m': '15min',
        '30m': '30min',
        '1h': '1hour',
        '2h': '2hour',
        '4h': '4hour',
        '1d': '1day'
      };

      const apiTimeframe = timeframeMap[autoTradeConfig.timeframe] || '5min';
      
      // Fetch fresh candles
      const freshCandles = await api.fetchHistoricalCandles(autoTradeConfig.symbol, apiTimeframe, 100);
      
      if (!freshCandles || freshCandles.length === 0) {
        throw new Error('Failed to fetch fresh candle data');
      }
      
      // Update candles state
      setCandles(freshCandles);
      addAutoTradeLog(`✅ Fetched ${freshCandles.length} fresh candles`);
      
      return freshCandles;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      addAutoTradeLog(`❌ Failed to fetch fresh candles: ${errorMessage}`);
      console.error('Error fetching fresh candles:', error);
      return null;
    }
  }, [apiConfig, autoTradeConfig.symbol, autoTradeConfig.timeframe, addAutoTradeLog]);

  // Save auto trade logs to localStorage whenever they change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('autoTradeLogs', JSON.stringify(autoTradeLogs));
      } catch (error) {
        console.error('Error saving auto trade logs to localStorage:', error);
      }
    }
  }, [autoTradeLogs]);

  // Strategy execution state
  const [isStrategyRunning, setIsStrategyRunning] = useState(false);
  const [strategySignals, setStrategySignals] = useState<Array<{
    timestamp: number;
    type: 'buy' | 'sell';
    price: number;
    strength: number;
  }>>([]);
  const [strategyStartTime, setStrategyStartTime] = useState<number | null>(null);
  
  // Last executed signal for preventing duplicate trades
  const [lastExecutedSignal, setLastExecutedSignal] = useState<{
    timestamp: number;
    type: 'buy' | 'sell';
    price: number;
    strength: number;
  } | null>(null);
  
  // Strategy status display
  const [strategyStatus, setStrategyStatus] = useState<{
    isActive: boolean;
    startTime: number | null;
    symbol: string;
    timeframe: string;
    amount: number;
    leverage: number;
    takeProfitPercent: number;
    stopLossPercent: number;
    trailingDistance: number;
    strategy: string;
    strategyParams: Record<string, any>;
    signalsCount: number;
    positionsOpened: number;
    lastSignalTime: number | null;
  }>(() => {
    // تلاش برای بازیابی وضعیت استراتژی از localStorage
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('autoTradeStrategyStatus');
        if (saved) {
          const parsed = JSON.parse(saved);
          // اگر استراتژی در حال اجرا است، وضعیت را بازیابی کن
          if (parsed.isActive) {
            console.log('📝 Loaded strategy status from localStorage:', parsed);
            return parsed;
          }
        }
      } catch (error) {
        console.error('Error loading strategy status from localStorage:', error);
      }
    }
    // مقادیر پیش‌فرض را از autoTradeConfig و strategyConfig بگیر
    const defaultStatus = {
      isActive: false,
      startTime: null,
      symbol: 'XRPUSDT',
      timeframe: '5m',
      amount: 20,
      leverage: 5,
      takeProfitPercent: 1,
      stopLossPercent: 1,
      trailingDistance: 0.5,
      strategy: 'range-filter',
      strategyParams: {},
      signalsCount: 0,
      positionsOpened: 0,
      lastSignalTime: null,
    };
    console.log('📝 Using default strategy status:', defaultStatus);
    return defaultStatus;
  });

  // Log initial autoTradeConfig
  useEffect(() => {
    console.log('📝 Initial autoTradeConfig:', autoTradeConfig);
  }, []);

  // Auto-refresh candles periodically
  useEffect(() => {
    if (!autoExecuteStrategy || !strategyStatus.isActive) {
      return;
    }

    // Calculate refresh interval based on timeframe
    const timeframeMap: { [key: string]: number } = {
      '1m': 60000,    // 1 minute
      '3m': 180000,   // 3 minutes
      '5m': 300000,   // 5 minutes
      '15m': 900000,  // 15 minutes
      '30m': 1800000, // 30 minutes
      '1h': 3600000,  // 1 hour
      '2h': 7200000,  // 2 hours
      '4h': 14400000, // 4 hours
      '1d': 86400000  // 1 day
    };

    const interval = timeframeMap[autoTradeConfig.timeframe] || 300000; // Default 5 minutes
    
    // Fetch immediately
    fetchFreshCandles();
    
    // Set up periodic refresh
    const refreshInterval = setInterval(() => {
      fetchFreshCandles();
    }, interval);

    return () => clearInterval(refreshInterval);
  }, [autoExecuteStrategy, strategyStatus.isActive, autoTradeConfig.timeframe]);

  // Auto-execute strategy when new candles are received
  useEffect(() => {
    if (!strategyStatus.isActive || !candles || candles.length === 0) {
      return;
    }

    // Only execute if candles have actually changed
    if (JSON.stringify(prevCandlesRef.current) === JSON.stringify(candles)) {
      return;
    }
    
    // Update reference
    prevCandlesRef.current = candles;
    
    // Execute strategy with new candles
    const executeStrategyWithNewCandles = async () => {
      try {
        addAutoTradeLog('🔄 New candles received, executing strategy...');
        
        // Use the same logic as handleRunStrategy but with existing candles
        const currentStrategy = strategyConfigs.find(s => s.name === strategyConfig.strategy);
        const strategyParams = currentStrategy?.params || [];

        // Convert to CandleData format for strategy calculation
        const candleData: CandleData[] = candles.map(candle => ({
          timestamp: candle.timestamp,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: candle.volume
        }));

        // Initialize and run strategy
        let strategy;
        try {
          strategy = strategyManager.getStrategy(strategyConfig.strategy);
          if (!strategy) {
            throw new Error(`Strategy ${strategyConfig.strategy} not found`);
          }
        } catch (strategyError) {
          throw new Error(`Strategy initialization error: ${strategyError instanceof Error ? strategyError.message : 'Unknown strategy error'}`);
        }

        // Set strategy parameters
        try {
          strategy.updateParams(strategyConfig.strategyParams);
          addAutoTradeLog(`🔧 Running ${strategy.getName()} strategy with parameters:`, strategyConfig.strategyParams);
        } catch (paramError) {
          throw new Error(`Strategy parameter error: ${paramError instanceof Error ? paramError.message : 'Unknown parameter error'}`);
        }

        // Calculate signals
        let result;
        try {
          result = strategy.calculate(candleData);
          if (!result) {
            throw new Error('Failed to calculate strategy signals - no result returned');
          }
        } catch (calcError) {
          throw new Error(`Strategy calculation error: ${calcError instanceof Error ? calcError.message : 'Unknown calculation error'}`);
        }

        addAutoTradeLog(`📡 Generated ${result.signals.length} trading signals from new candles`);

        // Filter signals based on strategy start time
        const startTime = strategyStatus.startTime || Date.now();
        const newSignals = result.signals.filter(signal => {
          const timeDiff = signal.timestamp - startTime;
          if (timeDiff < -10000) { // Filter signals older than 10 seconds
            console.log(`🚫 Filtered out old signal: ${timeDiff}ms before start time`);
            return false;
          }
          if (timeDiff < 0) {
            console.log(`⚠️ Signal slightly before start time: ${timeDiff}ms, but including anyway`);
          }
          return true;
        });
        
        addAutoTradeLog(`📊 Total signals: ${result.signals.length}, New signals after start: ${newSignals.length}`);

        // Update signals count
        setStrategyStatus(prev => ({
          ...prev,
          signalsCount: (prev.signalsCount || 0) + newSignals.length,
          lastSignalTime: newSignals.length > 0 ? Math.max(...newSignals.map(s => s.timestamp)) : prev.lastSignalTime
        }));

        // Store signals
        setStrategySignals(result.signals);
        
        if (newSignals.length > 0) {
          const latestNewSignal = newSignals[newSignals.length - 1];
          
          console.log(`🎯 Found new signal from new candles: ${latestNewSignal.type} at ${latestNewSignal.price}`);
          addAutoTradeLog(`🎯 Latest new signal: ${latestNewSignal.type.toUpperCase()} at ${latestNewSignal.price.toFixed(4)}`);
          
          // Check if the new signal is opposite to the last executed signal
          const shouldExecuteTrade = !lastExecutedSignal || latestNewSignal.type !== lastExecutedSignal.type;
          
          if (shouldExecuteTrade) {
            addAutoTradeLog(`✅ Signal is ${lastExecutedSignal ? 'opposite to last signal' : 'first signal'} - executing trade`);
            addAutoTradeLog(`🔄 Checking for opposite positions to close...`);
            
            // Execute trades if auto-execution is enabled
            if (autoExecuteStrategy && onExecuteTrade) {
              try {
                addAutoTradeLog(`🤖 Auto-executing signal: ${latestNewSignal.type.toUpperCase()} at ${latestNewSignal.price.toFixed(4)}`);
                
                const tradeResult = await onExecuteTrade({
                  symbol: autoTradeConfig.symbol,
                  amount: autoTradeConfig.amount,
                  side: latestNewSignal.type,
                  leverage: autoTradeConfig.leverage,
                  marginMode: autoTradeConfig.marginMode,
                  takeProfitPercent: autoTradeConfig.enableTakeProfit ? autoTradeConfig.takeProfitPercent : undefined,
                  stopLossPercent: autoTradeConfig.enableStopLoss ? autoTradeConfig.stopLossPercent : undefined,
                  enableTakeProfit: autoTradeConfig.enableTakeProfit,
                  enableStopLoss: autoTradeConfig.enableStopLoss
                });
                
                if (tradeResult.success) {
                  addAutoTradeLog(`✅ Auto-trade executed successfully: ${tradeResult.message || 'Trade executed'}`);
                  setStrategyStatus(prev => ({
                    ...prev,
                    positionsOpened: (prev.positionsOpened || 0) + 1
                  }));
                  // Update last executed signal
                  setLastExecutedSignal(latestNewSignal);
                  addAutoTradeLog(`✅ Position opened successfully - opposite positions closed if any existed`);
                } else {
                  const tradeError = tradeResult.message || 'Unknown trade error';
                  console.log(`❌ Error executing trade: ${tradeError}`);
                  addAutoTradeLog(`❌ Error executing trade: ${tradeError}`);
                }
              } catch (tradeError) {
                const errorMessage = tradeError instanceof Error ? tradeError.message : 'Unknown trade error';
                addAutoTradeLog(`❌ Error executing trade: ${errorMessage}`);
              }
            } else {
              addAutoTradeLog(`📭 New signal generated but auto-execution is disabled`);
            }
          } else {
            addAutoTradeLog(`⚠️ Signal is same as last executed signal (${lastExecutedSignal?.type}) - skipping trade execution`);
          }
        } else {
          addAutoTradeLog(`📭 No new trading signals from new candles`);
        }
        
        addAutoTradeLog(`✅ Strategy execution completed for new candles`);
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        addAutoTradeLog(`❌ Strategy execution failed for new candles: ${errorMessage}`);
        console.error('Strategy execution error:', error);
      }
    };
    
    // Execute strategy with new candles
    executeStrategyWithNewCandles();
    
  }, [candles, strategyStatus.isActive, strategyConfig.strategy, strategyConfig.strategyParams, autoExecuteStrategy, onExecuteTrade, autoTradeConfig, strategyConfigs, addAutoTradeLog]);

  // Log initial strategyConfig
  useEffect(() => {
    console.log('📝 Initial strategyConfig:', strategyConfig);
  }, []);

  // Last closed candle state for display
  const [lastClosedCandle, setLastClosedCandle] = useState<{
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    hasSignal: boolean;
    signalType?: 'buy' | 'sell';
    signalPrice?: number;
  } | null>(null);

  // Market info for amount calculations
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [marketInfo, setMarketInfo] = useState<any>(null);

  // Backtest configuration and results
  const [backtestConfig, setBacktestConfig] = useState({
    symbol: 'XRPUSDT',
    timeframe: '5m',
    strategy: 'range-filter',
    amount: 20,
    leverage: 5,
    takeProfitPercent: 1,
    stopLossPercent: 1,
    strategyParams: {}
  });

  const [backtestResults, setBacktestResults] = useState<{
    signals: Array<{
      timestamp: number;
      type: 'buy' | 'sell';
      price: number;
      strength: number;
    }>;
    winRate: number;
    totalTrades: number;
    profitableTrades: number;
  }>({
    signals: [],
    winRate: 0,
    totalTrades: 0,
    profitableTrades: 0
  });

  const [isBacktestRunning, setIsBacktestRunning] = useState(false);

  // 获取当前状态和日志
  const status = getStatus();
  const isActive = status?.isActive || false;
  const signalLogs = getSignalLogs();

  // Log auto trade errors
  useEffect(() => {
    if (autoTradeError) {
      addAutoTradeLog(`❌ Auto Trade Error: ${autoTradeError}`);
    }
  }, [autoTradeError]);

  // Debug: Log manual trading config when it changes
  useEffect(() => {
    console.log('🔍 Debug - manualTradingConfig changed:', manualTradingConfig);
    console.log('🔍 Debug - autoTradeConfig current state:', autoTradeConfig);
    console.log('🔍 Debug - prevManualTradingConfigRef.current:', prevManualTradingConfigRef.current);
  }, [manualTradingConfig, autoTradeConfig]);

  // Log when manualTradingConfig becomes available
  useEffect(() => {
    if (manualTradingConfig) {
      console.log('🎯 manualTradingConfig is now available:', manualTradingConfig);
      // Force immediate sync
      if (!isUpdatingRef.current) {
        console.log('🔄 Forcing immediate sync with manualTradingConfig');
        isUpdatingRef.current = true;
        setAutoTradeConfig(prev => ({
          ...prev,
          symbol: manualTradingConfig.symbol,
          timeframe: manualTradingConfig.timeframe,
          amount: manualTradingConfig.amount,
          amountUnit: manualTradingConfig.amountUnit,
          leverage: manualTradingConfig.leverage,
          marginMode: manualTradingConfig.marginMode,
          takeProfitPercent: manualTradingConfig.takeProfitPercent,
          stopLossPercent: manualTradingConfig.stopLossPercent,
          enableTakeProfit: manualTradingConfig.enableTakeProfit,
          enableStopLoss: manualTradingConfig.enableStopLoss,
          enableTrailingTP: manualTradingConfig.enableTrailingTP,
          enableTrailingSL: manualTradingConfig.enableTrailingSL,
          trailingDistance: manualTradingConfig.trailingDistance,
        }));
        prevManualTradingConfigRef.current = manualTradingConfig;
        setTimeout(() => {
          isUpdatingRef.current = false;
        }, 0);
      }
    }
  }, [manualTradingConfig]);

  // Initial sync when component mounts and when manualTradingConfig becomes available
  useEffect(() => {
    if (manualTradingConfig && !isUpdatingRef.current) {
      console.log('🔧 Initial sync on mount/manualTradingConfig change:', manualTradingConfig);
      console.log('🔧 Current autoTradeConfig:', autoTradeConfig);
      
      // Check if we need to sync (values are different)
      const needsSync = 
        autoTradeConfig.symbol !== manualTradingConfig.symbol ||
        autoTradeConfig.timeframe !== manualTradingConfig.timeframe ||
        autoTradeConfig.amount !== manualTradingConfig.amount ||
        autoTradeConfig.amountUnit !== manualTradingConfig.amountUnit ||
        autoTradeConfig.leverage !== manualTradingConfig.leverage ||
        autoTradeConfig.marginMode !== manualTradingConfig.marginMode ||
        autoTradeConfig.takeProfitPercent !== manualTradingConfig.takeProfitPercent ||
        autoTradeConfig.stopLossPercent !== manualTradingConfig.stopLossPercent ||
        autoTradeConfig.enableTakeProfit !== manualTradingConfig.enableTakeProfit ||
        autoTradeConfig.enableStopLoss !== manualTradingConfig.enableStopLoss ||
        autoTradeConfig.enableTrailingTP !== manualTradingConfig.enableTrailingTP ||
        autoTradeConfig.enableTrailingSL !== manualTradingConfig.enableTrailingSL ||
        autoTradeConfig.trailingDistance !== manualTradingConfig.trailingDistance;

      console.log('🔧 Needs sync:', needsSync);

      if (needsSync) {
        console.log('🔧 Sync needed - updating autoTradeConfig');
        isUpdatingRef.current = true;
        setAutoTradeConfig(prev => ({
          ...prev,
          symbol: manualTradingConfig.symbol,
          timeframe: manualTradingConfig.timeframe,
          amount: manualTradingConfig.amount,
          amountUnit: manualTradingConfig.amountUnit,
          leverage: manualTradingConfig.leverage,
          marginMode: manualTradingConfig.marginMode,
          takeProfitPercent: manualTradingConfig.takeProfitPercent,
          stopLossPercent: manualTradingConfig.stopLossPercent,
          enableTakeProfit: manualTradingConfig.enableTakeProfit,
          enableStopLoss: manualTradingConfig.enableStopLoss,
          enableTrailingTP: manualTradingConfig.enableTrailingTP,
          enableTrailingSL: manualTradingConfig.enableTrailingSL,
          trailingDistance: manualTradingConfig.trailingDistance,
        }));
        
        // Update refs
        prevManualTradingConfigRef.current = manualTradingConfig;
        
        addAutoTradeLog(`🔧 Configuration synced: ${manualTradingConfig.symbol} (${manualTradingConfig.timeframe})`);
        
        setTimeout(() => {
          isUpdatingRef.current = false;
        }, 0);
      } else {
        console.log('🔧 No sync needed - values already match');
        // Still update refs to ensure they're current
        prevManualTradingConfigRef.current = manualTradingConfig;
        prevAutoTradeConfigRef.current = autoTradeConfig;
      }
    }
  }, [manualTradingConfig, autoTradeConfig]); // Now depends on both to ensure proper sync

  // Bidirectional synchronization: Sync manual trading config to auto-trade when it changes
  useEffect(() => {
    if (manualTradingConfig && !isUpdatingRef.current) {
      // Check if the config actually changed to prevent infinite loops
      const prevConfig = prevManualTradingConfigRef.current;
      const hasChanged = !prevConfig || 
        prevConfig.symbol !== manualTradingConfig.symbol ||
        prevConfig.timeframe !== manualTradingConfig.timeframe ||
        prevConfig.amount !== manualTradingConfig.amount ||
        prevConfig.amountUnit !== manualTradingConfig.amountUnit ||
        prevConfig.leverage !== manualTradingConfig.leverage ||
        prevConfig.marginMode !== manualTradingConfig.marginMode ||
        prevConfig.takeProfitPercent !== manualTradingConfig.takeProfitPercent ||
        prevConfig.stopLossPercent !== manualTradingConfig.stopLossPercent ||
        prevConfig.enableTakeProfit !== manualTradingConfig.enableTakeProfit ||
        prevConfig.enableStopLoss !== manualTradingConfig.enableStopLoss ||
        prevConfig.enableTrailingTP !== manualTradingConfig.enableTrailingTP ||
        prevConfig.enableTrailingSL !== manualTradingConfig.enableTrailingSL ||
        prevConfig.trailingDistance !== manualTradingConfig.trailingDistance;

      if (hasChanged) {
        console.log('🔄 Syncing manual trading config to auto-trade:', manualTradingConfig);
        isUpdatingRef.current = true;
        setAutoTradeConfig(prev => ({
          ...prev,
          symbol: manualTradingConfig.symbol,
          timeframe: manualTradingConfig.timeframe,
          amount: manualTradingConfig.amount,
          amountUnit: manualTradingConfig.amountUnit,
          leverage: manualTradingConfig.leverage,
          marginMode: manualTradingConfig.marginMode,
          takeProfitPercent: manualTradingConfig.takeProfitPercent,
          stopLossPercent: manualTradingConfig.stopLossPercent,
          enableTakeProfit: manualTradingConfig.enableTakeProfit,
          enableStopLoss: manualTradingConfig.enableStopLoss,
          enableTrailingTP: manualTradingConfig.enableTrailingTP,
          enableTrailingSL: manualTradingConfig.enableTrailingSL,
          trailingDistance: manualTradingConfig.trailingDistance,
        }));
        addAutoTradeLog(`🔄 Configuration synced from manual trading: ${manualTradingConfig.symbol} (${manualTradingConfig.timeframe})`);
        
        // Update the ref after state update
        prevManualTradingConfigRef.current = manualTradingConfig;
        
        // Reset the updating flag after a short delay
        setTimeout(() => {
          isUpdatingRef.current = false;
        }, 0);
      }
    }
  }, [manualTradingConfig]);

  // Bidirectional synchronization: Notify parent of auto-trade config changes
  useEffect(() => {
    if (onAutoTradeConfigChange && manualTradingConfig && !isUpdatingRef.current) {
      // Check if the config actually changed to prevent infinite loops
      const prevConfig = prevAutoTradeConfigRef.current;
      const hasChanged = !prevConfig || 
        prevConfig.symbol !== autoTradeConfig.symbol ||
        prevConfig.timeframe !== autoTradeConfig.timeframe ||
        prevConfig.amount !== autoTradeConfig.amount ||
        prevConfig.amountUnit !== autoTradeConfig.amountUnit ||
        prevConfig.leverage !== autoTradeConfig.leverage ||
        prevConfig.marginMode !== autoTradeConfig.marginMode ||
        prevConfig.takeProfitPercent !== autoTradeConfig.takeProfitPercent ||
        prevConfig.stopLossPercent !== autoTradeConfig.stopLossPercent ||
        prevConfig.enableTakeProfit !== autoTradeConfig.enableTakeProfit ||
        prevConfig.enableStopLoss !== autoTradeConfig.enableStopLoss ||
        prevConfig.enableTrailingTP !== autoTradeConfig.enableTrailingTP ||
        prevConfig.enableTrailingSL !== autoTradeConfig.enableTrailingSL ||
        prevConfig.trailingDistance !== autoTradeConfig.trailingDistance;

      if (hasChanged) {
        console.log('🔄 Notifying parent of auto-trade config change:', autoTradeConfig);
        isUpdatingRef.current = true;
        onAutoTradeConfigChange({
          symbol: autoTradeConfig.symbol,
          timeframe: autoTradeConfig.timeframe,
          amount: autoTradeConfig.amount,
          amountUnit: autoTradeConfig.amountUnit,
          leverage: autoTradeConfig.leverage,
          marginMode: autoTradeConfig.marginMode,
          takeProfitPercent: autoTradeConfig.takeProfitPercent,
          stopLossPercent: autoTradeConfig.stopLossPercent,
          enableTakeProfit: autoTradeConfig.enableTakeProfit,
          enableStopLoss: autoTradeConfig.enableStopLoss,
          enableTrailingTP: autoTradeConfig.enableTrailingTP,
          enableTrailingSL: autoTradeConfig.enableTrailingSL,
          trailingDistance: autoTradeConfig.trailingDistance,
        });
        
        // Update the ref after callback
        prevAutoTradeConfigRef.current = autoTradeConfig;
        
        // Reset the updating flag after a short delay
        setTimeout(() => {
          isUpdatingRef.current = false;
        }, 0);
      }
    }
  }, [autoTradeConfig, onAutoTradeConfigChange, manualTradingConfig]);

  // Log initialization status
  useEffect(() => {
    if (hookIsInitialized) {
      addAutoTradeLog('✅ Trading engine initialized (from hook)');
    } else {
      addAutoTradeLog('⏳ Trading engine not initialized (from hook)');
    }
    
    if (propIsInitialized) {
      addAutoTradeLog('✅ Trading engine initialized (from prop)');
    } else {
      addAutoTradeLog('⏳ Trading engine not initialized (from prop)');
    }
  }, [hookIsInitialized, propIsInitialized]);

  // Log connection status
  useEffect(() => {
    if (isConnected) {
      addAutoTradeLog('✅ Trading engine connected');
    } else {
      addAutoTradeLog('⚠️ Trading engine not connected');
    }
  }, [isConnected]);

  // Initialize strategy configurations safely
  useEffect(() => {
    try {
      const configs = strategyManager.getAllStrategyConfigs();
      console.log('🎯 Available strategy configs:', configs);
      setStrategyConfigs(configs);
    } catch (error) {
      console.error('❌ Error loading strategy configurations:', error);
      addAutoTradeLog(`❌ Error loading strategy configurations: ${error instanceof Error ? error.message : 'Unknown error'}`);
      // Set default empty configs to prevent UI errors
      setStrategyConfigs([]);
    }
  }, []);

  // Log configuration status for debugging
  useEffect(() => {
    console.log('🔍 AutoTradeTab Status Debug:', {
      'Auto Trade Engine': autoTradeEngine ? 'Available' : 'Not Available',
      'Is Initialized': isInitialized,
      'Is Connected': isConnected,
      'Auto Trade Error': autoTradeError || 'None',
      'Has Config': !!config,
      'Config Keys': config ? Object.keys(config) : [],
      'Hook Is Initialized': hookIsInitialized,
      'Hook Is Connected': hookIsConnected,
      'Prop Is Initialized': propIsInitialized,
      'Prop Is Connected': propIsConnected,
      'API Config': apiConfig ? 'Available' : 'Not Available',
      'Strategy Configs': strategyConfigs.length,
      'Manual Trading Config': manualTradingConfig ? 'Available' : 'Not Available'
    });
  }, [isInitialized, isConnected, autoTradeEngine, autoTradeError, config, hookIsInitialized, hookIsConnected, propIsInitialized, propIsConnected, apiConfig, strategyConfigs.length, manualTradingConfig]);

  // Handle strategy configuration changes
  const handleStrategyConfigChange = useCallback((key: string, value: any) => {
    console.log('🔄 Strategy config change:', { key, value });
    setStrategyConfig(prev => ({
      ...prev,
      [key]: value
    }));
    
    // Log the strategy change
    if (key === 'strategy') {
      addAutoTradeLog(`🔄 Strategy changed to: ${value}`);
    }
  }, []);

  // Handle strategy parameter changes
  const handleStrategyParamChange = useCallback((paramName: string, value: any) => {
    try {
      console.log(`🔄 Updating strategy parameter: ${paramName} = ${value}`);
      setStrategyConfig(prev => ({
        ...prev,
        strategyParams: {
          ...prev.strategyParams,
          [paramName]: value
        }
      }));
      
      // Log the parameter change
      addAutoTradeLog(`🔄 Strategy parameter changed: ${paramName} = ${value}`);
    } catch (error) {
      console.error('❌ Error updating strategy parameter:', error);
      addAutoTradeLog(`❌ Error updating strategy parameter: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, []);

  // Keep strategy status in sync with current configuration
  useEffect(() => {
    console.log('🔄 Syncing strategy status:', {
      autoTradeConfig: { symbol: autoTradeConfig.symbol, timeframe: autoTradeConfig.timeframe },
      strategyConfig: { strategy: strategyConfig.strategy, params: strategyConfig.strategyParams },
      currentStrategyStatus: { symbol: strategyStatus.symbol, timeframe: strategyStatus.timeframe, strategy: strategyStatus.strategy }
    });
    
    // Only update strategyStatus if the strategy is active or if values are different
    const shouldUpdate = 
      strategyStatus.symbol !== autoTradeConfig.symbol ||
      strategyStatus.timeframe !== autoTradeConfig.timeframe ||
      strategyStatus.strategy !== strategyConfig.strategy ||
      JSON.stringify(strategyStatus.strategyParams) !== JSON.stringify(strategyConfig.strategyParams);
    
    if (shouldUpdate) {
      console.log('🔄 Updating strategy status with new values');
      setStrategyStatus(prev => ({
        ...prev,
        symbol: autoTradeConfig.symbol,
        timeframe: autoTradeConfig.timeframe,
        amount: autoTradeConfig.amount,
        leverage: autoTradeConfig.leverage,
        takeProfitPercent: autoTradeConfig.takeProfitPercent,
        stopLossPercent: autoTradeConfig.stopLossPercent,
        trailingDistance: autoTradeConfig.trailingDistance,
        strategy: strategyConfig.strategy,
        strategyParams: strategyConfig.strategyParams,
      }));
    }
  }, [autoTradeConfig, strategyConfig, strategyStatus.symbol, strategyStatus.timeframe, strategyStatus.strategy, strategyStatus.strategyParams]);

  // 开始自动交易
  const handleStart = useCallback(() => {
    try {
      addAutoTradeLog('🚀 Starting auto trade...');
      
      if (!strategyConfig.strategy) {
        const errorMessage = 'Please select a strategy';
        addAutoTradeLog(`❌ ${errorMessage}`);
        alert(errorMessage);
        return;
      }

      if (!autoTradeConfig.amount || autoTradeConfig.amount <= 0) {
        const errorMessage = 'Please enter a valid amount';
        addAutoTradeLog(`❌ ${errorMessage}`);
        alert(errorMessage);
        return;
      }

      if (!isInitialized) {
        const errorMessage = 'Trading engine not fully initialized. Attempting to start anyway...';
        addAutoTradeLog(`⚠️ ${errorMessage}`);
        // Don't return here - let's try to start anyway
      }

      if (!isConnected) {
        const errorMessage = 'Trading engine not connected. Please check your API credentials and internet connection.';
        addAutoTradeLog(`❌ ${errorMessage}`);
        alert(errorMessage);
        return;
      }

      if (!autoTradeEngine) {
        const errorMessage = 'Auto trade engine not ready. This usually means the trading configuration is not complete. Please check your API configuration.';
        addAutoTradeLog(`❌ ${errorMessage}`);
        alert(errorMessage);
        return;
      }

      const fullConfig: AutoTradeConfig = {
        symbol: autoTradeConfig.symbol,
        timeframe: autoTradeConfig.timeframe,
        amount: autoTradeConfig.amount,
        amountUnit: autoTradeConfig.amountUnit,
        leverage: autoTradeConfig.leverage,
        marginMode: autoTradeConfig.marginMode,
        takeProfitPercent: autoTradeConfig.takeProfitPercent,
        stopLossPercent: autoTradeConfig.stopLossPercent,
        enableTakeProfit: autoTradeConfig.enableTakeProfit,
        enableStopLoss: autoTradeConfig.enableStopLoss,
        usePercentageForTP: autoTradeConfig.usePercentageForTP,
        usePercentageForSL: autoTradeConfig.usePercentageForSL,
        enableTrailingTP: autoTradeConfig.enableTrailingTP,
        enableTrailingSL: autoTradeConfig.enableTrailingSL,
        trailingDistance: autoTradeConfig.trailingDistance,
        strategy: strategyConfig.strategy,
        strategyParams: strategyConfig.strategyParams
      };

      addAutoTradeLog(`📋 Configuration: ${JSON.stringify(fullConfig, null, 2)}`);

      // Update strategy status with current configuration before starting
      setStrategyStatus(prev => ({
        ...prev,
        symbol: autoTradeConfig.symbol,
        timeframe: autoTradeConfig.timeframe,
        amount: autoTradeConfig.amount,
        leverage: autoTradeConfig.leverage,
        takeProfitPercent: autoTradeConfig.takeProfitPercent,
        stopLossPercent: autoTradeConfig.stopLossPercent,
        trailingDistance: autoTradeConfig.trailingDistance,
        strategy: strategyConfig.strategy,
        strategyParams: strategyConfig.strategyParams,
      }));

      try {
        startAutoTrade(fullConfig);
        addAutoTradeLog('✅ Auto trade started successfully');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        addAutoTradeLog(`❌ Failed to start auto trade: ${errorMessage}`);
        alert(`Failed to start auto trade: ${errorMessage}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ Unexpected error in handleStart:', error);
      addAutoTradeLog(`❌ Unexpected error: ${errorMessage}`);
      alert(`Unexpected error: ${errorMessage}`);
    }
  }, [startAutoTrade, strategyConfig, isInitialized, isConnected]);

  // 停止自动交易
  const handleStop = useCallback(() => {
    addAutoTradeLog('🛑 Stopping auto trade...');
    try {
      stopAutoTrade();
      addAutoTradeLog('✅ Auto trade stopped successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      addAutoTradeLog(`❌ Failed to stop auto trade: ${errorMessage}`);
      alert(`Failed to stop auto trade: ${errorMessage}`);
    }
  }, [stopAutoTrade, addAutoTradeLog]);

  // توقف استراتژی
  const handleStopStrategy = useCallback(() => {
    addAutoTradeLog('🛑 Stopping strategy...');
    
    // به‌روزرسانی وضعیت استراتژی
    setStrategyStatus(prev => ({
      ...prev,
      isActive: false,
      startTime: null,
      signalsCount: 0,
      positionsOpened: 0,
      lastSignalTime: null,
    }));
    
    setIsStrategyRunning(false);
    setStrategyStartTime(null);
    
    // Reset last executed signal to allow fresh start
    setLastExecutedSignal(null);
    
    // پاک کردن localStorage
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('autoTradeStrategyStatus');
      } catch (error) {
        console.error('Error clearing strategy status from localStorage:', error);
      }
    }
    
    addAutoTradeLog('✅ Strategy stopped successfully');
  }, [addAutoTradeLog]);

  // ریست کردن آخرین سیگنال اجرا شده
  const handleResetLastSignal = useCallback(() => {
    addAutoTradeLog('🔄 Resetting last executed signal...');
    setLastExecutedSignal(null);
    addAutoTradeLog('✅ Last executed signal reset - ready for fresh signals');
  }, [addAutoTradeLog]);

  // 清除日志
  const handleClearLogs = useCallback(() => {
    clearSignalLogs();
    clearAutoTradeLogs();
    addAutoTradeLog('🧹 Logs cleared');
  }, [clearSignalLogs, clearAutoTradeLogs, addAutoTradeLog]);

  // اجرای استراتژی و ارسال سیگنال به ترید دستی
  const handleRunStrategy = useCallback(async () => {
    if (isStrategyRunning) {
      addAutoTradeLog('⚠️ Strategy is already running');
      return;
    }

    if (!strategyConfig.strategy) {
      const errorMessage = 'Please select a strategy';
      addAutoTradeLog(`❌ ${errorMessage}`);
      alert(errorMessage);
      return;
    }

    setIsStrategyRunning(true);
    
    // ثبت زمان شروع استراتژی برای فیلتر کردن سیگنال‌های قدیمی
    const startTime = Date.now();
    setStrategyStartTime(startTime);
    
    // به‌روزرسانی وضعیت استراتژی
    console.log('🔄 Updating strategy status to active...');
    setStrategyStatus(prev => {
      const newStatus = {
        ...prev,
        isActive: true,
        startTime: startTime,
        symbol: autoTradeConfig.symbol,
        timeframe: autoTradeConfig.timeframe,
        amount: autoTradeConfig.amount,
        leverage: autoTradeConfig.leverage,
        takeProfitPercent: autoTradeConfig.takeProfitPercent,
        stopLossPercent: autoTradeConfig.stopLossPercent,
        trailingDistance: autoTradeConfig.trailingDistance,
        strategy: strategyConfig.strategy,
        strategyParams: strategyConfig.strategyParams,
        signalsCount: 0,
        positionsOpened: 0,
        lastSignalTime: null,
      };
      console.log('📝 New strategy status:', newStatus);
      return newStatus;
    });
    
    // نمایش اطلاعات استراتژی برای کاربر
    addAutoTradeLog('🚀 Starting strategy execution...');
    addAutoTradeLog(`📊 Symbol: ${autoTradeConfig.symbol}`);
    addAutoTradeLog(`⏰ Timeframe: ${autoTradeConfig.timeframe}`);
    addAutoTradeLog(`💰 Amount: ${autoTradeConfig.amount} ${autoTradeConfig.amountUnit}`);
    addAutoTradeLog(`🎚️ Leverage: ${autoTradeConfig.leverage}x`);
    addAutoTradeLog(`📈 Take Profit: ${autoTradeConfig.takeProfitPercent}%`);
    addAutoTradeLog(`📉 Stop Loss: ${autoTradeConfig.stopLossPercent}%`);
    addAutoTradeLog(`🔄 Trailing: ${autoTradeConfig.trailingDistance}%`);
    addAutoTradeLog(`🤖 Strategy: ${strategyConfig.strategy}`);
    addAutoTradeLog(`📋 Parameters: ${JSON.stringify(strategyConfig.strategyParams, null, 2)}`);
    addAutoTradeLog(`⏱️ Strategy start time: ${new Date(startTime).toLocaleTimeString()}`);
    addAutoTradeLog(`ℹ️ Only signals generated after start time will be executed`);

    try {
      // Get strategy parameters
      const currentStrategy = strategyConfigs.find(s => s.name === strategyConfig.strategy);
      const strategyParams = currentStrategy?.params || [];

      // Map timeframe to API format
      const timeframeMap: { [key: string]: string } = {
        '1m': '1min',
        '3m': '3min',
        '5m': '5min',
        '15m': '15min',
        '30m': '30min',
        '1h': '1hour',
        '2h': '2hour',
        '4h': '4hour',
        '1d': '1day'
      };

      const apiTimeframe = timeframeMap[autoTradeConfig.timeframe] || '5min';

      addAutoTradeLog(`📊 Fetching historical data for ${autoTradeConfig.symbol} (${autoTradeConfig.timeframe})...`);

      // Fetch historical candles
      let candles;
      try {
        const { useCoinExAPI } = await import('@/lib/coinex-api');
        const api = useCoinExAPI.getState();
        
        // Check if API config is available
        if (!apiConfig || !apiConfig.apiKey || !apiConfig.apiSecret) {
          throw new Error('API configuration not available. Please check your API credentials.');
        }
        
        // Set up API config with central store values
        api.setConfig(apiConfig);

        // Fetch historical candles for strategy calculation
        candles = await api.fetchHistoricalCandles(autoTradeConfig.symbol, apiTimeframe, 100);
        
        if (!candles || candles.length === 0) {
          throw new Error('Failed to fetch historical data - no candles returned');
        }
        
        // Update candles state for auto-execution
        setCandles(candles);
      } catch (apiError) {
        const errorMessage = apiError instanceof Error ? apiError.message : 'Unknown API error';
        throw new Error(`API Error: ${errorMessage}`);
      }

      addAutoTradeLog(`✅ Retrieved ${candles.length} historical candles`);

      // Convert to CandleData format for strategy calculation
      const candleData: CandleData[] = candles.map(candle => ({
        timestamp: candle.timestamp,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume
      }));

      // Initialize and run strategy
      let strategy;
      try {
        strategy = strategyManager.getStrategy(strategyConfig.strategy);
        if (!strategy) {
          throw new Error(`Strategy ${strategyConfig.strategy} not found`);
        }
      } catch (strategyError) {
        throw new Error(`Strategy initialization error: ${strategyError instanceof Error ? strategyError.message : 'Unknown strategy error'}`);
      }

      // Set strategy parameters
      try {
        strategy.updateParams(strategyConfig.strategyParams);
        addAutoTradeLog(`🔧 Running ${strategy.getName()} strategy with parameters:`, strategyConfig.strategyParams);
      } catch (paramError) {
        throw new Error(`Strategy parameter error: ${paramError instanceof Error ? paramError.message : 'Unknown parameter error'}`);
      }

      // Calculate signals
      let result;
      try {
        result = strategy.calculate(candleData);
        if (!result) {
          throw new Error('Failed to calculate strategy signals - no result returned');
        }
      } catch (calcError) {
        throw new Error(`Strategy calculation error: ${calcError instanceof Error ? calcError.message : 'Unknown calculation error'}`);
      }

      addAutoTradeLog(`📡 Generated ${result.signals.length} trading signals`);

      // فیلتر کردن سیگنال‌ها: فقط سیگنال‌هایی که بعد از زمان شروع استراتژی هستند را نگه دار
      // اما با تحمل بیشتر برای سیگنال‌های نزدیک به زمان شروع
      const newSignals = result.signals.filter(signal => {
        const timeDiff = signal.timestamp - startTime;
        if (timeDiff < -10000) { // فقط سیگنال‌های قدیمی‌تر از 10 ثانیه را فیلتر کن
          console.log(`🚫 Filtered out old signal: ${timeDiff}ms before start time`);
          return false;
        }
        if (timeDiff < 0) {
          console.log(`⚠️ Signal slightly before start time: ${timeDiff}ms, but including anyway`);
        }
        return true;
      });
      
      addAutoTradeLog(`📊 Total signals: ${result.signals.length}, New signals after start: ${newSignals.length}`);

      // به‌روزرسانی تعداد سیگنال‌ها
      setStrategyStatus(prev => ({
        ...prev,
        signalsCount: newSignals.length,
      }));

      // Store signals and send only new signals to manual trading
      setStrategySignals(result.signals);
      
      if (newSignals.length > 0) {
        const latestNewSignal = newSignals[newSignals.length - 1];
        
        console.log(`🎯 Found new signal to execute: ${latestNewSignal.type} at ${latestNewSignal.price}`);
        addAutoTradeLog(`🎯 Latest new signal: ${latestNewSignal.type.toUpperCase()} at ${latestNewSignal.price.toFixed(4)}`);
        
        // Check if the new signal is opposite to the last executed signal
        const shouldExecuteTrade = !lastExecutedSignal || latestNewSignal.type !== lastExecutedSignal.type;
        
        if (shouldExecuteTrade) {
          addAutoTradeLog(`✅ Signal is ${lastExecutedSignal ? 'opposite to last signal' : 'first signal'} - executing trade`);
          addAutoTradeLog(`🔄 Checking for opposite positions to close...`);
          addAutoTradeLog(`📤 Sending new signal to manual trading system...`);
          
          // فقط سیگنال‌های جدید را به ترید دستی ارسال کن
          let tradeResult;
          try {
            tradeResult = await sendSignalToManualTrading(latestNewSignal);
            
            if (tradeResult && tradeResult.success) {
              console.log(`✅ Trade executed successfully for signal: ${latestNewSignal.type}`);
              // به‌روزرسانی تعداد پوزیشن‌های باز شده
              setStrategyStatus(prev => ({
                ...prev,
                positionsOpened: prev.positionsOpened + 1,
                lastSignalTime: Date.now(),
              }));
              // Update last executed signal
              setLastExecutedSignal(latestNewSignal);
              addAutoTradeLog(`✅ Position opened successfully - opposite positions closed if any existed`);
            } else {
              console.log(`⚠️ Trade execution failed: ${tradeResult?.message || 'Unknown error'}`);
              addAutoTradeLog(`⚠️ Failed to open position: ${tradeResult?.message || 'Unknown error'}`);
            }
          } catch (tradeError) {
            const errorMessage = tradeError instanceof Error ? tradeError.message : 'Unknown trade error';
            console.log(`❌ Error executing trade: ${errorMessage}`);
            addAutoTradeLog(`❌ Error executing trade: ${errorMessage}`);
          }
          
          addAutoTradeLog(`✅ Strategy execution completed - new signal sent with position management`);
        } else {
          addAutoTradeLog(`⚠️ Signal is same as last executed signal (${lastExecutedSignal?.type}) - skipping trade execution`);
          addAutoTradeLog(`✅ Strategy execution completed - duplicate signal skipped`);
        }
      } else {
        addAutoTradeLog('📭 No new trading signals generated after strategy start');
        addAutoTradeLog(`✅ Strategy execution completed - no new signals to execute`);
        addAutoTradeLog(`⏳ Waiting for new signals in next candle...`);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      addAutoTradeLog(`❌ Strategy execution failed: ${errorMessage}`);
      console.error('Strategy execution error:', error);
      
      // در صورت خطا، استراتژی را متوقف کن
      setStrategyStatus(prev => ({
        ...prev,
        isActive: false,
      }));
    } finally {
      setIsStrategyRunning(false);
    }
  }, [strategyConfig, autoTradeConfig, strategyConfigs, isStrategyRunning, addAutoTradeLog]);

  // ارسال سیگنال به بخش ترید دستی
  const sendSignalToManualTrading = useCallback(async (signal: {
    timestamp: number;
    type: 'buy' | 'sell';
    price: number;
    strength: number;
  }) => {
    try {
      addAutoTradeLog(`📤 Sending ${signal.type.toUpperCase()} signal to manual trading...`);
      
      // Check if we have the execute trade function
      if (!onExecuteTrade) {
        throw new Error('Trade execution function not available. Please make sure trading engine is initialized.');
      }

      // Prepare trade parameters based on auto trade config
      const tradeParams = {
        symbol: autoTradeConfig.symbol,
        amount: autoTradeConfig.amount,
        side: signal.type,
        leverage: autoTradeConfig.leverage,
        marginMode: autoTradeConfig.marginMode,
        takeProfitPercent: autoTradeConfig.takeProfitPercent,
        stopLossPercent: autoTradeConfig.stopLossPercent,
        enableTakeProfit: autoTradeConfig.enableTakeProfit,
        enableStopLoss: autoTradeConfig.enableStopLoss,
      };

      addAutoTradeLog(`📋 Trade parameters: ${JSON.stringify(tradeParams, null, 2)}`);

      // Execute the trade using the provided function - فقط یک سفارش ارسال کن
      addAutoTradeLog(`🎯 Executing ${signal.type.toUpperCase()} order...`);
      
      try {
        const result = await onExecuteTrade(tradeParams);
        
        if (result && result.success) {
          addAutoTradeLog(`✅ ${signal.type.toUpperCase()} order executed successfully: ${result.message || 'Order placed'}`);
          return result;
        } else {
          addAutoTradeLog(`⚠️ ${signal.type.toUpperCase()} order executed with issues: ${result?.message || 'Unknown result'}`);
          return result;
        }
      } catch (tradeError) {
        const errorMessage = tradeError instanceof Error ? tradeError.message : 'Unknown trading error';
        addAutoTradeLog(`❌ Failed to execute ${signal.type.toUpperCase()} order: ${errorMessage}`);
        console.error(`${signal.type.toUpperCase()} order execution error:`, tradeError);
        return { success: false, message: errorMessage };
      }

      addAutoTradeLog('✅ Signal processing completed - single order sent');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      addAutoTradeLog(`❌ Failed to send signal to manual trading: ${errorMessage}`);
      console.error('Signal sending error:', error);
      return { success: false, message: errorMessage };
    }
  }, [autoTradeConfig, onExecuteTrade, addAutoTradeLog]);

  // 获取当前策略的参数配置
  const currentStrategyParams = strategyConfigs.find(s => s.name === strategyConfig.strategy)?.params || [];

  // Handle auto strategy execution when new candles close
  useEffect(() => {
    if (!autoExecuteStrategy || !strategyStatus.isActive || !autoTradeEngine || !candles || candles.length < 2) {
      return;
    }

    // Get the latest candle
    const latestCandle = candles[candles.length - 1];
    
    // Check if this is a new candle (closed within the last timeframe)
    const timeframeSeconds = getTimeframeSeconds(autoTradeConfig.timeframe);
    const candleCloseTime = Math.floor(latestCandle.timestamp / 1000) * 1000;
    const now = Date.now();
    
    // Only execute if candle closed recently (within last 10 seconds) and we haven't executed recently
    const isRecentCandle = (now - candleCloseTime) <= 10000; // 10 seconds tolerance
    const hasExecutedRecently = lastExecutionTime && (now - lastExecutionTime) < (timeframeSeconds * 1000 * 0.8); // Don't execute more than once per timeframe
    
    if (isRecentCandle && !hasExecutedRecently) {
      console.log('🕯️ New candle detected, executing auto strategy...');
      executeAutoStrategy();
      setLastExecutionTime(now);
    }
  }, [candles, autoExecuteStrategy, strategyStatus.isActive, autoTradeEngine]);

  // Update last closed candle display
  useEffect(() => {
    if (!candles || candles.length < 2) {
      return;
    }

    const latestCandle = candles[candles.length - 1];
    const previousCandle = candles[candles.length - 2];
    
    // Check if the latest candle is closed (based on timeframe)
    const timeframeSeconds = getTimeframeSeconds(autoTradeConfig.timeframe);
    const candleTime = Math.floor(latestCandle.timestamp / 1000) * 1000;
    const now = Date.now();
    const timeSinceCandleClose = now - candleTime;
    
    // Consider candle closed if enough time has passed
    const isCandleClosed = timeSinceCandleClose > 0 && timeSinceCandleClose < (timeframeSeconds * 1000 * 1.1);
    
    if (isCandleClosed) {
      // Check if this candle has a signal
      let hasSignal = false;
      let signalType: 'buy' | 'sell' | undefined;
      let signalPrice: number | undefined;
      
      if (strategySignals.length > 0) {
        const latestSignal = strategySignals[strategySignals.length - 1];
        const signalTime = latestSignal.timestamp;
        
        // Check if signal matches this candle timeframe
        const candleStartTime = candleTime;
        const candleEndTime = candleTime + (timeframeSeconds * 1000);
        
        if (signalTime >= candleStartTime && signalTime <= candleEndTime) {
          hasSignal = true;
          signalType = latestSignal.type;
          signalPrice = latestSignal.price;
        }
      }
      
      setLastClosedCandle({
        timestamp: latestCandle.timestamp,
        open: latestCandle.open,
        high: latestCandle.high,
        low: latestCandle.low,
        close: latestCandle.close,
        volume: latestCandle.volume,
        hasSignal,
        signalType,
        signalPrice
      });
    }
  }, [candles, strategySignals, autoTradeConfig.timeframe]);

  // Helper function to get timeframe seconds
  const getTimeframeSeconds = (timeframe: string): number => {
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
    return timeframeMap[timeframe] || 300;
  };

  // Auto strategy execution function
  const executeAutoStrategy = useCallback(async () => {
    if (!strategyConfig.strategy || !autoTradeEngine) {
      return;
    }

    try {
      addAutoTradeLog('🤖 Executing auto strategy...');
      
      // Get strategy parameters
      const currentStrategy = strategyConfigs.find(s => s.name === strategyConfig.strategy);
      const strategyParams = currentStrategy?.params || [];

      // Map timeframe to API format
      const timeframeMap: { [key: string]: string } = {
        '1m': '1min',
        '3m': '3min',
        '5m': '5min',
        '15m': '15min',
        '30m': '30min',
        '1h': '1hour',
        '2h': '2hour',
        '4h': '4hour',
        '1d': '1day'
      };

      const apiTimeframe = timeframeMap[autoTradeConfig.timeframe] || '5min';

      // Fetch historical candles
      let candles;
      try {
        const { useCoinExAPI } = await import('@/lib/coinex-api');
        const api = useCoinExAPI.getState();
        
        if (!apiConfig || !apiConfig.apiKey || !apiConfig.apiSecret) {
          throw new Error('API configuration not available');
        }
        
        api.setConfig(apiConfig);
        candles = await api.fetchHistoricalCandles(autoTradeConfig.symbol, apiTimeframe, 100);
        
        if (!candles || candles.length === 0) {
          throw new Error('Failed to fetch historical data');
        }
        
        // Update candles state for future auto-execution
        setCandles(candles);
      } catch (apiError) {
        throw new Error(`API Error: ${apiError instanceof Error ? apiError.message : 'Unknown error'}`);
      }

      // Convert to CandleData format
      const candleData: CandleData[] = candles.map(candle => ({
        timestamp: candle.timestamp,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume
      }));

      // Initialize and run strategy
      const strategy = strategyManager.getStrategy(strategyConfig.strategy);
      if (!strategy) {
        throw new Error(`Strategy ${strategyConfig.strategy} not found`);
      }

      strategy.updateParams(strategyConfig.strategyParams);
      
      const result = strategy.calculate(candleData);
      if (!result) {
        throw new Error('Failed to calculate strategy signals');
      }

      // Filter signals based on strategy start time
      const startTime = strategyStatus.startTime || Date.now();
      const newSignals = result.signals.filter(signal => signal.timestamp >= startTime);
      
      addAutoTradeLog(`📡 Auto strategy generated ${result.signals.length} signals, ${newSignals.length} new`);
      
      // Update strategy signals
      setStrategySignals(result.signals);
      
      // Update strategy status
      setStrategyStatus(prev => ({
        ...prev,
        signalsCount: newSignals.length,
      }));

      // Execute latest new signal if available
      if (newSignals.length > 0) {
        const latestNewSignal = newSignals[newSignals.length - 1];
        
        addAutoTradeLog(`🎯 Auto signal: ${latestNewSignal.type.toUpperCase()} at ${latestNewSignal.price.toFixed(4)}`);
        
        // Check if the new signal is opposite to the last executed signal
        const shouldExecuteTrade = !lastExecutedSignal || latestNewSignal.type !== lastExecutedSignal.type;
        
        if (shouldExecuteTrade) {
          addAutoTradeLog(`✅ Auto signal is ${lastExecutedSignal ? 'opposite to last signal' : 'first signal'} - executing trade`);
          
          try {
            const tradeResult = await sendSignalToManualTrading(latestNewSignal);
            
            if (tradeResult && tradeResult.success) {
              setStrategyStatus(prev => ({
                ...prev,
                positionsOpened: prev.positionsOpened + 1,
                lastSignalTime: Date.now(),
              }));
              // Update last executed signal
              setLastExecutedSignal(latestNewSignal);
              addAutoTradeLog(`✅ Auto position opened successfully`);
            } else {
              addAutoTradeLog(`⚠️ Auto position failed: ${tradeResult?.message || 'Unknown error'}`);
            }
          } catch (tradeError) {
            const errorMessage = tradeError instanceof Error ? tradeError.message : 'Unknown trade error';
            addAutoTradeLog(`❌ Auto trade error: ${errorMessage}`);
          }
        } else {
          addAutoTradeLog(`⚠️ Auto signal is same as last executed signal (${lastExecutedSignal?.type}) - skipping trade execution`);
        }
      }
      
      addAutoTradeLog('✅ Auto strategy execution completed');
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      addAutoTradeLog(`❌ Auto strategy failed: ${errorMessage}`);
      console.error('Auto strategy error:', error);
    }
  }, [strategyConfig, autoTradeConfig, strategyConfigs, autoTradeEngine, strategyStatus.startTime, addAutoTradeLog, apiConfig]);

  // Toggle auto execution
  const toggleAutoExecution = useCallback(() => {
    const newState = !autoExecuteStrategy;
    setAutoExecuteStrategy(newState);
    
    if (newState) {
      addAutoTradeLog('🤖 Auto strategy execution enabled');
      // Execute immediately if we have candles
      if (candles && candles.length >= 2) {
        executeAutoStrategy();
      }
    } else {
      addAutoTradeLog('🛑 Auto strategy execution disabled');
    }
  }, [autoExecuteStrategy, addAutoTradeLog, candles, executeAutoStrategy]);

  // Get market信息和当前价格
  const fetchMarketInfo = async (symbol: string) => {
    try {
      // Use temporary configuration for market info (similar to Manual Trading)
      const { useCoinExAPI } = await import('@/lib/coinex-api');
      
      useCoinExAPI.getState().setConfig(apiConfig);

      const marketData = await useCoinExAPI.getState().fetchMarketData(symbol);
      if (marketData) {
        setMarketInfo(marketData);
        setCurrentPrice(marketData.price);
      }
    } catch (error) {
      console.error('Error fetching market info:', error);
    }
  };

  // Initialize market info
  useEffect(() => {
    fetchMarketInfo(autoTradeConfig.symbol);
  }, []);

  // ذخیره وضعیت استراتژی در localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('autoTradeStrategyStatus', JSON.stringify(strategyStatus));
      } catch (error) {
        console.error('Error saving strategy status to localStorage:', error);
      }
    }
  }, [strategyStatus]);

  // همگام‌سازی تنظیمات با کارت ترید دستی (این useEffect حذف شد چون تکراری است و بالاتر پیاده‌سازی شده)

  // به‌روزرسانی strategyStatus هنگام تغییر autoTradeConfig (حذف شد برای جلوگیری از حلقه بی‌نهایت)

  // به‌روزرسانی strategyStatus هنگام تغییر strategyConfig (حذف شد برای جلوگیری از حلقه بی‌نهایت)

  // همگام‌سازی تغییرات از auto-trade به manual trading (این useEffect حذف شد چون تکراری است و بالاتر پیاده‌سازی شده)

  // 计算函数
  const calculateTakeProfitPrice = (entryPrice: number, percent: number, side: 'buy' | 'sell') => {
    if (side === 'buy') {
      return entryPrice * (1 + percent / 100);
    } else {
      return entryPrice * (1 - percent / 100);
    }
  };

  const calculateStopLossPrice = (entryPrice: number, percent: number, side: 'buy' | 'sell') => {
    if (side === 'buy') {
      return entryPrice * (1 - percent / 100);
    } else {
      return entryPrice * (1 + percent / 100);
    }
  };

  // Backtest handlers
  const handleBacktestConfigChange = useCallback((key: string, value: any) => {
    setBacktestConfig(prev => ({
      ...prev,
      [key]: value
    }));
  }, []);

  const handleBacktestStrategyParamChange = useCallback((paramName: string, value: any) => {
    setBacktestConfig(prev => ({
      ...prev,
      strategyParams: {
        ...prev.strategyParams,
        [paramName]: value
      }
    }));
  }, []);

  const handleRunBacktest = useCallback(async () => {
    setIsBacktestRunning(true);
    addAutoTradeLog('🚀 Starting backtest...');

    try {
      // Get strategy parameters for current backtest strategy
      const currentStrategy = strategyConfigs.find(s => s.name === backtestConfig.strategy);
      const backtestStrategyParams = currentStrategy?.params || [];

      // Map timeframe to API format
      const timeframeMap: { [key: string]: string } = {
        '1m': '1min',
        '3m': '3min',
        '5m': '5min',
        '15m': '15min',
        '30m': '30min',
        '1h': '1hour',
        '2h': '2hour',
        '4h': '4hour',
        '1d': '1day'
      };

      const apiTimeframe = timeframeMap[backtestConfig.timeframe] || '5min';

      addAutoTradeLog(`📊 Fetching historical data for ${backtestConfig.symbol} (${backtestConfig.timeframe})...`);

      // Fetch historical candles
      const { useCoinExAPI } = await import('@/lib/coinex-api');
      const api = useCoinExAPI.getState();
      
      // Set up API config with central store values
      api.setConfig(apiConfig);

      // Fetch 1000 historical candles
      const candles = await api.fetchHistoricalCandles(backtestConfig.symbol, apiTimeframe, 1000);
      
      if (!candles || candles.length === 0) {
        throw new Error('Failed to fetch historical data');
      }
      
      // Update candles state for auto-execution
      setCandles(candles);

      addAutoTradeLog(`✅ Retrieved ${candles.length} historical candles`);

      // Convert to CandleData format for strategy calculation
      const candleData: CandleData[] = candles.map(candle => ({
        timestamp: candle.timestamp,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume
      }));

      // Initialize and run strategy
      const strategy = strategyManager.getStrategy(backtestConfig.strategy);
      if (!strategy) {
        throw new Error(`Strategy ${backtestConfig.strategy} not found`);
      }

      // Set strategy parameters
      strategy.updateParams(backtestConfig.strategyParams);

      addAutoTradeLog(`🔧 Running ${strategy.getName()} strategy with parameters:`, backtestConfig.strategyParams);

      // Calculate signals
      const result = strategy.calculate(candleData);
      
      if (!result) {
        throw new Error('Failed to calculate strategy signals');
      }

      addAutoTradeLog(`📡 Generated ${result.signals.length} trading signals`);

      // Simulate trades and calculate win rate
      let profitableTrades = 0;
      let totalTrades = 0;
      const simulatedSignals = [];

      for (let i = 0; i < result.signals.length; i++) {
        const signal = result.signals[i];
        const signalPrice = signal.price;
        
        // Find next opposite signal or end of data
        let exitPrice = signalPrice;
        let exitTimestamp = signal.timestamp;
        let isProfitable = false;

        for (let j = i + 1; j < result.signals.length; j++) {
          const nextSignal = result.signals[j];
          if (nextSignal.type !== signal.type) {
            exitPrice = nextSignal.price;
            exitTimestamp = nextSignal.timestamp;
            break;
          }
        }

        // If no opposite signal found, use last candle close
        if (exitPrice === signalPrice && candleData.length > 0) {
          exitPrice = candleData[candleData.length - 1].close;
          exitTimestamp = candleData[candleData.length - 1].timestamp;
        }

        // Calculate profit/loss
        if (signal.type === 'buy') {
          isProfitable = exitPrice > signalPrice;
        } else {
          isProfitable = exitPrice < signalPrice;
        }

        if (isProfitable) {
          profitableTrades++;
        }

        totalTrades++;

        simulatedSignals.push({
          timestamp: signal.timestamp,
          type: signal.type,
          price: signalPrice,
          strength: signal.strength
        });
      }

      const winRate = totalTrades > 0 ? (profitableTrades / totalTrades) * 100 : 0;

      setBacktestResults({
        signals: simulatedSignals,
        winRate,
        totalTrades,
        profitableTrades
      });

      addAutoTradeLog(`✅ Backtest completed: ${totalTrades} trades, ${winRate.toFixed(1)}% win rate`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      addAutoTradeLog(`❌ Backtest failed: ${errorMessage}`);
      console.error('Backtest error:', error);
    } finally {
      setIsBacktestRunning(false);
    }
  }, [backtestConfig, strategyConfigs, addAutoTradeLog]);

  const handleClearBacktestResults = useCallback(() => {
    setBacktestResults({
      signals: [],
      winRate: 0,
      totalTrades: 0,
      profitableTrades: 0
    });
    addAutoTradeLog('🧹 Backtest results cleared');
  }, [addAutoTradeLog]);

  // Get current strategy parameters for backtest
  const backtestStrategyParams = strategyConfigs.find(s => s.name === backtestConfig.strategy)?.params || [];

  // Check if we have valid configuration for auto trading
  const hasValidConfig = config && 
                         config.apiKey && 
                         config.apiSecret && 
                         config.apiSecret !== 'your-api-secret-here' && 
                         config.apiSecret !== 'temp' && 
                         config.apiSecret !== '';

  const canStartAutoTrading = isInitialized && isConnected && autoTradeEngine && hasValidConfig;

  console.log('🔍 Auto Trading Readiness Check:', {
    hasValidConfig,
    isInitialized,
    isConnected,
    hasAutoTradeEngine: !!autoTradeEngine,
    canStartAutoTrading,
    config: config ? { 
      hasApiKey: !!config.apiKey, 
      hasApiSecret: !!config.apiSecret, 
      isValidSecret: config.apiSecret !== 'your-api-secret-here' && config.apiSecret !== 'temp' && config.apiSecret !== ''
    } : 'No config'
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Auto Trade</h1>
          <p className="text-muted-foreground">
            Automated trading based on strategy signals
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Badge variant={isActive ? "default" : "secondary"}>
            {isActive ? "Active" : "Inactive"}
          </Badge>
          {isActive ? (
            <Button onClick={handleStop} variant="destructive" size="sm">
              <Square className="w-4 h-4 mr-2" />
              Stop
            </Button>
          ) : (
            <Button 
              onClick={handleStart} 
              disabled={!canStartAutoTrading} 
              size="sm"
              title={
                !isInitialized 
                  ? "Trading engine not initialized. Please go to API Config tab and enter your CoinEx API credentials." 
                  : !isConnected 
                    ? "Trading engine not connected. Please check your internet connection and API credentials." 
                    : !autoTradeEngine
                      ? autoTradeError 
                        ? `Auto trade engine not ready: ${autoTradeError}` 
                        : "Auto trade engine not ready. Please wait for initialization to complete." 
                      : !hasValidConfig
                        ? "Invalid API configuration. Please check your API credentials in the API Config tab."
                        : "Start auto trading"
              }
            >
              <Play className="w-4 h-4 mr-2" />
              Start
              {(!canStartAutoTrading) && (
                <AlertTriangle className="w-4 h-4 ml-2 text-orange-500" />
              )}
            </Button>
          )}
          
          {/* دکمه اجرای استراتژی */}
          <Button 
            onClick={handleRunStrategy} 
            disabled={isStrategyRunning || !strategyConfig.strategy} 
            variant="outline" 
            size="sm"
            title={
              isStrategyRunning 
                ? "Strategy is currently running" 
                : !strategyConfig.strategy
                  ? "Please select a strategy first"
                  : `Run strategy for current manual trading settings and send signal to manual trading`
            }
          >
            <Brain className="w-4 h-4 mr-2" />
            {isStrategyRunning ? "Running..." : "Run Strategy"}
            {isStrategyRunning && (
              <AlertTriangle className="w-4 h-4 ml-2 text-blue-500" />
            )}
          </Button>
          
          <Button 
            onClick={toggleAutoExecution} 
            variant={autoExecuteStrategy ? "default" : "outline"} 
            size="sm"
            title={autoExecuteStrategy ? "Disable auto execution" : "Enable auto execution on new candles"}
          >
            {autoExecuteStrategy ? (
              <>
                <Activity className="w-4 h-4 mr-2" />
                Auto: ON
              </>
            ) : (
              <>
                <Activity className="w-4 h-4 mr-2" />
                Auto: OFF
              </>
            )}
          </Button>
        </div>
      </div>

      {/* کارت وضعیت استراتژی */}
      {strategyStatus.isActive && (
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-blue-800 flex items-center">
              <Activity className="w-5 h-5 mr-2" />
              Strategy Status - Active
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="font-medium text-blue-700">Symbol:</span>
                  <span className="text-blue-900">{autoTradeConfig.symbol}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium text-blue-700">Timeframe:</span>
                  <span className="text-blue-900">{autoTradeConfig.timeframe}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium text-blue-700">Amount:</span>
                  <span className="text-blue-900">{autoTradeConfig.amount} {autoTradeConfig.amountUnit}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium text-blue-700">Leverage:</span>
                  <span className="text-blue-900">{autoTradeConfig.leverage}x</span>
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="font-medium text-blue-700">Take Profit:</span>
                  <span className="text-blue-900">{autoTradeConfig.takeProfitPercent}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium text-blue-700">Stop Loss:</span>
                  <span className="text-blue-900">{autoTradeConfig.stopLossPercent}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium text-blue-700">Trailing:</span>
                  <span className="text-blue-900">{autoTradeConfig.trailingDistance}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium text-blue-700">Strategy:</span>
                  <span className="text-blue-900">{strategyConfig.strategy}</span>
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="font-medium text-blue-700">Start Time:</span>
                  <span className="text-blue-900">
                    {strategyStatus.startTime ? new Date(strategyStatus.startTime).toLocaleTimeString() : '-'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium text-blue-700">Signals Count:</span>
                  <span className="text-blue-900">{strategyStatus.signalsCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium text-blue-700">Positions Opened:</span>
                  <span className="text-blue-900">{strategyStatus.positionsOpened}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium text-blue-700">Last Signal:</span>
                  <span className="text-blue-900">
                    {lastExecutedSignal ? `${lastExecutedSignal.type.toUpperCase()} at ${lastExecutedSignal.price.toFixed(4)}` : 'None'}
                  </span>
                </div>
              </div>
            </div>
            
            {/* پارامترهای استراتژی */}
            {Object.keys(strategyConfig.strategyParams).length > 0 && (
              <div className="mt-4 p-3 bg-blue-100 rounded-lg">
                <h4 className="font-medium text-blue-800 mb-2">Strategy Parameters:</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                  {Object.entries(strategyConfig.strategyParams).map(([key, value]) => (
                    <div key={key} className="flex justify-between">
                      <span className="text-blue-700">{key}:</span>
                      <span className="text-blue-900 font-mono">{String(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* دکمه توقف استراتژی */}
            <div className="mt-4 flex justify-end gap-2">
              <Button 
                onClick={handleResetLastSignal} 
                variant="outline" 
                size="sm"
                title="Reset last executed signal to allow fresh trades"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Reset Signal
              </Button>
              <Button 
                onClick={handleStopStrategy} 
                variant="destructive" 
                size="sm"
                className="bg-red-600 hover:bg-red-700"
              >
                <Square className="w-4 h-4 mr-2" />
                Stop Strategy
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!isInitialized && (
        <Alert className="border-orange-200 bg-orange-50">
          <AlertTriangle className="h-4 w-4 text-orange-600" />
          <AlertTitle className="text-orange-800">Trading Engine Not Initialized</AlertTitle>
          <AlertDescription className="text-orange-700">
            <div className="space-y-2">
              <p>
                The trading engine has not been properly initialized. This is usually caused by missing or invalid API credentials.
              </p>
              <div className="bg-orange-100 p-2 rounded text-sm">
                <strong>Required Steps:</strong>
                <ol className="list-decimal list-inside mt-1 space-y-1">
                  <li>Go to the <strong>API Config</strong> tab</li>
                  <li>Enter your valid CoinEx API Key and API Secret</li>
                  <li>Click "Save Configuration & Initialize Trading Engine"</li>
                  <li>Wait for the success confirmation message</li>
                  <li>Return to this tab to start auto trading</li>
                </ol>
              </div>
              <div className="text-xs text-orange-600">
                <strong>Debug Info:</strong> Hook Initialized: {hookIsInitialized ? 'Yes' : 'No'}, 
                Prop Initialized: {propIsInitialized ? 'Yes' : 'No'}, 
                Connected: {isConnected ? 'Yes' : 'No'}
              </div>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {isInitialized && isConnected && !autoTradeEngine && (
        <Alert className="border-red-200 bg-red-50">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <AlertTitle className="text-red-800">Auto Trade Engine Not Ready</AlertTitle>
          <AlertDescription className="text-red-700">
            <div className="space-y-2">
              <p>
                The auto trade engine could not be initialized. This usually means there's a problem with the trading configuration.
              </p>
              <div className="bg-red-100 p-2 rounded text-sm">
                <strong>Possible Solutions:</strong>
                <ol className="list-decimal list-inside mt-1 space-y-1">
                  <li>Check your API credentials in the API Config tab</li>
                  <li>Make sure you have sufficient funds in your account</li>
                  <li>Verify that your API key has futures trading permissions</li>
                  <li>Try re-initializing the trading engine</li>
                </ol>
              </div>
              <div className="text-xs text-red-600">
                <strong>Error:</strong> {autoTradeError || 'Unknown error'}
              </div>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {isInitialized && isConnected && !hasValidConfig && (
        <Alert className="border-red-200 bg-red-50">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <AlertTitle className="text-red-800">Invalid API Configuration</AlertTitle>
          <AlertDescription className="text-red-700">
            <div className="space-y-2">
              <p>
                Your API configuration is invalid. Please go to the <strong>API Config</strong> tab and enter valid CoinEx API credentials.
              </p>
              <div className="bg-red-100 p-2 rounded text-sm">
                <strong>Issue:</strong> {!config?.apiKey ? 'Missing API Key' : !config?.apiSecret ? 'Missing API Secret' : 'Invalid API Secret'}
              </div>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {isInitialized && !isConnected && (
        <Alert className="border-yellow-200 bg-yellow-50">
          <WifiOff className="h-4 w-4 text-yellow-600" />
          <AlertTitle className="text-yellow-800">Connection Issue</AlertTitle>
          <AlertDescription className="text-yellow-700">
            Trading engine is initialized but not connected. Please check your API credentials and internet connection.
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="settings" className="space-y-4">
        <TabsList>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="api-config">API Config</TabsTrigger>
          <TabsTrigger value="logs">Signal Logs</TabsTrigger>
          <TabsTrigger value="auto-logs">Auto Trade Logs</TabsTrigger>
          <TabsTrigger value="strategy-signals">Strategy Signals</TabsTrigger>
          <TabsTrigger value="candle-info">Candle Info</TabsTrigger>
          <TabsTrigger value="backtest">Backtest</TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 策略配置 */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  Strategy Configuration
                </CardTitle>
                <CardDescription>
                  Select and configure your trading strategy
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="strategy">Strategy</Label>
                  <Select
                    value={strategyConfig.strategy}
                    onValueChange={(value) => handleStrategyConfigChange('strategy', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select strategy" />
                    </SelectTrigger>
                    <SelectContent>
                      {strategyConfigs.map((strategy) => (
                        <SelectItem key={strategy.name} value={strategy.name}>
                          {strategy.displayName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* 策略参数 */}
                {currentStrategyParams.length > 0 && (
                  <div className="space-y-4">
                    <Label>Strategy Parameters</Label>
                    {currentStrategyParams.map((param) => (
                      <div key={param.name} className="space-y-2">
                        <Label htmlFor={param.name}>{param.label}</Label>
                        {param.type === 'number' && (
                          <Input
                            id={param.name}
                            type="number"
                            step={param.step}
                            min={param.min}
                            max={param.max}
                            value={strategyConfig.strategyParams?.[param.name] ?? param.default}
                            onChange={(e) => handleStrategyParamChange(param.name, parseFloat(e.target.value))}
                          />
                        )}
                        {param.type === 'boolean' && (
                          <Switch
                            id={param.name}
                            checked={strategyConfig.strategyParams?.[param.name] ?? param.default}
                            onCheckedChange={(checked) => handleStrategyParamChange(param.name, checked)}
                          />
                        )}
                        {param.type === 'select' && param.options && (
                          <Select
                            value={strategyConfig.strategyParams?.[param.name] ?? param.default}
                            onValueChange={(value) => handleStrategyParamChange(param.name, value)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {param.options.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

          {/* 状态信息 */}
          {status && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="w-5 h-5" />
                  Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Buffer Size</p>
                    <p className="text-2xl font-bold">{status.bufferSize}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Strategy</p>
                    <p className="text-lg font-semibold">{status.config?.strategy}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Timeframe</p>
                    <p className="text-lg font-semibold">{status.config?.timeframe}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Last Signal</p>
                    <p className="text-lg font-semibold">
                      {status.lastSignalTime ? new Date(status.lastSignalTime).toLocaleTimeString() : 'Never'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          </div>
        </TabsContent>

        <TabsContent value="api-config" className="space-y-4">
          <ApiConfigForm />
        </TabsContent>

        <TabsContent value="logs" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Signal Logs</CardTitle>
                  <CardDescription>
                    Real-time strategy signals and execution status
                  </CardDescription>
                </div>
                <Button onClick={handleClearLogs} variant="outline" size="sm">
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Clear Logs
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px] w-full border rounded-md p-4">
                {signalLogs.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    No signals yet. Start auto trading to see signals here.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {signalLogs.map((log) => (
                      <div
                        key={log.id}
                        className={`p-3 rounded-lg border ${
                          log.executed ? 'bg-green-50 border-green-200' : 
                          log.error ? 'bg-red-50 border-red-200' : 
                          'bg-blue-50 border-blue-200'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-2">
                            <Badge variant={log.signalType === 'buy' ? 'default' : 'destructive'}>
                              {log.signalType.toUpperCase()}
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              {new Date(log.timestamp).toLocaleString()}
                            </span>
                          </div>
                          <Badge variant={log.executed ? 'default' : log.error ? 'destructive' : 'secondary'}>
                            {log.executed ? 'Executed' : log.error ? 'Error' : 'Pending'}
                          </Badge>
                        </div>
                        <div className="text-sm">
                          <p><strong>Strategy:</strong> {log.strategy}</p>
                          <p><strong>Price:</strong> {log.price.toFixed(4)}</p>
                          {log.orderId && <p><strong>Order ID:</strong> {log.orderId}</p>}
                          {log.error && <p><strong>Error:</strong> {log.error}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="auto-logs" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Auto Trade Logs</CardTitle>
                  <CardDescription>
                    Detailed auto trading system logs and events
                  </CardDescription>
                </div>
                <Button onClick={clearAutoTradeLogs} variant="outline" size="sm">
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Clear Logs
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px] w-full border rounded-md p-4">
                {autoTradeLogs.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    No auto trade logs yet. Start auto trading to see logs here.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {autoTradeLogs.map((log, index) => (
                      <div
                        key={index}
                        className={`p-3 rounded-lg border ${
                          log.includes('✅') ? 'bg-green-50 border-green-200' : 
                          log.includes('❌') ? 'bg-red-50 border-red-200' : 
                          log.includes('⚠️') ? 'bg-yellow-50 border-yellow-200' :
                          log.includes('🚀') ? 'bg-blue-50 border-blue-200' :
                          'bg-gray-50 border-gray-200'
                        }`}
                      >
                        <div className="text-sm font-mono">
                          {log}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="strategy-signals" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Strategy Signals</CardTitle>
                  <CardDescription>
                    Real-time strategy signals generated by manual execution
                  </CardDescription>
                </div>
                <Button 
                  onClick={() => setStrategySignals([])} 
                  variant="outline" 
                  size="sm"
                  disabled={strategySignals.length === 0}
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Clear Signals
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px] w-full border rounded-md p-4">
                {strategySignals.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    <Brain className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No strategy signals yet.</p>
                    <p className="text-sm">Click "Run Strategy" to generate signals.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {strategySignals.map((signal, index) => (
                      <div
                        key={index}
                        className={`p-4 rounded-lg border-l-4 ${
                          signal.type === 'buy' 
                            ? 'border-green-500 bg-green-50' 
                            : 'border-red-500 bg-red-50'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-3">
                            <Badge variant={signal.type === 'buy' ? 'default' : 'destructive'}>
                              {signal.type === 'buy' ? '🟢 BUY' : '🔴 SELL'}
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              {new Date(signal.timestamp).toLocaleString()}
                            </span>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold">
                              ${signal.price.toFixed(4)}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Strength: {signal.strength.toFixed(2)}
                            </p>
                          </div>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          <p>Symbol: {autoTradeConfig.symbol}</p>
                          <p>Amount: {autoTradeConfig.amount} {autoTradeConfig.amountUnit}</p>
                          <p>Leverage: {autoTradeConfig.leverage}x</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="candle-info" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Last Closed Candle Info */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="w-5 h-5" />
                  Last Closed Candle
                </CardTitle>
                <CardDescription>
                  Information about the most recently closed candle
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {lastClosedCandle ? (
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="font-medium">Time:</span>
                      <span className="text-sm">{new Date(lastClosedCandle.timestamp).toLocaleString()}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <p className="text-sm font-medium">Open:</p>
                        <p className="font-mono">{lastClosedCandle.open.toFixed(4)}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium">Close:</p>
                        <p className="font-mono">{lastClosedCandle.close.toFixed(4)}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium">High:</p>
                        <p className="font-mono">{lastClosedCandle.high.toFixed(4)}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium">Low:</p>
                        <p className="font-mono">{lastClosedCandle.low.toFixed(4)}</p>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-medium">Volume:</span>
                      <span className="text-sm">{lastClosedCandle.volume.toFixed(2)}</span>
                    </div>
                    
                    {/* Signal Information */}
                    <div className={`p-3 rounded-lg border ${
                      lastClosedCandle.hasSignal 
                        ? lastClosedCandle.signalType === 'buy' 
                          ? 'border-green-200 bg-green-50' 
                          : 'border-red-200 bg-red-50'
                        : 'border-gray-200 bg-gray-50'
                    }`}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium">Signal Status:</span>
                        {lastClosedCandle.hasSignal ? (
                          <Badge variant={lastClosedCandle.signalType === 'buy' ? 'default' : 'destructive'}>
                            {lastClosedCandle.signalType?.toUpperCase()} SIGNAL
                          </Badge>
                        ) : (
                          <Badge variant="secondary">NO SIGNAL</Badge>
                        )}
                      </div>
                      {lastClosedCandle.hasSignal && lastClosedCandle.signalPrice && (
                        <div className="text-sm">
                          <p><strong>Signal Price:</strong> {lastClosedCandle.signalPrice.toFixed(4)}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-muted-foreground py-8">
                    <Activity className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No candle data available yet.</p>
                    <p className="text-sm">Waiting for candle data...</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Auto Execution Status */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Brain className="w-5 h-5" />
                  Auto Execution Status
                </CardTitle>
                <CardDescription>
                  Automatic strategy execution settings and status
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-lg border">
                  <div className="space-y-1">
                    <p className="font-medium">Auto Execution</p>
                    <p className="text-sm text-muted-foreground">
                      {autoExecuteStrategy 
                        ? "Strategy will execute automatically when new candles close" 
                        : "Strategy requires manual execution"}
                    </p>
                  </div>
                  <Button 
                    onClick={toggleAutoExecution}
                    variant={autoExecuteStrategy ? "default" : "outline"}
                    size="sm"
                  >
                    {autoExecuteStrategy ? "Disable" : "Enable"}
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 rounded-lg bg-muted">
                    <p className="text-sm font-medium">Strategy Status</p>
                    <p className={`text-lg font-bold ${strategyStatus.isActive ? 'text-green-600' : 'text-gray-600'}`}>
                      {strategyStatus.isActive ? 'Active' : 'Inactive'}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted">
                    <p className="text-sm font-medium">Auto Mode</p>
                    <p className={`text-lg font-bold ${autoExecuteStrategy ? 'text-green-600' : 'text-gray-600'}`}>
                      {autoExecuteStrategy ? 'Enabled' : 'Disabled'}
                    </p>
                  </div>
                </div>

                {strategyStatus.isActive && (
                  <div className="space-y-3">
                    <h4 className="font-medium">Strategy Information</h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="flex justify-between">
                        <span>Symbol:</span>
                        <span className="font-mono">{autoTradeConfig.symbol}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Timeframe:</span>
                        <span>{autoTradeConfig.timeframe}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Strategy:</span>
                        <span>{strategyConfig.strategy}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Signals:</span>
                        <span>{strategyStatus.signalsCount}</span>
                      </div>
                    </div>
                    {/* Debug info */}
                    <div className="p-2 bg-yellow-50 border border-yellow-200 rounded text-xs">
                      <p><strong>Debug Info:</strong></p>
                      <p>autoTradeConfig.symbol: {autoTradeConfig.symbol}</p>
                      <p>autoTradeConfig.timeframe: {autoTradeConfig.timeframe}</p>
                      <p>strategyConfig.strategy: {strategyConfig.strategy}</p>
                      <p>manualTradingConfig: {manualTradingConfig ? 'Available' : 'Not Available'}</p>
                      <p>strategyStatus.symbol: {strategyStatus.symbol}</p>
                      <p>strategyStatus.timeframe: {strategyStatus.timeframe}</p>
                      <p>strategyStatus.strategy: {strategyStatus.strategy}</p>
                    </div>
                  </div>
                )}

                {lastExecutionTime && (
                  <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                    <p className="text-sm font-medium text-blue-800">Last Execution</p>
                    <p className="text-sm text-blue-600">
                      {new Date(lastExecutionTime).toLocaleString()}
                    </p>
                  </div>
                )}

                <div className="p-3 rounded-lg bg-muted">
                  <p className="text-sm font-medium mb-2">How it works:</p>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    <li>• When enabled, strategy executes automatically when new candles close</li>
                    <li>• Only signals generated after strategy start are executed</li>
                    <li>• Execution happens once per timeframe to prevent duplicates</li>
                    <li>• Manual execution is still available via "Run Strategy" button</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="backtest" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* بک تست کانفیگ */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  Backtest Configuration
                </CardTitle>
                <CardDescription>
                  Configure backtest parameters and run strategy testing
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="backtest-symbol">Symbol</Label>
                    <Select
                      value={backtestConfig.symbol}
                      onValueChange={(value) => handleBacktestConfigChange('symbol', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select symbol" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="BTCUSDT">BTCUSDT</SelectItem>
                        <SelectItem value="ETHUSDT">ETHUSDT</SelectItem>
                        <SelectItem value="XRPUSDT">XRPUSDT</SelectItem>
                        <SelectItem value="SOLUSDT">SOLUSDT</SelectItem>
                        <SelectItem value="ADAUSDT">ADAUSDT</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="backtest-timeframe">Timeframe</Label>
                    <Select
                      value={backtestConfig.timeframe}
                      onValueChange={(value) => handleBacktestConfigChange('timeframe', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select timeframe" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1m">1 Minute</SelectItem>
                        <SelectItem value="3m">3 Minutes</SelectItem>
                        <SelectItem value="5m">5 Minutes</SelectItem>
                        <SelectItem value="15m">15 Minutes</SelectItem>
                        <SelectItem value="30m">30 Minutes</SelectItem>
                        <SelectItem value="1h">1 Hour</SelectItem>
                        <SelectItem value="2h">2 Hours</SelectItem>
                        <SelectItem value="4h">4 Hours</SelectItem>
                        <SelectItem value="1d">1 Day</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="backtest-strategy">Strategy</Label>
                  <Select
                    value={backtestConfig.strategy}
                    onValueChange={(value) => handleBacktestConfigChange('strategy', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select strategy" />
                    </SelectTrigger>
                    <SelectContent>
                      {strategyConfigs.map((strategy) => (
                        <SelectItem key={strategy.name} value={strategy.name}>
                          {strategy.displayName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* استراتژی پارامترها برای بک تست */}
                {backtestStrategyParams.length > 0 && (
                  <div className="space-y-4">
                    <Label>Strategy Parameters</Label>
                    {backtestStrategyParams.map((param) => (
                      <div key={param.name} className="space-y-2">
                        <Label htmlFor={`backtest-${param.name}`}>{param.label}</Label>
                        {param.type === 'number' && (
                          <Input
                            id={`backtest-${param.name}`}
                            type="number"
                            step={param.step}
                            min={param.min}
                            max={param.max}
                            value={backtestConfig.strategyParams?.[param.name] ?? param.default}
                            onChange={(e) => handleBacktestStrategyParamChange(param.name, parseFloat(e.target.value))}
                          />
                        )}
                        {param.type === 'boolean' && (
                          <Switch
                            id={`backtest-${param.name}`}
                            checked={backtestConfig.strategyParams?.[param.name] ?? param.default}
                            onCheckedChange={(checked) => handleBacktestStrategyParamChange(param.name, checked)}
                          />
                        )}
                        {param.type === 'select' && param.options && (
                          <Select
                            value={backtestConfig.strategyParams?.[param.name] ?? param.default}
                            onValueChange={(value) => handleBacktestStrategyParamChange(param.name, value)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {param.options.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="backtest-amount">Amount (USDT)</Label>
                    <Input
                      id="backtest-amount"
                      type="number"
                      step="1"
                      min="1"
                      value={backtestConfig.amount}
                      onChange={(e) => handleBacktestConfigChange('amount', parseFloat(e.target.value))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="backtest-leverage">Leverage</Label>
                    <Input
                      id="backtest-leverage"
                      type="number"
                      step="1"
                      min="1"
                      max="125"
                      value={backtestConfig.leverage}
                      onChange={(e) => handleBacktestConfigChange('leverage', parseInt(e.target.value))}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="backtest-take-profit">Take Profit (%)</Label>
                    <Input
                      id="backtest-take-profit"
                      type="number"
                      step="0.1"
                      min="0.1"
                      value={backtestConfig.takeProfitPercent}
                      onChange={(e) => handleBacktestConfigChange('takeProfitPercent', parseFloat(e.target.value))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="backtest-stop-loss">Stop Loss (%)</Label>
                    <Input
                      id="backtest-stop-loss"
                      type="number"
                      step="0.1"
                      min="0.1"
                      value={backtestConfig.stopLossPercent}
                      onChange={(e) => handleBacktestConfigChange('stopLossPercent', parseFloat(e.target.value))}
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button 
                    onClick={handleRunBacktest} 
                    disabled={isBacktestRunning}
                    className="flex-1"
                  >
                    {isBacktestRunning ? (
                      <>
                        <RotateCcw className="w-4 h-4 mr-2 animate-spin" />
                        Running...
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 mr-2" />
                        Run Backtest
                      </>
                    )}
                  </Button>
                  
                  <Button 
                    variant="outline" 
                    onClick={handleClearBacktestResults}
                    disabled={backtestResults.signals.length === 0}
                  >
                    Clear Results
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* نتایج بک تست */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="w-5 h-5" />
                  Backtest Results
                </CardTitle>
                <CardDescription>
                  Strategy performance and signal history
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {backtestResults.signals.length > 0 && (
                  <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Total Signals</p>
                      <p className="text-2xl font-bold">{backtestResults.signals.length}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Win Rate</p>
                      <p className="text-2xl font-bold">{backtestResults.winRate.toFixed(1)}%</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Buy Signals</p>
                      <p className="text-2xl font-bold text-green-600">
                        {backtestResults.signals.filter(s => s.type === 'buy').length}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Sell Signals</p>
                      <p className="text-2xl font-bold text-red-600">
                        {backtestResults.signals.filter(s => s.type === 'sell').length}
                      </p>
                    </div>
                  </div>
                )}

                {backtestResults.signals.length === 0 && !isBacktestRunning && (
                  <div className="text-center text-muted-foreground py-8">
                    <p>No backtest results yet.</p>
                    <p className="text-sm mt-2">Configure parameters and run a backtest to see results.</p>
                  </div>
                )}

                {isBacktestRunning && (
                  <div className="text-center py-8">
                    <RotateCcw className="w-8 h-8 mx-auto mb-4 animate-spin text-primary" />
                    <p className="font-medium">Running backtest...</p>
                    <p className="text-sm text-muted-foreground mt-2">
                      Fetching historical data and calculating signals
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* جدول سیگنال‌ها */}
          {backtestResults.signals.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Signal History</CardTitle>
                <CardDescription>
                  Detailed list of all trading signals generated during backtest
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-96">
                  <div className="space-y-2">
                    {backtestResults.signals.map((signal, index) => (
                      <div 
                        key={index}
                        className={`flex items-center justify-between p-3 rounded-lg border ${
                          signal.type === 'buy' 
                            ? 'border-green-200 bg-green-50' 
                            : 'border-red-200 bg-red-50'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full ${
                            signal.type === 'buy' ? 'bg-green-500' : 'bg-red-500'
                          }`} />
                          <div>
                            <p className="font-medium">
                              {signal.type === 'buy' ? 'BUY' : 'SELL'} Signal
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {new Date(signal.timestamp).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-medium">
                            ${signal.price.toFixed(4)}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Strength: {signal.strength.toFixed(2)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}