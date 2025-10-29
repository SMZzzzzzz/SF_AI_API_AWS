// 開発者ツールのConsoleで実行するスクリプト
// エラーメッセージを自動でエクスポート

// 1. Consoleログを取得
function exportConsoleLogs() {
    const logs = [];
    
    // 既存のログを取得（可能な場合）
    if (console._logs) {
        logs.push(...console._logs);
    }
    
    // 現在のエラーを取得
    const errors = [];
    const warnings = [];
    const info = [];
    
    // ページロード後のエラーをキャプチャ
    window.addEventListener('error', function(e) {
        errors.push({
            type: 'Error',
            message: e.message,
            filename: e.filename,
            lineno: e.lineno,
            colno: e.colno,
            stack: e.error ? e.error.stack : null,
            timestamp: new Date().toISOString()
        });
    });
    
    // Promise rejection をキャプチャ
    window.addEventListener('unhandledrejection', function(e) {
        errors.push({
            type: 'UnhandledRejection',
            message: e.reason ? e.reason.toString() : 'Unknown',
            stack: e.reason ? e.reason.stack : null,
            timestamp: new Date().toISOString()
        });
    });
    
    // 結果を整理
    const result = {
        timestamp: new Date().toISOString(),
        url: window.location.href,
        userAgent: navigator.userAgent,
        errors: errors,
        logs: logs
    };
    
    return result;
}

// 2. エクスポート実行
function runExport() {
    const logData = exportConsoleLogs();
    
    // JSONとしてダウンロード
    const blob = new Blob([JSON.stringify(logData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `console-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    console.log('Console logs exported successfully!');
}

// 3. 実行
runExport();





