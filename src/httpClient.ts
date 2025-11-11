import axios, { type AxiosInstance, type AxiosRequestConfig } from "axios";

export interface HttpClientConfig {
  baseURL: string;
  defaultHeaders?: Record<string, string>;
  timeoutMs?: number;
}

export type RequestExecutor = Pick<AxiosInstance, "request">;

export const createHttpClient = ({
  baseURL,
  defaultHeaders,
  timeoutMs,
}: HttpClientConfig): AxiosInstance =>
  axios.create({
    baseURL,
    timeout: timeoutMs ?? 10_000,
    headers: defaultHeaders,
  });

export const sendRequest = async <T>(
  client: RequestExecutor,
  requestConfig: AxiosRequestConfig
): Promise<T> => {
  const response = await client.request<T>(requestConfig);
  return response.data;
};
