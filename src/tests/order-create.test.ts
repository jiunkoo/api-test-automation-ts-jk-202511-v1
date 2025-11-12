import "dotenv/config";
import axios, { type AxiosError } from "axios";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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

    // when
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
      status: "ERROR",
      message: "예약 후 5분을 초과하여 예약이 만료되었습니다.",
      errorCode: "RESERVATION_EXPIRED",
      timestamp: "2025-08-07T12:40:00.123Z",
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

  it("[400][실패] 예약 후 재료 소진", async () => {
    // given
    const payload = {
      reservationId: "RSV_A7K9M2X8",
      memberNo: "member_123",
    };
    const headers = {
      Authorization: `Bearer ${accessToken}`,
    };
    const errorResponse = {
      status: "ERROR",
      message: "예약 후 재료가 소진되었습니다",
      errorCode: "INGREDIENTS_EXHAUSTED",
      timestamp: "2025-08-07T12:35:00.123Z",
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
      status: "ERROR",
      message: "유효하지 않은 예약입니다",
      errorCode: "INVALID_RESERVATION",
      timestamp: "2025-08-07T12:35:00.123Z",
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
});
