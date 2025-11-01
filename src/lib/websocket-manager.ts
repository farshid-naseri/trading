import { useEffect, useRef, useState } from 'react';
import pako from 'pako';

interface WebSocketMessage {
  method: string;
  params?: any;
  id?: number;
  data?: any;
}

interface UseWebSocketOptions {
  url: string;
  apiKey?: string;
  apiSecret?: string;
  onMessage?: (message: any) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Event) => void;
  onAuthenticated?: () => void;
  onAuthenticationFailed?: (error: any) => void;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

export function useWebSocket(options: UseWebSocketOptions) {
  const {
    url,
    apiKey,
    apiSecret,
    onMessage,
    onOpen,
    onClose,
    onError,
    onAuthenticated,
    onAuthenticationFailed,
    reconnectInterval = 5000,
    maxReconnectAttempts = 10
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connect = () => {
    try {
      const ws = new WebSocket(url);
      
      ws.onopen = () => {
        setIsConnected(true);
        setReconnectAttempts(0);
        onOpen?.();
      };

      ws.onmessage = (event) => {
        try {
          // Handle compressed messages (similar to Python implementation)
          let messageData = event.data;
          
          // If the message is binary (compressed), decompress it
          if (messageData instanceof Blob) {
            // For now, we'll handle it as text - in a real implementation,
            // you'd need to decompress zlib-compressed messages
            messageData.text().then(text => {
              try {
                const parsed = JSON.parse(text);
                
                // Handle authentication response
                if (parsed.id === 999) {
                  if (parsed.code === 0) {
                    setIsAuthenticated(true);
                    onAuthenticated?.();
                  } else {
                    setIsAuthenticated(false);
                    onAuthenticationFailed?.(parsed);
                  }
                } else {
                  onMessage?.(parsed);
                }
              } catch (error) {
                console.error('Error parsing WebSocket message:', error);
              }
            });
          } else {
            try {
              const parsed = JSON.parse(messageData);
              
              // Handle authentication response
              if (parsed.id === 999) {
                if (parsed.code === 0) {
                  setIsAuthenticated(true);
                  onAuthenticated?.();
                } else {
                  setIsAuthenticated(false);
                  onAuthenticationFailed?.(parsed);
                }
              } else {
                onMessage?.(parsed);
              }
            } catch (error) {
              console.error('Error parsing WebSocket message:', error);
            }
          }
        } catch (error) {
          console.error('Error processing WebSocket message:', error);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        onClose?.();
        
        // Attempt to reconnect
        if (reconnectAttempts < maxReconnectAttempts) {
          setReconnectAttempts(prev => prev + 1);
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectInterval);
        }
      };

      ws.onerror = (error) => {
        onError?.(error);
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('Error creating WebSocket connection:', error);
    }
  };

  const disconnect = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    setIsConnected(false);
  };

  const send = (message: WebSocketMessage) => {
    if (wsRef.current && isConnected) {
      wsRef.current.send(JSON.stringify(message));
    }
  };

  // Authentication method for the hook using CoinEx server.sign
  const authenticate = async () => {
    if (!apiKey || !apiSecret) {
      console.warn('API credentials not set for authentication');
      return false;
    }

    if (!isConnected) {
      console.warn('WebSocket not connected for authentication');
      return false;
    }

    try {
      const timestamp = Date.now().toString();
      
      // Generate signature for WebSocket authentication
      const signature = await generateSignatureForWebSocketHook(timestamp, apiSecret);
      
      // Send authentication message using server.sign method
      const authMessage = {
        method: 'server.sign',
        params: {
          access_id: apiKey,
          signed_str: signature,
          timestamp: parseInt(timestamp)
        },
        id: 999
      };

      send(authMessage);
      console.log('Authentication request sent using server.sign method');
      return true;
    } catch (error) {
      console.error('Authentication error:', error);
      return false;
    }
  };

  // Generate signature for WebSocket authentication (hook version)
  const generateSignatureForWebSocketHook = async (timestamp: string, secret: string): Promise<string> => {
    try {
      const encoder = new TextEncoder();
      const keyData = encoder.encode(secret);
      const messageData = encoder.encode(timestamp);
      
      const key = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      
      const signature = await crypto.subtle.sign('HMAC', key, messageData);
      
      // Convert to hex string
      return Array.from(new Uint8Array(signature))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    } catch (error) {
      console.error('WebSocket signature generation error:', error);
      throw error;
    }
  };



  // Removed deprecated subscription methods - using only state.subscribe for price data

  const subscribeToState = (market: string) => {
    send({
      method: 'state.subscribe',
      params: {
        market_list: [market]
      },
      id: 7
    });
    console.log(`📊 Hook subscribed to market state for ${market} (includes last & mark_price)`);
  };

  const subscribeToPositions = async (market?: string): Promise<boolean> => {
  if (!isAuthenticated) {
    console.warn('Cannot subscribe to positions - not authenticated');
    return false;
  }
  
  const subscribeMessage = {
    method: 'position.subscribe',
    params: {
      market_list: market ? [market] : []
    },
    id: 5
  };
  
  console.log(`📋 Sending position subscription message: ${JSON.stringify(subscribeMessage, null, 2)}`);
  send(subscribeMessage);
  console.log(`✅ Position subscription request sent for ${market || 'all markets'}`);
  return true;
};

  const unsubscribeFromPositions = (market?: string) => {
    send({
      method: 'position.unsubscribe',
      params: {
        market_list: market ? [market] : []
      },
      id: 105
    });
  };



  // Removed deprecated unsubscribe methods

  const unsubscribeFromState = (market: string) => {
    send({
      method: 'state.unsubscribe',
      params: {
        market_list: [market]
      },
      id: 107
    });
    console.log(`📊 Hook unsubscribed from market state for ${market}`);
  };

  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, [url]);

  return {
    isConnected,
    isAuthenticated,
    reconnectAttempts,
    connect,
    disconnect,
    send,
    authenticate,
    subscribeToState,
    subscribeToPositions,
    unsubscribeFromState,
    unsubscribeFromPositions
  };
}

