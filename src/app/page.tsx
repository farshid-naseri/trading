'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { TradingDashboard } from '@/components/trading-dashboard'
import { ApiCredentialsManager } from '@/components/api-credentials-manager'
import { useApiCredentials } from '@/hooks/use-api-credentials'
import { useInitializeApiConfig } from '@/hooks/use-api-credentials'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Code, CheckCircle, XCircle, Loader2 } from 'lucide-react'

export default function Home() {
  const { isConfigured } = useApiCredentials()
  const [showDashboard, setShowDashboard] = useState(false)
  const [isTestingConnection, setIsTestingConnection] = useState(false)
  
  // Initialize API config when credentials are configured
  useInitializeApiConfig()

  const handleContinueToDashboard = () => {
    setIsTestingConnection(true)
    
    // Simulate connection test
    setTimeout(() => {
      setIsTestingConnection(false)
      setShowDashboard(true)
    }, 2000)
  }

  const handleBackToSettings = () => {
    setShowDashboard(false)
  }

  if (showDashboard) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto p-4">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold">Trading Dashboard</h1>
              <p className="text-muted-foreground">Advanced trading platform with AI-powered strategies</p>
            </div>
            <div className="flex items-center space-x-4">
              <Badge variant={isConfigured ? "default" : "destructive"}>
                {isConfigured ? (
                  <>
                    <CheckCircle className="w-3 h-3 mr-1" />
                    API Configured
                  </>
                ) : (
                  <>
                    <XCircle className="w-3 h-3 mr-1" />
                    API Not Configured
                  </>
                )}
              </Badge>
              <Button variant="outline" onClick={handleBackToSettings}>
                API Settings
              </Button>
              <Link href="/tradingview-test">
                <Button variant="outline">
                  <Code className="w-4 h-4 mr-2" />
                  TradingView Chart
                </Button>
              </Link>
            </div>
          </div>
          <TradingDashboard />
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 min-h-screen flex items-center justify-center">
      <div className="w-full max-w-4xl">
        <div className="text-center mb-8">
          <div className="mb-4 flex flex-wrap gap-2 justify-center">
            <Link href="/tradingview-test">
              <Button variant="outline">
                <Code className="w-4 h-4 mr-2" />
                TradingView Chart
              </Button>
            </Link>
          </div>
          <h1 className="text-4xl font-bold mb-2">Trading Dashboard</h1>
          <p className="text-muted-foreground">
            Advanced trading platform with AI-powered strategies
          </p>
        </div>

        <div className="space-y-6">
          <ApiCredentialsManager />
          
          {isConfigured && (
            <Card>
              <CardHeader>
                <CardTitle>Ready to Start Trading</CardTitle>
                <CardDescription>
                  Your API credentials are configured. You can now proceed to the trading dashboard.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center space-x-4">
                  <Button 
                    onClick={handleContinueToDashboard}
                    disabled={isTestingConnection}
                  >
                    {isTestingConnection ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Testing Connection...
                      </>
                    ) : (
                      'Continue to Dashboard'
                    )}
                  </Button>
                  {isTestingConnection && (
                    <Badge variant="secondary">
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      Testing API Connection
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}