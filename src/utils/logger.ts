import "dotenv/config";
import type {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from "axios";

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

const formatLog = (
  level: LogLevel,
  type: "REQUEST" | "RESPONSE" | "ERROR",
  info: Record<string, unknown>,
  url?: string
) => {
  const header = `[${level}] ${type}${
    type === "RESPONSE" && typeof info.status === "string"
      ? (info.status as string).startsWith("2")
        ? " ✓"
        : (info.status as string).match(/^[45]/)
        ? " ✗"
        : " ○"
      : ""
  }`;

  const fields = Object.entries(info)
    .filter(([k]) => k !== "url" && k !== "test")
    .map(([k, v]) => `${k[0].toUpperCase()}${k.slice(1)}: ${v as any}`);

  const test = info["test"] as string | undefined;

  return [
    DEFAULT_SEP,
    header,
    DEFAULT_SEP,
    ...fields,
    `URL: ${shortUrl(url || (info["url"] as string | undefined))}`,
    ...(test ? [`Test: ${shortTest(test)}`] : []),
    DEFAULT_SUB_SEP,
    JSON.stringify(info, null, 2),
    DEFAULT_SEP,
  ].join("\n");
};

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
    const test = this.getCurrentTestName?.();
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
      // INFO 레벨에서는 에러만 찍되, 요청도 함께 남기고 싶다면 아래 주석 해제
      // this.t.info(this.formatRequest(config as any));
      this.t.error(this.formatError(error, config));
    } else {
      this.t.error(this.formatError(error, config));
    }
  }
}

/** Axios 인스턴스에 로거 부착 */
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

/** Mocked axios(post/get/…)에 로거를 덧씌우기 (명시적 호출) */
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
              // 비표준 모킹 응답 호환
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

/** Vitest와 연결: 현재 테스트 이름을 로거에 주입할 수 있도록 헬퍼 제공 */
export const withVitestContext = (logger: HttpLogger) => ({
  beforeEach: (context: any) => {
    const suiteNames = (s: any): string[] => {
      const arr: string[] = [];
      for (let cur = s; cur?.name; cur = cur.suite) arr.unshift(cur.name);
      return arr;
    };
    const testName = context?.meta?.name || context?.task?.name;
    const suites = suiteNames(context?.task?.suite);
    const full = testName
      ? suites.length
        ? [...suites, testName].join(" > ")
        : testName
      : undefined;

    // 주입 방식: getCurrentTestName 콜백 교체
    (logger as any).getCurrentTestName = () => full;
  },
});
