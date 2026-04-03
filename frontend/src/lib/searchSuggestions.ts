import { resolveApiUrl } from "@/lib/api";

export async function fetchSearchSuggestions(query: string) {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 4000);

  try {
    const response = await fetch(
      resolveApiUrl(`/api/search/suggestions?q=${encodeURIComponent(trimmed)}`),
      {
        credentials: "include",
        signal: controller.signal,
      },
    );
    if (!response.ok) {
      return [];
    }
    const payload = (await response.json()) as { suggestions?: unknown };
    if (!Array.isArray(payload.suggestions)) {
      return [];
    }
    return payload.suggestions
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 6);
  } catch {
    return [];
  } finally {
    window.clearTimeout(timeout);
  }
}
