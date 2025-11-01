'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { 
  AlertTriangle, 
  RefreshCw, 
  Trash2, 
  Home, 
  Bug, 
  FileText,
  Copy,
  Download
} from 'lucide-react';


interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorId: string;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: ''
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
      errorId: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({
      error,
      errorInfo
    });

    // Log the error
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
    
    // Simple error logging without GlobalErrorHandler
    console.error('React Error Boundary:', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      errorId: this.state.errorId
    });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: ''
    });
  };

  handleForceCleanup = () => {
    // Simple cleanup without GlobalErrorHandler
    try {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.includes('trading') || key.includes('config') || key.includes('error')) {
          keysToRemove.push(key);
        }
      }
      
      keysToRemove.forEach(key => {
        localStorage.removeItem(key);
      });
      
      alert(`Cleanup completed. Removed ${keysToRemove.length} items.`);
      this.handleReset();
    } catch (error) {
      console.error('Cleanup failed:', error);
      alert('Cleanup failed. Please try manually clearing browser data.');
    }
  };

  handleCopyError = () => {
    if (!this.state.error) return;
    
    const errorReport = {
      errorId: this.state.errorId,
      message: this.state.error.message,
      stack: this.state.error.stack,
      componentStack: this.state.errorInfo?.componentStack,
      timestamp: new Date().toISOString(),
      url: window.location.href,
      userAgent: navigator.userAgent
    };

    navigator.clipboard.writeText(JSON.stringify(errorReport, null, 2))
      .then(() => {
        alert('Error report copied to clipboard!');
      })
      .catch(() => {
        alert('Failed to copy error report');
      });
  };

  handleDownloadError = () => {
    if (!this.state.error) return;
    
    const errorReport = {
      errorId: this.state.errorId,
      message: this.state.error.message,
      stack: this.state.error.stack,
      componentStack: this.state.errorInfo?.componentStack,
      timestamp: new Date().toISOString(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      localStorage: {
        length: localStorage.length,
        keys: Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i))
      }
    };

    const blob = new Blob([JSON.stringify(errorReport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `error-report-${this.state.errorId}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <div className="max-w-4xl w-full space-y-6">
            {/* Error Header */}
            <Card className="border-red-200 bg-red-50">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2 text-red-800">
                  <AlertTriangle className="h-6 w-6" />
                  <span>Application Error</span>
                  <Badge variant="destructive" className="ml-auto">
                    {this.state.errorId}
                  </Badge>
                </CardTitle>
                <CardDescription className="text-red-700">
                  The application encountered an unexpected error. This has been logged for debugging.
                </CardDescription>
              </CardHeader>
            </Card>

            {/* Error Details */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Bug className="h-5 w-5" />
                  <span>Error Details</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Error Message</AlertTitle>
                  <AlertDescription className="font-mono text-sm bg-gray-100 p-2 rounded">
                    {this.state.error?.message}
                  </AlertDescription>
                </Alert>

                {this.state.error?.stack && (
                  <div>
                    <h4 className="font-medium mb-2 flex items-center">
                      <FileText className="h-4 w-4 mr-2" />
                      Stack Trace
                    </h4>
                    <pre className="bg-gray-100 p-3 rounded text-xs overflow-x-auto max-h-40">
                      {this.state.error.stack}
                    </pre>
                  </div>
                )}

                {this.state.errorInfo?.componentStack && (
                  <div>
                    <h4 className="font-medium mb-2">Component Stack</h4>
                    <pre className="bg-gray-100 p-3 rounded text-xs overflow-x-auto max-h-40">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Action Buttons */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Button onClick={this.handleReset} className="w-full">
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </Button>
              
              <Button onClick={this.handleForceCleanup} variant="outline" className="w-full">
                <Trash2 className="h-4 w-4 mr-2" />
                Clear Storage
              </Button>
              
              <Button onClick={this.handleCopyError} variant="outline" className="w-full">
                <Copy className="h-4 w-4 mr-2" />
                Copy Error
              </Button>
              
              <Button onClick={this.handleDownloadError} variant="outline" className="w-full">
                <Download className="h-4 w-4 mr-2" />
                Download Report
              </Button>
            </div>

            {/* Navigation */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button onClick={() => window.location.href = '/'} className="flex-1">
                    <Home className="h-4 w-4 mr-2" />
                    Go to Home
                  </Button>
                  <Button onClick={() => window.location.href = '/storage-diagnostic'} variant="outline" className="flex-1">
                    <Bug className="h-4 w-4 mr-2" />
                    Storage Diagnostic
                  </Button>
                  <Button onClick={() => window.location.href = '/test-storage-fix'} variant="outline" className="flex-1">
                    <RefreshCw className="h-4 w-4 mr-2" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Additional Help */}
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Troubleshooting Tips</AlertTitle>
              <AlertDescription className="space-y-2">
                <p>• Try clearing your browser data and refreshing the page</p>
                <p>• Use the "Clear Storage" button to remove corrupted data</p>
                <p>• Check the Storage Diagnostic page for more details</p>
                <p>• If the problem persists, contact support with the error report</p>
              </AlertDescription>
            </Alert>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}