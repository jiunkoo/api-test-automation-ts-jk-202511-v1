import "dotenv/config";
import axios, { type AxiosError } from "axios";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import apiSpec from "../data/api-spec.json";

const spec = apiSpec["POST_/api/v1/order/create"];
const baseURL = process.env.API_URL;
const accessToken = process.env.ACCESS_TOKEN;

vi.mock("axios");
const mockedAxios = vi.mocked(axios, true);

beforeAll(() => {
  if (!spec) {
    throw new Error("API 스펙에 POST_/api/v1/order/create 정의가 필요합니다.");
  }

  if (!baseURL) {
    throw new Error("환경 변수 API_URL이 설정되어 있어야 합니다.");
  }

  if (!accessToken) {
    throw new Error("환경 변수 ACCESS_TOKEN이 설정되어 있어야 합니다.");
  }
});

beforeEach(() => {
  vi.clearAllMocks();
});

const VALIDATION_ERRORS = {
  RESERVATION_ID_REQUIRED: "reservationId는 필수값입니다",
  MEMBER_NO_REQUIRED: "memberNo는 필수값입니다",
} as const;

const validateOrderCreateRequest = (payload: {
  reservationId?: string;
  memberNo?: string;
}): void => {
  if (!payload.reservationId) {
    throw new Error(VALIDATION_ERRORS.RESERVATION_ID_REQUIRED);
  }
  if (!payload.memberNo) {
    throw new Error(VALIDATION_ERRORS.MEMBER_NO_REQUIRED);
  }
};

