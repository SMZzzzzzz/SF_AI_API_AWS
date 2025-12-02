# Continue 設定配布手順（Windows）

## 配布対象ファイル
1. `docs/continue-config-reference.yaml`

> リポジトリ内のリファレンスをそのまま `config.yaml` にコピーして使用します。追加のファイル配布は不要です。

## 反映手順
1. Continue をインストール（VS Code / Cursor 等）。
2. 以下のディレクトリへ移動（存在しない場合は作成）  
   `C:\Users\<ユーザー名>\.continue\`
3. 既存の `config.yaml` をバックアップ。
4. `docs/continue-config-reference.yaml` を `config.yaml` としてコピー。  
   - 例: `copy docs\continue-config-reference.yaml %USERPROFILE%\.continue\config.yaml`
5. VS Code / Cursor を再起動して設定を読み込む。

## 自動取得するメタ情報
- `USERNAME`, `USERDOMAIN`, `COMPUTERNAME` をヘッダーとして送信（`X-User-Id`, `X-Machine-Name` など）。
- 維持管理者による追加設定は不要。OS 環境変数が自動で適用される。

## 注意事項
- 端末名・Windows ユーザーが環境変数に依存するため、変更したい場合は OS 側で名称を更新。
- 既存の個別設定がある場合はマージが必要。上書きする際は事前に差分確認を推奨。
- プロキシ等で追加ヘッダーが必要な場合は `config.yaml` を編集して対応。

