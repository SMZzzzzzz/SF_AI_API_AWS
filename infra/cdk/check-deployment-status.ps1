# AWS CDK デプロイメント状況確認スクリプト
# PowerShell版

Write-Host "AWS CDK Deployment Status Check" -ForegroundColor Green
Write-Host "===============================" -ForegroundColor Green
Write-Host ""

# 環境変数の確認
$CDK_REGION = $env:CDK_DEFAULT_REGION ?? "ap-northeast-1"
$STACK_NAME = "SfAiProdStack"

Write-Host "確認対象:" -ForegroundColor Yellow
Write-Host "  スタック名: $STACK_NAME" -ForegroundColor Cyan
Write-Host "  リージョン: $CDK_REGION" -ForegroundColor Cyan
Write-Host ""

# CloudFormationスタックの確認
Write-Host "1. CloudFormationスタックの確認..." -ForegroundColor Yellow
try {
    $STACK_INFO = aws cloudformation describe-stacks `
        --stack-name $STACK_NAME `
        --region $CDK_REGION `
        --output json 2>$null | ConvertFrom-Json
    
    if ($STACK_INFO) {
        $STACK_STATUS = $STACK_INFO.Stacks[0].StackStatus
        Write-Host "  ✓ スタック存在: $STACK_STATUS" -ForegroundColor Green
        
        # 出力値を取得
        $OUTPUTS = $STACK_INFO.Stacks[0].Outputs
        Write-Host ""
        Write-Host "  出力値:" -ForegroundColor Cyan
        foreach ($output in $OUTPUTS) {
            Write-Host "    $($output.OutputKey): $($output.OutputValue)" -ForegroundColor White
        }
    } else {
        Write-Host "  ✗ スタックが見つかりません（未デプロイ）" -ForegroundColor Red
    }
} catch {
    Write-Host "  ✗ スタックが見つかりません（未デプロイ）" -ForegroundColor Red
    Write-Host "    エラー: $_" -ForegroundColor Gray
}
Write-Host ""

# Lambda関数の確認
Write-Host "2. Lambda関数の確認..." -ForegroundColor Yellow
try {
    $LAMBDA_FUNCTIONS = aws lambda list-functions `
        --region $CDK_REGION `
        --output json 2>$null | ConvertFrom-Json
    
    $CHAT_LAMBDA = $LAMBDA_FUNCTIONS.Functions | Where-Object { $_.FunctionName -like "*ChatCompletionsFunction*" }
    
    if ($CHAT_LAMBDA) {
        Write-Host "  ✓ Lambda関数が見つかりました: $($CHAT_LAMBDA.FunctionName)" -ForegroundColor Green
        Write-Host "    ランタイム: $($CHAT_LAMBDA.Runtime)" -ForegroundColor White
        Write-Host "    メモリ: $($CHAT_LAMBDA.MemorySize) MB" -ForegroundColor White
        Write-Host "    タイムアウト: $($CHAT_LAMBDA.Timeout) 秒" -ForegroundColor White
        
        # Lambda Function URLの確認
        try {
            $FUNCTION_URL_CONFIG = aws lambda get-function-url-config `
                --function-name $CHAT_LAMBDA.FunctionName `
                --region $CDK_REGION `
                --output json 2>$null | ConvertFrom-Json
            
            if ($FUNCTION_URL_CONFIG) {
                Write-Host ""
                Write-Host "    Lambda Function URL:" -ForegroundColor Cyan
                Write-Host "      URL: $($FUNCTION_URL_CONFIG.FunctionUrl)" -ForegroundColor White
                Write-Host "      Invoke Mode: $($FUNCTION_URL_CONFIG.InvokeMode)" -ForegroundColor White
                
                if ($FUNCTION_URL_CONFIG.InvokeMode -ne "RESPONSE_STREAM") {
                    Write-Host "      ⚠ 警告: Invoke ModeがRESPONSE_STREAMになっていません" -ForegroundColor Yellow
                    Write-Host "        ストリーミング対応にするには以下のコマンドを実行:" -ForegroundColor Yellow
                    Write-Host "        aws lambda update-function-url-config --function-name $($CHAT_LAMBDA.FunctionName) --invoke-mode RESPONSE_STREAM --region $CDK_REGION" -ForegroundColor Gray
                } else {
                    Write-Host "      ✓ ストリーミング対応済み" -ForegroundColor Green
                }
            }
        } catch {
            Write-Host "    ⚠ Lambda Function URLの設定が見つかりません" -ForegroundColor Yellow
        }
    } else {
        Write-Host "  ✗ Lambda関数が見つかりません" -ForegroundColor Red
    }
} catch {
    Write-Host "  ✗ Lambda関数の確認に失敗しました" -ForegroundColor Red
    Write-Host "    エラー: $_" -ForegroundColor Gray
}
Write-Host ""

