'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useApiCredentialsStore } from '@/lib/api-credentials-store';
import { Settings, Key, Shield, CheckCircle, AlertTriangle, Wifi } from 'lucide-react';

export function ApiConfigForm() {
  const { 
    apiKey, 
    apiSecret, 
    isConfigured, 
    setCredentials, 
    clearCredentials, 
    validateCredentials 
  } = useApiCredentialsStore();

  const [localApiKey, setLocalApiKey] = useState(apiKey);
  const [localApiSecret, setLocalApiSecret] = useState(apiSecret);
  const [useProxy, setUseProxy] = useState(true);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    setLocalApiKey(apiKey);
    setLocalApiSecret(apiSecret);
  }, [apiKey, apiSecret]);

  const handleSave = () => {
    setCredentials(localApiKey, localApiSecret);
    setTestResult(null);
  };

  const handleClear = () => {
    clearCredentials();
    setLocalApiKey('');
    setLocalApiSecret('');
    setTestResult(null);
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);

    try {
      const { useCoinExAPI } = await import('@/lib/coinex-api');
      const api = useCoinExAPI.getState();
      
      // Set up API config with local values for testing
      api.setConfig({
        apiKey: localApiKey,
        apiSecret: localApiSecret,
        baseUrl: 'https://api.coinex.com',
        futuresBaseUrl: 'https://api.coinex.com',
        useProxy: useProxy
      });

      // Test the connection by fetching market data
      const result = await api.fetchMarketData('XRPUSDT');
      
      if (result) {
        setTestResult({
          success: true,
          message: 'Connection successful! API credentials are working.'
        });
      } else {
        setTestResult({
          success: false,
          message: 'Connection failed. Please check your credentials.'
        });
      }
    } catch (error) {
      setTestResult({
        success: false,
        message: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    } finally {
      setIsTesting(false);
    }
  };

  const isValid = validateCredentials();

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          API Configuration
        </CardTitle>
        <CardDescription>
          Configure your CoinEx API credentials for trading operations
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Status Badge */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Configuration Status:</span>
          <Badge variant={isConfigured ? "default" : "destructive"}>
            {isConfigured ? (
              <>
                <CheckCircle className="h-3 w-3 mr-1" />
                Configured
              </>
            ) : (
              <>
                <AlertTriangle className="h-3 w-3 mr-1" />
                Not Configured
              </>
            )}
          </Badge>
        </div>

        {/* API Key Input */}
        <div className="space-y-2">
          <Label htmlFor="apiKey" className="flex items-center gap-2">
            <Key className="h-4 w-4" />
            API Key
          </Label>
          <Input
            id="apiKey"
            type="text"
            value={localApiKey}
            onChange={(e) => setLocalApiKey(e.target.value)}
            placeholder="Enter your CoinEx API key"
            className="font-mono text-sm"
          />
        </div>

        {/* API Secret Input */}
        <div className="space-y-2">
          <Label htmlFor="apiSecret" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            API Secret
          </Label>
          <Input
            id="apiSecret"
            type="password"
            value={localApiSecret}
            onChange={(e) => setLocalApiSecret(e.target.value)}
            placeholder="Enter your CoinEx API secret"
            className="font-mono text-sm"
          />
        </div>

        {/* Proxy Settings */}
        <div className="flex items-center space-x-2">
          <Switch
            id="useProxy"
            checked={useProxy}
            onCheckedChange={setUseProxy}
          />
          <Label htmlFor="useProxy" className="flex items-center gap-2">
            <Wifi className="h-4 w-4" />
            Use Proxy (Recommended for Iranian users)
          </Label>
        </div>

        {/* Test Result */}
        {testResult && (
          <Alert variant={testResult.success ? "default" : "destructive"}>
            <AlertTitle>
              {testResult.success ? "Success!" : "Error!"}
            </AlertTitle>
            <AlertDescription>
              {testResult.message}
            </AlertDescription>
          </Alert>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button 
            onClick={handleSave} 
            disabled={!localApiKey || !localApiSecret}
            className="flex-1"
          >
            Save Configuration
          </Button>
          
          <Button 
            onClick={handleTestConnection} 
            disabled={!localApiKey || !localApiSecret || isTesting}
            variant="outline"
            className="flex-1"
          >
            {isTesting ? "Testing..." : "Test Connection"}
          </Button>
          
          <Button 
            onClick={handleClear} 
            variant="outline"
            disabled={!isConfigured}
          >
            Clear
          </Button>
        </div>

        {/* Instructions */}
        <div className="text-sm text-muted-foreground space-y-2">
          <p><strong>Instructions:</strong></p>
          <ul className="list-disc list-inside space-y-1">
            <li>Get your API credentials from CoinEx exchange</li>
            <li>Enable Futures trading permissions for your API key</li>
            <li>Keep your API secret secure and never share it</li>
            <li>Use proxy settings if you're in a restricted region</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}