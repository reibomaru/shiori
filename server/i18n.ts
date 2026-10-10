// ============================================================
//  サーバ側のメッセージ翻訳（API エラー・認証ページ・AI 応答言語）
//  クライアント（src/i18n.ts）と同じ言語コードを使う。
//  判定順: X-Lang ヘッダ → shiori-lang Cookie → Accept-Language → ja
// ============================================================
import type { Context, MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";

export const LANGS = ["ja", "en", "fr", "zh"] as const;
export type Lang = (typeof LANGS)[number];
export const DEFAULT_LANG: Lang = "ja";

/** クライアントと共有する Cookie / ヘッダ名。 */
export const LANG_COOKIE = "shiori-lang";
export const LANG_HEADER = "X-Lang";

function normalize(v: string | undefined | null): Lang | null {
  if (!v) return null;
  const lower = v.trim().toLowerCase();
  return LANGS.find((l) => lower === l || lower.startsWith(`${l}-`)) ?? null;
}

/** Accept-Language から対応言語を 1 つ選ぶ（q 値の高い順）。 */
function fromAcceptLanguage(header: string | undefined): Lang | null {
  if (!header) return null;
  const ranked = header
    .split(",")
    .map((part, i) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      return { tag, q: q ? Number(q.slice(2)) || 0 : 1, i };
    })
    .sort((a, b) => b.q - a.q || a.i - b.i);
  for (const r of ranked) {
    const l = normalize(r.tag);
    if (l) return l;
  }
  return null;
}

/** リクエストから表示言語を解決する。 */
export function resolveLang(c: Context): Lang {
  return (
    normalize(c.req.header(LANG_HEADER)) ??
    normalize(getCookie(c, LANG_COOKIE)) ??
    fromAcceptLanguage(c.req.header("Accept-Language")) ??
    DEFAULT_LANG
  );
}

/** 全ルートで c.get("lang") を使えるようにするミドルウェア。 */
export const langMiddleware: MiddlewareHandler = async (c, next) => {
  c.set("lang", resolveLang(c));
  return next();
};

/** AI エージェントへ「この言語で応答せよ」と指示するときの言語名（プロンプトは日本語で書かれている）。 */
export const PROMPT_LANG_NAME: Record<Lang, string> = {
  ja: "日本語",
  en: "英語",
  fr: "フランス語",
  zh: "中国語（簡体字）",
};

type Params = Record<string, string | number>;

