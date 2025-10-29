import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  console.log("=== Environment Check ===");
  
  const envVars = {
    OPENAI_API_KEY: !!Deno.env.get("OPENAI_API_KEY"),
    ANTHROPIC_API_KEY: !!Deno.env.get("ANTHROPIC_API_KEY"),
    SUPABASE_URL: !!Deno.env.get("SUPABASE_URL"),
    SUPABASE_ANON_KEY: !!Deno.env.get("SUPABASE_ANON_KEY"),
    MODEL_MAP_URL: Deno.env.get("MODEL_MAP_URL") || "NOT_SET",
    LOG_MASK_PII: Deno.env.get("LOG_MASK_PII") || "NOT_SET",
    RATE_LIMIT_QPM: Deno.env.get("RATE_LIMIT_QPM") || "NOT_SET",
    ALLOW_ORIGINS: Deno.env.get("ALLOW_ORIGINS") || "NOT_SET"
  };
  
  console.log("Environment variables:", envVars);
  
  return new Response(JSON.stringify({
    status: "ok",
    environment: envVars,
    timestamp: new Date().toISOString()
  }), {
    headers: { "Content-Type": "application/json" },
  });
});








