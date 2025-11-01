"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Plus,
  Minus,
  X,
  AlertTriangle,
  CheckCircle,
  Clock,
  Target,
  Shield,
  Wifi,
  WifiOff,
  Activity,
  BarChart3,
  PieChart
} from "lucide-react";

interface Position {
  id: string;
  market: string;
  side: 'buy' | 'sell' | 'long' | 'short';
  margin_mode: string;
  leverage: number;
  ath_position_amount?: number; // Position amount in coin
  amount_usdt?: number; // Position amount in USDT
  position_value?: number; // Position value in USDT
  unrealized_pnl: number; // Unrealized PnL
  realized_pnl: number; // Realized PnL
  avg_entry_price?: number; // Average entry price
  settle_price?: number; // Settlement price
  take_profit_price?: string; // Take profit price
  stop_loss_price?: string; // Stop loss price
  created_at: string; // Creation timestamp
  liquidation_price?: string; // Liquidation price
  margin_ratio?: number; // Margin ratio
  // Additional fields from CoinEx WebSocket
  open_interest?: string;
  close_avbl?: string;
  cml_position_value?: string;
  max_position_value?: string;
  margin_avbl?: string;
  ath_margin_size?: string;
  maintenance_margin_rate?: string;
  maintenance_margin_value?: string;
  liq_price?: string;
  bkr_price?: string;
  adl_level?: number;
  first_filled_price?: string;
  latest_filled_price?: string;
  updated_at?: string;
  // Status field to track if position is open or closed
  status?: 'open' | 'closed';
}

interface HistoricalPosition {
  id: string;
  market: string;
  side: 'buy' | 'sell';
  margin_mode: string;
  leverage: number;
  amount_coin: number;
  amount_usdt: number;
  unrealized_pnl: number;
  realized_pnl: number;
  avg_entry_price: number;
  close_price: number;
  closing_time: string;
  duration: string;
}

interface PositionManagerProps {
  activePositions: Position[];
  historicalPositions: HistoricalPosition[];
  onClosePosition: (positionId: string) => void;
  onUpdatePosition: (positionId: string, updates: Partial<Position>) => void;
  isConnected?: boolean;
  lastUpdate?: Date;
}

