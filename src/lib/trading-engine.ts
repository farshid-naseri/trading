import { useCoinExAPI } from './coinex-api';
import { WebSocketManager } from './websocket-manager';
import { COINEX_TIMEFRAMES, mapUITimeframeToCoinEx } from './coinex-timeframes';
import { logger, logTradingError, logWebSocketEvent } from './logging';

export interface TradingConfig {
  apiKey: string;
  apiSecret: string;
  symbol: string;
  timeframe: string;
  atrPeriod: number;
  multiplier: number;
  profitPercent: number;
  lossPercent: number;
  trailPercent: number;
  amountUsdt: number;
  leverage: number;
  marginMode: 'cross' | 'isolated';
  useAI: boolean;
  autoTrade: boolean;
}

export interface Position {
  id: string;
  symbol: string;
  type: 'buy' | 'sell';
  entryPrice: number;
  currentPrice?: number;
  exitPrice?: number;
  entryTime: Date;
  exitTime?: Date;
  size: number;
  pnl?: number;
  pnlPercent?: number;
  status: 'open' | 'closed';
  takeProfit?: number;
  stopLoss?: number;
  trailingStop?: number;
  leverage: number;
  marginMode: string;
  unrealizedPnl?: number;
  realizedPnl?: number;
}

export interface PositionLogEntry {
  id: string;
  positionId: string;
  timestamp: Date;
  type: 'opened' | 'updated' | 'price_update' | 'tp_sl_update' | 'trailing_update' | 'closed' | 'error';
  message: string;
  data?: any;
}

export interface TradingEngineState {
  isRunning: boolean;
  isConnected: boolean;
  config: TradingConfig | null;
  candles: any[];
  positions: Position[];
  positionLogs: PositionLogEntry[];
  balance: number;
  equity: number;
  // Add current price for real-time PnL calculations
  currentPrice: number; // Add current price for real-time PnL calculations
  // Add price source tracking
  priceSource: string;
  lastPriceUpdate: Date;
  currentSignal: any | null;
  marketData: any;
  performance: {
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    winRate: number;
    profitFactor: number;
    maxDrawdown: number;
    totalReturn: number;
    sharpeRatio: number;
  };
  logs: string[];
  activePositions: any[]; // Add active positions from WebSocket
  lastUpdate: Date | null;
}

export class TradingEngine {
  private wsManager: WebSocketManager | null = null;
  private static globalWsManager: WebSocketManager | null = null; // Singleton WebSocket manager
  private static globalHandlersSetup = false; // Flag to prevent multiple handler setups
  private updateInterval: NodeJS.Timeout | null = null;
  private coinexAPI: any = null;
  private trailingMonitors: Map<string, any> | null = null; // Track active trailing monitors
  private priceUpdateHandlers: Map<string, ((price: number) => Promise<void>)[]> | null = null; // Price update subscriptions
  private state: TradingEngineState = {
    isRunning: false,
    isConnected: false,
    config: null,
    candles: [],
    positions: [],
    positionLogs: [],
    balance: 0,
    equity: 0,
    currentPrice: 0, // Initialize current price for real-time PnL calculations
    priceSource: 'none',
    lastPriceUpdate: new Date(),
    currentSignal: null,
    marketData: null,
    performance: {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      profitFactor: 0,
      maxDrawdown: 0,
      totalReturn: 0,
      sharpeRatio: 0
    },
    logs: [],
    activePositions: [], // Initialize active positions array
    lastUpdate: null
  };

  private subscribers: Map<string, ((data?: any) => void)[]> = new Map();

  constructor() {
    this.initializeEventHandlers();
  }

  // Helper method to get API instances
  private async getCoinExAPI() {
    // Always get the latest state
    const { useCoinExAPI } = await import('./coinex-api');
    return useCoinExAPI.getState();
  }

  private initializeEventHandlers() {
    // Set up WebSocket state subscription for market status
    if (this.wsManager) {
      this.wsManager.on('stateUpdate', (stateList: any[]) => {
        if (stateList && stateList.length > 0) {
          // Process state data for market status
          const relevantState = stateList.find((state: any) => 
            state.market === this.state.config?.symbol
          );
          
          if (relevantState) {
            // Update market data in state
            this.updateState({
              marketData: {
                ...this.state.marketData,
                last: relevantState.last,
                open: relevantState.open,
                close: relevantState.close,
                high: relevantState.high,
                low: relevantState.low,
                volume: relevantState.volume,
                value: relevantState.value,
                mark_price: relevantState.mark_price,
                index_price: relevantState.index_price,
                change24h: ((parseFloat(relevantState.close) - parseFloat(relevantState.open)) / parseFloat(relevantState.open)) * 100,
                volume24h: relevantState.volume,
                high24h: relevantState.high,
                low24h: relevantState.low
              }
            });
            
            logger.log(`📊 Market state updated for ${relevantState.market}`, 'TradingEngine');
          }
        }
      });
      
      logger.log('✅ State subscription implemented and active', 'TradingEngine');
    } else {
      logger.warn('WebSocket manager not available for state subscription', 'TradingEngine');
    }
  }

  private mapApiPositionsToEnginePositions(apiPositions: any[]): Position[] {
    return apiPositions.map(pos => ({
      id: pos.position_id?.toString() || pos.id?.toString() || `${pos.market}_${Date.now()}`,
      symbol: pos.market,
      type: pos.side === 'long' ? 'buy' : pos.side === 'short' ? 'sell' : pos.side,
      entryPrice: parseFloat(pos.avg_entry_price || 0),
      currentPrice: parseFloat(pos.settle_price || pos.last_price || pos.avg_entry_price || 0),
      entryTime: new Date(parseInt(pos.created_at || Date.now())),
      size: parseFloat(pos.ath_position_amount || pos.amount_usdt || pos.position_value || 0),
      pnl: parseFloat(pos.unrealized_pnl || 0),
      pnlPercent: pos.unrealized_pnl && pos.ath_position_amount ? (parseFloat(pos.unrealized_pnl) / parseFloat(pos.ath_position_amount)) * 100 : 0,
      status: 'open',
      takeProfit: pos.take_profit_price ? parseFloat(pos.take_profit_price) : undefined,
      stopLoss: pos.stop_loss_price ? parseFloat(pos.stop_loss_price) : undefined,
      leverage: parseFloat(pos.leverage || 1),
      marginMode: pos.margin_mode || 'cross',
      unrealizedPnl: parseFloat(pos.unrealized_pnl || 0),
      realizedPnl: parseFloat(pos.realized_pnl || 0)
    }));
  }

  // Event subscription system
  on(event: string, handler: (data?: any) => void) {
    if (!this.subscribers.has(event)) {
      this.subscribers.set(event, []);
    }
    this.subscribers.get(event)!.push(handler);
  }

