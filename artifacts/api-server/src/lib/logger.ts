import pino from "pino";
import { pushLog, type LogEntry } from "./logBuffer";

const isProduction = process.env.NODE_ENV === "production";

export const pinoInstance = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
  ],
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});

type LogArgs = [obj: object, msg?: string] | [msg: string];

function capture(level: LogEntry["level"], args: LogArgs): void {
  let msg = "";
  let ctx: Record<string, unknown> = {};
  if (typeof args[0] === "string") {
    msg = args[0];
  } else if (args[0] && typeof args[0] === "object") {
    ctx = args[0] as Record<string, unknown>;
    msg = (args[1] as string | undefined) ?? "";
  }
  pushLog({ ts: Date.now(), level, msg, ctx });
}

function makeMethod(level: LogEntry["level"]) {
  return (...args: LogArgs) => {
    capture(level, args);
    if (typeof args[0] === "string") {
      (pinoInstance[level] as (msg: string) => void)(args[0]);
    } else {
      (pinoInstance[level] as (obj: object, msg?: string) => void)(args[0], args[1] as string | undefined);
    }
  };
}

function makeChildWrapper(child: pino.Logger, bindings: Record<string, unknown>) {
  function makeChildMethod(level: LogEntry["level"]) {
    return (...args: LogArgs) => {
      if (typeof args[0] === "string") {
        pushLog({ ts: Date.now(), level, msg: args[0], ctx: bindings });
        (child[level] as (msg: string) => void)(args[0]);
      } else {
        pushLog({ ts: Date.now(), level, msg: (args[1] as string | undefined) ?? "", ctx: { ...bindings, ...(args[0] as Record<string, unknown>) } });
        (child[level] as (obj: object, msg?: string) => void)(args[0], args[1] as string | undefined);
      }
    };
  }
  return {
    info:  makeChildMethod("info"),
    warn:  makeChildMethod("warn"),
    error: makeChildMethod("error"),
    debug: makeChildMethod("debug"),
    child: (b: Record<string, unknown>) => makeChildWrapper(child.child(b), { ...bindings, ...b }),
  };
}

export const logger = {
  info:  makeMethod("info"),
  warn:  makeMethod("warn"),
  error: makeMethod("error"),
  debug: makeMethod("debug"),
  child: (bindings: Record<string, unknown>) => makeChildWrapper(pinoInstance.child(bindings), bindings),
};
