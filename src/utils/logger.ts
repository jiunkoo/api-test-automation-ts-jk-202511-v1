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

export interface LoggerOptions {
  getLevel?: () => LogLevel;
  sanitizeHeaders?: (headers: Record<string, any>) => Record<string, any>;
  now?: () => Date;
  transport?: LoggerTransport;
  getCurrentTestName?: () => string | undefined;
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
 * Globals (test name)
 * ────────────────────────────────────────────────────────────────────────── */
let __currentTestName: string | undefined;
export const setCurrentTestName = (name?: string) => {
  __currentTestName = name;
};
const getCurrentTestNameGlobal = () => __currentTestName;

/* ──────────────────────────────────────────────────────────────────────────
 * Defaults & Utils
 * ────────────────────────────────────────────────────────────────────────── */
const DEFAULT_SEP = "═".repeat(60);
const DEFAULT_SUB_SEP = "─".repeat(60);

const defaultGetLevel = (): LogLevel =>
  process.env.LOG_MODE?.toLowerCase() === "debug" ? "DEBUG" : "INFO";

const defaultSanitizeHeaders = (
  headers: Record<string, any>
): Record<string, any> => {
  if (!headers) return {};
  if (process.env.LOG_SHOW_SENSITIVE?.toLowerCase() === "true") return headers;

  const redacted = { ...headers };
  const lower = Object.fromEntries(
    Object.entries(redacted).map(([k, v]) => [k.toLowerCase(), [k, v] as const])
  );
  for (const key of ["authorization", "cookie", "x-api-key"]) {
    const originalKey = lower[key]?.[0];
    if (originalKey) redacted[originalKey] = "***REDACTED***";
  }
  return redacted;
};

const formatData = (data: unknown): unknown => {
  if (typeof data !== "string") return data;
  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
};

const shortUrl = (url?: string) => url?.replace(/^https?:\/\/[^/]+/, "") ?? "";
const shortTest = (name?: string) => name?.split(" > ").pop();

const getLogFormat = () =>
  (process.env.LOG_FORMAT ?? "json").toLowerCase() as "json" | "pretty";

const MAX_BODY = Number(process.env.LOG_MAX_BODY ?? 0); // 0 = 제한 없음
const maybeTruncate = (s: string) =>
  MAX_BODY > 0 && s.length > MAX_BODY
    ? s.slice(0, MAX_BODY) + " …(truncated)"
    : s;

const safeStringify = (value: unknown, space = 2) => {
  const seen = new WeakSet();
  const replacer = (_k: string, v: any) => {
    if (typeof v === "bigint") return v.toString();
    if (typeof v === "object" && v !== null) {
      if (seen.has(v)) return "[Circular]";
      seen.add(v);
    }
    return v;
  };
  try {
    const s = JSON.stringify(value, replacer, space);
    return space ? maybeTruncate(s) : s;
  } catch {
    try {
      return String(value);
    } catch {
      return "[Unserializable]";
    }
  }
};

const formatLog = (
  level: LogLevel,
  type: "REQUEST" | "RESPONSE" | "ERROR",
  info: Record<string, unknown>,
  url?: string
) => {
  const fmt = getLogFormat();

  if (fmt === "json") {
    const out = {
      level,
      type,
      url_short: shortUrl(url || (info["url"] as string | undefined)),
      url_full: (info["url"] as string | undefined) ?? url ?? "",
      test: info["test"] ?? undefined,
      ts: info["ts"] ?? new Date().toISOString(),
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

  // pretty: 사람 친화적 멀티라인
  const statusStr = typeof info.status === "string" ? info.status : "";
  const header =
    `[${level}] ${type}` +
    (type === "RESPONSE"
      ? statusStr.startsWith("2")
        ? " ✓"
        : /^[45]/.test(statusStr)
        ? " ✗"
        : " ○"
      : "");

  // 요약 라인(헤더/데이터 제외)
  const summaryLines: string[] = [];
  for (const [k, v] of Object.entries(info)) {
    if (k === "url" || k === "test" || k === "headers" || k === "data")
      continue;
    const label = k[0].toUpperCase() + k.slice(1);
    if (v !== null && typeof v === "object") {
      summaryLines.push(`${label}:\n${safeStringify(v, 2)}`);
    } else if (v !== undefined) {
      summaryLines.push(`${label}: ${String(v)}`);
    }
  }

  const test = info["test"] as string | undefined;
  const resolvedUrl = shortUrl(url || (info["url"] as string | undefined));

  const blocks: string[] = [
    DEFAULT_SEP,
    header,
    DEFAULT_SEP,
    ...summaryLines,
    `URL: ${resolvedUrl}`,
    ...(test ? [`Test: ${shortTest(test)}`] : []),
  ];

  if (info.headers !== undefined) {
    blocks.push(DEFAULT_SUB_SEP, "Headers:", safeStringify(info.headers, 2));
  }
  if (info.data !== undefined) {
    blocks.push(DEFAULT_SUB_SEP, "Data:", safeStringify(info.data, 2));
  }

  blocks.push(DEFAULT_SEP);
  return blocks.join("\n");
};

/* ──────────────────────────────────────────────────────────────────────────
 * HttpLogger (엔진)
 * ────────────────────────────────────────────────────────────────────────── */
export class HttpLogger {
  private getLevel: () => LogLevel;
  private sanitizeHeaders: (h: Record<string, any>) => Record<string, any>;
  private now: () => Date;
  private t: LoggerTransport;
  private getCurrentTestName?: () => string | undefined;

  constructor(opts: LoggerOptions = {}) {
    this.getLevel = opts.getLevel ?? defaultGetLevel;
    this.sanitizeHeaders = opts.sanitizeHeaders ?? defaultSanitizeHeaders;
    this.now = opts.now ?? (() => new Date());
    this.t = opts.transport ?? new ConsoleTransport();
    this.getCurrentTestName = opts.getCurrentTestName;
  }

  private base(info: Record<string, unknown>) {
    const test = (this.getCurrentTestName ?? getCurrentTestNameGlobal)?.();
    return { ...info, ...(test ? { test } : {}), ts: this.now().toISOString() };
  }

  formatRequest = (config: InternalAxiosRequestConfig): string => {
    const { method, url, data, headers } = config;
    const info = this.base({
      method: method?.toUpperCase(),
      url,
      headers: this.sanitizeHeaders(headers as any),
      data: formatData(data),
    });
    return formatLog(this.getLevel(), "REQUEST", info, url);
  };

  formatResponse = (response: AxiosResponse): string => {
    const { status, statusText, data, headers, config } = response;
    const info = this.base({
      status: `${status} ${statusText}`,
      url: config.url,
      headers: this.sanitizeHeaders(headers as any),
      data: formatData(data),
    });
    return formatLog(this.getLevel(), "RESPONSE", info, config.url);
  };

  formatError = (error: any, config?: AxiosRequestConfig): string => {
    const base: Record<string, unknown> = this.base({
      message: error?.message,
      ...(error?.code ? { code: error.code } : {}),
      url: config?.url,
    });

    if (error?.response) {
      const { status, statusText, data, headers } =
        error.response as AxiosResponse;
      base.response = {
        status,
        statusText,
        headers: this.sanitizeHeaders(headers as any),
        data: formatData(data),
      };
    } else if (error?.request) {
      base.request = "No response received";
    }

    return formatLog(this.getLevel(), "ERROR", base, config?.url);
  };

  logRequest(config: InternalAxiosRequestConfig) {
    if (this.getLevel() === "DEBUG") this.t.debug?.(this.formatRequest(config));
  }

  logResponse(response: AxiosResponse) {
    if (this.getLevel() === "DEBUG")
      this.t.debug?.(this.formatResponse(response));
  }

  logError(error: any, config?: AxiosRequestConfig) {
    const level = this.getLevel();
    if (level === "INFO") {
      this.t.error(this.formatError(error, config));
    } else {
      this.t.error(this.formatError(error, config));
    }
  }
}

/* ──────────────────────────────────────────────────────────────────────────
 * Public API: axios 인스턴스/모킹 래핑
 * ────────────────────────────────────────────────────────────────────────── */
export const setupAxiosLogger = (
  axiosInstance: AxiosInstance,
  logger = new HttpLogger()
): void => {
  axiosInstance.interceptors.request.use(
    (config) => {
      logger.logRequest(config as InternalAxiosRequestConfig);
      return config;
    },
    (error) => {
      logger.logError(error, error?.config);
      return Promise.reject(error);
    }
  );

  axiosInstance.interceptors.response.use(
    (response) => {
      logger.logResponse(response);
      return response;
    },
    (error) => {
      logger.logError(error, error?.config);
      return Promise.reject(error);
    }
  );
};

export const wrapMockedAxios = (
  mockedAxios: any,
  logger = new HttpLogger()
): void => {
  const wrapMethod = (
    methodName: "POST" | "GET" | "PUT" | "DELETE" | "PATCH"
  ) => {
    const fn = mockedAxios[methodName.toLowerCase()];
    if (!fn || typeof fn !== "function" || (fn as any).__isLoggerWrapped)
      return;

    const wrapped = new Proxy(fn, {
      apply: (target, thisArg, args: [string, any?, AxiosRequestConfig?]) => {
        const [url, data, cfg] = args;
        const req: InternalAxiosRequestConfig = {
          method: methodName.toLowerCase() as any,
          url,
          data,
          headers: (cfg?.headers ?? {}) as any,
        } as InternalAxiosRequestConfig;

        logger.logRequest(req);
        return target
          .apply(thisArg, args)
          .then(
            (
              res:
                | AxiosResponse
                | {
                    status?: number;
                    statusText?: string;
                    data?: any;
                    headers?: any;
                  }
            ) => {
              const response: AxiosResponse =
                "status" in res && "data" in res
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
            }
          )
          .catch((err: any) => {
            logger.logError(err, req);
            throw err;
          });
      },
    });

    (wrapped as any).__isLoggerWrapped = true;
    mockedAxios[methodName.toLowerCase()] = wrapped;
  };

  ["POST", "GET", "PUT", "DELETE", "PATCH"].forEach((m) =>
    wrapMethod(m as any)
  );
};

/* ──────────────────────────────────────────────────────────────────────────
 * Vitest 자동 부트스트랩
 * ────────────────────────────────────────────────────────────────────────── */
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

const ensureWrapped = async () => {
  const { vi } = getVitest();
  if (!vi) return;
  const mocked = vi.mocked((await import("axios")).default, true);
  const post = mocked?.post as AnyFn | undefined;
  const wrapped = !!(post && (post as any).__isLoggerWrapped);
  if (!wrapped && typeof post === "function") wrapMockedAxios(mocked);
};

export const installVitestAutoWrap = () => {
  const { vi, beforeAll, beforeEach } = getVitest();
  if (!vi || !beforeAll || !beforeEach) return;

  if (!process.env.LOG_MODE) process.env.LOG_MODE = "info";

  // axios 모킹 시 자동 재-래핑
  const _mock = vi.mock.bind(vi);
  vi.mock = ((...args: any[]) => {
    const r = _mock(...args);
    if (args[0] === "axios") ensureWrapped().catch(() => {});
    return r;
  }) as typeof vi.mock;

  const _doMock = vi.doMock?.bind(vi) as AnyFn | undefined;
  if (_doMock) {
    vi.doMock = ((...args: any[]) => {
      const r = _doMock(...args);
      if (args[0] === "axios") ensureWrapped().catch(() => {});
      return r;
    }) as typeof vi.doMock;
  }

  // 테스트 이름 주입
  const suitesOf = (suite: any): string[] => {
    const arr: string[] = [];
    for (let s = suite; s?.name; s = s.suite) arr.unshift(s.name);
    return arr;
  };
  beforeEach((ctx: any) => {
    const name = ctx?.meta?.name || ctx?.task?.name;
    const suites = suitesOf(ctx?.task?.suite);
    setCurrentTestName(suites.length ? [...suites, name].join(" > ") : name);
  });

  // 최초 1회 래핑 + clearAllMocks 이후 재-래핑
  beforeAll(async () => {
    await ensureWrapped();
  });
  const _clear = vi.clearAllMocks.bind(vi);
  vi.clearAllMocks = function () {
    const r = _clear();
    ensureWrapped().catch(() => {});
    return r;
  };
};

// 자동 설치: Vitest 런타임이며 LOG_AUTOWRAP !== 'false' 이면 장착
(() => {
  const isVitest = !!(globalThis as any).vi;
  const allow =
    String(process.env.LOG_AUTOWRAP ?? "true").toLowerCase() !== "false";
  if (isVitest && allow) installVitestAutoWrap();
})();
