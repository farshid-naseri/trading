'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { TradingEngine, TradingEngineState, TradingConfig, Position } from '@/lib/trading-engine';

export function useTradingEngine() {
  const [engine] = useState(() => new TradingEngine());
  const [state, setState] = useState<TradingEngineState>(engine.getState());
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stateRef = useRef(state);
  stateRef.current = state;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Cleanup the engine when component unmounts
      engine.cleanup().catch(error => {
        console.error('Error cleaning up trading engine:', error);
      });
    };
  }, [engine]);

  // Subscribe to engine state changes
  useEffect(() => {
    const handleStateChange = (newState: TradingEngineState) => {
      setState(newState);
    };

    engine.on('stateChanged', handleStateChange);

    return () => {
      engine.off('stateChanged', handleStateChange);
    };
  }, [engine]);

  // Subscribe to engine events
  useEffect(() => {
    const handleStarted = () => {
      console.log('Trading engine started');
    };

    const handleStopped = () => {
      console.log('Trading engine stopped');
    };

    const handleTradeExecuted = (data: any) => {
      console.log('Trade executed:', data);
    };

    engine.on('started', handleStarted);
    engine.on('stopped', handleStopped);
    engine.on('tradeExecuted', handleTradeExecuted);

    return () => {
      engine.off('started', handleStarted);
      engine.off('stopped', handleStopped);
      engine.off('tradeExecuted', handleTradeExecuted);
    };
  }, [engine]);

  // Initialize trading engine
  const initialize = useCallback(async (config: TradingConfig) => {
    setIsLoading(true);
    setError(null);

    try {
      const success = await engine.initialize(config);
      setIsInitialized(success);
      
      if (!success) {
        setError('Failed to initialize trading engine');
      }
      
      return success;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [engine]);

  // Start trading engine
  const start = useCallback(async () => {
    if (!isInitialized) {
      setError('Trading engine not initialized');
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      const success = await engine.start();
      if (!success) {
        setError('Failed to start trading engine');
      }
      return success;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [engine, isInitialized]);

  // Stop trading engine
  const stop = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      await engine.stop();
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [engine]);

  // Execute manual trade
  const executeManualTrade = useCallback(async (params: {
    symbol: string;
    side: 'buy' | 'sell';
    type: 'market' | 'limit';
    amount: number;
    amountUnit?: 'usdt' | 'coin';
    price?: number;
    leverage?: number;
    marginMode?: 'cross' | 'isolated';
    takeProfit?: number;
    stopLoss?: number;
    useDelayedTPSL?: boolean;
    takeProfitPercent?: number;
    stopLossPercent?: number;
    enableTrailingTP?: boolean;
    enableTrailingSL?: boolean;
    trailingDistance?: number;
  }) => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await engine.executeManualTrade(params);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [engine]);

  // Close position
  const closePosition = useCallback(async (positionId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      await engine.closePosition(positionId);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [engine]);

  // Emergency stop
  const emergencyStop = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      await engine.emergencyStop();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [engine]);

  // Get performance summary
  const getPerformanceSummary = useCallback(() => {
    return engine.getPerformanceSummary();
  }, [engine]);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Refresh data
  const refreshData = useCallback(async () => {
    if (!isInitialized || !state.config) return;

    setIsLoading(true);
    setError(null);

    try {
      // Refresh market data
      if (state.config) {
        await engine.refreshMarketData(state.config.symbol);
      }
      
      // Refresh balance
      await engine.refreshBalance();
      
      // Refresh candles
      if (state.config) {
        await engine.refreshCandles(
          state.config.symbol,
          state.config.timeframe,
          100
        );
      }
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [engine, isInitialized, state.config]);

  return {
    // Engine instance
    tradingEngine: engine,
    
    // State
    state,
    isInitialized,
    isLoading,
    error,
    
    // Actions
    initialize,
    start,
    stop,
    executeManualTrade,
    closePosition,
    emergencyStop,
    getPerformanceSummary,
    clearError,
    refreshData,
    
    // Symbol and timeframe management
    changeTimeframe: useCallback(async (newTimeframe: string) => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await engine.changeTimeframe(newTimeframe);
        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    }, [engine]),
    
    changeSymbol: useCallback(async (newSymbol: string) => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await engine.changeSymbol(newSymbol);
        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    }, [engine]),
    
    // Derived state
    isConnected: state.isConnected,
    isRunning: state.isRunning,
    balance: state.balance,
    equity: state.equity,
    positions: state.positions,
    positionLogs: state.positionLogs,
    openPositions: state.positions.filter(p => p.status === 'open'), // Filter only open positions
    closedPositions: state.positions.filter(p => p.status === 'closed'), // Filter only closed positions
    currentSignal: state.currentSignal,
    marketData: state.marketData,
    performance: state.performance,
    logs: state.logs,
    candles: state.candles,
    lastUpdate: state.lastUpdate,
    
    // Performance summary
    performanceSummary: getPerformanceSummary(),
    
    // Config
    config: state.config,
    
    // WebSocket manager
    getWebSocketManager: () => engine.getWebSocketManager()
  };
}

export type UseTradingEngineReturn = ReturnType<typeof useTradingEngine>;