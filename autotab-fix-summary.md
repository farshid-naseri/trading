# AutoTradeTab Initialization Fix Summary

## Problem
The `AutoTradeTab` component was throwing a `ReferenceError: Cannot access 'candles' before initialization` error because React state variables and refs were being used in `useEffect` hooks before they were declared.

## Root Cause
In React, all hooks (including `useState` and `useRef`) must be called at the top level of a component in the same order, and they cannot be called conditionally. The component had several `useEffect` hooks that were trying to use state variables and refs before they were declared.

## Issues Fixed

### 1. `candles` State Variable
- **Problem**: Used in `useEffect` on line 317 but declared on line 500
- **Solution**: Moved declaration to line 103, before any `useEffect` hooks that use it
- **Removed duplicate declaration** on line 509

### 2. `prevCandlesRef` Ref
- **Problem**: Used in `useEffect` on line 322 but declared on line 469
- **Solution**: Moved declaration to line 109, before any `useEffect` hooks that use it
- **Removed duplicate declaration** on line 478

### 3. `strategyConfig` State Variable
- **Problem**: Used in `useEffect` on line 344 but declared on line 475
- **Solution**: Moved declaration to line 112, before any `useEffect` hooks that use it
- **Removed duplicate declaration** on line 481

### 4. `strategyConfigs` State Variable
- **Problem**: Used in `useEffect` on line 350 but declared on line 541
- **Solution**: Moved declaration to line 118, before any `useEffect` hooks that use it
- **Removed duplicate declaration** on line 541

## Code Changes

### Before (Problematic Structure)
```typescript
// useEffect hooks using variables (lines 316-478)
useEffect(() => {
  if (!strategyStatus.isActive || !candles || candles.length === 0) { // ❌ candles not declared yet
    return;
  }
  // ... more code using candles, strategyConfig, strategyConfigs
}, [candles, strategyStatus.isActive, strategyConfig.strategy, ...]);

// State declarations (lines 500+)
const [candles, setCandles] = useState<any[]>([]); // ❌ Declared after useEffect
const [strategyConfig, setStrategyConfig] = useState({ ... }); // ❌ Declared after useEffect
const [strategyConfigs, setStrategyConfigs] = useState<Array<...>>([]); // ❌ Declared after useEffect
```

### After (Fixed Structure)
```typescript
// State declarations moved to top (lines 103-118)
const [candles, setCandles] = useState<any[]>([]); // ✅ Declared before useEffect
const [strategyConfig, setStrategyConfig] = useState({ ... }); // ✅ Declared before useEffect
const [strategyConfigs, setStrategyConfigs] = useState<Array<...>>([]); // ✅ Declared before useEffect

// useEffect hooks can now safely use the variables
useEffect(() => {
  if (!strategyStatus.isActive || !candles || candles.length === 0) { // ✅ candles is now declared
    return;
  }
  // ... more code using candles, strategyConfig, strategyConfigs
}, [candles, strategyStatus.isActive, strategyConfig.strategy, ...]);
```

## Verification
- ✅ ESLint passes without warnings or errors
- ✅ No more "Cannot access 'candles' before initialization" errors
- ✅ Component renders successfully
- ✅ All useEffect hooks can now access their dependencies properly

## Impact
This fix ensures that:
1. The AutoTradeTab component initializes correctly without throwing reference errors
2. All useEffect hooks can properly access their dependencies
3. The auto-trading functionality can work as intended
4. The strategy execution logic can access the required state variables

The fix maintains all existing functionality while resolving the initialization order issue that was preventing the component from working properly.