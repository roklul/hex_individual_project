# 拾日選物 Shiri Select — 後端 API

選物電商的後端服務，採 **Node.js + Express 5 + MongoDB (Mongoose)**，落實 MVC 分層。

- **線上 API Base URL**：`https://<your-api>.onrender.com/api`（部署後填入）
- **前端網站**：`https://<your-web>.vercel.app`（部署後填入）
- **前端 Repo**：`https://github.com/<you>/shiri-select-web`

## 技術與架構

| 層 | 位置 | 職責 |
| --- | --- | --- |
| Model | `src/models/` | Mongoose Schema：`User`、`Product`、`Cart` |
| Controller | `src/controllers/` | 商業邏輯：auth / product / cart |
| Route | `src/routes/` | 只負責 URL → middleware → controller 對應 |
| Middleware | `src/middlewares/` | JWT 驗證、管理員授權、輸入驗證、錯誤處理 |
| Validator | `src/validators/` | Zod schema，統一驗證請求格式 |

其他：`helmet`（安全標頭）、`cors`（白名單）、`express-rate-limit`（登入/註冊防暴力破解）、`bcryptjs`（密碼雜湊，cost 12）。

## 本機開發

```bash
npm install

# 方式一：免安裝 MongoDB，使用記憶體資料庫（自動建立種子商品與開發用管理員）
npm run dev:memory

# 方式二：連線真實資料庫
cp .env.example .env      # 填入 MONGODB_URI、JWT_SECRET 等
npm run seed              # 建立 24 筆示範商品
npm run create-admin      # 依 .env 的 ADMIN_* 建立管理員
npm run dev

# 自動化測試（記憶體資料庫，涵蓋權限與購物車邊界情況）
npm test
```

## 環境變數

見 [`.env.example`](.env.example)。`.env` 已列入 `.gitignore`，**任何機密都不會進入版本紀錄**；部署時於雲端平台後台設定。

| 變數 | 說明 |
| --- | --- |
| `MONGODB_URI` | MongoDB 連線字串 |
| `JWT_SECRET` | JWT 簽章密鑰（正式環境至少 32 字元） |
| `JWT_EXPIRES_IN` | Token 有效期，預設 `7d` |
| `CORS_ORIGIN` | 允許的前端網址，多個以逗號分隔 |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | 僅供 `create-admin` 腳本使用 |

## 管理員帳號產生方式

1. 一般註冊 API **只接受** `name`、`email`、`password` 三個欄位（Zod `.strict()`），夾帶 `role`、`isAdmin` 等欄位會直接回 `400`。
2. Controller 建立使用者時不從請求取角色，一律使用 Schema 預設值 `user`。
3. **整個 API 沒有任何可修改角色的端點**；JWT 只存放使用者 id，角色在每次請求時由資料庫查詢，竄改 token 內容也無法提權（簽章會失效）。
4. 管理員**只能由具有資料庫與伺服器環境變數存取權的維運者**，在伺服器端執行：
   ```bash
   # 在 .env（或雲端平台的環境變數）設定 ADMIN_EMAIL / ADMIN_PASSWORD 後
   npm run create-admin
   ```
   若該 Email 已存在則升級為管理員並重設密碼；否則建立新的管理員帳號。

> 審核用管理員帳密會另外提供，不寫在 Repo 中。

## API 文件

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

### 商品 Products（公開）
| Method | Path | 說明 |
| --- | --- | --- |
| GET | `/api/products` | 商品列表。Query：`page`(預設 1)、`limit`(1–50，預設 12)、`category`、`keyword`(比對名稱與描述)、`sort`(`newest` / `price_asc` / `price_desc`) |
| GET | `/api/products/categories` | 所有分類及各分類商品數 |
| GET | `/api/products/:id` | 單一商品 |

分類：`居家生活`、`餐廚器皿`、`香氛蠟燭`、`文具雜貨`、`植栽園藝`、`衣著配件`

### 商品管理 Admin（需管理員）
| Method | Path | 說明 |
| --- | --- | --- |
| GET | `/api/admin/products?page=&limit=` | 全部商品（含未上架） |
| POST | `/api/admin/products` | 新增商品 |
| PATCH | `/api/admin/products/:id` | 部分更新商品 |
| DELETE | `/api/admin/products/:id` | 刪除商品（同步自所有購物車移除） |

新增商品 Body 範例：
```json
{
  "title": "手捏粗陶飯碗",
  "category": "餐廚器皿",
  "price": 450,
  "originPrice": 520,
  "stock": 30,
  "imageUrl": "https://picsum.photos/seed/bowl/800/800",
  "description": "台灣陶藝職人手作",
  "content": "詳細說明…",
  "unit": "件",
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
