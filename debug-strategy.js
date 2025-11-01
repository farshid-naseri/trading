// Debug script to check strategy execution
console.log('🔍 Strategy Debug Script');
console.log('====================');

// Check if we can import the required modules
async function debugStrategy() {
  try {
    // Import strategy manager
    const { strategyManager } = await import('./src/lib/strategies/strategy-manager.js');
    console.log('✅ StrategyManager imported successfully');
    
    // Check available strategies
    const strategies = strategyManager.getStrategyNames();
    console.log('📋 Available strategies:', strategies);
    
    // Check if range-filter strategy exists
    const rangeFilterStrategy = strategyManager.getStrategy('range-filter');
    if (rangeFilterStrategy) {
      console.log('✅ Range Filter strategy found');
      console.log('📋 Strategy name:', rangeFilterStrategy.getName());
      console.log('📋 Strategy params config:', rangeFilterStrategy.getParamConfig());
    } else {
      console.log('❌ Range Filter strategy not found');
    }
    
    // Test strategy activation
    console.log('\n🎯 Testing strategy activation...');
    const activated = strategyManager.activateStrategy('range-filter', {
      rng_qty: 2.618,
      rng_per: 14,
      smooth_range: true,
      smooth_per: 27
    });
    
    if (activated) {
      console.log('✅ Strategy activated successfully');
      
      // Test signal calculation with mock data
      console.log('\n📊 Testing signal calculation...');
      const mockCandles = [
        { timestamp: Date.now() - 60000, open: 3.00, high: 3.05, low: 2.95, close: 3.02, volume: 1000 },
        { timestamp: Date.now(), open: 3.02, high: 3.08, low: 2.98, close: 3.05, volume: 1200 }
      ];
      
      const result = strategyManager.calculateSignals(mockCandles);
      if (result) {
        console.log('✅ Signal calculation successful');
        console.log('📡 Generated signals:', result.signals.length);
        if (result.signals.length > 0) {
          console.log('🎯 Latest signal:', result.signals[result.signals.length - 1]);
        }
      } else {
        console.log('❌ Signal calculation failed');
      }
    } else {
      console.log('❌ Strategy activation failed');
    }
    
  } catch (error) {
    console.error('❌ Debug script error:', error);
  }
}

// Run the debug
debugStrategy();