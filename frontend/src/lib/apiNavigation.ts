export function resolveApiDocsUrl(
  configuredDocsUrl: string | undefined,
  apiBaseUrl: string | undefined,
): string {
  if (configuredDocsUrl?.trim()) return configuredDocsUrl.trim();
  if (apiBaseUrl && /^https?:\/\//i.test(apiBaseUrl)) {
    return new URL("/docs", apiBaseUrl).toString();
  }
  return "/docs";
}
