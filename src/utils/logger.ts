import "dotenv/config";
import type {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from "axios";
import { vi, beforeEach, beforeAll } from "vitest";

export type LogLevel = "INFO" | "DEBUG";

let currentTestName: string | undefined = undefined;

export const setCurrentTestName = (name: string | undefined): void => {
  currentTestName = name;
};

const getSuiteNames = (suite: any): string[] => {
  const suites: string[] = [];
  for (let s = suite; s?.name; s = s.suite) {
    suites.unshift(s.name);
  }
  return suites;
};

const getCurrentTestName = (): string | undefined => {
  if (currentTestName) return currentTestName;
  try {
    const test =
      (globalThis as any).__vitest__?.current ||
      (globalThis as any).__vitest__?.activeTest;
    if (test?.name) {
      return [...getSuiteNames(test.suite), test.name].join(" > ");
    }
  } catch {}
  return undefined;
};

export const getLogLevel = (): LogLevel => {
  const logMode = process.env.LOG_MODE?.toLowerCase();
  return logMode === "debug" ? "DEBUG" : "INFO";
};

const formatData = (data: any): any => {
  if (data === undefined || data === null || typeof data !== "string") {
    return data;
  }

  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
};

const getShortTestName = (name: string | undefined) => name?.split(" > ").pop();

const getShortUrl = (url: string | undefined) =>
  url?.replace(/^https?:\/\/[^/]+/, "") || "";

const SEP = "═".repeat(60);
const SUB_SEP = "─".repeat(60);

const buildLogInfo = (baseInfo: any) => {
  const testName = getCurrentTestName();
  return { ...baseInfo, ...(testName && { test: testName }) };
};

const formatLog = (
  type: string,
  emoji: string,
  info: any,
  url?: string
): string => {
  const level = getLogLevel();
  const header = emoji ? `[${level}] ${type} ${emoji}` : `[${level}] ${type}`;
  const shortUrl = getShortUrl(url || info.url);
  const shortTestName = getShortTestName(info.test);
  const fields = Object.entries(info)
    .filter(([k]) => k !== "url" && k !== "test")
    .map(([k, v]) => `${k[0].toUpperCase() + k.slice(1)}: ${v}`);

  return [
    SEP,
    header,
    SEP,
    ...fields,
    `URL: ${shortUrl}`,
    ...(shortTestName ? [`Test: ${shortTestName}`] : []),
    SUB_SEP,
    JSON.stringify(info, null, 2),
    SEP,
  ].join("\n");
};

const formatRequest = (config: InternalAxiosRequestConfig): string => {
  const { method, url, data, headers } = config;
  return formatLog(
    "REQUEST",
    "",
    buildLogInfo({
      method: method?.toUpperCase(),
      url,
      headers: sanitizeHeaders(headers),
      data: formatData(data),
    }),
    url
  );
};

const formatResponse = (response: AxiosResponse): string => {
  const { status, statusText, data, headers, config } = response;
  const emoji = status >= 200 && status < 300 ? "✓" : status >= 400 ? "✗" : "○";
  return formatLog(
    "RESPONSE",
    emoji,
    buildLogInfo({
      status: `${status} ${statusText}`,
      url: config.url,
      headers: sanitizeHeaders(headers),
      data: formatData(data),
    }),
    config.url
  );
};

const formatError = (error: any, config?: AxiosRequestConfig): string => {
  const info: any = buildLogInfo({
    message: error.message,
    ...(error.code && { code: error.code }),
    url: config?.url,
  });

  if (error.response) {
    const { status, statusText, data, headers } = error.response;
    info.response = {
      status,
      statusText,
      headers: sanitizeHeaders(headers),
      data: formatData(data),
    };
  } else if (error.request) {
    info.request = "No response received";
  }

  return formatLog("ERROR", "✗", info, config?.url || "Unknown URL");
};

const sanitizeHeaders = (headers: any): any => {
  if (!headers) return {};
  if (process.env.LOG_SHOW_SENSITIVE?.toLowerCase() === "true") return headers;

  const sanitized = { ...headers };
  ["authorization", "cookie", "x-api-key"].forEach((key) => {
    const found = Object.keys(sanitized).find((k) => k.toLowerCase() === key);
    if (found) sanitized[found] = "***REDACTED***";
  });
  return sanitized;
};

const createRequestConfig = (
  method: string,
  url: string,
  data?: any,
  config?: any
): InternalAxiosRequestConfig =>
  ({
    method: method.toLowerCase(),
    url,
    data,
    headers: config?.headers || {},
  } as InternalAxiosRequestConfig);

const createResponse = (
  status: number,
  statusText: string,
  data: any,
  url: string,
  headers: any = {}
): AxiosResponse =>
  ({
    status,
    statusText,
    data,
    headers,
    config: { url } as any,
  } as AxiosResponse);

export const wrapMockedAxios = (mockedAxios: any): void => {
  const wrapMethod = (methodName: string) => {
    const method = mockedAxios[methodName.toLowerCase()];
    if (
      !method ||
      typeof method !== "function" ||
      (method as any).__isLoggerWrapped
    )
      return;

    const wrapped = new Proxy(method, {
      apply: (target, thisArg, args) => {
        const [url, data, config] = args;
        const reqConfig = createRequestConfig(methodName, url, data, config);
        const isDebug = getLogLevel() === "DEBUG";

        if (isDebug) console.log(formatRequest(reqConfig));

        return target
          .apply(thisArg, args)
          .then((response: any) => {
            if (isDebug && response) {
              console.log(
                formatResponse(
                  createResponse(
                    response.status || 200,
                    response.statusText || "OK",
                    response.data,
                    url,
                    response.headers || {}
                  )
                )
              );
            }
            return response;
          })
          .catch((error: any) => {
            const level = getLogLevel();
            if (level === "INFO" || level === "DEBUG") {
              if (level === "INFO") console.log(formatRequest(reqConfig));
              console.error(formatError(error, reqConfig));
            }
            throw error;
          });
      },
    });

    (wrapped as any).__isLoggerWrapped = true;
    mockedAxios[methodName.toLowerCase()] = wrapped;
  };

  ["POST", "GET", "PUT", "DELETE", "PATCH"].forEach(wrapMethod);
};

export const setupAxiosLogger = (
  axiosInstance: AxiosInstance,
  logLevel: LogLevel = getLogLevel()
): void => {
  const isDebug = logLevel === "DEBUG";

  axiosInstance.interceptors.request.use(
    (config) => {
      if (isDebug) console.log(formatRequest(config));
      return config;
    },
    (error) => {
      console.error(formatError(error, error.config));
      return Promise.reject(error);
    }
  );

  axiosInstance.interceptors.response.use(
    (response) => {
      if (isDebug) console.log(formatResponse(response));
      return response;
    },
    (error) => {
      console.error(formatError(error, error.config));
      return Promise.reject(error);
    }
  );
};

if (
  typeof vi !== "undefined" &&
  typeof beforeEach !== "undefined" &&
  typeof beforeAll !== "undefined"
) {
  beforeEach((context) => {
    const testName = (context as any).meta?.name || (context as any).task?.name;
    if (testName) {
      const suites = getSuiteNames((context as any).task?.suite);
      setCurrentTestName(
        suites.length ? [...suites, testName].join(" > ") : testName
      );
    }
  });

  const wrapAxios = async () => {
    try {
      const mockedAxios = vi.mocked((await import("axios")).default, true);
      if (mockedAxios && typeof mockedAxios.post === "function") {
        wrapMockedAxios(mockedAxios);
      }
    } catch {}
  };

  const originalClearAllMocks = vi.clearAllMocks;
  vi.clearAllMocks = function () {
    originalClearAllMocks.call(this);
    wrapAxios().catch(() => {});
    return this;
  };

  beforeAll(wrapAxios);
}
