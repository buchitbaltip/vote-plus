import type {
  ApiError,
  AuthResponse,
  AuthUser,
  Candidate,
  MyVote,
  ResultsPayload,
} from "./types";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

const TOKEN_KEY = "vote-plus.token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode etc. — session just won't persist */
  }
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(
  path: string,
  init: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  if (init.auth) {
    const token = getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as ApiError;
      message = Array.isArray(body.message)
        ? body.message.join(", ")
        : body.message;
    } catch {
      /* non-JSON error body */
    }
    throw new HttpError(res.status, message);
  }
  // Nest sends an empty body for `null` results (e.g. GET /votes/me before voting)
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

// ---- auth ----
export const register = (username: string, password: string) =>
  request<AuthResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });

export const login = (username: string, password: string) =>
  request<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });

export const me = () => request<AuthUser>("/auth/me", { auth: true });

// ---- ballot ----
export const getCandidates = () => request<Candidate[]>("/candidates");

export const castVote = (candidateId: number) =>
  request<MyVote>("/votes", {
    method: "POST",
    auth: true,
    body: JSON.stringify({ candidateId }),
  });

export const getMyVote = () =>
  request<MyVote | null>("/votes/me", { auth: true });

// ---- results ----
export const getResults = () => request<ResultsPayload>("/votes/results");

export const RESULTS_STREAM_URL = `${API_URL}/votes/stream`;
