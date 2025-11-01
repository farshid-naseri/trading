import { NextRequest, NextResponse } from 'next/server'

interface CandleData {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

// تابع برای تبدیل تایم‌فریم به مقدار عددی بر حسب ثانیه
function getTimeframeSeconds(timeframe: string): number {
  const timeframeMap: { [key: string]: number } = {
    '1m': 60,
    '3m': 180,
    '5m': 300,
    '15m': 900,
    '30m': 1800,
    '1h': 3600,
    '2h': 7200,
    '4h': 14400,
    '6h': 21600,
    '12h': 43200,
    '1d': 86400,
  }
  return timeframeMap[timeframe] || 300
}

// تابع برای تبدیل تایم‌فریم به فرمت مورد نیاز CoinEx
function getCoinExPeriod(timeframe: string): string {
  const periodMap: { [key: string]: string } = {
    '1m': '1min',
    '3m': '3min',
    '5m': '5min',
    '15m': '15min',
    '30m': '30min',
    '1h': '1hour',
    '2h': '2hour',
    '4h': '4hour',
    '6h': '6hour',
    '12h': '12hour',
    '1d': '1day',
  }
  return periodMap[timeframe] || '5min'
}

// تابع برای تولید داده‌های شبیه‌سازی شده
function generateSimulatedData(symbol: string, timeframe: string, limit: number): CandleData[] {
  const candles: CandleData[] = []
  const now = Math.floor(Date.now() / 1000)
  const timeframeSeconds = getTimeframeSeconds(timeframe)
  
  // قیمت پایه بر اساس ارز
  const basePrices: { [key: string]: number } = {
    'BTCUSDT': 45000,
    'ETHUSDT': 3000,
    'XRPUSDT': 0.6,
    'ADAUSDT': 0.5,
    'SOLUSDT': 100,
  }
  
  const basePrice = basePrices[symbol] || 1
  
  for (let i = limit - 1; i >= 0; i--) {
    const timestamp = now - (i * timeframeSeconds)
    
    // شبیه‌سازی نوسانات قیمت
    const randomFactor = 0.02 // 2% نوسان
    const trend = Math.sin(i * 0.1) * 0.01 // روند ملایم
    const volatility = (Math.random() - 0.5) * randomFactor
    
    const open = basePrice * (1 + trend + volatility)
    const close = open * (1 + (Math.random() - 0.5) * 0.01)
    const high = Math.max(open, close) * (1 + Math.random() * 0.005)
    const low = Math.min(open, close) * (1 - Math.random() * 0.005)
    const volume = Math.random() * 1000000 + 100000
    
    candles.push({
      time: timestamp,
      open: Number(open.toFixed(4)),
      high: Number(high.toFixed(4)),
      low: Number(low.toFixed(4)),
      close: Number(close.toFixed(4)),
      volume: Number(volume.toFixed(2))
    })
  }
  
  return candles
}

// تابع برای دریافت داده‌های واقعی از CoinEx API
async function fetchCoinExData(symbol: string, timeframe: string, limit: number): Promise<CandleData[]> {
  try {
    const period = getCoinExPeriod(timeframe)
    const url = `https://api.coinex.com/v2/futures/kline?market=${symbol}&period=${period}&limit=${limit}`
    
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`CoinEx API error: ${response.status}`)
    }
    
    const data = await response.json()
    
    if (data.code !== 0) {
      throw new Error(`CoinEx API error: ${data.message}`)
    }
    
    const candles: CandleData[] = data.data.map((item: any) => ({
      time: item.created_at / 1000, // تبدیل میلی‌ثانیه به ثانیه
      open: parseFloat(item.open),
      high: parseFloat(item.high),
      low: parseFloat(item.low),
      close: parseFloat(item.close),
      volume: parseFloat(item.volume)
    }))
    
    return candles.reverse() // مرتب‌سازی از قدیمی به جدید
  } catch (error) {
    console.error('Error fetching CoinEx data:', error)
    // در صورت خطا، از داده‌های شبیه‌سازی شده استفاده کن
    return generateSimulatedData(symbol, timeframe, limit)
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const symbol = searchParams.get('symbol') || 'XRPUSDT'
  const timeframe = searchParams.get('timeframe') || '5m'
  const limit = parseInt(searchParams.get('limit') || '1000')
  
  try {
    // بررسی پارامترهای ورودی
    if (!symbol || !timeframe) {
      return NextResponse.json(
        { error: 'Symbol and timeframe are required' },
        { status: 400 }
      )
    }
    
    if (limit < 1 || limit > 2000) {
      return NextResponse.json(
        { error: 'Limit must be between 1 and 2000' },
        { status: 400 }
      )
    }
    
    // دریافت داده‌ها
    let candles: CandleData[]
    
    // برای محیط توسعه، از داده‌های شبیه‌سازی شده استفاده کن
    if (process.env.NODE_ENV === 'development') {
      candles = generateSimulatedData(symbol, timeframe, limit)
    } else {
      candles = await fetchCoinExData(symbol, timeframe, limit)
    }
    
    return NextResponse.json({
      symbol,
      timeframe,
      limit,
      candles,
      timestamp: Math.floor(Date.now() / 1000)
    })
    
  } catch (error) {
    console.error('Error in historical data API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}