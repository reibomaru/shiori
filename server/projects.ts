// ============================================================
//  プロジェクト（テナント）と メンバーシップ。
//
//  1 プロジェクト = 1 つの旅程データ一式（data/{projectId}/travel.db）。
//  複数ユーザーが共有・共同編集する。参加はメール招待（memberEmails）。
//  メタ情報（名前・オーナー・メンバー）は Firestore の projects コレクションで
//  管理し、doc id = projectId（uuid）。
//
//  アクセス境界: ログインユーザーの email が project.memberEmails に含まれるか。
//  リクエストは X-Project-Id ヘッダで対象プロジェクトを指定する。
// ============================================================
import type { MiddlewareHandler } from "hono";
import { randomUUID } from "node:crypto";
import { firestore } from "./users.ts";
import { getProjectDb, getProjectSessionDir, sanitizeProjectId } from "./storage.ts";

const COLLECTION = process.env.FIRESTORE_PROJECTS_COLLECTION || "projects";

/** projects ドキュメント。 */
export interface ProjectRecord {
  id: string;
  name: string;
  ownerSub: string;
  ownerEmail: string;
  memberEmails: string[];
  createdAt?: string;
  updatedAt?: string;
}

const norm = (email: string): string => (email || "").trim().toLowerCase();

function toRecord(id: string, x: FirebaseFirestore.DocumentData): ProjectRecord {
  return {
    id,
    name: typeof x.name === "string" ? x.name : "（無題のプロジェクト）",
    ownerSub: typeof x.ownerSub === "string" ? x.ownerSub : "",
    ownerEmail: typeof x.ownerEmail === "string" ? x.ownerEmail : "",
    memberEmails: Array.isArray(x.memberEmails) ? (x.memberEmails as unknown[]).map((e) => String(e)) : [],
    createdAt: typeof x.createdAt === "string" ? x.createdAt : undefined,
    updatedAt: typeof x.updatedAt === "string" ? x.updatedAt : undefined,
  };
}

function col() {
  return firestore().collection(COLLECTION);
}

/** ログインユーザー（email）がメンバーのプロジェクト一覧（更新の新しい順）。 */
export async function listProjectsForEmail(email: string): Promise<ProjectRecord[]> {
  const snap = await col().where("memberEmails", "array-contains", norm(email)).get();
  return snap.docs
    .map((d) => toRecord(d.id, d.data()))
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
}

export async function getProject(id: string): Promise<ProjectRecord | null> {
  const snap = await col().doc(sanitizeProjectId(id)).get();
  return snap.exists ? toRecord(snap.id, snap.data() ?? {}) : null;
}

/** 新規プロジェクトを作成し、作成者を owner + member にする。 */
export async function createProject(name: string, ownerSub: string, ownerEmail: string): Promise<ProjectRecord> {
  const id = randomUUID();
  const now = new Date().toISOString();
  const rec: ProjectRecord = {
    id,
    name: name.trim() || "新しいプロジェクト",
    ownerSub,
    ownerEmail: norm(ownerEmail),
    memberEmails: [norm(ownerEmail)],
    createdAt: now,
    updatedAt: now,
  };
  await col().doc(id).set(rec);
  return rec;
}

export async function renameProject(id: string, name: string): Promise<void> {
  await col().doc(sanitizeProjectId(id)).set({ name: name.trim(), updatedAt: new Date().toISOString() }, { merge: true });
}

export async function deleteProjectDoc(id: string): Promise<void> {
  await col().doc(sanitizeProjectId(id)).delete();
}

/** メンバー（email）を追加する（招待）。既に居れば冪等。 */
export async function addMember(id: string, email: string): Promise<void> {
  const e = norm(email);
  const ref = col().doc(sanitizeProjectId(id));
  await firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("project not found");
    const members = new Set((snap.data()?.memberEmails as string[]) ?? []);
    members.add(e);
    tx.set(ref, { memberEmails: [...members], updatedAt: new Date().toISOString() }, { merge: true });
  });
}

/** メンバー（email）を削除する。owner 自身は外せない。 */
export async function removeMember(id: string, email: string): Promise<void> {
  const e = norm(email);
  const ref = col().doc(sanitizeProjectId(id));
  await firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("project not found");
    const data = snap.data() ?? {};
    if (norm(data.ownerEmail) === e) throw new Error("cannot remove owner");
    const members = ((data.memberEmails as string[]) ?? []).filter((m) => norm(m) !== e);
    tx.set(ref, { memberEmails: members, updatedAt: new Date().toISOString() }, { merge: true });
  });
}

export function isMember(project: ProjectRecord, email: string): boolean {
  return project.memberEmails.map(norm).includes(norm(email));
}

export function isOwner(project: ProjectRecord, sub: string): boolean {
  return project.ownerSub === sub;
}

// メンバーシップの短 TTL キャッシュ（Firestore read を抑える）。
const MEMBERSHIP_TTL_MS = 30_000;
const cache = new Map<string, { rec: ProjectRecord; at: number }>();

async function getProjectCached(id: string): Promise<ProjectRecord | null> {
  const now = Date.now();
  const hit = cache.get(id);
  if (hit && now - hit.at < MEMBERSHIP_TTL_MS) return hit.rec;
  const rec = await getProject(id);
  if (rec) cache.set(id, { rec, at: now });
  else cache.delete(id);
  return rec;
}

/** メンバーシップキャッシュを無効化する（メンバー変更・削除時に呼ぶ）。 */
export function invalidateProjectCache(id: string): void {
  cache.delete(id);
}

/**
 * プロジェクトスコープ middleware（/api/* のドメインルートに適用）。
 * X-Project-Id を検証し、ログインユーザーがメンバーなら db / sessionDir を解決する。
 * requireAuth の後段で使う（c.get("userEmail") が必要）。
 */
export const requireProjectMember: MiddlewareHandler = async (c, next) => {
  // 通常は X-Project-Id ヘッダで指定する。ただし <img> / <iframe> のような
  // ブラウザネイティブの GET はカスタムヘッダを付けられないため、?projectId= の
  // クエリでも受け付ける（認証は Cookie、メンバー検証は下で行うため安全）。
  const projectId = c.req.header("X-Project-Id") || c.req.query("projectId") || "";
  if (!projectId) return c.json({ error: "X-Project-Id ヘッダが必要です。" }, 400);

  let id: string;
  try {
    id = sanitizeProjectId(projectId);
  } catch {
    return c.json({ error: "不正なプロジェクト ID です。" }, 400);
  }

  const project = await getProjectCached(id);
  if (!project) return c.json({ error: "プロジェクトが見つかりません。" }, 404);
  if (!isMember(project, c.get("userEmail"))) return c.json({ error: "このプロジェクトへのアクセス権がありません。" }, 403);

  c.set("projectId", id);
  c.set("db", await getProjectDb(id));
  c.set("sessionDir", getProjectSessionDir(id));
  return next();
};