export class WebSocketManager {
  private ws: WebSocket | null = null;
  private url: string;
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private reconnectInterval: number = 5000;
  private messageHandlers: Map<string, ((data: any) => void)[]> = new Map();
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private isConnecting: boolean = false;
  private shouldReconnect: boolean = true;
  private apiKey: string | null = null;
  private apiSecret: string | null = null;
  private isAuthenticated: boolean = false;

  constructor(url: string, apiKey?: string, apiSecret?: string) {
    this.url = url;
    this.apiKey = apiKey || null;
    this.apiSecret = apiSecret || null;
  }

  private addLog(message: string) {
    console.log(`[WebSocketManager] ${message}`);
  }

  // Set API credentials (can be called after construction)
  setApiCredentials(apiKey: string, apiSecret: string) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.addLog('🔑 API credentials set');
  }

  // Generate signature for WebSocket authentication
  private async generateSignature(method: string, path: string, body: string, timestamp: string, params: Record<string, any> = {}): Promise<string> {
    if (!this.apiSecret) {
      throw new Error('API Secret not set');
    }

    // Sort parameters alphabetically (similar to HTTP API)
    const sortedParams = Object.entries(params)
      .sort(([a], [b]) => a.localeCompare(b))
      .reduce((obj, [key, value]) => {
        obj[key] = value;
        return obj;
      }, {} as Record<string, any>);

    // Create query string
    const sortedQuery = Object.entries(sortedParams)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');

    // Create prepared string for signature
    let preparedStr: string;
    if (sortedQuery) {
      preparedStr = `${method}${path}?${sortedQuery}${body}${timestamp}`;
    } else {
      preparedStr = `${method}${path}${body}${timestamp}`;
    }

    // Generate HMAC-SHA256 signature
    const signature = await this.hmacSha256(preparedStr, this.apiSecret);
    
    return signature.toLowerCase();
  }

  // Simple HMAC-SHA256 implementation for browser environment
  private async hmacSha256(message: string, secret: string): Promise<string> {
    try {
      const encoder = new TextEncoder();
      const keyData = encoder.encode(secret);
      const messageData = encoder.encode(message);
      
      const key = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      
      const signature = await crypto.subtle.sign('HMAC', key, messageData);
      
      // Convert to hex string
      return Array.from(new Uint8Array(signature))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    } catch (error) {
      this.addLog(`❌ HMAC-SHA256 error: ${error}`);
      throw error;
    }
  }

  // Authenticate with WebSocket using CoinEx server.sign method
  async authenticate(): Promise<boolean> {
    if (!this.apiKey || !this.apiSecret) {
      this.addLog('❌ API credentials not set for authentication');
      return false;
    }

    if (!this.isConnected) {
      this.addLog('❌ WebSocket not connected for authentication');
      return false;
    }

    try {
      const timestamp = Date.now().toString();
      this.addLog(`🔐 Generating authentication with timestamp: ${timestamp}`);
      
      // Generate signature string according to CoinEx documentation
      // The signature should be generated using the same method as HTTP API
      const signature = await this.generateSignatureForWebSocket(timestamp);
      this.addLog(`🔐 Generated signature: ${signature.substring(0, 10)}...`);
      
      // Send authentication message using server.sign method
      const authMessage = {
        method: 'server.sign',
        params: {
          access_id: this.apiKey,
          signed_str: signature,
          timestamp: parseInt(timestamp)
        },
        id: 999
      };

      this.addLog(`🔐 Sending authentication message: ${JSON.stringify(authMessage, null, 2)}`);
      this.send(authMessage);
      this.addLog('✅ Authentication request sent using server.sign method');
      
      return true;
    } catch (error) {
      this.addLog(`❌ Authentication error: ${error}`);
      return false;
    }
  }

  // Generate signature for WebSocket authentication
  private async generateSignatureForWebSocket(timestamp: string): Promise<string> {
    if (!this.apiSecret) {
      throw new Error('API Secret not set');
    }

    try {
      // According to CoinEx documentation, the signature is generated
      // using HMAC-SHA256 with the API secret
      const encoder = new TextEncoder();
      const keyData = encoder.encode(this.apiSecret);
      const messageData = encoder.encode(timestamp);
      
      const key = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      
      const signature = await crypto.subtle.sign('HMAC', key, messageData);
      
      // Convert to hex string
      return Array.from(new Uint8Array(signature))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    } catch (error) {
      this.addLog(`❌ WebSocket signature generation error: ${error}`);
      throw error;
    }
  }

  // Complete connection and authentication flow
  async connectAndSubscribe(market?: string): Promise<boolean> {
    try {
      this.addLog(`🚀 Starting complete connection and subscription flow...`);
      
      // Step 1: Wait for connection
      this.addLog(`📡 Step 1: Waiting for WebSocket connection...`);
      const connected = await this.waitForConnection(30000);
      if (!connected) {
        this.addLog(`❌ Failed to establish WebSocket connection`);
        return false;
      }
      
      // Step 2: Authenticate
      this.addLog(`🔐 Step 2: Authenticating WebSocket...`);
      const authSent = await this.authenticate();
      if (!authSent) {
        this.addLog(`❌ Failed to send authentication request`);
        return false;
      }
      
      // Step 3: Wait for authentication to complete
      this.addLog(`⏳ Step 3: Waiting for authentication confirmation...`);
      const authenticated = await this.waitForAuthentication(15000);
      if (!authenticated) {
        this.addLog(`❌ Authentication failed or timed out`);
        return false;
      }
      
      // Step 4: Subscribe to positions
      this.addLog(`📋 Step 4: Subscribing to positions...`);
      const subscribed = await this.subscribeToPositions(market);
      if (!subscribed) {
        this.addLog(`❌ Failed to subscribe to positions`);
        return false;
      }
      
      this.addLog(`✅ Complete connection and subscription flow successful!`);
      return true;
      
    } catch (error) {
      this.addLog(`❌ Error in connection and subscription flow: ${error}`);
      return false;
    }
  }

  // Wait for connection to complete
  async waitForConnection(timeoutMs: number = 30000): Promise<boolean> {
    this.addLog(`⏳ Waiting for WebSocket connection (timeout: ${timeoutMs}ms)...`);
    
    return new Promise((resolve) => {
      const startTime = Date.now();
      
      const checkConnection = () => {
        if (this.isConnected) {
          this.addLog(`✅ WebSocket connection confirmed`);
          resolve(true);
          return;
        }
        
        if (Date.now() - startTime > timeoutMs) {
          this.addLog(`❌ WebSocket connection timeout after ${timeoutMs}ms`);
          resolve(false);
          return;
        }
        
        setTimeout(checkConnection, 500);
      };
      
      checkConnection();
    });
  }

  // Wait for authentication to complete
  async waitForAuthentication(timeoutMs: number = 10000): Promise<boolean> {
    this.addLog(`⏳ Waiting for authentication (timeout: ${timeoutMs}ms)...`);
    
    return new Promise((resolve) => {
      const startTime = Date.now();
      
      const checkAuth = () => {
        if (this.isAuthenticated) {
          this.addLog(`✅ Authentication confirmed`);
          resolve(true);
          return;
        }
        
        if (Date.now() - startTime > timeoutMs) {
          this.addLog(`❌ Authentication timeout after ${timeoutMs}ms`);
          resolve(false);
          return;
        }
        
        setTimeout(checkAuth, 500);
      };
      
      checkAuth();
    });
  }

  // Check if authenticated
  get authenticated(): boolean {
    return this.isAuthenticated;
  }

  private decompressMessage(compressedData: Uint8Array): Uint8Array {
    try {
      // Try to decompress using pako (similar to Python's zlib.decompress)
      // The Python code uses: wbits=zlib.MAX_WBITS | 16 which is for gzip with header
      
      // First try gzip (most likely based on Python code)
      try {
        return pako.ungzip(compressedData);
      } catch (gzipError) {
        // If gzip fails, try raw deflate (common for WebSocket messages)
        try {
          return pako.inflate(compressedData);
        } catch (inflateError) {
          // If raw deflate fails, try with zlib header
          try {
            return pako.inflateRaw(compressedData);
          } catch (rawError) {
            // If all decompression methods fail, try to detect and remove gzip header manually
            try {
              return this.manualGzipDecompress(compressedData);
            } catch (manualError) {
              // If all methods fail, return original data
              this.addLog(`❌ All decompression methods failed, using original data`);
              return compressedData;
            }
          }
        }
      }
    } catch (error) {
      this.addLog(`❌ Error decompressing message: ${error}`);
      throw error;
    }
  }

  private manualGzipDecompress(compressedData: Uint8Array): Uint8Array {
    try {
      // Try to manually handle gzip decompression
      // Check for gzip magic number (0x1f 0x8b)
      if (compressedData.length >= 2 && 
          compressedData[0] === 0x1f && 
          compressedData[1] === 0x8b) {
        // This is gzip data, try to extract the deflate stream
        // Skip gzip header (minimum 10 bytes)
        let offset = 10;
        
        // Check for extra field
        if ((compressedData[3] & 0x04) !== 0) {
          const extraLen = compressedData[10] | (compressedData[11] << 8);
          offset += 2 + extraLen;
        }
        
        // Check for filename
        if ((compressedData[3] & 0x08) !== 0) {
          while (offset < compressedData.length && compressedData[offset] !== 0) {
            offset++;
          }
          offset++; // Skip null terminator
        }
        
        // Check for comment
        if ((compressedData[3] & 0x10) !== 0) {
          while (offset < compressedData.length && compressedData[offset] !== 0) {
            offset++;
          }
          offset++; // Skip null terminator
        }
        
        // Check for CRC16
        if ((compressedData[3] & 0x02) !== 0) {
          offset += 2;
        }
        
        // Extract deflate stream (remove last 8 bytes for CRC32 and size)
        const deflateData = compressedData.slice(offset, compressedData.length - 8);
        
        try {
          return pako.inflate(deflateData);
        } catch (error) {
          throw new Error(`Manual gzip decompression failed: ${error}`);
        }
      } else {
        throw new Error('Not a gzip file');
      }
    } catch (error) {
      throw new Error(`Manual gzip decompression error: ${error}`);
    }
  }

  private isCompressed(data: Uint8Array): boolean {
    // Check if the data is compressed by looking for common compression headers
    if (data.length < 2) return false;
    
    // Check for gzip magic number (0x1f 0x8b)
    if (data[0] === 0x1f && data[1] === 0x8b) {
      return true;
    }
    
    // Check for zlib header (0x78 0x9C or 0x78 0xDA)
    if (data[0] === 0x78 && (data[1] === 0x9C || data[1] === 0xDA)) {
      return true;
    }
    
    // Check for raw deflate (common in WebSocket messages)
    // This is harder to detect, but we can try some heuristics
    if (data.length > 10) {
      // Try to detect if it looks like compressed data
      // Compressed data often has high entropy (many different byte values)
      const uniqueBytes = new Set(data);
      const entropy = uniqueBytes.size / data.length;
      
      // If entropy is high (> 0.8) and it starts with common deflate patterns
      if (entropy > 0.8) {
        // Try to decompress a small portion to see if it's valid
        try {
          const testDecompress = pako.inflate(data.slice(0, Math.min(data.length, 100)));
          // If decompression succeeds and produces reasonable text, it's likely compressed
          if (testDecompress.length > 0) {
            return true;
          }
        } catch {
          // Not compressed with deflate
        }
      }
    }
    
    return false;
  }

  connect() {
    if (this.isConnecting || (this.isConnected && this.ws)) {
      this.addLog('WebSocket already connected or connecting');
      return;
    }

    try {
      this.isConnecting = true;
      this.shouldReconnect = true;
      
      // Close existing connection if any
      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }

      this.addLog(`🔄 Connecting to WebSocket: ${this.url}`);
      
      this.ws = new WebSocket(this.url);
      
      this.ws.onopen = () => {
        this.isConnected = true;
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.addLog('✅ WebSocket connected successfully');
        this.emit('open');
      };

      this.ws.onmessage = (event) => {
        try {
          let messageData = event.data;
          
          if (messageData instanceof Blob) {
            // Handle compressed messages (similar to Python implementation)
            const reader = new FileReader();
            reader.onload = () => {
              try {
                const arrayBuffer = reader.result as ArrayBuffer;
                const uint8Array = new Uint8Array(arrayBuffer);
                
                // Check if the message is compressed (similar to Python's decompress_message)
                if (this.isCompressed(uint8Array)) {
                  const decompressed = this.decompressMessage(uint8Array);
                  const text = new TextDecoder().decode(decompressed);
                  try {
                    const parsed = JSON.parse(text);
                    this.handleMessage(parsed);
                  } catch (parseError) {
                    this.addLog(`❌ Error parsing decompressed message: ${parseError}`);
                    this.addLog(`❌ Decompressed text: ${text.substring(0, 100)}...`);
                  }
                } else {
                  // Try to parse as text directly
                  const text = new TextDecoder().decode(uint8Array);
                  try {
                    const parsed = JSON.parse(text);
                    this.handleMessage(parsed);
                  } catch (parseError) {
                    this.addLog(`❌ Error parsing uncompressed message: ${parseError}`);
                    this.addLog(`❌ Raw text: ${text.substring(0, 100)}...`);
                  }
                }
              } catch (error) {
                this.addLog(`❌ Error processing WebSocket message: ${error}`);
                // Try parsing as text directly as fallback
                messageData.text().then(text => {
                  try {
                    const parsed = JSON.parse(text);
                    this.handleMessage(parsed);
                  } catch (fallbackError) {
                    this.addLog(`❌ Fallback parsing also failed: ${fallbackError}`);
                  }
                });
              }
            };
            reader.readAsArrayBuffer(messageData);
          } else if (messageData instanceof ArrayBuffer) {
            // Handle binary data directly
            try {
              const uint8Array = new Uint8Array(messageData);
              if (this.isCompressed(uint8Array)) {
                const decompressed = this.decompressMessage(uint8Array);
                const text = new TextDecoder().decode(decompressed);
                const parsed = JSON.parse(text);
                this.handleMessage(parsed);
              } else {
                const text = new TextDecoder().decode(uint8Array);
                const parsed = JSON.parse(text);
                this.handleMessage(parsed);
              }
            } catch (error) {
              this.addLog(`❌ Error parsing binary WebSocket message: ${error}`);
            }
          } else {
            // Handle text data
            try {
              const parsed = JSON.parse(messageData);
              this.handleMessage(parsed);
            } catch (error) {
              this.addLog(`❌ Error parsing WebSocket message: ${error}`);
            }
          }
        } catch (error) {
          this.addLog(`❌ Error processing WebSocket message: ${error}`);
        }
      };

      this.ws.onclose = (event) => {
        this.isConnected = false;
        this.isConnecting = false;
        this.addLog(`🔌 WebSocket closed: ${event.code} ${event.reason}`);
        this.emit('close');
        
        // Only reconnect if it's not a normal closure and we should reconnect
        if (this.shouldReconnect && event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          this.addLog(`🔄 Attempting to reconnect... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
          
          // Exponential backoff
          const backoffTime = Math.min(this.reconnectInterval * Math.pow(1.5, this.reconnectAttempts - 1), 30000);
          this.addLog(`🔄 Next reconnect attempt in ${backoffTime / 1000} seconds`);
          
          this.reconnectTimeout = setTimeout(() => {
            this.connect();
          }, backoffTime);
        } else if (event.code !== 1000) {
          this.addLog(`❌ Max reconnection attempts (${this.maxReconnectAttempts}) reached`);
        }
      };

      this.ws.onerror = (error) => {
        this.addLog(`❌ WebSocket error: ${error}`);
        this.emit('error', error);
      };

      // Set connection timeout - increased for better reliability
      setTimeout(() => {
        if (this.isConnecting && this.ws) {
          this.addLog(`❌ WebSocket connection timeout`);
          this.ws.close();
        }
      }, 30000); // Increased from 15 to 30 seconds

    } catch (error) {
      this.isConnecting = false;
      this.addLog(`❌ Error creating WebSocket connection: ${error}`);
      this.addLog(`❌ WebSocket URL: ${this.url}`);
    }
  }

  private handleMessage(message: any) {
    // لاگ تمام پیام‌های دریافتی برای دیباگ
    this.addLog(`📨 Received message: ${JSON.stringify(message)}`);
    
    // Handle authentication response
    if (message.id === 999) {
      this.addLog(`🔐 Authentication response: ${JSON.stringify(message)}`);
      if (message.code === 0) {
        this.isAuthenticated = true;
        this.addLog('✅ WebSocket authentication successful');
        this.emit('authenticated');
      } else {
        this.isAuthenticated = false;
        this.addLog(`❌ WebSocket authentication failed: ${message.message || 'Unknown error'}`);
        this.emit('authentication_failed', message);
      }
      return;
    }
    
    // Handle subscription confirmation messages
    if (message.id && message.code === 0) {
      switch (message.id) {
        case 1:
          this.addLog('✅ Depth subscription confirmed');
          break;
        case 2:
          this.addLog('✅ Kline subscription confirmed');
          break;
        case 3:
          this.addLog('✅ Trades subscription confirmed');
          break;
        case 4:
          this.addLog('✅ Market overview subscription confirmed');
          break;
        case 5:
          this.addLog('🎉 POSITION SUBSCRIPTION CONFIRMED!');
          this.addLog('🎉 Now waiting for position updates...');
          break;
        case 6:
          this.addLog('✅ Market ticker subscription confirmed');
          break;
        case 7:
          this.addLog('✅ Market state subscription confirmed');
          break;
        default:
          this.addLog(`✅ Subscription confirmed (ID: ${message.id})`);
          break;
      }
    }

    // Handle subscription error messages
    if (message.id && message.code !== 0 && message.code !== undefined) {
      this.addLog(`❌ Subscription error (ID: ${message.id}): ${message.message || 'Unknown error'}`);
    }

    // Handle position updates specifically
    if (message.method === 'position.update' && message.data) {
      this.addLog(`🎯 POSITION UPDATE RECEIVED!`);
      this.addLog(`🎯 Event: ${message.data.event}`);
      this.addLog(`🎯 Position ID: ${message.data.position?.position_id}`);
      this.addLog(`🎯 Market: ${message.data.position?.market}`);
      this.addLog(`🎯 Side: ${message.data.position?.side}`);
      this.addLog(`🎯 Full data: ${JSON.stringify(message.data, null, 2)}`);
      this.emit('positionUpdate', message.data);
    }

    // Handle position snapshot (initial data)
    if (message.method === 'position.snapshot' && message.data) {
      this.addLog(`📸 POSITION SNAPSHOT RECEIVED!`);
      this.addLog(`📸 Full data: ${JSON.stringify(message.data, null, 2)}`);
      this.emit('positionSnapshot', message.data);
    }

    // Handle other message types
    if (message.method && this.messageHandlers.has(message.method)) {
      const handlers = this.messageHandlers.get(message.method) || [];
      handlers.forEach(handler => handler(message));
    }
    
    // Handle state.update messages specifically
    if (message.method === 'state.update' && message.data && message.data.state_list) {
      this.emit('stateUpdate', message.data.state_list);
    }
    
    // Also emit to general message handlers
    this.emit('message', message);
  }

  on(event: string, handler: (data: any) => void) {
    if (!this.messageHandlers.has(event)) {
      this.messageHandlers.set(event, []);
    }
    this.messageHandlers.get(event)!.push(handler);
  }

  off(event: string, handler: (data: any) => void) {
    const handlers = this.messageHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  private emit(event: string, data?: any) {
    const handlers = this.messageHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => handler(data));
    }
  }

  send(message: any) {
    if (this.ws && this.isConnected) {
      const messageStr = JSON.stringify(message);
      this.addLog(`📤 Sending WebSocket message: ${messageStr}`);
      this.ws.send(messageStr);
    } else {
      this.addLog(`❌ Cannot send message - WebSocket not connected: ${JSON.stringify(message)}`);
    }
  }



  // Removed deprecated subscription methods - using only state.subscribe for price data

  subscribeToState(market: string) {
    this.send({
      method: 'state.subscribe',
      params: {
        market_list: [market]
      },
      id: 7
    });
    this.addLog(`📊 Subscribed to market state for ${market} (includes last & mark_price)`);
  }

  // Check subscription status
  checkSubscriptionStatus() {
    this.addLog(`🔍 Connection status: ${this.isConnected ? 'Connected' : 'Disconnected'}`);
    this.addLog(`🔍 Authentication status: ${this.isAuthenticated ? 'Authenticated' : 'Not authenticated'}`);
    this.addLog(`🔍 Current subscriptions will be confirmed by server responses`);
  }

  // Debug function to list all active subscriptions
  debugSubscriptions() {
    this.addLog(`🔍 Debug - Current WebSocket status:`);
    this.addLog(`  - Connected: ${this.isConnected}`);
    this.addLog(`  - Authenticated: ${this.isAuthenticated}`);
    this.addLog(`  - WebSocket readyState: ${this.ws ? this.ws.readyState : 'N/A'}`);
    this.addLog(`🔍 Active subscriptions (based on last sent messages):`);
    this.addLog(`  - Note: Actual subscription status should be confirmed by server responses`);
  }

  async subscribeToPositions(market?: string): Promise<boolean> {
    this.addLog(`📋 Attempting to subscribe to positions for ${market || 'all markets'}`);
    this.addLog(`📋 Authentication status: ${this.isAuthenticated}`);
    this.addLog(`📋 Connection status: ${this.isConnected}`);
    
    if (!this.isConnected) {
      this.addLog('⚠️ Cannot subscribe to positions - not connected');
      return false;
    }
    
    if (!this.isAuthenticated) {
      this.addLog('⚠️ Not authenticated, waiting for authentication...');
      const authSuccess = await this.waitForAuthentication(15000);
      if (!authSuccess) {
        this.addLog('❌ Authentication timeout, cannot subscribe to positions');
        return false;
      }
    }
    
    const subscribeMessage = {
      method: 'position.subscribe',
      params: {
        market_list: market ? [market] : []
      },
      id: 5
    };
    
    this.addLog(`📋 Sending position subscription message: ${JSON.stringify(subscribeMessage, null, 2)}`);
    this.send(subscribeMessage);
    this.addLog(`✅ Position subscription request sent for ${market || 'all markets'}`);
    return true;
  }

  unsubscribeFromPositions(market?: string) {
    this.send({
      method: 'position.unsubscribe',
      params: {
        market_list: market ? [market] : []
      },
      id: 105
    });
  }



  // Removed deprecated unsubscribe methods

  unsubscribeFromState(market: string) {
    this.send({
      method: 'state.unsubscribe',
      params: {
        market_list: [market]
      },
      id: 107
    });
    this.addLog(`📊 Unsubscribed from market state for ${market}`);
  }

  disconnect() {
    this.shouldReconnect = false; // Stop reconnection attempts
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    if (this.ws) {
      // Close with normal closure code
      this.ws.close(1000, 'Normal closure');
      this.ws = null;
    }
    
    this.isConnected = false;
    this.isConnecting = false;
    this.addLog('🔌 WebSocket disconnected gracefully');
  }

  get connected() {
    return this.isConnected;
  }

  get connectionState() {
    if (this.isConnecting) return 'connecting';
    if (this.isConnected) return 'connected';
    return 'disconnected';
  }

  forceReconnect() {
    this.addLog('🔄 Forcing reconnection...');
    this.shouldReconnect = true;
    this.reconnectAttempts = 0;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.connect();
  }

  // Test method to check all subscriptions
  testSubscriptions(symbol: string) {
    this.addLog(`🧪 Testing all subscriptions for ${symbol}...`);
    
    // Test all subscription methods
    setTimeout(() => {
      if (this.connected) {
        this.subscribeToDepth(symbol);
        this.addLog(`📊 Test subscribed to depth data for ${symbol}`);
      }
    }, 1000);
    
    setTimeout(() => {
      if (this.connected) {
        this.subscribeToKline(symbol, '1min');
        this.addLog(`🕯️ Test subscribed to kline data for ${symbol}`);
      }
    }, 2000);
    
    setTimeout(() => {
      if (this.connected) {
        this.subscribeToTrades(symbol);
        this.addLog(`💰 Test subscribed to trades data for ${symbol}`);
      }
    }, 3000);
    
    setTimeout(() => {
      if (this.connected) {
        this.subscribeToMarketOverview(symbol);
        this.addLog(`📈 Test subscribed to market overview for ${symbol}`);
      }
    }, 4000);
    
    setTimeout(() => {
      if (this.connected) {
        this.subscribeToPositions(symbol);
        this.addLog(`📋 Test subscribed to position updates for ${symbol}`);
      }
    }, 5000);
    
    setTimeout(() => {
      if (this.connected) {
        this.subscribeToState(symbol);
        this.addLog(`📊 Test subscribed to market state for ${symbol}`);
      }
    }, 6000);
  }

  // Enhanced method to check subscription status with detailed logging
  checkSubscriptionStatus() {
    this.addLog(`🔍 Connection status: ${this.isConnected ? 'Connected' : 'Disconnected'}`);
    this.addLog(`🔍 Authentication status: ${this.isAuthenticated ? 'Authenticated' : 'Not authenticated'}`);
    this.addLog(`🔍 Current subscriptions will be confirmed by server responses`);
    
    // Test subscription by sending a test message for each type
    if (this.isConnected) {
      this.addLog(`🔍 Testing subscription status by resubscribing...`);
      // The actual subscription test will be done by the trading engine
    }
  }

  // Debug function to list all active subscriptions
  debugSubscriptions() {
    this.addLog(`🔍 Debug - Current WebSocket status:`);
    this.addLog(`  - Connected: ${this.isConnected}`);
    this.addLog(`  - Authenticated: ${this.isAuthenticated}`);
    this.addLog(`  - WebSocket readyState: ${this.ws ? this.ws.readyState : 'N/A'}`);
    this.addLog(`🔍 Active subscriptions (based on last sent messages):`);
    this.addLog(`  - Note: Actual subscription status should be confirmed by server responses`);
  }

  // Test function to verify unsubscribe/subscribe works
  testSubscriptionToggle(market: string, period: string) {
    this.addLog(`🧪 Testing subscription toggle for ${market} (${period})`);
    
    // Test unsubscribe
    this.addLog(`🧪 Step 1: Unsubscribing from kline...`);
    this.unsubscribeFromKline(market, period);
    
    setTimeout(() => {
      // Test subscribe
      this.addLog(`🧪 Step 2: Subscribing to kline...`);
      this.subscribeToKline(market, period);
    }, 1000);
    
    setTimeout(() => {
      // Test unsubscribe from trades
      this.addLog(`🧪 Step 3: Unsubscribing from trades...`);
      this.unsubscribeFromTrades(market);
    }, 2000);
    
    setTimeout(() => {
      // Test subscribe to trades
      this.addLog(`🧪 Step 4: Subscribing to trades...`);
      this.subscribeToTrades(market);
    }, 3000);
  }
}
