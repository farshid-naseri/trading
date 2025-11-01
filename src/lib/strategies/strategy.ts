// 策略信号类型
export interface StrategySignal {
  timestamp: number;
  type: 'buy' | 'sell';
  price: number;
  strength?: number;
}

// 策略参数接口
export interface StrategyParams {
  [key: string]: any;
}

// 策略结果接口
export interface StrategyResult {
  signals: StrategySignal[];
  indicators?: {
    [key: string]: number[];
  };
  timestamp: number;
}

// K线数据接口
export interface CandleData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// 策略基类
export abstract class Strategy {
  protected name: string;
  protected params: StrategyParams;
  protected isActive: boolean = false;

  constructor(name: string, params: StrategyParams = {}) {
    this.name = name;
    this.params = params;
  }

  // 获取策略名称
  public getName(): string {
    return this.name;
  }

  // 获取策略参数
  public getParams(): StrategyParams {
    return { ...this.params };
  }

  // 更新策略参数
  public updateParams(params: StrategyParams): void {
    this.params = { ...this.params, ...params };
  }

  // 检查策略是否激活
  public isStrategyActive(): boolean {
    return this.isActive;
  }

  // 激活/停用策略
  public setActive(active: boolean): void {
    this.isActive = active;
  }

  // 获取策略参数配置
  public abstract getParamConfig(): Array<{
    name: string;
    label: string;
    type: 'number' | 'boolean' | 'select';
    min?: number;
    max?: number;
    step?: number;
    default: any;
    options?: Array<{ value: any; label: string }>;
  }>;

  // 计算策略信号
  public abstract calculate(candles: CandleData[]): StrategyResult;

  // 重置策略状态
  public abstract reset(): void;
}