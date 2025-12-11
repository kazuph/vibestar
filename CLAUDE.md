# Vibestar

AI時代のフルスタック開発テンプレート。Cloudflareエコシステムに完全対応。

## ⚠️ 重要な制約

**Docker/コンテナは絶対に禁止です。** ローカル開発ではすべてネイティブツール（brew install等）を使用してください。

**AIモデルの変更は絶対に禁止です。** 以下のモデルを使用してください：
- 埋め込み: `@cf/pfnet/plamo-embedding-1b` (1024次元)
- チャット: `@cf/pfnet/gpt-oss-120b`

> これらのモデルはプロジェクト要件として指定されており、理由を問わず変更してはいけません。

## 技術スタック

| カテゴリ | 技術 | 備考 |
|---------|------|------|
| フレームワーク | React Router v7 + Hono + Vite | 公式テンプレートベース |
| ホスティング | Cloudflare Workers/Pages | |
| データベース | Turso (本番) / SQLite (ローカル) | Drizzle ORM |
| 認証 | Better Auth + Email OTP | `signIn.emailOtp` 方式 |
| メール | Resend (本番) / Mailpit (ローカル) | |
| AI | Cloudflare Workers AI | Phase 2予定 |
| RAG | Cloudflare Vectorize | Phase 2予定 |
| ストレージ | Cloudflare R2 | Phase 3予定 |
| UI | Tailwind CSS | |
| E2Eテスト | Playwright | モックなし |

## ディレクトリ構造

```
vibestar/
├── app/
│   ├── routes/
│   │   ├── home.tsx                # ランディングページ
│   │   ├── auth.signup.tsx         # サインアップ
│   │   ├── auth.verify-otp.tsx     # OTP検証
│   │   ├── auth.signin.tsx         # サインイン
│   │   ├── dashboard._index.tsx    # ダッシュボード
│   │   ├── api.auth.$.ts           # Better Auth API
│   │   └── api.health.ts           # ヘルスチェック
│   ├── lib/
│   │   ├── db/
│   │   │   ├── schema.ts           # Drizzle スキーマ
│   │   │   └── client.ts           # DB クライアント
│   │   ├── auth.server.ts          # Better Auth 設定 + メール送信
│   │   ├── auth.client.ts          # クライアント用Auth
│   │   └── auth.middleware.ts      # 認証ミドルウェア
│   ├── pages/
│   │   └── welcome/                # Welcomeページ
│   ├── entry.client.tsx
│   ├── entry.server.tsx
│   ├── root.tsx
│   └── routes.ts                   # ルート定義
├── server/
│   └── index.ts                    # Hono middleware
├── drizzle/                        # マイグレーション
├── e2e/                            # Playwright テスト
│   ├── auth.spec.ts                # 認証E2Eテスト
│   ├── fixtures.ts
│   └── utils/
│       └── mailpit.ts              # Mailpit API
├── wrangler.toml
├── playwright.config.ts
├── drizzle.config.ts
└── package.json
```

## 開発フェーズ

### Phase 1: 基盤構築 ✅ 完了
1. [x] 設計ドキュメント作成
2. [x] React Router v7 + Cloudflare テンプレートでプロジェクト初期化
3. [x] Turso + Drizzle ORM セットアップ
4. [x] Better Auth + Email OTP 認証実装
5. [x] Mailpit メール統合（開発環境）
6. [x] Playwright E2E テスト環境構築
7. [x] サインアップ→OTP認証のE2E完走（5テスト全件パス）

### Phase 2: AI機能
8. [ ] Workers AI 統合（チャット、ストリーミング）
9. [ ] Cloudflare Vectorize RAG実装

### Phase 3: ビジネス機能
10. [ ] R2 ファイルアップロード実装
11. [ ] ダッシュボードUI構築
12. [ ] Resend メール統合（本番環境）

## ローカル開発環境