# S3バケットの確認
Write-Host "3. S3バケットの確認..." -ForegroundColor Yellow
try {
    $BUCKETS = aws s3api list-buckets `
        --region $CDK_REGION `
        --output json 2>$null | ConvertFrom-Json
    
    $CONFIG_BUCKET = $BUCKETS.Buckets | Where-Object { $_.Name -like "*sfai*config*" }
    $AUDIT_BUCKET = $BUCKETS.Buckets | Where-Object { $_.Name -like "*sfai*audit*" }
    
    if ($CONFIG_BUCKET) {
        Write-Host "  ✓ 設定バケット: $($CONFIG_BUCKET.Name)" -ForegroundColor Green
        
        # model_map.jsonの確認
        try {
            $MODEL_MAP_EXISTS = aws s3 ls "s3://$($CONFIG_BUCKET.Name)/config/model_map.json" --region $CDK_REGION 2>$null
            if ($MODEL_MAP_EXISTS) {
                Write-Host "    ✓ model_map.jsonが存在します" -ForegroundColor Green
            } else {
                Write-Host "    ⚠ model_map.jsonが見つかりません" -ForegroundColor Yellow
                Write-Host "      アップロードが必要です" -ForegroundColor Yellow
            }
        } catch {
            Write-Host "    ⚠ model_map.jsonが見つかりません" -ForegroundColor Yellow
        }
    } else {
        Write-Host "  ✗ 設定バケットが見つかりません" -ForegroundColor Red
    }
    
    if ($AUDIT_BUCKET) {
        Write-Host "  ✓ 監査ログバケット: $($AUDIT_BUCKET.Name)" -ForegroundColor Green
    } else {
        Write-Host "  ✗ 監査ログバケットが見つかりません" -ForegroundColor Red
    }
} catch {
    Write-Host "  ✗ S3バケットの確認に失敗しました" -ForegroundColor Red
    Write-Host "    エラー: $_" -ForegroundColor Gray
}
Write-Host ""

# Secrets Managerの確認
Write-Host "4. Secrets Managerの確認..." -ForegroundColor Yellow
$SECRETS = @("/sfai/prod/OPENAI_API_KEY", "/sfai/prod/ANTHROPIC_API_KEY")

foreach ($SECRET_NAME in $SECRETS) {
    try {
        $SECRET_INFO = aws secretsmanager describe-secret `
            --secret-id $SECRET_NAME `
            --region $CDK_REGION `
            --output json 2>$null | ConvertFrom-Json
        
        if ($SECRET_INFO) {
            Write-Host "  ✓ $SECRET_NAME が存在します" -ForegroundColor Green
            
            # シークレット値の有無を確認（値は表示しない）
            $SECRET_VALUE = aws secretsmanager get-secret-value `
                --secret-id $SECRET_NAME `
                --region $CDK_REGION `
                --query 'SecretString' `
                --output text 2>$null
            
            if ($SECRET_VALUE -and $SECRET_VALUE -ne "None") {
                Write-Host "    ✓ シークレット値が設定されています" -ForegroundColor Green
            } else {
                Write-Host "    ⚠ シークレット値が設定されていません" -ForegroundColor Yellow
            }
        } else {
            Write-Host "  ✗ $SECRET_NAME が見つかりません" -ForegroundColor Red
        }
    } catch {
        Write-Host "  ✗ $SECRET_NAME が見つかりません" -ForegroundColor Red
    }
}
Write-Host ""

# まとめ
Write-Host "===============================" -ForegroundColor Green
Write-Host "確認完了" -ForegroundColor Green
Write-Host ""
Write-Host "次のステップ:" -ForegroundColor Yellow
Write-Host "  デプロイが完了している場合:" -ForegroundColor White
Write-Host "    - model_map.jsonをS3にアップロード" -ForegroundColor White
Write-Host "    - Lambda Function URLをストリーミング対応にする" -ForegroundColor White
Write-Host ""
Write-Host "  デプロイが未完了の場合:" -ForegroundColor White
Write-Host "    - .\deploy.ps1 を実行してデプロイ" -ForegroundColor White
Write-Host ""