const MESSAGES = {
  // ---- プロジェクト / メンバー ----
  "project.idRequired": { ja: "プロジェクト ID が必要です。", en: "A project ID is required.", fr: "Un identifiant de projet est requis.", zh: "需要项目 ID。" },
  "project.headerRequired": { ja: "X-Project-Id ヘッダが必要です。", en: "The X-Project-Id header is required.", fr: "L'en-tête X-Project-Id est requis.", zh: "需要 X-Project-Id 请求头。" },
  "project.invalidId": { ja: "不正なプロジェクト ID です。", en: "Invalid project ID.", fr: "Identifiant de projet invalide.", zh: "项目 ID 无效。" },
  "project.notFound": { ja: "プロジェクトが見つかりません。", en: "Project not found.", fr: "Projet introuvable.", zh: "未找到项目。" },
  "project.forbidden": { ja: "このプロジェクトへのアクセス権がありません。", en: "You don't have access to this project.", fr: "Vous n'avez pas accès à ce projet.", zh: "你没有访问此项目的权限。" },
  "project.ownerOnly": { ja: "オーナーのみ操作できます。", en: "Only the owner can do this.", fr: "Seul le propriétaire peut effectuer cette action.", zh: "只有所有者可以执行此操作。" },
  "project.nameRequired": { ja: "name が必要です。", en: "A name is required.", fr: "Un nom est requis.", zh: "需要名称。" },
  "project.mapViewInvalid": { ja: "mapView が不正です。", en: "Invalid mapView.", fr: "mapView invalide.", zh: "mapView 无效。" },
  "project.defaultName": { ja: "新しいプロジェクト", en: "New project", fr: "Nouveau projet", zh: "新项目" },
  "project.untitled": { ja: "（無題のプロジェクト）", en: "(Untitled project)", fr: "(Projet sans titre)", zh: "（无标题项目）" },
  "member.emailRequired": { ja: "有効なメールアドレスが必要です。", en: "A valid email address is required.", fr: "Une adresse e-mail valide est requise.", zh: "需要有效的邮箱地址。" },
  "member.cannotRemoveOwner": { ja: "オーナーは削除できません。", en: "The owner cannot be removed.", fr: "Le propriétaire ne peut pas être retiré.", zh: "无法移除所有者。" },
  "member.removeFailed": { ja: "削除に失敗しました。", en: "Failed to remove.", fr: "La suppression a échoué.", zh: "移除失败。" },
  // ---- プロフィール ----
  "profile.displayNameTooLong": { ja: "表示名は60文字以内にしてください。", en: "Display name must be 60 characters or fewer.", fr: "Le nom affiché doit comporter 60 caractères au maximum.", zh: "显示名称不能超过 60 个字符。" },
  "profile.displayNameInvalid": { ja: "displayName が不正です。", en: "Invalid displayName.", fr: "displayName invalide.", zh: "displayName 无效。" },
  "profile.avatarInvalidFormat": { ja: "アバター画像の形式が不正です。", en: "Unsupported avatar image format.", fr: "Format d'image d'avatar non pris en charge.", zh: "不支持的头像图片格式。" },
  "profile.avatarTooLarge": { ja: "アバター画像が大きすぎます。別の画像でお試しください。", en: "The avatar image is too large. Please try another image.", fr: "L'image d'avatar est trop volumineuse. Essayez une autre image.", zh: "头像图片过大，请尝试其他图片。" },
  "profile.avatarInvalid": { ja: "avatar が不正です。", en: "Invalid avatar.", fr: "avatar invalide.", zh: "avatar 无效。" },
  "profile.noChanges": { ja: "変更内容がありません。", en: "Nothing to update.", fr: "Aucune modification.", zh: "没有需要更新的内容。" },
  "profile.userNotFound": { ja: "ユーザーが見つかりません。", en: "User not found.", fr: "Utilisateur introuvable.", zh: "未找到用户。" },
  // ---- BYOK / AI キー ----
  "byok.apiKeyRequired": { ja: "apiKey が必要です。", en: "An apiKey is required.", fr: "Une apiKey est requise.", zh: "需要 apiKey。" },
  "byok.invalidKey": {
    ja: "API キーが無効です。Google AI Studio で発行した有効な Gemini API キーを入力してください。",
    en: "Invalid API key. Please enter a valid Gemini API key issued by Google AI Studio.",
    fr: "Clé API invalide. Saisissez une clé API Gemini valide obtenue sur Google AI Studio.",
    zh: "API 密钥无效。请输入在 Google AI Studio 获取的有效 Gemini API 密钥。",
  },
  "ai.limitExceeded": {
    ja: "今月の無料利用上限（${{limit}}）に達しました。自分の API キー（BYOK）を登録すると継続してご利用いただけます。",
    en: "You've reached this month's free usage limit (${{limit}}). Register your own API key (BYOK) to keep using AI features.",
    fr: "Vous avez atteint la limite d'utilisation gratuite de ce mois ({{limit}} $). Enregistrez votre propre clé API (BYOK) pour continuer.",
    zh: "已达到本月免费使用上限（${{limit}}）。注册自己的 API 密钥（BYOK）即可继续使用。",
  },
  "ai.sharedNotConfigured": {
    ja: "AI 機能を利用できません。自分の API キー（BYOK）を登録してください（共有キーは未設定です）。",
    en: "AI features are unavailable. Please register your own API key (BYOK); no shared key is configured.",
    fr: "Les fonctions IA sont indisponibles. Enregistrez votre propre clé API (BYOK) ; aucune clé partagée n'est configurée.",
    zh: "AI 功能不可用。请注册自己的 API 密钥（BYOK）；未配置共享密钥。",
  },
  "ai.keyUnresolved": { ja: "API キーが解決できませんでした。", en: "Could not resolve an API key.", fr: "Impossible de déterminer une clé API.", zh: "无法确定 API 密钥。" },
  "ai.modelUnresolved": {
    ja: "モデル \"{{model}}\" を解決できません。GEMINI_MODEL に有効なモデル ID を設定してください（例: gemini-3-flash-preview, gemini-2.5-flash, gemini-flash-latest）。",
    en: "Could not resolve model \"{{model}}\". Set GEMINI_MODEL to a valid model ID (e.g. gemini-3-flash-preview, gemini-2.5-flash, gemini-flash-latest).",
    fr: "Impossible de résoudre le modèle « {{model}} ». Définissez GEMINI_MODEL sur un identifiant de modèle valide (ex. gemini-3-flash-preview, gemini-2.5-flash, gemini-flash-latest).",
    zh: "无法解析模型“{{model}}”。请将 GEMINI_MODEL 设置为有效的模型 ID（例如 gemini-3-flash-preview、gemini-2.5-flash、gemini-flash-latest）。",
  },
  // ---- DB 制約 ----
  "db.constraintItems": {
    ja: "予定は移動なら leg_id、スポット(spot/meal/hotel)なら spot_id のどちらか一方が必要です（free は例外）。",
    en: "An item needs either a leg_id (travel) or a spot_id (spot/meal/hotel), except for free items.",
    fr: "Un élément nécessite soit un leg_id (trajet), soit un spot_id (spot/meal/hotel), sauf pour les éléments libres.",
    zh: "项目需要 leg_id（交通）或 spot_id（spot/meal/hotel）之一，free 项目除外。",
  },
  "db.constraintLegGeojson": { ja: "移動区間（leg）には geojson が必須です。", en: "A route leg requires geojson.", fr: "Un trajet (leg) nécessite un geojson.", zh: "路线段（leg）必须包含 geojson。" },
  "db.constraintGeneric": { ja: "データが制約に違反しています。", en: "The data violates a constraint.", fr: "Les données violent une contrainte.", zh: "数据违反了约束条件。" },
  // ---- 既定値（ユーザーデータとして保存される） ----
  "item.untitled": { ja: "（無題）", en: "(Untitled)", fr: "(Sans titre)", zh: "（无标题）" },
  "budget.untitledCategory": { ja: "（費目）", en: "(Category)", fr: "(Catégorie)", zh: "（类别）" },
  "route.untitledPoint": { ja: "（地点）", en: "(Point)", fr: "(Lieu)", zh: "（地点）" },
  "chat.newConversation": { ja: "新しい会話", en: "New conversation", fr: "Nouvelle conversation", zh: "新对话" },
  // ---- 実費 / 画像 / メモ ----
  "expense.notFound": { ja: "実費が見つかりません。", en: "Expense not found.", fr: "Dépense introuvable.", zh: "未找到花费。" },
  "expense.noFiles": { ja: "ファイルが指定されていません。", en: "No files were provided.", fr: "Aucun fichier fourni.", zh: "未提供文件。" },
  "image.notFound": { ja: "画像が見つかりません。", en: "Image not found.", fr: "Image introuvable.", zh: "未找到图片。" },
  "image.noImages": { ja: "画像が指定されていません。", en: "No images were provided.", fr: "Aucune image fournie.", zh: "未提供图片。" },
  "image.dataRequired": { ja: "data（base64）が必要です。", en: "data (base64) is required.", fr: "data (base64) est requis.", zh: "需要 data（base64）。" },
  "image.dataAndMimeRequired": { ja: "data（base64）と mimeType が必要です。", en: "data (base64) and mimeType are required.", fr: "data (base64) et mimeType sont requis.", zh: "需要 data（base64）和 mimeType。" },
  "extract.failed": { ja: "情報の抽出に失敗しました: {{msg}}", en: "Extraction failed: {{msg}}", fr: "L'extraction a échoué : {{msg}}", zh: "提取信息失败：{{msg}}" },
  "memo.pageNotFound": { ja: "メモページが見つかりません。", en: "Note page not found.", fr: "Page de notes introuvable.", zh: "未找到笔记页面。" },
  "memo.originalKept": { ja: "{{msg}}（元画像は保存しました）", en: "{{msg}} (the original image was saved)", fr: "{{msg}} (l'image d'origine a été enregistrée)", zh: "{{msg}}（原始图片已保存）" },
  "memo.extractNothing": { ja: "画像から情報を読み取れませんでした", en: "No information could be read from the image", fr: "Aucune information n'a pu être lue dans l'image", zh: "无法从图片中读取信息" },
  "memo.bodyEmpty": { ja: "本文が空のためタイトルを生成できません。", en: "The note is empty, so a title cannot be generated.", fr: "La note est vide, impossible de générer un titre.", zh: "正文为空，无法生成标题。" },
  "memo.titleFailed": { ja: "タイトルの生成に失敗しました: {{msg}}", en: "Failed to generate a title: {{msg}}", fr: "La génération du titre a échoué : {{msg}}", zh: "标题生成失败：{{msg}}" },
  "memo.titleEmpty": { ja: "タイトルを生成できませんでした。", en: "Could not generate a title.", fr: "Impossible de générer un titre.", zh: "无法生成标题。" },
  "route.fromToRequired": { ja: "from と to（'lng,lat'）が必要です", en: "from and to ('lng,lat') are required", fr: "from et to ('lng,lat') sont requis", zh: "需要 from 和 to（'lng,lat'）" },
  // ---- チャット ----
  "chat.sessionIdRequired": { ja: "sessionId が指定されていません。", en: "sessionId is missing.", fr: "sessionId manquant.", zh: "缺少 sessionId。" },
  "chat.messageEmpty": { ja: "メッセージが空です。", en: "The message is empty.", fr: "Le message est vide.", zh: "消息为空。" },
  "chat.resolutionRequired": { ja: "proposalId と status（saved/dismissed）が必要です。", en: "proposalId and status (saved/dismissed) are required.", fr: "proposalId et status (saved/dismissed) sont requis.", zh: "需要 proposalId 和 status（saved/dismissed）。" },
  "chat.agentError": { ja: "エージェントの実行中にエラーが発生しました: {{msg}}", en: "An error occurred while running the agent: {{msg}}", fr: "Une erreur est survenue pendant l'exécution de l'agent : {{msg}}", zh: "运行代理时发生错误：{{msg}}" },
  // 画像だけ送られたときの既定指示（会話タイトルにもなるので表示言語で持つ）
  "chat.defaultImageSpotPrompt": {
    ja: "添付画像から行きたいスポットを読み取って、候補への追加を提案してください。",
    en: "Read the places to visit from the attached images and propose adding them to the candidates.",
    fr: "Lis les lieux à visiter dans les images jointes et propose de les ajouter aux candidats.",
    zh: "请从附件图片中识别想去的景点，并提议添加到候选。",
  },
  "chat.defaultImageMemoPrompt": {
    ja: "添付画像の内容を読み取って、開いているメモへの追記・整形を提案してください。",
    en: "Read the content of the attached images and propose additions and formatting for the open note.",
    fr: "Lis le contenu des images jointes et propose des ajouts et une mise en forme pour la note ouverte.",
    zh: "请识别附件图片的内容，并提议补充、整理到当前打开的笔记中。",
  },
  // ---- 認証ページ（サーバ描画 HTML） ----
  "auth.pendingHeading": { ja: "利用申請を受け付けました", en: "Your request has been received", fr: "Votre demande a bien été reçue", zh: "已收到你的使用申请" },
  "auth.pendingBody": {
    ja: "アカウント（<b>{{email}}</b>）の利用申請を受け付けました。<br />管理者の承認後にご利用いただけます。",
    en: "We've received the access request for <b>{{email}}</b>.<br />You'll be able to use the app once an administrator approves it.",
    fr: "Nous avons reçu la demande d'accès pour <b>{{email}}</b>.<br />Vous pourrez utiliser l'application dès qu'un administrateur l'aura approuvée.",
    zh: "已收到账号 <b>{{email}}</b> 的使用申请。<br />管理员批准后即可使用。",
  },
  "auth.pendingRelogin": { ja: "承認されたら、もう一度ログインしてください。", en: "Once approved, please log in again.", fr: "Une fois la demande approuvée, reconnectez-vous.", zh: "批准后请重新登录。" },
  "auth.backToTop": { ja: "トップへ戻る", en: "Back to top", fr: "Retour à l'accueil", zh: "返回首页" },
  "auth.logout": { ja: "ログアウト", en: "Log out", fr: "Se déconnecter", zh: "退出登录" },
  "auth.errorHeading": { ja: "ログインできませんでした", en: "Could not log in", fr: "Connexion impossible", zh: "登录失败" },
  "auth.googleFailed": { ja: "Google 認証に失敗しました。もう一度お試しください。", en: "Google sign-in failed. Please try again.", fr: "L'authentification Google a échoué. Veuillez réessayer.", zh: "Google 认证失败，请重试。" },
  "auth.loginError": {
    ja: "ログイン処理でエラーが発生しました。時間をおいて再度お試しください。",
    en: "An error occurred during login. Please try again later.",
    fr: "Une erreur est survenue lors de la connexion. Veuillez réessayer plus tard.",
    zh: "登录过程中发生错误，请稍后重试。",
  },
} as const satisfies Record<string, Record<Lang, string>>;

