'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

// Import WebSocketManager
import { WebSocketManager } from '@/lib/websocket-manager';

interface PositionData {
  position_id: number;
  market: string;
  side: string;
  margin_mode: string;
  open_interest: string;
  close_avbl: string;
  ath_position_amount: string;
  unrealized_pnl: string;
  realized_pnl: string;
  avg_entry_price: string;
  cml_position_value: string;
  max_position_value: string;
  take_profit_price: string;
  stop_loss_price: string;
  leverage: string;
  margin_avbl: string;
  ath_margin_size: string;
  liq_price: string;
  created_at: number;
  updated_at: number;
}

export default function TestPositionSubscription() {
  const [wsManager, setWsManager] = useState<WebSocketManager | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [positions, setPositions] = useState<PositionData[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [symbol, setSymbol] = useState('XRPUSDT');

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, `[${timestamp}] ${message}`]);
    console.log(`[PositionTest] ${message}`);
  };

  // Initialize WebSocket manager
  useEffect(() => {
    const manager = new WebSocketManager('wss://socket.coinex.com/v2/futures');
    setWsManager(manager);

    // Set up event handlers
    manager.on('open', () => {
      setIsConnected(true);
      addLog('✅ WebSocket connected');
    });

    manager.on('close', () => {
      setIsConnected(false);
      setIsAuthenticated(false);
      setIsSubscribed(false);
      addLog('❌ WebSocket disconnected');
    });

    manager.on('error', (error) => {
      addLog(`❌ WebSocket error: ${error}`);
    });

    manager.on('message', (message: any) => {
      if (message.id === 999) {
        // Authentication response
        if (message.code === 0) {
          setIsAuthenticated(true);
          addLog('✅ Authentication successful');
        } else {
          addLog(`❌ Authentication failed: ${message.message}`);
        }
      } else if (message.method === 'position.update') {
        addLog('📋 Position update received');
        if (message.data?.position) {
          setPositions(prev => {
            const newPosition = message.data.position;
            const existingIndex = prev.findIndex(p => p.position_id === newPosition.position_id);
            if (existingIndex >= 0) {
              const updated = [...prev];
              updated[existingIndex] = newPosition;
              return updated;
            } else {
              return [...prev, newPosition];
            }
          });
        }
      } else if (message.method === 'position.snapshot') {
        addLog('📸 Position snapshot received');
        if (message.data?.positions) {
          setPositions(message.data.positions);
        }
      }
    });

    return () => {
      manager.disconnect();
    };
  }, []);

  const handleConnect = () => {
    if (wsManager) {
      wsManager.connect();
    }
  };

  const handleDisconnect = () => {
    if (wsManager) {
      wsManager.disconnect();
    }
  };

  const handleAuthenticate = async () => {
    if (!wsManager || !apiKey || !apiSecret) {
      addLog('❌ Please provide API key and secret');
      return;
    }

    wsManager.setApiCredentials(apiKey, apiSecret);
    const result = await wsManager.authenticate();
    if (result) {
      addLog('🔐 Authentication request sent');
    }
  };

  const handleSubscribe = async () => {
    if (!wsManager || !isAuthenticated) {
      addLog('❌ Please authenticate first');
      return;
    }

    const result = await wsManager.subscribeToPositions(symbol);
    if (result) {
      setIsSubscribed(true);
      addLog(`📋 Subscribed to positions for ${symbol}`);
    }
  };

  const handleUnsubscribe = () => {
    if (!wsManager) return;
    
    wsManager.unsubscribeFromPositions(symbol);
    setIsSubscribed(false);
    addLog(`📋 Unsubscribed from positions for ${symbol}`);
  };

  const clearLogs = () => {
    setLogs([]);
  };

  const clearPositions = () => {
    setPositions([]);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-2">WebSocket Position Subscription Test</h1>
        <p className="text-muted-foreground">
          Test real-time position updates from CoinEx WebSocket API
        </p>
      </div>

      {/* Connection Status */}
      <Card>
        <CardHeader>
          <CardTitle>Connection Status</CardTitle>
          <CardDescription>WebSocket connection and authentication status</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="flex items-center justify-between p-3 border rounded">
              <span>WebSocket</span>
              <Badge variant={isConnected ? "default" : "secondary"}>
                {isConnected ? "Connected" : "Disconnected"}
              </Badge>
            </div>
            <div className="flex items-center justify-between p-3 border rounded">
              <span>Authenticated</span>
              <Badge variant={isAuthenticated ? "default" : "secondary"}>
                {isAuthenticated ? "Yes" : "No"}
              </Badge>
            </div>
            <div className="flex items-center justify-between p-3 border rounded">
              <span>Subscribed</span>
              <Badge variant={isSubscribed ? "default" : "secondary"}>
                {isSubscribed ? "Yes" : "No"}
              </Badge>
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleConnect} disabled={isConnected}>
              Connect
            </Button>
            <Button onClick={handleDisconnect} disabled={!isConnected} variant="outline">
              Disconnect
            </Button>
            <Button onClick={handleAuthenticate} disabled={!isConnected || isAuthenticated}>
              Authenticate
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* API Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>API Configuration</CardTitle>
          <CardDescription>Enter your CoinEx API credentials</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="apiKey">API Key</Label>
              <input
                id="apiKey"
                type="text"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full p-2 border rounded"
                placeholder="Enter API key"
              />
            </div>
            <div>
              <Label htmlFor="apiSecret">API Secret</Label>
              <input
                id="apiSecret"
                type="password"
                value={apiSecret}
                onChange={(e) => setApiSecret(e.target.value)}
                className="w-full p-2 border rounded"
                placeholder="Enter API secret"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="symbol">Symbol</Label>
            <input
              id="symbol"
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="w-full p-2 border rounded"
              placeholder="e.g., XRPUSDT"
            />
          </div>
        </CardContent>
      </Card>

      {/* Subscription Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Position Subscription</CardTitle>
          <CardDescription>Subscribe to real-time position updates</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button 
              onClick={handleSubscribe} 
              disabled={!isAuthenticated || isSubscribed}
              className="bg-green-600 hover:bg-green-700"
            >
              Subscribe to Positions
            </Button>
            <Button 
              onClick={handleUnsubscribe} 
              disabled={!isSubscribed}
              variant="outline"
            >
              Unsubscribe
            </Button>
          </div>

          <Alert>
            <AlertTitle>How it works</AlertTitle>
            <AlertDescription>
              This test page subscribes to position updates using the CoinEx WebSocket API. 
              When you have active positions, you'll see real-time updates including PnL, 
              entry price, and other position details.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Current Positions */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Current Positions</CardTitle>
              <CardDescription>Real-time position data from WebSocket</CardDescription>
            </div>
            <Button onClick={clearPositions} variant="outline" size="sm">
              Clear
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {positions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No active positions. Open a position to see real-time updates.
            </div>
          ) : (
            <div className="space-y-4">
              {positions.map((position) => (
                <div key={position.position_id} className="p-4 border rounded">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h4 className="font-semibold">{position.market}</h4>
                      <p className="text-sm text-muted-foreground">
                        {position.side.toUpperCase()} {position.leverage}x
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">
                        PnL: {parseFloat(position.unrealized_pnl).toFixed(4)} USDT
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Entry: {parseFloat(position.avg_entry_price).toFixed(4)}
                      </p>
                    </div>
                  </div>
                  <Separator className="my-2" />
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Size:</span>{' '}
                      {position.ath_position_amount}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Margin:</span>{' '}
                      {position.ath_margin_size} USDT
                    </div>
                    <div>
                      <span className="text-muted-foreground">Liql. Price:</span>{' '}
                      {parseFloat(position.liq_price).toFixed(4)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Logs */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Activity Logs</CardTitle>
              <CardDescription>Real-time event logs</CardDescription>
            </div>
            <Button onClick={clearLogs} variant="outline" size="sm">
              Clear Logs
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="bg-black text-green-400 p-4 rounded font-mono text-sm h-64 overflow-y-auto">
            {logs.length === 0 ? (
              <div className="text-gray-500">No logs yet. Start connecting to see activity.</div>
            ) : (
              logs.map((log, index) => (
                <div key={index} className="mb-1">
                  {log}
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}