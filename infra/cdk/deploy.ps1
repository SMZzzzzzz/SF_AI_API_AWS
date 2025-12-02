# AWS CDK デプロイスクリプト
# PowerShell版

Write-Host "AWS CDK Deployment Script" -ForegroundColor Green
Write-Host "=========================" -ForegroundColor Green
Write-Host ""

# 現在のディレクトリを確認
$CURRENT_DIR = Get-Location
if (-not (Test-Path "package.json")) {
    Write-Host "エラー: package.jsonが見つかりません。infra/cdkディレクトリで実行してください。" -ForegroundColor Red
    exit 1
}

# 環境変数の確認
Write-Host "1. 環境変数の確認..." -ForegroundColor Yellow
$CDK_ACCOUNT = $env:CDK_DEFAULT_ACCOUNT
$CDK_REGION = $env:CDK_DEFAULT_REGION ?? "ap-northeast-1"

if (-not $CDK_ACCOUNT) {
    Write-Host "警告: CDK_DEFAULT_ACCOUNTが設定されていません。" -ForegroundColor Yellow
    Write-Host "AWS CLIからアカウントIDを取得します..." -ForegroundColor Yellow
    try {
        $CDK_ACCOUNT = (aws sts get-caller-identity --query Account --output text 2>$null)
        if ($CDK_ACCOUNT) {
            $env:CDK_DEFAULT_ACCOUNT = $CDK_ACCOUNT
            Write-Host "アカウントID: $CDK_ACCOUNT" -ForegroundColor Green
        } else {
            Write-Host "エラー: AWS CLIでアカウントIDを取得できませんでした。" -ForegroundColor Red
            Write-Host "aws configure を実行してAWS認証情報を設定してください。" -ForegroundColor Yellow
            exit 1
        }
    } catch {
        Write-Host "エラー: AWS CLIがインストールされていないか、認証情報が設定されていません。" -ForegroundColor Red
        exit 1
    }
}

$env:CDK_DEFAULT_REGION = $CDK_REGION

Write-Host "  アカウント: $CDK_ACCOUNT" -ForegroundColor Cyan
Write-Host "  リージョン: $CDK_REGION" -ForegroundColor Cyan
Write-Host ""

# 依存関係のインストール
Write-Host "2. 依存関係のインストール..." -ForegroundColor Yellow
try {
    npm install
    if ($LASTEXITCODE -ne 0) {
        throw "npm install failed"
    }
    Write-Host "  ✓ 完了" -ForegroundColor Green
} catch {
    Write-Host "  ✗ エラー: npm installが失敗しました" -ForegroundColor Red
    exit 1
}
Write-Host ""

# TypeScriptのビルド
Write-Host "3. TypeScriptのビルド..." -ForegroundColor Yellow
try {
    npm run build
    if ($LASTEXITCODE -ne 0) {
        throw "npm run build failed"
    }
    Write-Host "  ✓ 完了" -ForegroundColor Green
} catch {
    Write-Host "  ✗ エラー: ビルドが失敗しました" -ForegroundColor Red
    exit 1
}
Write-Host ""

# CDKブートストラップの確認
Write-Host "4. CDKブートストラップの確認..." -ForegroundColor Yellow
$BOOTSTRAP_CHECK = aws cloudformation describe-stacks --stack-name CDKToolkit --region $CDK_REGION 2>$null
if (-not $BOOTSTRAP_CHECK) {
    Write-Host "  CDKブートストラップが必要です。実行します..." -ForegroundColor Yellow
    Write-Host "  コマンド: npx cdk bootstrap aws://$CDK_ACCOUNT/$CDK_REGION" -ForegroundColor Cyan
    $BOOTSTRAP_CONFIRM = Read-Host "  続行しますか？ (y/n)"
    if ($BOOTSTRAP_CONFIRM -eq "y" -or $BOOTSTRAP_CONFIRM -eq "Y") {
        npx cdk bootstrap aws://$CDK_ACCOUNT/$CDK_REGION
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  ✗ エラー: ブートストラップが失敗しました" -ForegroundColor Red
            exit 1
        }
        Write-Host "  ✓ ブートストラップ完了" -ForegroundColor Green
    } else {
        Write-Host "  ブートストラップをスキップしました。" -ForegroundColor Yellow
    }
} else {
    Write-Host "  ✓ CDKブートストラップ済み" -ForegroundColor Green
}
Write-Host ""

# CDKの合成
Write-Host "5. CDKの合成（CloudFormationテンプレート生成）..." -ForegroundColor Yellow
try {
    npx cdk synth 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "cdk synth failed"
    }
    Write-Host "  ✓ 合成完了" -ForegroundColor Green
} catch {
    Write-Host "  ✗ エラー: 合成が失敗しました" -ForegroundColor Red
    Write-Host "  詳細を確認するには 'npx cdk synth' を実行してください。" -ForegroundColor Yellow
    exit 1
}
Write-Host ""

# CDKの差分確認
Write-Host "6. CDKの差分確認..." -ForegroundColor Yellow
Write-Host "  変更内容を確認します..." -ForegroundColor Cyan
npx cdk diff
Write-Host ""

# デプロイの確認
Write-Host "7. デプロイの実行..." -ForegroundColor Yellow
$DEPLOY_CONFIRM = Read-Host "  デプロイを実行しますか？ (y/n)"
if ($DEPLOY_CONFIRM -ne "y" -and $DEPLOY_CONFIRM -ne "Y") {
    Write-Host "  デプロイをキャンセルしました。" -ForegroundColor Yellow
    exit 0
}

try {
    npx cdk deploy --require-approval never
    if ($LASTEXITCODE -ne 0) {
        throw "cdk deploy failed"
    }
    Write-Host ""
    Write-Host "✓ デプロイ完了！" -ForegroundColor Green
    Write-Host ""
    
    # デプロイ出力を取得
    Write-Host "デプロイ後の設定が必要です:" -ForegroundColor Yellow
    Write-Host "1. model_map.jsonをS3にアップロード" -ForegroundColor White
    Write-Host "2. Lambda Function URLをストリーミング対応にする" -ForegroundColor White
    Write-Host ""
    Write-Host "詳細は infra/cdk/DEPLOYMENT_PLAN.md を参照してください。" -ForegroundColor Cyan
    
} catch {
    Write-Host ""
    Write-Host "✗ エラー: デプロイが失敗しました" -ForegroundColor Red
    Write-Host "  詳細を確認するには 'npx cdk deploy' を実行してください。" -ForegroundColor Yellow
    exit 1
}

