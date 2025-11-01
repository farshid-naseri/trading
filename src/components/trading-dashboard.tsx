'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { TradingViewChart } from '@/components/tradingview-chart';
import { PositionManager } from '@/components/position-manager';
import { LivePriceDisplay } from '@/components/live-price-display';
import { ErrorBoundary } from '@/components/error-boundary';

import { AutoTradeTab } from '@/components/auto-trade-tab';
import { useTradingEngine, TradingConfig } from '@/hooks/use-trading-engine';
import { useApiCredentials } from '@/hooks/use-api-credentials';

import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  BarChart3, 
  Settings, 
  Activity,
  Play,
  Pause,
  Loader2,
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Clock,
  Bot,
  Brain,
  Zap,
  StopCircle,
  Power,
  Wifi,
  WifiOff,
  Signal,
  Target,
  Shield,
  TrendingUp as Trending,
  LineChart,
  BarChart
} from 'lucide-react';

interface TradingDashboardProps {
  initialConfig?: Partial<TradingConfig>;
}

export function TradingDashboard({ initialConfig }: TradingDashboardProps) {
  const {
    state,
    isInitialized,
    isLoading,
    error,
    initialize,
    start,
    stop,
    executeManualTrade,
    closePosition,
    emergencyStop,
    getPerformanceSummary,
    clearError,
    refreshData,
    changeTimeframe,
    changeSymbol,
    isConnected,
    isRunning,
    balance,
    equity,
    positions,
    positionLogs,
    openPositions,
    closedPositions,
    currentSignal,
    marketData,
    performance,
    logs,

    lastUpdate,
    performanceSummary,
    config,
    getWebSocketManager
  } = useTradingEngine();

  // Get API credentials from store
  const { apiKey, apiSecret, isConfigured } = useApiCredentials();

  const websocketManager = getWebSocketManager ? getWebSocketManager() : null;

  // useEffect برای لاگ کردن وضعیت WebSocketManager
  useEffect(() => {
    console.log(`[TradingDashboard] WebSocketManager updated:`, websocketManager);
    if (websocketManager) {
      console.log(`[TradingDashboard] WebSocketManager methods:`, Object.getOwnPropertyNames(Object.getPrototypeOf(websocketManager)));
    }
  }, [websocketManager]);

  const [activeTab, setActiveTab] = useState('dashboard');
  const [chartType, setChartType] = useState<'standard' | 'tradingview'>('standard');

  const [manualTradeForm, setManualTradeForm] = useState({
    symbol: 'XRPUSDT',
    side: 'buy' as 'buy' | 'sell',
    type: 'market' as 'market' | 'limit',
    amount: 20,
    amountUnit: 'coin' as 'coin', // فقط مقدار ارز کارنسی
    price: '',
    leverage: 5, // مقدار پیش‌فرض اهرم
    marginMode: 'cross' as 'cross' | 'isolated', // مقدار پیش‌فرض مارجین مد
    takeProfit: '', // حد سود
    stopLoss: '', // حد ضرر
    takeProfitPercent: '', // حد سود به درصد
    stopLossPercent: '', // حد ضرر به درصد
    enableTakeProfit: false, // فعال‌سازی حد سود
    enableStopLoss: false, // فعال‌سازی حد ضرر
    usePercentageForTP: false, // استفاده از درصد برای حد سود
    usePercentageForSL: false, // استفاده از درصد برای حد ضرر
    enableTrailingTP: false, // فعال‌سازی حد سود متحرک
    enableTrailingSL: false, // فعال‌سازی حد ضرر متحرک
    trailingDistance: 0.5, // فاصله trailing به درصد
  });

  // State for subscription settings (simplified - only state.subscribe is used)
  const [subscriptionForm, setSubscriptionForm] = useState({
    symbol: 'XRPUSDT',
    timeframe: '5m',
    enableState: true, // Only essential subscription
    enablePositions: false, // Position subscription for real-time position updates
  });

  const [marketInfo, setMarketInfo] = useState<any>(null);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null); // قیمت از LivePriceDisplay

  // تابع برای دریافت اطلاعات بازار شامل ارز پایه و قیمت
  const fetchMarketInfo = async (symbol: string) => {
    try {
      const { useCoinExAPI } = await import('@/lib/coinex-api');
      
      useCoinExAPI.getState().setConfig({
        apiKey: 'temp',
        apiSecret: 'temp',
        baseUrl: 'https://api.coinex.com',
        futuresBaseUrl: 'https://api.coinex.com',
        useProxy: true
      });

      return await useCoinExAPI.getState().fetchMarketData(symbol);
    } catch (error) {
      console.error('Error fetching market info:', error);
      return null;
    }
  };


  // تابع برای محاسبه قیمت حد سود بر اساس درصد
  const calculateTakeProfitPrice = (entryPrice: number, percent: number, side: 'buy' | 'sell') => {
    if (side === 'buy') {
      return entryPrice * (1 + percent / 100);
    } else {
      return entryPrice * (1 - percent / 100);
    }
  };

  // تابع برای محاسبه قیمت حد ضرر بر اساس درصد
  const calculateStopLossPrice = (entryPrice: number, percent: number, side: 'buy' | 'sell') => {
    if (side === 'buy') {
      return entryPrice * (1 - percent / 100);
    } else {
      return entryPrice * (1 + percent / 100);
    }
  };

  // تابع برای محاسبه قیمت trailing stop
  const calculateTrailingStopPrice = (currentPrice: number, entryPrice: number, percent: number, side: 'buy' | 'sell') => {
    if (side === 'buy') {
      const newStopLoss = currentPrice * (1 - percent / 100);
      return Math.max(newStopLoss, entryPrice * (1 - percent / 100));
    } else {
      const newStopLoss = currentPrice * (1 + percent / 100);
      return Math.min(newStopLoss, entryPrice * (1 + percent / 100));
    }
  };

  // وقتی نماد تغییر کرد، اطلاعات بازار را به‌روز کن
  useEffect(() => {
    if (manualTradeForm.symbol) {
      fetchMarketInfo(manualTradeForm.symbol).then(info => {
        if (info) {
          setMarketInfo(info);
        }
      });
    }
  }, [manualTradeForm.symbol]);



  // Initialize trading engine when component mounts
  useEffect(() => {
    const initializeTradingEngine = async () => {
      try {
        // Check localStorage accessibility
        console.log('[TradingDashboard] Checking localStorage accessibility...');
        const testKey = 'test_storage';
        localStorage.setItem(testKey, 'test');
        localStorage.removeItem(testKey);
        console.log('[TradingDashboard] localStorage is accessible');

        // Get API config from localStorage or use default config
        let config: TradingConfig = {} as TradingConfig;
        try {
          const storedConfig = localStorage.getItem('tradingConfig');
          if (storedConfig) {
            config = JSON.parse(storedConfig);
            console.log('[TradingDashboard] Loaded config from localStorage:', { ...config, apiSecret: '***' });
          } else {
            console.log('[TradingDashboard] No config found in localStorage, using default');
          }
        } catch (error) {
          console.error('[TradingDashboard] Error reading trading config from localStorage:', error);
        }
        
        // Use default configuration if not properly configured
        if (!isConfigured || !apiKey || !apiSecret) {
          console.log('[TradingDashboard] API configuration not found in store - using default configuration');
          // Don't initialize with invalid credentials
          config = {
            ...config,
            apiKey: 'A2445DB8D9D24AC098AF3C896AF76FDF', // Use the API key from the original code
            apiSecret: 'temp', // Use temp API secret for now - user should configure in API Config tab
            symbol: config.symbol || 'XRPUSDT',
            timeframe: config.timeframe || '5m',
            atrPeriod: config.atrPeriod || 10,
            multiplier: config.multiplier || 3,
            profitPercent: config.profitPercent || 1,
            lossPercent: config.lossPercent || 1,
            trailPercent: config.trailPercent || 0.5,
            amountUsdt: config.amountUsdt || 20,
            leverage: config.leverage || 5,
            marginMode: config.marginMode || 'cross',
            useAI: config.useAI || false,
            autoTrade: config.autoTrade || false
          };
        } else {
          // Use the configured credentials
          console.log('[TradingDashboard] Using API credentials from store');
          config = {
            ...config,
            apiKey,
            apiSecret,
            symbol: config.symbol || 'XRPUSDT',
            timeframe: config.timeframe || '5m',
            atrPeriod: config.atrPeriod || 10,
            multiplier: config.multiplier || 3,
            profitPercent: config.profitPercent || 1,
            lossPercent: config.lossPercent || 1,
            trailPercent: config.trailPercent || 0.5,
            amountUsdt: config.amountUsdt || 20,
            leverage: config.leverage || 5,
            marginMode: config.marginMode || 'cross',
            useAI: config.useAI || false,
            autoTrade: config.autoTrade || false
          };
        }
        
        console.log('[TradingDashboard] Final trading config:', { ...config, apiSecret: '***' });

        // Initialize with default configuration
        try {
          const success = await initialize(config);
          if (success) {
            console.log('Trading engine initialized successfully');
            // Save the valid config to localStorage for future use
            try {
              localStorage.setItem('tradingConfig', JSON.stringify(config));
              console.log('[TradingDashboard] Config saved to localStorage');
              
              // Initialize subscription form with config values
              setSubscriptionForm(prev => ({
                ...prev,
                symbol: config.symbol || 'XRPUSDT',
                timeframe: config.timeframe || '5m'
              }));
              console.log('[TradingDashboard] Subscription form initialized with config values');
              
              // Initialize manual trade form with config values
              setManualTradeForm(prev => ({
                ...prev,
                symbol: config.symbol || 'XRPUSDT'
              }));
              console.log('[TradingDashboard] Manual trade form initialized with config values');
            } catch (saveError) {
              console.error('[TradingDashboard] Error saving config to localStorage:', saveError);
            }
            
            // Fetch initial price after successful initialization
            console.log('[TradingDashboard] Fetching initial price after initialization...');
            setTimeout(() => {
              fetchCurrentPrice(config.symbol || 'XRPUSDT');
            }, 1000);
          } else {
            console.error('Failed to initialize trading engine');
            // Don't throw error here, just show warning
            alert('Warning: Trading engine initialization failed. Some features may not work.');
          }
        } catch (initError) {
          console.error('Error during trading engine initialization:', initError);
          // Don't block the UI, just show warning
          alert('Warning: Trading engine initialization failed. Some features may not work.');
        }
      } catch (error) {
        console.error('Error initializing trading engine:', error);
        // Show error to user but don't block the UI
        alert(`Initialization Warning: ${error instanceof Error ? error.message : 'Unknown error'}. Some features may not work.`);
      }
    };

    if (!isInitialized) {
      initializeTradingEngine();
    }
  }, [initialize, isInitialized]);

  // Enable default subscriptions when trading engine is initialized
  useEffect(() => {
    if (isInitialized && websocketManager) {
      console.log('[TradingDashboard] Enabling default WebSocket subscriptions...');
      
      // Enable all subscriptions by default
      const symbol = subscriptionForm.symbol;
      const timeframe = subscriptionForm.timeframe;
      
      // Map UI timeframe to CoinEx timeframe
      import('@/lib/coinex-timeframes').then(({ mapUITimeframeToCoinEx }) => {
        const coinExTimeframe = mapUITimeframeToCoinEx(timeframe);
        
        console.log(`[TradingDashboard] Subscribing to essential data streams for ${symbol}`);
        
        // Subscribe to essential data streams (state.subscribe includes all price data)
        if (subscriptionForm.enableState) {
          websocketManager.subscribeToState(symbol);
        }
        
        // Subscribe to position updates if enabled
        if (subscriptionForm.enablePositions) {
          websocketManager.subscribeToPositions(symbol);
        }
        
        console.log('[TradingDashboard] Essential subscriptions enabled');
      });
    }
  }, [isInitialized, websocketManager, subscriptionForm.symbol, subscriptionForm.timeframe, subscriptionForm.enableState, subscriptionForm.enablePositions]);

  // Auto-refresh logs
  useEffect(() => {
    const logsContainer = document.getElementById('logs-container');
    if (logsContainer) {
      logsContainer.scrollTop = logsContainer.scrollHeight;
    }
  }, [logs]);

  // Fetch initial price when component mounts
  useEffect(() => {
    console.log('[TradingDashboard] Component mounted, fetching initial price...');
    // Small delay to ensure everything is ready
    setTimeout(() => {
      fetchCurrentPrice(manualTradeForm.symbol);
    }, 500);
  }, []); // Empty dependency array means this runs once on mount

  const handleStart = async () => {
    try {
      await start();
    } catch (error) {
      console.error('Start error:', error);
    }
  };

  const handleStop = async () => {
    try {
      await stop();
    } catch (error) {
      console.error('Stop error:', error);
    }
  };

  const handleTimeframeChange = async (newTimeframe: string) => {
    if (!isInitialized) return;
    
    try {
      await changeTimeframe(newTimeframe);
      console.log(`Timeframe changed to ${newTimeframe}`);
    } catch (error) {
      console.error('Timeframe change error:', error);
    }
  };

  const handleSymbolChange = async (newSymbol: string) => {
    if (!isInitialized) return;
    
    try {
      await changeSymbol(newSymbol);
      console.log(`Symbol changed to ${newSymbol}`);
      // Update subscription form symbol as well
      setSubscriptionForm(prev => ({ ...prev, symbol: newSymbol }));
    } catch (error) {
      console.error('Symbol change error:', error);
    }
  };

  // Handle subscription timeframe changes
  const handleSubscriptionTimeframeChange = async (newTimeframe: string) => {
    if (!isInitialized) return;
    
    try {
      setSubscriptionForm(prev => ({ ...prev, timeframe: newTimeframe }));
      // Also update the main timeframe for trading engine
      await changeTimeframe(newTimeframe);
      console.log(`Subscription timeframe changed to ${newTimeframe}`);
    } catch (error) {
      console.error('Subscription timeframe change error:', error);
    }
  };

  const handleSubscriptionToggle = async (type: keyof typeof subscriptionForm, value: boolean) => {
    if (!isInitialized || !websocketManager) {
      console.log(`❌ Cannot toggle subscription - isInitialized: ${isInitialized}, websocketManager: ${!!websocketManager}`);
      return;
    }
    
    try {
      // Get current values before updating state
      const currentSymbol = subscriptionForm.symbol;
      const currentTimeframe = subscriptionForm.timeframe;
      
      // Update the form state
      setSubscriptionForm(prev => ({ ...prev, [type]: value }));
      
      // Map UI timeframe to CoinEx timeframe
      const { mapUITimeframeToCoinEx } = await import('@/lib/coinex-timeframes');
      const coinExTimeframe = mapUITimeframeToCoinEx(currentTimeframe);
      
      console.log(`🔄 Toggling ${type} subscription to ${value} for ${currentSymbol} (${coinExTimeframe})`);
      
      // Handle subscription/unsubscription based on type
      switch (type) {
        case 'enableState':
          if (value) {
            console.log(`📋 Subscribing to state for ${currentSymbol} (includes all price data)`);
            websocketManager.subscribeToState(currentSymbol);
          } else {
            console.log(`📋 Unsubscribing from state for ${currentSymbol}`);
            websocketManager.unsubscribeFromState(currentSymbol);
          }
          break;
        case 'enablePositions':
          if (value) {
            console.log(`📋 Subscribing to positions for ${currentSymbol}`);
            websocketManager.subscribeToPositions(currentSymbol);
          } else {
            console.log(`📋 Unsubscribing from positions for ${currentSymbol}`);
            websocketManager.unsubscribeFromPositions(currentSymbol);
          }
          break;
        default:
          console.log(`⚠️ Subscription type ${type} is deprecated - only state.subscribe is available`);
          break;
      }
      
      console.log(`✅ ${type} subscription toggled to ${value} for ${currentSymbol}`);
    } catch (error) {
      console.error('❌ Subscription toggle error:', error);
    }
  };

  const handleEmergencyStop = async () => {
    if (window.confirm('Are you sure you want to emergency stop? This will close all positions immediately.')) {
      try {
        await emergencyStop();
      } catch (error) {
        console.error('Emergency stop error:', error);
      }
    }
  };

  // تابع اجرای معامله برای سیگنال‌های استراتژی
  const executeStrategyTrade = async (params: {
    symbol: string;
    amount: number;
    side: 'buy' | 'sell';
    leverage: number;
    marginMode: 'cross' | 'isolated';
    takeProfitPercent?: number;
    stopLossPercent?: number;
    enableTakeProfit?: boolean;
    enableStopLoss?: boolean;
  }) => {
    try {
      // تنظیم فرم معامله دستی با پارامترهای استراتژی
      setManualTradeForm(prev => ({
        ...prev,
        symbol: params.symbol,
        amount: params.amount,
        leverage: params.leverage,
        marginMode: params.marginMode,
        takeProfitPercent: params.takeProfitPercent || 1,
        stopLossPercent: params.stopLossPercent || 1,
        enableTakeProfit: params.enableTakeProfit ?? true,
        enableStopLoss: params.enableStopLoss ?? true,
        type: 'market' // همیشه از نوع مارکت برای استراتژی
      }));

      // اجرای معامله با ساید مشخص شده
      await executeTradeWithSide(params.side);
      
      return { success: true, message: 'Strategy trade executed successfully' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Strategy trade execution error:', error);
      return { success: false, message: errorMessage };
    }
  };

  const handleManualBuy = async () => {
    // تنظیم ساید به buy و اجرای معامله
    await executeTradeWithSide('buy');
  };

  const handleManualSell = async () => {
    // تنظیم ساید به sell و اجرای معامله
    await executeTradeWithSide('sell');
  };

  const executeTradeWithSide = async (side: 'buy' | 'sell') => {
    // اعتبارسنجی مقادیر ضروری
    if (!manualTradeForm.symbol) {
      alert('لطفاً نماد معاملاتی را وارد کنید');
      return;
    }
    
    if (manualTradeForm.amount <= 0) {
      alert('مبلغ معامله باید بزرگتر از صفر باشد');
      return;
    }
    
    if (manualTradeForm.type === 'limit' && !manualTradeForm.price) {
      alert('لطفاً قیمت را برای معامله از نوع limit وارد کنید');
      return;
    }
    
    if (manualTradeForm.leverage < 1 || manualTradeForm.leverage > 125) {
      alert('اهرم باید بین 1 تا 125 باشد');
      return;
    }
    
    // اعتبارسنجی حد سود و حد ضرر
    if (manualTradeForm.enableTakeProfit) {
      if (manualTradeForm.usePercentageForTP) {
        if (!manualTradeForm.takeProfitPercent) {
          alert('لطفاً درصد حد سود را وارد کنید');
          return;
        }
        const takeProfitPercentValue = parseFloat(manualTradeForm.takeProfitPercent);
        if (isNaN(takeProfitPercentValue) || takeProfitPercentValue <= 0) {
          alert('درصد حد سود باید یک عدد مثبت باشد');
          return;
        }
      } else {
        if (!manualTradeForm.takeProfit) {
          alert('لطفاً قیمت حد سود را وارد کنید');
          return;
        }
        const takeProfitValue = parseFloat(manualTradeForm.takeProfit);
        if (isNaN(takeProfitValue) || takeProfitValue <= 0) {
          alert('قیمت حد سود باید یک عدد مثبت باشد');
          return;
        }
      }
    }
    
    if (manualTradeForm.enableStopLoss) {
      if (manualTradeForm.usePercentageForSL) {
        if (!manualTradeForm.stopLossPercent) {
          alert('لطفاً درصد حد ضرر را وارد کنید');
          return;
        }
        const stopLossPercentValue = parseFloat(manualTradeForm.stopLossPercent);
        if (isNaN(stopLossPercentValue) || stopLossPercentValue <= 0) {
          alert('درصد حد ضرر باید یک عدد مثبت باشد');
          return;
        }
      } else {
        if (!manualTradeForm.stopLoss) {
          alert('لطفاً قیمت حد ضرر را وارد کنید');
          return;
        }
        const stopLossValue = parseFloat(manualTradeForm.stopLoss);
        if (isNaN(stopLossValue) || stopLossValue <= 0) {
          alert('قیمت حد ضرر باید یک عدد مثبت باشد');
          return;
        }
      }
    }

    try {
      // اگر حد سود یا حد ضرر به صورت درصدی است، ابتدا بدون آنها معامله را اجرا می‌کنیم
      const useDelayedTPSL = manualTradeForm.enableTakeProfit && manualTradeForm.usePercentageForTP || 
                            manualTradeForm.enableStopLoss && manualTradeForm.usePercentageForSL;

      if (useDelayedTPSL) {
        // اجرای معامله بدون حد سود و حد ضرر
        await executeManualTrade({
          ...manualTradeForm,
          side: side, // استفاده از ساید ارسالی
          price: manualTradeForm.type === 'limit' && manualTradeForm.price ? parseFloat(manualTradeForm.price) : undefined,
          takeProfit: undefined, // ابتدا بدون حد سود
          stopLoss: undefined, // ابتدا بدون حد ضرر
          useDelayedTPSL: true, // فعال‌سازی حالت تأخیر
          takeProfitPercent: manualTradeForm.enableTakeProfit && manualTradeForm.usePercentageForTP ? parseFloat(manualTradeForm.takeProfitPercent) : undefined,
          stopLossPercent: manualTradeForm.enableStopLoss && manualTradeForm.usePercentageForSL ? parseFloat(manualTradeForm.stopLossPercent) : undefined,
          enableTrailingTP: manualTradeForm.enableTrailingTP,
          enableTrailingSL: manualTradeForm.enableTrailingSL,
          trailingDistance: manualTradeForm.trailingDistance
        });
      } else {
        // اجرای معامله با حد سود و حد ضرر معمولی
        await executeManualTrade({
          ...manualTradeForm,
          side: side, // استفاده از ساید ارسالی
          price: manualTradeForm.type === 'limit' && manualTradeForm.price ? parseFloat(manualTradeForm.price) : undefined,
          takeProfit: manualTradeForm.enableTakeProfit ? parseFloat(manualTradeForm.takeProfit) : undefined,
          stopLoss: manualTradeForm.enableStopLoss ? parseFloat(manualTradeForm.stopLoss) : undefined
        });
      }
    } catch (error) {
      console.error('Manual trade error:', error);
      alert('خطا در اجرای معامله: ' + (error instanceof Error ? error.message : 'خطای ناشناخته'));
    }
  };

  const formatCurrency = (value: number | undefined | null) => {
    if (value === undefined || value === null || isNaN(value)) {
      return '$0.00';
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  const formatPercent = (value: number | undefined | null) => {
    if (value === undefined || value === null || isNaN(value)) {
      return '0.00%';
    }
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  const formatNumber = (value: number | undefined | null) => {
    if (value === undefined || value === null || isNaN(value)) {
      return '0.00';
    }
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  const getSignalColor = (type: string) => {
    switch (type) {
      case 'buy': return 'text-green-600';
      case 'sell': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getSignalIcon = (type: string) => {
    switch (type) {
      case 'buy': return <TrendingUp className="h-4 w-4" />;
      case 'sell': return <TrendingDown className="h-4 w-4" />;
      default: return <Signal className="h-4 w-4" />;
    }
  };

  const getStatusColor = () => {
    if (!isInitialized) return 'bg-gray-500';
    if (!isConnected) return 'bg-red-500';
    if (isRunning) return 'bg-green-500';
    return 'bg-yellow-500';
  };

  const getStatusText = () => {
    if (!isInitialized) return 'Not Initialized';
    if (!isConnected) return 'Disconnected';
    if (isRunning) return 'Running';
    return 'Connected';
  };

  return (
    <div className="container mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Brain className="h-8 w-8 text-blue-600" />
            AI Trading Dashboard
          </h1>
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${getStatusColor()}`} />
            <span className="text-sm text-muted-foreground">{getStatusText()}</span>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          {isConnected && (
            <Badge variant={isRunning ? "default" : "secondary"}>
              {isRunning ? <Activity className="h-3 w-3 mr-1" /> : <Clock className="h-3 w-3 mr-1" />}
              {isRunning ? "Active" : "Idle"}
            </Badge>
          )}
          
          {config?.useAI && isRunning && (
            <Badge variant="outline" className="text-green-600">
              <Bot className="h-3 w-3 mr-1" />
              AI Active
            </Badge>
          )}

        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>{error}</span>
            <Button variant="ghost" size="sm" onClick={clearError}>
              Dismiss
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Control Panel */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Control Panel
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-4">
            {!isRunning ? (
              <Button onClick={handleStart} disabled={isLoading || !isInitialized}>
                <Play className="h-4 w-4 mr-2" />
                Start Trading
              </Button>
            ) : (
              <Button onClick={handleStop} disabled={isLoading} variant="outline">
                <Pause className="h-4 w-4 mr-2" />
                Stop Trading
              </Button>
            )}

            <Button 
              onClick={handleEmergencyStop} 
              disabled={isLoading || !isRunning} 
              variant="destructive"
            >
              <StopCircle className="h-4 w-4 mr-2" />
              Emergency Stop
            </Button>

            <div className="flex items-center space-x-4 text-sm">
              <div className="flex items-center space-x-1">
                <Wifi className={`h-4 w-4 ${isConnected ? 'text-green-600' : 'text-red-600'}`} />
                <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
              </div>
              
              <div className="flex items-center space-x-1">
                <DollarSign className="h-4 w-4" />
                <span>{formatCurrency(balance)}</span>
              </div>

              {currentSignal && (
                <div className={`flex items-center space-x-1 ${getSignalColor(currentSignal.type)}`}>
                  {getSignalIcon(currentSignal.type)}
                  <span>{currentSignal.type.toUpperCase()} Signal</span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
  
          <TabsTrigger value="trading">Trading</TabsTrigger>
          <TabsTrigger value="positions">Positions</TabsTrigger>
          <TabsTrigger value="position-logs">Position Logs</TabsTrigger>
          <TabsTrigger value="auto-trade">Auto Trade</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>

        {/* Dashboard Tab */}
        <TabsContent value="dashboard" className="space-y-4">
          <div className="grid grid-cols-1 gap-6">
            {/* Dashboard content can be added here later if needed */}
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Account Info */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Account Info
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span>Balance</span>
                    <span className="font-mono font-bold">{formatCurrency(balance)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Equity</span>
                    <span className="font-mono">{formatCurrency(equity)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Symbol</span>
                    <span className="font-mono">{config?.symbol}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Leverage</span>
                    <span className="font-mono">{config?.leverage}x</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Open Positions</span>
                    <Badge variant="outline">{openPositions.length}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Performance */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trending className="h-5 w-5" />
                  Performance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span>Total Trades</span>
                    <span className="font-mono">{performance.totalTrades}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Win Rate</span>
                    <span className={`font-mono ${performance.winRate >= 50 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatPercent(performance.winRate)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Profit Factor</span>
                    <span className="font-mono">{formatNumber(performance.profitFactor)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Max Drawdown</span>
                    <span className={`font-mono ${performance.maxDrawdown > 20 ? 'text-red-600' : 'text-yellow-600'}`}>
                      {formatPercent(performance.maxDrawdown)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Total Return</span>
                    <span className={`font-mono ${performance.totalReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatPercent(performance.totalReturn)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Current Signal */}
          {currentSignal && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Signal className="h-5 w-5" />
                  Current Signal
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    {getSignalIcon(currentSignal.type)}
                    <span className={`text-lg font-semibold ${getSignalColor(currentSignal.type)}`}>
                      {currentSignal.type.toUpperCase()} SIGNAL
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-muted-foreground">Price</div>
                    <div className="font-mono">{formatNumber(currentSignal.price)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-muted-foreground">Strength</div>
                    <div className="font-mono">{currentSignal.strength}%</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-muted-foreground">Confidence</div>
                    <div className="font-mono">{currentSignal.confidence}%</div>
                  </div>
                </div>
                <div className="mt-2 text-sm text-muted-foreground">
                  {currentSignal.reason}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

  


        {/* Trading Tab */}
        <TabsContent value="trading" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Manual Trading */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Manual Trading
                </CardTitle>
                <CardDescription>
                  Execute manual trades
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Live Price Display */}
                <LivePriceDisplay 
                  symbol={manualTradeForm.symbol}
                  marketInfo={marketInfo}
                  websocketManager={websocketManager}
                  onPriceUpdate={setCurrentPrice}
                />

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="tradeSymbol">Symbol</Label>
                    <Select value={manualTradeForm.symbol} onValueChange={async (value) => {
                      setManualTradeForm(prev => ({ ...prev, symbol: value }));
                      // Also update subscription form when manual trading symbol changes
                      setSubscriptionForm(prev => ({ ...prev, symbol: value }));
                      // Also update the main symbol for trading engine
                      await changeSymbol(value);
                      console.log(`Symbol changed to ${value}`);
                    }}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="BTCUSDT">BTC/USDT</SelectItem>
                        <SelectItem value="ETHUSDT">ETH/USDT</SelectItem>
                        <SelectItem value="XRPUSDT">XRP/USDT</SelectItem>
                        <SelectItem value="ADAUSDT">ADA/USDT</SelectItem>
                        <SelectItem value="DOTUSDT">DOT/USDT</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

  

                  <div className="space-y-2">
                    <Label htmlFor="tradeType">Type</Label>
                    <Select value={manualTradeForm.type} onValueChange={(value) => setManualTradeForm(prev => ({ ...prev, type: value as 'market' | 'limit' }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="market">Market</SelectItem>
                        <SelectItem value="limit">Limit</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="tradeTimeframe">Timeframe</Label>
                    <Select value={subscriptionForm.timeframe} onValueChange={(value) => {
                      setSubscriptionForm(prev => ({ ...prev, timeframe: value }));
                      // Also update the main timeframe for trading engine
                      handleSubscriptionTimeframeChange(value);
                    }}>
                      <SelectTrigger>
                        <SelectValue />
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
                        <SelectItem value="6h">6 Hours</SelectItem>
                        <SelectItem value="12h">12 Hours</SelectItem>
                        <SelectItem value="1d">1 Day</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="tradeAmount">Amount ({marketInfo?.baseCcy || manualTradeForm.symbol.replace('USDT', '')})</Label>
                    <div className="flex gap-2">
                      <Input
                        id="tradeAmount"
                        type="number"
                        min="1"
                        value={manualTradeForm.amount}
                        onChange={(e) => setManualTradeForm(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))}
                        className="w-full"
                      />
                    </div>
                    
                    {/* نمایش محاسبه مقدار USDT */}
                    {currentPrice && manualTradeForm.amount > 0 && (
                      <div className="text-sm text-green-600 bg-green-50 p-2 rounded border border-green-200">
                        <span className="font-medium">Estimated {marketInfo?.quoteCcy || 'USDT'} Value:</span>{' '}
                        {(manualTradeForm.amount * currentPrice).toFixed(marketInfo?.precision?.quote || 2)} {marketInfo?.quoteCcy || 'USDT'}
                        <br />
                        <span className="text-xs text-green-500">Current Price: {currentPrice} {marketInfo?.quoteCcy || 'USDT'}</span>
                      </div>
                    )}
                    
                    {!currentPrice && (
                      <div className="text-sm text-gray-500">Waiting for price data...</div>
                    )}
                  </div>

                  {manualTradeForm.type === 'limit' && (
                    <div className="space-y-2 col-span-2">
                      <Label htmlFor="tradePrice">Price</Label>
                      <Input
                        id="tradePrice"
                        type="number"
                        step="0.0001"
                        value={manualTradeForm.price}
                        onChange={(e) => setManualTradeForm(prev => ({ ...prev, price: e.target.value }))}
                        placeholder="Enter limit price"
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="tradeLeverage">Leverage</Label>
                    <Input
                      id="tradeLeverage"
                      type="number"
                      min="1"
                      max="125"
                      value={manualTradeForm.leverage}
                      onChange={(e) => setManualTradeForm(prev => ({ ...prev, leverage: parseInt(e.target.value) || 1 }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="tradeMarginMode">Margin Mode</Label>
                    <Select value={manualTradeForm.marginMode} onValueChange={(value) => setManualTradeForm(prev => ({ ...prev, marginMode: value as 'cross' | 'isolated' }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cross">Cross</SelectItem>
                        <SelectItem value="isolated">Isolated</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Take Profit Section */}
                  <div className="space-y-2 col-span-2">
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="takeProfitSwitch"
                        checked={manualTradeForm.enableTakeProfit}
                        onCheckedChange={(checked) => setManualTradeForm(prev => ({ ...prev, enableTakeProfit: checked }))}
                      />
                      <Label htmlFor="takeProfitSwitch">Take Profit</Label>
                    </div>
                    {manualTradeForm.enableTakeProfit && (
                      <div className="mt-2 space-y-3">
                        {/* انتخاب بین قیمت و درصد */}
                        <div className="flex items-center space-x-4">
                          <div className="flex items-center space-x-2">
                            <Switch
                              id="usePercentageForTP"
                              checked={manualTradeForm.usePercentageForTP}
                              onCheckedChange={(checked) => setManualTradeForm(prev => ({ ...prev, usePercentageForTP: checked }))}
                            />
                            <Label htmlFor="usePercentageForTP">Use Percentage</Label>
                          </div>
                          {manualTradeForm.usePercentageForTP && (
                            <div className="flex items-center space-x-2">
                              <Switch
                                id="enableTrailingTP"
                                checked={manualTradeForm.enableTrailingTP}
                                onCheckedChange={(checked) => setManualTradeForm(prev => ({ ...prev, enableTrailingTP: checked }))}
                              />
                              <Label htmlFor="enableTrailingTP">Trailing</Label>
                            </div>
                          )}
                        </div>
                        
                        {/* فیلد قیمت یا درصد */}
                        {manualTradeForm.usePercentageForTP ? (
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <Label htmlFor="takeProfitPercent">Take Profit (%)</Label>
                              <Input
                                id="takeProfitPercent"
                                type="number"
                                step="0.1"
                                min="0.1"
                                value={manualTradeForm.takeProfitPercent}
                                onChange={(e) => setManualTradeForm(prev => ({ ...prev, takeProfitPercent: e.target.value }))}
                                placeholder="e.g., 2.5"
                              />
                            </div>
                            {manualTradeForm.enableTrailingTP && (
                              <div>
                                <Label htmlFor="trailingDistanceTP">Trailing Distance (%)</Label>
                                <Input
                                  id="trailingDistanceTP"
                                  type="number"
                                  step="0.01"
                                  min="0.01"
                                  value={manualTradeForm.trailingDistance}
                                  onChange={(e) => setManualTradeForm(prev => ({ ...prev, trailingDistance: parseFloat(e.target.value) || 0.5 }))}
                                  placeholder="e.g., 0.5"
                                />
                              </div>
                            )}
                          </div>
                        ) : (
                          <div>
                            <Label htmlFor="takeProfit">Take Profit Price</Label>
                            <Input
                              id="takeProfit"
                              type="number"
                              step="0.0001"
                              min="0"
                              value={manualTradeForm.takeProfit}
                              onChange={(e) => setManualTradeForm(prev => ({ ...prev, takeProfit: e.target.value }))}
                              placeholder="Enter take profit price"
                            />
                          </div>
                        )}
                        
                        {/* نمایش محاسبه قیمت تخمینی اگر درصد استفاده شود */}
                        {manualTradeForm.usePercentageForTP && manualTradeForm.takeProfitPercent && currentPrice && (
                          <div className="text-sm text-blue-600 bg-blue-50 p-2 rounded border border-blue-200">
                            <span className="font-medium">Estimated Take Profit Price:</span>{' '}
                            {calculateTakeProfitPrice(currentPrice, parseFloat(manualTradeForm.takeProfitPercent), manualTradeForm.side).toFixed(marketInfo?.precision?.price || 4)} {marketInfo?.quoteCcy || 'USDT'}
                            <br />
                            <span className="text-xs text-blue-500">Current Price: {currentPrice} {marketInfo?.quoteCcy || 'USDT'}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Stop Loss Section */}
                  <div className="space-y-2 col-span-2">
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="stopLossSwitch"
                        checked={manualTradeForm.enableStopLoss}
                        onCheckedChange={(checked) => setManualTradeForm(prev => ({ ...prev, enableStopLoss: checked }))}
                      />
                      <Label htmlFor="stopLossSwitch">Stop Loss</Label>
                    </div>
                    {manualTradeForm.enableStopLoss && (
                      <div className="mt-2 space-y-3">
                        {/* انتخاب بین قیمت و درصد */}
                        <div className="flex items-center space-x-4">
                          <div className="flex items-center space-x-2">
                            <Switch
                              id="usePercentageForSL"
                              checked={manualTradeForm.usePercentageForSL}
                              onCheckedChange={(checked) => setManualTradeForm(prev => ({ ...prev, usePercentageForSL: checked }))}
                            />
                            <Label htmlFor="usePercentageForSL">Use Percentage</Label>
                          </div>
                          {manualTradeForm.usePercentageForSL && (
                            <div className="flex items-center space-x-2">
                              <Switch
                                id="enableTrailingSL"
                                checked={manualTradeForm.enableTrailingSL}
                                onCheckedChange={(checked) => setManualTradeForm(prev => ({ ...prev, enableTrailingSL: checked }))}
                              />
                              <Label htmlFor="enableTrailingSL">Trailing</Label>
                            </div>
                          )}
                        </div>
                        
                        {/* فیلد قیمت یا درصد */}
                        {manualTradeForm.usePercentageForSL ? (
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <Label htmlFor="stopLossPercent">Stop Loss (%)</Label>
                              <Input
                                id="stopLossPercent"
                                type="number"
                                step="0.1"
                                min="0.1"
                                value={manualTradeForm.stopLossPercent}
                                onChange={(e) => setManualTradeForm(prev => ({ ...prev, stopLossPercent: e.target.value }))}
                                placeholder="e.g., 1.5"
                              />
                            </div>
                            {manualTradeForm.enableTrailingSL && (
                              <div>
                                <Label htmlFor="trailingDistanceSL">Trailing Distance (%)</Label>
                                <Input
                                  id="trailingDistanceSL"
                                  type="number"
                                  step="0.01"
                                  min="0.01"
                                  value={manualTradeForm.trailingDistance}
                                  onChange={(e) => setManualTradeForm(prev => ({ ...prev, trailingDistance: parseFloat(e.target.value) || 0.5 }))}
                                  placeholder="e.g., 0.5"
                                />
                              </div>
                            )}
                          </div>
                        ) : (
                          <div>
                            <Label htmlFor="stopLoss">Stop Loss Price</Label>
                            <Input
                              id="stopLoss"
                              type="number"
                              step="0.0001"
                              min="0"
                              value={manualTradeForm.stopLoss}
                              onChange={(e) => setManualTradeForm(prev => ({ ...prev, stopLoss: e.target.value }))}
                              placeholder="Enter stop loss price"
                            />
                          </div>
                        )}
                        
                        {/* نمایش محاسبه قیمت تخمینی اگر درصد استفاده شود */}
                        {manualTradeForm.usePercentageForSL && manualTradeForm.stopLossPercent && currentPrice && (
                          <div className="text-sm text-red-600 bg-red-50 p-2 rounded border border-red-200">
                            <span className="font-medium">Estimated Stop Loss Price:</span>{' '}
                            {calculateStopLossPrice(currentPrice, parseFloat(manualTradeForm.stopLossPercent), manualTradeForm.side).toFixed(marketInfo?.precision?.price || 4)} {marketInfo?.quoteCcy || "USDT"}
                            <br />
                            <span className="text-xs text-red-500">Current Price: {currentPrice} {marketInfo?.quoteCcy || "USDT"}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Subscription Controls - Simplified */}
                <div className="space-y-3">
                  <Label>Active Subscriptions</Label>
                  <div className="grid grid-cols-1 gap-2">
                    <div className="flex items-center justify-between p-2 border rounded bg-blue-50">
                      <div className="flex items-center space-x-2">
                        <Switch
                          id="stateSwitch"
                          checked={subscriptionForm.enableState}
                          onCheckedChange={(checked) => handleSubscriptionToggle('enableState', checked)}
                        />
                        <Label htmlFor="stateSwitch" className="font-medium">Market State (Price Data)</Label>
                      </div>
                      <Badge variant={subscriptionForm.enableState ? "default" : "secondary"}>
                        {subscriptionForm.enableState ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <div className="text-sm text-gray-600 p-2 bg-gray-50 rounded">
                      <p>📊 Market State provides all essential price data including:</p>
                      <ul className="list-disc list-inside mt-1 space-y-1">
                        <li>Last price (last)</li>
                        <li>Mark price (mark_price)</li>
                        <li>24h high/low prices</li>
                        <li>Volume and market data</li>
                      </ul>
                    </div>
                    
                    <div className="flex items-center justify-between p-2 border rounded bg-green-50">
                      <div className="flex items-center space-x-2">
                        <Switch
                          id="positionsSwitch"
                          checked={subscriptionForm.enablePositions}
                          onCheckedChange={(checked) => handleSubscriptionToggle('enablePositions', checked)}
                        />
                        <Label htmlFor="positionsSwitch" className="font-medium">Position Updates</Label>
                      </div>
                      <Badge variant={subscriptionForm.enablePositions ? "default" : "secondary"}>
                        {subscriptionForm.enablePositions ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <div className="text-sm text-gray-600 p-2 bg-gray-50 rounded">
                      <p>📋 Position Updates provide real-time position information including:</p>
                      <ul className="list-disc list-inside mt-1 space-y-1">
                        <li>Position status and size</li>
                        <li>Entry price and current PnL</li>
                        <li>Take profit and stop loss levels</li>
                        <li>Margin and leverage information</li>
                        <li>Liquidation price and risk metrics</li>
                      </ul>
                    </div>
                  </div>
                </div>

                {/* Subscription Status */}
                <div className="text-sm text-muted-foreground bg-gray-50 p-3 rounded border">
                  <p><strong>Current Subscriptions:</strong> {subscriptionForm.symbol} - {subscriptionForm.timeframe}</p>
                  <p><strong>Market State:</strong> {subscriptionForm.enableState ? "Active" : "Inactive"}</p>
                  <p><strong>Position Updates:</strong> {subscriptionForm.enablePositions ? "Active" : "Inactive"}</p>
                  <p><strong>WebSocket Status:</strong> {isConnected ? "Connected" : "Disconnected"}</p>
                </div>

                <div className="flex gap-2">
                  <Button 
                    onClick={handleManualBuy} 
                    disabled={isLoading || !isConnected}
                    className="flex-1 bg-green-600 hover:bg-green-700"
                  >
                    <TrendingUp className="w-4 h-4 mr-2" />
                    Buy
                  </Button>
                  <Button 
                    onClick={handleManualSell} 
                    disabled={isLoading || !isConnected}
                    className="flex-1 bg-red-600 hover:bg-red-700"
                  >
                    <TrendingDown className="w-4 h-4 mr-2" />
                    Sell
                  </Button>
                  <Button 
                    onClick={() => {
                      console.log('🔍 Testing signature generation...');
                      console.log('Form data:', {
                        symbol: manualTradeForm.symbol,
                        amount: manualTradeForm.amount,
                        leverage: manualTradeForm.leverage,
                        marginMode: manualTradeForm.marginMode
                      });
                    }}
                    variant="outline"
                    disabled={isLoading || !isConnected}
                    className="flex-1"
                  >
                    Debug Signature
                  </Button>
                </div>

                {/* راهنمای استفاده از سیستم جدید */}
                {(manualTradeForm.enableTakeProfit && manualTradeForm.usePercentageForTP) || 
                 (manualTradeForm.enableStopLoss && manualTradeForm.usePercentageForSL) ? (
                  <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <h4 className="font-semibold text-yellow-800 mb-2">🎯 Smart Take Profit & Stop Loss System</h4>
                    <ul className="text-sm text-yellow-700 space-y-1">
                      <li>• When using percentage mode, the system will:</li>
                      <li>  1. Execute the trade immediately without TP/SL</li>
                      <li>  2. Wait 5 seconds for the position to be confirmed</li>
                      <li>  3. Fetch the actual entry price from the exchange</li>
                      <li>  4. Calculate and set TP/SL based on the percentage</li>
                      {manualTradeForm.enableTrailingTP && (
                        <li>  5. Enable trailing take profit with specified distance</li>
                      )}
                      {manualTradeForm.enableTrailingSL && (
                        <li>  5. Enable trailing stop loss with automatic updates every 10 seconds</li>
                      )}
                    </ul>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            {/* Quick Stats */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Quick Stats
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">
                        {formatCurrency(performanceSummary.dailyPnL)}
                      </div>
                      <div className="text-sm text-muted-foreground">Daily P&L</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">
                        {formatCurrency(performanceSummary.weeklyPnL)}
                      </div>
                      <div className="text-sm text-muted-foreground">Weekly P&L</div>
                    </div>
                  </div>
                  
                  <Separator />
                  
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span>Win Rate</span>
                      <div className="flex items-center space-x-2">
                        <Progress value={performance.winRate} className="w-20" />
                        <span className="text-sm font-mono">{formatPercent(performance.winRate)}</span>
                      </div>
                    </div>
                    
                    <div className="flex justify-between items-center">
                      <span>Sharpe Ratio</span>
                      <span className="font-mono">{formatNumber(performance.sharpeRatio)}</span>
                    </div>
                    
                    <div className="flex justify-between items-center">
                      <span>Current Drawdown</span>
                      <span className={`font-mono ${performanceSummary.currentDrawdown > 10 ? 'text-red-600' : 'text-yellow-600'}`}>
                        {formatPercent(performanceSummary.currentDrawdown)}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Positions Tab */}
        <TabsContent value="positions" className="space-y-4">
          <PositionManager
            activePositions={openPositions}
            historicalPositions={closedPositions}
            onClosePosition={closePosition}
            onUpdatePosition={() => {}}
            isConnected={isConnected}
            lastUpdate={lastUpdate}
          />
        </TabsContent>

        {/* Position Logs Tab */}
        <TabsContent value="position-logs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Position Logs
              </CardTitle>
              <CardDescription>
                Detailed position tracking from opening to closing
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div 
                id="position-logs-container"
                className="bg-black text-green-400 font-mono text-sm p-4 rounded-lg h-96 overflow-y-auto space-y-1"
              >
                {positionLogs.length === 0 ? (
                  <div className="text-gray-500 text-center py-8">
                    No position logs available
                  </div>
                ) : (
                  positionLogs.map((log, index) => (
                    <div key={log.id} className={`hover:bg-gray-800 px-2 py-1 rounded border-l-2 ${
                      log.type === 'opened' ? 'border-green-500' :
                      log.type === 'closed' ? 'border-red-500' :
                      log.type === 'error' ? 'border-red-700' :
                      log.type === 'price_update' ? 'border-blue-500' :
                      log.type === 'tp_sl_update' ? 'border-yellow-500' :
                      log.type === 'trailing_update' ? 'border-purple-500' :
                      'border-gray-500'
                    }`}>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400 text-xs">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                        <span className={`text-xs font-medium ${
                          log.type === 'opened' ? 'text-green-400' :
                          log.type === 'closed' ? 'text-red-400' :
                          log.type === 'error' ? 'text-red-500' :
                          'text-gray-300'
                        }`}>
                          [{log.type.toUpperCase()}]
                        </span>
                        <span className="text-gray-300 text-xs">
                          {log.positionId}
                        </span>
                      </div>
                      <div className="text-gray-200 text-sm mt-1">
                        {log.message}
                      </div>
                      {log.data && (
                        <details className="mt-1">
                          <summary className="text-gray-500 text-xs cursor-pointer hover:text-gray-400">
                            View details
                          </summary>
                          <pre className="text-gray-600 text-xs mt-1 bg-gray-900 p-2 rounded overflow-x-auto">
                            {JSON.stringify(log.data, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Auto Trade Tab */}
        <TabsContent value="auto-trade" className="space-y-4">
          <ErrorBoundary>
            <AutoTradeTab 
              isConnected={isConnected}
              isInitialized={isInitialized}
              onExecuteTrade={executeStrategyTrade}
              manualTradingConfig={{
                symbol: manualTradeForm.symbol,
                timeframe: subscriptionForm.timeframe,
                amount: manualTradeForm.amount,
                amountUnit: manualTradeForm.amountUnit,
                leverage: manualTradeForm.leverage,
                marginMode: manualTradeForm.marginMode,
                takeProfitPercent: parseFloat(manualTradeForm.takeProfitPercent) || 1,
                stopLossPercent: parseFloat(manualTradeForm.stopLossPercent) || 1,
                enableTakeProfit: manualTradeForm.enableTakeProfit,
                enableStopLoss: manualTradeForm.enableStopLoss,
                enableTrailingTP: manualTradeForm.enableTrailingTP,
                enableTrailingSL: manualTradeForm.enableTrailingSL,
                trailingDistance: manualTradeForm.trailingDistance,
              }}
              onAutoTradeConfigChange={(config) => {
                // همگام‌سازی تغییرات از auto-trade به manual trading
                setManualTradeForm(prev => ({
                  ...prev,
                  symbol: config.symbol,
                  amount: config.amount,
                  amountUnit: config.amountUnit,
                  leverage: config.leverage,
                  marginMode: config.marginMode,
                  takeProfitPercent: config.takeProfitPercent.toString(),
                  stopLossPercent: config.stopLossPercent.toString(),
                  enableTakeProfit: config.enableTakeProfit,
                  enableStopLoss: config.enableStopLoss,
                  enableTrailingTP: config.enableTrailingTP,
                  enableTrailingSL: config.enableTrailingSL,
                  trailingDistance: config.trailingDistance,
                }));
                setSubscriptionForm(prev => ({
                  ...prev,
                  symbol: config.symbol,
                  timeframe: config.timeframe,
                }));
              }}
            />
          </ErrorBoundary>
        </TabsContent>

        {/* WebSocket Data Tab */}

        {/* Logs Tab */}
        <TabsContent value="logs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Activity Logs
              </CardTitle>
              <CardDescription>
                Real-time trading activity and system logs
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between mb-4">
                <Badge variant="outline">
                  {logs.length} logs
                </Badge>
                <Button variant="outline" size="sm" onClick={() => setConfigForm(prev => ({ ...prev, logs: [] }))}>
                  Clear Logs
                </Button>
              </div>
              
              <div 
                id="logs-container"
                className="bg-black text-green-400 font-mono text-sm p-4 rounded-lg h-96 overflow-y-auto space-y-1"
              >
                {logs.length === 0 ? (
                  <div className="text-gray-500 text-center py-8">
                    No logs available
                  </div>
                ) : (
                  logs.map((log, index) => (
                    <div key={index} className="hover:bg-gray-800 px-2 py-1 rounded">
                      {log}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}