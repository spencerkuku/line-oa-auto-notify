type LogLevel = "debug" | "info" | "warn" | "error";

const priority: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export function log(level: LogLevel, configured: LogLevel | undefined, message: string, data?: Record<string, unknown>): void {
  const threshold = configured ?? "info";
  if (priority[level] < priority[threshold]) {
    return;
  }

  console.log(
    JSON.stringify({
      level,
      message,
      ...data,
      ts: new Date().toISOString(),
    }),
  );
}
