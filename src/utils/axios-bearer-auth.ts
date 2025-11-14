import type { AxiosInstance, AxiosRequestConfig } from "axios";

const getToken = () => process.env.ACCESS_TOKEN;

export const setupAuthHeader = (
  axiosInstance: AxiosInstance,
  token = getToken()
) => {
  if (!token) return;
  axiosInstance.interceptors.request.use((cfg) => {
    const hasAuth =
      !!(cfg.headers as any)?.Authorization ||
      !!(cfg.headers as any)?.authorization;
    if (!hasAuth) {
      cfg.headers = {
        ...(cfg.headers as any),
        Authorization: `Bearer ${token}`,
      };
    }
    return cfg;
  });
};

const wrapTargetMethods = (target: any, token: string) => {
  const wrap = (name: "post" | "get" | "put" | "delete" | "patch") => {
    const fn = target[name];
    if (!fn || typeof fn !== "function" || (fn as any).__authWrapped) return;

    const wrapped = new Proxy(fn, {
      apply(orig, thisArg, args: [string, any?, AxiosRequestConfig?]) {
        const [url, data, cfg] = args;
        const hasAuth =
          !!cfg?.headers?.Authorization || !!cfg?.headers?.authorization;
        const skip =
          cfg?.headers?.["x-skip-auth"] === true ||
          cfg?.headers?.["x-skip-auth"] === "true";

        const nextCfg: AxiosRequestConfig =
          skip || hasAuth
            ? { ...(cfg ?? {}) }
            : {
                ...(cfg ?? {}),
                headers: {
                  ...(cfg?.headers ?? {}),
                  Authorization: `Bearer ${token}`,
                },
              };

        return orig.apply(thisArg, [url, data, nextCfg]);
      },
    });

    (wrapped as any).__authWrapped = true;
    target[name] = wrapped;
  };

  ["post", "get", "put", "delete", "patch"].forEach((m) => wrap(m as any));
};

export const wrapMockedAxiosAuth = (mockedAxios: any, token = getToken()) => {
  if (!token || !mockedAxios) return;

  wrapTargetMethods(mockedAxios, token);

  const origCreate = mockedAxios.create;
  if (
    typeof origCreate === "function" &&
    !(origCreate as any).__authCreatePatched
  ) {
    const wrappedCreate = new Proxy(origCreate, {
      apply(target, thisArg, args: any[]) {
        const instance = target.apply(thisArg, args);
        if (instance) wrapTargetMethods(instance, token);
        return instance;
      },
    });
    (wrappedCreate as any).__authCreatePatched = true;
    mockedAxios.create = wrappedCreate;
  }
};

const ensureAuthWrapped = async () => {
  const vi = (globalThis as any)?.vi;
  if (!vi) return;
  const mocked = vi.mocked((await import("axios")).default, true);
  if (mocked) wrapMockedAxiosAuth(mocked);
};

export const installAxiosAuthAutoWrap = () => {
  const vi = (globalThis as any)?.vi;
  const beforeAll = (globalThis as any)?.beforeAll;
  const beforeEach = (globalThis as any)?.beforeEach;
  if (!vi || !beforeAll || !beforeEach) return;

  beforeAll(async () => {
    await ensureAuthWrapped();
    queueMicrotask(() => {
      void ensureAuthWrapped();
    });
  });

  beforeEach(async () => {
    await ensureAuthWrapped();
  });

  const _clear = vi.clearAllMocks?.bind(vi);
  if (_clear && !(vi as any).__authPatchedClear) {
    (vi as any).__authPatchedClear = true;
    vi.clearAllMocks = function () {
      const r = _clear();
      void ensureAuthWrapped();
      queueMicrotask(() => {
        void ensureAuthWrapped();
      });
      return r;
    };
  }
};

const AUTH_AUTOWRAP =
  String(process.env.AUTH_AUTOWRAP ?? "true").toLowerCase() !== "false";
(() => {
  const isVitest = !!(globalThis as any).vi;
  if (isVitest && AUTH_AUTOWRAP) installAxiosAuthAutoWrap();
})();
