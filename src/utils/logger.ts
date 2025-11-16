import "dotenv/config";
import type {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from "axios";

/* ──────────────────────────────────────────────────────────────────────────
 * Types & Transport
 * ────────────────────────────────────────────────────────────────────────── */
export type LogLevel = "INFO" | "DEBUG";
export interface LoggerTransport {
  info(msg: string): void;
  error(msg: string): void;
  debug?(msg: string): void;
}
export class ConsoleTransport implements LoggerTransport {
  info(msg: string) {
    console.log(msg);
  }
  error(msg: string) {
    console.error(msg);
  }
  debug(msg: string) {
    console.log(msg);
  }
}

/* ──────────────────────────────────────────────────────────────────────────
 * Test name injection (opt-in from bootstrap)
 * ────────────────────────────────────────────────────────────────────────── */
let __currentTestName: string | undefined;
export const setCurrentTestName = (name?: string) => {
  __currentTestName = name;
};

/* ──────────────────────────────────────────────────────────────────────────
 * Defaults & Utils
 * ────────────────────────────────────────────────────────────────────────── */
const getLevelDefault = (): LogLevel =>
  String(process.env.LOG_MODE ?? "info").toLowerCase() === "debug"
    ? "DEBUG"
    : "INFO";
const getFormat = () =>
  (process.env.LOG_FORMAT ?? "json").toLowerCase() as "json" | "pretty";
const MAX_BODY = Number(process.env.LOG_MAX_BODY ?? 0); // 0=unlimited

const maybeTruncate = (s: string) =>
  MAX_BODY > 0 && s.length > MAX_BODY
    ? s.slice(0, MAX_BODY) + " …(truncated)"
    : s;

const safeStringify = (val: unknown, space = 2) => {
  const seen = new WeakSet();
  const replacer = (_k: string, v: any) => {
    if (typeof v === "bigint") return v.toString();
    if (v && typeof v === "object") {
      if (seen.has(v)) return "[Circular]";
      seen.add(v);
    }
    return v;
  };
  try {
    const s = JSON.stringify(val, replacer, space);
    return space ? maybeTruncate(s) : s;
  } catch {
    try {
      return String(val);
    } catch {
      return "[Unserializable]";
    }
  }
};

const redactHeaders = (headers: Record<string, any>) => {
  if (!headers) return {};
  if (
    String(process.env.LOG_SHOW_SENSITIVE ?? "false").toLowerCase() === "true"
  )
    return headers;
  const out = { ...headers };
  const lower = Object.fromEntries(
    Object.entries(out).map(([k, v]) => [k.toLowerCase(), k])
  );
  for (const key of ["authorization", "cookie", "x-api-key"]) {
    const original = lower[key];
    if (original) out[original] = "***REDACTED***";
  }
  return out;
};
const formatData = (data: unknown) => {
  if (typeof data !== "string") return data;
  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
};
const shortUrl = (u?: string) => u?.replace(/^https?:\/\/[^/]+/, "") ?? "";
const shortTest = (t?: string) => t?.split(" > ").pop();

/* ─────────────────────────────────────────────────────────
 * HttpLogger
 * ───────────────────────────────────────────────────────── */
export class HttpLogger {
  constructor(
    private readonly t: LoggerTransport = new ConsoleTransport(),
    private readonly getLevel = getLevelDefault,
    private readonly now: () => Date = () => new Date()
  ) {}

  private base(info: Record<string, unknown>) {
    return {
      ts: this.now().toISOString(),
      ...(__currentTestName ? { test: __currentTestName } : {}),
      ...info,
    };
  }

  private format(
    type: "REQUEST" | "RESPONSE" | "ERROR",
    info: Record<string, unknown>,
    url?: string
  ) {
    const fmt = getFormat();
    const level = this.getLevel();

    if (fmt === "json") {
      const out = {
        level,
        type,
        url_short: shortUrl(url || (info["url"] as string | undefined)),
        url_full: (info["url"] as string | undefined) ?? url ?? "",
        test: info["test"],
        ts: info["ts"],
        status: info["status"],
        method: info["method"],
        headers: info["headers"],
        data: info["data"],
        message: info["message"],
        code: info["code"],
        response: info["response"],
        request: info["request"],
      };
      return safeStringify(out, 2);
    }

    const status = typeof info.status === "string" ? info.status : "";
    const mark =
      type === "RESPONSE"
        ? status.startsWith("2")
          ? " ✓"
          : /^[45]/.test(status)
          ? " ✗"
          : " ○"
        : "";
    const SEP = "═".repeat(60),
      SUB = "─".repeat(60);
    const lines: string[] = [SEP, `[${level}] ${type}${mark}`, SEP];

    for (const [k, v] of Object.entries(info)) {
      if (["headers", "data", "url", "test"].includes(k)) continue;
      const label = k[0].toUpperCase() + k.slice(1);
      if (v && typeof v === "object")
        lines.push(`${label}:\n${safeStringify(v, 2)}`);
      else if (v !== undefined) lines.push(`${label}: ${String(v)}`);
    }

    const urlShort = shortUrl(url || (info["url"] as string | undefined));
    if (urlShort) lines.push(`URL: ${urlShort}`);
    const test = info["test"] as string | undefined;
    if (test) lines.push(`Test: ${shortTest(test)}`);

    if (info.headers !== undefined) {
      lines.push(SUB, "Headers:", safeStringify(info.headers, 2));
    }
    if (info.data !== undefined) {
      lines.push(SUB, "Data:", safeStringify(info.data, 2));
    }
    lines.push(SEP);
    return lines.join("\n");
  }

  logRequest(config: InternalAxiosRequestConfig) {
    if (this.getLevel() !== "DEBUG") return;
    const info = this.base({
      method: config.method?.toUpperCase(),
      url: config.url,
      headers: redactHeaders(config.headers as any),
      data: formatData(config.data),
    });
    this.t.debug?.(this.format("REQUEST", info, config.url));
  }

  logResponse(resp: AxiosResponse) {
    if (this.getLevel() !== "DEBUG") return;
    const info = this.base({
      status: `${resp.status} ${resp.statusText}`,
      url: resp.config?.url,
      headers: redactHeaders(resp.headers as any),
      data: formatData(resp.data),
    });
    this.t.debug?.(this.format("RESPONSE", info, resp.config?.url));
  }

  logError(err: any, cfg?: AxiosRequestConfig) {
    if (this.getLevel() !== "DEBUG") return;
    const info: Record<string, unknown> = this.base({
      message: err?.message,
      ...(err?.code ? { code: err.code } : {}),
      url: cfg?.url,
    });
    if (err?.response) {
      const r: AxiosResponse = err.response;
      info.response = {
        status: r.status,
        statusText: r.statusText,
        headers: redactHeaders(r.headers as any),
        data: formatData(r.data),
      };
    } else if (err?.request) {
      info.request = "No response received";
    }
    this.t.error(this.format("ERROR", info, cfg?.url));
  }
}

/* ─────────────────────────────────────────────────────────
 * Public API
 * ───────────────────────────────────────────────────────── */
export const setupAxiosLogger = (
  axiosInstance: AxiosInstance,
  logger = new HttpLogger()
) => {
  axiosInstance.interceptors.request.use(
    (cfg) => {
      logger.logRequest(cfg as InternalAxiosRequestConfig);
      return cfg;
    },
    (err) => {
      logger.logError(err, err?.config);
      return Promise.reject(err);
    }
  );
  axiosInstance.interceptors.response.use(
    (res) => {
      logger.logResponse(res);
      return res;
    },
    (err) => {
      logger.logError(err, err?.config);
      return Promise.reject(err);
    }
  );
};

export const wrapMockedAxiosLogger = (
  mockedAxios: any,
  logger = new HttpLogger()
) => {
  const wrap = (name: "post" | "get" | "put" | "delete" | "patch") => {
    const fn = mockedAxios[name];
    if (!fn || typeof fn !== "function" || (fn as any).__isLoggerWrapped)
      return;

    const wrapped = new Proxy(fn, {
      apply(target, thisArg, args: [string, any?, AxiosRequestConfig?]) {
        const [url, data, cfg] = args;
        logger.logRequest({
          method: name,
          url,
          data,
          headers: (cfg?.headers ?? {}) as any,
        } as any);

        return target
          .apply(thisArg, args)
          .then((res: any) => {
            const response: AxiosResponse =
              res && "status" in res && "data" in res
                ? ({ ...res, config: { url } } as AxiosResponse)
                : ({
                    status: 200,
                    statusText: "OK",
                    data: res,
                    headers: {},
                    config: { url },
                  } as AxiosResponse);
            logger.logResponse(response);
            return res;
          })
          .catch((err: any) => {
            logger.logError(err, { url } as any);
            throw err;
          });
      },
    });

    (wrapped as any).__isLoggerWrapped = true;
    mockedAxios[name] = wrapped;
  };

  ["post", "get", "put", "delete", "patch"].forEach((m) => wrap(m as any));
};

/* ─────────────────────────────────────────────────────────
 * Vitest auto-wrap (unified)
 * ───────────────────────────────────────────────────────── */
type AnyFn = (...a: any[]) => any;

const getVitest = () => {
  try {
    return {
      vi: (globalThis as any).vi,
      beforeAll: (globalThis as any).beforeAll,
      beforeEach: (globalThis as any).beforeEach,
    };
  } catch {
    return { vi: undefined, beforeAll: undefined, beforeEach: undefined };
  }
};

const ensureLoggerWrapped = async () => {
  const { vi } = getVitest();
  if (!vi) return;
  const mocked = vi.mocked((await import("axios")).default, true);
  const post = mocked?.post as AnyFn | undefined;
  const already = !!(post && (post as any).__isLoggerWrapped);
  if (!already && typeof post === "function") {
    wrapMockedAxiosLogger(mocked);
  }
};

export const installLoggerAutoWrap = () => {
  const { vi, beforeAll, beforeEach } = getVitest();
  if (!vi || !beforeAll || !beforeEach) return;

  beforeAll(async () => {
    await ensureLoggerWrapped();
    queueMicrotask(() => {
      void ensureLoggerWrapped();
    });
  });

  beforeEach(async () => {
    await ensureLoggerWrapped();
  });

  const _clear = vi.clearAllMocks?.bind(vi);
  if (_clear && !(vi as any).__loggerPatchedClear) {
    (vi as any).__loggerPatchedClear = true;
    vi.clearAllMocks = function () {
      const r = _clear();
      void ensureLoggerWrapped();
      queueMicrotask(() => {
        void ensureLoggerWrapped();
      });
      return r;
    };
  }
};

const LOG_AUTOWRAP =
  String(process.env.LOG_AUTOWRAP ?? "false").toLowerCase() === "true";
(() => {
  const isVitest = !!(globalThis as any).vi;
  if (isVitest && LOG_AUTOWRAP) installLoggerAutoWrap();
})();
