import { Server } from 'socket.io';

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
const activeConnections = new Map<string, any>()
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

export const setupSocket = (io: Server) => {
  io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`)
    
    // ذخیره اتصال
    activeConnections.set(socket.id, socket)

    // مدیریت پیام‌های دریافتی
    socket.on('message', (data) => {
      try {
        const message: SubscriptionData = JSON.parse(data.toString())
        
        if (message.type === 'subscribe') {
          const subscriptionKey = `${message.symbol}_${message.timeframe}`
          
          // اضافه کردن اشتراک
          if (!subscriptions.has(subscriptionKey)) {
            subscriptions.set(subscriptionKey, new Set())
          }
          subscriptions.get(subscriptionKey)?.add(socket.id)
          
          console.log(`Client ${socket.id} subscribed to ${subscriptionKey}`)
          
          // ارسال داده اولیه
          const basePrice = basePrices[message.symbol] || 1
          const initialData = generateLivePrice(message.symbol, basePrice)
          socket.send(JSON.stringify(initialData))
        }
      } catch (error) {
        console.error('Error processing message:', error)
      }
    })

    // Handle messages (backward compatibility)
    socket.on('message', (msg: { text: string; senderId: string }) => {
      // Echo: broadcast message only the client who send the message
      socket.emit('message', {
        text: `Echo: ${msg.text}`,
        senderId: 'system',
        timestamp: new Date().toISOString(),
      });
    });

    // مدیریت قطع اتصال
    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`)
      
      // حذف اتصال از تمام اشتراک‌ها
      for (const [subscriptionKey, sockets] of subscriptions.entries()) {
        sockets.delete(socket.id)
        if (sockets.size === 0) {
          subscriptions.delete(subscriptionKey)
        }
      }
      
      // حذف اتصال
      activeConnections.delete(socket.id)
    })

    // Send welcome message
    socket.emit('message', {
      text: 'Welcome to WebSocket Echo Server!',
      senderId: 'system',
      timestamp: new Date().toISOString(),
    });
  })

  // شروع ارسال داده‌های زنده
  startLiveDataStream(io)
}

// تابع برای ارسال داده‌های زنده به تمام مشترکین
function startLiveDataStream(io: Server) {
  setInterval(() => {
    for (const [subscriptionKey, sockets] of subscriptions.entries()) {
      const [symbol, timeframe] = subscriptionKey.split('_')
      const basePrice = basePrices[symbol] || 1
      
      // تولید داده جدید
      const liveData = generateLivePrice(symbol, basePrice)
      
      // ارسال به تمام مشترکین
      for (const socketId of sockets) {
        const socket = activeConnections.get(socketId)
        if (socket && socket.connected) {
          socket.send(JSON.stringify(liveData))
        }
      }
    }
  }, 1000) // ارسال داده هر 1 ثانیه
}