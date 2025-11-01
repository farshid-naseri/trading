'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { useApiCredentialsStore } from '@/lib/api-credentials-store'
import { Key, Shield, CheckCircle, AlertTriangle, Eye, EyeOff } from 'lucide-react'

export function ApiCredentialsManager() {
  const { 
    apiKey, 
    apiSecret, 
    isConfigured, 
    setCredentials, 
    clearCredentials, 
    validateCredentials 
  } = useApiCredentialsStore()
  
  const [inputApiKey, setInputApiKey] = useState('')
  const [inputApiSecret, setInputApiSecret] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [isEditing, setIsEditing] = useState(!isConfigured)

  useEffect(() => {
    if (isConfigured) {
      setInputApiKey(apiKey)
      setInputApiSecret(apiSecret)
    }
  }, [apiKey, apiSecret, isConfigured])

  const handleSave = () => {
    if (!inputApiKey.trim() || !inputApiSecret.trim()) {
      alert('Please enter both API Key and API Secret')
      return
    }
    
    setCredentials(inputApiKey, inputApiSecret)
    setIsEditing(false)
  }

  const handleCancel = () => {
    if (isConfigured) {
      setInputApiKey(apiKey)
      setInputApiSecret(apiSecret)
      setIsEditing(false)
    } else {
      setInputApiKey('')
      setInputApiSecret('')
    }
  }

  const handleEdit = () => {
    setIsEditing(true)
  }

  const handleClear = () => {
    clearCredentials()
    setInputApiKey('')
    setInputApiSecret('')
    setIsEditing(true)
  }

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Key className="w-5 h-5" />
          <span>API Credentials</span>
          {isConfigured && (
            <Badge variant="secondary" className="ml-2">
              <CheckCircle className="w-3 h-3 mr-1" />
              Configured
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Enter your CoinEx API credentials. These will be used across all trading features.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isConfigured && !isEditing && (
          <Alert className="border-orange-200 bg-orange-50">
            <AlertTriangle className="h-4 w-4 text-orange-600" />
            <AlertTitle className="text-orange-800">API Credentials Required</AlertTitle>
            <AlertDescription className="text-orange-700">
              You need to configure API credentials to use trading features. Please enter your CoinEx API key and secret.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          <div>
            <Label htmlFor="apiKey" className="flex items-center space-x-2">
              <Key className="w-4 h-4" />
              <span>API Key</span>
            </Label>
            <Input
              id="apiKey"
              type="text"
              value={inputApiKey}
              onChange={(e) => setInputApiKey(e.target.value)}
              disabled={!isEditing}
              placeholder="Enter your CoinEx API Key"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="apiSecret" className="flex items-center space-x-2">
              <Shield className="w-4 h-4" />
              <span>API Secret</span>
            </Label>
            <div className="relative mt-1">
              <Input
                id="apiSecret"
                type={showSecret ? "text" : "password"}
                value={inputApiSecret}
                onChange={(e) => setInputApiSecret(e.target.value)}
                disabled={!isEditing}
                placeholder="Enter your CoinEx API Secret"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowSecret(!showSecret)}
                disabled={!isEditing}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0"
              >
                {showSecret ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>

        <div className="flex space-x-2 pt-2">
          {isEditing ? (
            <>
              <Button onClick={handleSave} disabled={!inputApiKey.trim() || !inputApiSecret.trim()}>
                Save Credentials
              </Button>
              <Button variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={handleEdit}>
                Edit Credentials
              </Button>
              <Button variant="destructive" onClick={handleClear}>
                Clear Credentials
              </Button>
            </>
          )}
        </div>

        {isConfigured && !isEditing && (
          <Alert className="border-green-200 bg-green-50">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertTitle className="text-green-800">Credentials Configured</AlertTitle>
            <AlertDescription className="text-green-700">
              Your API credentials are configured and ready to use. All trading features will use these credentials.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}