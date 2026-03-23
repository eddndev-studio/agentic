type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

function shouldLog(level: LogLevel): boolean {
    return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[currentLevel];
}

function formatPrefix(service: string): string {
    return `[${new Date().toISOString()}] [${service}]`;
}

export function createLogger(service: string) {
    return {
        debug(...args: any[]) { if (shouldLog('debug')) console.log(formatPrefix(service), ...args); },
        info(...args: any[]) { if (shouldLog('info')) console.log(formatPrefix(service), ...args); },
        warn(...args: any[]) { if (shouldLog('warn')) console.warn(formatPrefix(service), ...args); },
        error(...args: any[]) { if (shouldLog('error')) console.error(formatPrefix(service), ...args); },
    };
}

export type Logger = ReturnType<typeof createLogger>;
