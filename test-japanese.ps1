$body = @{
    model = "gpt-4o"
    messages = @(@{role="user"; content="日本語テストメッセージです"})
    temperature = 0.7
    max_tokens = 100
}
$jsonBody = $body | ConvertTo-Json
$headers = @{
    "Authorization" = "Bearer sbp_38f80795ae846a8543d04dfdc77a238a25adfecd"
    "Content-Type" = "application/json"
}
Invoke-WebRequest -Uri "https://ndiwsfzozeudtenshwgx.supabase.co/functions/v1/llm-proxy-openai" -Method POST -Body $jsonBody -Headers $headers


