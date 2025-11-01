import { Strategy, StrategySignal, StrategyParams, StrategyResult, CandleData } from './strategy';

// 条件EMA计算函数
function condEma(arr: number[], n: number): number[] {
  const out = new Array(arr.length).fill(NaN);
  if (n <= 0) throw new Error("n must be > 0");
  const alpha = 2 / (n + 1);
  let first = -1;
  for (let i = 0; i < arr.length; i++) {
    if (!Number.isNaN(arr[i])) { first = i; break; }
  }
  if (first === -1) return out;
  out[first] = arr[first];
  for (let i = first + 1; i < arr.length; i++) {
    if (Number.isNaN(arr[i])) {
      out[i] = NaN;
    } else {
      if (Number.isNaN(out[i-1])) out[i] = arr[i];
      else out[i] = (arr[i] - out[i-1]) * alpha + out[i-1];
    }
  }
  return out;
}

// Range Filter策略实现
export class RangeFilterStrategy extends Strategy {
  private previousState: number = 0; // 用于跟踪之前的状态

  constructor(params: StrategyParams = {}) {
    super('Range Filter', {
      rng_qty: 2.618,
      rng_per: 14,
      smooth_range: true,
      smooth_per: 27,
      ...params
    });
  }

  public getParamConfig() {
    return [
      {
        name: 'rng_qty',
        label: 'Range Quantity',
        type: 'number',
        min: 0.1,
        max: 10,
        step: 0.001,
        default: 2.618
      },
      {
        name: 'rng_per',
        label: 'Range Period',
        type: 'number',
        min: 1,
        max: 100,
        step: 1,
        default: 14
      },
      {
        name: 'smooth_range',
        label: 'Smooth Range',
        type: 'boolean',
        default: true
      },
      {
        name: 'smooth_per',
        label: 'Smooth Period',
        type: 'number',
        min: 1,
        max: 100,
        step: 1,
        default: 27
      }
    ];
  }

  public calculate(candles: CandleData[]): StrategyResult {
    if (candles.length < 2) {
      return {
        signals: [],
        timestamp: Date.now()
      };
    }

    const closes = candles.map(c => c.close);
    const { rng_qty, rng_per, smooth_range, smooth_per } = this.params;

    // 计算AC输入
    const ac_input = new Array(closes.length).fill(NaN);
    for (let i = 1; i < closes.length; i++) {
      ac_input[i] = Math.abs(closes[i] - closes[i-1]);
    }

    // 计算AC
    const AC = condEma(ac_input, rng_per);
    const raw_range = AC.map(v => Number.isNaN(v) ? NaN : v * rng_qty);

    // 计算R系列
    const r_series = smooth_range ? condEma(raw_range, smooth_per) : raw_range.slice();

    // 计算filt
    const filt = new Array(closes.length).fill(NaN);
    let rfilt_prev = closes.length > 0 ? closes[0] : NaN;
    for (let i = 0; i < closes.length; i++) {
      const r = r_series[i];
      const c = closes[i];
      const prev = rfilt_prev;
      let rfilt_curr = prev;
      if (!Number.isNaN(r)) {
        if (c - r > prev) rfilt_curr = c - r;
        if (c + r < prev) rfilt_curr = c + r;
      }
      filt[i] = rfilt_curr;
      rfilt_prev = rfilt_curr;
    }

    // 计算高低带
    const hi_band = new Array(closes.length).fill(NaN);
    const lo_band = new Array(closes.length).fill(NaN);
    for (let i = 0; i < closes.length; i++) {
      const r = r_series[i];
      hi_band[i] = Number.isNaN(r) ? NaN : filt[i] + r;
      lo_band[i] = Number.isNaN(r) ? NaN : filt[i] - r;
    }

    // 计算fdir
    const fdir = new Array(closes.length).fill(NaN);
    let var_fdir = 0.0;
    let prev_filt = NaN;
    for (let i = 0; i < closes.length; i++) {
      if (i === 0 || Number.isNaN(filt[i]) || Number.isNaN(prev_filt)) {
        fdir[i] = var_fdir;
      } else {
        if (filt[i] > prev_filt) var_fdir = 1.0;
        else if (filt[i] < prev_filt) var_fdir = -1.0;
        fdir[i] = var_fdir;
      }
      prev_filt = filt[i];
    }

    const upward = fdir.map(v => v === 1.0);
    const downward = fdir.map(v => v === -1.0);

    // 计算条件
    const longCond = new Array(closes.length).fill(false);
    const shortCond = new Array(closes.length).fill(false);
    for (let i = 0; i < closes.length; i++) {
      if (!Number.isNaN(filt[i]) && closes[i] > filt[i] && upward[i]) longCond[i] = true;
      if (!Number.isNaN(filt[i]) && closes[i] < filt[i] && downward[i]) shortCond[i] = true;
    }

    // 计算信号
    const CondIni = new Array(closes.length).fill(0);
    const buySignals = new Array(closes.length).fill(false);
    const sellSignals = new Array(closes.length).fill(false);
    for (let i = 0; i < closes.length; i++) {
      const prev_ini = i > 0 ? CondIni[i-1] : 0;
      if (longCond[i] && prev_ini === -1) buySignals[i] = true;
      if (shortCond[i] && prev_ini === 1) sellSignals[i] = true;
      if (longCond[i]) CondIni[i] = 1;
      else if (shortCond[i]) CondIni[i] = -1;
      else CondIni[i] = prev_ini;
    }

    // 转换为策略信号
    const signals: StrategySignal[] = [];
    for (let i = 0; i < candles.length; i++) {
      if (buySignals[i]) {
        signals.push({
          timestamp: candles[i].timestamp,
          type: 'buy',
          price: candles[i].close,
          strength: 1.0
        });
      }
      if (sellSignals[i]) {
        signals.push({
          timestamp: candles[i].timestamp,
          type: 'sell',
          price: candles[i].close,
          strength: 1.0
        });
      }
    }

    return {
      signals,
      indicators: {
        filt,
        range: r_series,
        hi_band,
        lo_band,
        fdir
      },
      timestamp: Date.now()
    };
  }

  public reset(): void {
    this.previousState = 0;
  }
}