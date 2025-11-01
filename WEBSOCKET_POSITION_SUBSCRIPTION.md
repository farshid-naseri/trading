# WebSocket Position Subscription Feature

This document describes the implementation of real-time position subscription using CoinEx WebSocket API.

## Overview

The trading bot now supports real-time position updates through WebSocket subscriptions, eliminating the need for periodic API polling. This provides instant updates on position changes, PnL calculations, and other position-related data.

## Features

### 1. Real-time Position Updates
- **WebSocket Method**: `position.subscribe`
- **Update Method**: `position.update`
- **Data Includes**: Position size, entry price, unrealized/realized PnL, margin, leverage, liquidation price, etc.

### 2. Automatic Position Management
- Positions are automatically updated when changes occur
- No need for manual refresh or API polling
- Real-time PnL calculations based on current market prices

### 3. UI Integration
- Toggle switch for enabling/disabling position subscriptions
- Real-time position display in the trading dashboard
- Activity logs for debugging and monitoring

## Implementation Details

### WebSocket Manager (`/src/lib/websocket-manager.ts`)

The WebSocket manager has been enhanced with position subscription capabilities:

```typescript
// Subscribe to position updates for a specific market
async subscribeToPositions(market?: string): Promise<boolean>

// Unsubscribe from position updates
unsubscribeFromPositions(market?: string)

// Handle position update messages
if (message.method === 'position.update' && message.data) {
  this.emit('positionUpdate', message.data);
}
```

### Trading Engine (`/src/lib/trading-engine.ts`)

The trading engine processes position updates and maintains position state:

```typescript
private processPositionData(positionData: any) {
  // Convert CoinEx position data to internal format
  // Calculate PnL based on current price
  // Update position state
  // Emit position update events
}
```

### Trading Dashboard (`/src/components/trading-dashboard.tsx`)

The trading dashboard includes position subscription controls:

```typescript
// State for subscription settings
const [subscriptionForm, setSubscriptionForm] = useState({
  symbol: 'XRPUSDT',
  timeframe: '5m',
  enableState: true,
  enablePositions: false, // New position subscription toggle
});

// Handle subscription toggle
const handleSubscriptionToggle = async (type: keyof typeof subscriptionForm, value: boolean) => {
  switch (type) {
    case 'enablePositions':
      if (value) {
        websocketManager.subscribeToPositions(currentSymbol);
      } else {
        websocketManager.unsubscribeFromPositions(currentSymbol);
      }
      break;
  }
};
```

## Usage

### 1. Enable Position Subscription

In the trading dashboard:
1. Go to the "Manual Trading" tab
2. Scroll down to "Active Subscriptions" section
3. Toggle the "Position Updates" switch to enable
4. The system will automatically subscribe to position updates for the current symbol

### 2. Monitor Position Updates

Once subscribed:
- Position updates will appear in real-time
- The "Positions" tab will show current position data
- Activity logs will show position update events
- PnL calculations update automatically as prices change

### 3. Test Position Subscription

A dedicated test page is available at `/test-position-subscription`:
1. Enter your CoinEx API credentials
2. Connect to WebSocket
3. Authenticate
4. Subscribe to position updates
5. Open a position to see real-time updates

## WebSocket Message Format

### Subscription Request
```json
{
  "method": "position.subscribe",
  "params": {
    "market_list": ["XRPUSDT"]
  },
  "id": 5
}
```

### Position Update Message
```json
{
  "method": "position.update",
  "data": {
    "event": "",
    "position": {
      "position_id": 246830219,
      "market": "XRPUSDT",
      "side": "long",
      "margin_mode": "cross",
      "open_interest": "0.0010",
      "close_avbl": "0.0010",
      "ath_position_amount": "0.0010",
      "unrealized_pnl": "0.00",
      "realized_pnl": "-0.01413182100000000000",
      "avg_entry_price": "30721.35000000000000000000",
      "cml_position_value": "30.72135000000000000000",
      "max_position_value": "30.72135000000000000000",
      "take_profit_price": "0.00000000000000000000",
      "stop_loss_price": "0.00000000000000000000",
      "take_profit_type": "latest_price",
      "stop_loss_type": "latest_price",
      "leverage": "50",
      "margin_avbl": "0.61442700000000000000",
      "ath_margin_size": "0.61442700000000000000",
      "position_margin_rate": "0.02000000000000000000",
      "maintenance_margin_value": "0.15364710000000000000",
      "maintenance_margin_rate": "0.005",
      "liq_price": "31179.87761194029850746268",
      "bkr_price": "31335.77700000000000000000",
      "adl_level": 5,
      "settle_price": "30721.35000000000000000000",
      "settle_val": "30.72135000000000000000",
      "first_filled_price": "30721.35",
      "latest_filled_price": "30721.35",
      "created_at": 1642145331234,
      "updated_at": 1642145331234
    }
  },
  "id": null
}
```

## Benefits

1. **Real-time Updates**: Instant position updates without polling delays
2. **Reduced API Calls**: Eliminates need for periodic position API requests
3. **Better Performance**: WebSocket is more efficient than HTTP polling
4. **Improved UX**: Users see position changes immediately
5. **Resource Efficient**: Lower bandwidth and server load

## Error Handling

The system includes comprehensive error handling:
- WebSocket connection errors
- Authentication failures
- Subscription errors
- Network disconnections with automatic reconnection

## Troubleshooting

### Common Issues

1. **Position updates not appearing**
   - Check if position subscription is enabled
   - Verify WebSocket connection status
   - Ensure API credentials are correct

2. **Authentication failures**
   - Verify API key and secret
   - Check API permissions (requires futures trading)
   - Ensure IP whitelist is configured

3. **WebSocket connection issues**
   - Check network connectivity
   - Verify WebSocket URL is correct
   - Check for firewall/proxy issues

### Debugging

Use the test page at `/test-position-subscription` for debugging:
- View real-time connection status
- Monitor WebSocket messages
- Check authentication status
- Verify subscription state

## Future Enhancements

1. **Position History**: Subscribe to position history updates
2. **Order Updates**: Real-time order status updates
3. **Balance Updates**: Real-time balance changes
4. **Market Data**: Enhanced market data subscriptions

## Security Notes

- API credentials are stored in memory only
- WebSocket connections use secure WSS protocol
- Authentication uses HMAC-SHA256 signatures
- No sensitive data is logged or stored