import { NextRequest } from 'next/server'

interface LivePriceData {
  symbol: string
  price: number
  timestamp: number
  volume?: number
}

interface SubscriptionData {
  type: 'subscribe'
  symbol: string
  timeframe: string
}

// ذخیره‌سازی اتصالات فعال
const activeConnections = new Map<string, WebSocket>()
const subscriptions = new Map<string, Set<string>>()

// تابع برای تولید داده‌های شبیه‌سازی شده زنده
function generateLivePrice(symbol: string, basePrice: number): LivePriceData {
  const randomChange = (Math.random() - 0.5) * 0.002 // 0.2% نوسان
  const price = basePrice * (1 + randomChange)
  
  return {
    symbol,
    price: Number(price.toFixed(4)),
    timestamp: Math.floor(Date.now() / 1000),
    volume: Math.random() * 10000 + 1000
  }
}

// قیمت‌های پایه برای ارزهای مختلف
const basePrices: { [key: string]: number } = {
  'BTCUSDT': 45000,
  'ETHUSDT': 3000,
  'XRPUSDT': 0.6,
  'ADAUSDT': 0.5,
  'SOLUSDT': 100,
}

export async function GET(request: NextRequest) {
  // این فقط برای بررسی سلامت سرور است
  return new Response('WebSocket server is running', { status: 200 })
}

export async function OPTIONS(request: NextRequest) {
  return new Response(null, { 
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  })
}

// WebSocket handler for Next.js
export function WebSocketHandler(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const socketId = Math.random().toString(36).substr(2, 9)
  
  // این یک شبیه‌سازی از WebSocket handler است
  // در Next.js، WebSocket handling باید در سرور اصلی انجام شود
  console.log(`WebSocket connection attempt: ${socketId}`)
  
  return new Response('WebSocket upgrade required', { status: 426 })
}

// تابع برای شروع ارسال داده‌های زنده (برای استفاده در سرور اصلی)
export function startLiveDataStream() {
  setInterval(() => {
    for (const [subscriptionKey, sockets] of subscriptions.entries()) {
      const [symbol, timeframe] = subscriptionKey.split('_')
      const basePrice = basePrices[symbol] || 1
      
      // تولید داده جدید
      const liveData = generateLivePrice(symbol, basePrice)
      
      // ارسال به تمام مشترکین
      for (const socketId of sockets) {
        const socket = activeConnections.get(socketId)
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify(liveData))
        }
      }
    }
  }, 1000) // ارسال داده هر 1 ثانیه
}

// تابع برای مدیریت اشتراک‌ها
export function addSubscription(socketId: string, symbol: string, timeframe: string) {
  const subscriptionKey = `${symbol}_${timeframe}`
  
  // اضافه کردن اشتراک
  if (!subscriptions.has(subscriptionKey)) {
    subscriptions.set(subscriptionKey, new Set())
  }
  subscriptions.get(subscriptionKey)?.add(socketId)
  
  console.log(`Client ${socketId} subscribed to ${subscriptionKey}`)
  
  // ارسال داده اولیه
  const basePrice = basePrices[symbol] || 1
  const initialData = generateLivePrice(symbol, basePrice)
  const socket = activeConnections.get(socketId)
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(initialData))
  }
}

// تابع برای حذف اشتراک‌ها
export function removeSubscription(socketId: string) {
  // حذف اتصال از تمام اشتراک‌ها
  for (const [subscriptionKey, sockets] of subscriptions.entries()) {
    sockets.delete(socketId)
    if (sockets.size === 0) {
      subscriptions.delete(subscriptionKey)
    }
  }
  
  // حذف اتصال
  activeConnections.delete(socketId)
  console.log(`Client ${socketId} disconnected`)
}

// تابع برای افزودن اتصال
export function addConnection(socketId: string, socket: WebSocket) {
  activeConnections.set(socketId, socket)
  console.log(`Client connected: ${socketId}`)
}