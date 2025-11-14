import "dotenv/config";
import axios, { type AxiosError } from "axios";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import apiSpec from "../data/api-spec.json";

const spec = apiSpec["POST_/api/v1/menu/select"];
const baseURL = process.env.API_URL;
const accessToken = process.env.ACCESS_TOKEN;

vi.mock("axios");
const mockedAxios = vi.mocked(axios, true);

beforeAll(() => {
  if (!spec) {
    throw new Error("API 스펙에 POST_/api/v1/menu/select 정의가 필요합니다.");
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
  MENU_ID_REQUIRED: "menuId는 필수값입니다",
  QUANTITY_REQUIRED: "quantity는 필수값입니다",
  QUANTITY_INVALID: "quantity는 1 이상 99 이하의 정수여야 합니다",
  SHOP_ID_REQUIRED: "shopId는 필수값입니다",
  MEMBER_NO_REQUIRED: "memberNo는 필수값입니다",
} as const;

const validateMenuSelectRequest = (payload: {
  menuId?: string;
  quantity?: number;
  shopId?: string;
  memberNo?: string;
}): void => {
  if (!payload.menuId) {
    throw new Error(VALIDATION_ERRORS.MENU_ID_REQUIRED);
  }
  if (payload.quantity === undefined || payload.quantity === null) {
    throw new Error(VALIDATION_ERRORS.QUANTITY_REQUIRED);
  }
  if (
    !Number.isInteger(payload.quantity) ||
    payload.quantity < 1 ||
    payload.quantity > 99
  ) {
    throw new Error(VALIDATION_ERRORS.QUANTITY_INVALID);
  }
  if (!payload.shopId) {
    throw new Error(VALIDATION_ERRORS.SHOP_ID_REQUIRED);
  }
  if (!payload.memberNo) {
    throw new Error(VALIDATION_ERRORS.MEMBER_NO_REQUIRED);
  }
};

describe("POST /api/v1/menu/select", () => {
  it("[200][성공] 메뉴 예약 완료", async () => {
    // given
    const payload = {
      menuId: "menu_001",
      quantity: 2,
      shopId: "shop_001",
      memberNo: "member_123",
    };
    const successResponse = {
      status: "SUCCESS",
      message: "메뉴 예약이 완료되었습니다",
      timestamp: "2025-08-07T12:30:00.123Z",
      data: {
        reservationId: "RSV_A7K9M2X8",
        reservationExpiresAt: "2025-08-07T12:35:00.123Z",
        menuId: "menu_001",
        quantity: 2,
      },
    };
    mockedAxios.post.mockResolvedValueOnce({
      status: 200,
      statusText: "OK",
      data: successResponse,
    });
    const successResponseSchema = z.object({
      status: z.literal("SUCCESS"),
      message: z.string(),
      timestamp: z.string().refine((val) => !isNaN(Date.parse(val)), {
        message: "timestamp는 유효한 ISO 8601 형식이어야 합니다",
      }),
      data: z.object({
        reservationId: z.string(),
        reservationExpiresAt: z
          .string()
          .refine((val) => !isNaN(Date.parse(val)), {
            message: "reservationExpiresAt는 유효한 ISO 8601 형식이어야 합니다",
          }),
        menuId: z.string(),
        quantity: z.number().int().min(1).max(99),
      }),
    });

    // when
    expect(() => validateMenuSelectRequest(payload)).not.toThrow();
    const response = await axios.post(`${baseURL}${spec.restfulUrl}`, payload);

    // then
    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${baseURL}${spec.restfulUrl}`,
      payload,
      expect.any(Object)
    );
    expect(response.status).toBe(200);
    expect(response.data).toEqual(successResponse);

    const validatedData = successResponseSchema.parse(response.data);
    expect(validatedData.data.reservationId).toBeTypeOf("string");
    expect(validatedData.data.menuId).toBeTypeOf("string");
    expect(validatedData.data.quantity).toBeTypeOf("number");
    expect(Number.isInteger(validatedData.data.quantity)).toBe(true);

    const timestamp = new Date(response.data.timestamp);
    const expiresAt = new Date(response.data.data.reservationExpiresAt);
    const diffMinutes =
      (expiresAt.getTime() - timestamp.getTime()) / (1000 * 60);
    expect(diffMinutes).toBe(5);
  });

  it("[409][실패] 재료 부족", async () => {
    // given
    const payload = {
      menuId: "menu_001",
      quantity: 2,
      shopId: "shop_001",
      memberNo: "member_123",
    };
    const errorResponse = spec.responses["409"].example;
    mockedAxios.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 409, data: errorResponse },
    } as AxiosError);

    // when
    let error: AxiosError | undefined;
    try {
      await axios.post(`${baseURL}${spec.restfulUrl}`, payload);
    } catch (e) {
      error = e as AxiosError;
    }

    // then
    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${baseURL}${spec.restfulUrl}`,
      payload,
      expect.any(Object)
    );
    expect(error).toBeDefined();
    expect(error?.isAxiosError).toBe(true);
    expect(error?.response?.status).toBe(409);
    expect(error?.response?.data).toEqual(errorResponse);
  });

  it("[400][실패] 잘못된 요청 - 필수값(menuId) 누락", async () => {
    // given
    const payload = {
      quantity: 2,
      shopId: "shop_001",
      memberNo: "member_123",
    };
    const errorResponse = spec.responses["400"].example;
    mockedAxios.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 400, data: errorResponse },
    } as AxiosError);

    // when
    let error: AxiosError | undefined;
    try {
      await axios.post(`${baseURL}${spec.restfulUrl}`, payload);
    } catch (e) {
      error = e as AxiosError;
    }

    // then
    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${baseURL}${spec.restfulUrl}`,
      payload,
      expect.any(Object)
    );
    expect(error).toBeDefined();
    expect(error?.isAxiosError).toBe(true);
    expect(error?.response?.status).toBe(400);
    expect(error?.response?.data).toEqual(errorResponse);
  });

  it("[400][실패] 잘못된 요청 - 필수값(quantity) 누락", async () => {
    // given
    const payload = {
      menuId: "menu_001",
      shopId: "shop_001",
      memberNo: "member_123",
    };
    const errorResponse = spec.responses["400"].example;
    mockedAxios.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 400, data: errorResponse },
    } as AxiosError);

    // when
    let error: AxiosError | undefined;
    try {
      await axios.post(`${baseURL}${spec.restfulUrl}`, payload);
    } catch (e) {
      error = e as AxiosError;
    }

    // then
    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${baseURL}${spec.restfulUrl}`,
      payload,
      expect.any(Object)
    );
    expect(error).toBeDefined();
    expect(error?.isAxiosError).toBe(true);
    expect(error?.response?.status).toBe(400);
    expect(error?.response?.data).toEqual(errorResponse);
  });

  it("[400][실패] 잘못된 요청 - 필수값(shopId) 누락", async () => {
    // given
    const payload = {
      menuId: "menu_001",
      quantity: 2,
      memberNo: "member_123",
    };
    const errorResponse = spec.responses["400"].example;
    mockedAxios.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 400, data: errorResponse },
    } as AxiosError);

    // when
    let error: AxiosError | undefined;
    try {
      await axios.post(`${baseURL}${spec.restfulUrl}`, payload);
    } catch (e) {
      error = e as AxiosError;
    }

    // then
    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${baseURL}${spec.restfulUrl}`,
      payload,
      expect.any(Object)
    );
    expect(error).toBeDefined();
    expect(error?.isAxiosError).toBe(true);
    expect(error?.response?.status).toBe(400);
    expect(error?.response?.data).toEqual(errorResponse);
  });

  it("[400][실패] 잘못된 요청 - 필수값(memberNo) 누락", async () => {
    // given
    const payload = {
      menuId: "menu_001",
      quantity: 2,
      shopId: "shop_001",
    };
    const errorResponse = spec.responses["400"].example;
    mockedAxios.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 400, data: errorResponse },
    } as AxiosError);

    // when
    let error: AxiosError | undefined;
    try {
      await axios.post(`${baseURL}${spec.restfulUrl}`, payload);
    } catch (e) {
      error = e as AxiosError;
    }

    // then
    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${baseURL}${spec.restfulUrl}`,
      payload,
      expect.any(Object)
    );
    expect(error).toBeDefined();
    expect(error?.isAxiosError).toBe(true);
    expect(error?.response?.status).toBe(400);
    expect(error?.response?.data).toEqual(errorResponse);
  });

  it("[404][실패] 존재하지 않는 메뉴", async () => {
    // given
    const payload = {
      menuId: "unknown_menu_id",
      quantity: 2,
      shopId: "shop_001",
      memberNo: "member_123",
    };
    const errorResponse = spec.responses["404"].example;
    mockedAxios.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 404, data: errorResponse },
    } as AxiosError);

    // when
    let error: AxiosError | undefined;
    try {
      await axios.post(`${baseURL}${spec.restfulUrl}`, payload);
    } catch (e) {
      error = e as AxiosError;
    }

    // then
    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${baseURL}${spec.restfulUrl}`,
      payload,
      expect.any(Object)
    );
    expect(error).toBeDefined();
    expect(error?.isAxiosError).toBe(true);
    expect(error?.response?.status).toBe(404);
    expect(error?.response?.data).toEqual(errorResponse);
  });

  it("[401][실패] 인증 실패 - 토큰 누락", async () => {
    // given
    const payload = {
      menuId: "menu_001",
      quantity: 2,
      shopId: "shop_001",
      memberNo: "member_123",
    };
    const headers = { "x-skip-auth": true };
    const errorResponse = spec.responses["401"].example;
    mockedAxios.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 401, data: errorResponse },
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
    expect(error?.response?.status).toBe(401);
    expect(error?.response?.data).toEqual(errorResponse);
  });

  it("[401][실패] 인증 실패 - 토큰 만료", async () => {
    // given
    const payload = {
      menuId: "menu_001",
      quantity: 2,
      shopId: "shop_001",
      memberNo: "member_123",
    };
    const errorResponse = spec.responses["401"].example;
    mockedAxios.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 401, data: errorResponse },
    } as AxiosError);

    // when
    let error: AxiosError | undefined;
    try {
      await axios.post(`${baseURL}${spec.restfulUrl}`, payload);
    } catch (e) {
      error = e as AxiosError;
    }

    // then
    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${baseURL}${spec.restfulUrl}`,
      payload,
      expect.any(Object)
    );
    expect(error).toBeDefined();
    expect(error?.isAxiosError).toBe(true);
    expect(error?.response?.status).toBe(401);
    expect(error?.response?.data).toEqual(errorResponse);
  });

  it("[403][실패] 권한 부족", async () => {
    // given
    const payload = {
      menuId: "menu_001",
      quantity: 2,
      shopId: "shop_001",
      memberNo: "member_123",
    };
    const errorResponse = spec.responses["403"].example;
    mockedAxios.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 403, data: errorResponse },
    } as AxiosError);

    // when
    let error: AxiosError | undefined;
    try {
      await axios.post(`${baseURL}${spec.restfulUrl}`, payload);
    } catch (e) {
      error = e as AxiosError;
    }

    // then
    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${baseURL}${spec.restfulUrl}`,
      payload,
      expect.any(Object)
    );
    expect(error).toBeDefined();
    expect(error?.isAxiosError).toBe(true);
    expect(error?.response?.status).toBe(403);
    expect(error?.response?.data).toEqual(errorResponse);
  });

  it.each([
    { quantity: 0, description: "quantity가 0일 때" },
    { quantity: 100, description: "quantity가 100일 때" },
    { quantity: 2.5, description: "quantity가 정수가 아닐 때" },
  ])(
    "[클라이언트 검증] $description axios.post 호출되지 않음",
    ({ quantity }) => {
      // given
      const payload = {
        menuId: "menu_001",
        quantity,
        shopId: "shop_001",
        memberNo: "member_123",
      };

      // when & then
      expect(() => validateMenuSelectRequest(payload)).toThrow();
      expect(mockedAxios.post).not.toHaveBeenCalled();
    }
  );

  it("[타임아웃] 요청 타임아웃 시 에러 처리", async () => {
    // given
    const payload = {
      menuId: "menu_001",
      quantity: 2,
      shopId: "shop_001",
      memberNo: "member_123",
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
      await axios.post(`${baseURL}${spec.restfulUrl}`, payload);
    } catch (e) {
      error = e as AxiosError;
    }

    // then
    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${baseURL}${spec.restfulUrl}`,
      payload,
      expect.any(Object)
    );
    expect(error).toBeDefined();
    expect(error?.isAxiosError).toBe(true);
    expect(error?.code).toBe("ECONNABORTED");
  });

  it("[네트워크 에러] 네트워크 연결 실패 시 에러 처리", async () => {
    // given
    const payload = {
      menuId: "menu_001",
      quantity: 2,
      shopId: "shop_001",
      memberNo: "member_123",
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
      await axios.post(`${baseURL}${spec.restfulUrl}`, payload);
    } catch (e) {
      error = e as AxiosError;
    }

    // then
    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${baseURL}${spec.restfulUrl}`,
      payload,
      expect.any(Object)
    );
    expect(error).toBeDefined();
    expect(error?.isAxiosError).toBe(true);
    expect(error?.code).toBe("ENETUNREACH");
  });

  it("[429][실패] 요청 한도 초과 - Retry-After 헤더 확인", async () => {
    // given
    const payload = {
      menuId: "menu_001",
      quantity: 2,
      shopId: "shop_001",
      memberNo: "member_123",
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
      await axios.post(`${baseURL}${spec.restfulUrl}`, payload);
    } catch (e) {
      error = e as AxiosError;
    }

    // then
    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${baseURL}${spec.restfulUrl}`,
      payload,
      expect.any(Object)
    );
    expect(error).toBeDefined();
    expect(error?.isAxiosError).toBe(true);
    expect(error?.response?.status).toBe(429);
    expect(error?.response?.data).toEqual(errorResponse);
    expect(error?.response?.headers["retry-after"]).toBe("60");
  });

  it("[멱등성] 동일한 Idempotency-Key로 중복 요청 시 동일한 reservationId 반환", async () => {
    // given
    const payload = {
      menuId: "menu_001",
      quantity: 2,
      shopId: "shop_001",
      memberNo: "member_123",
    };
    const idempotencyKey = "idempotency-key-12345";
    const headers = {
      "x-idempotency-key": idempotencyKey,
    };
    const successResponse = {
      status: "SUCCESS",
      message: "메뉴 예약이 완료되었습니다",
      timestamp: "2025-08-07T12:30:00.123Z",
      data: {
        reservationId: "RSV_A7K9M2X8",
        reservationExpiresAt: "2025-08-07T12:35:00.123Z",
        menuId: "menu_001",
        quantity: 2,
      },
    };
    mockedAxios.post.mockResolvedValue({
      status: 200,
      statusText: "OK",
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
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-idempotency-key": idempotencyKey,
        }),
      })
    );
    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      2,
      `${baseURL}${spec.restfulUrl}`,
      payload,
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-idempotency-key": idempotencyKey,
        }),
      })
    );
    // 동일한 Idempotency-Key로 요청 시 동일한 reservationId 반환
    expect(response1.data.data.reservationId).toBe(
      response2.data.data.reservationId
    );
    expect(response1.data.data.reservationId).toBe("RSV_A7K9M2X8");
  });

  it("[멱등성] 다른 Idempotency-Key로 요청 시 다른 reservationId 반환", async () => {
    // given
    const payload = {
      menuId: "menu_001",
      quantity: 2,
      shopId: "shop_001",
      memberNo: "member_123",
    };
    const headers1 = {
      "x-idempotency-key": "idempotency-key-11111",
    };
    const headers2 = {
      "x-idempotency-key": "idempotency-key-22222",
    };
    const successResponse1 = {
      status: "SUCCESS",
      message: "메뉴 예약이 완료되었습니다",
      timestamp: "2025-08-07T12:30:00.123Z",
      data: {
        reservationId: "RSV_A7K9M2X8",
        reservationExpiresAt: "2025-08-07T12:35:00.123Z",
        menuId: "menu_001",
        quantity: 2,
      },
    };
    const successResponse2 = {
      status: "SUCCESS",
      message: "메뉴 예약이 완료되었습니다",
      timestamp: "2025-08-07T12:30:00.123Z",
      data: {
        reservationId: "RSV_DIFFERENT_ID",
        reservationExpiresAt: "2025-08-07T12:35:00.123Z",
        menuId: "menu_001",
        quantity: 2,
      },
    };
    mockedAxios.post
      .mockResolvedValueOnce({
        status: 200,
        statusText: "OK",
        data: successResponse1,
      })
      .mockResolvedValueOnce({
        status: 200,
        statusText: "OK",
        data: successResponse2,
      });

    // when
    const response1 = await axios.post(
      `${baseURL}${spec.restfulUrl}`,
      payload,
      { headers: headers1 }
    );
    const response2 = await axios.post(
      `${baseURL}${spec.restfulUrl}`,
      payload,
      { headers: headers2 }
    );

    // then
    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      1,
      `${baseURL}${spec.restfulUrl}`,
      payload,
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-idempotency-key": "idempotency-key-11111",
        }),
      })
    );
    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      2,
      `${baseURL}${spec.restfulUrl}`,
      payload,
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-idempotency-key": "idempotency-key-22222",
        }),
      })
    );
    // 다른 Idempotency-Key로 요청 시 다른 reservationId 반환
    expect(response1.data.data.reservationId).not.toBe(
      response2.data.data.reservationId
    );
  });
});