  off(event: string, handler: (data?: any) => void) {
    const handlers = this.subscribers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  private emit(event: string, data?: any) {
    const handlers = this.subscribers.get(event);
    if (handlers) {
      handlers.forEach(handler => handler(data));
    }
  }

  private updateState(updates: Partial<TradingEngineState>) {
    this.state = { ...this.state, ...updates };
    this.emit('stateChanged', this.state);
  }

  // به‌روزرسانی خودکار و مداوم حد سود و حد ضرر متحرک بر اساس قیمت لحظه‌ای
  private startAutoTrailingMonitor() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    
    this.addLog(`🚀 Starting auto trailing monitor for all positions...`);
    
    // بررسی و به‌روزرسانی هر 5 ثانیه
    this.updateInterval = setInterval(async () => {
      try {
        if (this.state.currentPrice > 0 && this.state.positions.length > 0) {
          const openPositions = this.state.positions.filter(p => p.status === 'open');
          
          for (const position of openPositions) {
            // به‌روزرسانی حد ضرر متحرک
            if (position.stopLoss && position.trailingStop) {
              await this.updateAutoTrailingStop(position);
            }
            
            // به‌روزرسانی حد سود متحرک
            if (position.takeProfit && position.trailingTakeProfit) {
              await this.updateAutoTrailingTakeProfit(position);
            }
          }
        }
      } catch (error) {
        this.addLog(`⚠️ Error in auto trailing monitor: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }, 5000); // هر 5 ثانیه
  }
  
  // به‌روزرسانی خودکار حد ضرر متحرک برای یک پوزیشن خاص
  private async updateAutoTrailingStop(position: any) {
    try {
      const coinexAPI = await this.getCoinExAPI();
      const currentPrice = this.state.currentPrice;
      
      if (currentPrice <= 0) return;
      
      // محاسبه حد ضرر متحرک جدید
      const newStopLossPrice = this.calculateTrailingStopPrice(
        currentPrice,
        position.entryPrice,
        position.trailingStop,
        position.type
      );
      
      // دریافت اطلاعات فعلی پوزیشن از داده‌های WebSocket
      const currentPosition = this.state.activePositions.find(p => p.market === position.market);
      if (currentPosition) {
        const currentStopLoss = parseFloat(currentPosition.stop_loss_price || '0');
        
        // فقط در صورت بهبود شرایط، به‌روزرسانی کن
        const shouldUpdate = (
          (position.type === 'buy' && newStopLossPrice > currentStopLoss) || 
          (position.type === 'sell' && newStopLossPrice < currentStopLoss)
        );
        
        if (shouldUpdate) {
          await coinexAPI.setStopLoss(position.market, newStopLossPrice);
          this.addLog(`🔄 Auto-trailing stop updated for ${position.market}: ${currentStopLoss} → ${newStopLossPrice} (Price: ${currentPrice})`);
          
          // ثبت لاگ به‌روزرسانی
          this.logPositionTrailingUpdate(position, 'stop_loss', newStopLossPrice);
        }
      }
    } catch (error) {
      this.addLog(`⚠️ Error updating auto trailing stop for ${position.market}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  // به‌روزرسانی خودکار حد سود متحرک برای یک پوزیشن خاص
  private async updateAutoTrailingTakeProfit(position: any) {
    try {
      const coinexAPI = await this.getCoinExAPI();
      const currentPrice = this.state.currentPrice;
      
      if (currentPrice <= 0) return;
      
      // محاسبه حد سود متحرک جدید
      const newTakeProfitPrice = this.calculateTrailingTakeProfitPrice(
        currentPrice,
        position.entryPrice,
        position.trailingTakeProfit,
        position.type
      );
      
      // دریافت اطلاعات فعلی پوزیشن از داده‌های WebSocket
      const currentPosition = this.state.activePositions.find(p => p.market === position.market);
      if (currentPosition) {
        const currentTakeProfit = parseFloat(currentPosition.take_profit_price || '0');
        
        // فقط در صورت بهبود شرایط، به‌روزرسانی کن
        const shouldUpdate = (
          (position.type === 'buy' && newTakeProfitPrice < currentTakeProfit) || 
          (position.type === 'sell' && newTakeProfitPrice > currentTakeProfit)
        );
        
        if (shouldUpdate) {
          await coinexAPI.setTakeProfit(position.market, newTakeProfitPrice);
          this.addLog(`🔄 Auto-trailing take profit updated for ${position.market}: ${currentTakeProfit} → ${newTakeProfitPrice} (Price: ${currentPrice})`);
          
          // ثبت لاگ به‌روزرسانی
          this.logPositionTrailingUpdate(position, 'take_profit', newTakeProfitPrice);
        }
      }
    } catch (error) {
      this.addLog(`⚠️ Error updating auto trailing take profit for ${position.market}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // به‌روزرسانی خودکار حد سود و حد ضرر متحرک بر اساس قیمت لحظه‌ای
  private async updateTrailingStopsForSymbol(symbol: string, currentPrice: number) {
    try {
      const positions = this.state.positions.filter(p => p.market === symbol && p.status === 'open');
      
      if (positions.length === 0) {
        return;
      }
      
      const coinexAPI = await this.getCoinExAPI();
      
      for (const position of positions) {
        // به‌روزرسانی حد ضرر متحرک اگر فعال است
        if (position.stopLoss && position.trailingStop) {
          try {
            const newStopLossPrice = this.calculateTrailingStopPrice(
              currentPrice, 
              position.entryPrice, 
              position.trailingStop, 
              position.type
            );
            
            // دریافت اطلاعات فعلی پوزیشن از داده‌های WebSocket
            const currentPosition = this.state.activePositions.find(p => p.market === symbol);
            if (currentPosition) {
              const currentStopLoss = parseFloat(currentPosition.stop_loss_price || '0');
              
              // فقط در صورت بهبود شرایط، به‌روزرسانی کن
              const shouldUpdate = (
                (position.type === 'buy' && newStopLossPrice > currentStopLoss) || 
                (position.type === 'sell' && newStopLossPrice < currentStopLoss)
              );
              
              if (shouldUpdate) {
                await coinexAPI.setStopLoss(symbol, newStopLossPrice);
                this.addLog(`🔄 Auto-updated trailing stop for ${symbol}: ${currentStopLoss} → ${newStopLossPrice} (Price: ${currentPrice})`);
                
                // ثبت لاگ به‌روزرسانی
                this.logPositionTrailingUpdate(position, 'stop_loss', newStopLossPrice);
              }
            }
          } catch (error) {
            this.addLog(`⚠️ Error updating trailing stop: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }
        
        // به‌روزرسانی حد سود متحرک اگر فعال است
        if (position.takeProfit && position.trailingTakeProfit) {
          try {
            const newTakeProfitPrice = this.calculateTrailingTakeProfitPrice(
              currentPrice, 
              position.entryPrice, 
              position.trailingTakeProfit, 
              position.type
            );
            
            // دریافت اطلاعات فعلی پوزیشن از داده‌های WebSocket
            const currentPosition = this.state.activePositions.find(p => p.market === symbol);
            if (currentPosition) {
              const currentTakeProfit = parseFloat(currentPosition.take_profit_price || '0');
              
              // فقط در صورت بهبود شرایط، به‌روزرسانی کن
              const shouldUpdate = (
                (position.type === 'buy' && newTakeProfitPrice < currentTakeProfit) || 
                (position.type === 'sell' && newTakeProfitPrice > currentTakeProfit)
              );
              
              if (shouldUpdate) {
                await coinexAPI.setTakeProfit(symbol, newTakeProfitPrice);
                this.addLog(`🔄 Auto-updated trailing take profit for ${symbol}: ${currentTakeProfit} → ${newTakeProfitPrice} (Price: ${currentPrice})`);
                
                // ثبت لاگ به‌روزرسانی
                this.logPositionTrailingUpdate(position, 'take_profit', newTakeProfitPrice);
              }
            }
          } catch (error) {
            this.addLog(`⚠️ Error updating trailing take profit: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }
      }
    } catch (error) {
      this.addLog(`❌ Error in updateTrailingStopsForSymbol: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // به‌روزرسانی قیمت و محاسبه خودکار حد سود و حد ضرر متحرک
  private updatePriceAndTrailingStops(price: number, source: string, symbol?: string) {
    if (price <= 0) {
      this.addLog(`⚠️ Invalid price update from ${source}: ${price}`);
      return;
    }

    const oldPrice = this.state.currentPrice;
    const oldSource = this.state.priceSource;
    
    // Only update if price changed significantly (more than 0.01% change)
    const priceChangePercent = Math.abs((price - oldPrice) / oldPrice) * 100;
    const shouldUpdate = oldPrice === 0 || priceChangePercent > 0.01;
    
    if (shouldUpdate) {
      this.updateState({
        currentPrice: price,
        priceSource: source,
        lastPriceUpdate: new Date()
      });
      
      this.addLog(`💰 Price updated from ${source}: ${price} (was: ${oldPrice}, change: ${priceChangePercent.toFixed(4)}%)`);
      
      // Update all positions with the new price
      this.updatePositionsPrice(price);
      
      // Also update equity calculation
      this.updateEquity();
      
      // Auto-update trailing stops for the symbol
      if (symbol) {
        this.updateTrailingStopsForSymbol(symbol, price).catch(error => {
          this.addLog(`❌ Error updating trailing stops: ${error}`);
        });
      }
      
      // Dispatch price update to trailing monitors
      if (symbol) {
        this.dispatchPriceUpdate(symbol, price).catch(error => {
          this.addLog(`❌ Error dispatching price update: ${error}`);
        });
      }
    }
  }

  // Unified price update method - now uses the enhanced version
  private updatePrice(price: number, source: string, symbol?: string) {
    this.updatePriceAndTrailingStops(price, source, symbol);
  }

  private addLog(message: string) {
    logger.info(message, 'TradingEngine');
    const timestamp = new Date().toLocaleTimeString();
    const logMessage = `[${timestamp}] ${message}`;
    this.updateState({
      logs: [...this.state.logs, logMessage]
    });
  }

  // Position logging methods
  private addPositionLog(positionId: string, type: PositionLogEntry['type'], message: string, data?: any) {
    console.log(`[DEBUG] Adding position log: ${positionId}, ${type}, ${message}`);
    const logEntry: PositionLogEntry = {
      id: Math.random().toString(36).substr(2, 9),
      positionId,
      timestamp: new Date(),
      type,
      message,
      data
    };
    
    this.updateState({
      positionLogs: [...this.state.positionLogs, logEntry]
    });
    
    // Also add to main logs for visibility
    this.addLog(`📍 [${positionId}] ${message}`);
  }

  private logPositionOpened(position: any) {
    // Extract position information safely
    const positionType = position.type || position.side || 'unknown';
    const positionSymbol = position.symbol || position.market || 'unknown';
    const entryPrice = position.entryPrice || position.avg_entry_price || 'unknown';
    
    this.addPositionLog(position.id, 'opened', `Position opened: ${positionType} ${positionSymbol} at ${entryPrice}`, {
      position: {
        id: position.id,
        symbol: positionSymbol,
        type: positionType,
        entryPrice: entryPrice,
        size: position.size || position.ath_position_amount || 0,
        leverage: position.leverage || 1,
        marginMode: position.marginMode || position.margin_mode || 'cross',
        takeProfit: position.takeProfit || position.take_profit_price,
        stopLoss: position.stopLoss || position.stop_loss_price
      }
    });
  }

  private logPositionUpdated(position: any, updateType: string, data?: any) {
    this.addPositionLog(position.id, 'updated', `Position ${updateType}`, {
      position: {
        id: position.id,
        currentPrice: position.currentPrice || position.settle_price || 0,
        unrealizedPnl: position.unrealizedPnl || position.unrealized_pnl || 0,
        realizedPnl: position.realizedPnl || position.realized_pnl || 0
      },
      updateData: data
    });
  }

  private logPositionPriceUpdate(position: any, oldPrice: number | undefined, newPrice: number) {
    this.addPositionLog(position.id, 'price_update', `Price update: ${oldPrice} → ${newPrice}`, {
      oldPrice,
      newPrice,
      unrealizedPnl: position.unrealizedPnl || position.unrealized_pnl || 0
    });
  }

  private logPositionTPSLUpdate(position: any, tpType: 'take_profit' | 'stop_loss', oldValue: number | undefined, newValue: number) {
    this.addPositionLog(position.id, 'tp_sl_update', `${tpType} updated: ${oldValue} → ${newValue}`, {
      tpType,
      oldValue,
      newValue
    });
  }

  private logPositionTrailingUpdate(position: any, trailingType: string, value: number) {
    this.addPositionLog(position.id, 'trailing_update', `Trailing ${trailingType} updated: ${value}`, {
      trailingType,
      value,
      currentPrice: position.currentPrice || position.settle_price || 0
    });
  }

  private logPositionClosed(position: any, reason: string = 'manual') {
    // Extract position information safely
    const positionType = position.type || position.side || 'unknown';
    const positionSymbol = position.symbol || position.market || 'unknown';
    const entryPrice = position.entryPrice || position.avg_entry_price || 'unknown';
    const exitPrice = position.exitPrice || position.settle_price || 'unknown';
    
    this.addPositionLog(position.id, 'closed', `Position closed (${reason}): ${positionType} ${positionSymbol} at ${exitPrice}`, {
      position: {
        id: position.id,
        symbol: positionSymbol,
        type: positionType,
        entryPrice: entryPrice,
        exitPrice: exitPrice,
        pnl: position.pnl || position.realized_pnl || 0,
        pnlPercent: position.pnlPercent || 0,
        realizedPnl: position.realizedPnl || position.realized_pnl || 0,
        duration: position.exitTime && position.entryTime ? 
          Math.round((position.exitTime.getTime() - position.entryTime.getTime()) / 1000) : undefined
      },
      reason
    });
  }

  private logPositionError(positionId: string, error: string, data?: any) {
    this.addPositionLog(positionId, 'error', `Position error: ${error}`, data);
  }

  // Initialize trading engine
  async initialize(config: TradingConfig): Promise<boolean> {
    try {
      this.addLog('🚀 Initializing trading engine...');
      
      this.updateState({
        config,
        isRunning: false,
        isConnected: false
      });

      // Validate configuration
      if (!config.apiKey || !config.apiSecret) {
        this.addLog('❌ API Key and API Secret are required');
        return false;
      }

      if (!config.symbol) {
        this.addLog('❌ Trading symbol is required');
        return false;
      }

      if (config.amountUsdt <= 0) {
        this.addLog('❌ Amount USDT must be greater than 0');
        return false;
      }

      // Set up CoinEx API directly using the store
      try {
        // Dynamically import the CoinExAPI store
        const { useCoinExAPI } = await import('./coinex-api');
        
        // Configure the API
        useCoinExAPI.getState().setConfig({
          apiKey: config.apiKey,
          apiSecret: config.apiSecret,
          baseUrl: 'https://api.coinex.com',
          futuresBaseUrl: 'https://api.coinex.com',
          useProxy: true
        });

        // Test connection
        this.addLog('🔄 Testing connection to CoinEx API...');
        const connected = await useCoinExAPI.getState().testConnection();
        
        if (!connected) {
          this.addLog('❌ Failed to connect to CoinEx API');
          return false;
        }

        this.updateState({ isConnected: true });
        this.addLog('✅ Connected to CoinEx API');

        // Initialize the coinexAPI reference
        this.coinexAPI = useCoinExAPI.getState();

      } catch (error) {
        this.addLog(`❌ Error setting up CoinEx API: ${error}`);
        return false;
      }

      // Initialize WebSocket for real-time data
      await this.initializeWebSocket();

      // Fetch initial data
      await this.fetchInitialData();

      this.addLog('✅ Trading engine initialized successfully');
      return true;
    } catch (error) {
      this.addLog(`❌ Error initializing trading engine: ${error}`);
      return false;
    }
  }

  private async testConnection(): Promise<boolean> {
    try {
      const coinexAPI = await this.getCoinExAPI();
      
      // Try to test the connection by fetching balance
      logger.info('Testing API connection...', 'TradingEngine');
      
      // Test the connection using the CoinExAPI testConnection method
      const connected = await coinexAPI.testConnection();
      
      if (connected) {
        logger.info('API connection test successful', 'TradingEngine');
        return true;
      } else {
        logger.warn('API connection test failed', 'TradingEngine');
        return false;
      }
      
    } catch (error) {
      logTradingError(error, 'TradingEngine', 'testConnection');
      return false;
    }
  }

  private async initializeWebSocket() {
    if (!this.state.config) return;

    // Use singleton WebSocket manager
    if (!TradingEngine.globalWsManager) {
      const wsUrl = 'wss://socket.coinex.com/v2/futures';
      this.addLog(`🔄 Creating global WebSocket connection: ${wsUrl}`);
      
      // Get API credentials from config
      const apiKey = this.state.config?.apiKey;
      const apiSecret = this.state.config?.apiSecret;
      
      TradingEngine.globalWsManager = new WebSocketManager(wsUrl, apiKey, apiSecret);
      
      // Add error handler for the global manager
      TradingEngine.globalWsManager.on('error', (error) => {
        this.addLog('❌ Global WebSocket error');
      });
      
      TradingEngine.globalWsManager.on('close', () => {
        this.addLog('🔌 Global WebSocket disconnected');
      });
      
      // Add authentication handler
      TradingEngine.globalWsManager.on('authenticated', () => {
        this.addLog('✅ WebSocket authentication successful');
      });
      
      TradingEngine.globalWsManager.on('authentication_failed', (error) => {
        this.addLog(`❌ WebSocket authentication failed: ${error.message || 'Unknown error'}`);
      });
      
      // Connect with a delay to ensure proper initialization
      setTimeout(() => {
        if (TradingEngine.globalWsManager) {
          TradingEngine.globalWsManager.connect();
        }
      }, 1000);
    } else {
      this.addLog('🔌 Using existing global WebSocket connection');
      
      // Update API credentials if they changed
      if (this.state.config?.apiKey && this.state.config?.apiSecret) {
        TradingEngine.globalWsManager.setApiCredentials(
          this.state.config.apiKey,
          this.state.config.apiSecret
        );
      }
      
      // Check if the existing connection is still alive
      if (!TradingEngine.globalWsManager.connected) {
        this.addLog('🔄 Existing connection is not active, reconnecting...');
        TradingEngine.globalWsManager.forceReconnect();
      }
    }

    this.wsManager = TradingEngine.globalWsManager;

    // Set up handlers only once globally
    if (!TradingEngine.globalHandlersSetup) {
      // Add a small delay to ensure the WebSocket is ready
      setTimeout(() => {
        this.setupWebSocketHandlers();
        TradingEngine.globalHandlersSetup = true;
      }, 2000);
    }
  }

  private setupWebSocketHandlers() {
    if (!this.wsManager) return;

    this.wsManager.on('open', () => {
      logWebSocketEvent('open', undefined, 'TradingEngine');
      
      // Authenticate WebSocket first before subscribing to any data
      this.addLog('🔐 Authenticating WebSocket connection...');
      
      // Authenticate with a small delay to ensure connection is stable
      setTimeout(async () => {
        if (this.wsManager?.connected) {
          const authResult = await this.wsManager.authenticate();
          if (authResult) {
            this.addLog('✅ WebSocket authentication initiated');
          } else {
            this.addLog('❌ WebSocket authentication failed');
          }
        }
      }, 500);
      
      // By default, do not subscribe to any data streams automatically
      // User must manually enable subscriptions through the UI
      const symbol = this.state.config!.symbol;
      const timeframe = mapUITimeframeToCoinEx(this.state.config!.timeframe);
      
      this.addLog(`🔌 WebSocket connected for ${symbol} (${timeframe})`);
      this.addLog(`ℹ️ No automatic subscriptions - please enable data streams manually`);
      
      // Only set up the connection without automatic subscriptions
      setTimeout(async () => {
        this.addLog(`🚀 WebSocket connection established for ${symbol}`);
        // Just ensure the connection is stable but don't subscribe automatically
        if (this.wsManager) {
          this.addLog(`✅ WebSocket ready for manual subscriptions`);
        }
      }, 2000);
      
      // Start a periodic check for current price updates (but only if user subscribes)
      // this.startPriceCheckInterval(); // Commented out - will be started when user subscribes
    });

    this.wsManager.on('message', (message: any) => {
      try {
        // Emit the raw WebSocket message for monitoring
        this.emit('websocketMessage', message);
        
        // Log all message types for debugging
        if (message.method) {
          this.addLog(`📨 WebSocket message: ${message.method}`);
        }
        
        // Handle different types of WebSocket messages
        if (message.method === 'depth.update' && message.data?.depth) {
          // Ignore depth.update messages to reduce memory usage
          // These messages contain order book data that changes frequently and consumes a lot of memory
          // Skip logging these messages to reduce memory usage even further
          return;
        } else if (message.method === 'kline.update' && message.data?.kline) {
          this.addLog(`🕯️ Processing kline update...`);
          this.processKlineData(message.data.kline);
        } else if (message.method === 'deals.update' && message.data?.deals) {
          this.addLog(`💰 Processing trades update...`);
          this.processTradesData(message.data.deals);
        } else if (message.method === 'market.update' && message.data?.market) {
          this.addLog(`📈 Processing market update...`);
          this.processMarketData(message.data.market);
        } else if (message.method === 'market_ticker.update' && message.data?.ticker) {
          this.addLog(`📈 Processing market ticker update...`);
          this.processMarketTickerData(message.data.ticker);
        } else if (message.method === 'position.update' && message.data?.position) {
          this.addLog(`🎯 Processing position update...`);
          this.processPositionData(message.data.position);
        } else if (message.method === 'state.update' && message.data?.state_list) {
          this.addLog(`📊 Processing market state update...`);
          this.processStateData(message.data.state_list);
        } else {
          // لاگ فقط پیام‌های مهم (غیر از depth)
          if (message.method && !message.method.startsWith('depth.')) {
            this.addLog(`📨 WebSocket message: ${message.method}`);
            if (message.data) {
              this.addLog(`📨 Message data: ${JSON.stringify(message.data).substring(0, 200)}...`);
            }
          }
        }
      } catch (error) {
        logTradingError(error, 'TradingEngine', 'processWebSocketMessage');
      }
    });

    this.wsManager.on('close', () => {
      logWebSocketEvent('close', undefined, 'TradingEngine');
      this.addLog('🔌 WebSocket disconnected');
    });

    this.wsManager.on('error', (error) => {
      logTradingError(error, 'TradingEngine', 'WebSocket');
      this.addLog('❌ WebSocket error');
    });
  }

  private processKlineData(klineData: any) {
    try {
      // Parse kline data from CoinEx WebSocket
      const kline = klineData;
      
      // Convert to our CandleData format
      const candle: CandleData = {
        timestamp: parseInt(kline[0]) * 1000, // Convert to milliseconds
        open: parseFloat(kline[1]),
        high: parseFloat(kline[2]),
        low: parseFloat(kline[3]),
        close: parseFloat(kline[4]),
        volume: parseFloat(kline[5])
      };

      // Use close price as current price for real-time PnL calculations
      const closePrice = candle.close;
      if (closePrice > 0) {
        this.addLog(`🕯️ Kline update: ${closePrice} (previous: ${this.state.currentPrice || 0})`);
        
        // Update current price using unified method
        this.updatePrice(closePrice, 'kline', klineData.market);
        
        // Also update equity calculation
        this.updateEquity();
      }

      // Update candles array
      const existingCandleIndex = this.state.candles.findIndex(c => c.timestamp === candle.timestamp);
      
      if (existingCandleIndex >= 0) {
        // Update existing candle (real-time update)
        const updatedCandles = [...this.state.candles];
        updatedCandles[existingCandleIndex] = candle;
        this.updateState({ candles: updatedCandles });
      } else {
        // Add new candle
        const updatedCandles = [...this.state.candles, candle].sort((a, b) => a.timestamp - b.timestamp);
        
        // Keep only last 1000 candles
        if (updatedCandles.length > 1000) {
          updatedCandles.splice(0, updatedCandles.length - 1000);
        }
        
        this.updateState({ candles: updatedCandles });
      }

      // Emit real-time candle update event
      this.emit('candleUpdate', candle);

    } catch (error) {
      logTradingError(error, 'TradingEngine', 'processKlineData');
    }
  }

  private processTradesData(tradesData: any) {
    try {
      // Process trades data
      const trades = Array.isArray(tradesData) ? tradesData : [tradesData];
      
      this.addLog(`💰 Processing ${trades.length} trade(s)...`);
      
      trades.forEach((trade, index) => {
        const tradeInfo = {
          timestamp: parseInt(trade[0]) * 1000,
          price: parseFloat(trade[1]),
          amount: parseFloat(trade[2]),
          side: trade[3] // 'buy' or 'sell'
        };

        this.addLog(`💰 Trade ${index + 1}: ${tradeInfo.side} ${tradeInfo.amount} @ ${tradeInfo.price}`);

        // Emit trade update event
        this.emit('tradeUpdate', tradeInfo);
      });

    } catch (error) {
      logTradingError(error, 'TradingEngine', 'processTradesData');
    }
  }

  private processMarketData(marketData: any) {
    try {
      // Process market overview data
      const lastPrice = parseFloat(marketData.last || 0);
      const symbol = marketData.market;
      
      this.addLog(`📈 Market data received: ${symbol}=${lastPrice}, volume=${marketData.volume || 'N/A'}`);
      
      if (lastPrice > 0) {
        this.addLog(`📈 Market data update: ${symbol} ${lastPrice} (previous: ${this.state.currentPrice || 0})`);
        
        // Update current price using unified method
        this.updatePrice(lastPrice, 'market_data', symbol);
        
        // Also update equity calculation
        this.updateEquity();
        
        // Dispatch price update to trailing monitors
        if (symbol) {
          this.dispatchPriceUpdate(symbol, lastPrice).catch(error => {
            this.addLog(`❌ Error dispatching price update: ${error}`);
          });
        }
      }
      
      const market = {
        symbol: marketData.market,
        lastPrice: lastPrice,
        bid: parseFloat(marketData.buy),
        ask: parseFloat(marketData.sell),
        high24h: parseFloat(marketData.high),
        low24h: parseFloat(marketData.low),
        volume24h: parseFloat(marketData.volume),
        change24h: parseFloat(marketData.change),
        changePercent24h: parseFloat(marketData.change_percent)
      };

      // Update market data state
      this.updateState({ marketData });

      // Emit market data update event
      this.emit('marketUpdate', market);

    } catch (error) {
      logTradingError(error, 'TradingEngine', 'processMarketData');
    }
  }

  private processDepthData(depthData: any) {
    try {
      const bidPrice = parseFloat(depthData.bids?.[0]?.[0] || 0);
      const askPrice = parseFloat(depthData.asks?.[0]?.[0] || 0);
      const midPrice = (bidPrice + askPrice) / 2;

      // Update current price in state for real-time PnL calculations
      this.updateState({
        currentPrice: midPrice
      });

      // Update market data
      if (this.state.marketData) {
        this.updateState({
          marketData: {
            ...this.state.marketData,
            price: midPrice,
            bid: bidPrice,
            ask: askPrice
          }
        });
      }

      // Update current positions with latest price
      this.updatePositionsPrice(midPrice);

      // Emit order book update event
      this.emit('depthUpdate', {
        bids: depthData.bids,
        asks: depthData.asks,
        midPrice
      });

    } catch (error) {
      logTradingError(error, 'TradingEngine', 'processDepthData');
    }
  }

  private processMarketTickerData(tickerData: any) {
    try {
      // Extract the mark price from ticker data
      const markPrice = parseFloat(tickerData.last || tickerData.close || tickerData.price || 0);
      
      this.addLog(`📈 Market ticker received: last=${tickerData.last || 'N/A'}, close=${tickerData.close || 'N/A'}, price=${tickerData.price || 'N/A'}`);
      
      if (markPrice > 0) {
        this.addLog(`📈 Market ticker update: ${markPrice} (previous: ${this.state.currentPrice || 0})`);
        
        // Update current price using unified method
        this.updatePrice(markPrice, 'market_ticker', symbol);
        
        // Also update equity calculation
        this.updateEquity();
        
      } else {
        this.addLog(`⚠️ Invalid market ticker data: ${JSON.stringify(tickerData)}`);
      }
    } catch (error) {
      logTradingError(error, 'TradingEngine', 'processMarketTickerData');
    }
  }

  private processPositionData(positionData: any) {
    try {
      this.addLog(`📊 Received position update: ${JSON.stringify(positionData)}`);
      
      // According to CoinEx documentation, position data comes in position.update message
      // with position object containing detailed information
      const position = positionData; // The position data is already the position object
      
      // Get current market price from state (updated by market ticker)
      const currentPrice = this.state.currentPrice || 0;
      
      this.addLog(`🔍 Debug - Current price from state: ${currentPrice}, Position market: ${position.market}`);
      
      // Only get realized PnL from exchange (this updates when position is modified/closed)
      const realizedPnl = parseFloat(position.realized_pnl || 0);
      
      const positionAmount = parseFloat(position.open_interest || position.ath_position_amount || 0);
      const entryPrice = parseFloat(position.avg_entry_price || position.first_filled_price || 0);
      
      this.addLog(`🔍 Debug - Position amount: ${positionAmount}, Entry price: ${entryPrice}, Realized PnL: ${realizedPnl}`);
      
      // Calculate unrealized PnL based on current mark price
      let unrealizedPnl = 0;
      let pnlPercent = 0;
      
      if (positionAmount > 0 && entryPrice > 0 && currentPrice > 0) {
        const side = position.side || 'long';
        if (side.toLowerCase() === 'long' || side.toLowerCase() === 'buy') {
          unrealizedPnl = (currentPrice - entryPrice) * positionAmount;
          pnlPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
        } else {
          unrealizedPnl = (entryPrice - currentPrice) * positionAmount;
          pnlPercent = ((entryPrice - currentPrice) / entryPrice) * 100;
        }
        
        this.addLog(`📈 Calculated PnL - Unrealized: ${unrealizedPnl.toFixed(4)} (${pnlPercent.toFixed(2)}%)`);
      } else {
        this.addLog(`⚠️ Cannot calculate PnL - Missing data: Amount=${positionAmount}, Entry=${entryPrice}, CurrentPrice=${currentPrice}`);
      }
      
      // Convert CoinEx position data to our Position format (matching PositionManager interface)
      const enginePosition: any = {
        id: position.position_id?.toString() || `${position.market}_${Date.now()}`,
        market: position.market || this.state.config?.symbol || '',
        side: position.side || 'long',
        margin_mode: position.margin_mode || 'cross',
        leverage: parseFloat(position.leverage || 1),
        ath_position_amount: positionAmount,
        amount_usdt: parseFloat(position.max_position_value || position.cml_position_value || 0),
        position_value: parseFloat(position.max_position_value || position.cml_position_value || 0),
        unrealized_pnl: unrealizedPnl, // Calculated from mark price
        realized_pnl: realizedPnl, // From exchange (updates on position changes)
        avg_entry_price: entryPrice,
        settle_price: parseFloat(position.settle_price || position.latest_filled_price || currentPrice),
        take_profit_price: position.take_profit_price || undefined,
        stop_loss_price: position.stop_loss_price || undefined,
        created_at: position.created_at?.toString() || Date.now().toString(),
        liquidation_price: position.liq_price?.toString() || undefined,
        margin_ratio: parseFloat(position.position_margin_rate || 0),
        // Additional fields from CoinEx WebSocket
        open_interest: position.open_interest,
        close_avbl: position.close_avbl,
        cml_position_value: position.cml_position_value,
        max_position_value: position.max_position_value,
        margin_avbl: position.margin_avbl,
        ath_margin_size: position.ath_margin_size,
        maintenance_margin_rate: position.maintenance_margin_rate,
        maintenance_margin_value: position.maintenance_margin_value,
        liq_price: position.liq_price,
        bkr_price: position.bkr_price,
        adl_level: position.adl_level,
        first_filled_price: position.first_filled_price,
        latest_filled_price: position.latest_filled_price,
        updated_at: position.updated_at?.toString(),
        // Add current price for real-time calculations
        current_price: currentPrice,
        // Add status field to track if position is closed
        status: this.determinePositionStatus(position, unrealizedPnl, realizedPnl),
        // Add timestamp for better sync management
        last_updated: Date.now(),
        // Add calculated PnL percentage
        pnl_percent: pnlPercent
      };

      // Update or add the position in the state
      const existingPositionIndex = this.state.positions.findIndex(p => p.id === enginePosition.id);
      let updatedPositions: any[];
      let isNewPosition = false;
      let positionStatusChanged = false;

      if (existingPositionIndex >= 0) {
        // Update existing position
        const oldPosition = this.state.positions[existingPositionIndex];
        updatedPositions = [...this.state.positions];
        updatedPositions[existingPositionIndex] = enginePosition;
        
        // Check if position status changed
        positionStatusChanged = oldPosition.status !== enginePosition.status;
        
        // Skip updates for closed positions (prevent ghost updates)
        if (oldPosition.status === 'closed') {
          this.addLog(`⚠️ Skipping update for closed position ${enginePosition.id}`);
          return;
        }
        
        // Log position status change with detailed PnL information
        if (positionStatusChanged) {
          if (enginePosition.status === 'closed') {
            this.logPositionClosed(enginePosition, 'websocket_update');
          } else {
            this.logPositionOpened(enginePosition);
          }
        } else {
          // Only log regular updates if position is still open
          if (enginePosition.status === 'open') {
            if (oldPosition.current_price !== enginePosition.current_price) {
              this.logPositionPriceUpdate(enginePosition, oldPosition.current_price, enginePosition.current_price);
            }
            
            // Only log TP/SL updates if the new value is valid (not null, not "0", not undefined)
            if (oldPosition.take_profit_price !== enginePosition.take_profit_price && 
                enginePosition.take_profit_price && 
                enginePosition.take_profit_price !== "0" && 
                enginePosition.take_profit_price !== 0) {
              this.logPositionTPSLUpdate(enginePosition, 'take_profit', oldPosition.take_profit_price, enginePosition.take_profit_price);
            }
            
            if (oldPosition.stop_loss_price !== enginePosition.stop_loss_price && 
                enginePosition.stop_loss_price && 
                enginePosition.stop_loss_price !== "0" && 
                enginePosition.stop_loss_price !== 0) {
              this.logPositionTPSLUpdate(enginePosition, 'stop_loss', oldPosition.stop_loss_price, enginePosition.stop_loss_price);
            }
            
            this.logPositionUpdated(enginePosition, 'websocket_update', {
              unrealizedPnl: enginePosition.unrealized_pnl,
              realizedPnl: enginePosition.realized_pnl,
              pnlPercent: enginePosition.pnl_percent
            });
          }
        }
      } else {
        // Add new position
        isNewPosition = true;
        updatedPositions = [...this.state.positions, enginePosition];
        
        if (enginePosition.status === 'open') {
          this.logPositionOpened(enginePosition);
          this.addLog(`✅ Added new position ${enginePosition.market} (${enginePosition.side}) - Size: ${enginePosition.ath_position_amount} - Entry: ${enginePosition.avg_entry_price}`);
          
          // Auto-subscribe to position updates for this market
          this.autoSubscribeToPositionUpdates(enginePosition.market);
        } else {
          this.logPositionClosed(enginePosition, 'api_initial');
          this.addLog(`⚠️ Added closed position ${enginePosition.market} (${enginePosition.side}) - Final PnL: ${enginePosition.realized_pnl.toFixed(4)} USDT`);
        }
      }

      // NOTE: We no longer automatically remove closed positions from the state
      // This allows users to see their closed positions until they manually refresh
      // The PositionManager component will filter out closed positions for the active positions tab
      // and show them in the history tab
      
      // Update state with new positions
      this.updateState({
        positions: updatedPositions
      });

      // Update activePositions separately (only open positions)
      const openPositions = updatedPositions.filter(p => p.status === 'open');
      this.updateState({
        activePositions: openPositions
      });

      // Update equity after position changes
      this.updateEquity();

      // Emit position update event
      this.emit('positionUpdate', {
        position: enginePosition,
        allPositions: updatedPositions,
        isNewPosition,
        positionStatusChanged
      });

      // Also update balance if we have margin available information
      if (position.margin_avbl) {
        const currentBalance = this.state.balance;
        const newBalance = parseFloat(position.margin_avbl);
        if (Math.abs(currentBalance - newBalance) > 0.01) { // Only update if significant change
          // Calculate total equity (balance + unrealized PnL from all open positions)
          const totalUnrealizedPnl = updatedPositions
            .filter(p => p.status === 'open')
            .reduce((sum, p) => sum + (p.unrealized_pnl || 0), 0);
          
          this.updateState({
            balance: newBalance,
            equity: newBalance + totalUnrealizedPnl
          });
          this.addLog(`💰 Balance updated: ${newBalance.toFixed(4)} USDT, Equity: ${(newBalance + totalUnrealizedPnl).toFixed(4)} USDT`);
        }
      }
      
      // Trigger real-time price updates for all open positions
      if (this.state.currentPrice) {
        this.updatePositionsPrice(this.state.currentPrice);
      }

    } catch (error) {
      logTradingError(error, 'TradingEngine', 'processPositionData');
      this.addLog(`❌ Error processing position data: ${error}`);
    }
  }

  private processStateData(stateList: any[]) {
    try {
      this.addLog(`📊 Received market state update: ${stateList.length} markets`);
      
      // Find the state data for our symbol
      const symbol = this.state.config?.symbol || 'XRPUSDT';
      const stateData = stateList.find(item => item.market === symbol);
      
      if (stateData) {
        this.addLog(`📊 Found state data for ${symbol}: Last=${stateData.last}, Open=${stateData.open}, High=${stateData.high}, Low=${stateData.low}`);
        
        // Emit state update event for UI components
        this.emit('stateUpdate', stateList);
        
        // Update current price if available and different from current state
        const lastPrice = parseFloat(stateData.last);
        if (lastPrice > 0 && lastPrice !== this.state.currentPrice) {
          this.addLog(`📊 State data price update: ${lastPrice} (previous: ${this.state.currentPrice || 0})`);
          
          // Update current price using unified method
          this.updatePrice(lastPrice, 'state_data', symbol);
          
          // Also update equity calculation
          this.updateEquity();
        }
      } else {
        this.addLog(`⚠️ No state data found for symbol: ${symbol}`);
      }
      
    } catch (error) {
      logTradingError(error, 'TradingEngine', 'processStateData');
      this.addLog(`❌ Error processing state data: ${error}`);
    }
  }

  private updateEquity() {
    const totalUnrealizedPnl = this.state.positions
      .filter(p => p.status === 'open')
      .reduce((sum, p) => sum + (p.unrealized_pnl || 0), 0);
    
    const newEquity = this.state.balance + totalUnrealizedPnl;
    
    // Only update if equity changed significantly
    if (Math.abs(newEquity - this.state.equity) > 0.01) {
      this.updateState({ equity: newEquity });
      this.addLog(`💰 Equity updated: ${newEquity.toFixed(4)} USDT (Balance: ${this.state.balance.toFixed(4)}, Unrealized PnL: ${totalUnrealizedPnl.toFixed(4)})`);
    }
  }

  private updatePositionsPrice(markPrice: number) {
    const updatedPositions = this.state.positions.map(position => {
      if (position.status === 'open') {
        const entryPrice = position.entryPrice;
        const positionAmount = position.size;
        const side = position.type;
        
        let unrealizedPnl = 0;
        let pnlPercent = 0;
        
        if (entryPrice > 0 && positionAmount > 0) {
          if (side.toLowerCase() === 'long' || side.toLowerCase() === 'buy') {
            unrealizedPnl = (markPrice - entryPrice) * positionAmount;
            pnlPercent = ((markPrice - entryPrice) / entryPrice) * 100;
          } else {
            unrealizedPnl = (entryPrice - markPrice) * positionAmount;
            pnlPercent = ((entryPrice - markPrice) / entryPrice) * 100;
          }
        }

        return {
          ...position,
          currentPrice: markPrice,
          unrealizedPnl,
          pnlPercent,
          pnl: unrealizedPnl
        };
      }
      return position;
    });

    this.updateState({ positions: updatedPositions });
    
    // Update activePositions as well (only open positions)
    const openPositions = updatedPositions.filter(p => p.status === 'open');
    this.updateState({ activePositions: openPositions });
    
    // Log the price update for debugging
    if (updatedPositions.length > 0) {
      this.addLog(`🔄 Updated ${updatedPositions.length} positions with mark price: ${markPrice}`);
    }
  }

  private startPriceCheckInterval() {
    // Check every 30 seconds if we have a valid current price
    setInterval(() => {
      if (this.state.currentPrice === 0 && this.state.config) {
        this.addLog('⚠️ No current price available, attempting to fetch via HTTP API...');
        this.fetchInitialMarketData();
      }
    }, 30000);
  }

  private async fetchInitialMarketData() {
    if (!this.state.config) return;
    
    try {
      this.addLog(`🔄 Fetching initial market data for ${this.state.config.symbol}...`);
      
      // Try to get current price via HTTP API as backup
      const marketData = await this.fetchMarketData(this.state.config.symbol);
      if (marketData && marketData.price) {
        this.updateState({
          currentPrice: marketData.price,
          marketData: marketData
        });
        this.addLog(`✅ Initial market data fetched: Price = ${marketData.price}`);
        
        // Update all positions with the new price
        this.updatePositionsPrice(marketData.price);
        this.updateEquity();
      } else {
        this.addLog(`⚠️ Could not fetch initial market data - waiting for WebSocket updates`);
      }
    } catch (error) {
      this.addLog(`⚠️ Error fetching initial market data: ${error} - waiting for WebSocket updates`);
    }
  }

  private async fetchInitialData() {
    if (!this.state.config) return;

    try {
      this.addLog('📊 Fetching initial data...');

      // Try to fetch real balance
      try {
        const balance = await this.fetchBalance();
        this.updateState({ balance });
        this.addLog(`✅ Balance fetched: ${balance} USDT`);
      } catch (error) {
        this.addLog(`⚠️ Could not fetch balance: ${error}`);
        this.updateState({ balance: 0 });
      }

      // Try to fetch real market data
      try {
        const marketData = await this.fetchMarketData(this.state.config.symbol);
        if (marketData) {
          this.updateState({ marketData });
          this.addLog(`✅ Market data fetched for ${this.state.config.symbol}`);
        }
      } catch (error) {
        this.addLog(`⚠️ Could not fetch market data: ${error}`);
        this.updateState({ marketData: null });
      }

      // Try to fetch real candles
      try {
        const candles = await this.fetchCandles(this.state.config.symbol, this.state.config.timeframe, 100);
        this.updateState({ candles });
        this.addLog(`✅ Candles fetched: ${candles.length} candles`);
      } catch (error) {
        this.addLog(`⚠️ Could not fetch candles: ${error}`);
        this.updateState({ candles: [] });
      }

      this.addLog('✅ Initial data fetching completed');

    } catch (error) {
      this.addLog(`❌ Error fetching initial data: ${error}`);
    }
  }

  private async fetchBalance(): Promise<number> {
    try {
      const coinexAPI = await this.getCoinExAPI();
      const balance = await coinexAPI.fetchBalance();
      logger.info(`Balance fetched: ${balance} USDT`, 'TradingEngine');
      return balance;
    } catch (error) {
      logTradingError(error, 'TradingEngine', 'fetchBalance');
      throw error;
    }
  }

  private async fetchMarketData(symbol: string): Promise<any> {
    try {
      const coinexAPI = await this.getCoinExAPI();
      const marketData = await coinexAPI.fetchMarketData(symbol);
      logger.info(`Market data fetched for ${symbol}`, 'TradingEngine');
      return marketData;
    } catch (error) {
      logTradingError(error, 'TradingEngine', 'fetchMarketData');
      throw error;
    }
  }

  private async fetchCandles(symbol: string, timeframe: string, limit: number): Promise<any[]> {
    try {
      const coinexAPI = await this.getCoinExAPI();
      const candles = await coinexAPI.fetchCandles(symbol, timeframe, limit);
      logger.info(`Candles fetched for ${symbol} (${timeframe})`, 'TradingEngine');
      return candles;
    } catch (error) {
      logTradingError(error, 'TradingEngine', 'fetchCandles');
      throw error;
    }
  }

  // Start trading engine
  async start(): Promise<boolean> {
    if (!this.state.config || this.state.isRunning) {
      return false;
    }

    try {
      this.addLog('🎯 Starting trading engine...');
      
      this.updateState({ isRunning: true });

      // Start update loop
      this.startUpdateLoop();

      // Start position monitor for automatic TP/SL setting
      this.startPositionMonitor();

      // Start auto trailing monitor for real-time trailing stop updates
      this.startAutoTrailingMonitor();

      this.addLog('✅ Trading engine started');
      this.emit('started');
      return true;
    } catch (error) {
      this.addLog(`❌ Error starting trading engine: ${error}`);
      return false;
    }
  }

  // Stop trading engine
  async stop(): Promise<void> {
    if (!this.state.isRunning) return;

    try {
      this.addLog('🛑 Stopping trading engine...');

      this.updateState({ isRunning: false });

      // Stop update loop
      if (this.updateInterval) {
        clearInterval(this.updateInterval);
        this.updateInterval = null;
      }

      // Stop position monitor
      this.stopPositionMonitor();

      // Stop auto trailing monitor
      if (this.updateInterval) {
        clearInterval(this.updateInterval);
        this.updateInterval = null;
      }

      // NOTE: Don't disconnect WebSocket as it's shared globally
      // if (this.wsManager) {
      //   this.wsManager.disconnect();
      //   this.wsManager = null;
      // }

      this.addLog('✅ Trading engine stopped');
      this.emit('stopped');
    } catch (error) {
      this.addLog(`❌ Error stopping trading engine: ${error}`);
    }
  }

  private startUpdateLoop() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    this.updateInterval = setInterval(async () => {
      await this.updateCycle();
    }, 30000); // Update every 30 seconds
  }

  private async updateCycle() {
    if (!this.state.isRunning || !this.state.config) return;

    try {
      this.addLog('🔄 Running update cycle...');

      // Fetch real data
      try {
        const candles = await this.fetchCandles(this.state.config.symbol, this.state.config.timeframe, 100);
        this.updateState({ candles });
      } catch (error) {
        this.addLog(`⚠️ Could not fetch candles: ${error}`);
      }

      // Generate signals
      await this.generateAndProcessSignals();

      // Update positions
      await this.updatePositions();

      // Update performance metrics
      this.updatePerformance();

      this.updateState({ lastUpdate: new Date() });

    } catch (error) {
      this.addLog(`❌ Error in update cycle: ${error}`);
    }
  }

  private async generateAndProcessSignals() {
    if (!this.state.config) return;

    try {
      let signal: Signal | null = null;

      // No strategy implemented - signals disabled
      signal = null;

      if (signal) {
        this.updateState({ currentSignal: signal });
        this.addLog(`📈 Signal generated: ${signal.type.toUpperCase()} at ${signal.price.toFixed(6)}`);

        // Execute trade if auto-trading is enabled
        if (this.state.config.autoTrade) {
          await this.executeTrade(signal);
        }
      }
    } catch (error) {
      this.addLog(`❌ Error generating signals: ${error}`);
    }
  }

  private async executeTrade(signal: Signal) {
    if (!this.state.config) return;

    try {
      this.addLog(`🎯 Executing ${signal.type} trade...`);

      const coinexAPI = await this.getCoinExAPI();
      
      // Calculate position size
      const positionSize = this.state.config.amountUsdt;
      
      // Calculate take profit and stop loss
      const takeProfit = signal.type === 'buy'
        ? signal.price * (1 + this.state.config.profitPercent / 100)
        : signal.price * (1 - this.state.config.profitPercent / 100);

      const stopLoss = signal.type === 'buy'
        ? signal.price * (1 - this.state.config.lossPercent / 100)
        : signal.price * (1 + this.state.config.lossPercent / 100);

      // Execute real order
      const orderResult = await coinexAPI.placeOrder({
        market: this.state.config.symbol,
        side: signal.type,
        type: 'market',
        amount: positionSize,
        leverage: this.state.config.leverage,
        margin_mode: this.state.config.marginMode
      });

      if (orderResult) {
        // Set take profit and stop loss
        await coinexAPI.setTakeProfit(this.state.config.symbol, takeProfit);
        await coinexAPI.setStopLoss(this.state.config.symbol, stopLoss);
        
        this.addLog(`✅ Trade executed successfully`);
        this.emit('tradeExecuted', { signal, orderResult });
      } else {
        throw new Error('Order execution failed');
      }

    } catch (error) {
      this.addLog(`❌ Error executing trade: ${error}`);
    }
  }

  private async updatePositions() {
    // Positions are now updated via WebSocket subscription only
    // HTTP position fetching has been removed for real-time updates
    if (this.state.positions.length > 0) {
      this.addLog(`🔄 Positions updated via WebSocket: ${this.state.positions.length} positions`);
    }
  }

  private async updateTrailingStop(position: Position) {
    if (!this.state.config || !position.currentPrice) return;

    try {
      const trailAmount = position.entryPrice * (this.state.config.trailPercent / 100);
      let newStopLoss = position.stopLoss;

      if (position.type === 'buy' && position.currentPrice > position.entryPrice) {
        newStopLoss = position.currentPrice - trailAmount;
        if (newStopLoss > (position.stopLoss || 0)) {
          this.addLog(`📈 Trailing stop updated to ${newStopLoss.toFixed(6)} (mock)`);
        }
      } else if (position.type === 'sell' && position.currentPrice < position.entryPrice) {
        newStopLoss = position.currentPrice + trailAmount;
        if (newStopLoss < (position.stopLoss || Infinity)) {
          this.addLog(`📉 Trailing stop updated to ${newStopLoss.toFixed(6)} (mock)`);
        }
      }
    } catch (error) {
      this.addLog(`❌ Error updating trailing stop: ${error}`);
    }
  }

  private updatePerformance() {
    // Calculate performance metrics based on closed positions
    const closedPositions = this.state.positions.filter(p => p.status === 'closed');
    
    if (closedPositions.length === 0) return;

    const totalTrades = closedPositions.length;
    const winningTrades = closedPositions.filter(p => (p.pnl || 0) > 0).length;
    const losingTrades = closedPositions.filter(p => (p.pnl || 0) < 0).length;
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;

    const grossProfit = closedPositions
      .filter(p => (p.pnl || 0) > 0)
      .reduce((sum, p) => sum + (p.pnl || 0), 0);
    
    const grossLoss = Math.abs(closedPositions
      .filter(p => (p.pnl || 0) < 0)
      .reduce((sum, p) => sum + (p.pnl || 0), 0));

    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
    const totalReturn = closedPositions.reduce((sum, p) => sum + (p.pnl || 0), 0);

    // Calculate max drawdown
    let maxDrawdown = 0;
    let peak = 0;
    let equity = 0;

    closedPositions.forEach(position => {
      equity += position.pnl || 0;
      if (equity > peak) {
        peak = equity;
      }
      const drawdown = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    });

    // Calculate Sharpe ratio (simplified)
    const returns = closedPositions.map(p => p.pnl || 0);
    const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / returns.length;
    const standardDeviation = Math.sqrt(variance);
    const sharpeRatio = standardDeviation > 0 ? (meanReturn / standardDeviation) * Math.sqrt(252) : 0;

    this.updateState({
      performance: {
        totalTrades,
        winningTrades,
        losingTrades,
        winRate,
        profitFactor,
        maxDrawdown,
        totalReturn,
        sharpeRatio
      }
    });
  }

  // Get current state
  getState(): TradingEngineState {
    return { ...this.state };
  }

  // Get WebSocket manager for external components
  getWebSocketManager(): WebSocketManager | null {
    return this.wsManager;
  }

  // Get performance summary
  getPerformanceSummary() {
    return {
      ...this.state.performance,
      currentEquity: this.state.equity,
      currentDrawdown: this.calculateCurrentDrawdown(),
      dailyPnL: this.calculateDailyPnL(),
      weeklyPnL: this.calculateWeeklyPnL(),
      monthlyPnL: this.calculateMonthlyPnL()
    };
  }

  private calculateCurrentDrawdown(): number {
    const closedPositions = this.state.positions.filter(p => p.status === 'closed');
    let maxDrawdown = 0;
    let peak = 0;
    let equity = 0;

    closedPositions.forEach(position => {
      equity += position.pnl || 0;
      if (equity > peak) {
        peak = equity;
      }
      const drawdown = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    });

    return maxDrawdown;
  }

  private calculateDailyPnL(): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return this.state.positions
      .filter(p => p.status === 'closed' && p.exitTime && p.exitTime >= today)
      .reduce((sum, p) => sum + (p.pnl || 0), 0);
  }

  private calculateWeeklyPnL(): number {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    
    return this.state.positions
      .filter(p => p.status === 'closed' && p.exitTime && p.exitTime >= weekAgo)
      .reduce((sum, p) => sum + (p.pnl || 0), 0);
  }

  private calculateMonthlyPnL(): number {
    const monthAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);
    
    return this.state.positions
      .filter(p => p.status === 'closed' && p.exitTime && p.exitTime >= monthAgo)
      .reduce((sum, p) => sum + (p.pnl || 0), 0);
  }

  // تنظیم خودکار حد سود و حد ضرر بر اساس قیمت میانگین ورود
  private async setTakeProfitStopLossByEntryPrice(params: {
    symbol: string;
    side: 'buy' | 'sell';
    entryPrice: number;
    takeProfitPercent?: number;
    stopLossPercent?: number;
    enableTrailingTP?: boolean;
    enableTrailingSL?: boolean;
    trailingDistance?: number;
  }) {
    try {
      this.addLog(`🎯 Setting Take Profit and Stop Loss based on entry price...`);
      
      const coinexAPI = await this.getCoinExAPI();
      
      this.addLog(`📊 Using entry price: ${params.entryPrice}`);
      
      // تنظیم حد سود اگر فعال است
      if (params.takeProfitPercent) {
        try {
          const takeProfitPrice = this.calculateTakeProfitPrice(params.entryPrice, params.takeProfitPercent, params.side);
          await coinexAPI.setTakeProfit(params.symbol, takeProfitPrice);
          this.addLog(`✅ Take Profit set at ${takeProfitPrice} (${params.takeProfitPercent}% from entry price ${params.entryPrice})`);
          
          // اگر حد سود متحرک فعال است، آن را تنظیم می‌کنیم
          if (params.enableTrailingTP && params.trailingDistance) {
            this.addLog(`🔄 Trailing Take Profit enabled with ${params.trailingDistance}% distance`);
            this.startTrailingTakeProfitMonitor(params.symbol, params.side, params.entryPrice, params.takeProfitPercent, params.trailingDistance);
          }
        } catch (error) {
          this.addLog(`❌ Failed to set Take Profit: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
      
      // تنظیم حد ضرر اگر فعال است
      if (params.stopLossPercent) {
        try {
          const stopLossPrice = this.calculateStopLossPrice(params.entryPrice, params.stopLossPercent, params.side);
          await coinexAPI.setStopLoss(params.symbol, stopLossPrice);
          this.addLog(`✅ Stop Loss set at ${stopLossPrice} (${params.stopLossPercent}% from entry price ${params.entryPrice})`);
          
          // اگر حد ضرر متحرک فعال است، آن را تنظیم می‌کنیم
          if (params.enableTrailingSL && params.trailingDistance) {
            this.addLog(`🔄 Trailing Stop Loss enabled with ${params.trailingDistance}% distance`);
            this.startTrailingStopMonitor(params.symbol, params.side, params.entryPrice, params.stopLossPercent, params.trailingDistance);
          }
        } catch (error) {
          this.addLog(`❌ Failed to set Stop Loss: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
      
      return true;
    } catch (error) {
      this.addLog(`❌ Error setting Take Profit/Stop Loss by entry price: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  // تنظیم خودکار حد سود و حد ضرر بر اساس قیمت لحظه‌ای
  private async setTakeProfitStopLossImmediately(params: {
    symbol: string;
    side: 'buy' | 'sell';
    takeProfitPercent?: number;
    stopLossPercent?: number;
    enableTrailingTP?: boolean;
    enableTrailingSL?: boolean;
    trailingDistance?: number;
  }) {
    try {
      this.addLog(`🎯 Setting immediate Take Profit and Stop Loss based on current price...`);
      
      const coinexAPI = await this.getCoinExAPI();
      
      // دریافت قیمت لحظه‌ای
      const currentPrice = this.state.currentPrice;
      if (currentPrice <= 0) {
        this.addLog(`⚠️ No current price available, fetching market data...`);
        const marketData = await coinexAPI.fetchMarketData(params.symbol);
        if (marketData && marketData.price > 0) {
          this.updatePrice(marketData.price, 'market_data', params.symbol);
        } else {
          throw new Error('Could not fetch current price');
        }
      }
      
      const finalPrice = this.state.currentPrice;
      this.addLog(`📊 Using current price: ${finalPrice}`);
      
      // تنظیم حد سود اگر فعال است
      if (params.takeProfitPercent) {
        try {
          const takeProfitPrice = this.calculateTakeProfitPrice(finalPrice, params.takeProfitPercent, params.side);
          await coinexAPI.setTakeProfit(params.symbol, takeProfitPrice);
          this.addLog(`✅ Take Profit set at ${takeProfitPrice} (${params.takeProfitPercent}% from current price ${finalPrice})`);
          
          // اگر حد سود متحرک فعال است، آن را تنظیم می‌کنیم
          if (params.enableTrailingTP && params.trailingDistance) {
            this.addLog(`🔄 Trailing Take Profit enabled with ${params.trailingDistance}% distance`);
            this.startTrailingTakeProfitMonitor(params.symbol, params.side, finalPrice, params.takeProfitPercent, params.trailingDistance);
          }
        } catch (error) {
          this.addLog(`❌ Failed to set Take Profit: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
      
      // تنظیم حد ضرر اگر فعال است
      if (params.stopLossPercent) {
        try {
          const stopLossPrice = this.calculateStopLossPrice(finalPrice, params.stopLossPercent, params.side);
          await coinexAPI.setStopLoss(params.symbol, stopLossPrice);
          this.addLog(`✅ Stop Loss set at ${stopLossPrice} (${params.stopLossPercent}% from current price ${finalPrice})`);
          
          // اگر حد ضرر متحرک فعال است، آن را تنظیم می‌کنیم
          if (params.enableTrailingSL && params.trailingDistance) {
            this.addLog(`🔄 Trailing Stop Loss enabled with ${params.trailingDistance}% distance`);
            this.startTrailingStopMonitor(params.symbol, params.side, finalPrice, params.stopLossPercent, params.trailingDistance);
          }
        } catch (error) {
          this.addLog(`❌ Failed to set Stop Loss: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
      
      return true;
    } catch (error) {
      this.addLog(`❌ Error setting immediate Take Profit/Stop Loss: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }


  // Manual trade execution
  async executeManualTrade(params: {
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
  }) {
    try {
      this.addLog(`🎯 Executing manual ${params.side} trade...`);
      this.addLog(`📊 Order Details: ${params.amount} ${params.amountUnit} @ ${params.leverage}x leverage (${params.marginMode} margin)`);

      const coinexAPI = await this.getCoinExAPI();
      
      // Convert amount based on unit
      let finalAmount = params.amount;
      if (params.amountUnit === 'usdt') {
        // If amount is in USDT, we need to convert to coin amount
        // For simplicity, we'll use the current market price
        try {
          const marketData = await coinexAPI.fetchMarketData(params.symbol);
          if (marketData && marketData.price > 0) {
            finalAmount = params.amount / marketData.price;
            this.addLog(`💰 Converted ${params.amount} USDT to ${finalAmount.toFixed(6)} ${params.symbol.replace('USDT', '')} at price ${marketData.price}`);
          } else {
            throw new Error('Could not fetch market price');
          }
        } catch (error) {
          this.addLog(`⚠️ Could not fetch market price, using original amount. Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
          // If we can't get the price, we can't convert USDT to coin amount
          throw new Error('Cannot convert USDT to coin amount without market price. Please try using coin amount instead.');
        }
      } else {
        this.addLog(`💰 Using coin amount: ${finalAmount} ${params.symbol.replace('USDT', '')}`);
      }
      
      // First, adjust leverage and margin mode if specified
      if (params.leverage && params.marginMode) {
        try {
          this.addLog(`🔧 Adjusting leverage to ${params.leverage}x with ${params.marginMode} margin mode...`);
          await coinexAPI.adjustLeverage(params.symbol, params.leverage, params.marginMode);
          this.addLog(`✅ Leverage and margin mode adjusted successfully`);
        } catch (error) {
          this.addLog(`⚠️ Warning: Could not adjust leverage and margin mode: ${error instanceof Error ? error.message : 'Unknown error'}`);
          // Continue with the order even if leverage adjustment fails
        }
      }
      
      this.addLog(`📋 Placing order: ${params.side} ${finalAmount.toFixed(6)} ${params.symbol.replace('USDT', '')} at ${params.type} price`);
      
      const orderResult = await coinexAPI.placeOrder({
        market: params.symbol,
        side: params.side,
        type: params.type,
        amount: finalAmount,
        price: params.price,
        leverage: params.leverage,
        margin_mode: params.marginMode
      });

      if (orderResult) {
        this.addLog(`✅ Manual trade executed successfully`);
        this.addLog(`📈 Order ID: ${orderResult.order_id || 'N/A'}`);
        
        // اگر حالت تأخیر برای حد سود و حد ضرر فعال است
        if (params.useDelayedTPSL) {
          this.addLog(`⏳ Waiting 5 seconds before setting Take Profit and Stop Loss...`);
          
          // تأخیر 5 ثانیه‌ای
          await new Promise(resolve => setTimeout(resolve, 5000));
          
          // دریافت اطلاعات پوزیشن فعال از state (که از طریق WebSocket به‌روز می‌شود)
          try {
            // صبر کردن برای به‌روزرسانی WebSocket
            let attempts = 0;
            let currentPosition = null;
            
            while (attempts < 10) { // حداکثر 10 تلاش (50 ثانیه)
              const activePositions = this.state.positions.filter(p => p.status === 'open' && p.market === params.symbol);
              
              if (activePositions.length > 0) {
                // پیدا کردن جدیدترین پوزیشن
                currentPosition = activePositions.reduce((newest, current) => {
                  const newestTime = newest.created_at || newest.timestamp || 0;
                  const currentTime = current.created_at || current.timestamp || 0;
                  return currentTime > newestTime ? current : newest;
                }, activePositions[0]);
                
                if (currentPosition) {
                  break;
                }
              }
              
              attempts++;
              this.addLog(`⏳ Waiting for position data... (attempt ${attempts}/10)`);
              await new Promise(resolve => setTimeout(resolve, 5000));
            }
            
            if (currentPosition) {
              // حالت اول: استفاده از قیمت میانگین ورود پوزیشن
              const entryPrice = parseFloat(currentPosition.avg_entry_price || currentPosition.entryPrice || '0');
              
              // حالت دوم: استفاده از قیمت لحظه‌ای (پیشنهادی)
              const currentPrice = this.state.currentPrice || entryPrice;
              
              this.addLog(`📊 Current position found - Entry Price: ${entryPrice}, Current Price: ${currentPrice}`);
              
              // تنظیم حد سود اگر فعال است
              if (params.takeProfitPercent) {
                try {
                  // محاسبه حد سود بر اساس قیمت لحظه‌ای
                  const takeProfitPrice = this.calculateTakeProfitPrice(currentPrice, params.takeProfitPercent, params.side);
                  await coinexAPI.setTakeProfit(params.symbol, takeProfitPrice);
                  this.addLog(`✅ Take Profit set at ${takeProfitPrice} (${params.takeProfitPercent}% from current price ${currentPrice})`);
                  
                  // اگر حد سود متحرک فعال است، آن را تنظیم می‌کنیم
                  if (params.enableTrailingTP) {
                    this.addLog(`🔄 Trailing Take Profit enabled with ${params.trailingDistance}% distance`);
                    // شروع مانیتورینگ برای به‌روزرسانی حد سود متحرک
                    this.startTrailingTakeProfitMonitor(params.symbol, params.side, currentPrice, params.takeProfitPercent, params.trailingDistance);
                  }
                } catch (error) {
                  this.addLog(`❌ Failed to set Take Profit: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
              }
              
              // تنظیم حد ضرر اگر فعال است
              if (params.stopLossPercent) {
                try {
                  // محاسبه حد ضرر بر اساس قیمت لحظه‌ای
                  const stopLossPrice = this.calculateStopLossPrice(currentPrice, params.stopLossPercent, params.side);
                  await coinexAPI.setStopLoss(params.symbol, stopLossPrice);
                  this.addLog(`✅ Stop Loss set at ${stopLossPrice} (${params.stopLossPercent}% from current price ${currentPrice})`);
                  
                  // اگر حد ضرر متحرک فعال است، آن را تنظیم می‌کنیم
                  if (params.enableTrailingSL) {
                    this.addLog(`🔄 Trailing Stop Loss enabled with ${params.trailingDistance}% distance`);
                    // شروع مانیتورینگ برای به‌روزرسانی حد ضرر متحرک
                    this.startTrailingStopMonitor(params.symbol, params.side, currentPrice, params.stopLossPercent, params.trailingDistance);
                  }
                } catch (error) {
                  this.addLog(`❌ Failed to set Stop Loss: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
              }
            } else {
              this.addLog(`⚠️ No active position found after ${attempts * 5} seconds`);
              // تلاش برای دریافت پوزیشن از داده‌های WebSocket به جای HTTP
              const wsPosition = this.state.activePositions.find(p => p.market === params.symbol);
              if (wsPosition) {
                const entryPrice = parseFloat(wsPosition.avg_entry_price || wsPosition.last_price || '0');
                // استفاده از قیمت لحظه‌ای برای WebSocket position
                const currentPrice = this.state.currentPrice || entryPrice;
                
                this.addLog(`📊 Position found via WebSocket - Entry Price: ${entryPrice}, Current Price: ${currentPrice}`);
                
                // تنظیم حد سود و حد ضرر با استفاده از داده‌های WebSocket و قیمت لحظه‌ای
                if (params.takeProfitPercent) {
                  try {
                    const takeProfitPrice = this.calculateTakeProfitPrice(currentPrice, params.takeProfitPercent, params.side);
                    await coinexAPI.setTakeProfit(params.symbol, takeProfitPrice);
                    this.addLog(`✅ Take Profit set at ${takeProfitPrice} (${params.takeProfitPercent}% from current price ${currentPrice})`);
                  } catch (error) {
                    this.addLog(`❌ Failed to set Take Profit: ${error instanceof Error ? error.message : 'Unknown error'}`);
                  }
                }
                
                if (params.stopLossPercent) {
                  try {
                    const stopLossPrice = this.calculateStopLossPrice(currentPrice, params.stopLossPercent, params.side);
                    await coinexAPI.setStopLoss(params.symbol, stopLossPrice);
                    this.addLog(`✅ Stop Loss set at ${stopLossPrice} (${params.stopLossPercent}% from current price ${currentPrice})`);
                    
                    if (params.enableTrailingSL) {
                      this.startTrailingStopMonitor(params.symbol, params.side, currentPrice, params.stopLossPercent, params.trailingDistance);
                    }
                  } catch (error) {
                    this.addLog(`❌ Failed to set Stop Loss: ${error instanceof Error ? error.message : 'Unknown error'}`);
                  }
                }
              } else {
                this.addLog(`❌ No position found via WebSocket either`);
              }
            }
          } catch (error) {
            this.addLog(`❌ Error fetching current position: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        } else {
          // حالت عادی - تنظیم فوری حد سود و حد ضرر بر اساس قیمت لحظه‌ای
          await this.setTakeProfitStopLossImmediately({
            symbol: params.symbol,
            side: params.side,
            takeProfitPercent: params.takeProfitPercent,
            stopLossPercent: params.stopLossPercent,
            enableTrailingTP: params.enableTrailingTP,
            enableTrailingSL: params.enableTrailingSL,
            trailingDistance: params.trailingDistance
          });
        }
        
        return orderResult;
      }

      throw new Error('Failed to execute manual trade');
    } catch (error) {
      this.addLog(`❌ Error executing manual trade: ${error}`);
      throw error;
    }
  }

  // توابع کمکی برای محاسبه قیمت حد سود و حد ضرر
  private calculateTakeProfitPrice(entryPrice: number, percent: number, side: 'buy' | 'sell') {
    if (side === 'buy') {
      return entryPrice * (1 + percent / 100);
    } else {
      return entryPrice * (1 - percent / 100);
    }
  }

  private calculateStopLossPrice(entryPrice: number, percent: number, side: 'buy' | 'sell') {
    if (side === 'buy') {
      return entryPrice * (1 - percent / 100);
    } else {
      return entryPrice * (1 + percent / 100);
    }
  }

  // Price update subscription for real-time trailing
  private subscribeToPriceUpdates(symbol: string, handler: (price: number) => Promise<void>) {
    if (!this.priceUpdateHandlers) {
      this.priceUpdateHandlers = new Map();
    }
    
    if (!this.priceUpdateHandlers.has(symbol)) {
      this.priceUpdateHandlers.set(symbol, []);
    }
    
    this.priceUpdateHandlers.get(symbol)!.push(handler);
    this.addLog(`📡 Subscribed to price updates for ${symbol} (${this.priceUpdateHandlers.get(symbol)!.length} handlers)`);
  }
  
  private unsubscribeFromPriceUpdates(symbol: string, handler?: (price: number) => Promise<void>) {
    if (!this.priceUpdateHandlers || !this.priceUpdateHandlers.has(symbol)) {
      return;
    }
    
    const handlers = this.priceUpdateHandlers.get(symbol)!;
    if (handler) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    } else {
      // Remove all handlers for this symbol
      this.priceUpdateHandlers.delete(symbol);
    }
    
    this.addLog(`📡 Unsubscribed from price updates for ${symbol}`);
  }
  
  // Dispatch price updates to all subscribed handlers
  private async dispatchPriceUpdate(symbol: string, price: number) {
    if (!this.priceUpdateHandlers || !this.priceUpdateHandlers.has(symbol)) {
      return;
    }
    
    const handlers = this.priceUpdateHandlers.get(symbol)!;
    // Execute all handlers concurrently
    await Promise.allSettled(
      handlers.map(handler => {
        try {
          return handler(price);
        } catch (error) {
          this.addLog(`❌ Error in price update handler: ${error}`);
          return Promise.reject(error);
        }
      })
    );
  }
  
  // Stop trailing monitor
  private stopTrailingMonitor(symbol: string, type: 'stop_loss' | 'take_profit') {
    if (!this.trailingMonitors) {
      return;
    }
    
    const key = `${symbol}_${type}`;
    if (this.trailingMonitors.has(key)) {
      const monitor = this.trailingMonitors.get(key);
      
      // Clear periodic check if exists
      if (monitor.periodicCheck) {
        clearInterval(monitor.periodicCheck);
      }
      
      this.trailingMonitors.delete(key);
      this.addLog(`🛑 Stopped ${type} trailing monitor for ${symbol}`);
      
      // Also unsubscribe from price updates if no more monitors for this symbol
      const hasStopMonitor = this.trailingMonitors.has(`${symbol}_stop_loss`);
      const hasTakeProfitMonitor = this.trailingMonitors.has(`${symbol}_take_profit`);
      
      if (!hasStopMonitor && !hasTakeProfitMonitor) {
        this.unsubscribeFromPriceUpdates(symbol);
      }
    }
  }

  private calculateTrailingStopPrice(currentPrice: number, entryPrice: number, percent: number, side: 'buy' | 'sell') {
    const initialStopLoss = entryPrice * (1 - percent / 100);
    
    if (side === 'buy') {
      // For buy positions: stop loss should only move up, never down
      const newStopLoss = currentPrice * (1 - percent / 100);
      // Only update if new stop loss is higher than current/initial
      return Math.max(newStopLoss, initialStopLoss);
    } else {
      // For sell positions: stop loss should only move down, never up
      const newStopLoss = currentPrice * (1 + percent / 100);
      const initialStopLoss = entryPrice * (1 + percent / 100);
      // Only update if new stop loss is lower than current/initial
      return Math.min(newStopLoss, initialStopLoss);
    }
  }

  private calculateTrailingTakeProfitPrice(currentPrice: number, entryPrice: number, percent: number, side: 'buy' | 'sell') {
    const initialTakeProfit = entryPrice * (1 + percent / 100);
    
    if (side === 'buy') {
      // For buy positions: take profit should only move up, never down
      const newTakeProfit = currentPrice * (1 + percent / 100);
      // Only update if new take profit is higher than current/initial
      return Math.max(newTakeProfit, initialTakeProfit);
    } else {
      // For sell positions: take profit should only move down, never up
      const newTakeProfit = currentPrice * (1 - percent / 100);
      const initialTakeProfit = entryPrice * (1 - percent / 100);
      // Only update if new take profit is lower than current/initial
      return Math.min(newTakeProfit, initialTakeProfit);
    }
  }

  // مانیتورینگ حد ضرر متحرک
  private startTrailingStopMonitor(symbol: string, side: 'buy' | 'sell', entryPrice: number, stopLossPercent: number, trailingDistance: number) {
    this.addLog(`🚀 Starting trailing stop monitor for ${symbol} ${side} position`);
    this.addLog(`📊 Entry Price: ${entryPrice}, Stop Loss: ${stopLossPercent}%, Trailing Distance: ${trailingDistance}%`);
    
    let lastUpdateTime = 0;
    const UPDATE_THROTTLE_MS = 1000; // 1 second throttle for API calls
    
    // Enhanced price handler that gets current price directly from state
    const handlePriceUpdate = async (price: number) => {
      try {
        const now = Date.now();
        
        // Get the most current price from state (more reliable than parameter)
        const currentPrice = this.state.currentPrice;
        if (currentPrice <= 0) {
          this.addLog(`⚠️ Invalid current price in state: ${currentPrice}`);
          return;
        }
        
        // Calculate new trailing stop price
        const newStopLossPrice = this.calculateTrailingStopPrice(currentPrice, entryPrice, stopLossPercent, side);
        
        // Get current position to check existing stop loss from WebSocket data
        const currentPosition = this.state.activePositions.find(p => p.market === symbol);
        
        if (currentPosition) {
          const currentStopLoss = parseFloat(currentPosition.stop_loss_price || '0');
          
          // Only update if the new stop loss is better and we haven't updated recently
          const shouldUpdate = ((side === 'buy' && newStopLossPrice > currentStopLoss) || 
                               (side === 'sell' && newStopLossPrice < currentStopLoss)) &&
                              (now - lastUpdateTime > UPDATE_THROTTLE_MS);
          
          if (shouldUpdate) {
            this.addLog(`✅ Updating trailing stop from ${currentStopLoss} to ${newStopLossPrice} (Price: ${currentPrice}, Source: ${this.state.priceSource})`);
            // Get API instance
            const coinexAPI = await this.getCoinExAPI();
            await coinexAPI.setStopLoss(symbol, newStopLossPrice);
            this.addLog(`🔄 Trailing Stop Loss updated to ${newStopLossPrice}`);
            lastUpdateTime = now;
            
            // Log the update
            const position = this.state.positions.find(p => p.market === symbol && p.status === 'open');
            if (position) {
              this.logPositionTrailingUpdate(position, 'stop_loss', newStopLossPrice);
            }
          }
        } else {
          // Position might be closed, stop monitoring
          this.addLog(`⚠️ No active positions found for ${symbol}, stopping trailing monitor`);
          this.stopTrailingMonitor(symbol, 'stop_loss');
        }
      } catch (error) {
        this.addLog(`⚠️ Error in trailing stop monitor: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    };
    
    // Also add periodic price check as backup (every 5 seconds)
    const periodicCheck = setInterval(async () => {
      try {
        const currentPrice = this.state.currentPrice;
        if (currentPrice > 0) {
          await handlePriceUpdate(currentPrice);
        }
      } catch (error) {
        this.addLog(`⚠️ Error in periodic trailing stop check: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }, 5000);
    
    // Subscribe to WebSocket price updates
    this.subscribeToPriceUpdates(symbol, handlePriceUpdate);
    
    // Store monitor reference for cleanup
    if (!this.trailingMonitors) {
      this.trailingMonitors = new Map();
    }
    this.trailingMonitors.set(`${symbol}_stop_loss`, {
      symbol,
      type: 'stop_loss',
      side,
      entryPrice,
      stopLossPercent,
      trailingDistance,
      startTime: Date.now(),
      periodicCheck // Store interval ID for cleanup
    });
    
    this.addLog(`✅ Trailing stop monitor started for ${symbol} - using real-time WebSocket updates + periodic checks`);
  }

  private startTrailingTakeProfitMonitor(symbol: string, side: 'buy' | 'sell', entryPrice: number, takeProfitPercent: number, trailingDistance: number) {
    this.addLog(`🚀 Starting trailing take profit monitor for ${symbol} ${side} position`);
    this.addLog(`📊 Entry Price: ${entryPrice}, Take Profit: ${takeProfitPercent}%, Trailing Distance: ${trailingDistance}%`);
    
    let lastUpdateTime = 0;
    const UPDATE_THROTTLE_MS = 1000; // 1 second throttle for API calls
    
    // Enhanced price handler that gets current price directly from state
    const handlePriceUpdate = async (price: number) => {
      try {
        const now = Date.now();
        
        // Get the most current price from state (more reliable than parameter)
        const currentPrice = this.state.currentPrice;
        if (currentPrice <= 0) {
          this.addLog(`⚠️ Invalid current price in state: ${currentPrice}`);
          return;
        }
        
        // Calculate new trailing take profit price
        const newTakeProfitPrice = this.calculateTrailingTakeProfitPrice(currentPrice, entryPrice, takeProfitPercent, side);
        
        // Get current position to check existing take profit from WebSocket data
        const currentPosition = this.state.activePositions.find(p => p.market === symbol);
        
        if (currentPosition) {
          const currentTakeProfit = parseFloat(currentPosition.take_profit_price || '0');
          
          // Only update if the new take profit is better and we haven't updated recently
          const shouldUpdate = ((side === 'buy' && newTakeProfitPrice < currentTakeProfit) || 
                               (side === 'sell' && newTakeProfitPrice > currentTakeProfit)) &&
                              (now - lastUpdateTime > UPDATE_THROTTLE_MS);
          
          if (shouldUpdate) {
            this.addLog(`✅ Updating trailing take profit from ${currentTakeProfit} to ${newTakeProfitPrice} (Price: ${currentPrice}, Source: ${this.state.priceSource})`);
            // Get API instance
            const coinexAPI = await this.getCoinExAPI();
            await coinexAPI.setTakeProfit(symbol, newTakeProfitPrice);
            this.addLog(`🔄 Trailing Take Profit updated to ${newTakeProfitPrice}`);
            lastUpdateTime = now;
            
            // Log the update
            const position = this.state.positions.find(p => p.market === symbol && p.status === 'open');
            if (position) {
              this.logPositionTrailingUpdate(position, 'take_profit', newTakeProfitPrice);
            }
          }
        } else {
          // Position might be closed, stop monitoring
          this.addLog(`⚠️ No active positions found for ${symbol}, stopping trailing monitor`);
          this.stopTrailingMonitor(symbol, 'take_profit');
        }
      } catch (error) {
        this.addLog(`⚠️ Error in trailing take profit monitor: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    };
    
    // Also add periodic price check as backup (every 5 seconds)
    const periodicCheck = setInterval(async () => {
      try {
        const currentPrice = this.state.currentPrice;
        if (currentPrice > 0) {
          await handlePriceUpdate(currentPrice);
        }
      } catch (error) {
        this.addLog(`⚠️ Error in periodic trailing take profit check: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }, 5000);
    
    // Subscribe to WebSocket price updates
    this.subscribeToPriceUpdates(symbol, handlePriceUpdate);
    
    // Store monitor reference for cleanup
    if (!this.trailingMonitors) {
      this.trailingMonitors = new Map();
    }
    this.trailingMonitors.set(`${symbol}_take_profit`, {
      symbol,
      type: 'take_profit',
      side,
      entryPrice,
      takeProfitPercent,
      trailingDistance,
      startTime: Date.now(),
      periodicCheck // Store interval ID for cleanup
    });
    
    this.addLog(`✅ Trailing take profit monitor started for ${symbol} - using real-time WebSocket updates + periodic checks`);
  }

  // Close position
  async closePosition(positionId: string) {
    try {
      this.addLog(`🔄 Closing position ${positionId}...`);

      // Check if position exists and is not already closed
      const position = this.state.positions.find(p => p.id === positionId);
      if (!position) {
        this.addLog(`❌ Position ${positionId} not found`);
        return;
      }
      
      if (position.status === 'closed') {
        this.addLog(`⚠️ Position ${positionId} is already closed`);
        return;
      }

      // This would need to be implemented based on the CoinEx API
      // For now, we'll simulate it
      const updatedPositions = this.state.positions.map(p => 
        p.id === positionId 
          ? { 
              ...p, 
              status: 'closed' as const, 
              exitTime: new Date(),
              exitPrice: p.current_price || p.settle_price,
              realized_pnl: p.unrealized_pnl,
              pnl: p.unrealized_pnl,
              pnlPercent: p.pnl_percent
            }
          : p
      );
      
      this.updateState({ positions: updatedPositions });
      
      // Update activePositions as well (only open positions)
      const openPositions = updatedPositions.filter(p => p.status === 'open');
      this.updateState({ activePositions: openPositions });
      
      // Log the position closure
      const closedPosition = updatedPositions.find(p => p.id === positionId);
      if (closedPosition) {
        this.logPositionClosed(closedPosition, 'manual_close');
      }
      
      this.addLog(`✅ Position ${positionId} closed successfully`);
      
    } catch (error) {
      logTradingError(error, 'TradingEngine', 'closePosition');
      this.addLog(`❌ Error closing position ${positionId}: ${error}`);
    }
  }

  // Emergency stop
  async emergencyStop() {
    try {
      this.addLog('🚨 EMERGENCY STOP INITIATED');

      // Close all open positions
      const openPositions = this.state.positions.filter(p => p.status === 'open');
      
      for (const position of openPositions) {
        await this.closePosition(position.id);
      }

      // Stop the trading engine
      await this.stop();

      this.addLog('✅ Emergency stop completed');
    } catch (error) {
      this.addLog(`❌ Error during emergency stop: ${error}`);
    }
  }

  // Cleanup method
  async cleanup() {
    try {
      this.addLog('🧹 Cleaning up trading engine...');
      
      // Stop the engine
      await this.stop();
      
      // Reset global handlers flag for next initialization
      TradingEngine.globalHandlersSetup = false;
      
      // Note: We don't disconnect the global WebSocket as it might be used by other instances
      // But we can force a reconnection if needed
      if (TradingEngine.globalWsManager && !TradingEngine.globalWsManager.connected) {
        this.addLog('🔄 Global WebSocket is disconnected, consider reconnecting on next initialization');
      }
      
      this.addLog('✅ Cleanup completed');
    } catch (error) {
      this.addLog(`❌ Error during cleanup: ${error}`);
    }
  }

  // Get performance summary
  getPerformanceSummary() {
    return this.state.performance;
  }

  // Refresh methods for the hook
  async refreshMarketData(symbol: string) {
    try {
      const coinexAPI = await this.getCoinExAPI();
      const marketData = await coinexAPI.fetchMarketData(symbol);
      if (marketData) {
        this.updateState({ marketData });
        this.addLog(`📊 Market data refreshed for ${symbol}`);
      }
    } catch (error) {
      this.addLog(`❌ Error refreshing market data: ${error}`);
    }
  }

  async refreshBalance() {
    try {
      const coinexAPI = await this.getCoinExAPI();
      const balance = await coinexAPI.fetchBalance();
      this.updateState({ balance });
      this.addLog(`💰 Balance refreshed: ${balance} USDT`);
    } catch (error) {
      this.addLog(`❌ Error refreshing balance: ${error}`);
    }
  }

  // Position refresh via HTTP removed - using WebSocket only for real-time updates

  async refreshCandles(symbol: string, timeframe: string, limit: number) {
    try {
      const coinexAPI = await this.getCoinExAPI();
      const candles = await coinexAPI.fetchCandles(symbol, timeframe, limit);
      this.updateState({ candles });
      this.addLog(`🕯️ Candles refreshed for ${symbol} ${timeframe}`);
    } catch (error) {
      this.addLog(`❌ Error refreshing candles: ${error}`);
    }
  }


  // Monitor positions and automatically set take profit/stop loss after 5 seconds
  private positionMonitorInterval: NodeJS.Timeout | null = null;
  
  startPositionMonitor() {
    if (this.positionMonitorInterval) {
      clearInterval(this.positionMonitorInterval);
    }
    
    this.addLog('🔍 Starting position monitor for automatic TP/SL setting...');
    
    // Check every 5 seconds
    this.positionMonitorInterval = setInterval(async () => {
      try {
        await this.checkAndSetTakeProfitStopLoss();
      } catch (error) {
        this.addLog(`❌ Error in position monitor: ${error}`);
      }
    }, 5000);
  }
  
  stopPositionMonitor() {
    if (this.positionMonitorInterval) {
      clearInterval(this.positionMonitorInterval);
      this.positionMonitorInterval = null;
      this.addLog('🛑 Position monitor stopped');
    }
  }
  
  private async checkAndSetTakeProfitStopLoss() {
    try {
      const coinexAPI = await this.getCoinExAPI();
      const market = this.state.config?.symbol;
      
      if (!market) return;
      
      // Get current positions from WebSocket data
      const positions = this.state.activePositions.filter(p => p.market === market);
      
      if (positions.length === 0) {
        return; // No positions to monitor
      }
      
      this.addLog(`🔍 Monitoring ${positions.length} position(s) for TP/SL setting...`);
      
      for (const position of positions) {
        const entryPrice = parseFloat(position.avg_entry_price || '0');
        const hasTakeProfit = position.take_profit_price && parseFloat(position.take_profit_price) > 0;
        const hasStopLoss = position.stop_loss_price && parseFloat(position.stop_loss_price) > 0;
        
        // Only process positions that don't have TP/SL set yet
        if (!hasTakeProfit || !hasStopLoss) {
          this.addLog(`📊 Position ${position.market} needs TP/SL: Entry=${entryPrice}, TP=${hasTakeProfit}, SL=${hasStopLoss}`);
          
          // Get current price
          const currentPrice = await this.getCurrentPrice(market);
          if (!currentPrice || currentPrice <= 0) {
            this.addLog(`⚠️ Cannot get current price for ${market}, skipping TP/SL setting`);
            continue;
          }
          
          // Calculate TP/SL percentages based on position side
          const isLongPosition = position.side === 'buy' || position.side === 'long';
          const takeProfitPercent = 1.0; // 1% take profit
          const stopLossPercent = 1.0;   // 1% stop loss
          
          // Set take profit if not set
          if (!hasTakeProfit) {
            try {
              const takeProfitPrice = isLongPosition 
                ? entryPrice * (1 + takeProfitPercent / 100)
                : entryPrice * (1 - takeProfitPercent / 100);
              
              await coinexAPI.setTakeProfit(market, takeProfitPrice);
              this.addLog(`✅ Take Profit set for ${position.market}: ${takeProfitPrice.toFixed(4)} (${takeProfitPercent}%)`);
            } catch (error) {
              this.addLog(`❌ Failed to set Take Profit for ${position.market}: ${error}`);
            }
          }
          
          // Set stop loss if not set
          if (!hasStopLoss) {
            try {
              const stopLossPrice = isLongPosition 
                ? entryPrice * (1 - stopLossPercent / 100)
                : entryPrice * (1 + stopLossPercent / 100);
              
              await coinexAPI.setStopLoss(market, stopLossPrice);
              this.addLog(`✅ Stop Loss set for ${position.market}: ${stopLossPrice.toFixed(4)} (${stopLossPercent}%)`);
            } catch (error) {
              this.addLog(`❌ Failed to set Stop Loss for ${position.market}: ${error}`);
            }
          }
        } else {
          this.addLog(`✅ Position ${position.market} already has TP/SL set: TP=${position.take_profit_price}, SL=${position.stop_loss_price}`);
        }
      }
    } catch (error) {
      this.addLog(`❌ Error checking and setting TP/SL: ${error}`);
    }
  }
  
  private async getCurrentPrice(symbol: string): Promise<number | null> {
    try {
      // Try to get price from WebSocket data first
      if (this.state.currentPrice > 0) {
        return this.state.currentPrice;
      }
      
      // Fallback to HTTP API
      const coinexAPI = await this.getCoinExAPI();
      const marketData = await coinexAPI.fetchMarketData(symbol);
      return marketData?.price || null;
    } catch (error) {
      this.addLog(`❌ Error getting current price for ${symbol}: ${error}`);
      return null;
    }
  }

  // Auto-subscribe to position updates for a specific market
  private async autoSubscribeToPositionUpdates(market: string) {
    try {
      if (!this.wsManager) {
        this.addLog(`⚠️ WebSocket manager not available for auto-subscription to ${market}`);
        return;
      }
      
      // Check if already subscribed to positions for this market
      const isAlreadySubscribed = this.wsManager['positionSubscriptions']?.has(market);
      if (isAlreadySubscribed) {
        this.addLog(`ℹ️ Already subscribed to position updates for ${market}`);
        return;
      }
      
      this.addLog(`🔄 Auto-subscribing to position updates for ${market}...`);
      
      // Ensure WebSocket is authenticated before subscribing
      if (!this.wsManager['isAuthenticated']) {
        this.addLog(`⚠️ WebSocket not authenticated, waiting before subscribing to ${market}...`);
        // Wait a bit for authentication to complete
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      // Subscribe to position updates for this market
      const result = await this.wsManager.subscribeToPositions(market);
      if (result) {
        this.addLog(`✅ Auto-subscribed to position updates for ${market}`);
        
        // Track subscription to avoid duplicate subscriptions
        if (!this.wsManager['positionSubscriptions']) {
          this.wsManager['positionSubscriptions'] = new Set();
        }
        this.wsManager['positionSubscriptions'].add(market);
        
        // Also update the trading dashboard subscription form if needed
        this.updateDashboardSubscriptionState(market);
      } else {
        this.addLog(`❌ Failed to auto-subscribe to position updates for ${market}`);
      }
    } catch (error) {
      this.addLog(`❌ Error auto-subscribing to position updates for ${market}: ${error}`);
    }
  }

  // Update dashboard subscription state (optional enhancement)
  private updateDashboardSubscriptionState(market: string) {
    try {
      // This could emit an event or update state to reflect the new subscription
      this.addLog(`📡 Dashboard subscription state updated for ${market}`);
      
      // Emit event for UI components to update their subscription state
      this.emit('autoPositionSubscribed', { market, timestamp: new Date() });
    } catch (error) {
      this.addLog(`❌ Error updating dashboard subscription state for ${market}: ${error}`);
    }
  }

  // Change timeframe and resubscribe to WebSocket
  async changeTimeframe(newTimeframe: string) {
    if (!this.state.config || !this.wsManager) return;

    try {
      const oldTimeframe = mapUITimeframeToCoinEx(this.state.config.timeframe);
      const newCoinExTimeframe = mapUITimeframeToCoinEx(newTimeframe);
      
      if (oldTimeframe === newCoinExTimeframe) {
        this.addLog(`⏰ Timeframe already set to ${newTimeframe}`);
        return;
      }

      this.addLog(`🔄 Changing timeframe from ${this.state.config.timeframe} to ${newTimeframe}`);

      // Removed deprecated unsubscribe methods

      // Update config
      this.updateState({
        config: {
          ...this.state.config,
          timeframe: newTimeframe
        }
      });

      // Removed deprecated kline subscription - using only state.subscribe for price data

      // Fetch new candle data
      await this.refreshCandles(this.state.config.symbol, newTimeframe, 100);

      this.addLog(`✅ Timeframe changed to ${newTimeframe}`);

      // Emit timeframe change event
      this.emit('timeframeChanged', {
        oldTimeframe: this.state.config.timeframe,
        newTimeframe: newTimeframe
      });

    } catch (error) {
      this.addLog(`❌ Error changing timeframe: ${error}`);
    }
  }

  // Change symbol and resubscribe to WebSocket
  async changeSymbol(newSymbol: string) {
    if (!this.state.config || !this.wsManager) return;

    try {
      if (this.state.config.symbol === newSymbol) {
        this.addLog(`📊 Symbol already set to ${newSymbol}`);
        return;
      }

      this.addLog(`🔄 Changing symbol from ${this.state.config.symbol} to ${newSymbol}`);

      const timeframe = mapUITimeframeToCoinEx(this.state.config.timeframe);

      // Unsubscribe from essential streams for old symbol
      this.wsManager.unsubscribeFromState(this.state.config.symbol);

      // Update config
      this.updateState({
        config: {
          ...this.state.config,
          symbol: newSymbol
        }
      });

      // Subscribe to essential streams for new symbol (state.subscribe includes price data)
      this.wsManager.subscribeToState(newSymbol);

      // Fetch new data for new symbol
      await Promise.all([
        this.refreshMarketData(newSymbol),
        this.refreshCandles(newSymbol, this.state.config.timeframe, 100)
        // Note: Positions are updated via WebSocket only, no HTTP refresh needed
      ]);

      this.addLog(`✅ Symbol changed to ${newSymbol}`);

      // Emit symbol change event
      this.emit('symbolChanged', {
        oldSymbol: this.state.config.symbol,
        newSymbol: newSymbol
      });

    } catch (error) {
      this.addLog(`❌ Error changing symbol: ${error}`);
    }
  }

  // Helper method to determine position status based on various factors
  private determinePositionStatus(position: any, unrealizedPnl: number, realizedPnl: number): 'open' | 'closed' {
    // If position has explicit status from API, use it
    if (position.status === 'closed' || position.position_status === 'closed') {
      return 'closed';
    }
    
    // If position has zero open interest and significant realized PnL, it's likely closed
    if (parseFloat(position.open_interest || 0) === 0 && Math.abs(realizedPnl) > 0.01) {
      return 'closed';
    }
    
    // If position has settlement price and zero amount, it's likely closed
    if (position.settle_price && parseFloat(position.ath_position_amount || 0) === 0) {
      return 'closed';
    }
    
    // Default to open
    return 'open';
  }

  getState() {
    return this.state;
  }
}