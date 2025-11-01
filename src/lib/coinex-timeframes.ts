// CoinEx WebSocket timeframes mapping
export const COINEX_TIMEFRAMES = {
  '1min': '1min',
  '3min': '3min', 
  '5min': '5min',
  '15min': '15min',
  '30min': '30min',
  '1hour': '1hour',
  '2hour': '2hour',
  '4hour': '4hour',
  '6hour': '6hour',
  '12hour': '12hour',
  '1day': '1day',
  '3day': '3day',
  '1week': '1week'
} as const;

export type CoinExTimeframe = keyof typeof COINEX_TIMEFRAMES;

// Mapping from UI timeframes to CoinEx timeframes
export const mapUITimeframeToCoinEx = (uiTimeframe: string): string => {
  const mapping: Record<string, string> = {
    '1m': '1min',
    '3m': '3min',
    '5m': '5min',
    '15m': '15m',
    '30m': '30min',
    '1h': '1hour',
    '2h': '2hour',
    '4h': '4hour',
    '6h': '6hour',
    '12h': '12hour',
    '1d': '1day',
    '3d': '3day',
    '1w': '1week'
  };
  
  return mapping[uiTimeframe] || '5min';
};

// Mapping from CoinEx timeframes to UI timeframes
export const mapCoinExTimeframeToUI = (coinExTimeframe: string): string => {
  const mapping: Record<string, string> = {
    '1min': '1m',
    '3min': '3m',
    '5min': '5m',
    '15min': '15m',
    '30min': '30m',
    '1hour': '1h',
    '2hour': '2h',
    '4hour': '4h',
    '6hour': '6h',
    '12hour': '12h',
    '1day': '1d',
    '3day': '3d',
    '1week': '1w'
  };
  
  return mapping[coinExTimeframe] || '5m';
};

// Get timeframe in seconds for calculations
export const getTimeframeInSeconds = (timeframe: string): number => {
  const mapping: Record<string, number> = {
    '1min': 60,
    '3min': 180,
    '5min': 300,
    '15min': 900,
    '30min': 1800,
    '1hour': 3600,
    '2hour': 7200,
    '4hour': 14400,
    '6hour': 21600,
    '12hour': 43200,
    '1day': 86400,
    '3day': 259200,
    '1week': 604800
  };
  
  return mapping[timeframe] || 300; // Default to 5min
};

// Available timeframes for UI
export const AVAILABLE_TIMEFRAMES = [
  { value: '1m', label: '1 دقیقه' },
  { value: '3m', label: '3 دقیقه' },
  { value: '5m', label: '5 دقیقه' },
  { value: '15m', label: '15 دقیقه' },
  { value: '30m', label: '30 دقیقه' },
  { value: '1h', label: '1 ساعت' },
  { value: '2h', label: '2 ساعت' },
  { value: '4h', label: '4 ساعت' },
  { value: '6h', label: '6 ساعت' },
  { value: '12h', label: '12 ساعت' },
  { value: '1d', label: '1 روز' },
  { value: '3d', label: '3 روز' },
  { value: '1w', label: '1 هفته' }
];