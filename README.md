# EMMA 電子零件 — 後端 API

電子零件電商的後端服務（商品資料取自 EMMA Collection 露天賣場），採 **Node.js + Express 5 + MongoDB (Mongoose)**，落實 MVC 分層。

- **線上 API Base URL**：https://emma-parts-api.onrender.com/api
- **前端網站**：https://sale.lifemochi.com（備用：https://emma-parts.pages.dev）
- **Postman Collection**：[`docs/emma-parts-api.postman_collection.json`](docs/emma-parts-api.postman_collection.json)
- **前端 Repo**：`https://github.com/roklul/hex_individual_project_web`

### 測試帳號

每位測試者在網站自行註冊會員，或在 Postman 個人環境設定 `memberEmail` 和 `memberPassword` 後執行「註冊」。既有會員可使用自己的帳號登入。管理員測試帳號由維運者私下提供。

## 技術與架構

| 層 | 位置 | 職責 |
| --- | --- | --- |
| Model | `src/models/` | Mongoose Schema：`User`、`Product`、`Cart` |
| Controller | `src/controllers/` | 商業邏輯：auth / product / cart |
| Route | `src/routes/` | 只負責 URL → middleware → controller 對應 |
| Middleware | `src/middlewares/` | JWT 驗證、管理員授權、輸入驗證、錯誤處理 |
| Validator | `src/validators/` | Zod schema，統一驗證請求格式 |

訂單：`Order` Model 保存商品快照，`order.controller` 處理結帳、扣庫存與取消。

其他：`helmet`（安全標頭）、`cors`（白名單）、`express-rate-limit`（登入/註冊防暴力破解）、`bcryptjs`（密碼雜湊，cost 12）。

## 本機開發

```bash
npm install

# 方式一：免安裝 MongoDB，使用記憶體資料庫（自動建立種子商品與開發用管理員）
npm run dev:memory

# 方式二：連線 MongoDB Atlas 或已啟用 replica set 的 MongoDB
cp .env.example .env      # 填入 MONGODB_URI、JWT_SECRET 等
npm run seed              # 補齊 34 筆目錄商品，保留既有商品、庫存與購物車
npm run create-admin      # 依 .env 的 ADMIN_* 建立管理員
npm run dev

# 自動化測試（使用本機暫存的單節點 replica set）
npm test
```

### 商品匯入與測試庫重置

`npm run seed` 會用永久商品編號比對目錄，只新增缺少的商品。首次升級時，腳本會用舊版圖檔與商品文案識別既有商品並補上編號，保留原商品 ID、實際庫存、售價與上下架狀態，購物車和訂單仍指向同一件商品。遇到多筆可能的對應資料時，整次匯入會回滾，方便核對後重試。

若要在無訂單的測試庫重新建立示範商品，執行 `npm run seed:reset -- --confirm-db=實際資料庫名`。這個命令會刪除該庫所有商品（含自建商品）、清空購物車，並重新載入目錄的示範庫存。只要已有任何訂單，腳本就會拒絕重置。

## 環境變數

見 [`.env.example`](.env.example)。`.env` 已列入 `.gitignore`，**任何機密都不會進入版本紀錄**；部署時於雲端平台後台設定。

