import "dotenv/config";
import axios from "axios";
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

vi.mock("axios");
const mockedAxios = vi.mocked(axios, true);

beforeAll(() => {
  if (!spec) {
    throw new Error("API 스펙에 POST_/api/v1/order/create 정의가 필요합니다.");
  }

  if (!baseURL) {
    throw new Error("환경 변수 API_URL이 설정되어 있어야 합니다.");
  }
});

beforeEach(() => {
  vi.clearAllMocks();
});

const ROUTE = `${baseURL!}${spec.restfulUrl}`;

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
    ])("OC | PRE | 검증 | 필수값($field) 누락 — 요청 차단", ({ payload }) => {
      // when & then
      expect(() => validateOrderCreateRequest(payload)).toThrow();
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });
  });

  describe("성공", () => {
    it("OC | 200 | 성공 | 주문 생성 성공", async () => {
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
      const response = await axios.post(ROUTE, payload);

      // then
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
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

    it("OC | 200 | 성공 | menu-select → order-create — 연속 호출 성공", async () => {
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
      const orderCreateResult = await axios.post(ROUTE, orderCreatePayload);

      // then
      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
      expect(menuSelectResult.data.data.reservationId).toBe(reservationId);
      expect(orderCreateResult.status).toBe(200);
      expect(orderCreateResult.data.data.reservationId).toBe(reservationId);
    });

    it("OC | 200 | 성공 | 멱등 (동일키/동일바디) — 동일 orderNo 반환", async () => {
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
      const response1 = await axios.post(ROUTE, payload, { headers });
      const response2 = await axios.post(ROUTE, payload, { headers });

      // then
      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
      expect(mockedAxios.post).toHaveBeenNthCalledWith(
        1,
        ROUTE,
        payload,
        expect.objectContaining({
          headers: expect.objectContaining({
            "x-idempotency-key": idempotencyKey,
          }),
        })
      );
      expect(mockedAxios.post).toHaveBeenNthCalledWith(
        2,
        ROUTE,
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

  describe("실패", () => {
    it("OC | 400 | 실패 | Content-Type 오류", async () => {
      // given
      const invalidBody = "reservationId=RSV_A7K9M2X8&memberNo=member_123";
      const headers = {
        "Content-Type": "application/x-www-form-urlencoded",
      };
      const errorResponse = spec.responses["400"].example;
      mockError(mockedAxios.post, 400, errorResponse);

      // when & then
      await expect(
        axios.post(ROUTE, invalidBody, {
          headers,
        })
      ).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 400, data: errorResponse },
      });
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it("OC | 422 | 실패 | 예약 만료 (5분 초과)", async () => {
      // given
      const payload = {
        reservationId: "RSV_A7K9M2X8",
        memberNo: "member_123",
      };
      const errorResponse = spec.responses["422"].example;
      mockError(mockedAxios.post, 422, errorResponse);

      // when & then
      await expect(axios.post(ROUTE, payload)).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 422, data: errorResponse },
      });
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it("OC | 404 | 실패 | 유효하지 않은 예약", async () => {
      // given
      const payload = {
        reservationId: "unknown_reservation_id",
        memberNo: "member_123",
      };
      const errorResponse = spec.responses["404"].example;
      mockError(mockedAxios.post, 404, errorResponse);

      // when & then
      await expect(axios.post(ROUTE, payload)).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 404, data: errorResponse },
      });
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it("OC | 409 | 실패 | 예약 후 재료 소진", async () => {
      // given
      const payload = {
        reservationId: "RSV_A7K9M2X8",
        memberNo: "member_123",
      };
      const errorResponse =
        spec.responses["409"].examples["INGREDIENTS_EXHAUSTED"];
      mockError(mockedAxios.post, 409, errorResponse);

      // when & then
      await expect(axios.post(ROUTE, payload)).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 409, data: errorResponse },
      });
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it("OC | 409 | 실패 | 중복 주문  - reservationId 재사용", async () => {
      // given
      const payload = {
        reservationId: "RSV_A7K9M2X8",
        memberNo: "member_123",
      };
      const successResponse = spec.responses["200"].example;
      const errorResponse = spec.responses["409"].examples["DUPLICATE_ORDER"];
      mockSuccess(mockedAxios.post, successResponse);
      mockError(mockedAxios.post, 409, errorResponse);

      // when
      const firstResponse = await axios.post(ROUTE, payload);
      await expect(axios.post(ROUTE, payload)).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 409, data: errorResponse },
      });

      // then
      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
      expect(firstResponse.status).toBe(200);
    });

    it("OC | 409 | 실패 | 멱등 (동일키/다른바디)", async () => {
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
      const errorResponse = spec.responses["409"].examples["IDEMP_CONFLICT"];
      mockSuccess(mockedAxios.post, successResponse);
      mockError(mockedAxios.post, 409, errorResponse, {
        code: "ERR_BAD_RESPONSE",
        message: "Request failed with status code 409",
      });

      // when
      const response1 = await axios.post(ROUTE, payload1, { headers });
      await expect(
        axios.post(ROUTE, payload2, {
          headers,
        })
      ).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 409, data: errorResponse },
      });

      // then
      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
      expect(response1.data.data.orderNo).toBe("R7X9K2M8");
    });

    it("OC | 429 | 실패 | 요청 한도 초과 - Retry-After=60s 반환", async () => {
      // given
      const payload = {
        reservationId: "RSV_A7K9M2X8",
        memberNo: "member_123",
      };
      const errorResponse = spec.responses["429"].example;
      mockError(mockedAxios.post, 429, errorResponse, {
        headers: { "retry-after": "60" },
      });

      // when & then
      await expect(axios.post(ROUTE, payload)).rejects.toMatchObject({
        isAxiosError: true,
        response: {
          status: 429,
          data: errorResponse,
          headers: { "retry-after": "60" },
        },
      });
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it("OC | ERR | 실패 | 요청 타임아웃", async () => {
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

      // when & then
      await expect(axios.post(ROUTE, payload)).rejects.toMatchObject({
        isAxiosError: true,
        code: "ECONNABORTED",
      });
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it("OC | ERR | 실패 | 네트워크 연결 실패", async () => {
      // given
      const payload = {
        reservationId: "RSV_A7K9M2X8",
        memberNo: "member_123",
      };
      mockNetworkError(mockedAxios.post, "ENETUNREACH", "Network unreachable");

      // when & then
      await expect(axios.post(ROUTE, payload)).rejects.toMatchObject({
        isAxiosError: true,
        code: "ENETUNREACH",
      });
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });
  });
});
