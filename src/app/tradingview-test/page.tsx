"use client";

import { useState } from "react";
import { TradingViewChart } from "@/components/tradingview-chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

interface MarketData {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
}

export default function TradingViewTestPage() {
  const [selectedSymbol, setSelectedSymbol] = useState("XRPUSDT");
  const [loading, setLoading] = useState(false);

  // Sample market data for demonstration
  const marketData: MarketData = {
    symbol: selectedSymbol,
    price: 0.5234,
    change24h: 2.34,
    volume24h: 12345678,
    high24h: 0.5350,
    low24h: 0.5120
  };

  const symbols = [
    "BTCUSDT",
    "ETHUSDT", 
    "XRPUSDT",
    "ADAUSDT",
    "DOTUSDT",
    "LINKUSDT",
    "LTCUSDT",
    "BCHUSDT"
  ];

  const handleRefresh = () => {
    setLoading(true);
    setTimeout(() => setLoading(false), 1000);
  };

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">TradingView Chart Test</h1>
        <div className="flex items-center gap-2">
          <Badge variant="outline">Demo</Badge>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Select Trading Pair</CardTitle>
          <CardDescription>Choose a cryptocurrency pair to view its TradingView chart</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Select value={selectedSymbol} onValueChange={setSelectedSymbol}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {symbols.map(symbol => (
                  <SelectItem key={symbol} value={symbol}>
                    {symbol}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Button 
              variant="outline" 
              onClick={handleRefresh}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh Chart
            </Button>
          </div>
        </CardContent>
      </Card>

      <TradingViewChart
        symbol={selectedSymbol}
        marketData={marketData}
        onRefresh={handleRefresh}
        loading={loading}
      />

      <Card>
        <CardHeader>
          <CardTitle>TradingView Integration Features</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <h3 className="font-semibold">Chart Features:</h3>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Real-time price data</li>
                <li>Multiple timeframes (1m to 1W)</li>
                <li>Technical indicators (RSI, MACD, MA)</li>
                <li>Drawing tools</li>
                <li>Customizable themes</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold">Integration Benefits:</h3>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Professional charting library</li>
                <li>Reliable data source</li>
                <li>Mobile responsive design</li>
                <li>Easy symbol switching</li>
                <li>Persian language support</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}