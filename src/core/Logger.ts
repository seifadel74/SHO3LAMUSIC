export enum LogLevel {
  Error = 0,
  Warn = 1,
  Info = 2,
  Debug = 3,
}

const PREFIXES: Record<LogLevel, string> = {
  [LogLevel.Error]: '[ERROR]',
  [LogLevel.Warn]: '[WARN]',
  [LogLevel.Info]: '[INFO]',
  [LogLevel.Debug]: '[DEBUG]',
};

const currentLevel = (process.env.LOG_LEVEL ? LogLevel[process.env.LOG_LEVEL as keyof typeof LogLevel] : LogLevel.Info) ?? LogLevel.Info;

function log(level: LogLevel, ...args: unknown[]) {
  if (level > currentLevel) return;
  queueMicrotask(() => {
    const ts = new Date().toISOString();
    console[level <= LogLevel.Warn ? 'error' : 'log'](`${ts} ${PREFIXES[level]}`, ...args);
  });
}

export const logger = {
  error: (...args: unknown[]) => log(LogLevel.Error, ...args),
  warn: (...args: unknown[]) => log(LogLevel.Warn, ...args),
  info: (...args: unknown[]) => log(LogLevel.Info, ...args),
  debug: (...args: unknown[]) => log(LogLevel.Debug, ...args),
};
