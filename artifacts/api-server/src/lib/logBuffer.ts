export interface LogEntry {
  ts: number;
  level: "info" | "warn" | "error" | "debug";
  msg: string;
  ctx: Record<string, unknown>;
}

const MAX = 300;
const buf: LogEntry[] = [];

export function pushLog(entry: LogEntry): void {
  buf.push(entry);
  if (buf.length > MAX) buf.splice(0, buf.length - MAX);
}

export function getLogs(last = 100): LogEntry[] {
  return buf.slice(-last);
}
