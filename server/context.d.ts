// Hono の Context 変数（c.get / c.set）の型拡張。
// 認証ミドルウェア（server/auth.ts）と storage 解決ミドルウェア（server/index.ts）が
// リクエストごとにセットする値をここで型付けする。
import type { DatabaseSync } from "node:sqlite";
import "hono";

declare module "hono" {
  interface ContextVariableMap {
    /** 認証で解決した Google `sub`（storage 選択キー）。 */
    userId: string;
    /** 表示用のメールアドレス。 */
    userEmail: string;
    /** 表示用の名前。 */
    userName: string;
    /** ログイン時に確定したロール（admin/user）。JWT 由来。 */
    userRole: "admin" | "user";
    /** 解決済みのアクティブプロジェクト ID（X-Project-Id ヘッダ + メンバー確認済み）。 */
    projectId: string;
    /** このリクエストのプロジェクトの DB ハンドル（data/{projectId}/travel.db）。 */
    db: DatabaseSync;
    /** このリクエストのプロジェクトの会話セッション dir（agent-sessions/{projectId}）。 */
    sessionDir: string;
  }
}
