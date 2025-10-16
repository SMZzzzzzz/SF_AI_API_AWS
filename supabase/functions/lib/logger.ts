import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { LogEntry } from "./types.ts";

export async function saveLog(
  supabaseUrl: string,
  supabaseKey: string,
  logEntry: LogEntry,
): Promise<void> {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const processString = (str: string) => decoder.decode(encoder.encode(str));

    const processedLogEntry = {
      ...logEntry,
      prompt: typeof logEntry.prompt === "string" ? processString(logEntry.prompt) : logEntry.prompt,
      user_id: typeof logEntry.user_id === "string" ? processString(logEntry.user_id) : logEntry.user_id,
      project_id: typeof logEntry.project_id === "string" ? processString(logEntry.project_id) : logEntry.project_id,
      provider: typeof logEntry.provider === "string" ? processString(logEntry.provider) : logEntry.provider,
      model: typeof logEntry.model === "string" ? processString(logEntry.model) : logEntry.model,
    };

    const { error } = await supabase.from("ai_api_logs").insert({
      user_id: processedLogEntry.user_id,
      project_id: processedLogEntry.project_id,
      provider: processedLogEntry.provider,
      model: processedLogEntry.model,
      prompt: processedLogEntry.prompt,
      response: processedLogEntry.response,
      tokens_in: processedLogEntry.tokens_in,
      tokens_out: processedLogEntry.tokens_out,
      cost_usd: processedLogEntry.cost_usd,
      meta: processedLogEntry.meta,
    });

    if (error) {
      console.error("Failed to save log:", error);
    }
  } catch (error) {
    console.error("Error saving log:", error);
  }
}
