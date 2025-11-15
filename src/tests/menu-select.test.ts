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

const spec = apiSpec["POST_/api/v1/menu/select"];
const baseURL = process.env.API_URL;

vi.mock("axios");
const mockedAxios = vi.mocked(axios, true);

beforeAll(() => {
  if (!spec) {
    throw new Error("API 스펙에 POST_/api/v1/menu/select 정의가 필요합니다.");
  }

  if (!baseURL) {
    throw new Error("환경 변수 API_URL이 설정되어 있어야 합니다.");
  }
});

beforeEach(() => {
  vi.clearAllMocks();
});

const ROUTE = `${baseURL!}${spec.restfulUrl}`;

const successResponseSchema = z.object({
  status: z.literal("SUCCESS"),
  message: z.string(),
  timestamp: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "timestamp는 유효한 ISO 8601 형식이어야 합니다",
  }),
  data: z.object({
    reservationId: z.string(),
    reservationExpiresAt: z.string().refine((val) => !isNaN(Date.parse(val)), {
      message: "reservationExpiresAt는 유효한 ISO 8601 형식이어야 합니다",
    }),
    menuId: z.string(),
    quantity: z.number().int().min(1).max(99),
  }),
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
  describe("검증", () => {
    it.each([
      {
        field: "menuId",
        payload: {
          quantity: 2,
          shopId: "shop_001",
          memberNo: "member_123",
        },
      },
      {
        field: "quantity",
        payload: {
          menuId: "menu_001",
          shopId: "shop_001",
          memberNo: "member_123",
        },
      },
      {
        field: "shopId",
        payload: {
          menuId: "menu_001",
          quantity: 2,
          memberNo: "member_123",
        },
      },
      {
        field: "memberNo",
        payload: {
          menuId: "menu_001",
          quantity: 2,
          shopId: "shop_001",
        },
      },
    ])(
      "[실패][VALIDATION] 필수값($field) 누락 — axios.post 호출되지 않음",
      ({ payload }) => {
        // when & then
        expect(() => validateMenuSelectRequest(payload)).toThrow();
        expect(mockedAxios.post).not.toHaveBeenCalled();
      }
    );

    it.each([
      { quantity: 0, description: "quantity가 0일 때" },
      { quantity: 100, description: "quantity가 100일 때" },
      { quantity: 2.5, description: "quantity가 정수가 아닐 때" },
    ])(
      "[실패][VALIDATION] quantity 검증 — $description axios.post 호출되지 않음",
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
  });

  describe("성공", () => {
    it("[200][성공][BUSINESS] 메뉴 예약 완료 — 만료 시간 5분 검증", async () => {
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
      mockSuccess(mockedAxios.post, successResponse);

      // when
      expect(() => validateMenuSelectRequest(payload)).not.toThrow();
      const response = await axios.post(ROUTE, payload);

      // then
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
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
      expect(diffMinutes).toBeCloseTo(5, 1);
    });

    it("[200][성공][IDEMP] 동일 키 중복 요청 — 동일 reservationId 반환", async () => {
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
      expect(response1.data.data.reservationId).toBe(
        response2.data.data.reservationId
      );
      expect(response1.data.data.reservationId).toBe("RSV_A7K9M2X8");
    });

    it("[200][성공][IDEMP] 다른 키 요청 — 다른 reservationId 반환", async () => {
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
      mockSuccess(mockedAxios.post, successResponse1);
      mockSuccess(mockedAxios.post, successResponse2);

      // when
      const response1 = await axios.post(ROUTE, payload, { headers: headers1 });
      const response2 = await axios.post(ROUTE, payload, { headers: headers2 });

      // then
      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
      expect(mockedAxios.post).toHaveBeenNthCalledWith(
        1,
        ROUTE,
        payload,
        expect.objectContaining({
          headers: expect.objectContaining({
            "x-idempotency-key": "idempotency-key-11111",
          }),
        })
      );
      expect(mockedAxios.post).toHaveBeenNthCalledWith(
        2,
        ROUTE,
        payload,
        expect.objectContaining({
          headers: expect.objectContaining({
            "x-idempotency-key": "idempotency-key-22222",
          }),
        })
      );
      expect(response1.data.data.reservationId).not.toBe(
        response2.data.data.reservationId
      );
    });
  });

  describe("실패", () => {
    it("[404][실패][BUSINESS] 존재하지 않는 메뉴", async () => {
      // given
      const payload = {
        menuId: "unknown_menu_id",
        quantity: 2,
        shopId: "shop_001",
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

    it("[401][실패][AUTH] 토큰 누락", async () => {
      // given
      const payload = {
        menuId: "menu_001",
        quantity: 2,
        shopId: "shop_001",
        memberNo: "member_123",
      };
      const headers = { "x-skip-auth": true };
      const errorResponse = spec.responses["401"].example;
      mockError(mockedAxios.post, 401, errorResponse);

      // when & then
      await expect(
        axios.post(ROUTE, payload, {
          headers,
        })
      ).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 401, data: errorResponse },
      });
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it("[401][실패][AUTH] 토큰 만료", async () => {
      // given
      const payload = {
        menuId: "menu_001",
        quantity: 2,
        shopId: "shop_001",
        memberNo: "member_123",
      };
      const errorResponse = spec.responses["401"].example;
      mockError(mockedAxios.post, 401, errorResponse);

      // when & then
      await expect(axios.post(ROUTE, payload)).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 401, data: errorResponse },
      });
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it("[403][실패][AUTH] 권한 부족", async () => {
      // given
      const payload = {
        menuId: "menu_001",
        quantity: 2,
        shopId: "shop_001",
        memberNo: "member_123",
      };
      const errorResponse = spec.responses["403"].example;
      mockError(mockedAxios.post, 403, errorResponse);

      // when & then
      await expect(axios.post(ROUTE, payload)).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 403, data: errorResponse },
      });
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it("[409][실패][BUSINESS] 재료 부족", async () => {
      // given
      const payload = {
        menuId: "menu_001",
        quantity: 2,
        shopId: "shop_001",
        memberNo: "member_123",
      };
      const errorResponse = spec.responses["409"].example;
      mockError(mockedAxios.post, 409, errorResponse);

      // when & then
      await expect(axios.post(ROUTE, payload)).rejects.toMatchObject({
        isAxiosError: true,
        response: { status: 409, data: errorResponse },
      });
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it("[429][실패][RATE_LIMIT] 요청 한도 초과 — Retry-After 헤더 반환", async () => {
      // given
      const payload = {
        menuId: "menu_001",
        quantity: 2,
        shopId: "shop_001",
        memberNo: "member_123",
      };
      const errorResponse = spec.responses["429"].example;
      mockError(mockedAxios.post, 429, errorResponse, {
        headers: { "retry-after": "60" },
        code: "ERR_BAD_RESPONSE",
        message: "Request failed with status code 429",
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

    it("[ECONNABORTED][실패][TIMEOUT] 요청 타임아웃", async () => {
      // given
      const payload = {
        menuId: "menu_001",
        quantity: 2,
        shopId: "shop_001",
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

    it("[ENETUNREACH][실패][NETWORK] 네트워크 연결 실패", async () => {
      // given
      const payload = {
        menuId: "menu_001",
        quantity: 2,
        shopId: "shop_001",
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
