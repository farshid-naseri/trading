import { Strategy, StrategyParams, StrategyResult, CandleData } from './strategy';
import { RangeFilterStrategy } from './range-filter-strategy';

export class StrategyManager {
  private strategies: Map<string, Strategy> = new Map();
  private activeStrategy: Strategy | null = null;

  constructor() {
    // 注册内置策略
    this.registerStrategy('range-filter', new RangeFilterStrategy());
  }

  // 注册策略
  public registerStrategy(name: string, strategy: Strategy): void {
    this.strategies.set(name, strategy);
  }

  // 获取所有策略名称
  public getStrategyNames(): string[] {
    return Array.from(this.strategies.keys());
  }

  // 获取策略
  public getStrategy(name: string): Strategy | null {
    return this.strategies.get(name) || null;
  }

  // 获取当前激活的策略
  public getActiveStrategy(): Strategy | null {
    return this.activeStrategy;
  }

  // 激活策略
  public activateStrategy(name: string, params?: StrategyParams): boolean {
    console.log(`🎯 StrategyManager: Activating strategy "${name}" with params:`, params);
    
    const strategy = this.getStrategy(name);
    if (!strategy) {
      console.error(`❌ StrategyManager: Strategy "${name}" not found`);
      return false;
    }

    // 如果有参数，更新策略参数
    if (params) {
      console.log(`🔧 StrategyManager: Updating strategy parameters for "${name}"`);
      strategy.updateParams(params);
    }

    // 停用之前的策略
    if (this.activeStrategy) {
      console.log(`🔄 StrategyManager: Deactivating previous strategy "${this.activeStrategy.getName()}"`);
      this.activeStrategy.setActive(false);
    }

    // 激活新策略
    this.activeStrategy = strategy;
    this.activeStrategy.setActive(true);
    
    console.log(`✅ StrategyManager: Strategy "${name}" activated successfully`);
    return true;
  }

  // 停用当前策略
  public deactivateStrategy(): void {
    if (this.activeStrategy) {
      this.activeStrategy.setActive(false);
      this.activeStrategy = null;
    }
  }

  // 计算策略信号
  public calculateSignals(candles: CandleData[]): StrategyResult | null {
    if (!this.activeStrategy) {
      console.log(`🚫 StrategyManager: No active strategy for signal calculation`);
      return null;
    }

    try {
      console.log(`🎯 StrategyManager: Calculating signals for "${this.activeStrategy.getName()}" with ${candles.length} candles`);
      
      const result = this.activeStrategy.calculate(candles);
      
      if (!result) {
        console.log(`📭 StrategyManager: No result returned from strategy`);
        return null;
      }
      
      console.log(`📡 StrategyManager: Generated ${result.signals ? result.signals.length : 0} signals`);
      
      if (result.signals && result.signals.length > 0) {
        const latestSignal = result.signals[result.signals.length - 1];
        console.log(`🎯 StrategyManager: Latest signal: ${latestSignal.type} at ${latestSignal.price} (timestamp: ${latestSignal.timestamp})`);
      }
      
      return result;
    } catch (error) {
      console.error('❌ Error calculating strategy signals:', error);
      return null;
    }
  }

  // 重置当前策略
  public resetActiveStrategy(): void {
    if (this.activeStrategy) {
      this.activeStrategy.reset();
    }
  }

  // 获取所有策略的参数配置
  public getAllStrategyConfigs(): Array<{
    name: string;
    displayName: string;
    params: Array<{
      name: string;
      label: string;
      type: 'number' | 'boolean' | 'select';
      min?: number;
      max?: number;
      step?: number;
      default: any;
      options?: Array<{ value: any; label: string }>;
    }>;
  }> {
    const configs = [];
    for (const [name, strategy] of this.strategies) {
      configs.push({
        name,
        displayName: strategy.getName(),
        params: strategy.getParamConfig()
      });
    }
    return configs;
  }
}

// 创建单例实例
export const strategyManager = new StrategyManager();