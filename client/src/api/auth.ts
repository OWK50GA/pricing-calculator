import { api } from "./client";

type AuthResponse = {
  access_token:  string;
  refresh_token: string;
  token_type:    string;
  expires_in:    number;
};

export const authApi = {
  register: (body: { username: string; email: string; password: string }) =>
    api.post<AuthResponse>("/auth/register", body),

  login: (body: { email: string; password: string }) =>
    api.post<AuthResponse>("/auth/login", body),

  refresh: (refreshToken: string) =>
    api.post<AuthResponse>("/auth/refresh", { refresh_token: refreshToken }),
};
