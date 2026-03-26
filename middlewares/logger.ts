type LogLevel = "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  provider: string;
  action: string;
  reference?: string;
  timestamp: number;
}

class SDKLogger {
  private enabled = false;
  private logs: LogEntry[] = [];

  enable(): void { this.enabled = true; }
  disable(): void { this.enabled = false; }

  log(level: LogLevel, provider: string, action: string, reference?: string): void {
    const entry: LogEntry = { level, provider, action, reference, timestamp: Date.now() };
    this.logs.push(entry);
    if (this.enabled) {
      const tag = `[airtime-pay:${provider}] ${action}${reference ? ` (${reference})` : ""}`;
      if (level === "error") console.error(tag);
      else if (level === "warn") console.warn(tag);
      else console.log(tag);
    }
  }

  getLogs(): LogEntry[] { return [...this.logs]; }
  clear(): void { this.logs = []; }
}

export const logger = new SDKLogger();