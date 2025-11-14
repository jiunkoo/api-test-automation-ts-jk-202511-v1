import type { AxiosError } from "axios";

type MockFunction = {
  mockResolvedValueOnce: (value: any) => void;
  mockResolvedValue: (value: any) => void;
  mockRejectedValueOnce: (value: any) => void;
};

// Mock 설정 헬퍼 함수
export const mockSuccess = (
  mockFn: MockFunction,
  data: any,
  multiple = false
) => {
  const response = {
    status: 200,
    statusText: "OK",
    data,
  };
  if (multiple) {
    mockFn.mockResolvedValue(response);
  } else {
    mockFn.mockResolvedValueOnce(response);
  }
};

export const mockError = (
  mockFn: MockFunction,
  status: number,
  data: any,
  options?: {
    headers?: Record<string, string>;
    code?: string;
    message?: string;
  }
) => {
  const error: any = {
    isAxiosError: true,
    response: {
      status,
      data,
      ...(options?.headers && { headers: options.headers }),
    },
  };
  if (options?.code) error.code = options.code;
  if (options?.message) error.message = options.message;
  mockFn.mockRejectedValueOnce(error as AxiosError);
};

export const mockNetworkError = (
  mockFn: MockFunction,
  code: string,
  message: string
) => {
  mockFn.mockRejectedValueOnce({
    code,
    message,
    isAxiosError: true,
  } as AxiosError);
};