describe("POST /api/v1/order/create", () => {
  it("[200][성공] 주문 생성 성공", async () => {
    // given
    const payload = {
      reservationId: "RSV_A7K9M2X8",
      memberNo: "member_123",
    };
    const headers = {
      Authorization: `Bearer ${accessToken}`,
    };
    const successResponse = {
      status: "SUCCESS",
      message: "주문이 성공적으로 생성되었습니다",
      timestamp: "2025-08-07T12:30:00.123Z",
      data: {
        orderNo: "R7X9K2M8",
        orderStatus: "INITIALIZING",
        reservationId: "RSV_A7K9M2X8",
        createdAt: "2025-08-07T12:30:00.123Z",
        memberInfo: {
          memberNo: "member_123",
        },
      },
    };
    mockedAxios.post.mockResolvedValueOnce({
      status: 200,
      statusText: "OK",
      headers: {},
      data: successResponse,
    });
    const successResponseSchema = z.object({
      status: z.literal("SUCCESS"),
      message: z.string(),
      timestamp: z.string().refine((val) => !isNaN(Date.parse(val)), {
        message: "timestamp는 유효한 ISO 8601 형식이어야 합니다",
      }),
      data: z.object({
        orderNo: z.string().regex(/^[A-Z0-9]{8}$/, {
          message: "orderNo는 8자리 영숫자여야 합니다",
        }),
        orderStatus: z.literal("INITIALIZING"),
        reservationId: z.string(),
        createdAt: z.string().refine((val) => !isNaN(Date.parse(val)), {
          message: "createdAt는 유효한 ISO 8601 형식이어야 합니다",
        }),
        memberInfo: z.object({
          memberNo: z.string(),
        }),
      }),
    });

    // when
    expect(() => validateOrderCreateRequest(payload)).not.toThrow();
    const response = await axios.post(`${baseURL}${spec.restfulUrl}`, payload, {
      headers,
    });

    // then
    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${baseURL}${spec.restfulUrl}`,
      payload,
      { headers }
    );
    expect(response.status).toBe(200);
    expect(response.data).toEqual(successResponse);

    const validatedData = successResponseSchema.parse(response.data);
    expect(validatedData.data.orderNo).toMatch(/^[A-Z0-9]{8}$/);
    expect(validatedData.data.orderStatus).toBe("INITIALIZING");

    const timestamp = new Date(response.data.timestamp);
    const createdAt = new Date(response.data.data.createdAt);
    const diffSeconds = Math.abs(
      (createdAt.getTime() - timestamp.getTime()) / 1000
    );
    expect(diffSeconds).toBeLessThanOrEqual(1.5);
  });

  it("[400][실패] 예약 만료 (5분 초과)", async () => {
    // given
    const payload = {
      reservationId: "RSV_A7K9M2X8",
      memberNo: "member_123",
    };
    const headers = {
      Authorization: `Bearer ${accessToken}`,
    };
    const errorResponse = {
      ...spec.responses["400"].example,
      errorCode: "RESERVATION_EXPIRED",
    };
    mockedAxios.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 400, data: errorResponse },
    } as AxiosError);

    // when
    let error: AxiosError | undefined;
    try {
      await axios.post(`${baseURL}${spec.restfulUrl}`, payload, {
        headers,
      });
    } catch (e) {
      error = e as AxiosError;
    }

    // then
    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${baseURL}${spec.restfulUrl}`,
      payload,
      { headers }
    );
    expect(error).toBeDefined();
    expect(error?.isAxiosError).toBe(true);
    expect(error?.response?.status).toBe(400);
    expect(error?.response?.data).toEqual(errorResponse);
  });

  it("[400][실패] 유효하지 않은 예약", async () => {
    // given
    const payload = {
      reservationId: "unknown_reservation_id",
      memberNo: "member_123",
    };
    const headers = {
      Authorization: `Bearer ${accessToken}`,
    };
    const errorResponse = {
      ...spec.responses["400"].example,
      errorCode: "INVALID_RESERVATION",
    };
    mockedAxios.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 400, data: errorResponse },
    } as AxiosError);

    // when
    let error: AxiosError | undefined;
    try {
      await axios.post(`${baseURL}${spec.restfulUrl}`, payload, {
        headers,
      });
    } catch (e) {
      error = e as AxiosError;
    }

    // then
    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${baseURL}${spec.restfulUrl}`,
      payload,
      { headers }
    );
    expect(error).toBeDefined();
    expect(error?.isAxiosError).toBe(true);
    expect(error?.response?.status).toBe(400);
    expect(error?.response?.data).toEqual(errorResponse);
  });

  it("[409][실패] 예약 후 재료 소진", async () => {
    // given
    const payload = {
      reservationId: "RSV_A7K9M2X8",
      memberNo: "member_123",
    };
    const headers = {
      Authorization: `Bearer ${accessToken}`,
    };
    const errorResponse = spec.responses["409"].example;
    mockedAxios.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 409, data: errorResponse },
    } as AxiosError);

    // when
    let error: AxiosError | undefined;
    try {
      await axios.post(`${baseURL}${spec.restfulUrl}`, payload, {
        headers,
      });
    } catch (e) {
      error = e as AxiosError;
    }

    // then
    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${baseURL}${spec.restfulUrl}`,
      payload,
      { headers }
    );
    expect(error).toBeDefined();
    expect(error?.isAxiosError).toBe(true);
    expect(error?.response?.status).toBe(409);
    expect(error?.response?.data).toEqual(errorResponse);
  });

  it("[정상 흐름] menu-select → order-create", async () => {
    // given
    const menuSelectSpec = apiSpec["POST_/api/v1/menu/select"];
    const menuSelectPayload = menuSelectSpec.requestBodyExample;
    const menuSelectHeaders = {
      Authorization: `Bearer ${accessToken}`,
    };
    const menuSelectResponse = menuSelectSpec.responses["200"].example;
    mockedAxios.post.mockResolvedValueOnce({
      status: 200,
      statusText: "OK",
      headers: {},
      data: menuSelectResponse,
    });

    // when
    const menuSelectResult = await axios.post(
      `${baseURL}${menuSelectSpec.restfulUrl}`,
      menuSelectPayload,
      { headers: menuSelectHeaders }
    );
    const reservationId = menuSelectResult.data.data.reservationId;

    // given
    const orderCreatePayload = {
      reservationId,
      memberNo: menuSelectPayload.memberNo,
    };
    const orderCreateHeaders = {
      Authorization: `Bearer ${accessToken}`,
    };
    const orderCreateResponse = spec.responses["200"].example;
    mockedAxios.post.mockResolvedValueOnce({
      status: 200,
      statusText: "OK",
      headers: {},
      data: orderCreateResponse,
    });

    // when
    const orderCreateResult = await axios.post(
      `${baseURL}${spec.restfulUrl}`,
      orderCreatePayload,
      { headers: orderCreateHeaders }
    );

    // then
    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    expect(menuSelectResult.data.data.reservationId).toBe(reservationId);
    expect(orderCreateResult.status).toBe(200);
    expect(orderCreateResult.data.data.reservationId).toBe(reservationId);
  });

  it("[중복 주문 방지] 같은 reservationId로 두 번째 order-create 시 거부", async () => {
    // given
    const payload = {
      reservationId: "RSV_A7K9M2X8",
      memberNo: "member_123",
    };
    const headers = {
      Authorization: `Bearer ${accessToken}`,
    };
    const successResponse = spec.responses["200"].example;
    const errorResponse = {
      ...spec.responses["400"].example,
      errorCode: "INVALID_RESERVATION",
    };
    mockedAxios.post
      .mockResolvedValueOnce({
        status: 200,
        statusText: "OK",
        headers: {},
        data: successResponse,
      })
      .mockRejectedValueOnce({
        isAxiosError: true,
        response: { status: 400, data: errorResponse },
      } as AxiosError);

    // when
    const firstResponse = await axios.post(
      `${baseURL}${spec.restfulUrl}`,
      payload,
      { headers }
    );

    let error: AxiosError | undefined;
    try {
      await axios.post(`${baseURL}${spec.restfulUrl}`, payload, {
        headers,
      });
    } catch (e) {
      error = e as AxiosError;
    }

    // then
    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    expect(firstResponse.status).toBe(200);
    expect(error).toBeDefined();
    expect(error?.isAxiosError).toBe(true);
    expect(error?.response?.status).toBe(400);
    expect(error?.response?.data).toEqual(errorResponse);
  });

  it("[클라이언트 검증] reservationId 누락 시 axios.post 호출되지 않음", () => {
    // given
    const payload = {
      memberNo: "member_123",
    };

    // when & then
    expect(() => validateOrderCreateRequest(payload)).toThrow();
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it("[클라이언트 검증] memberNo 누락 시 axios.post 호출되지 않음", () => {
    // given
    const payload = {
      reservationId: "RSV_A7K9M2X8",
    };

    // when & then
    expect(() => validateOrderCreateRequest(payload)).toThrow();
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it("[타임아웃] 요청 타임아웃 시 에러 처리", async () => {
    // given
    const payload = {
      reservationId: "RSV_A7K9M2X8",
      memberNo: "member_123",
    };
    const headers = {
      Authorization: `Bearer ${accessToken}`,
    };
    const timeoutError = {
      code: "ECONNABORTED",
      message: "timeout of 5000ms exceeded",
      isAxiosError: true,
    };
    mockedAxios.post.mockRejectedValueOnce(timeoutError as AxiosError);

    // when
    let error: AxiosError | undefined;
    try {
      await axios.post(`${baseURL}${spec.restfulUrl}`, payload, {
        headers,
      });
    } catch (e) {
      error = e as AxiosError;
    }

    // then
    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${baseURL}${spec.restfulUrl}`,
      payload,
      { headers }
    );
    expect(error).toBeDefined();
    expect(error?.isAxiosError).toBe(true);
    expect(error?.code).toBe("ECONNABORTED");
  });

  it("[네트워크 에러] 네트워크 연결 실패 시 에러 처리", async () => {
    // given
    const payload = {
      reservationId: "RSV_A7K9M2X8",
      memberNo: "member_123",
    };
    const headers = {
      Authorization: `Bearer ${accessToken}`,
    };
    const networkError = {
      code: "ENETUNREACH",
      message: "Network unreachable",
      isAxiosError: true,
    };
    mockedAxios.post.mockRejectedValueOnce(networkError as AxiosError);

    // when
    let error: AxiosError | undefined;
    try {
      await axios.post(`${baseURL}${spec.restfulUrl}`, payload, {
        headers,
      });
    } catch (e) {
      error = e as AxiosError;
    }

    // then
    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${baseURL}${spec.restfulUrl}`,
      payload,
      { headers }
    );
    expect(error).toBeDefined();
    expect(error?.isAxiosError).toBe(true);
    expect(error?.code).toBe("ENETUNREACH");
  });

  it("[429][실패] 요청 한도 초과 - Retry-After 헤더 확인", async () => {
    // given
    const payload = {
      reservationId: "RSV_A7K9M2X8",
      memberNo: "member_123",
    };
    const headers = {
      Authorization: `Bearer ${accessToken}`,
    };
    const errorResponse = spec.responses["429"].example;
    mockedAxios.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 429,
        statusText: "Too Many Requests",
        headers: {
          "retry-after": "60",
        },
        data: errorResponse,
      },
      code: "ERR_BAD_RESPONSE",
      name: "AxiosError",
      message: "Request failed with status code 429",
    } as unknown as AxiosError);

    // when
    let error: AxiosError | undefined;
    try {
      await axios.post(`${baseURL}${spec.restfulUrl}`, payload, {
        headers,
      });
    } catch (e) {
      error = e as AxiosError;
    }

    // then
    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${baseURL}${spec.restfulUrl}`,
      payload,
      { headers }
    );
    expect(error).toBeDefined();
    expect(error?.isAxiosError).toBe(true);
    expect(error?.response?.status).toBe(429);
    expect(error?.response?.data).toEqual(errorResponse);
    const retryAfter = error?.response?.headers["retry-after"];
    expect(Number(retryAfter)).toBe(60);
  });

  it("[멱등성] 동일한 Idempotency-Key로 중복 요청 시 동일한 orderNo 반환", async () => {
    // given
    const payload = {
      reservationId: "RSV_A7K9M2X8",
      memberNo: "member_123",
    };
    const idempotencyKey = "idempotency-key-12345";
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      "x-idempotency-key": idempotencyKey,
    };
    const successResponse = spec.responses["200"].example;
    mockedAxios.post.mockResolvedValue({
      status: 200,
      statusText: "OK",
      headers: {},
      data: successResponse,
    });

    // when
    const response1 = await axios.post(
      `${baseURL}${spec.restfulUrl}`,
      payload,
      { headers }
    );
    const response2 = await axios.post(
      `${baseURL}${spec.restfulUrl}`,
      payload,
      { headers }
    );

    // then
    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      1,
      `${baseURL}${spec.restfulUrl}`,
      payload,
      { headers }
    );
    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      2,
      `${baseURL}${spec.restfulUrl}`,
      payload,
      { headers }
    );
    expect(response1.data.data.orderNo).toBe(response2.data.data.orderNo);
    expect(response1.data.data.orderNo).toBe("R7X9K2M8");
  });

  it("[멱등성] 같은 Idempotency-Key로 다른 바디 요청 시 409 IDEMP_CONFLICT", async () => {
    // given
    const payload1 = {
      reservationId: "RSV_A7K9M2X8",
      memberNo: "member_123",
    };
    const payload2 = {
      reservationId: "RSV_DIFFERENT_ID",
      memberNo: "member_123",
    };
    const idempotencyKey = "idempotency-key-12345";
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      "x-idempotency-key": idempotencyKey,
    };
    const successResponse = spec.responses["200"].example;
    const errorResponse = {
      status: "ERROR",
      message: "같은 Idempotency-Key로 다른 요청 본문이 전송되었습니다",
      errorCode: "IDEMP_CONFLICT",
      timestamp: "2025-08-07T12:30:00.123Z",
    };
    mockedAxios.post
      .mockResolvedValueOnce({
        status: 200,
        statusText: "OK",
        headers: {},
        data: successResponse,
      })
      .mockRejectedValueOnce({
        isAxiosError: true,
        response: {
          status: 409,
          statusText: "Conflict",
          headers: {},
          data: errorResponse,
        },
        code: "ERR_BAD_RESPONSE",
        name: "AxiosError",
        message: "Request failed with status code 409",
      } as unknown as AxiosError);

    // when
    const response1 = await axios.post(
      `${baseURL}${spec.restfulUrl}`,
      payload1,
      { headers }
    );
    let error: AxiosError | undefined;
    try {
      await axios.post(`${baseURL}${spec.restfulUrl}`, payload2, {
        headers,
      });
    } catch (e) {
      error = e as AxiosError;
    }

    // then
    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    expect(response1.data.data.orderNo).toBe("R7X9K2M8");
    expect(error).toBeDefined();
    expect(error?.isAxiosError).toBe(true);
    expect(error?.response?.status).toBe(409);
    expect(error?.response?.data).toEqual(errorResponse);
  });
});
