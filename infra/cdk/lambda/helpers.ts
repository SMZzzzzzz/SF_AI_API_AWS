import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { APIGatewayProxyResultV2 } from 'aws-lambda';
import { TextDecoder } from 'util';
import { ModelMap } from './types';

const s3Client = new S3Client({});

interface ModelMapCache {
  value?: ModelMap;
  expiresAt?: number;
}

const modelMapCache: ModelMapCache = {};

const textDecoder = new TextDecoder();

export function maskPII(text: string, enabled: boolean): string {
  if (!enabled) {
    return text;
  }

  return text
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]')
    .replace(/\b0\d{1,4}-?\d{1,4}-?\d{4}\b/g, '[PHONE]')
    .replace(/\b\d{13,16}\b/g, '[NUMBER]');
}

export function buildCorsHeaders(
  origin: string | undefined,
  allowedOrigins: string[],
): Record<string, string> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'access-control-allow-headers': 'content-type,authorization',
    'access-control-allow-methods': 'POST,OPTIONS',
    'access-control-max-age': '86400',
  };

  if (!origin && allowedOrigins.includes('*')) {
    headers['access-control-allow-origin'] = '*';
    return headers;
  }

  if (origin && allowedOrigins.includes(origin)) {
    headers['access-control-allow-origin'] = origin;
  } else if (allowedOrigins.includes('*')) {
    headers['access-control-allow-origin'] = '*';
  } else {
    headers['access-control-allow-origin'] = 'https://app.cursor.sh';
  }

  return headers;
}

export function createErrorResponse(
  statusCode: number,
  code: string,
  message: string,
  origin: string | undefined,
  allowedOrigins: string[],
): APIGatewayProxyResultV2 {
  const headers = buildCorsHeaders(origin, allowedOrigins);

  return {
    statusCode,
    headers,
    body: JSON.stringify({
      error: {
        code,
        message,
      },
    }),
  };
}

export async function loadModelMap(
  bucket: string,
  key: string,
  cacheTtlMs = 60_000,
): Promise<ModelMap> {
  const now = Date.now();
  if (modelMapCache.value && modelMapCache.expiresAt && modelMapCache.expiresAt > now) {
    return modelMapCache.value;
  }

  const result = await s3Client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );

  if (!result.Body) {
    throw new Error('Model map object has no body');
  }

  const body = await streamToString(result.Body);
  const modelMap = JSON.parse(body) as ModelMap;

  modelMapCache.value = modelMap;
  modelMapCache.expiresAt = now + cacheTtlMs;

  return modelMap;
}

async function streamToString(body: unknown): Promise<string> {
  if (!body) {
    return '';
  }

  if (typeof body === 'string') {
    return body;
  }

  if (body instanceof Uint8Array) {
    return textDecoder.decode(body);
  }

  if (body instanceof Readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString('utf-8');
  }

  if (typeof (body as any).transformToString === 'function') {
    return (body as { transformToString: (encoding: string) => Promise<string> }).transformToString(
      'utf-8',
    );
  }

  if (Symbol.asyncIterator in (body as any)) {
    const chunks: Buffer[] = [];
    for await (const chunk of body as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString('utf-8');
  }

  return String(body);
}

export function calculateCost(provider: string, model: string, tokensIn: number, tokensOut: number): number {
  const pricing: Record<string, { input: number; output: number }> = {
    'gpt-4o': { input: 0.0025, output: 0.01 },
    'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
    'gpt-4-turbo': { input: 0.01, output: 0.03 },
    'claude-3-5-sonnet-20240620': { input: 0.003, output: 0.015 },
    'claude-3-5-haiku': { input: 0.00025, output: 0.00125 },
    'claude-3-5-haiku-20241022': { input: 0.00025, output: 0.00125 },
  };

  const { input, output } = pricing[model] ?? { input: 0.001, output: 0.002 };

  const costIn = (tokensIn / 1_000_000) * input;
  const costOut = (tokensOut / 1_000_000) * output;

  return costIn + costOut;
}

type GetObjectCommandOutput = Awaited<ReturnType<typeof s3Client.send>> extends infer R
  ? R extends { Body?: unknown }
    ? R
    : never
  : never;

