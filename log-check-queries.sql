-- Supabase ai_api_logs テーブルから最新の3件を取得するSQL

-- 最新の3件を取得（タイムスタンプ降順）
SELECT 
    ts,
    user_id,
    provider,
    model,
    prompt,
    response,
    tokens_in,
    tokens_out,
    cost_usd
FROM ai_api_logs 
ORDER BY ts DESC 
LIMIT 3;

-- より詳細な情報を含む場合
SELECT 
    ts,
    user_id,
    provider,
    model,
    LEFT(prompt, 100) as prompt_preview,
    CASE 
        WHEN response IS NOT NULL THEN 
            response->'choices'->0->'message'->>'content'
        ELSE 'No response'
    END as response_content,
    tokens_in,
    tokens_out,
    cost_usd
FROM ai_api_logs 
ORDER BY ts DESC 
LIMIT 3;

-- 特定の時間範囲での検索（過去1時間）
SELECT 
    ts,
    user_id,
    provider,
    model,
    prompt,
    response->'choices'->0->'message'->>'content' as response_content,
    tokens_in,
    tokens_out
FROM ai_api_logs 
WHERE ts >= NOW() - INTERVAL '1 hour'
ORDER BY ts DESC;

-- テストメッセージのみを検索
SELECT 
    ts,
    user_id,
    provider,
    model,
    prompt,
    response->'choices'->0->'message'->>'content' as response_content
FROM ai_api_logs 
WHERE prompt LIKE '%テスト%'
ORDER BY ts DESC;








