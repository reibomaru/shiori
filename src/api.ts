// API クライアント。Vite の proxy 経由で /api を叩きます。
import type { TripPayload } from "./types";

async function http<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  getTrip: () => http<TripPayload>("/api/trip", "GET"),

  updateTrip: (patch: Record<string, unknown>) => http("/api/trip", "PUT", patch),

  updateItem: (id: number, patch: Record<string, unknown>) => http(`/api/items/${id}`, "PUT", patch),
  createItem: (body: Record<string, unknown>) => http(`/api/items`, "POST", body),
  deleteItem: (id: number) => http(`/api/items/${id}`, "DELETE"),

  updateBudget: (id: number, patch: Record<string, unknown>) => http(`/api/budget/${id}`, "PUT", patch),
  createBudget: (body: Record<string, unknown>) => http(`/api/budget`, "POST", body),
  deleteBudget: (id: number) => http(`/api/budget/${id}`, "DELETE"),

  updateSpot: (id: number, patch: Record<string, unknown>) => http(`/api/spots/${id}`, "PUT", patch),
  deleteSpot: (id: number) => http(`/api/spots/${id}`, "DELETE"),

  updateRoute: (id: number, patch: Record<string, unknown>) => http(`/api/route/${id}`, "PUT", patch),
};
