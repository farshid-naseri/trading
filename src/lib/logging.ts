/**
 * سیستم لاگ‌گذاری ساده برای پروژه
 */
export class Logger {
  private logs: string[] = [];
  private logCallbacks: ((message: string) => void)[] = [];

  /**
   * افزودن لاگ
   * @param level سطح لاگ
   * @param message پیام
   */
  private log(level: string, message: string): void {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level}] ${message}`;
    
    this.logs.push(logMessage);
    
    // فراخوانی کالبک‌ها
    this.logCallbacks.forEach(callback => callback(logMessage));
    
    // چاپ در کنسول
    console.log(logMessage);
  }

  /**
   * لاگ سطح info
   * @param message پیام
   */
  info(message: string): void {
    this.log('INFO', message);
  }

  /**
   * لاگ سطح warn
   * @param message پیام
   */
  warn(message: string): void {
    this.log('WARN', message);
  }

  /**
   * لاگ سطح error
   * @param message پیام
   */
  error(message: string): void {
    this.log('ERROR', message);
  }

  /**
   * لاگ سطح debug
   * @param message پیام
   */
  debug(message: string): void {
    this.log('DEBUG', message);
  }

  /**
   * دریافت تمام لاگ‌ها
   * @returns آرایه‌ای از لاگ‌ها
   */
  getLogs(): string[] {
    return [...this.logs];
  }

  /**
   * پاک کردن لاگ‌ها
   */
  clearLogs(): void {
    this.logs = [];
  }

  /**
   * افزودن کالبک برای دریافت لاگ‌ها
   * @param callback تابع کالبک
   */
  onLog(callback: (message: string) => void): void {
    this.logCallbacks.push(callback);
  }

  /**
   * حذف کالبک
   * @param callback تابع کالبک
   */
  offLog(callback: (message: string) => void): void {
    const index = this.logCallbacks.indexOf(callback);
    if (index > -1) {
      this.logCallbacks.splice(index, 1);
    }
  }
}

// توابع کمکی برای سازگاری با کد موجود
export const logger = new Logger();

export function logApiError(error: any): void {
  logger.error(`API Error: ${error}`);
}

export function logTradingError(error: any): void {
  logger.error(`Trading Error: ${error}`);
}

export function logWebSocketEvent(event: string, data?: any): void {
  logger.info(`WebSocket Event: ${event}${data ? ` - ${JSON.stringify(data)}` : ''}`);
}