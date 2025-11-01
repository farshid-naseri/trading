'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Minus, Activity, Clock } from 'lucide-react';

interface MarketData {
  market: string;
  last: string;
  open: string;
  close: string;
  high: string;
  low: string;
  volume: string;
  value: string;
  mark_price: string;
  index_price: string;
  latest_funding_rate: string;
  next_funding_rate: string;
  latest_funding_time: number;
  next_funding_time: number;
  period: number;
}

interface MarketStatusProps {
  symbol: string;
  websocketManager?: any;
}

export function MarketStatus({ symbol, websocketManager }: MarketStatusProps) {
  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useEffect(() => {
    if (!websocketManager || !symbol) {
      setIsLoading(false);
      return;
    }

    const handleStateUpdate = (data: MarketData[]) => {
      if (data && data.length > 0) {
        const relevantData = data.find(item => item.market === symbol);
        if (relevantData) {
          setMarketData(relevantData);
          setLastUpdate(new Date());
          setIsLoading(false);
        }
      }
    };

    // Subscribe to state updates
    try {
      websocketManager.on('stateUpdate', handleStateUpdate);

      // Subscribe to market state
      if (typeof websocketManager.subscribeToState === 'function') {
        websocketManager.subscribeToState(symbol);
      }
    } catch (error) {
      console.error('Error setting up market state subscription:', error);
      setIsLoading(false);
    }

    // Cleanup on unmount
    return () => {
      try {
        if (websocketManager && typeof websocketManager.off === 'function') {
          websocketManager.off('stateUpdate', handleStateUpdate);
        }
      } catch (error) {
        console.error('Error cleaning up market state subscription:', error);
      }
    };
  }, [symbol, websocketManager]);

  const formatNumber = (num: string, decimals: number = 4): string => {
    const value = parseFloat(num);
    if (isNaN(value)) return num;
    return value.toFixed(decimals);
  };

  const formatTimestamp = (timestamp: number): string => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const getPriceChange = (): { percent: number; direction: 'up' | 'down' | 'neutral' } => {
    if (!marketData) return { percent: 0, direction: 'neutral' };
    
    const open = parseFloat(marketData.open);
    const close = parseFloat(marketData.close);
    
    if (isNaN(open) || isNaN(close) || open === 0) {
      return { percent: 0, direction: 'neutral' };
    }
    
    const change = ((close - open) / open) * 100;
    return {
      percent: Math.abs(change),
      direction: change > 0 ? 'up' : change < 0 ? 'down' : 'neutral'
    };
  };

  const getChangeColor = (direction: 'up' | 'down' | 'neutral'): string => {
    switch (direction) {
      case 'up': return 'text-green-600';
      case 'down': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getChangeIcon = (direction: 'up' | 'down' | 'neutral') => {
    switch (direction) {
      case 'up': return <TrendingUp className="h-4 w-4" />;
      case 'down': return <TrendingDown className="h-4 w-4" />;
      default: return <Minus className="h-4 w-4" />;
    }
  };

  const priceChange = getPriceChange();

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Market Status - {symbol}
          </CardTitle>
          <CardDescription>Loading market data...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            <div className="h-4 bg-gray-200 rounded w-2/3"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!marketData) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Market Status - {symbol}
          </CardTitle>
          <CardDescription>No market data available</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Unable to fetch market data. Please check your connection.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Market Status - {symbol}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={priceChange.direction === 'up' ? 'default' : priceChange.direction === 'down' ? 'destructive' : 'secondary'}>
              {getChangeIcon(priceChange.direction)}
              <span className="ml-1">
                {priceChange.direction === 'up' ? '+' : priceChange.direction === 'down' ? '-' : ''}{priceChange.percent.toFixed(2)}%
              </span>
            </Badge>
            {lastUpdate && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {lastUpdate.toLocaleTimeString()}
              </div>
            )}
          </div>
        </CardTitle>
        <CardDescription>24-hour market statistics and candle data</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Current Price */}
          <div className="space-y-2">
            <div className="text-sm font-medium text-muted-foreground">Current Price</div>
            <div className={`text-2xl font-bold ${getChangeColor(priceChange.direction)}`}>
              ${formatNumber(marketData.last)}
            </div>
          </div>

          {/* Candle Data - Open */}
          <div className="space-y-2">
            <div className="text-sm font-medium text-muted-foreground">Open Price</div>
            <div className="text-lg font-semibold">
              ${formatNumber(marketData.open)}
            </div>
          </div>

          {/* Candle Data - High */}
          <div className="space-y-2">
            <div className="text-sm font-medium text-muted-foreground">High Price</div>
            <div className="text-lg font-semibold text-green-600">
              ${formatNumber(marketData.high)}
            </div>
          </div>

          {/* Candle Data - Low */}
          <div className="space-y-2">
            <div className="text-sm font-medium text-muted-foreground">Low Price</div>
            <div className="text-lg font-semibold text-red-600">
              ${formatNumber(marketData.low)}
            </div>
          </div>

          {/* Close Price */}
          <div className="space-y-2">
            <div className="text-sm font-medium text-muted-foreground">Close Price</div>
            <div className="text-lg font-semibold">
              ${formatNumber(marketData.close)}
            </div>
          </div>

          {/* Mark Price */}
          <div className="space-y-2">
            <div className="text-sm font-medium text-muted-foreground">Mark Price</div>
            <div className="text-lg font-semibold">
              ${formatNumber(marketData.mark_price)}
            </div>
          </div>

          {/* Volume */}
          <div className="space-y-2">
            <div className="text-sm font-medium text-muted-foreground">24h Volume</div>
            <div className="text-lg font-semibold">
              {parseFloat(marketData.volume).toLocaleString()}
            </div>
          </div>

          {/* 24h Value */}
          <div className="space-y-2">
            <div className="text-sm font-medium text-muted-foreground">24h Value</div>
            <div className="text-lg font-semibold">
              ${parseFloat(marketData.value).toLocaleString()}
            </div>
          </div>
        </div>

        {/* Funding Rate Information */}
        <div className="mt-6 pt-4 border-t">
          <div className="text-sm font-medium text-muted-foreground mb-3">Funding Information</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Current Funding Rate</div>
              <div className={`text-sm font-medium ${parseFloat(marketData.latest_funding_rate) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {(parseFloat(marketData.latest_funding_rate) * 100).toFixed(4)}%
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Next Funding Rate</div>
              <div className={`text-sm font-medium ${parseFloat(marketData.next_funding_rate) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {(parseFloat(marketData.next_funding_rate) * 100).toFixed(4)}%
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Next Funding Time</div>
              <div className="text-sm font-medium">
                {formatTimestamp(marketData.next_funding_time)}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}