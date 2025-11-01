'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface LivePriceDisplayProps {
  symbol: string;
  marketInfo?: {
    precision?: {
      price: number;
      quote: number;
    };
    quoteCcy?: string;
  };
  websocketManager?: any;
  onPriceUpdate?: (price: number) => void;
}

interface PriceData {
  last: number | null;
  mark_price: number | null;
  index_price: number | null;
  timestamp: number | null;
}

export function LivePriceDisplay({ symbol, marketInfo, websocketManager, onPriceUpdate }: LivePriceDisplayProps) {
  const [priceData, setPriceData] = useState<PriceData>({
    last: null,
    mark_price: null,
    index_price: null,
    timestamp: null
  });
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // تابع برای پردازش داده‌های state.update از WebSocket
  const handleStateUpdate = useCallback((data: any) => {
    console.log(`[LivePriceDisplay] handleStateUpdate called with data:`, data);
    
    // Check if data is the state_list array or the full message object
    let stateList = data;
    if (data && data.state_list) {
      stateList = data.state_list;
    }
    
    if (stateList && Array.isArray(stateList)) {
      const stateData = stateList.find((item: any) => item.market === symbol);
      
      if (stateData) {
        console.log(`[LivePriceDisplay] Received state update for ${symbol}:`, stateData);
        console.log(`Found state data for ${symbol}: Last=${stateData.last}, Open=${stateData.open}, High=${stateData.high}, Low=${stateData.low}`);
        
        const newData: PriceData = {
          last: parseFloat(stateData.last) || null,
          mark_price: parseFloat(stateData.mark_price) || null,
          index_price: parseFloat(stateData.index_price) || null,
          timestamp: Date.now()
        };
        
        setPriceData(prev => {
          // اگر داده‌های جدید معتبر باشند، آپدیت کن
          if (newData.last !== null) {
            console.log(`[LivePriceDisplay] Price updated: ${newData.last}`);
            // فراخوانی callback برای اطلاع‌رسانی به کامپوننت والد
            if (onPriceUpdate) {
              onPriceUpdate(newData.last);
            }
            return newData;
          }
          return prev;
        });
        
        setIsLoading(false);
      }
    }
  }, [symbol, onPriceUpdate]);

  // Subscribe به WebSocket events
  useEffect(() => {
    console.log(`[LivePriceDisplay] WebSocket manager:`, websocketManager);
    
    if (!websocketManager) {
      console.log(`[LivePriceDisplay] No WebSocket manager available - will retry`);
      const retryTimer = setTimeout(() => {
        console.log(`[LivePriceDisplay] Retrying WebSocket manager check...`);
      }, 1000);
      setIsLoading(false);
      return () => clearTimeout(retryTimer);
    }

    console.log(`[LivePriceDisplay] Setting up WebSocket listeners for ${symbol}`);

    // Check if websocketManager has the required methods
    if (typeof websocketManager.on !== 'function') {
      console.error(`[LivePriceDisplay] websocketManager.on is not a function`, websocketManager);
      setIsLoading(false);
      return;
    }

    if (typeof websocketManager.off !== 'function') {
      console.error(`[LivePriceDisplay] websocketManager.off is not a function`, websocketManager);
      setIsLoading(false);
      return;
    }

    if (typeof websocketManager.isConnected !== 'function') {
      console.log(`[LivePriceDisplay] websocketManager.isConnected is a property (not function). Value:`, websocketManager.isConnected);
      // ادامه روند چون پراپرتی isConnected وجود دارد
    }

    // Listen for state updates
    console.log(`[LivePriceDisplay] Adding stateUpdate listener for ${symbol}`);
    websocketManager.on('stateUpdate', handleStateUpdate);
    
    // Also listen for state.update (alternative event name)
    const handleAlternativeStateUpdate = (data: any) => {
      console.log(`[LivePriceDisplay] Received alternative state.update event:`, data);
      handleStateUpdate(data);
    };
    websocketManager.on('state.update', handleAlternativeStateUpdate);
    
    // Also listen to the raw message event for debugging
    const handleRawMessage = (message: any) => {
      console.log(`[LivePriceDisplay] Raw message received:`, message);
      if (message.method === 'state.update') {
        console.log(`[LivePriceDisplay] Raw state.update message found, processing...`);
        handleStateUpdate(message);
      }
    };
    websocketManager.on('message', handleRawMessage);

    // Check connection status
    const checkConnection = () => {
      try {
        // استفاده از پراپرتی isConnected به جای متد
        const connected = !!websocketManager.isConnected;
        setIsConnected(connected);
        console.log(`[LivePriceDisplay] WebSocket connection status: ${connected}`);
      } catch (error) {
        console.error(`[LivePriceDisplay] Error checking connection status:`, error);
        setIsConnected(false);
      }
    };

    checkConnection();
    const connectionInterval = setInterval(checkConnection, 1000);

    // Cleanup
    return () => {
      console.log(`[LivePriceDisplay] Cleaning up WebSocket listeners for ${symbol}`);
      try {
        websocketManager.off('stateUpdate', handleStateUpdate);
        websocketManager.off('state.update', handleAlternativeStateUpdate);
        websocketManager.off('message', handleRawMessage);
      } catch (error) {
        console.error(`[LivePriceDisplay] Error removing listener:`, error);
      }
      clearInterval(connectionInterval);
    };
  }, [websocketManager, symbol, handleStateUpdate]);

  // Calculate price change direction
  const getPriceDirection = () => {
    if (!priceData.last) return null;
    // This is a simplified version - in a real implementation, you'd track previous price
    return 'up'; // Default to up for now
  };

  const precision = marketInfo?.precision?.price || 4;
  const quoteCurrency = marketInfo?.quoteCcy || 'USDT';
  const priceDirection = getPriceDirection();

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-lg border border-blue-200">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-blue-600">Current Price</p>
            {isConnected ? (
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            ) : (
              <div className="w-2 h-2 bg-red-500 rounded-full"></div>
            )}
          </div>
          
          {isLoading ? (
            <div className="flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              <p className="text-lg font-semibold text-blue-700">Loading...</p>
            </div>
          ) : priceData.last ? (
            <div className="flex items-center gap-2">
              <p className="text-2xl font-bold text-blue-900">
                {priceData.last.toFixed(precision)} {quoteCurrency}
              </p>
              {priceDirection === 'up' ? (
                <TrendingUp className="h-5 w-5 text-green-500" />
              ) : (
                <TrendingDown className="h-5 w-5 text-red-500" />
              )}
            </div>
          ) : (
            <p className="text-lg font-semibold text-gray-500">
              {websocketManager ? 'No data' : 'WebSocket not ready'}
            </p>
          )}
          
          <div className="flex items-center gap-4 mt-2">
            <div className="text-xs">
              <span className="text-blue-500">Last: </span>
              <span className="font-mono text-blue-700">
                {priceData.last !== null ? priceData.last.toFixed(precision) : 'N/A'}
              </span>
            </div>
            <div className="text-xs">
              <span className="text-blue-500">Mark: </span>
              <span className="font-mono text-blue-700">
                {priceData.mark_price !== null ? priceData.mark_price.toFixed(precision) : 'N/A'}
              </span>
            </div>
            <div className="text-xs">
              <span className="text-blue-500">Index: </span>
              <span className="font-mono text-blue-700">
                {priceData.index_price !== null ? priceData.index_price.toFixed(precision) : 'N/A'}
              </span>
            </div>
          </div>
          
          <p className="text-xs text-blue-500 mt-1">
            {symbol} • {isConnected ? 'Live' : 'Disconnected'} • {isLoading ? 'Connecting...' : (priceData.last ? 'Real-time' : 'Waiting for data')}
          </p>
        </div>
        <div className="text-blue-400">
          <TrendingUp className="h-8 w-8" />
        </div>
      </div>
    </div>
  );
}