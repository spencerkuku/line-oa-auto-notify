# LINE OA -> Cloudflare Worker -> Discord 通知

這個專案用於接收 LINE Official Account webhook，驗證簽章後，把文字訊息轉成 Discord Embed 並送到你的 Discord channel。

## 功能

- 接收 `POST /webhook`
- 驗證 `X-Line-Signature`
- 解析 LINE events，先支援文字訊息
- 使用 Channel access token 查詢 LINE 顯示名稱
- 發送 Discord Embed（顯示名稱/使用者 ID、訊息內容、時間）
- 過期事件略過（預設超過 5 分鐘不轉發，避免重放攻擊）
- 使用者級通知冷卻（需綁定 KV；冷卻內僅接收不轉發）
- 自動中和 Discord mention（`@everyone`/`@here`/`<@...>`）
- 訊息長度保護（超過 1000 字自動裁切）
- 提供受保護的 `POST /debug/send-test` 直接測 Discord 發送
- 提供受保護的 `POST /debug/line-simulate` 模擬 LINE 訊息格式
- 429/5xx 與網路錯誤自動重試（最多 3 次）
- `GET /health` 健康檢查

## 需求

- Node.js 20+
- Cloudflare 帳號
- LINE Developers Channel（Messaging API）
- Discord Webhook URL

## 安裝

```bash
npm install
cp .dev.vars.example .dev.vars
```

編輯 `.dev.vars`：

```env
LINE_CHANNEL_SECRET=your_line_channel_secret
LINE_CHANNEL_ACCESS_TOKEN=your_line_channel_access_token
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/xxx/yyy
DEBUG_API_KEY=your_debug_api_key
LOG_LEVEL=info
COOLDOWN_SECONDS=120
```

## 本機啟動

```bash
npm run dev
```

若你是開源專案維護者，建議改用私有設定檔（避免把 Cloudflare 資源 ID 寫入版本庫）：

```bash
cp wrangler.toml.example wrangler.toml
```

再把 `wrangler.toml` 內的 KV `id` / `preview_id` 填入你自己的 Cloudflare 資源。

## 部署

先在 Cloudflare 設定 secrets：

```bash
npx wrangler secret put LINE_CHANNEL_SECRET
npx wrangler secret put LINE_CHANNEL_ACCESS_TOKEN
npx wrangler secret put DISCORD_WEBHOOK_URL
npx wrangler secret put DEBUG_API_KEY
```

若要啟用冷卻機制，請先建立並綁定 KV Namespace：

```bash
npx wrangler kv namespace create NOTIFY_STORAGE
npx wrangler kv namespace create NOTIFY_STORAGE --preview
```

開源專案建議：
- `wrangler.toml.example` 作為模板文件。
- production 使用 `wrangler.toml`。
- 把指令輸出的 `id` / `preview_id` 填進 `wrangler.toml`。

```bash
npm run dev
npm run deploy
```

若是私有 repo 或你接受公開 KV ID，也可直接填入 `wrangler.toml` 的 `[[kv_namespaces]]` 區塊。

說明：
- `COOLDOWN_SECONDS` 預設為 `120`。
- 若未綁定 `NOTIFY_STORAGE`，服務仍可運作，但不會啟用冷卻抑制。

部署：

```bash
npm run deploy
```

## LINE 後台設定

1. 到 LINE Developers Console -> Messaging API。
2. 把 Webhook URL 設成：`https://<your-worker-domain>/webhook`
3. 開啟 Use webhook。
4. 按 Verify 確認 LINE 可以呼叫成功。

## 測試

### 1) Health check

```bash
curl http://127.0.0.1:8787/health
```

### 2) 測 webhook（含簽章）

先建立測試 payload：

```bash
cat > /tmp/line-payload.json <<'JSON'
{
  "destination": "Uxxxxxxxx",
  "events": [
    {
      "type": "message",
      "timestamp": 1760000000000,
      "source": {
        "type": "user",
        "userId": "U1234567890"
      },
      "message": {
        "id": "111111111",
        "type": "text",
        "text": "測試訊息 from LINE OA"
      }
    }
  ]
}
JSON
```

產生 LINE 簽章：

```bash
SIGNATURE=$(openssl dgst -sha256 -hmac "$LINE_CHANNEL_SECRET" -binary /tmp/line-payload.json | openssl base64)
```

送到本機 webhook：

```bash
curl -i http://127.0.0.1:8787/webhook \
  -X POST \
  -H "Content-Type: application/json" \
  -H "X-Line-Signature: $SIGNATURE" \
  --data-binary @/tmp/line-payload.json
```

### 3) 直接測 Discord（不經 LINE）

```bash
curl -i http://127.0.0.1:8787/debug/send-test \
  -X POST \
  -H "X-Debug-Key: $DEBUG_API_KEY"
```

成功時會回 `200`，失敗時回 `502`，可直接判斷 Discord webhook 是否可用。

### 4) 模擬 LINE 訊息格式送 Discord

```bash
curl -i http://127.0.0.1:8787/debug/line-simulate \
  -X POST \
  -H "X-Debug-Key: $DEBUG_API_KEY"
```

這個端點會使用和 `/webhook` 相同的 LINE Embed 組裝邏輯；如果這個成功，通常就不是 Embed 格式問題。

## 常見問題

- 回應 `401 Invalid signature`：
  - 通常是簽章算法或 payload 原文不一致。
  - 確認計算簽章時使用的是完全相同的原始 body。

- Discord 沒收到通知：
  - 檢查 `DISCORD_WEBHOOK_URL` 是否有效。
  - 格式必須像：`https://discord.com/api/webhooks/<數字ID>/<token>`。
  - 先呼叫 `POST /debug/send-test`，若也失敗代表是 Discord 設定問題，不是 LINE webhook。
  - 看 Worker log 中的 `Discord webhook result` 狀態碼。
  - 如果看到 `webhook_id is not snowflake` 或 `DISCORD_WEBHOOK_URL format is invalid`，代表 URL 填錯。

- 通知只看到使用者 ID、看不到顯示名稱：
  - 檢查 `LINE_CHANNEL_ACCESS_TOKEN` 是否有效。
  - 確認 LINE channel 具備讀取 profile 的權限。

- LINE Verify 失敗：
  - 確認 URL 為公開 HTTPS。
  - 確認路徑是 `/webhook`。
