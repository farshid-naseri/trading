// تنظیمات واقعی برای ترید کردن

export const REAL_TRADING_CONFIG = {
  // تنظیمات API
  api: {
    // باید توسط کاربر وارد شود
    apiKey: "",
    apiSecret: "",
    baseUrl: "https://api.coinex.com",
    futuresBaseUrl: "https://api.coinex.com", // برای فیوچرز از همان baseUrl استفاده می‌کنیم
  },

  // تنظیمات مدیریت ریسک (برای شروع امن)
  riskManagement: {
    maxLeverage: 2, // اهرم حداکثر 2 برابر برای شروع
    minAmountUsdt: 100, // حداقل مبلغ برای معاملات فیوچرز
    maxDailyLoss: 10, // حداکثر ضرر روزانه 10 درصد
    maxPositionSize: 5, // حداکثر 5 درصد از سرمایه در هر پوزیشن
  },

  // تنظیمات استراتژی (بهینه‌شده)
  strategy: {
    // تایم فریم‌های پیشنهادی
    timeframes: {
      conservative: "1hour",   // محافظه‌کار
      moderate: "15min",      // متعادل
      aggressive: "5min",     // تهاجمی
    },
    
    // پارامترهای اندیکاتورها (بهینه‌شده با بک تست)
    indicators: {
      atrPeriod: 14,          // دوره ATR استاندارد
      multiplier: 2.5,       // ضریب SuperTrend
      rsiPeriod: 14,         // دوره RSI
      macdFast: 12,          // دوره سریع MACD
      macdSlow: 26,          // دوره کند MACD
      macdSignal: 9,         // دوره سیگنال MACD
    },
    
    // تنظیمات حد سود و ضرر
    profitLoss: {
      conservative: { profit: 2.0, loss: 1.0 },   // محافظه‌کار
      moderate: { profit: 1.5, loss: 0.8 },       // متعادل
      aggressive: { profit: 1.0, loss: 0.5 },     // تهاجمی
    },
    
    // تریلینگ استاپ
    trailingStop: {
      conservative: 1.0,   // 1% برای محافظه‌کار
      moderate: 0.8,      // 0.8% برای متعادل
      aggressive: 0.5,    // 0.5% برای تهاجمی
    },
  },

  // جفت ارزهای پیشنهادی برای شروع
  recommendedPairs: [
    { symbol: "BTCUSDT", minAmount: 50, risk: "low" },
    { symbol: "ETHUSDT", minAmount: 30, risk: "medium" },
    { symbol: "XRPUSDT", minAmount: 20, risk: "medium" },
    { symbol: "ADAUSDT", minAmount: 15, risk: "high" },
  ],

  // تنظیمات تست کاغذی
  paperTrading: {
    enabled: true, // شروع با تست کاغذی
    initialBalance: 1000, // موجودی اولیه مجازی
    maxPositions: 3, // حداکثر تعداد پوزیشن‌های همزمان
  },

  // تنظیمات هشدارها
  alerts: {
    lossThreshold: -5, // هشدار در صورت 5% ضرر
    profitThreshold: 10, // هشدار در صورت 10% سود
    marginCallThreshold: 80, // هشدار در صورت 80% استفاده از مارژین
  },
};

// توابع کمکی برای محاسبات معاملاتی

export function calculatePositionSize(
  riskAmount: number,
  entryPrice: number,
  stopLoss: number,
  leverage: number
): number {
  const riskPerUnit = Math.abs(entryPrice - stopLoss);
  const positionSize = (riskAmount * leverage) / riskPerUnit;
  return Math.max(positionSize, 0.001); // حداقل حجم
}

export function calculateRiskRewardRatio(
  entryPrice: number,
  takeProfit: number,
  stopLoss: number
): number {
  const profit = Math.abs(takeProfit - entryPrice);
  const loss = Math.abs(stopLoss - entryPrice);
  return loss > 0 ? profit / loss : 0;
}

export function validateTradeSetup(
  config: typeof REAL_TRADING_CONFIG,
  proposedTrade: {
    symbol: string;
    amount: number;
    leverage: number;
    profitPercent: number;
    lossPercent: number;
  }
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // بررسی اهرم
  if (proposedTrade.leverage > config.riskManagement.maxLeverage) {
    errors.push(`اهرم بیش از حد مجاز است. حداکثر: ${config.riskManagement.maxLeverage}x`);
  }

  // بررسی مبلغ
  if (proposedTrade.amount < config.riskManagement.minAmountUsdt) {
    errors.push(`مبلغ کمتر از حد مجاز است. حداقل: ${config.riskManagement.minAmountUsdt} USDT`);
  }

  // بررسی نسبت ریسک به پاداش
  const riskReward = proposedTrade.profitPercent / proposedTrade.lossPercent;
  if (riskReward < 1.5) {
    errors.push("نسبت ریسک به پاداش کمتر از 1.5 است. پیشنهاد: حداقل 1.5");
  }

  // بررسی جفت ارز
  const pairConfig = config.recommendedPairs.find(p => p.symbol === proposedTrade.symbol);
  if (!pairConfig) {
    errors.push("جفت ارز مورد نظر در لیست توصیه‌ها نیست");
  } else if (proposedTrade.amount < pairConfig.minAmount) {
    errors.push(`مبلغ برای ${proposedTrade.symbol} کمتر از حداقل است. حداقل: ${pairConfig.minAmount} USDT`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function getRecommendedConfig(riskTolerance: 'conservative' | 'moderate' | 'aggressive') {
  const strategy = REAL_TRADING_CONFIG.strategy;
  
  return {
    leverage: riskTolerance === 'conservative' ? 2 : riskTolerance === 'moderate' ? 3 : 5,
    timeframe: strategy.timeframes[riskTolerance],
    profitPercent: strategy.profitLoss[riskTolerance].profit,
    lossPercent: strategy.profitLoss[riskTolerance].loss,
    trailPercent: strategy.trailingStop[riskTolerance],
    atrPeriod: strategy.indicators.atrPeriod,
    multiplier: strategy.indicators.multiplier,
  };
}