```
┌─────────────────┐     ┌─────────────────┐
│  Playwright     │────▶│  Dev Server     │
│  (E2E Tests)    │     │  :15173         │
└─────────────────┘     └────────┬────────┘
                                 │
                    ┌────────────┼────────────┐
                    ▼            ▼            ▼
              ┌──────────┐ ┌──────────┐ ┌──────────┐
              │ Turso Dev│ │  Mailpit │ │ Workers  │
              │ :18080   │ │ :18025   │ │ AI Local │
              │ (SQLite) │ │SMTP:11025│ │ (未実装) │
              └──────────┘ └──────────┘ └──────────┘
```

### 起動コマンド

```bash
# 1. 依存関係インストール
pnpm install

# 2. 開発環境一発起動（DB + Mailpit + Web）
pnpm dev

# E2Eテスト実行（別ターミナル）
pnpm test:e2e

# マイグレーション
pnpm db:generate  # スキーマからSQL生成
pnpm db:migrate   # SQLite適用

# ビルド
pnpm build
```

### 個別起動（必要な場合）

```bash
pnpm dev:db    # Turso dev (SQLite on :18080)
pnpm dev:mail  # Mailpit (SMTP :11025, UI :18025)
pnpm dev:web   # React Router dev (:15173)
```

### 重要: 単一ポート構成

開発サーバーは**単一ポート（15173）**で動作。フロントエンドとAPI（`/api/*`）が同一ポートで提供される。

## 環境変数

### ローカル (.dev.vars)

```env
# Database (turso dev使用時は不要)
TURSO_DATABASE_URL=http://127.0.0.1:18080

# Auth
BETTER_AUTH_SECRET=your-secret-key-here
BETTER_AUTH_URL=http://localhost:15173

# Email (ローカルはMailpit)
SMTP_HOST=localhost
SMTP_PORT=11025
```

### 本番 (Cloudflare Dashboard)

```env
TURSO_DATABASE_URL=libsql://xxx.turso.io
TURSO_AUTH_TOKEN=xxx
BETTER_AUTH_SECRET=xxx
BETTER_AUTH_URL=https://your-domain.com
RESEND_API_KEY=re_xxx
```

## 認証フロー

```
1. ユーザーがメールアドレスを入力
2. サーバーがOTPを生成してメール送信（Mailpit/Resend）
3. ユーザーがOTPを入力
4. signIn.emailOtp で検証
   - ユーザーが存在しない場合: 自動登録 + ログイン
   - ユーザーが存在する場合: ログイン
5. セッション発行（7日間有効）
```

### 重要なAPI

- `signIn.emailOtp()` - OTP検証 + セッション作成（認証用）
- `emailOtp.verifyEmail()` - メール検証のみ（セッション作成なし）

## E2Eテスト方針

- **モック禁止**: 実際のDB、実際のメール送信（Mailpit経由）
- **直列実行**: `test.describe.serial` でMailpit競合を回避
- **Mailpit API**: `GET http://localhost:18025/api/v1/messages` でOTP取得
- **テストデータ**: 各テストで一意のメールアドレスを使用（`test-${Date.now()}@example.com`）

```typescript
// e2e/auth.spec.ts の例
test.describe.serial('Authentication', () => {
  test.beforeEach(async () => {
    await waitForMailpit();
    await clearMailbox();
  });

  test('signup with email OTP', async ({ page }) => {
    const email = `test-${Date.now()}@example.com`;

    await page.goto('/auth/signup');
    await page.fill('[name="email"]', email);
    await page.click('button[type="submit"]');

    const otp = await getOtpFromMailpit(email);
    // ...OTP入力とダッシュボードへのリダイレクト確認
  });
});
```

## コーディング規約

- TypeScript strict mode
- ESLint + Prettier
- コンポーネント: 関数コンポーネント + hooks
- サーバー処理: `.server.ts` サフィックス
- 環境変数: Cloudflare バインディング優先

## 参考リンク

- [React Router v7 Cloudflare](https://developers.cloudflare.com/workers/framework-guides/web-apps/react-router/)
- [Better Auth](https://www.better-auth.com/)
- [Better Auth Email OTP](https://www.better-auth.com/docs/plugins/email-otp)
- [Drizzle ORM](https://orm.drizzle.team/)
- [Turso](https://turso.tech/)
- [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/)
- [Cloudflare Vectorize](https://developers.cloudflare.com/vectorize/)
