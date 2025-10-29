-- セキュリティ修正: check_encoding関数にsearch_pathを設定
-- Function Search Path Mutable 警告の解決

-- 既存のcheck_encoding関数をセキュリティ強化版に置き換え
CREATE OR REPLACE FUNCTION public.check_encoding(text_value text) 
RETURNS jsonb 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN jsonb_build_object(
        'value', text_value,
        'length', length(text_value),
        'byte_length', octet_length(text_value),
        'encoding_check', case when text_value ~ '[^\x00-\x7F]' then 'contains_non_ascii' else 'ascii_only' end
    );
END;
$$;

-- 関数のコメントを更新
COMMENT ON FUNCTION public.check_encoding(text) IS '文字エンコーディング確認関数（セキュリティ強化版）';








