'use strict';

const crypto = require('crypto');
const https = require('https');

// Lazy import AWS SDK v3 only when needed (to minimize cold start)
let SecretsClient, GetSecretValueCommand;
async function getAwsSecretsClient() {
  if (!SecretsClient) {
    const sdk = await import('@aws-sdk/client-secrets-manager');
    SecretsClient = sdk.SecretsManagerClient;
    GetSecretValueCommand = sdk.GetSecretValueCommand;
  }
  return { SecretsClient, GetSecretValueCommand };
}

function parseAllowedOrigins(envValue) {
  if (!envValue || envValue.trim() === '') return ['*'];
  return envValue.split(',').map(s => s.trim()).filter(Boolean);
}

function getCorsHeaders(origin, allowedOrigins) {
  const allowAll = allowedOrigins.includes('*');
  const allowed = allowAll || (origin && allowedOrigins.includes(origin));
  return {
    'Access-Control-Allow-Origin': allowed ? (allowAll ? '*' : origin) : allowedOrigins[0] || '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'POST,OPTIONS'
  };
}

async function getSecretValue(secretArn) {
  const { SecretsClient, GetSecretValueCommand } = await getAwsSecretsClient();
  const client = new SecretsClient({});
  const resp = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
  if (resp.SecretString) return resp.SecretString;
  if (resp.SecretBinary) return Buffer.from(resp.SecretBinary, 'base64').toString('utf8');
  return '';
}

async function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, res => {
        let data = '';
        res.on('data', chunk => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Failed to parse JSON from ${url}: ${e.message}`));
          }
        });
      })
      .on('error', reject);
  });
}

function maskPII(text) {
  if (!text) return text;
  let masked = text;
  // Simple masks: email, phone-like, long numbers
  masked = masked.replace(/[\w.+-]+@[\w.-]+/g, '[EMAIL]');
  masked = masked.replace(/\b\d{2,4}[- ]?\d{2,4}[- ]?\d{3,4}\b/g, '[PHONE]');
  masked = masked.replace(/\b\d{12,16}\b/g, '[NUMBER]');
  return masked;
}

function estimateTokensFromChars(text) {
  if (!text) return 0;
  // JP簡易: 1文字≈0.5トークン
  return Math.ceil(text.length * 0.5);
}

function buildOpenAIResponseSkeleton(provider, model) {
  const created = Math.floor(Date.now() / 1000);
  return {
    id: `chatcmpl-${crypto.randomBytes(8).toString('hex')}`,
    object: 'chat.completion',
    created,
    model: model || 'gpt-4o',
    choices: [],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    provider
  };
}

async function callOpenAI(apiKey, payload) {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(`OpenAI error ${resp.status}: ${JSON.stringify(json)}`);
  return json;
}

async function callAnthropic(apiKey, payload) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(payload)
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(`Anthropic error ${resp.status}: ${JSON.stringify(json)}`);
  return json;
}

function toOpenAIChoiceFromAnthropic(anthropicMessage) {
  const content = anthropicMessage?.content?.map?.(c => c.text || '').join('') || '';
  return {
    index: 0,
    message: { role: 'assistant', content },
    finish_reason: 'stop'
  };
}

exports.lambdaHandler = async (event) => {
  const allowedOrigins = parseAllowedOrigins(process.env.ALLOW_ORIGINS || '*');
  const origin = event.headers?.origin || event.headers?.Origin || '';

  if (event.requestContext?.http?.method === 'OPTIONS') {
    return { statusCode: 204, headers: getCorsHeaders(origin, allowedOrigins) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const role = body.role || body.model; // Allow alias "model" like Supabase version
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const temperature = body.temperature ?? 0.7;
    const userMaxTokens = body.max_tokens;

    // 1) Load model map
    const modelMapUrl = process.env.MODEL_MAP_URL;
    const modelMap = await fetchJson(modelMapUrl);
    const modelConfig = modelMap[role] || modelMap._default;
    if (!modelConfig) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin, allowedOrigins) },
        body: JSON.stringify({ error: { message: `Unknown role/model: ${role}` } })
      };
    }

    const provider = modelConfig.provider;
    const model = modelConfig.model;

    // 2) max_tokens heuristic (simple)
    const joined = messages.map(m => (m.content || '')).join('\n');
    const estTokensIn = estimateTokensFromChars(joined);
    let maxTokens = Number(userMaxTokens || 2000);
    if (provider === 'openai' && model?.includes('gpt-5')) {
      maxTokens = Math.max(maxTokens, 4000);
    } else {
      maxTokens = Math.max(maxTokens, 1000);
    }

    // 3) Secrets
    const secretsClient = await getAwsSecretsClient();
    const openAiKey = process.env.OPENAI_SECRET_ARN ? await getSecretValue(process.env.OPENAI_SECRET_ARN) : '';
    const anthropicKey = process.env.ANTHROPIC_SECRET_ARN ? await getSecretValue(process.env.ANTHROPIC_SECRET_ARN) : '';

    // 4) Invoke provider
    let providerResp;
    let openAiLike = buildOpenAIResponseSkeleton(provider, model);

    if (provider === 'openai') {
      providerResp = await callOpenAI(openAiKey, { model, messages, temperature, max_tokens: maxTokens, stream: false });
      openAiLike = {
        ...openAiLike,
        id: providerResp.id || openAiLike.id,
        created: providerResp.created || openAiLike.created,
        model: providerResp.model || model,
        choices: providerResp.choices || [],
        usage: providerResp.usage || openAiLike.usage
      };
    } else if (provider === 'anthropic') {
      providerResp = await callAnthropic(anthropicKey, { model, messages, temperature, max_tokens: maxTokens });
      const choice = toOpenAIChoiceFromAnthropic(providerResp);
      openAiLike.choices = [choice];
      // Rough usage mapping if available
      if (providerResp.usage) {
        const prompt = providerResp.usage.input_tokens || 0;
        const completion = providerResp.usage.output_tokens || 0;
        openAiLike.usage = { prompt_tokens: prompt, completion_tokens: completion, total_tokens: prompt + completion };
      }
    } else {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin, allowedOrigins) },
        body: JSON.stringify({ error: { message: `Unsupported provider: ${provider}` } })
      };
    }

    // 5) Structured log to CloudWatch
    try {
      const mask = (process.env.LOG_MASK_PII || 'true') === 'true';
      const maskedPrompt = mask ? maskPII(joined) : joined;
      console.log(JSON.stringify({
        level: 'info',
        msg: 'llm_proxy_request',
        role,
        provider,
        model,
        temperature,
        max_tokens: maxTokens,
        prompt_preview: maskedPrompt.substring(0, 200),
        usage: openAiLike.usage,
        requestId: event.requestContext?.requestId
      }));
    } catch {}

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin, allowedOrigins) },
      body: JSON.stringify(openAiLike)
    };
  } catch (err) {
    console.error('handler_error', err);
    const allowedOrigins = parseAllowedOrigins(process.env.ALLOW_ORIGINS || '*');
    const origin = event.headers?.origin || event.headers?.Origin || '';
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin, allowedOrigins) },
      body: JSON.stringify({ error: { message: `Internal server error: ${err.message}` } })
    };
  }
};


