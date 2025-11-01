'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useApiCredentials } from '@/hooks/use-api-credentials';

interface WebSocketTestState {
  isConnected: boolean;
  isAuthenticated: boolean;
  logs: string[];
  positions: any[];
  messages: any[];
}

export default function WebSocketTestPage() {
  const { apiKey, apiSecret, isConfigured } = useApiCredentials();
  const [symbol, setSymbol] = useState('XRPUSDT');
  const [state, setState] = useState<WebSocketTestState>({
    isConnected: false,
    isAuthenticated: false,
    logs: [],
    positions: [],
    messages: []
  });

  const addLog = (message: string) => {
    setState(prev => ({
      ...prev,
      logs: [...prev.logs, `[${new Date().toLocaleTimeString()}] ${message}`]
    }));
  };

  const testWebSocketConnection = async () => {
    try {
      addLog('🔄 Starting WebSocket connection test...');
      
      // Import WebSocketManager dynamically
      const { WebSocketManager } = await import('@/lib/websocket-manager');
      
      // Create WebSocket manager
      const wsManager = new WebSocketManager(
        'wss://socket.coinex.com/v2/futures',
        apiKey,
        apiSecret
      );

      // Set up event handlers
      wsManager.on('open', () => {
        setState(prev => ({ ...prev, isConnected: true }));
        addLog('✅ WebSocket connected');
      });

      wsManager.on('authenticated', () => {
        setState(prev => ({ ...prev, isAuthenticated: true }));
        addLog('✅ WebSocket authenticated');
      });

      wsManager.on('authentication_failed', (error) => {
        addLog(`❌ Authentication failed: ${error.message || 'Unknown error'}`);
      });

      wsManager.on('message', (message: any) => {
        setState(prev => ({
          ...prev,
          messages: [...prev.messages.slice(-49), message] // Keep last 50 messages
        }));
        
        // Handle position updates
        if (message.method === 'position.update' && message.data?.position) {
          const position = message.data.position;
          setState(prev => ({
            ...prev,
            positions: [...prev.positions, position]
          }));
          addLog(`📊 Position update: ${position.market} ${position.side}`);
        }
        
        // Log all messages for debugging
        addLog(`📨 Message: ${message.method || 'Unknown'} - ${JSON.stringify(message).substring(0, 100)}...`);
      });

      wsManager.on('close', () => {
        setState(prev => ({ 
          ...prev, 
          isConnected: false, 
          isAuthenticated: false 
        }));
        addLog('🔌 WebSocket disconnected');
      });

      wsManager.on('error', (error) => {
        addLog(`❌ WebSocket error: ${error}`);
      });

      // Connect
      wsManager.connect();
      addLog('🔌 WebSocket connection initiated');

      // Test authentication after connection
      setTimeout(async () => {
        if (wsManager.connected) {
          addLog('🔐 Testing authentication...');
          const authResult = await wsManager.authenticate();
          if (authResult) {
            addLog('✅ Authentication request sent');
          } else {
            addLog('❌ Authentication failed to send');
          }
        }
      }, 2000);

      // Test subscriptions after authentication
      setTimeout(() => {
        if (wsManager.connected && wsManager.authenticated) {
          addLog('📋 Testing position subscription...');
          wsManager.subscribeToPositions(symbol);
        } else {
          addLog('⚠️ Cannot subscribe - not connected or authenticated');
        }
      }, 5000);

    } catch (error) {
      addLog(`❌ Test error: ${error}`);
    }
  };

  const clearLogs = () => {
    setState(prev => ({ ...prev, logs: [] }));
  };

  const clearMessages = () => {
    setState(prev => ({ ...prev, messages: [] }));
  };

  const clearPositions = () => {
    setState(prev => ({ ...prev, positions: [] }));
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">WebSocket Authentication Test</h1>
        <p className="text-muted-foreground">
          Test CoinEx WebSocket authentication and position subscription
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Configuration Panel */}
        <Card>
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
            <CardDescription>
              Test parameters for WebSocket connection
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!isConfigured && (
              <Alert>
                <AlertDescription>
                  API credentials are not configured. Please configure them in the main settings page.
                </AlertDescription>
              </Alert>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="symbol">Symbol</Label>
              <Input
                id="symbol"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                placeholder="e.g., XRPUSDT"
              />
            </div>
            <div className="flex gap-2">
              <Badge variant={state.isConnected ? "default" : "secondary"}>
                {state.isConnected ? "Connected" : "Disconnected"}
              </Badge>
              <Badge variant={state.isAuthenticated ? "default" : "secondary"}>
                {state.isAuthenticated ? "Authenticated" : "Not Authenticated"}
              </Badge>
              <Badge variant={isConfigured ? "default" : "destructive"}>
                {isConfigured ? "API Configured" : "API Not Configured"}
              </Badge>
            </div>
            <Button 
              onClick={testWebSocketConnection} 
              className="w-full"
              disabled={!isConfigured}
            >
              Test WebSocket Connection
            </Button>
          </CardContent>
        </Card>

        {/* Status Panel */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Test Results</CardTitle>
            <CardDescription>
              Real-time logs and connection status
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="logs" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="logs">Logs</TabsTrigger>
                <TabsTrigger value="messages">Messages</TabsTrigger>
                <TabsTrigger value="positions">Positions</TabsTrigger>
              </TabsList>
              
              <TabsContent value="logs" className="space-y-2">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-medium">Connection Logs</h3>
                  <Button variant="outline" size="sm" onClick={clearLogs}>
                    Clear
                  </Button>
                </div>
                <div className="h-96 overflow-y-auto border rounded-md p-3 bg-black text-green-400 font-mono text-sm">
                  {state.logs.length === 0 ? (
                    <p className="text-muted-foreground">No logs yet. Start the test to see connection details.</p>
                  ) : (
                    state.logs.map((log, index) => (
                      <div key={index} className="mb-1">
                        {log}
                      </div>
                    ))
                  )}
                </div>
              </TabsContent>
              
              <TabsContent value="messages" className="space-y-2">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-medium">WebSocket Messages</h3>
                  <Button variant="outline" size="sm" onClick={clearMessages}>
                    Clear
                  </Button>
                </div>
                <div className="h-96 overflow-y-auto border rounded-md p-3 bg-black text-cyan-400 font-mono text-sm">
                  {state.messages.length === 0 ? (
                    <p className="text-muted-foreground">No messages received yet.</p>
                  ) : (
                    state.messages.map((msg, index) => (
                      <div key={index} className="mb-2">
                        <div className="text-yellow-400">
                          Method: {msg.method || 'Unknown'}
                        </div>
                        <div className="text-gray-400 text-xs">
                          {JSON.stringify(msg, null, 2)}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </TabsContent>
              
              <TabsContent value="positions" className="space-y-2">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-medium">Position Updates</h3>
                  <Button variant="outline" size="sm" onClick={clearPositions}>
                    Clear
                  </Button>
                </div>
                <div className="h-96 overflow-y-auto border rounded-md p-3">
                  {state.positions.length === 0 ? (
                    <p className="text-muted-foreground">No position updates received yet.</p>
                  ) : (
                    state.positions.map((pos, index) => (
                      <Card key={index} className="mb-2">
                        <CardContent className="p-3">
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div><strong>Market:</strong> {pos.market}</div>
                            <div><strong>Side:</strong> {pos.side}</div>
                            <div><strong>Size:</strong> {pos.open_interest}</div>
                            <div><strong>PnL:</strong> {pos.unrealized_pnl}</div>
                            <div><strong>Entry:</strong> {pos.avg_entry_price}</div>
                            <div><strong>Leverage:</strong> {pos.leverage}</div>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Test Instructions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <p>1. Configure API credentials in the main settings page</p>
            <p>2. Choose a trading symbol (default: XRPUSDT)</p>
            <p>3. Click "Test WebSocket Connection" to start the test</p>
            <p>4. Monitor the logs tab for connection status and authentication results</p>
            <p>5. Check the messages tab to see all WebSocket communications</p>
            <p>6. View the positions tab for real-time position updates (if any)</p>
          </div>
          <Alert className="mt-4">
            <AlertDescription>
              <strong>Note:</strong> This test will attempt to authenticate with CoinEx WebSocket using the 
              <code className="bg-muted px-1 rounded">server.sign</code> method and subscribe to position updates. 
              Make sure your API keys have the necessary permissions.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}