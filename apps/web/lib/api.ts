const API_URL = process.env.API_URL ?? "http://localhost:3001";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Server-only fetch wrapper to apps/api. Every data read/write from the
 * web app goes through here — the same REST endpoints the mobile app
 * calls — so web, mobile, and any third party stay behaviorally
 * identical. Never call this from a Client Component; it has no
 * business being in the browser bundle (no CORS/browser auth handling).
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null);
    const message =
      body && typeof body === "object" && "message" in body && typeof body.message === "string"
        ? body.message
        : res.statusText;
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}
