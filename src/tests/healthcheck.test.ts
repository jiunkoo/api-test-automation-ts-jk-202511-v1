import { describe, expect, it, vi } from "vitest";
import type { AxiosRequestConfig } from "axios";

import { sendRequest, type RequestExecutor } from "../httpClient";

describe("sendRequest", () => {
  it("요청 결과의 data 필드만 반환한다", async () => {
    const payload = { status: "ok" };
    const requestConfig: AxiosRequestConfig = { method: "GET", url: "/status" };
    type RequestResult = Awaited<ReturnType<RequestExecutor["request"]>>;
    const mockResponse = {
      data: payload,
      status: 200,
      statusText: "OK",
      headers: {},
      config: requestConfig,
    } as RequestResult;
    const requestSpy = vi.fn(async () => mockResponse);
    const mockClient: RequestExecutor = {
      request: requestSpy as unknown as RequestExecutor["request"],
    };

    const result = await sendRequest<typeof payload>(mockClient, requestConfig);

    expect(result).toEqual(payload);
    expect(requestSpy).toHaveBeenCalledWith(requestConfig);
  });
});