export type MessageKey = keyof typeof MESSAGES;

/** メッセージを翻訳する。{{name}} を params で置換する。 */
export function t(lang: Lang, key: MessageKey, params?: Params): string {
  const tpl = MESSAGES[key][lang] ?? MESSAGES[key][DEFAULT_LANG];
  if (!params) return tpl;
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, name: string) => (name in params ? String(params[name]) : `{{${name}}}`));
}

/** Context から言語を取り出して翻訳する（langMiddleware 適用後）。 */
export function tc(c: Context, key: MessageKey, params?: Params): string {
  return t(c.get("lang") ?? resolveLang(c), key, params);
}

/**
 * 翻訳キーを持つエラー。AI キー関連（MissingApiKeyError 等）が継承し、
 * レスポンスを返す箇所で translateError により表示言語へ変換する。
 */
export class LocalizedError extends Error {
  readonly messageKey?: MessageKey;
  readonly params?: Params;
  constructor(messageKey: MessageKey, params?: Params) {
    super(t(DEFAULT_LANG, messageKey, params));
    this.messageKey = messageKey;
    this.params = params;
  }
}

/** エラーを表示言語のメッセージへ。翻訳キーを持たない一般エラーは message をそのまま返す。 */
export function translateError(lang: Lang, err: unknown): string {
  if (err instanceof LocalizedError && err.messageKey) return t(lang, err.messageKey, err.params);
  return err instanceof Error ? err.message : String(err);
}
