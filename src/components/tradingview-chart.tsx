"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Activity, RefreshCw } from "lucide-react";

interface MarketData {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
}

interface TradingViewChartProps {
  symbol: string;
  marketData: MarketData | null;
  onRefresh: () => void;
  loading: boolean;
}

export function TradingViewChart({ symbol, marketData, onRefresh, loading }: TradingViewChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [timeframe, setTimeframe] = useState('5');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const script = document.createElement('script');
      script.src = 'https://s3.tradingview.com/tv.js';
      script.async = true;
      script.onload = initializeWidget;
      document.head.appendChild(script);

      return () => {
        document.head.removeChild(script);
      };
    }
  }, [symbol, timeframe]);

  const initializeWidget = () => {
    if (containerRef.current && typeof window !== 'undefined') {
      // Clear previous widget
      containerRef.current.innerHTML = '';

      // @ts-ignore
      new TradingView.widget({
        width: '100%',
        height: 500,
        symbol: `COINEX:${symbol}`,
        interval: timeframe,
        timezone: 'Asia/Tehran',
        theme: 'light',
        style: '1',
        locale: 'fa_IR',
        toolbar_bg: '#f1f3f6',
        enable_publishing: false,
        hide_side_toolbar: false,
        allow_symbol_change: true,
        container_id: containerRef.current.id,
        studies: ['MASimple@tv-basicstudies', 'RSI@tv-basicstudies', 'MACD@tv-basicstudies'],
        drawings_access: { type: 'all', tools: [{ name: 'Regression Trend' }] },
        disabled_features: ['header_symbol_search', 'header_compare', 'header_undo_redo', 'use_localstorage_for_settings'],
        enabled_features: [],
        overrides: {
          'mainSeriesProperties.candleStyle.upColor': '#10b981',
          'mainSeriesProperties.candleStyle.downColor': '#ef4444',
          'mainSeriesProperties.candleStyle.borderUpColor': '#10b981',
          'mainSeriesProperties.candleStyle.borderDownColor': '#ef4444',
          'mainSeriesProperties.candleStyle.wickUpColor': '#10b981',
          'mainSeriesProperties.candleStyle.wickDownColor': '#ef4444',
        }
      });
    }
  };

  const handleTimeframeChange = (value: string) => {
    setTimeframe(value);
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              نمودار تریدینگ ویو {symbol}
            </CardTitle>
            <CardDescription>
              {marketData && (
                <div className="flex items-center gap-4 mt-2">
                  <span className="font-mono text-lg">
                    {marketData.price.toFixed(4)}
                  </span>
                  <Badge variant={marketData.change24h >= 0 ? "default" : "destructive"}>
                    {marketData.change24h >= 0 ? '+' : ''}{marketData.change24h.toFixed(2)}%
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    حجم: {marketData.volume24h.toLocaleString()}
                  </span>
                </div>
              )}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={timeframe} onValueChange={handleTimeframeChange}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 دقیقه</SelectItem>
                <SelectItem value="5">5 دقیقه</SelectItem>
                <SelectItem value="15">15 دقیقه</SelectItem>
                <SelectItem value="30">30 دقیقه</SelectItem>
                <SelectItem value="60">1 ساعت</SelectItem>
                <SelectItem value="240">4 ساعت</SelectItem>
                <SelectItem value="D">1 روز</SelectItem>
                <SelectItem value="W">1 هفته</SelectItem>
              </SelectContent>
            </Select>
            
            <Button 
              variant="outline" 
              size="sm" 
              onClick={onRefresh}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div id="tradingview_widget" ref={containerRef} className="w-full">
          <div className="flex items-center justify-center h-96 bg-muted/50 rounded-lg">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
              <p className="text-sm text-muted-foreground">در حال بارگذاری نمودار تریدینگ ویو...</p>
            </div>
          </div>
        </div>
        
        {/* اطلاعات بازار */}
        {marketData && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="text-sm text-muted-foreground">بالاترین 24h</div>
              <div className="font-mono font-medium">{marketData.high24h.toFixed(4)}</div>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="text-sm text-muted-foreground">پایین‌ترین 24h</div>
              <div className="font-mono font-medium">{marketData.low24h.toFixed(4)}</div>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="text-sm text-muted-foreground">تغییر 24h</div>
              <div className={`font-mono font-medium ${marketData.change24h >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {marketData.change24h >= 0 ? '+' : ''}{marketData.change24h.toFixed(2)}%
              </div>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="text-sm text-muted-foreground">حجم 24h</div>
              <div className="font-mono font-medium">{marketData.volume24h.toLocaleString()}</div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}