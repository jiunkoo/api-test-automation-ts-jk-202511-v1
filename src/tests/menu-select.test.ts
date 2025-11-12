import "dotenv/config";
import axios from "axios";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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

describe("POST /api/v1/menu/select", () => {
  it("[200][성공] 메뉴 예약 완료", async () => {
    // given
    const payload = {
      menuId: "menu_001",
      quantity: 2,
      shopId: "shop_001",
      memberNo: "member_123",
    };
    const headers = {
      "Content-Type": "application/json;charset=UTF-8",
      Authorization: `Bearer ${accessToken}`,
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
    mockedAxios.post.mockResolvedValueOnce(successResponse);

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
    expect(response).toEqual(successResponse);
  });

  it("[400][실패] 재료 부족", async () => {
    // given
    const payload = {
      menuId: "menu_001",
      quantity: 2,
      shopId: "shop_001",
      memberNo: "member_123",
    };
    const headers = {
      "Content-Type": "application/json;charset=UTF-8",
      Authorization: `Bearer ${accessToken}`,
    };
    const errorResponse = {
      status: "ERROR",
      message: "주문하신 수량만큼 재료가 부족합니다",
      errorCode: "INSUFFICIENT_INGREDIENTS",
      timestamp: "2025-08-07T12:30:00.123Z",
    };
    mockedAxios.post.mockResolvedValueOnce(errorResponse);

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
    expect(response).toEqual(errorResponse);
  });

  it("[400][실패] 잘못된 요청 - 필수값(menuId) 누락", async () => {
    // given
    const payload = {
      quantity: 2,
      shopId: "shop_001",
      memberNo: "member_123",
    };
    const headers = {
      "Content-Type": "application/json;charset=UTF-8",
      Authorization: `Bearer ${accessToken}`,
    };
    const errorResponse = {
      status: "ERROR",
      message: "요청 정보가 올바르지 않습니다",
      errorCode: "INVALID_REQUEST",
      timestamp: "2025-08-07T12:30:00.123Z",
    };
    mockedAxios.post.mockResolvedValueOnce(errorResponse);

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
    expect(response).toEqual(errorResponse);
  });

  it("[400][실패] 잘못된 요청 - 필수값(quantity) 누락", async () => {
    // given
    const payload = {
      menuId: "menu_001",
      shopId: "shop_001",
      memberNo: "member_123",
    };
    const headers = {
      "Content-Type": "application/json;charset=UTF-8",
      Authorization: `Bearer ${accessToken}`,
    };
    const errorResponse = {
      status: "ERROR",
      message: "요청 정보가 올바르지 않습니다",
      errorCode: "INVALID_REQUEST",
      timestamp: "2025-08-07T12:30:00.123Z",
    };
    mockedAxios.post.mockResolvedValueOnce(errorResponse);

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
    expect(response).toEqual(errorResponse);
  });

  it("[400][실패] 잘못된 요청 - 최소 주문 수량 미달", async () => {
    // given
    const payload = {
      menuId: "menu_001",
      quantity: 0,
      shopId: "shop_001",
      memberNo: "member_123",
    };
    const headers = {
      "Content-Type": "application/json;charset=UTF-8",
      Authorization: `Bearer ${accessToken}`,
    };
    const errorResponse = {
      status: "ERROR",
      message: "요청 정보가 올바르지 않습니다",
      errorCode: "INVALID_REQUEST",
      timestamp: "2025-08-07T12:30:00.123Z",
    };
    mockedAxios.post.mockResolvedValueOnce(errorResponse);

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
    expect(response).toEqual(errorResponse);
  });

  it("[400][실패] 잘못된 요청 - 최대 주문 수량 초과", async () => {
    // given
    const payload = {
      menuId: "menu_001",
      quantity: 100,
      shopId: "shop_001",
      memberNo: "member_123",
    };
    const headers = {
      "Content-Type": "application/json;charset=UTF-8",
      Authorization: `Bearer ${accessToken}`,
    };
    const errorResponse = {
      status: "ERROR",
      message: "요청 정보가 올바르지 않습니다",
      errorCode: "INVALID_REQUEST",
      timestamp: "2025-08-07T12:30:00.123Z",
    };
    mockedAxios.post.mockResolvedValueOnce(errorResponse);

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
    expect(response).toEqual(errorResponse);
  });

  it("[400][실패] 잘못된 요청 - 필수값(shopId) 누락", async () => {
    // given
    const payload = {
      menuId: "menu_001",
      quantity: 2,
      memberNo: "member_123",
    };
    const headers = {
      "Content-Type": "application/json;charset=UTF-8",
      Authorization: `Bearer ${accessToken}`,
    };
    const errorResponse = {
      status: "ERROR",
      message: "요청 정보가 올바르지 않습니다",
      errorCode: "INVALID_REQUEST",
      timestamp: "2025-08-07T12:30:00.123Z",
    };
    mockedAxios.post.mockResolvedValueOnce(errorResponse);

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
    expect(response).toEqual(errorResponse);
  });

  it("[400][실패] 잘못된 요청 - 필수값(memberId) 누락", async () => {
    // given
    const payload = {
      menuId: "menu_001",
      quantity: 2,
      shopId: "shop_001",
    };
    const headers = {
      "Content-Type": "application/json;charset=UTF-8",
      Authorization: `Bearer ${accessToken}`,
    };
    const errorResponse = {
      status: "ERROR",
      message: "요청 정보가 올바르지 않습니다",
      errorCode: "INVALID_REQUEST",
      timestamp: "2025-08-07T12:30:00.123Z",
    };
    mockedAxios.post.mockResolvedValueOnce(errorResponse);

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
    expect(response).toEqual(errorResponse);
  });

  it("[400][실패] 존재하지 않는 메뉴", async () => {
    // given
    const payload = {
      menuId: "unknown_menu_id",
      quantity: 2,
      shopId: "shop_001",
      memberNo: "member_123",
    };
    const headers = {
      "Content-Type": "application/json;charset=UTF-8",
      Authorization: `Bearer ${accessToken}`,
    };
    const errorResponse = {
      status: "ERROR",
      message: "존재하지 않는 메뉴입니다",
      errorCode: "MENU_NOT_FOUND",
      timestamp: "2025-08-07T12:30:00.123Z",
    };
    mockedAxios.post.mockResolvedValueOnce(errorResponse);

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
    expect(response).toEqual(errorResponse);
  });
});
