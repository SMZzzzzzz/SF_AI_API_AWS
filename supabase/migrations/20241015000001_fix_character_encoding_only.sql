-- 文字コード対応の修正マイグレーション
-- PostgreSQLのデフォルトはUTF-8なので、主にCollationを設定

-- データベースの文字コード確認
SELECT datname, datcollate, datctype FROM pg_database WHERE datname = current_database();

-- テーブルの文字コード設定を確認
SELECT column_name, data_type, collation_name 
FROM information_schema.columns 
WHERE table_name = 'ai_api_logs' 
AND table_schema = 'public';

-- 必要に応じてCollationを設定（PostgreSQLはデフォルトでUTF-8）
-- コメント更新
COMMENT ON COLUMN public.ai_api_logs.prompt IS 'プロンプト（UTF-8エンコーディング、PIIマスキング済み）';

-- 文字コード確認用の関数（デバッグ用）
CREATE OR REPLACE FUNCTION check_encoding(text_value text) 
RETURNS jsonb AS $$
BEGIN
    RETURN jsonb_build_object(
        'value', text_value,
        'length', length(text_value),
        'byte_length', octet_length(text_value),
        'encoding_check', case when text_value ~ '[^\x00-\x7F]' then 'contains_non_ascii' else 'ascii_only' end
    );
END;
$$ LANGUAGE plpgsql;
