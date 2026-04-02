import LibcurlTransport from "/libcurl/index.mjs";

const FORCED_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const FORCED_ACCEPT_LANGUAGE = "en-US,en;q=0.9";
const FORCED_CLIENT_HINT_HEADERS = [
  ["Sec-CH-UA", '"Not.A/Brand";v="8", "Chromium";v="122", "Google Chrome";v="122"'],
  ["Sec-CH-UA-Mobile", "?0"],
  ["Sec-CH-UA-Platform", '"macOS"'],
];

function normalizeHeaders(headers) {
  if (!headers) {
    return [["User-Agent", FORCED_USER_AGENT]];
  }

  const normalized =
    typeof headers[Symbol.iterator] === "function"
      ? Array.from(headers)
      : Object.entries(headers);

  const hasHeader = (targetName) =>
    normalized.some(
      ([name]) => String(name).toLowerCase() === targetName.toLowerCase(),
    );
  const hasUserAgent = hasHeader("user-agent");
  const hasAcceptLanguage = hasHeader("accept-language");
  if (!hasUserAgent) {
    normalized.push(["User-Agent", FORCED_USER_AGENT]);
  }
  if (!hasAcceptLanguage) {
    normalized.push(["Accept-Language", FORCED_ACCEPT_LANGUAGE]);
  }
  for (const [name, value] of FORCED_CLIENT_HINT_HEADERS) {
    if (!hasHeader(name)) {
      normalized.push([name, value]);
    }
  }

  return normalized;
}

export default class NovaLibcurlTransport extends LibcurlTransport {
  async request(remote, method, body, headers, signal) {
    const response = await super.request(
      remote,
      method,
      body,
      normalizeHeaders(headers),
      signal,
    );
    return {
      ...response,
      rawHeaders: response.rawHeaders ?? response.headers ?? [],
    };
  }

  connect(
    url,
    protocols,
    requestHeaders,
    onopen,
    onmessage,
    onclose,
    onerror,
  ) {
    return super.connect(
      url,
      protocols,
      normalizeHeaders(requestHeaders),
      onopen,
      onmessage,
      onclose,
      onerror,
    );
  }
}
