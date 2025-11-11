import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "stream";

type ChatMessage = { role: string; content: string };
type RequestBody = {
  model?: string; // role alias
  role?: string;
  messages?: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
};

const secretsClient = new SecretsManagerClient({});
const s3Client = new S3Client({});

async function streamToString(stream: any): Promise<string> {
  if (typeof stream?.transformToString === "function") {
    return await stream.transformToString();
  }
  const readable = stream as Readable;
  const chunks: Buffer[] = [];
  for await (const chunk of readable) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf-8");
}

async function getSecretValue(secretArn: string): Promise<string> {
  const res = await secretsClient.send(new GetSecretValueCommand({ SecretId: secretArn }));
  const val = res.SecretString || (res.SecretBinary ? Buffer.from(res.SecretBinary as any).toString("utf-8") : "");
  return val;
}

async function getModelMap(bucket: string, key: string): Promise<Record<string, any>> {
  const obj = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const body = await streamToString(obj.Body as any);
  return JSON.parse(body);
}

function getCorsHeaders(origin: string | null, allowOrigins: string): Record<string, string> {
  if (!origin) return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "POST,OPTIONS" };
  const allowed = allowOrigins.split(",").map(s => s.trim());
  const ok = allowed.includes("*") || allowed.includes(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin : allowed[0] || "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "POST,OPTIONS"
  };
}

function maskPII(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[EMAIL]")
    .replace(/\b\d{2,4}-\d{2,4}-\d{3,4}\b/g, "[PHONE]")
    .replace(/\b\d{12,16}\b/g, "[NUMBER]");
}

async function callOpenAI(apiKey: string, payload: any) {
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(payload)
  });
  if (!resp.ok) throw new Error(`OpenAI error: ${resp.status} ${await resp.text()}`);
  return await resp.json();
}

async function callAnthropic(apiKey: string, payload: any) {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify(payload)
  });
  if (!resp.ok) throw new Error(`Anthropic error: ${resp.status} ${await resp.text()}`);
  return await resp.json();
}

export const handler = async (event: any) => {
  const origin = event.headers?.origin || event.headers?.Origin || null;
  const cors = getCorsHeaders(origin, process.env.ALLOW_ORIGINS || "*");

  if (event.requestContext?.http?.method === "OPTIONS") {
    return { statusCode: 204, headers: cors, body: "" };
  }

  try {
    const envName = process.env.ENV_NAME || "prod";
    const bucket = process.env.S3_BUCKET_NAME as string;
    const key = process.env.MODEL_MAP_KEY as string;
    const logMaskPII = (process.env.LOG_MASK_PII || "true") === "true";

    const body: RequestBody = JSON.parse(event.body || "{}");
    const role = body.role || body.model || "_default";
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const temperature = body.temperature ?? 0.7;
    let maxTokens = body.max_tokens ?? 2000;

    // Load model map
    const modelMap = await getModelMap(bucket, key);
    const mapping = modelMap[role] || modelMap._default;
    if (!mapping) {
      return { statusCode: 400, headers: { ...cors, "Content-Type": "application/json" }, body: JSON.stringify({ error: { message: `unknown role: ${role}` } }) };
    }

    const provider = mapping.provider as string;
    const model = mapping.model as string;

    // Secrets
    const openaiKey = await getSecretValue(process.env.OPENAI_SECRET_ARN as string).catch(() => "");
    const anthropicKey = await getSecretValue(process.env.ANTHROPIC_SECRET_ARN as string).catch(() => "");

    // Simple dynamic max_tokens safeguard
    const totalChars = messages.map(m => (m.content || "")).join("\n").length;
    const estimatedInputTokens = Math.ceil(totalChars * 0.5);
    const contextWindow = provider === "anthropic" ? 8192 : 32000;
    const safety = provider === "anthropic" ? 500 : 1000;
    const available = Math.max(1000, contextWindow - estimatedInputTokens - safety);
    if (!body.max_tokens) maxTokens = Math.min(maxTokens, available);

    // Build and call provider
    let providerResp: any;
    if (provider === "openai") {
      if (!openaiKey) throw new Error("OPENAI_API_KEY not set");
      providerResp = await callOpenAI(openaiKey, { model, messages, temperature, max_tokens: maxTokens, stream: false });
    } else if (provider === "anthropic") {
      if (!anthropicKey) throw new Error("ANTHROPIC_API_KEY not set");
      const systemMsg = messages.find(m => m.role === "system");
      const userMessages = messages.filter(m => m.role !== "system").map(m => ({ role: m.role, content: m.content }));
      providerResp = await callAnthropic(anthropicKey, { model, max_tokens: maxTokens, temperature, system: systemMsg?.content, messages: userMessages });
    } else {
      return { statusCode: 400, headers: { ...cors, "Content-Type": "application/json" }, body: JSON.stringify({ error: { message: `unsupported provider: ${provider}` } }) };
    }

    // Minimal OpenAI-compatible shaping
    const shaped = ((): any => {
      if (provider === "openai") {
        return providerResp;
      }
      // Anthropic → OpenAI-like
      const content = providerResp?.content?.[0]?.text || "";
      return {
        id: providerResp?.id || `chatcmpl-${Date.now()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [
          {
            index: 0,
            message: { role: "assistant", content },
            finish_reason: providerResp?.stop_reason || "stop"
          }
        ],
        usage: providerResp?.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
      };
    })();

    // Structured log
    const logEntry = {
      env: envName,
      role,
      provider,
      model,
      tokens_in: shaped?.usage?.prompt_tokens ?? 0,
      tokens_out: shaped?.usage?.completion_tokens ?? 0,
      status: "ok"
    };
    const promptJoined = messages.map(m => `${m.role}: ${m.content}`).join("\n");
    console.log(JSON.stringify({
      type: "ai_api_log",
      ...logEntry,
      prompt: logMaskPII ? maskPII(promptJoined) : promptJoined
    }));

    return { statusCode: 200, headers: { ...cors, "Content-Type": "application/json" }, body: JSON.stringify(shaped) };
  } catch (err: any) {
    console.error("handler_error", { message: err?.message, stack: err?.stack });
    return { statusCode: 500, headers: { "Content-Type": "application/json", ...getCorsHeaders(event.headers?.origin || null, process.env.ALLOW_ORIGINS || "*") }, body: JSON.stringify({ error: { message: "Internal server error" } }) };
  }
};


