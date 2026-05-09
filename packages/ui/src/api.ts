const BASE = import.meta.env.VITE_API_URL ?? "";

export function apiUrl(path: string) {
  return `${BASE}${path}`;
}
