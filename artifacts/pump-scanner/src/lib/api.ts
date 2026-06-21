/**
 * Returns the base URL for all API calls.
 *
 * - On Render (single service): relative "" — Express serves both frontend + API
 * - On Render (separate API service): VITE_API_URL="https://pumpradar-api.onrender.com"
 * - On Replit dev: BASE_URL prefix e.g. "/" (routes through reverse proxy)
 */
export function getApiBase(): string {
  const apiUrl = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  if (apiUrl) return apiUrl.replace(/\/$/, "");
  return (import.meta.env.BASE_URL as string)?.replace(/\/$/, "") ?? "";
}
