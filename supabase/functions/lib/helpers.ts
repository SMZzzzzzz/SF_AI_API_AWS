import { ErrorResponse } from "./types.ts";

export function maskPII(text: string, enabled: boolean): string {
  if (!enabled) return text;
  let masked = text;
  masked = masked.replace(
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    "[EMAIL]",
  );
  masked = masked.replace(/\b0\d{1,4}-?\d{1,4}-?\d{4}\b/g, "[PHONE]");
  masked = masked.replace(/\b\d{13,16}\b/g, "[NUMBER]");
  return masked;
}

export function createErrorResponse(
  code: string,
  message: string,
  status = 400,
  origin?: string | null,
  allowedOrigins?: string,
): Response {
  const errorResponse: ErrorResponse = { error: { code, message } };
  const headers = allowedOrigins
    ? getCorsHeaders(origin, allowedOrigins)
    : new Headers({ "Content-Type": "application/json" });
  return new Response(JSON.stringify(errorResponse), { status, headers });
}

export function getCorsHeaders(origin: string | null, allowedOrigins: string): Headers {
  const headers = new Headers({ "Content-Type": "application/json" });
  const allowed = allowedOrigins.split(",").map((o) => o.trim());
  if (origin && allowed.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  } else if (allowed.includes("*")) {
    headers.set("Access-Control-Allow-Origin", "*");
  } else {
    headers.set("Access-Control-Allow-Origin", "https://app.cursor.sh");
  }
  headers.set("Access-Control-Allow-Headers", "content-type, authorization");
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set("Access-Control-Max-Age", "86400");
  return headers;
}

export async function fetchModelMap(url: string): Promise<any> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch model_map: ${response.statusText}`);
  }
  return await response.json();
}

export function calculateCost(
  provider: string,
  model: string,
  tokensIn: number,
  tokensOut: number,
): number {
  const pricing: Record<string, { input: number; output: number }> = {
    "gpt-4o": { input: 0.0025, output: 0.01 },
    "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
    "gpt-4-turbo": { input: 0.01, output: 0.03 },
    "claude-3-5-sonnet-20240620": { input: 0.003, output: 0.015 },
    "claude-3-5-haiku": { input: 0.00025, output: 0.00125 },
    "claude-3-5-haiku-20241022": { input: 0.00025, output: 0.00125 },
  };
  const modelPricing = pricing[model] || { input: 0.001, output: 0.002 };
  const costIn = (tokensIn / 1_000_000) * modelPricing.input;
  const costOut = (tokensOut / 1_000_000) * modelPricing.output;
  return costIn + costOut;
}
