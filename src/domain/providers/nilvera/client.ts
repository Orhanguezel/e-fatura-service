import axios, { type AxiosRequestConfig, type AxiosResponse } from "axios";

export type NilveraHttpClient = {
  get: <T>(
    url: string,
    config?: AxiosRequestConfig
  ) => Promise<Pick<AxiosResponse<T>, "data">>;
  post: <T>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ) => Promise<Pick<AxiosResponse<T>, "data">>;
};
export type NilveraClientFactory = (
  apiKey: string,
  baseUrl: string
) => NilveraHttpClient;

export function normalizeNilveraBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  return trimmed.endsWith("/earchive") ? trimmed : `${trimmed}/earchive`;
}

export function createNilveraClient(
  apiKey: string,
  baseUrl: string
): NilveraHttpClient {
  return axios.create({
    baseURL: normalizeNilveraBaseUrl(baseUrl),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    timeout: 60_000
  });
}
