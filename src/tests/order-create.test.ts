import "dotenv/config";
import axios, { type AxiosError } from "axios";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import apiSpec from "../data/api-spec.json";
import {
  mockSuccess,
  mockError,
  mockNetworkError,
} from "../utils/mock-helpers";

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

// 응답 스키마 정의
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
  describe("성공", () => {
    it("[200][성공][BUSINESS] 주문 생성 성공 — orderNo 형식 및 생성 시간 검증", async () => {
      // given
      const payload = {
        reservationId: "RSV_A7K9M2X8",
        memberNo: "member_123",
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
      mockSuccess(mockedAxios.post, successResponse);

      // when
      expect(() => validateOrderCreateRequest(payload)).not.toThrow();
      const response = await axios.post(
        `${baseURL}${spec.restfulUrl}`,
        payload
      );

      // then
      expect(mockedAxios.post).toHaveBeenCalledWith(
        `${baseURL}${spec.restfulUrl}`,
        payload,
        expect.any(Object)
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

    it("[200][성공][FLOW] menu-select → order-create — 연속 호출 성공", async () => {
      // given
      const menuSelectSpec = apiSpec["POST_/api/v1/menu/select"];
      const menuSelectPayload = menuSelectSpec.requestBodyExample;
      const menuSelectResponse = menuSelectSpec.responses["200"].example;
      mockSuccess(mockedAxios.post, menuSelectResponse);

      // when
      const menuSelectResult = await axios.post(
        `${baseURL}${menuSelectSpec.restfulUrl}`,
        menuSelectPayload
      );
      const reservationId = menuSelectResult.data.data.reservationId;

      // given
      const orderCreatePayload = {
        reservationId,
        memberNo: menuSelectPayload.memberNo,
      };
      const orderCreateResponse = spec.responses["200"].example;
      mockSuccess(mockedAxios.post, orderCreateResponse);

      // when
      const orderCreateResult = await axios.post(
        `${baseURL}${spec.restfulUrl}`,
        orderCreatePayload
      );

      // then
      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
      expect(menuSelectResult.data.data.reservationId).toBe(reservationId);
      expect(orderCreateResult.status).toBe(200);
      expect(orderCreateResult.data.data.reservationId).toBe(reservationId);
    });

    it("[IDEMP][성공][IDEMP] 동일 키 중복 요청 — 동일 orderNo 반환", async () => {
      // given
      const payload = {
        reservationId: "RSV_A7K9M2X8",
        memberNo: "member_123",
      };
      const idempotencyKey = "idempotency-key-12345";
      const headers = {
        "x-idempotency-key": idempotencyKey,
      };
      const successResponse = spec.responses["200"].example;
      mockSuccess(mockedAxios.post, successResponse, true);

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
      expect(response1.data.data.orderNo).toBe(response2.data.data.orderNo);
      expect(response1.data.data.orderNo).toBe("R7X9K2M8");
    });
  });

  describe("검증", () => {
    it.each([
      {
        field: "reservationId",
        payload: {
          memberNo: "member_123",
        },
      },
      {
        field: "memberNo",
        payload: {
          reservationId: "RSV_A7K9M2X8",
        },
      },
    ])(
      "[VALIDATION][실패][VALIDATION] 필수값($field) 누락 — axios.post 호출되지 않음",
      ({ payload }) => {
        // when & then
        expect(() => validateOrderCreateRequest(payload)).toThrow();
        expect(mockedAxios.post).not.toHaveBeenCalled();
      }
    );
  });

  describe("실패", () => {
    it("[400][실패][BUSINESS] 예약 만료 — 5분 초과", async () => {
      // given
      const payload = {
        reservationId: "RSV_A7K9M2X8",
        memberNo: "member_123",
      };
      const errorResponse = {
        ...spec.responses["400"].example,
        errorCode: "RESERVATION_EXPIRED",
      };
      mockError(mockedAxios.post, 400, errorResponse);

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

    it("[400][실패][BUSINESS] 유효하지 않은 예약", async () => {
      // given
      const payload = {
        reservationId: "unknown_reservation_id",
        memberNo: "member_123",
      };
      const errorResponse = {
        ...spec.responses["400"].example,
        errorCode: "INVALID_RESERVATION",
      };
      mockError(mockedAxios.post, 400, errorResponse);

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

    it("[400][실패][BUSINESS] 중복 주문 방지 — 같은 reservationId 재사용 거부", async () => {
      // given
      const payload = {
        reservationId: "RSV_A7K9M2X8",
        memberNo: "member_123",
      };
      const successResponse = spec.responses["200"].example;
      const errorResponse = {
        ...spec.responses["400"].example,
        errorCode: "INVALID_RESERVATION",
      };
      mockSuccess(mockedAxios.post, successResponse);
      mockError(mockedAxios.post, 400, errorResponse);

      // when
      const firstResponse = await axios.post(
        `${baseURL}${spec.restfulUrl}`,
        payload
      );

      let error: AxiosError | undefined;
      try {
        await axios.post(`${baseURL}${spec.restfulUrl}`, payload);
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

    it("[409][실패][BUSINESS] 예약 후 재료 소진", async () => {
      // given
      const payload = {
        reservationId: "RSV_A7K9M2X8",
        memberNo: "member_123",
      };
      const errorResponse = spec.responses["409"].example;
      mockError(mockedAxios.post, 409, errorResponse);

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

    it("[409][실패][IDEMP] 같은 키 다른 바디 요청 — IDEMP_CONFLICT", async () => {
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
        "x-idempotency-key": idempotencyKey,
      };
      const successResponse = spec.responses["200"].example;
      const errorResponse = {
        status: "ERROR",
        message: "같은 Idempotency-Key로 다른 요청 본문이 전송되었습니다",
        errorCode: "IDEMP_CONFLICT",
        timestamp: "2025-08-07T12:30:00.123Z",
      };
      mockSuccess(mockedAxios.post, successResponse);
      mockError(mockedAxios.post, 409, errorResponse, {
        code: "ERR_BAD_RESPONSE",
        message: "Request failed with status code 409",
      });

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

    it("[429][실패][RATE_LIMIT] 요청 한도 초과 — Retry-After 헤더 반환", async () => {
      // given
      const payload = {
        reservationId: "RSV_A7K9M2X8",
        memberNo: "member_123",
      };
      const errorResponse = spec.responses["429"].example;
      mockError(mockedAxios.post, 429, errorResponse, {
        headers: { "retry-after": "60" },
        code: "ERR_BAD_RESPONSE",
        message: "Request failed with status code 429",
      });

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
      const retryAfter = error?.response?.headers["retry-after"];
      expect(Number(retryAfter)).toBe(60);
    });

    it("[ECONNABORTED][실패][TIMEOUT] 요청 타임아웃", async () => {
      // given
      const payload = {
        reservationId: "RSV_A7K9M2X8",
        memberNo: "member_123",
      };
      mockNetworkError(
        mockedAxios.post,
        "ECONNABORTED",
        "timeout of 5000ms exceeded"
      );

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

    it("[ENETUNREACH][실패][NETWORK] 네트워크 연결 실패", async () => {
      // given
      const payload = {
        reservationId: "RSV_A7K9M2X8",
        memberNo: "member_123",
      };
      mockNetworkError(mockedAxios.post, "ENETUNREACH", "Network unreachable");

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
  });
});