| 變數 | 說明 |
| --- | --- |
| `MONGODB_URI` | MongoDB 連線字串 |
| `JWT_SECRET` | 使用 `.env.example` 提供的指令產生隨機簽章密鑰。正式環境至少 32 字元，啟動時會拒絕公開範例值。 |
| `JWT_EXPIRES_IN` | Token 有效期，預設 `7d` |
| `CORS_ORIGIN` | 允許的前端網址，多個以逗號分隔 |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | 僅供 `create-admin` 腳本使用 |
| `RESEND_API_KEY` | [Resend](https://resend.com) 寄信 API 金鑰，用於寄送重設密碼信。未設定時不寄信（本機開發會把信件內容印在終端機） |
| `MAIL_FROM` | 寄件者，例如 `EMMA 電子零件 <noreply@你的網域>`。網域需先在 Resend 驗證；未設定時使用 Resend 測試寄件者（只能寄給 Resend 帳號本人的信箱） |
| `APP_URL` | 重設密碼信中連結的前端網址，未設定時取 `CORS_ORIGIN` 中第一個 https 網址 |
| `ATM_BANK_CODE` / `ATM_BANK_NAME` / `ATM_ACCOUNT` / `ATM_ACCOUNT_NAME` | ATM 轉帳收款帳號（選填），未設定時顯示「展示用」假帳號 |

## 管理員帳號產生方式

1. 一般註冊 API **只接受** `name`、`email`、`password` 三個欄位（Zod `.strict()`），夾帶 `role`、`isAdmin` 等欄位會直接回 `400`。
2. Controller 建立使用者時不從請求取角色，一律使用 Schema 預設值 `user`。
3. **整個 API 沒有任何可修改角色的端點**；JWT 記錄會員 ID 與工作階段版本。每次請求都會從資料庫確認版本與目前角色。
4. 管理員**只能由具有資料庫與伺服器環境變數存取權的維運者**，在伺服器端執行：
   ```bash
   # 在 .env（或雲端平台的環境變數）設定 ADMIN_EMAIL / ADMIN_PASSWORD 後
   npm run create-admin
   ```
   Email 已存在時，腳本會在同一次資料庫更新中提升權限、重設密碼並撤銷該會員的所有舊 JWT。首次建立帳號時會直接授予管理員角色。

> 審核用管理員帳密會另外提供，不寫在 Repo 中。管理員登入前台後，導覽列會出現「後台管理」，可直接在網頁上管理商品與訂單。

## API 文件

**Postman Collection**：[`docs/emma-parts-api.postman_collection.json`](docs/emma-parts-api.postman_collection.json)——匯入後預設連到線上 API。使用個人環境變數註冊或登入自己的測試帳號，token 會自動帶入後續請求。測試本機時可將 `baseUrl` 改為 `http://localhost:3000/api`。集合內含各邊界情況的失敗範例（提權、401、403、404、不合理數量）。

所有回應格式：`{ success: boolean, message?: string, data?: any, pagination?: object, errors?: [{ field, message }] }`

需要登入的 API 請帶 Header：`Authorization: Bearer <token>`

### 健康檢查
| Method | Path | 說明 |
| --- | --- | --- |
| GET | `/api/health` | 服務狀態 |

### 會員 Auth
| Method | Path | 權限 | Body | 說明 |
| --- | --- | --- | --- | --- |
| POST | `/api/auth/register` | 公開 | `{ name, email, password }` | 註冊並回傳 token。密碼 8–72 碼、需含英文與數字 |
| POST | `/api/auth/login` | 公開 | `{ email, password }` | 登入並回傳 token |
| GET | `/api/auth/me` | 會員 | — | 取得目前登入者資料 |
| POST | `/api/auth/forgot-password` | 公開 | `{ email }` | 寄送重設密碼連結。不論 Email 是否註冊都回相同訊息；同一帳號 60 秒內只寄一次，每個 IP 15 分鐘最多 5 次 |
| POST | `/api/auth/reset-password` | 公開 | `{ token, password }` | 用信中的 token 設定新密碼（30 分鐘內有效、只能用一次），成功後自動登入並撤銷所有舊 token |
| PATCH | `/api/auth/password` | 會員 | `{ currentPassword, newPassword }` | 修改密碼，需驗證目前密碼；回傳新 token，其他裝置的舊 token 全部失效 |

### 商品 Products（公開）
| Method | Path | 說明 |
| --- | --- | --- |
| GET | `/api/products` | 商品列表。Query：`page`(預設 1)、`limit`(1–50，預設 12)、`category`、`keyword`(比對名稱、品牌與描述，不分大小寫)、`sort`(`newest` / `price_asc` / `price_desc`) |
| GET | `/api/products/categories` | 所有分類及各分類商品數 |
| GET | `/api/products/:id` | 單一商品 |

分類：`微控制器・處理器`、`邏輯・介面IC`、`類比・驅動IC`、`電源・穩壓`、`光耦・繼電器`、`開關・連接器`、`模組・配件`

### 商品管理 Admin（需管理員）
| Method | Path | 說明 |
| --- | --- | --- |
| GET | `/api/admin/products?page=&limit=&category=&keyword=` | 全部商品（含未上架），可依分類與關鍵字篩選 |
| POST | `/api/admin/products` | 新增商品 |
| PATCH | `/api/admin/products/:id` | 部分更新商品 |
| DELETE | `/api/admin/products/:id` | 刪除商品（同步自所有購物車移除） |

新增商品 Body 範例：
```json
{
  "title": "ADuM1201BRZ 數位隔離IC",
  "brand": "Analog Devices ADI",
  "category": "邏輯・介面IC",
  "price": 140,
  "originPrice": 160,
  "stock": 30,
  "imageUrl": "https://picsum.photos/seed/chip/800/800",
  "description": "雙通道數位隔離器，10Mbps",
  "content": "詳細說明…",
  "unit": "顆",
  "isEnabled": true
}
```

### 購物車 Cart（需登入）
| Method | Path | Body | 說明 |
| --- | --- | --- | --- |
| GET | `/api/cart` | — | 查看購物車 |
| POST | `/api/cart/items` | `{ productId, quantity? }` | 加入商品（預設 1）。重複加入會累加數量 |
| PATCH | `/api/cart/items/:productId` | `{ quantity }` | 設定數量 |
| DELETE | `/api/cart/items/:productId` | — | 移除單一商品 |
| DELETE | `/api/cart` | — | 清空購物車 |

購物車回傳：
```json
{
  "items": [{ "productId": "…", "product": { "id": "…", "title": "…", "price": 450, "stock": 30 }, "quantity": 2, "subtotal": 900, "available": true, "maxQuantity": 30 }],
  "totalQuantity": 2,
  "total": 900
}
```

#### 已處理的邊界情況
| 情況 | 回應 |
| --- | --- |
| 未登入 / token 無效或過期 | `401` |
| 一般會員呼叫管理員 API | `403` |
| `productId` 格式錯誤 | `400` |
| 商品不存在或已下架 | `404` |
| 數量非整數、≤ 0、> 99、字串 | `400` |
| 重複加入 | 累加數量（回 `200`，首次加入回 `201`） |
| 累加後超過庫存 / 上限 99 | `400`，並告知還能加入幾件 |
| 商品已售完 | `400` |
| 修改/移除不在購物車中的商品 | `404` |
| 商品被管理員刪除 | 自動自所有購物車移除 |
| 商品下架或庫存不足 | 保留於購物車並標示 `available: false`，不計入總額 |
| JSON 格式錯誤 | `400` |

### 訂單 Orders（需登入）
| Method | Path | Body | 說明 |
| --- | --- | --- | --- |
| POST | `/api/orders` | `{ quoteVersion, recipient: { name, phone, address }, paymentMethod, note? }` | 以購物車內容結帳。`quoteVersion` 取自購物車 API 回應；付款方式：`貨到付款`、`ATM 轉帳` |
| GET | `/api/orders?page=&limit=` | — | 我的訂單（新到舊） |
| GET | `/api/orders/:id` | — | 單一訂單（只能看自己的） |
| POST | `/api/orders/:id/transfer-report` | `{ last5 }` | ATM 訂單回報匯款帳號末五碼（待付款時才可回報，確認入帳前可修正） |
| POST | `/api/orders/:id/cancel` | — | 取消訂單（待付款、處理中才可取消），歸還庫存 |

管理員：`GET /api/admin/orders` 查看全部訂單（含 ATM 匯款回報 `transferReport`）、`PATCH /api/admin/orders/:id` `{ status }` 更新狀態。

狀態只能往前推進，不合規則的變更回 400：

| 目前狀態 | 可改為 |
| --- | --- |
| 待付款 | 處理中（確認入帳）、已取消 |
| 處理中 | 已出貨、已取消 |
| 已出貨 | 已完成 |
| 已完成、已取消 | —（終點） |

#### 結帳規則
- **報價版本確認**：購物車 API 每次回傳 `quoteVersion`（由購物車版本、商品價格、數量與運費計算）。下單時必須帶回買家最後看到的版本；若期間商品調價或購物車在其他分頁被修改，後端回 409，前端會顯示最新明細並請買家再次確認。同一份報價只能成立一張訂單。
- **金額一律由後端計算**：前端送來的價格、總額、狀態會被拒絕（400），避免竄改金額。
- **運費**：商品小計未滿 NT$500 收 NT$60，滿額免運（購物車 API 也會回傳 `shippingFee`、`grandTotal`）。
- **結帳交易**會一起完成扣庫存、建立訂單及清空購物車。寫入中斷會回滾整筆交易，同一份購物車同時送出也只會成立一張訂單。自架 MongoDB 需啟用 replica set，或使用支援交易的分片叢集。 `npm run dev:memory` 會自動啟動單節點 replica set。
- **商品快照**：訂單保存下單當下的名稱、價格與圖片，之後商品改價或刪除不影響歷史訂單。
- 會員與管理員取消訂單時，狀態更新和庫存回補會在同一筆交易提交。即使兩人同時取消，庫存也只回補一次。
- **ATM 轉帳對帳**：ATM 訂單的回應附上收款帳號 `atmAccount` 與付款期限 `paymentDeadline`（下單後 3 天）。買家轉帳後回報帳號末五碼，管理員在後台對照銀行入帳紀錄後，把訂單改為「處理中」。收款帳號由環境變數 `ATM_BANK_CODE`、`ATM_BANK_NAME`、`ATM_ACCOUNT`、`ATM_ACCOUNT_NAME` 設定，未設定時顯示標明「展示用」的假帳號。
- 本專案為作品展示，不串接金流，不會實際收款。