export function PositionManager({ 
  activePositions, 
  historicalPositions, 
  onClosePosition,
  onUpdatePosition,
  isConnected = false,
  lastUpdate
}: PositionManagerProps) {
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    takeProfit: '',
    stopLoss: ''
  });
  const [currentTime, setCurrentTime] = useState<Date | null>(null);

  // Filter positions based on status
  const openPositions = activePositions.filter(pos => pos.status !== 'closed');
  const closedPositions = activePositions.filter(pos => pos.status === 'closed');
  const allHistoricalPositions = [...historicalPositions, ...closedPositions];

  // Update current time every second on client side only
  useEffect(() => {
    setCurrentTime(new Date());
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatLastUpdate = (date?: Date) => {
    if (!date || !currentTime) return 'Unknown';
    const diffMs = currentTime.getTime() - date.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    
    if (diffSeconds < 5) return 'Real-time';
    if (diffSeconds < 60) return `${diffSeconds}s ago`;
    if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
    if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`;
    return `${Math.floor(diffSeconds / 86400)}d ago`;
  };

  const totalUnrealizedPnl = openPositions.reduce((sum, pos) => sum + (parseFloat(pos.unrealized_pnl?.toString() || '0') || 0), 0);
  const totalRealizedPnl = allHistoricalPositions.reduce((sum, pos) => sum + (parseFloat(pos.realized_pnl?.toString() || '0') || 0), 0);
  const totalEquity = totalUnrealizedPnl + totalRealizedPnl;

  const handleEditPosition = (position: Position) => {
    setSelectedPosition(position);
    setEditForm({
      takeProfit: position.take_profit_price?.toString() || '',
      stopLoss: position.stop_loss_price?.toString() || ''
    });
    setEditDialogOpen(true);
  };

  const handleSavePosition = () => {
    if (selectedPosition) {
      onUpdatePosition(selectedPosition.id, {
        take_profit_price: editForm.takeProfit ? parseFloat(editForm.takeProfit) : undefined,
        stop_loss_price: editForm.stopLoss ? parseFloat(editForm.stopLoss) : undefined
      });
      setEditDialogOpen(false);
      setSelectedPosition(null);
    }
  };

  const getRiskLevel = (position: Position) => {
    const amountUsdt = parseFloat(position.ath_position_amount?.toString() || position.amount_usdt?.toString() || position.position_value?.toString() || '1'); // Avoid division by zero
    const unrealizedPnl = parseFloat(position.unrealized_pnl?.toString() || '0');
    const pnlPercentage = unrealizedPnl / amountUsdt * 100;
    if (pnlPercentage < -5) return { level: 'high', color: 'text-red-600', icon: AlertTriangle };
    if (pnlPercentage < -2) return { level: 'medium', color: 'text-yellow-600', icon: Clock };
    return { level: 'low', color: 'text-green-600', icon: CheckCircle };
  };

  const formatDuration = (startTime: string, endTime?: string) => {
    if (!currentTime) return 'Calculating...';
    const start = new Date(parseInt(startTime));
    const end = endTime ? new Date(endTime) : currentTime;
    const diffMs = end.getTime() - start.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (diffHours > 0) {
      return `${diffHours}h ${diffMinutes}m`;
    }
    return `${diffMinutes}m`;
  };

  const formatNumber = (num: number | string, decimals: number = 4): string => {
    const value = typeof num === 'string' ? parseFloat(num) : num;
    return value.toFixed(decimals);
  };

  return (
    <div className="space-y-6">
      {/* Portfolio Summary - Similar to CoinEx */}
      <Card className="border-border/50 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-lg">
            <span className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Portfolio Overview
            </span>
            <div className="flex items-center gap-3">
              {/* WebSocket Connection Status */}
              <div className="flex items-center gap-1">
                {isConnected ? (
                  <Wifi className="h-4 w-4 text-green-600" />
                ) : (
                  <WifiOff className="h-4 w-4 text-red-600" />
                )}
                <span className="text-xs text-muted-foreground">
                  {isConnected ? 'Live' : 'Offline'}
                </span>
              </div>
              
              {/* Last Update Time */}
              <div className="flex items-center gap-1">
                <Activity className="h-4 w-4 text-blue-600" />
                <span className="text-xs text-muted-foreground">
                  {formatLastUpdate(lastUpdate)}
                </span>
              </div>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-muted/30 rounded-lg border">
              <div className="text-xs text-muted-foreground mb-1">Total Positions</div>
              <div className="text-2xl font-bold">{activePositions.length}</div>
            </div>
            <div className="text-center p-4 bg-muted/30 rounded-lg border">
              <div className="text-xs text-muted-foreground mb-1">Unrealized PnL</div>
              <div className={`text-2xl font-bold ${totalUnrealizedPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {totalUnrealizedPnl >= 0 ? '+' : ''}{formatNumber(totalUnrealizedPnl, 2)}
              </div>
            </div>
            <div className="text-center p-4 bg-muted/30 rounded-lg border">
              <div className="text-xs text-muted-foreground mb-1">Realized PnL</div>
              <div className={`text-2xl font-bold ${totalRealizedPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {totalRealizedPnl >= 0 ? '+' : ''}{formatNumber(totalRealizedPnl, 2)}
              </div>
            </div>
            <div className="text-center p-4 bg-muted/30 rounded-lg border">
              <div className="text-xs text-muted-foreground mb-1">Total Equity</div>
              <div className="text-2xl font-bold">{formatNumber(totalEquity, 2)}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="active" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="active" className="flex items-center gap-2">
            <PieChart className="h-4 w-4" />
            Current Position ({openPositions.length})
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Trade History ({allHistoricalPositions.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-4">
          {openPositions.length > 0 ? (
            <div className="space-y-4">
              {openPositions.map((position) => {
                const risk = getRiskLevel(position);
                const amountUsdt = parseFloat(position.ath_position_amount?.toString() || position.amount_usdt?.toString() || position.position_value?.toString() || '1');
                const unrealizedPnl = parseFloat(position.unrealized_pnl?.toString() || '0');
                const progressPercentage = Math.abs(unrealizedPnl / amountUsdt) * 100;
                const isProfitable = unrealizedPnl > 0;
                
                return (
                  <Card key={`${position.id}-${position.market}-${position.side}`} className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Badge variant={position.side === 'buy' || position.side === 'long' ? 'default' : 'destructive'} className="text-xs">
                            {position.side === 'buy' || position.side === 'long' ? 'LONG' : 'SHORT'}
                          </Badge>
                          <span className="font-mono font-bold text-lg">{position.market}</span>
                          <Badge variant="outline" className="text-xs">{position.leverage}x</Badge>
                          <risk.icon className={`h-4 w-4 ${risk.color}`} />
                        </div>
                        <div className="flex items-center gap-2">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleEditPosition(position)}
                          >
                            Edit
                          </Button>
                          <Button 
                            variant="destructive" 
                            size="sm"
                            onClick={() => onClosePosition(position.id)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      {/* Main Position Info - Similar to CoinEx layout */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground">Position Size</div>
                          <div className="font-mono font-bold">{formatNumber(amountUsdt, 2)} USDT</div>
                          <div className="text-xs text-muted-foreground">Entry Price</div>
                          <div className="font-mono">{formatNumber(position.avg_entry_price || 0, 4)}</div>
                        </div>
                        
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground">Mark Price</div>
                          <div className="font-mono">{formatNumber(position.settle_price || 0, 4)}</div>
                          <div className="text-xs text-muted-foreground">Liq. Price</div>
                          <div className="font-mono text-red-600">{formatNumber(position.liq_price || position.liquidation_price || 0, 4)}</div>
                        </div>
                        
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground">PnL</div>
                          <div className={`font-mono font-bold ${isProfitable ? 'text-green-600' : 'text-red-600'}`}>
                            {unrealizedPnl >= 0 ? '+' : ''}{formatNumber(unrealizedPnl, 2)}
                          </div>
                          <div className="text-xs text-muted-foreground">ROE %</div>
                          <div className={`font-mono ${isProfitable ? 'text-green-600' : 'text-red-600'}`}>
                            {amountUsdt ? ((unrealizedPnl / amountUsdt) * 100).toFixed(2) : '0.00'}%
                          </div>
                        </div>
                        
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground">Margin</div>
                          <div className="font-mono">{formatNumber(position.ath_margin_size || 0, 2)} USDT</div>
                          <div className="text-xs text-muted-foreground">Margin Ratio</div>
                          <div className="font-mono">{formatNumber(position.margin_ratio || 0, 2)}%</div>
                        </div>
                      </div>

                      {/* Additional Details */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 text-xs">
                        <div>
                          <span className="text-muted-foreground">Take Profit: </span>
                          <span className={position.take_profit_price && parseFloat(position.take_profit_price) > 0 ? "text-green-600" : "text-muted-foreground"}>
                            {position.take_profit_price && parseFloat(position.take_profit_price) > 0 ? formatNumber(position.take_profit_price, 4) : "Not Set"}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Stop Loss: </span>
                          <span className={position.stop_loss_price && parseFloat(position.stop_loss_price) > 0 ? "text-red-600" : "text-muted-foreground"}>
                            {position.stop_loss_price && parseFloat(position.stop_loss_price) > 0 ? formatNumber(position.stop_loss_price, 4) : "Not Set"}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Duration: </span>
                          <span>{formatDuration(position.created_at)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Risk Level: </span>
                          <Badge variant={risk.level === 'high' ? 'destructive' : risk.level === 'medium' ? 'default' : 'secondary'} className="text-xs">
                            {risk.level === 'high' ? 'High' : risk.level === 'medium' ? 'Medium' : 'Low'}
                          </Badge>
                        </div>
                      </div>
                      
                      {/* PnL Progress Bar */}
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Trade Progress</span>
                          <span>{Math.abs(progressPercentage).toFixed(1)}%</span>
                        </div>
                        <Progress 
                          value={Math.min(progressPercentage, 100)} 
                          className="h-2"
                        />
                      </div>
                      
                      {/* Liquidation Warning */}
                      {position.liq_price && parseFloat(position.liq_price) > 0 && (
                        <Alert className="mt-4 border-yellow-200 bg-yellow-50">
                          <AlertTriangle className="h-4 w-4 text-yellow-600" />
                          <AlertDescription className="text-yellow-800">
                            Liquidation Price: {formatNumber(position.liq_price, 4)}
                          </AlertDescription>
                        </Alert>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card className="border-border/50">
              <CardContent className="flex items-center justify-center py-12">
                <div className="text-center text-muted-foreground">
                  <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg">No active positions</p>
                  <p className="text-sm">Open a position to see it here</p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          {allHistoricalPositions.length > 0 ? (
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle>Trade History</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Symbol</TableHead>
                      <TableHead>Side</TableHead>
                      <TableHead>Entry Price</TableHead>
                      <TableHead>Close Price</TableHead>
                      <TableHead>PnL</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Close Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allHistoricalPositions.map((position) => {
                      // Handle both HistoricalPosition and closed Position interfaces
                      const isHistorical = 'close_price' in position;
                      const closePrice = isHistorical ? position.close_price : position.settle_price;
                      const realizedPnl = position.realized_pnl || 0;
                      const entryPrice = position.avg_entry_price || 0;
                      const duration = isHistorical ? position.duration : formatDuration(position.created_at, position.updated_at);
                      const closeTime = isHistorical ? position.closing_time : position.updated_at;
                      
                      return (
                        <TableRow key={`${position.id}-${position.market}-${position.side}`}>
                          <TableCell className="font-mono">{position.market}</TableCell>
                          <TableCell>
                            <Badge variant={position.side === 'buy' || position.side === 'long' ? 'default' : 'destructive'}>
                              {position.side === 'buy' || position.side === 'long' ? 'LONG' : 'SHORT'}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono">
                            {formatNumber(entryPrice, 4)}
                          </TableCell>
                          <TableCell className="font-mono">
                            {formatNumber(closePrice || 0, 4)}
                          </TableCell>
                          <TableCell className={realizedPnl >= 0 ? 'text-green-600' : 'text-red-600'}>
                            {realizedPnl >= 0 ? '+' : ''}{formatNumber(realizedPnl, 2)}
                          </TableCell>
                          <TableCell>{duration}</TableCell>
                          <TableCell className="font-mono text-sm">
                            {currentTime && closeTime ? new Date(closeTime).toLocaleString('en-US') : 'Loading...'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-border/50">
              <CardContent className="flex items-center justify-center py-12">
                <div className="text-center text-muted-foreground">
                  <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg">No trade history available</p>
                  <p className="text-sm">Your completed trades will appear here</p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Position Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Position</DialogTitle>
            <DialogDescription>
              Update take profit and stop loss for {selectedPosition?.market}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Take Profit</label>
              <Input
                type="number"
                step="0.0001"
                value={editForm.takeProfit}
                onChange={(e) => setEditForm({ ...editForm, takeProfit: e.target.value })}
                placeholder="Take profit price"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Stop Loss</label>
              <Input
                type="number"
                step="0.0001"
                value={editForm.stopLoss}
                onChange={(e) => setEditForm({ ...editForm, stopLoss: e.target.value })}
                placeholder="Stop loss price"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSavePosition}>
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}