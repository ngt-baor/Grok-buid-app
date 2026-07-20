import {
  forwardRef,
  memo,
  startTransition,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ClipboardEvent as ReactClipboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import type {
  AppSettings,
  AppVersionInfo,
  UpdateCheckResult,
  UpdateProgress,
  CliStatus,
  CliProgress,
  AuthStatus,
  AuthLoginProgress,
  ChatFileRef,
  ChatImage,
  ChatItem,
  ChatTab,
  ChecklistItem,
  DiffResult,
  FileNode,
  GitInfo,
  GitStatusLine,
  GitWorktree,
  HarnessInfo,
  MemoryStore,
  ModelInfo,
  PermissionRequest,
  ProfileHeatCell,
  ProfileStats,
  ProjectBundle,
  ProjectStore,
  PromptFile,
  PromptImage,
  RunbookEntry,
  SkillsListResult,
  StorageReport,
  UsageSnapshot,
} from "./vite-env";
import { MarkdownBody } from "./MarkdownBody";
import { createT, normalizeLocale, LOCALES, type Locale } from "./i18n";

const PERSONALITY_OPTIONS: { id: string; label: string; hint: string }[] = [
  { id: "realistic", label: "Thực tế", hint: "Trực tiếp, trade-off, hành động cụ thể" },
  { id: "friendly", label: "Thân thiện", hint: "Ấm áp, khuyến khích, vẫn rõ ràng" },
  { id: "concise", label: "Súc tích", hint: "Ngắn gọn, bullet, ít mở đầu" },
  { id: "technical", label: "Kỹ thuật", hint: "Thuật ngữ chính xác, cấu trúc hệ thống" },
  { id: "playful", label: "Vui", hint: "Nhẹ nhàng khi phù hợp, không hy sinh đúng" },
];

/** Read-only shortcut catalog for Settings → Phím tắt (only real app actions). */
type ShortcutEntry = {
  id: string;
  group: string;
  label: string;
  keys: string[];
  note?: string;
};

const SHORTCUT_CATALOG: ShortcutEntry[] = [
  {
    id: "palette",
    group: "Điều hướng",
    label: "Command palette",
    keys: ["Ctrl+K"],
  },
  {
    id: "sidebar",
    group: "Điều hướng",
    label: "Hiện / ẩn sidebar trái",
    keys: ["Ctrl+B"],
  },
  {
    id: "right",
    group: "Điều hướng",
    label: "Hiện / ẩn panel phải",
    keys: ["Ctrl+Alt+B"],
  },
  {
    id: "bottom",
    group: "Điều hướng",
    label: "Hiện / ẩn panel dưới",
    keys: ["Ctrl+J"],
  },
  {
    id: "files",
    group: "Điều hướng",
    label: "Panel Files",
    keys: ["Ctrl+Shift+E"],
  },
  {
    id: "diff",
    group: "Điều hướng",
    label: "Panel Diff",
    keys: ["Ctrl+Shift+D"],
  },
  {
    id: "git",
    group: "Điều hướng",
    label: "Panel Git",
    keys: ["Ctrl+Shift+G"],
  },
  {
    id: "focus-composer",
    group: "Điều hướng",
    label: "Focus ô nhập (composer)",
    keys: ["Ctrl+L"],
  },
  {
    id: "open-project",
    group: "Project & chat",
    label: "Mở project",
    keys: ["Ctrl+O"],
  },
  {
    id: "new-tab",
    group: "Project & chat",
    label: "Tab chat mới (trong project / tác vụ)",
    keys: ["Ctrl+N"],
  },
  {
    id: "new-standalone",
    group: "Project & chat",
    label: "Tác vụ mới (không project)",
    keys: ["Ctrl+Shift+N"],
  },
  {
    id: "tab-next",
    group: "Project & chat",
    label: "Tab tiếp theo",
    keys: ["Ctrl+Tab"],
  },
  {
    id: "tab-prev",
    group: "Project & chat",
    label: "Tab trước",
    keys: ["Ctrl+Shift+Tab"],
  },
  {
    id: "close-tab",
    group: "Project & chat",
    label: "Đóng tab hiện tại",
    keys: ["Ctrl+W"],
    note: "Hiện confirm trước khi đóng",
  },
  {
    id: "send",
    group: "Agent & composer",
    label: "Gửi tin (composer)",
    keys: ["Enter"],
    note: "Shift+Enter = xuống dòng",
  },
  {
    id: "start-agent",
    group: "Agent & composer",
    label: "Start / Restart agent",
    keys: ["Ctrl+Shift+Enter"],
  },
  {
    id: "stop-turn",
    group: "Agent & composer",
    label: "Dừng turn đang chạy",
    keys: ["Escape"],
    note: "Chỉ khi busy và không có modal khác",
  },
  {
    id: "perm-allow",
    group: "Agent & composer",
    label: "Permission: Allow once",
    keys: ["Y", "A"],
    note: "Khi modal tool permission mở",
  },
  {
    id: "perm-deny",
    group: "Agent & composer",
    label: "Permission: Deny",
    keys: ["N", "Escape"],
    note: "Khi modal tool permission mở",
  },
  {
    id: "settings",
    group: "Hệ thống",
    label: "Cài đặt",
    keys: ["Ctrl+,"],
  },
  {
    id: "shortcuts",
    group: "Hệ thống",
    label: "Mở danh sách phím tắt",
    keys: ["Ctrl+Shift+/"],
  },
  {
    id: "usage",
    group: "Hệ thống",
    label: "Mức dùng (Usage)",
    keys: ["Ctrl+Shift+U"],
  },
  {
    id: "terminal",
    group: "Hệ thống",
    label: "Terminal ngoài",
    keys: ["Ctrl+`"],
  },
  {
    id: "reload",
    group: "Hệ thống",
    label: "Tải lại cửa sổ",
    keys: ["Ctrl+R"],
  },
  {
    id: "force-reload",
    group: "Hệ thống",
    label: "Tải lại cứng",
    keys: ["Ctrl+Shift+R"],
  },
  {
    id: "devtools",
    group: "Hệ thống",
    label: "Developer tools",
    keys: ["Ctrl+Shift+I"],
  },
];

const DEFAULT_CUSTOM_INSTRUCTIONS = `Hãy trả lời rõ ràng, chính xác và có cấu trúc.

Nếu chưa hiểu rõ yêu cầu của tôi, hãy hỏi lại những chỗ hiểu/hướng làm tối quan trọng trước khi thực hiện. Tuyệt đối không tự đoán mò cách làm khi chưa chắc chắn.

Áp dụng tư duy phản biện có điều kiện với quyết định kỹ thuật, kiến trúc, bảo mật, quy trình hoặc yêu cầu có rủi ro — hãy chỉ ra giả định ngầm, dữ liệu thiếu, thiên kiến, điểm yếu lập luận và sự thật bị bỏ sót. Với tác vụ đơn giản đủ rõ, không cần phân tích dài.`;

/** Resizable side columns (px) — drag edge; double-click resets */
const SIDEBAR_MIN = 180;
const SIDEBAR_MAX = 420;
const SIDEBAR_DEFAULT = 260;
const RIGHT_MIN = 220;
const RIGHT_MAX = 560;
const RIGHT_DEFAULT = 292;
const LS_SIDEBAR_W = "grok.sidebarWidth";
const LS_RIGHT_W = "grok.rightWidth";
const LS_SIDEBAR_PROJECTS_OPEN = "grok.sidebar.projectsOpen";
const LS_SIDEBAR_TASKS_OPEN = "grok.sidebar.tasksOpen";
const LS_PINNED_PROJECTS = "grok.sidebar.pinnedProjects";
const LS_PROJECT_SORT = "grok.sidebar.projectSort";
const LS_PINNED_TABS = "grok.sidebar.pinnedTabs";
const LS_SIDEBAR_PINNED_OPEN = "grok.sidebar.pinnedOpen";
/** Codex-style: collapse long project lists behind “Hiển thị thêm”. */
const SIDEBAR_PROJECTS_PREVIEW = 6;
const STANDALONE_PIN_KEY = "__standalone__";

type ProjectSortMode = "pinned" | "recent";
/** Pinned chat tab — title snapshot so “Đã ghim” works when project not open. */
type PinnedTabEntry = { id: string; title: string };

type PinnedSidebarItem =
  | { kind: "project"; path: string }
  | {
      kind: "session";
      projectPath: string;
      tabId: string;
      title: string;
      isStandalone: boolean;
    };

function migratePinnedTabs(
  raw: unknown
): Record<string, PinnedTabEntry[]> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, PinnedTabEntry[]> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(v) || !k) continue;
    const entries: PinnedTabEntry[] = [];
    for (const item of v) {
      if (typeof item === "string" && item) {
        entries.push({ id: item, title: "Chat" });
      } else if (item && typeof item === "object") {
        const o = item as Record<string, unknown>;
        const id = String(o.id || "").trim();
        if (!id) continue;
        entries.push({
          id,
          title: String(o.title || "Chat").trim() || "Chat",
        });
      }
    }
    if (entries.length) out[k] = entries;
  }
  return out;
}

function readStoredBool(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null || raw === "") return fallback;
    if (raw === "0" || raw === "false") return false;
    if (raw === "1" || raw === "true") return true;
    return fallback;
  } catch {
    return fallback;
  }
}

function writeStoredBool(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function readStoredJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null || raw === "") return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeStoredJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

function readProjectSortMode(): ProjectSortMode {
  try {
    const raw = localStorage.getItem(LS_PROJECT_SORT);
    if (raw === "recent" || raw === "pinned") return raw;
  } catch {
    /* ignore */
  }
  return "pinned";
}

/** Pin-first sort; otherwise keep recent order. */
function orderSidebarProjects(
  list: string[],
  pinned: string[],
  mode: ProjectSortMode,
  pathEq: (a: string, b: string) => boolean
): string[] {
  if (mode !== "pinned" || pinned.length === 0) return list;
  const top: string[] = [];
  for (const pin of pinned) {
    const hit = list.find((p) => pathEq(p, pin));
    if (hit) top.push(hit);
  }
  const rest = list.filter((p) => !pinned.some((pin) => pathEq(p, pin)));
  return [...top, ...rest];
}

/** Codex: pinned sessions live in “Đã ghim” — keep under-project list unpinned only. */
function tabsWithoutPinned<T extends { id: string }>(
  tabs: T[],
  pinnedIds: string[]
): T[] {
  if (!pinnedIds.length) return tabs;
  return tabs.filter((t) => !pinnedIds.includes(t.id));
}

function clampPx(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function readStoredWidth(key: string, fallback: number, min: number, max: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null || raw === "") return fallback;
    return clampPx(Number(raw), min, max);
  } catch {
    return fallback;
  }
}

function writeStoredWidth(key: string, value: number) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* ignore quota / private mode */
  }
}

const MAX_ATTACHMENTS = 12;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_FILE_BYTES = 20 * 1024 * 1024;

/** Codex-style empty-state action cards (prompts run against Grok agent). */
const STARTER_CARDS: { id: string; icon: string; title: string; prompt: string; accent: string }[] = [
  {
    id: "explore",
    icon: "⌕",
    title: "Khám phá và hiểu code",
    accent: "blue",
    prompt:
      "Hãy khám phá cấu trúc project hiện tại: stack, entry points, module chính và tóm tắt kiến trúc. Chỉ đọc trước, chưa sửa code trừ khi tôi yêu cầu.",
  },
  {
    id: "build",
    icon: "✦",
    title: "Xây dựng tính năng, ứng dụng hoặc công cụ mới",
    accent: "violet",
    prompt:
      "Hãy đề xuất 2–3 tính năng hữu ích cho project này, rồi triển khai tính năng quan trọng nhất sau khi tôi xác nhận. Bắt đầu bằng orient ngắn (cấu trúc + chỗ chạm).",
  },
  {
    id: "review",
    icon: "↻",
    title: "Rà soát code và đề xuất thay đổi",
    accent: "green",
    prompt:
      "Rà soát code quan trọng trong project: rủi ro, bug tiềm ẩn, smell, security. Đề xuất thay đổi cụ thể theo file; chưa apply lớn nếu chưa được approve.",
  },
  {
    id: "fix",
    icon: "⚠",
    title: "Sửa sự cố và lỗi",
    accent: "orange",
    prompt:
      "Tìm lỗi / failing tests / log gần đây trong project và sửa. Sau khi sửa hãy verify (test hoặc reproduce). Báo cáo KEEP/DISCARD ngắn.",
  },
];

/** Empty-state cards when chat không gắn project (sidebar “Tác vụ”). */
const STANDALONE_STARTER_CARDS: {
  id: string;
  icon: string;
  title: string;
  prompt: string;
  accent: string;
}[] = [
  {
    id: "qa",
    icon: "💬",
    title: "Hỏi đáp + skills",
    accent: "blue",
    prompt:
      "Tôi muốn hỏi đáp chung (không gắn project code). Trả lời rõ ràng; khi hữu ích hãy gợi ý skill/slash command phù hợp (vd. /help, review).",
  },
  {
    id: "skills",
    icon: "✦",
    title: "Dùng skills / hướng dẫn",
    accent: "violet",
    prompt:
      "Liệt kê skills đang có thể dùng trong Grok Build và gợi ý cách gọi từng loại (bundled / user / agents). Không cần project folder.",
  },
  {
    id: "docs",
    icon: "📄",
    title: "Xem tài liệu và log",
    accent: "green",
    prompt:
      "Giúp tôi đọc / tóm tắt tài liệu hoặc log tôi đính kèm (hoặc mô tả). Không cần workspace project — chỉ phân tích nội dung tôi cung cấp.",
  },
  {
    id: "plan",
    icon: "✎",
    title: "Brainstorm / lên kế hoạch",
    accent: "orange",
    prompt:
      "Brainstorm và lập kế hoạch với tôi (ý tưởng, checklist, trade-off). Không sửa file project trừ khi tôi chỉ rõ path.",
  },
];

type ComposerAttachment =
  | {
      id: string;
      kind: "image";
      name: string;
      mimeType: string;
      dataUrl: string;
      data: string;
      size?: number;
    }
  | {
      id: string;
      kind: "file";
      name: string;
      path?: string;
      mimeType: string;
      text?: string;
      data?: string;
      size?: number;
      isBinary?: boolean;
      preview?: string;
    };

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Không đọc được file"));
    reader.readAsDataURL(blob);
  });
}

function readBlobAsText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Không đọc được text"));
    reader.readAsText(blob);
  });
}

function dataUrlToBase64(dataUrl: string): string {
  const i = dataUrl.indexOf(",");
  return i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
}

function formatBytes(n?: number) {
  if (n == null) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const TEXT_MIME_RE =
  /^(text\/|application\/(json|xml|javascript|x-javascript|typescript|sql|yaml|x-yaml|toml))/i;
const TEXT_EXT_RE =
  /\.(txt|md|json|js|ts|tsx|jsx|css|html|xml|yml|yaml|toml|ini|csv|log|py|rs|go|java|c|cpp|h|cs|sh|ps1|sql|env|vue|svelte|rb|php)$/i;

function isProbablyText(name: string, mime: string) {
  return TEXT_MIME_RE.test(mime) || TEXT_EXT_RE.test(name) || mime === "" || mime === "application/octet-stream";
}

async function browserFileToAttachment(file: File): Promise<ComposerAttachment | null> {
  const name = file.name || `file-${Date.now()}`;
  const mime = file.type || "application/octet-stream";
  // Electron File may have path
  const filePath = (file as File & { path?: string }).path;

  if (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg|ico)$/i.test(name)) {
    if (file.size > MAX_IMAGE_BYTES) {
      throw new Error(`Ảnh "${name}" quá lớn (>${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB)`);
    }
    const dataUrl = await readBlobAsDataUrl(file);
    const mimeType = mime.startsWith("image/")
      ? mime
      : dataUrl.slice(5, dataUrl.indexOf(";")) || "image/png";
    return {
      id: uid(),
      kind: "image",
      name,
      mimeType,
      dataUrl,
      data: dataUrlToBase64(dataUrl),
      size: file.size,
    };
  }

  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`File "${name}" quá lớn (>${Math.round(MAX_FILE_BYTES / 1024 / 1024)}MB)`);
  }

  if (isProbablyText(name, mime) && file.size < 2 * 1024 * 1024) {
    try {
      const text = await readBlobAsText(file);
      if (!text.includes("\u0000")) {
        return {
          id: uid(),
          kind: "file",
          name,
          path: filePath,
          mimeType: mime || "text/plain",
          text,
          size: file.size,
          isBinary: false,
          preview: text.slice(0, 200),
        };
      }
    } catch {
      /* fall through binary */
    }
  }

  const dataUrl = await readBlobAsDataUrl(file);
  return {
    id: uid(),
    kind: "file",
    name,
    path: filePath,
    mimeType: mime || "application/octet-stream",
    data: dataUrlToBase64(dataUrl),
    size: file.size,
    isBinary: true,
  };
}
function nowIso() {
  return new Date().toISOString();
}
function projectName(p: string) {
  return p.split(/[/\\]/).filter(Boolean).pop() || p;
}
function projectParentName(p: string) {
  const parts = p.split(/[/\\]/).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 2] : "";
}
function projectDisplayName(p: string, peers: string[]) {
  const base = projectName(p);
  const sameName = peers.filter(
    (peer) => projectName(peer).toLowerCase() === base.toLowerCase()
  );
  if (sameName.length <= 1) return base;
  const parent = projectParentName(p);
  const sameParent = sameName.filter(
    (peer) => projectParentName(peer).toLowerCase() === parent.toLowerCase()
  );
  return sameParent.length <= 1 ? `${base} \u00b7 ${parent || p}` : `${base} \u00b7 ${p}`;
}

/** Windows-safe project path compare (trim trailing slash, case-insensitive). */
function pathsEqual(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  const norm = (p: string) =>
    p
      .replace(/[/\\]+$/, "")
      .replace(/\//g, "\\")
      .toLowerCase();
  return norm(a) === norm(b);
}

/** Label for busy/elsewhere banners — standalone is not a “project folder”. */
function contextLabel(
  p?: string | null,
  standalonePath?: string | null,
  standaloneLabel = "Tác vụ (không project)"
): string {
  if (!p) return "—";
  if (standalonePath && pathsEqual(p, standalonePath)) return standaloneLabel;
  return projectName(p);
}
/** Compact absolute count — matches client style: 2.9K / 500K */
function formatNum(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `${Math.round(n / 1000)}K`;
  if (abs >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(Math.round(n));
}

/** Absolute used/limit for context & credits (e.g. "2.9K / 500K"). */
function formatUsedLimit(
  used: number | null | undefined,
  limit: number | null | undefined
): string | null {
  if (used == null || Number.isNaN(used)) return null;
  if (limit == null || !Number.isFinite(limit) || limit <= 0) {
    return formatNum(used);
  }
  return `${formatNum(used)} / ${formatNum(limit)}`;
}

/** used% → warn class for context chip (near full = bad). */
function usedPctTone(usedPct: number | null | undefined): "" | "mid" | "low" {
  if (usedPct == null || Number.isNaN(usedPct)) return "";
  if (usedPct >= 85) return "low";
  if (usedPct >= 65) return "mid";
  return "";
}

/** Compact stroke icons for sidebar footer / chrome */
function IconBolt({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M9.2 1.5 3.8 9.1h3.4L6.6 14.5l5.6-7.8H8.8L9.2 1.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

function IconPlus({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Codex-style project folder (outline). */
function IconFolder({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className="folder-svg"
    >
      <path
        d="M2.25 4.6c0-.75.6-1.35 1.35-1.35h2.05c.4 0 .78.18 1.03.49l.62.76c.12.15.3.24.49.24h4.61c.75 0 1.35.6 1.35 1.35v5.56c0 .75-.6 1.35-1.35 1.35H3.6c-.75 0-1.35-.6-1.35-1.35V4.6Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Three dots — SVG so the glyph is truly centered (Unicode … sits on the baseline). */
function IconMore({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden
      className="more-svg"
    >
      <circle cx="3.5" cy="8" r="1.35" />
      <circle cx="8" cy="8" r="1.35" />
      <circle cx="12.5" cy="8" r="1.35" />
    </svg>
  );
}

function IconSearch({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="6.25" stroke="currentColor" strokeWidth="1.85" />
      <path
        d="M16.2 16.2 20.5 20.5"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconBrowser({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="3.25"
        y="4.5"
        width="17.5"
        height="15"
        rx="2.2"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path d="M3.25 9h17.5" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="6.6" cy="6.75" r="0.85" fill="currentColor" />
      <circle cx="9.2" cy="6.75" r="0.85" fill="currentColor" />
      <circle cx="11.8" cy="6.75" r="0.85" fill="currentColor" />
    </svg>
  );
}

function IconGitBranch({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="6.5" cy="5.5" r="2.15" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="6.5" cy="18.5" r="2.15" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="17.5" cy="12" r="2.15" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M6.5 7.7v8.6M6.5 12h6.2a2.8 2.8 0 0 0 2.8-2.8V9.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconGear({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.85 1 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
        stroke="currentColor"
        strokeWidth="1.55"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconPanelRight({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="1.75" y="2.5" width="12.5" height="11" rx="1.6" stroke="currentColor" strokeWidth="1.2" />
      <path d="M10 2.5v11" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function IconPanelBottom({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="1.75" y="2.5" width="12.5" height="11" rx="1.6" stroke="currentColor" strokeWidth="1.2" />
      <path d="M1.75 10h12.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

/** Human-readable elapsed: 12s · 2m 33s · 1h 05m */
function formatElapsed(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
}

function tsToMs(ts?: string): number | undefined {
  if (!ts) return undefined;
  const n = Date.parse(ts);
  return Number.isNaN(n) ? undefined : n;
}

/** Extract http(s) URLs from assistant text for preview cards. */
function extractHttpUrls(text: string, limit = 4): string[] {
  if (!text) return [];
  const re = /https?:\/\/[^\s)\]}>'",]+/gi;
  const seen = new Set<string>();
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) != null) {
    let u = m[0].replace(/[.,;:!?]+$/, "");
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push(u);
    if (out.length >= limit) break;
  }
  return out;
}

function urlPreviewLabel(url: string): { title: string; sub: string } {
  try {
    const u = new URL(url);
    const host = u.hostname;
    const isLocal =
      host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host.endsWith(".local");
    return {
      title: isLocal ? "Xem trước trang web" : "Mở liên kết",
      sub: isLocal ? "Trang web" : host,
    };
  } catch {
    return { title: "Mở liên kết", sub: url.slice(0, 48) };
  }
}

function extractTextChunk(update: any): string {
  if (!update) return "";
  const content = update.content ?? update.text ?? update.delta ?? update.message;
  if (typeof content === "string") return content;
  if (content && typeof content === "object") {
    if (typeof content.text === "string") return content.text;
    if (Array.isArray(content)) {
      return content.map((c) => (typeof c === "string" ? c : c?.text || "")).join("");
    }
  }
  return "";
}

function extractToolCallId(update: any): string | undefined {
  if (!update) return undefined;
  const id =
    update.toolCallId ||
    update.tool_call_id ||
    update.callId ||
    update.call_id ||
    update.id ||
    update?.toolCall?.toolCallId ||
    update?.toolCall?.id;
  if (id == null || id === "") return undefined;
  return String(id);
}

/** ACP often uses call-<uuid>[-n] as title when name is missing. */
function looksLikeToolCallId(s: string): boolean {
  const t = (s || "").trim();
  if (!t) return true;
  if (/^call-[0-9a-f-]{8,}/i.test(t)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(t))
    return true;
  // Long opaque ids (no spaces, mostly hex / uuid-ish)
  if (t.length >= 28 && !/\s/.test(t) && /^[0-9a-z._:-]+$/i.test(t)) return true;
  return false;
}

/** Known tool ids + ACP `kind` → short Vietnamese labels (not snake_case dumps). */
const TOOL_FRIENDLY: Record<string, string> = {
  read_file: "Đọc file",
  read: "Đọc file",
  write: "Ghi file",
  write_file: "Ghi file",
  search_replace: "Sửa file",
  apply_patch: "Áp patch",
  str_replace: "Sửa file",
  edit: "Sửa file",
  run_terminal_command: "Chạy lệnh",
  bash: "Chạy lệnh",
  shell: "Chạy lệnh",
  execute: "Chạy lệnh",
  grep: "Tìm trong code",
  ripgrep: "Tìm trong code",
  codebase_search: "Tìm trong code",
  search: "Tìm trong code",
  glob: "Tìm file",
  glob_file_search: "Tìm file",
  list_dir: "Liệt kê thư mục",
  list_directory: "Liệt kê thư mục",
  web_search: "Tìm web",
  web_fetch: "Mở trang web",
  open_page: "Mở trang web",
  browse_page: "Mở trang web",
  fetch: "Mở trang web",
  todo_write: "Cập nhật todo",
  todo_read: "Xem todo",
  image_gen: "Tạo ảnh",
  image_edit: "Sửa ảnh",
  spawn_subagent: "Gọi subagent",
  task: "Gọi subagent",
  switch_mode: "Đổi chế độ",
  ask_user_question: "Hỏi người dùng",
  delete_file: "Xóa file",
  delete: "Xóa file",
  move: "Di chuyển",
  think: "Suy nghĩ",
  git: "Git",
  mcp: "MCP",
};

/** Content-block / JSON field noise — never show as a tool title. */
function isGarbageToolTitle(s: string): boolean {
  const t = (s || "").trim();
  if (!t) return true;
  if (t === "tool" || t === "Thao tác") return true;
  // Pretty-printed JSON lines: `"type": "content",` / `"path": "..."`
  if (/^["'][\w.-]+["']\s*:/.test(t)) return true;
  if (/^[\w.-]+\s*:\s*["'{[]/.test(t)) return true;
  // Bare ACP content-block types (not tool kinds)
  if (
    /^(content|diff|text|input|output|result|image|resource|rawinput|rawoutput|locations)$/i.test(
      t
    )
  ) {
    return true;
  }
  return false;
}

function normalizeToolKey(s: string): string {
  return (s || "")
    .trim()
    .replace(/^mcp__/i, "")
    .replace(/^functions?\./i, "")
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

/** snake_case / camelCase / mcp__x → readable words (fallback). */
function prettifyToolId(raw: string): string {
  const t = (raw || "").trim();
  if (!t) return "Thao tác";
  const key = normalizeToolKey(t);
  if (TOOL_FRIENDLY[key]) return TOOL_FRIENDLY[key];
  // Drop common prefixes that look like namespaces
  let body = t.replace(/^mcp__/i, "").replace(/^functions?\./i, "");
  if (body.includes("__")) body = body.split("__").pop() || body;
  // camelCase → spaces, snake → spaces
  body = body
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_./:-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!body || looksLikeToolCallId(body)) return "Thao tác";
  // Title-case first letter only; keep short
  const pretty = body.charAt(0).toUpperCase() + body.slice(1);
  return pretty.length > 40 ? `${pretty.slice(0, 38)}…` : pretty;
}

function basenamePath(p: string): string {
  const base = p.replace(/\\/g, "/").split("/").filter(Boolean).pop() || p;
  return base.length > 40 ? `${base.slice(0, 38)}…` : base;
}

/** Path for file-edit lists (Codex-style): keep last 2–3 segments when deep. */
function shortEditPath(p: string): string {
  const norm = (p || "").replace(/\\/g, "/").replace(/^\.?\//, "");
  const parts = norm.split("/").filter(Boolean);
  if (parts.length <= 3) return norm || p || "—";
  return parts.slice(-3).join("/");
}

function clipLabel(s: string, max = 48): string {
  const t = (s || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** Infer label from ACP content blocks (array of { type: diff|content|… }). */
function toolLabelFromContentBlocks(blocks: unknown[]): string | undefined {
  let hasDiff = false;
  let hasContent = false;
  let path: string | undefined;
  for (const block of blocks) {
    if (!block || typeof block !== "object") continue;
    const b = block as Record<string, unknown>;
    const type = String(b.type || b.kind || "").toLowerCase();
    if (type === "diff" || b.oldText != null || b.newText != null || b.diff != null) {
      hasDiff = true;
    } else if (type === "content" || type === "text") {
      hasContent = true;
    }
    if (!path) {
      const p = b.path || b.filePath || b.file_path;
      if (typeof p === "string" && p.trim()) path = p.trim();
    }
  }
  if (hasDiff) {
    return path ? `Sửa file · ${basenamePath(path)}` : "Sửa file";
  }
  if (path) return `File · ${basenamePath(path)}`;
  if (hasContent) return undefined; // not a useful tool name by itself
  return undefined;
}

/** Pull a human label from tool input/detail JSON when title is a raw call id. */
function toolLabelFromDetail(detail?: string): string | undefined {
  if (!detail) return undefined;
  const s = detail.trim();
  if (!s) return undefined;
  try {
    const parsed = JSON.parse(s) as unknown;
    // ACP often sends content: [{ type: "diff", … }, { type: "content", … }]
    if (Array.isArray(parsed)) {
      return toolLabelFromContentBlocks(parsed);
    }
    if (!parsed || typeof parsed !== "object") return undefined;
    const j = parsed as Record<string, unknown>;
    const pick = (v: unknown) =>
      typeof v === "string" &&
      v.trim() &&
      !looksLikeToolCallId(v) &&
      !isGarbageToolTitle(v)
        ? v.trim()
        : undefined;
    // Prefer action-looking names first, then path/cmd for context
    for (const k of ["toolName", "name", "title", "function", "method"]) {
      const v = pick(j[k]);
      if (v) {
        const mapped = TOOL_FRIENDLY[normalizeToolKey(v)];
        if (mapped) return mapped;
        if (!looksLikeToolCallId(v) && !/^[a-z0-9_.-]+$/i.test(v)) return clipLabel(v, 48);
        return prettifyToolId(v);
      }
    }
    const cmd = pick(j.command) || pick(j.cmd);
    if (cmd) {
      const first = cmd.split(/\s+/)[0] || cmd;
      return `Lệnh · ${clipLabel(first, 32)}`;
    }
    for (const k of ["path", "file", "target_file", "file_path", "target_directory"]) {
      const v = pick(j[k]);
      if (v) return `File · ${basenamePath(v)}`;
    }
    const q = pick(j.query) || pick(j.pattern) || pick(j.glob);
    if (q) return `Tìm · ${clipLabel(q, 36)}`;
    if (Array.isArray(j.content)) {
      const fromBlocks = toolLabelFromContentBlocks(j.content);
      if (fromBlocks) return fromBlocks;
    }
    const nested =
      (j.toolCall as Record<string, unknown> | undefined) ||
      (j.function as Record<string, unknown> | undefined);
    if (nested) {
      const n = pick(nested.name) || pick(nested.title);
      if (n) return prettifyToolId(n);
    }
    return undefined;
  } catch {
    /* not JSON — try free text below */
  }
  // Free text: never pick JSON field lines (`"type": "content",`)
  const line = s
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find(
      (l) =>
        l &&
        !looksLikeToolCallId(l) &&
        !isGarbageToolTitle(l) &&
        !l.startsWith("{") &&
        !l.startsWith("[") &&
        !l.startsWith("}") &&
        !l.startsWith("]") &&
        !l.endsWith(",")
    );
  if (line) return clipLabel(line, 48);
  return undefined;
}

/**
 * Short side-text on collapsed tool row — never dump raw JSON.
 * Prefer path / command / query; fall back empty.
 */
function toolPreviewLine(detail?: string): string {
  if (!detail) return "";
  const s = detail.trim();
  if (!s) return "";
  try {
    const j = JSON.parse(s) as Record<string, unknown>;
    const str = (k: string) =>
      typeof j[k] === "string" && (j[k] as string).trim()
        ? (j[k] as string).trim()
        : "";
    const cmd = str("command") || str("cmd");
    if (cmd) return clipLabel(cmd, 64);
    const path =
      str("path") ||
      str("file") ||
      str("target_file") ||
      str("file_path") ||
      str("target_directory");
    if (path) return clipLabel(path.replace(/\\/g, "/"), 64);
    const q = str("query") || str("pattern") || str("glob") || str("content");
    if (q) return clipLabel(q, 64);
    // Last resort: first string value that isn't an id / garbage type token
    for (const v of Object.values(j)) {
      if (
        typeof v === "string" &&
        v.trim() &&
        !looksLikeToolCallId(v) &&
        !isGarbageToolTitle(v) &&
        v.length < 200
      ) {
        return clipLabel(v, 64);
      }
    }
    return "";
  } catch {
    /* free text */
  }
  if (s.startsWith("{") || s.startsWith("[")) return "";
  const plain = s.replace(/\s+/g, " ").trim();
  if (isGarbageToolTitle(plain)) return "";
  return clipLabel(plain, 64);
}

function humanizeToolTitle(rawTitle: string, detail?: string): string {
  const t = (rawTitle || "").trim() || "tool";
  if (
    looksLikeToolCallId(t) ||
    t.toLowerCase() === "tool" ||
    isGarbageToolTitle(t)
  ) {
    const fromDetail = toolLabelFromDetail(detail);
    if (fromDetail) return fromDetail;
    return "Thao tác";
  }
  const key = normalizeToolKey(t);
  // TOOL_FRIENDLY covers tool ids + ACP kinds (edit/read/execute/…)
  let mapped = TOOL_FRIENDLY[key] || "";
  if (
    !mapped &&
    /^[a-zA-Z][a-zA-Z0-9_.-]*$/.test(t) &&
    (t.includes("_") || t.includes(".") || t.includes("-"))
  ) {
    mapped = prettifyToolId(t);
  }
  if (mapped) {
    // Add path/cmd/query context when we have detail — not a second technical dump
    if (detail) {
      const fromDetail = toolLabelFromDetail(detail);
      if (
        fromDetail &&
        /^(File|Lệnh|Tìm|Sửa file) · /.test(fromDetail)
      ) {
        const ctx = fromDetail.replace(/^(File|Lệnh|Tìm|Sửa file) · /, "");
        if (ctx && !mapped.includes(ctx)) {
          return clipLabel(`${mapped} · ${ctx}`, 52);
        }
      }
    }
    return mapped;
  }
  // Readable sentence-ish title from agent (e.g. "Edit App.tsx") — keep it
  if (t.includes(" ") || !/^[a-z0-9_.-]+$/i.test(t)) {
    return clipLabel(t, 52);
  }
  return prettifyToolId(t);
}

/** ACP status strings → short Vietnamese for the tool row. */
function formatToolStatus(status: string): string {
  const s = (status || "").trim().toLowerCase().replace(/[_-]+/g, " ");
  if (!s) return "";
  if (/pending|queued|waiting/.test(s)) return "chờ";
  if (/running|in progress|started|active|streaming/.test(s)) return "đang chạy";
  if (/success|completed|complete|done|ok|finished/.test(s)) return "xong";
  if (/fail|error|denied|rejected/.test(s)) return "lỗi";
  if (/cancel|abort|stop/.test(s)) return "đã hủy";
  // Unknown opaque status — don't show raw English
  if (/^[a-z0-9 ]+$/i.test(s) && s.length <= 16) return s;
  return "";
}

/**
 * Flatten markdown to a short plain-text skim line for turn-report "Tóm tắt".
 * Keeps meaning; drops ** / headers / table pipes so it doesn't look like source.
 */
function plainTextPreview(md: string, maxLen = 180): string {
  let s = (md || "").replace(/\r\n/g, "\n");
  // Fenced code → short marker
  s = s.replace(/```[\w-]*\n?[\s\S]*?```/g, " [code] ");
  // Inline code
  s = s.replace(/`([^`]+)`/g, "$1");
  // Images / links
  s = s.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1");
  s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  // Headings / emphasis / strike
  s = s.replace(/^#{1,6}\s+/gm, "");
  s = s.replace(/(\*\*|__)(.*?)\1/g, "$2");
  s = s.replace(/(\*|_)(.*?)\1/g, "$2");
  s = s.replace(/~~(.*?)~~/g, "$1");
  // GFM tables → drop separator rows, collapse cells
  s = s
    .split("\n")
    .filter((line) => !/^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(line))
    .map((line) => {
      if (line.includes("|")) {
        return line
          .split("|")
          .map((c) => c.trim())
          .filter(Boolean)
          .join(" · ");
      }
      return line;
    })
    .join(" ");
  s = s.replace(/\s+/g, " ").trim();
  if (!s) return "";
  if (s.length > maxLen) return `${s.slice(0, maxLen).trimEnd()}…`;
  return s;
}

function formatTool(update: any) {
  const toolCallId = extractToolCallId(update);
  const tc = update?.toolCall || update?.tool_call;
  // Prefer real titles / tool names; ACP `kind` (edit|read|execute|…) only as fallback
  const candidates = [
    update?.title,
    update?.toolName,
    update?.name,
    tc?.title,
    tc?.name,
    tc?.toolName,
    update?.kind,
    tc?.kind,
    toolCallId,
    "tool",
  ];
  let rawTitle = "tool";
  for (const c of candidates) {
    if (c == null || c === "") continue;
    const s = String(c).trim();
    if (!s || isGarbageToolTitle(s)) continue;
    rawTitle = s;
    break;
  }
  const status =
    update?.status ||
    update?.state ||
    tc?.status ||
    tc?.state ||
    "running";
  let detail: string | undefined;
  try {
    const raw =
      update?.rawInput ??
      update?.input ??
      update?.content ??
      update?.result ??
      update?.rawOutput ??
      update?.output ??
      tc?.rawInput ??
      tc?.content;
    if (raw != null) {
      detail = typeof raw === "string" ? raw : JSON.stringify(raw, null, 2);
      if (detail.length > 1200) detail = detail.slice(0, 1200) + "…";
    }
  } catch {
    /* ignore */
  }
  return {
    toolCallId,
    title: humanizeToolTitle(String(rawTitle), detail),
    status: String(status),
    detail,
  };
}

function upsertToolItem(
  prev: ChatItem[],
  tool: { toolCallId?: string; title: string; status: string; detail?: string }
): ChatItem[] {
  const ts = nowIso();
  if (tool.toolCallId) {
    const idx = prev.findIndex(
      (it) => it.kind === "tool" && it.toolCallId === tool.toolCallId
    );
    if (idx >= 0) {
      const cur = prev[idx];
      if (cur.kind !== "tool") return prev;
      const next = [...prev];
      const mergedDetail =
        tool.detail != null && tool.detail !== "" ? tool.detail : cur.detail;
      // Prefer human label over raw call-id / generic "tool" / JSON garbage
      const incoming = (tool.title || "").trim();
      const prevTitle = (cur.title || "").trim();
      let title = prevTitle || "tool";
      const incomingOk =
        incoming &&
        !looksLikeToolCallId(incoming) &&
        !isGarbageToolTitle(incoming);
      const prevBad =
        looksLikeToolCallId(prevTitle) ||
        !prevTitle ||
        isGarbageToolTitle(prevTitle);
      if (incomingOk && (prevBad || incoming !== prevTitle)) {
        // Prefer more specific labels (with path/cmd) when both are ok
        if (
          prevBad ||
          (incoming.includes(" · ") && !prevTitle.includes(" · ")) ||
          incoming.length >= prevTitle.length
        ) {
          title = incoming;
        }
      } else if (prevBad) {
        title = humanizeToolTitle(incoming || prevTitle, mergedDetail);
      }
      next[idx] = {
        ...cur,
        title,
        status: tool.status || cur.status,
        detail: mergedDetail,
        ts,
      };
      return next;
    }
  }
  // Fallback: merge last running tool with same title if no id
  if (!tool.toolCallId) {
    for (let i = prev.length - 1; i >= 0; i--) {
      const it = prev[i];
      if (it.kind !== "tool") continue;
      if (
        it.title === tool.title &&
        /pending|running|in_progress|in-progress/i.test(it.status)
      ) {
        const next = [...prev];
        next[i] = {
          ...it,
          status: tool.status || it.status,
          detail: tool.detail != null && tool.detail !== "" ? tool.detail : it.detail,
          ts,
        };
        return next;
      }
      break;
    }
  }
  return [
    ...prev,
    {
      id: uid(),
      kind: "tool",
      toolCallId: tool.toolCallId,
      title: tool.title,
      status: tool.status,
      detail: tool.detail,
      expanded: false,
      ts,
    },
  ];
}

function isToolRunning(status: string) {
  return /pending|running|in_progress|in-progress|started/i.test(status || "");
}

function isToolFailed(status: string) {
  return /fail|error|denied|cancel/i.test(status || "");
}

/** ACP permission option ids (Grok defaults + any agent-provided options[]). */
function resolvePermissionOptionIds(params: unknown): {
  onceId: string;
  alwaysId: string;
} {
  let onceId = "allow-once";
  let alwaysId = "allow-always";
  const opts = (params as { options?: unknown })?.options;
  if (!Array.isArray(opts)) return { onceId, alwaysId };
  for (const raw of opts) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const id = String(o.optionId ?? o.id ?? "").trim();
    if (!id) continue;
    const kind = String(o.kind ?? o.name ?? "").toLowerCase().replace(/[\s-]+/g, "_");
    if (
      kind.includes("allow_once") ||
      kind === "allowonce" ||
      /allow once|một lần/i.test(String(o.name || ""))
    ) {
      onceId = id;
    } else if (
      kind.includes("allow_always") ||
      kind === "allowalways" ||
      /always|mọi|session/i.test(String(o.name || ""))
    ) {
      alwaysId = id;
    }
  }
  return { onceId, alwaysId };
}

type ParsedPermPath = {
  path: string;
  additions?: number;
  deletions?: number;
};

type ParsedPermission = {
  kind: "edit" | "execute" | "read" | "delete" | "fetch" | "other";
  kindLabel: string;
  question: string;
  title?: string;
  paths: ParsedPermPath[];
  command?: string;
  rawFallback: string;
};

function countLineDiff(oldText: string, newText: string): { additions: number; deletions: number } {
  const a = (oldText || "").split(/\r?\n/);
  const b = (newText || "").split(/\r?\n/);
  // Common prefix/suffix first — avoids counting whole large files as +N/−N
  let pre = 0;
  const preMax = Math.min(a.length, b.length);
  while (pre < preMax && a[pre] === b[pre]) pre++;
  let suf = 0;
  const sufMax = Math.min(a.length - pre, b.length - pre);
  while (
    suf < sufMax &&
    a[a.length - 1 - suf] === b[b.length - 1 - suf]
  ) {
    suf++;
  }
  const midA = a.length - pre - suf;
  const midB = b.length - pre - suf;
  if (midA === 0 && midB === 0) {
    return oldText !== newText ? { additions: 1, deletions: 0 } : { additions: 0, deletions: 0 };
  }
  // Unique-line estimate only on the changed middle
  const setA = new Set(a.slice(pre, a.length - suf));
  const setB = new Set(b.slice(pre, b.length - suf));
  let additions = 0;
  let deletions = 0;
  for (const line of setB) if (!setA.has(line)) additions += 1;
  for (const line of setA) if (!setB.has(line)) deletions += 1;
  if (additions === 0 && deletions === 0) {
    additions = midB;
    deletions = midA;
    if (additions === 0 && deletions === 0) additions = 1;
  }
  return { additions, deletions };
}

function pushUniquePath(
  paths: ParsedPermPath[],
  path: string,
  stats?: { additions?: number; deletions?: number }
) {
  const p = (path || "").trim();
  if (!p || p.length > 800) return;
  const existing = paths.find((x) => x.path === p);
  if (existing) {
    if (stats?.additions != null) existing.additions = stats.additions;
    if (stats?.deletions != null) existing.deletions = stats.deletions;
    return;
  }
  paths.push({
    path: p,
    additions: stats?.additions,
    deletions: stats?.deletions,
  });
}

/**
 * Best-effort parse of ACP `session/request_permission` params.
 * Shape varies by agent — never throw; fall back to compact JSON.
 */
function parsePermissionParams(params: unknown): ParsedPermission {
  const root =
    params && typeof params === "object" ? (params as Record<string, unknown>) : {};
  const toolCall =
    (root.toolCall as Record<string, unknown> | undefined) ||
    (root.tool_call as Record<string, unknown> | undefined) ||
    (root.tool as Record<string, unknown> | undefined) ||
    {};

  const kindRaw = String(
    toolCall.kind || toolCall.type || root.kind || root.type || ""
  ).toLowerCase();
  const title = String(toolCall.title || root.title || "").trim() || undefined;

  let kind: ParsedPermission["kind"] = "other";
  if (/edit|write|patch|create|modif/i.test(kindRaw + " " + (title || ""))) kind = "edit";
  else if (/exec|shell|terminal|bash|cmd|run/i.test(kindRaw + " " + (title || "")))
    kind = "execute";
  else if (/read|search|list|glob|grep/i.test(kindRaw + " " + (title || ""))) kind = "read";
  else if (/delete|remove|unlink/i.test(kindRaw + " " + (title || ""))) kind = "delete";
  else if (/fetch|http|web|network|browse/i.test(kindRaw + " " + (title || "")))
    kind = "fetch";

  const kindLabel =
    kind === "edit"
      ? "Chỉnh sửa tệp"
      : kind === "execute"
        ? "Chạy lệnh"
        : kind === "read"
          ? "Đọc tệp"
          : kind === "delete"
            ? "Xóa tệp"
            : kind === "fetch"
              ? "Mạng / web"
              : title
                ? humanizeToolTitle(title)
                : "Quyền tool";

  const question =
    kind === "edit"
      ? "Cho phép agent chỉnh sửa các tệp sau đây?"
      : kind === "execute"
        ? "Cho phép agent chạy lệnh sau?"
        : kind === "delete"
          ? "Cho phép agent xóa các tệp sau đây?"
          : kind === "fetch"
            ? "Cho phép agent truy cập mạng?"
            : kind === "read"
              ? "Cho phép agent đọc các tệp sau đây?"
              : "Cho phép agent thực hiện thao tác sau?";

  const paths: ParsedPermPath[] = [];
  const rawInput =
    (toolCall.rawInput as Record<string, unknown> | undefined) ||
    (toolCall.input as Record<string, unknown> | undefined) ||
    (root.rawInput as Record<string, unknown> | undefined) ||
    {};

  const collectFromObj = (obj: unknown) => {
    if (!obj || typeof obj !== "object") return;
    const o = obj as Record<string, unknown>;
    for (const key of ["path", "filePath", "file_path", "target", "filepath"]) {
      if (typeof o[key] === "string") pushUniquePath(paths, o[key] as string);
    }
    if (Array.isArray(o.paths)) {
      for (const p of o.paths) if (typeof p === "string") pushUniquePath(paths, p);
    }
    if (Array.isArray(o.files)) {
      for (const f of o.files) {
        if (typeof f === "string") pushUniquePath(paths, f);
        else if (f && typeof f === "object") {
          const fo = f as Record<string, unknown>;
          const fp = String(fo.path || fo.filePath || fo.file_path || "");
          if (fp)
            pushUniquePath(paths, fp, {
              additions:
                typeof fo.additions === "number"
                  ? fo.additions
                  : typeof fo.added === "number"
                    ? fo.added
                    : undefined,
              deletions:
                typeof fo.deletions === "number"
                  ? fo.deletions
                  : typeof fo.deleted === "number"
                    ? fo.deleted
                    : undefined,
            });
        }
      }
    }
  };

  collectFromObj(rawInput);
  collectFromObj(toolCall);
  collectFromObj(root);

  const locations =
    (toolCall.locations as unknown[]) ||
    (root.locations as unknown[]) ||
    [];
  if (Array.isArray(locations)) {
    for (const loc of locations) {
      if (!loc || typeof loc !== "object") continue;
      const lo = loc as Record<string, unknown>;
      const p = String(lo.path || lo.filePath || lo.file_path || "");
      if (!p) continue;
      pushUniquePath(paths, p, {
        additions: typeof lo.additions === "number" ? lo.additions : undefined,
        deletions: typeof lo.deletions === "number" ? lo.deletions : undefined,
      });
    }
  }

  // Diff blocks in toolCall.content
  const content = toolCall.content || root.content;
  if (Array.isArray(content)) {
    for (const block of content) {
      if (!block || typeof block !== "object") continue;
      const b = block as Record<string, unknown>;
      const type = String(b.type || b.kind || "").toLowerCase();
      if (type === "diff" || b.oldText != null || b.newText != null || b.diff) {
        const p = String(b.path || b.filePath || b.file_path || "");
        const oldT = String(b.oldText ?? b.old_text ?? "");
        const newT = String(b.newText ?? b.new_text ?? b.updatedText ?? "");
        let additions =
          typeof b.additions === "number" ? b.additions : undefined;
        let deletions =
          typeof b.deletions === "number" ? b.deletions : undefined;
        if ((additions == null || deletions == null) && (oldT || newT)) {
          const st = countLineDiff(oldT, newT);
          additions = additions ?? st.additions;
          deletions = deletions ?? st.deletions;
        }
        if (p) pushUniquePath(paths, p, { additions, deletions });
      }
      if (typeof b.path === "string") pushUniquePath(paths, b.path);
    }
  }

  let command: string | undefined;
  if (kind === "execute") {
    const cmd = rawInput.command || rawInput.cmd || toolCall.command || root.command;
    if (typeof cmd === "string" && cmd.trim()) command = cmd.trim();
    else if (title && /`/.test(title)) command = title;
    else if (title) command = title;
  }

  let rawFallback = "";
  try {
    rawFallback = JSON.stringify(params, null, 2);
    if (rawFallback.length > 4000) rawFallback = rawFallback.slice(0, 4000) + "\n…";
  } catch {
    rawFallback = String(params ?? "");
  }

  return {
    kind,
    kindLabel,
    question,
    title,
    paths,
    command,
    rawFallback,
  };
}

/**
 * Usage row: remaining % + optional absolute used/limit (client: "2.9K / 500K").
 * Bar fills remaining % when remPct given; otherwise used % of limit.
 */
function UsageLimitRow({
  title,
  remPct,
  used,
  limit,
  absoluteLabel,
  hint,
  fillMode = "remaining",
}: {
  title: string;
  remPct?: number | null;
  used?: number | null;
  limit?: number | null;
  /** Override absolute text (e.g. already formatted). */
  absoluteLabel?: string | null;
  hint?: string;
  /** "remaining" = bar shows room left; "used" = bar shows consumption toward limit. */
  fillMode?: "remaining" | "used";
}) {
  const rem =
    remPct == null || Number.isNaN(remPct) ? null : Math.max(0, Math.min(100, remPct));
  let usedPct: number | null = null;
  if (rem != null) {
    usedPct = Math.max(0, Math.min(100, 100 - rem));
  } else if (limit != null && limit > 0 && used != null && Number.isFinite(used)) {
    usedPct = Math.max(0, Math.min(100, (used / limit) * 100));
  }

  const barPct =
    fillMode === "used"
      ? usedPct
      : rem != null
        ? rem
        : usedPct != null
          ? Math.max(0, 100 - usedPct)
          : null;

  const fillClass =
    usedPct == null
      ? ""
      : usedPct >= 85
        ? "crit"
        : usedPct >= 65
          ? "warn"
          : "";

  const abs =
    absoluteLabel ??
    (limit != null && limit > 0 && used != null
      ? formatUsedLimit(used, limit)
      : used != null
        ? formatNum(used)
        : null);

  const rightLabel =
    rem != null
      ? abs
        ? `${abs} · Còn ${rem.toFixed(0)}%`
        : `Còn ${rem.toFixed(0)}%`
      : abs
        ? usedPct != null
          ? `${abs} · ${usedPct.toFixed(0)}%`
          : abs
        : "—";

  return (
    <div className="usage-card">
      <div className="head">
        <div className="usage-titles">
          <span className="title">{title}</span>
          {hint ? <span className="sub">{hint}</span> : null}
        </div>
        <span className="pct" title={rightLabel}>
          {rightLabel}
        </span>
      </div>
      <div className="bar">
        <div
          className={`fill ${fillClass}`}
          style={{ width: `${barPct == null ? 0 : barPct}%` }}
        />
      </div>
    </div>
  );
}

function remainingPctFromWindow(
  w?: { remainingPercent?: number | null; usedPercent?: number | null; limit?: number | null } | null
): number | null {
  if (!w) return null;
  if (w.remainingPercent != null && Number.isFinite(w.remainingPercent)) {
    return Math.max(0, Math.min(100, w.remainingPercent));
  }
  if (w.usedPercent != null && Number.isFinite(w.usedPercent)) {
    return Math.max(0, Math.min(100, 100 - w.usedPercent));
  }
  if (w.limit != null && w.limit > 0 && typeof (w as { used?: number }).used === "number") {
    const used = (w as { used?: number }).used ?? 0;
    return Math.max(0, Math.min(100, 100 - (used / w.limit) * 100));
  }
  return null;
}

function formatUsageReset(iso?: string | null) {
  if (!iso) return undefined;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return undefined;
    return `Đặt lại lúc ${d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })}`;
  } catch {
    return undefined;
  }
}

/** Skip empty / line-only noise that paints the chat with horizontal rules. */
function isNoiseChatText(text: string | undefined | null) {
  if (text == null) return true;
  const t = text.trim();
  if (!t) return true;
  // Only box-drawing / dashes / underscores / whitespace
  if (/^[\s_\-–—─═━┄┅┈┉·.•*]+$/u.test(t)) return true;
  // Blocks that are mostly blank or separator lines (the "kẻ ngang" spam)
  const lines = t.split(/\r?\n/);
  if (lines.length >= 4) {
    const sep = lines.filter(
      (l) => !l.trim() || /^[\s_\-–—─═━┄┅┈┉·.•*]+$/u.test(l.trim())
    );
    if (sep.length / lines.length >= 0.8) return true;
  }
  return false;
}

function shouldShowChatItem(it: ChatItem) {
  if (it.kind === "system") return false;
  if (it.kind === "run") return true;
  if (it.kind === "tool") return true;
  if (it.kind === "turn_report") return true;
  if (it.kind === "user") {
    const hasMedia =
      (it.images && it.images.length > 0) || (it.files && it.files.length > 0);
    return hasMedia || !isNoiseChatText(it.text);
  }
  return !isNoiseChatText(it.text);
}

/** Items belonging to one agent turn (from run header until next user / report). */
function collectTurnSlice(items: ChatItem[], runId: string | null): ChatItem[] {
  let start = -1;
  if (runId) {
    start = items.findIndex((it) => it.kind === "run" && it.id === runId);
  }
  if (start < 0) {
    for (let i = items.length - 1; i >= 0; i--) {
      if (items[i].kind === "run") {
        start = i;
        break;
      }
    }
  }
  if (start < 0) {
    // No run header — take from last user message
    for (let i = items.length - 1; i >= 0; i--) {
      if (items[i].kind === "user") {
        start = i;
        break;
      }
    }
  }
  if (start < 0) start = 0;
  const slice: ChatItem[] = [];
  for (let i = start; i < items.length; i++) {
    const it = items[i];
    if (i > start && it.kind === "user") break;
    if (it.kind === "turn_report") continue;
    slice.push(it);
  }
  return slice;
}

type TurnReportItem = Extract<ChatItem, { kind: "turn_report" }>;

/** Follow-up prompt waiting while agent is busy (Codex-style queue). */
type QueuedPrompt = {
  id: string;
  text: string;
  tabId: string;
  projectPath: string;
  imagesForPrompt?: PromptImage[];
  filesForPrompt?: PromptFile[];
  imagesForChat?: ChatImage[];
  filesForChat?: ChatFileRef[];
  createdAt: number;
};

function summarizeTurnFileEdits(
  diffs: DiffResult[]
): NonNullable<TurnReportItem["fileEdits"]> | undefined {
  if (!diffs.length) return undefined;
  // Last write wins per path (Map insertion order preserved for display)
  const byPath = new Map<string, DiffResult>();
  for (const d of diffs) {
    const key = (d.filePath || "").trim();
    if (!key) continue;
    byPath.set(key, d);
  }
  if (!byPath.size) return undefined;
  let additions = 0;
  let deletions = 0;
  const paths: { path: string; additions: number; deletions: number }[] = [];
  for (const d of byPath.values()) {
    const a = d.stats?.additions || 0;
    const del = d.stats?.deletions || 0;
    additions += a;
    deletions += del;
    if (paths.length < 24) {
      paths.push({ path: d.filePath, additions: a, deletions: del });
    }
  }
  return { files: byPath.size, additions, deletions, paths };
}

function buildTurnReportItem(
  items: ChatItem[],
  runId: string | null,
  status: "done" | "cancelled" | "error",
  durationMs: number,
  fileEdits?: TurnReportItem["fileEdits"]
): TurnReportItem {
  const slice = collectTurnSlice(items, runId);
  const tools = slice.filter(
    (it): it is Extract<ChatItem, { kind: "tool" }> => it.kind === "tool"
  );
  const thoughts = slice.filter((it) => it.kind === "thought");
  const assistants = slice.filter(
    (it): it is Extract<ChatItem, { kind: "assistant" }> => it.kind === "assistant"
  );
  const lastAssistant = assistants[assistants.length - 1];
  const toolFail = tools.filter((t) => isToolFailed(t.status)).length;
  const toolOk = Math.max(0, tools.length - toolFail);
  /**
   * Aggregate by action type (not per-file path) so the summary stays scannable:
   * "Đọc file ×3 · Chạy lệnh ×2" instead of 5 path-long lines.
   */
  const titleCounts = new Map<string, number>();
  for (const t of tools) {
    const title = humanizeToolTitle(
      (t.title || "tool").trim() || "tool",
      t.detail
    );
    // Strip any leftover " · context" if title was already enriched in storage
    const base = title.split(" · ")[0]?.trim() || title;
    if (!base || base === "Thao tác" || isGarbageToolTitle(base)) continue;
    titleCounts.set(base, (titleCounts.get(base) || 0) + 1);
  }
  const toolTitles: string[] = [];
  for (const [name, n] of titleCounts) {
    toolTitles.push(n > 1 ? `${name} ×${n}` : name);
    if (toolTitles.length >= 8) break;
  }
  let assistantPreview: string | undefined;
  if (lastAssistant?.text) {
    const plain = plainTextPreview(lastAssistant.text, 180);
    if (plain && !isNoiseChatText(plain)) {
      assistantPreview = plain;
    }
  }
  return {
    id: uid(),
    kind: "turn_report",
    status,
    durationMs: Math.max(0, durationMs || 0),
    toolCount: tools.length,
    toolOk,
    toolFail,
    toolTitles,
    thoughtCount: thoughts.length,
    assistantPreview,
    runId: runId || undefined,
    fileEdits: fileEdits || undefined,
    ts: nowIso(),
  };
}

function turnReportHeadline(
  status: "done" | "cancelled" | "error",
  durationMs: number
): string {
  const elapsed = formatElapsed(durationMs || 0);
  if (status === "cancelled") return `Đã dừng · ${elapsed}`;
  if (status === "error") return `Kết thúc lỗi · ${elapsed}`;
  return `Đã chạy xong · ${elapsed}`;
}

function turnReportNotifyBody(report: TurnReportItem): string {
  // Keep toast/OS body short — no paths, tool chips, or +/- noise.
  const n = report.fileEdits?.files ?? 0;
  if (n <= 0) return "";
  return n === 1 ? "Đã chỉnh sửa 1 tệp" : `Đã chỉnh sửa ${n} tệp`;
}

type TurnDoneToast = {
  id: string;
  status: "done" | "cancelled" | "error";
  headline: string;
  body: string;
};

let notifyPermissionAsked = false;
function notifyTurnDone(report: TurnReportItem) {
  try {
    if (typeof Notification === "undefined") return;
    // Only ping when user is away from the window
    if (typeof document !== "undefined" && !document.hidden) return;
    if (Notification.permission === "denied") return;
    const show = () => {
      const n = new Notification(turnReportHeadline(report.status, report.durationMs), {
        body: turnReportNotifyBody(report),
        silent: false,
      });
      // Auto-close after a few seconds so it doesn't pile up
      window.setTimeout(() => n.close(), 8000);
    };
    if (Notification.permission === "granted") {
      show();
      return;
    }
    if (!notifyPermissionAsked) {
      notifyPermissionAsked = true;
      void Notification.requestPermission().then((p) => {
        if (p === "granted") show();
      });
    }
  } catch {
    /* ignore */
  }
}

/**
 * Activity display role (Codex-style):
 * - live: ticking “Đang hoạt động”
 * - tool_group: mid-turn tool/thought cluster → “Đã chạy các lệnh” (NOT “Đã chạy xong”)
 * - done: only when this segment is the end-of-turn marker and no turn_report follows
 * - cancelled: run was stopped
 */
type ActivityVariant = "live" | "tool_group" | "done" | "cancelled";

type ChatTurnBlock =
  | { type: "user"; item: Extract<ChatItem, { kind: "user" }>; turnStart?: boolean }
  | {
      type: "activity";
      /** Stable key — run item id or first intermediate id */
      key: string;
      run?: Extract<ChatItem, { kind: "run" }>;
      steps: ChatItem[];
      isLive: boolean;
      /** How the header should read — avoids N× “Đã chạy xong” per turn */
      variant: ActivityVariant;
    }
  | { type: "assistant"; item: Extract<ChatItem, { kind: "assistant" }> }
  | { type: "turn_report"; item: Extract<ChatItem, { kind: "turn_report" }> }
  | { type: "error"; item: Extract<ChatItem, { kind: "error" }> }
  | { type: "other"; item: ChatItem };

/** Elapsed ms for a finished (or intermediate) activity segment — never uses the live clock. */
function activityStaticDurationMs(block: {
  run?: Extract<ChatItem, { kind: "run" }>;
  steps: ChatItem[];
}): number {
  const run = block.run;
  // Prefer step/run timestamps so mid-turn segments keep their own span
  // (run.durationMs is the whole turn and would make every card look identical).
  const times: number[] = [];
  const runStart = run?.ts ? tsToMs(run.ts) : undefined;
  if (runStart != null) times.push(runStart);
  for (const s of block.steps) {
    const t = tsToMs(s.ts);
    if (t != null) times.push(t);
  }
  if (times.length >= 2) {
    return Math.max(0, Math.max(...times) - Math.min(...times));
  }
  if (run && run.status !== "running" && run.durationMs > 0) {
    return run.durationMs;
  }
  return Math.max(0, run?.durationMs || 0);
}

/**
 * Group a flat chat list into Codex-style turns:
 * user → (tool groups + assistant text)… → one end-of-turn report.
 *
 * Important:
 * - At most ONE activity block is live.
 * - Mid-turn assistant messages split tools into several activity segments;
 *   only the last open segment of the current turn may tick.
 * - Finished mid-turn segments are tool_groups (“Đã chạy các lệnh”), not
 *   repeated “Đã chạy xong” banners. End-of-turn is turn_report (or a single
 *   done activity if turn_report is off).
 */
function buildChatTurnBlocks(
  items: ChatItem[],
  opts: { liveTurn: boolean; liveRunId?: string | null }
): ChatTurnBlock[] {
  const visible = items.filter(shouldShowChatItem);
  const blocks: ChatTurnBlock[] = [];
  let stepBuf: ChatItem[] = [];
  let runItem: Extract<ChatItem, { kind: "run" }> | undefined;
  let seenUser = false;

  const flushSteps = () => {
    if (!runItem && stepBuf.length === 0) return;
    // Provisional — refined below so only the last live segment ticks
    const provisionalLive =
      (runItem != null &&
        runItem.status === "running" &&
        (!opts.liveRunId || runItem.id === opts.liveRunId)) ||
      (opts.liveTurn && !runItem && stepBuf.length > 0);
    const key = runItem?.id || stepBuf[0]?.id || "activity";
    blocks.push({
      type: "activity",
      key,
      run: runItem,
      steps: stepBuf,
      isLive: provisionalLive,
      // Refined after full pass
      variant: provisionalLive ? "live" : "tool_group",
    });
    stepBuf = [];
    runItem = undefined;
  };

  for (let i = 0; i < visible.length; i++) {
    const it = visible[i];
    if (it.kind === "user") {
      flushSteps();
      blocks.push({ type: "user", item: it, turnStart: seenUser });
      seenUser = true;
      continue;
    }
    if (it.kind === "run") {
      // New run header — flush previous activity first
      flushSteps();
      runItem = it;
      continue;
    }
    if (it.kind === "thought" || it.kind === "tool") {
      stepBuf.push(it);
      continue;
    }
    if (it.kind === "assistant") {
      flushSteps();
      blocks.push({ type: "assistant", item: it });
      continue;
    }
    if (it.kind === "turn_report") {
      flushSteps();
      blocks.push({ type: "turn_report", item: it });
      continue;
    }
    if (it.kind === "error") {
      flushSteps();
      blocks.push({ type: "error", item: it });
      continue;
    }
    flushSteps();
    blocks.push({ type: "other", item: it });
  }

  // Leftover activity (in-flight turn before final assistant lands)
  flushSteps();

  // Only the last provisional-live activity may keep ticking.
  // Otherwise every mid-turn segment shares the same global clock (sync bug).
  let lastLiveIdx = -1;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.type === "activity" && b.isLive) lastLiveIdx = i;
  }
  if (!opts.liveTurn) {
    for (const b of blocks) {
      if (b.type === "activity") b.isLive = false;
    }
  } else if (lastLiveIdx >= 0) {
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (b.type === "activity" && b.isLive && i !== lastLiveIdx) {
        b.isLive = false;
      }
    }
  }

  /**
   * Classify activity variants so one agent turn never paints N green
   * “Đã chạy xong” rows (Codex: tool groups + one end marker).
   *
   * Scan each turn window [user … next user | end]:
   * - live → live
   * - cancelled run → cancelled
   * - if a turn_report exists in the window → every activity is tool_group
   * - else the last activity in the window may be done (setting off)
   * - earlier activities always tool_group
   */
  {
    let turnStart = 0;
    const classifyTurn = (from: number, to: number) => {
      let hasReport = false;
      let lastActivity = -1;
      for (let i = from; i < to; i++) {
        const b = blocks[i];
        if (b.type === "turn_report") hasReport = true;
        if (b.type === "activity") lastActivity = i;
      }
      for (let i = from; i < to; i++) {
        const b = blocks[i];
        if (b.type !== "activity") continue;
        if (b.isLive) {
          b.variant = "live";
          continue;
        }
        // turn_report (or only the last segment when report is off) owns end status —
        // never paint N× green “Đã chạy xong” inside one user turn.
        if (hasReport || i !== lastActivity) {
          b.variant = "tool_group";
          continue;
        }
        if (b.run?.status === "cancelled") {
          b.variant = "cancelled";
        } else {
          b.variant = "done";
        }
      }
    };
    for (let i = 0; i < blocks.length; i++) {
      if (blocks[i].type === "user" && i > turnStart) {
        classifyTurn(turnStart, i);
        turnStart = i;
      }
    }
    classifyTurn(turnStart, blocks.length);
  }

  return blocks;
}

type PaletteCmd = { id: string; label: string; hint?: string; run: () => void };

/** Imperative API so parent can send/clear draft without owning keystroke state. */
export type ComposerDraftHandle = {
  getValue: () => string;
  setValue: (v: string) => void;
  clear: () => void;
  focus: () => void;
};

/** True when focus is in the composer textarea (prefer over React state during stream). */
function isTypingInComposer(): boolean {
  if (typeof document === "undefined") return false;
  const el = document.activeElement;
  return (
    el instanceof HTMLTextAreaElement && Boolean(el.closest(".composer"))
  );
}

/**
 * DOM-first draft textarea (uncontrolled).
 * Keystrokes update the native value only — no React setState per char/backspace.
 * Parent App re-renders (stream/tools) must not block typing; keep callbacks stable.
 *
 * onSync is intentional ref-only bookkeeping (cheap). onNonEmptyChange must also
 * avoid App setState — parent should toggle send-button.disabled via DOM.
 */
const ComposerDraftField = memo(
  forwardRef<
    ComposerDraftHandle,
    {
      resetKey: string;
      initialValue?: string;
      placeholder?: string;
      disabled?: boolean;
      onSync?: (value: string) => void;
      onNonEmptyChange?: (nonEmpty: boolean) => void;
      onPaste?: (e: ReactClipboardEvent<HTMLTextAreaElement>) => void;
      onSubmit?: () => void;
    }
  >(function ComposerDraftField(
    {
      resetKey,
      initialValue = "",
      placeholder,
      disabled,
      onSync,
      onNonEmptyChange,
      onPaste,
      onSubmit,
    },
    ref
  ) {
    const taRef = useRef<HTMLTextAreaElement>(null);
    const lastKey = useRef<string | null>(null);
    const lastNonEmpty = useRef(Boolean((initialValue || "").trim()));
    const onSyncRef = useRef(onSync);
    const onNonEmptyRef = useRef(onNonEmptyChange);
    const onPasteRef = useRef(onPaste);
    const onSubmitRef = useRef(onSubmit);
    // Keep latest handlers without forcing re-renders when parent recreates lambdas.
    onSyncRef.current = onSync;
    onNonEmptyRef.current = onNonEmptyChange;
    onPasteRef.current = onPaste;
    onSubmitRef.current = onSubmit;

    const notify = (v: string) => {
      // Ref sync only — never setState here.
      onSyncRef.current?.(v);
      const ne = Boolean(v.trim());
      if (ne !== lastNonEmpty.current) {
        lastNonEmpty.current = ne;
        onNonEmptyRef.current?.(ne);
      }
    };

    // Reset only when tab/project changes — not on every parent render / keystroke seed.
    useEffect(() => {
      if (lastKey.current === resetKey) return;
      lastKey.current = resetKey;
      const v = initialValue || "";
      if (taRef.current) taRef.current.value = v;
      lastNonEmpty.current = Boolean(v.trim());
      onSyncRef.current?.(v);
      onNonEmptyRef.current?.(lastNonEmpty.current);
    }, [resetKey, initialValue]);

    useImperativeHandle(
      ref,
      () => ({
        getValue: () => taRef.current?.value ?? "",
        setValue: (v: string) => {
          if (taRef.current) taRef.current.value = v;
          onSyncRef.current?.(v);
          const ne = Boolean(v.trim());
          if (ne !== lastNonEmpty.current) {
            lastNonEmpty.current = ne;
            onNonEmptyRef.current?.(ne);
          } else {
            // Same nonEmpty flag but value changed externally — still notify parent
            // so send-button can stay correct if it only listens to nonEmpty edges.
            onNonEmptyRef.current?.(ne);
          }
        },
        clear: () => {
          if (taRef.current) taRef.current.value = "";
          onSyncRef.current?.("");
          if (lastNonEmpty.current) {
            lastNonEmpty.current = false;
            onNonEmptyRef.current?.(false);
          } else {
            onNonEmptyRef.current?.(false);
          }
        },
        focus: () => taRef.current?.focus(),
      }),
      []
    );

    return (
      <textarea
        ref={taRef}
        defaultValue={initialValue}
        placeholder={placeholder}
        disabled={disabled}
        // Uncontrolled: do not pass value= — native DOM owns keystrokes.
        onInput={(e) => {
          notify(e.currentTarget.value);
        }}
        onPaste={(e) => onPasteRef.current?.(e)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSubmitRef.current?.();
          }
        }}
      />
    );
  })
);

/** Isolated 1s timer so activity header ticks without re-rendering the whole App. */
function LiveElapsed({ startedAtMs }: { startedAtMs: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startedAtMs == null) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAtMs]);
  const ms = startedAtMs != null ? Math.max(0, now - startedAtMs) : 0;
  return <>{formatElapsed(ms)}</>;
}

type PillOption = { id: string; label: string };

/** Custom dark-theme select — avoids Windows native blue highlight menus. */
function PillSelect({
  value,
  options,
  onChange,
  disabled,
  title,
  className = "",
}: {
  value: string;
  options: PillOption[];
  onChange: (id: string) => void;
  disabled?: boolean;
  title?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    minWidth: number;
    openUp: boolean;
  } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const selected = options.find((o) => o.id === value) || options[0];
  const label = selected?.label || value;

  const placeMenu = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const spaceAbove = r.top;
    const openUp = spaceAbove > 160;
    setMenuPos({
      left: Math.max(8, r.left),
      minWidth: Math.max(r.width, 140),
      openUp,
      ...(openUp
        ? { bottom: window.innerHeight - r.top + 6 }
        : { top: r.bottom + 6 }),
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    placeMenu();
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onReposition = () => placeMenu();
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open, placeMenu]);

  return (
    <div className={`pill-select ${className}`} ref={rootRef}>
      <button
        type="button"
        className={`pill-select-trigger ${open ? "open" : ""}`}
        disabled={disabled}
        title={title}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          if (disabled) return;
          if (!open) placeMenu();
          setOpen((v) => !v);
        }}
      >
        <span className="pill-select-label">{label}</span>
        <span className="pill-select-caret" aria-hidden />
      </button>
      {open && menuPos && (
        <ul
          ref={menuRef}
          className="pill-select-menu pill-select-menu-fixed"
          role="listbox"
          style={{
            left: menuPos.left,
            minWidth: menuPos.minWidth,
            top: menuPos.top,
            bottom: menuPos.bottom,
          }}
        >
          {options.map((o) => (
            <li key={o.id} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={o.id === value}
                className={`pill-select-option ${o.id === value ? "active" : ""}`}
                onClick={() => {
                  onChange(o.id);
                  setOpen(false);
                }}
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function effortLabel(id: string, raw?: string) {
  if (raw && /effort/i.test(raw)) return raw;
  const base = raw || id;
  const pretty = base.charAt(0).toUpperCase() + base.slice(1).toLowerCase();
  return /effort/i.test(pretty) ? pretty : `${pretty} Effort`;
}

const CHAT_BLOCK_PAGE_SIZE = 40;

export function App() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  /** When remote Grok avatar fails to load, fall back to letter monogram. */
  const [avatarBroken, setAvatarBroken] = useState(false);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [model, setModel] = useState("grok-4.5");
  const [effort, setEffort] = useState("high");
  const [projectPath, setProjectPath] = useState("");
  /** Internal sandbox path for chat without a code project (from main). */
  const [standalonePath, setStandalonePath] = useState("");
  /** Tab store for “Tác vụ” even when viewing a real project. */
  const [standaloneStore, setStandaloneStore] = useState<ProjectStore | null>(null);
  const [harness, setHarness] = useState<HarnessInfo | null>(null);
  const [store, setStore] = useState<ProjectStore | null>(null);
  const [items, setItems] = useState<ChatItem[]>([]);
  const [agentReady, setAgentReady] = useState(false);
  const [sessionId, setSessionId] = useState("");
  /** MCP server names injected into the current ACP session */
  const [activeMcpServers, setActiveMcpServers] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  /** Tab that owns the in-flight agent turn (background-safe). */
  const [busyTabId, setBusyTabId] = useState<string | null>(null);
  /** Project path that owns the in-flight turn (survives project switch). */
  const [busyProjectPath, setBusyProjectPath] = useState<string | null>(null);
  /** Codex-style follow-up queue while agent is busy (current session UI). */
  const [promptQueue, setPromptQueue] = useState<QueuedPrompt[]>([]);
  const [queueMenuId, setQueueMenuId] = useState<string | null>(null);
  const [editingQueueId, setEditingQueueId] = useState<string | null>(null);
  const [editQueueText, setEditQueueText] = useState("");
  /** Cwd of the live ACP bridge (null if no agent process). */
  const [agentCwd, setAgentCwd] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  /**
   * Draft non-empty flag lives in a ref — toggling must NOT setState on App
   * (first/last keystroke used to re-render the whole shell). Send button
   * disabled is patched via DOM in syncSendEnabled().
   */
  const draftNonEmptyRef = useRef(false);
  const sendBtnRef = useRef<HTMLButtonElement | null>(null);
  /** Seed when switching tab/project (ComposerDraftField owns live keystrokes). */
  const [draftSeed, setDraftSeed] = useState("");
  const composerRef = useRef<ComposerDraftHandle | null>(null);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const attachmentsLenRef = useRef(0);
  const [dragOver, setDragOver] = useState(false);
  const [permission, setPermission] = useState<PermissionRequest | null>(null);
  /** Codex-style split: primary Allow once + menu for Allow always */
  const [permAllowMenuOpen, setPermAllowMenuOpen] = useState(false);
  /** Composer chip: permission policy menu (only modes this app supports) */
  const [permModeMenuOpen, setPermModeMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [draftSettings, setDraftSettings] = useState<Partial<AppSettings>>({});
  /** UI language — draft takes precedence so Settings preview is live before Save. */
  const locale: Locale = normalizeLocale(
    draftSettings.locale ?? settings?.locale ?? "vi"
  );
  const t = useMemo(() => createT(locale), [locale]);
  const [usage, setUsage] = useState<UsageSnapshot | null>(null);
  const usageRef = useRef<UsageSnapshot | null>(null);
  const [storageReport, setStorageReport] = useState<StorageReport | null>(null);
  const [tree, setTree] = useState<FileNode[]>([]);
  const [preview, setPreview] = useState<{ path: string; content: string } | null>(null);
  const [diffs, setDiffs] = useState<DiffResult[]>([]);
  const [rightTab, setRightTab] = useState<"files" | "diff" | "preview" | "harness" | "git">(
    "files"
  );
  const [showRight, setShowRight] = useState(true);
  const [showLeft, setShowLeft] = useState(true);
  /** Sidebar section collapse (Codex-style Dự án › / Tác vụ ›). */
  const [sidebarProjectsOpen, setSidebarProjectsOpen] = useState(() =>
    readStoredBool(LS_SIDEBAR_PROJECTS_OPEN, true)
  );
  const [sidebarTasksOpen, setSidebarTasksOpen] = useState(() =>
    readStoredBool(LS_SIDEBAR_TASKS_OPEN, true)
  );
  const [sidebarPinnedOpen, setSidebarPinnedOpen] = useState(() =>
    readStoredBool(LS_SIDEBAR_PINNED_OPEN, true)
  );
  const [showAllProjects, setShowAllProjects] = useState(false);
  /** Local pin list (paths) — not cloud. */
  const [pinnedProjects, setPinnedProjects] = useState<string[]>(() => {
    const raw = readStoredJson<string[]>(LS_PINNED_PROJECTS, []);
    return Array.isArray(raw) ? raw.filter((x) => typeof x === "string") : [];
  });
  const [projectSortMode, setProjectSortMode] = useState<ProjectSortMode>(() =>
    readProjectSortMode()
  );
  /** projectPath → pinned tabs (id + title snapshot). */
  const [pinnedTabsByProject, setPinnedTabsByProject] = useState<
    Record<string, PinnedTabEntry[]>
  >(() => migratePinnedTabs(readStoredJson(LS_PINNED_TABS, {})));
  const [projectMenuPath, setProjectMenuPath] = useState<string | null>(null);
  const [chatMenuOpen, setChatMenuOpen] = useState<{ projectPath: string; tabId: string } | null>(null);
  const [projectsSortMenuOpen, setProjectsSortMenuOpen] = useState(false);
  /** Codex-style ? help menu + dedicated shortcuts modal (not full Settings). */
  const [helpMenuOpen, setHelpMenuOpen] = useState(false);
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false);
  const [showBottom, setShowBottom] = useState(false);
  const [leftWidth, setLeftWidth] = useState(() =>
    readStoredWidth(LS_SIDEBAR_W, SIDEBAR_DEFAULT, SIDEBAR_MIN, SIDEBAR_MAX)
  );
  const [rightWidth, setRightWidth] = useState(() =>
    readStoredWidth(LS_RIGHT_W, RIGHT_DEFAULT, RIGHT_MIN, RIGHT_MAX)
  );
  const [resizingSide, setResizingSide] = useState<"left" | "right" | null>(null);
  const leftWidthRef = useRef(leftWidth);
  const rightWidthRef = useRef(rightWidth);
  const resizeSideRef = useRef<"left" | "right" | null>(null);
  const resizeStartXRef = useRef(0);
  const resizeStartWRef = useRef(0);

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQ, setPaletteQ] = useState("");
  const [paletteIdx, setPaletteIdx] = useState(0);
  const [showUsage, setShowUsage] = useState(false);
  const [settingsTab, setSettingsTab] = useState<
    "hoso" | "canhanhoa" | "skills" | "chung" | "quyen" | "agent" | "phimtat"
  >("hoso");
  const [shortcutQuery, setShortcutQuery] = useState("");
  const [skillsList, setSkillsList] = useState<SkillsListResult | null>(null);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [skillsQuery, setSkillsQuery] = useState("");
  const [skillsSourceFilter, setSkillsSourceFilter] = useState<
    "all" | "user" | "agents" | "bundled" | "project"
  >("all");
  const [appVersion, setAppVersion] = useState<AppVersionInfo | null>(null);
  const [updateChecking, setUpdateChecking] = useState(false);
  const [updateCheckResult, setUpdateCheckResult] = useState<UpdateCheckResult | null>(
    null
  );
  /** idle | available | downloading | done | error */
  const [updateModal, setUpdateModal] = useState<
    null | "available" | "downloading" | "done" | "error" | "info"
  >(null);
  const [updateProgress, setUpdateProgress] = useState<UpdateProgress | null>(null);
  const [updateDownloadPath, setUpdateDownloadPath] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  /** Quiet startup check found a newer release — toast until dismissed; badge until updated. */
  const [updateToastOpen, setUpdateToastOpen] = useState(false);
  /** Codex-style in-app toast when agent turn finishes (always, not only OS notify). */
  const [turnDoneToast, setTurnDoneToast] = useState<TurnDoneToast | null>(null);
  const turnDoneToastTimerRef = useRef<number | null>(null);
  const quietUpdateCheckedRef = useRef(false);
  const runUpdateCheckRef = useRef<(opts?: { quiet?: boolean }) => Promise<UpdateCheckResult | null>>(
    async () => null
  );
  /** Grok CLI bootstrap — install with in-app progress (no PowerShell window). */
  const [cliStatus, setCliStatus] = useState<CliStatus | null>(null);
  const [cliModal, setCliModal] = useState<
    null | "missing" | "downloading" | "done" | "error"
  >(null);
  const [cliProgress, setCliProgress] = useState<CliProgress | null>(null);
  const [cliError, setCliError] = useState<string | null>(null);
  const [cliInstallResult, setCliInstallResult] = useState<{
    version?: string;
    path?: string;
  } | null>(null);
  const cliCheckedRef = useRef(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authMsg, setAuthMsg] = useState<string | null>(null);
  const authPollGenRef = useRef(0);
  /** In-app device-code login modal (no terminal). */
  const [loginModal, setLoginModal] = useState(false);
  const [loginProgress, setLoginProgress] = useState<AuthLoginProgress | null>(null);
  const [profileStats, setProfileStats] = useState<ProfileStats | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [heatMode, setHeatMode] = useState<"daily" | "weekly" | "cumulative">("daily");
  const [memories, setMemories] = useState<MemoryStore | null>(null);
  const [memoryDraft, setMemoryDraft] = useState("");
  const [gitInfo, setGitInfo] = useState<GitInfo | null>(null);
  const [gitStatus, setGitStatus] = useState<GitStatusLine[]>([]);
  const [worktrees, setWorktrees] = useState<GitWorktree[]>([]);
  const [runbooks, setRunbooks] = useState<RunbookEntry[]>([]);
  const [runbookQ, setRunbookQ] = useState("");
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [checklistChecked, setChecklistChecked] = useState<Record<string, boolean>>({});
  /** In-app confirm (replaces native window.confirm for recent-project remove). */
  const [removeRecentConfirm, setRemoveRecentConfirm] = useState<string | null>(null);
  const [renameProjectModal, setRenameProjectModal] = useState<{
    path: string;
    name: string;
    error?: string;
  } | null>(null);
  const [renameTabModal, setRenameTabModal] = useState<{
    projectPath: string;
    tabId: string;
    name: string;
    error?: string;
  } | null>(null);
  /** In-app confirm before closing a chat tab (replaces native window.confirm). */
  const [closeTabConfirm, setCloseTabConfirm] = useState<{
    tabId: string;
    title: string;
    running: boolean;
    projectPath: string;
    /** active = current workspace; standalone-list = close Tác vụ while viewing a project */
    mode: "active" | "standalone-list";
  } | null>(null);
  const [sessionAlwaysApprove, setSessionAlwaysApprove] = useState(false);
  const [verifyTier, setVerifyTier] = useState<string | null>(null);
  const [privacyDismissed, setPrivacyDismissed] = useState(false);
  const prevBusy = useRef(false);
  const hadToolsThisTurn = useRef(false);
  /** Diffs emitted during the current turn (path → latest) for file-edit summary. */
  const turnDiffsRef = useRef<Map<string, DiffResult>>(new Map());
  /** Live chip above composer: files changed this turn (Codex-style). */
  const [liveTurnEdits, setLiveTurnEdits] = useState<{
    files: number;
    additions: number;
    deletions: number;
  } | null>(null);
  /** Wall-clock start of current agent turn (for live elapsed). */
  const turnStartedAtRef = useRef<number | null>(null);
  const [turnStartedAt, setTurnStartedAt] = useState<number | null>(null);
  /** Id of the in-flight `run` chat item. */
  const runItemIdRef = useRef<string | null>(null);
  /** Expand/collapse for legacy activity groups without a persisted `run` item. */
  const [legacyActivityOpen, setLegacyActivityOpen] = useState<Record<string, boolean>>({});
  /** In-app image viewer — never open data: URLs in a new Electron window (blank page). */
  const [imageLightbox, setImageLightbox] = useState<{
    src: string;
    alt?: string;
    name?: string;
  } | null>(null);
  const [lightboxZoom, setLightboxZoom] = useState(100);

  const openImageLightbox = useCallback(
    (src: string, opts?: { alt?: string; name?: string }) => {
      if (!src) return;
      setImageLightbox({ src, alt: opts?.alt, name: opts?.name });
      setLightboxZoom(100);
    },
    []
  );
  const closeImageLightbox = useCallback(() => {
    setImageLightbox(null);
    setLightboxZoom(100);
  }, []);
  const nudgeLightboxZoom = useCallback((delta: number) => {
    setLightboxZoom((z) => clampPx(z + delta, 25, 400));
  }, []);

  const chatRef = useRef<HTMLDivElement>(null);
  const [visibleChatBlockCount, setVisibleChatBlockCount] = useState(
    CHAT_BLOCK_PAGE_SIZE
  );
  const historyPrependRef = useRef<{
    scrollHeight: number;
    scrollTop: number;
  } | null>(null);
  /** Stick chat to bottom unless user scrolls up to read history. */
  const stickToBottomRef = useRef(true);
  const scrollRafRef = useRef<number | null>(null);
  const assistantBuf = useRef<{ id: string; text: string } | null>(null);
  const thoughtBuf = useRef<{ id: string; text: string } | null>(null);
  /**
   * Live stream body nodes — write textContent immediately on each chunk
   * (no React re-render) so stream feels as snappy as Grok chat.
   */
  const streamAssistantElRef = useRef<HTMLDivElement | null>(null);
  const streamAssistantIdRef = useRef<string | null>(null);
  const streamThoughtElRef = useRef<HTMLDivElement | null>(null);
  const streamThoughtIdRef = useRef<string | null>(null);
  /** Index of streaming items in ownerItemsRef (avoid findIndex every token). */
  const streamAssistantIdxRef = useRef<number>(-1);
  const streamThoughtIdxRef = useRef<number>(-1);
  /** Coalesce React mount / rare full sync (not per-token paint). */
  const streamRafRef = useRef<number | null>(null);
  const streamFlushPendingRef = useRef(false);
  /** Throttle silent itemsRef patch + scroll while DOM already paints live text. */
  const streamPatchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const itemsRef = useRef<ChatItem[]>([]);
  const projectRef = useRef("");
  const settingsRef = useRef<AppSettings | null>(null);
  const modelRef = useRef(model);
  const effortRef = useRef(effort);
  const sessionIdRef = useRef("");
  /** Tab that owns the current agent turn (stream always writes here). */
  const boundTabIdRef = useRef<string | null>(null);
  const busyTabIdRef = useRef<string | null>(null);
  const busyProjectPathRef = useRef<string | null>(null);
  const storeRef = useRef<ProjectStore | null>(null);
  const busyRef = useRef(false);
  const inputRef = useRef("");
  /** Live transcript of the busy owner tab (even when user views another tab/project). */
  const ownerItemsRef = useRef<ChatItem[]>([]);
  const saveOwnerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const promptQueueRef = useRef<QueuedPrompt[]>([]);
  /** After cancel/steal, run this prompt instead of FIFO drain. */
  const stealPayloadRef = useRef<QueuedPrompt | null>(null);
  const drainLockRef = useRef(false);
  const finishTurnRef = useRef<(opts?: { cancelled?: boolean }) => Promise<void>>(
    async () => undefined
  );
  const runAgentPromptRef = useRef<(payload: QueuedPrompt) => Promise<void>>(
    async () => undefined
  );
  const agentReadyRef = useRef(false);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  useEffect(() => {
    promptQueueRef.current = promptQueue;
  }, [promptQueue]);
  useEffect(() => {
    agentReadyRef.current = agentReady;
  }, [agentReady]);
  useEffect(() => {
    leftWidthRef.current = leftWidth;
  }, [leftWidth]);
  useEffect(() => {
    rightWidthRef.current = rightWidth;
  }, [rightWidth]);

  const onColResizeMove = useCallback((e: MouseEvent) => {
    const side = resizeSideRef.current;
    if (!side) return;
    const dx = e.clientX - resizeStartXRef.current;
    if (side === "left") {
      setLeftWidth(clampPx(resizeStartWRef.current + dx, SIDEBAR_MIN, SIDEBAR_MAX));
    } else {
      setRightWidth(clampPx(resizeStartWRef.current - dx, RIGHT_MIN, RIGHT_MAX));
    }
  }, []);

  const onColResizeEnd = useCallback(() => {
    const side = resizeSideRef.current;
    if (!side) return;
    resizeSideRef.current = null;
    setResizingSide(null);
    document.body.classList.remove("col-resizing");
    if (side === "left") writeStoredWidth(LS_SIDEBAR_W, leftWidthRef.current);
    else writeStoredWidth(LS_RIGHT_W, rightWidthRef.current);
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", onColResizeMove);
    window.addEventListener("mouseup", onColResizeEnd);
    return () => {
      window.removeEventListener("mousemove", onColResizeMove);
      window.removeEventListener("mouseup", onColResizeEnd);
    };
  }, [onColResizeMove, onColResizeEnd]);

  const beginColResize = useCallback((side: "left" | "right", e: ReactMouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeSideRef.current = side;
    resizeStartXRef.current = e.clientX;
    resizeStartWRef.current = side === "left" ? leftWidthRef.current : rightWidthRef.current;
    setResizingSide(side);
    document.body.classList.add("col-resizing");
  }, []);

  const resetColWidth = useCallback((side: "left" | "right") => {
    if (side === "left") {
      setLeftWidth(SIDEBAR_DEFAULT);
      writeStoredWidth(LS_SIDEBAR_W, SIDEBAR_DEFAULT);
    } else {
      setRightWidth(RIGHT_DEFAULT);
      writeStoredWidth(LS_RIGHT_W, RIGHT_DEFAULT);
    }
  }, []);

  useEffect(() => {
    projectRef.current = projectPath;
  }, [projectPath]);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  useEffect(() => {
    modelRef.current = model;
  }, [model]);
  useEffect(() => {
    effortRef.current = effort;
  }, [effort]);
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);
  useEffect(() => {
    storeRef.current = store;
  }, [store]);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);
  useEffect(() => {
    busyTabIdRef.current = busyTabId;
  }, [busyTabId]);
  useEffect(() => {
    busyProjectPathRef.current = busyProjectPath;
  }, [busyProjectPath]);
  const syncComposerDraft = useCallback((v: string) => {
    inputRef.current = v;
  }, []);

  /**
   * Patch send-button.disabled without React setState.
   * Reads live refs so stream re-renders and keystroke edges stay consistent.
   */
  const syncSendEnabled = useCallback(() => {
    const btn = sendBtnRef.current;
    if (!btn) return;
    const ready = Boolean(btn.dataset.ready === "1");
    const blocked = btn.dataset.blocked === "1";
    const hasAttach = attachmentsLenRef.current > 0;
    const hasDraft = draftNonEmptyRef.current;
    btn.disabled = !ready || blocked || (!hasDraft && !hasAttach);
  }, []);

  const onDraftNonEmpty = useCallback(
    (nonEmpty: boolean) => {
      if (draftNonEmptyRef.current === nonEmpty) {
        // Still refresh in case attachments/ready flags changed while focused.
        syncSendEnabled();
        return;
      }
      draftNonEmptyRef.current = nonEmpty;
      syncSendEnabled();
    },
    [syncSendEnabled]
  );

  const setComposerText = useCallback(
    (v: string) => {
      inputRef.current = v;
      setDraftSeed(v);
      draftNonEmptyRef.current = Boolean(v.trim());
      composerRef.current?.setValue(v);
      syncSendEnabled();
    },
    [syncSendEnabled]
  );

  const clearComposerText = useCallback(() => {
    inputRef.current = "";
    setDraftSeed("");
    draftNonEmptyRef.current = false;
    composerRef.current?.clear();
    syncSendEnabled();
  }, [syncSendEnabled]);

  const getComposerText = useCallback(
    () => composerRef.current?.getValue() ?? inputRef.current,
    []
  );

  /** Stable submit handle — send() is recreated each App render; ref keeps composer memo-friendly. */
  const sendFnRef = useRef<() => void | Promise<void>>(() => {});
  const handleComposerSubmit = useCallback(() => {
    void sendFnRef.current();
  }, []);

  /** True only when the visible project+tab is the stream owner. */
  const isViewingOwnerTab = useCallback(() => {
    const owner = boundTabIdRef.current;
    const active = storeRef.current?.activeTabId;
    const ownerProject = busyProjectPathRef.current;
    const viewing = projectRef.current;
    return Boolean(
      owner &&
        active &&
        owner === active &&
        ownerProject &&
        viewing &&
        pathsEqual(ownerProject, viewing)
    );
  }, []);

  const persistTab = useCallback(
    async (
      path: string,
      tabId: string,
      chatItems: ChatItem[],
      extra: Partial<ChatTab> = {},
      opts?: { syncUi?: boolean }
    ) => {
      if (!path || !tabId) return;
      try {
        const next = await window.grokApp.saveTab(path, tabId, {
          items: chatItems,
          model: modelRef.current,
          reasoningEffort: effortRef.current,
          ...extra,
        });
        storeRef.current = next;
        if (opts?.syncUi !== false) {
          setStore(next);
        }
      } catch {
        /* ignore */
      }
    },
    []
  );

  const schedulePersistOwner = useCallback(
    (chatItems: ChatItem[]) => {
      const tabId = boundTabIdRef.current;
      // Always write to the busy owner project — not the currently viewed one.
      const path = busyProjectPathRef.current || projectRef.current;
      if (!tabId || !path) return;
      if (saveOwnerTimerRef.current) clearTimeout(saveOwnerTimerRef.current);
      // Background owner stream: infrequent silent disk writes only.
      saveOwnerTimerRef.current = setTimeout(() => {
        void persistTab(path, tabId, chatItems, {}, { syncUi: false });
      }, 1200);
    },
    [persistTab]
  );

  /**
   * Mutate the stream-owner transcript.
   * If user is viewing that tab → update UI; else persist in background.
   * Stream-heavy updates use startTransition so composer typing stays responsive.
   * Even opts.urgent yields when the user is mid-keystroke in the composer.
   */
  const mutateOwnerItems = useCallback(
    (fn: (prev: ChatItem[]) => ChatItem[], opts?: { urgent?: boolean }) => {
      const base =
        ownerItemsRef.current.length > 0
          ? ownerItemsRef.current
          : isViewingOwnerTab()
            ? itemsRef.current
            : ownerItemsRef.current;
      const next = fn(base);
      ownerItemsRef.current = next;
      if (isViewingOwnerTab()) {
        itemsRef.current = next;
        const preferUrgent = Boolean(opts?.urgent) && !isTypingInComposer();
        if (preferUrgent) {
          setItems(next);
        } else {
          startTransition(() => setItems(next));
        }
      } else {
        schedulePersistOwner(next);
      }
    },
    [isViewingOwnerTab, schedulePersistOwner]
  );

  /** Cheap in-place text patch on ownerItemsRef (no setState, no array copy when possible). */
  const silentPatchStreamText = useCallback(
    (kind: "assistant" | "thought", buf: { id: string; text: string }) => {
      const base =
        ownerItemsRef.current.length > 0
          ? ownerItemsRef.current
          : isViewingOwnerTab()
            ? itemsRef.current
            : ownerItemsRef.current;
      let idx =
        kind === "assistant" ? streamAssistantIdxRef.current : streamThoughtIdxRef.current;
      if (idx < 0 || idx >= base.length || base[idx]?.id !== buf.id || base[idx]?.kind !== kind) {
        idx = base.findIndex((it) => it.id === buf.id && it.kind === kind);
        if (kind === "assistant") streamAssistantIdxRef.current = idx;
        else streamThoughtIdxRef.current = idx;
      }
      if (idx >= 0) {
        const cur = base[idx];
        if (cur.kind === kind && "text" in cur && cur.text === buf.text) return;
        // Mutate in place — only stream buffer owns this slot during live turn.
        (cur as { text: string }).text = buf.text;
        ownerItemsRef.current = base;
        if (isViewingOwnerTab()) itemsRef.current = base;
        else schedulePersistOwner(base);
        return;
      }
      const next: ChatItem[] =
        kind === "assistant"
          ? [...base, { id: buf.id, kind: "assistant", text: buf.text, ts: nowIso() }]
          : [
              ...base,
              { id: buf.id, kind: "thought", text: buf.text, expanded: false, ts: nowIso() },
            ];
      if (kind === "assistant") streamAssistantIdxRef.current = next.length - 1;
      else streamThoughtIdxRef.current = next.length - 1;
      ownerItemsRef.current = next;
      if (isViewingOwnerTab()) itemsRef.current = next;
      else schedulePersistOwner(next);
    },
    [isViewingOwnerTab, schedulePersistOwner]
  );

  /** Apply assistant/thought buffers into React state (mount / tool boundary / turn end). */
  const flushStreamBuffers = useCallback(
    (opts?: { urgent?: boolean }) => {
      streamFlushPendingRef.current = false;
      if (streamRafRef.current != null) {
        cancelAnimationFrame(streamRafRef.current);
        streamRafRef.current = null;
      }
      const a = assistantBuf.current;
      const th = thoughtBuf.current;
      if (!a && !th) return;
      mutateOwnerItems((prev) => {
        let next = prev;
        const ensure = (
          list: ChatItem[],
          buf: { id: string; text: string },
          kind: "assistant" | "thought"
        ): ChatItem[] => {
          const idx = list.findIndex((it) => it.id === buf.id && it.kind === kind);
          if (idx >= 0) {
            const cur = list[idx];
            if (cur.kind === kind && cur.text === buf.text) {
              if (kind === "assistant") streamAssistantIdxRef.current = idx;
              else streamThoughtIdxRef.current = idx;
              return list;
            }
            const copy = list.slice();
            copy[idx] =
              kind === "assistant"
                ? { ...cur, kind: "assistant", text: buf.text }
                : {
                    ...cur,
                    kind: "thought",
                    text: buf.text,
                    expanded: (cur as Extract<ChatItem, { kind: "thought" }>).expanded,
                  };
            if (kind === "assistant") streamAssistantIdxRef.current = idx;
            else streamThoughtIdxRef.current = idx;
            return copy;
          }
          if (kind === "assistant") {
            streamAssistantIdxRef.current = list.length;
            return [
              ...list,
              { id: buf.id, kind: "assistant", text: buf.text, ts: nowIso() },
            ];
          }
          streamThoughtIdxRef.current = list.length;
          return [
            ...list,
            {
              id: buf.id,
              kind: "thought",
              text: buf.text,
              expanded: false,
              ts: nowIso(),
            },
          ];
        };
        if (a) next = ensure(next, a, "assistant");
        if (th) next = ensure(next, th, "thought");
        return next;
      }, opts);
    },
    [mutateOwnerItems]
  );

  /** Scroll chat to bottom at most once per frame. */
  const scheduleStickScroll = useCallback(() => {
    if (!stickToBottomRef.current) return;
    if (scrollRafRef.current != null) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      const el = chatRef.current;
      if (!el || !stickToBottomRef.current) return;
      el.scrollTop = el.scrollHeight;
    });
  }, []);

  /**
   * Paint one stream kind immediately to DOM when bubble exists.
   * Returns true if DOM handled it (no React needed).
   * Delta-append when text only grows — full textContent rewrite is O(n) per token.
   */
  const paintStreamChunkNow = useCallback(
    (kind: "assistant" | "thought") => {
      const buf = kind === "assistant" ? assistantBuf.current : thoughtBuf.current;
      if (!buf) return false;
      const el =
        kind === "assistant" ? streamAssistantElRef.current : streamThoughtElRef.current;
      const idRef =
        kind === "assistant" ? streamAssistantIdRef.current : streamThoughtIdRef.current;
      if (!el || idRef !== buf.id) return false;
      const next = buf.text;
      const prev = el.textContent || "";
      if (next === prev) {
        /* no-op */
      } else if (next.startsWith(prev)) {
        // Fast path: only append the new suffix (common streaming case).
        const suffix = next.slice(prev.length);
        if (suffix) el.appendChild(document.createTextNode(suffix));
      } else {
        el.textContent = next;
      }
      // Throttle ref bookkeeping — DOM already shows latest text.
      // While typing, patch less often so main thread stays free for keystrokes.
      const patchMs = isTypingInComposer() ? 280 : 120;
      if (streamPatchTimerRef.current == null) {
        streamPatchTimerRef.current = setTimeout(() => {
          streamPatchTimerRef.current = null;
          if (assistantBuf.current) silentPatchStreamText("assistant", assistantBuf.current);
          if (thoughtBuf.current) silentPatchStreamText("thought", thoughtBuf.current);
        }, patchMs);
      }
      // Scrolling during keystrokes steals frames — defer until not typing.
      if (!isTypingInComposer()) {
        scheduleStickScroll();
      }
      return true;
    },
    [silentPatchStreamText, scheduleStickScroll]
  );

  /** React-mount path only (first chunk before bubble exists). Coalesced to 1 rAF. */
  const scheduleStreamMount = useCallback(() => {
    streamFlushPendingRef.current = true;
    if (streamRafRef.current != null) return;
    streamRafRef.current = requestAnimationFrame(() => {
      streamRafRef.current = null;
      if (!streamFlushPendingRef.current) return;
      streamFlushPendingRef.current = false;
      // If ref attached between schedule and fire, skip React.
      const aOk =
        !assistantBuf.current ||
        (streamAssistantElRef.current != null &&
          streamAssistantIdRef.current === assistantBuf.current.id);
      const thOk =
        !thoughtBuf.current ||
        (streamThoughtElRef.current != null &&
          streamThoughtIdRef.current === thoughtBuf.current.id);
      if (aOk && thOk) {
        if (assistantBuf.current) paintStreamChunkNow("assistant");
        if (thoughtBuf.current) paintStreamChunkNow("thought");
        return;
      }
      flushStreamBuffers({ urgent: true });
      scheduleStickScroll();
    });
  }, [flushStreamBuffers, paintStreamChunkNow, scheduleStickScroll]);

  /** @deprecated name kept for call sites — routes to immediate paint or mount. */
  const scheduleStreamFlush = useCallback(() => {
    const a = assistantBuf.current;
    const th = thoughtBuf.current;
    let needMount = false;
    if (a) {
      if (!paintStreamChunkNow("assistant")) needMount = true;
    }
    if (th) {
      if (!paintStreamChunkNow("thought")) needMount = true;
    }
    if (needMount) scheduleStreamMount();
  }, [paintStreamChunkNow, scheduleStreamMount]);

  const clearBusyState = useCallback(() => {
    setBusy(false);
    busyRef.current = false;
    setBusyTabId(null);
    busyTabIdRef.current = null;
    setBusyProjectPath(null);
    busyProjectPathRef.current = null;
    turnStartedAtRef.current = null;
    setTurnStartedAt(null);
    runItemIdRef.current = null;
  }, []);

  const syncLiveTurnEdits = useCallback(() => {
    const s = summarizeTurnFileEdits(Array.from(turnDiffsRef.current.values()));
    setLiveTurnEdits(
      s ? { files: s.files, additions: s.additions, deletions: s.deletions } : null
    );
  }, []);

  /** Consume diffs collected this turn (for turn_report fileEdits). */
  const takeTurnFileEdits = useCallback((): TurnReportItem["fileEdits"] => {
    const list = Array.from(turnDiffsRef.current.values());
    turnDiffsRef.current.clear();
    setLiveTurnEdits(null);
    return summarizeTurnFileEdits(list);
  }, []);

  /** In-app toast always; OS Notification still gated by settings + background. */
  const showTurnDoneToast = useCallback((report: TurnReportItem) => {
    if (turnDoneToastTimerRef.current != null) {
      window.clearTimeout(turnDoneToastTimerRef.current);
      turnDoneToastTimerRef.current = null;
    }
    setTurnDoneToast({
      id: report.id,
      status: report.status,
      headline: turnReportHeadline(report.status, report.durationMs),
      body: turnReportNotifyBody(report),
    });
    turnDoneToastTimerRef.current = window.setTimeout(() => {
      setTurnDoneToast((cur) => (cur?.id === report.id ? null : cur));
      turnDoneToastTimerRef.current = null;
    }, 5200);
  }, []);

  const setQueue = useCallback((next: QueuedPrompt[] | ((prev: QueuedPrompt[]) => QueuedPrompt[])) => {
    setPromptQueue((prev) => {
      const resolved = typeof next === "function" ? next(prev) : next;
      promptQueueRef.current = resolved;
      return resolved;
    });
  }, []);

  /** Drop all follow-ups + pending steal (agent dead, stop agent, project gone). */
  const clearPromptQueue = useCallback(() => {
    stealPayloadRef.current = null;
    promptQueueRef.current = [];
    setPromptQueue([]);
    setQueueMenuId(null);
    setEditingQueueId(null);
    setEditQueueText("");
  }, []);

  const clearPromptQueueForTab = useCallback((tabId: string) => {
    setQueue((prev) => prev.filter((q) => q.tabId !== tabId));
    if (stealPayloadRef.current?.tabId === tabId) {
      stealPayloadRef.current = null;
    }
    setQueueMenuId((m) => {
      if (!m) return m;
      const still = promptQueueRef.current.some((q) => q.id === m);
      return still ? m : null;
    });
    setEditingQueueId((e) => {
      if (!e) return e;
      const still = promptQueueRef.current.some((q) => q.id === e);
      return still ? e : null;
    });
  }, [setQueue]);

  const clearPromptQueueForProject = useCallback(
    (project: string) => {
      setQueue((prev) => prev.filter((q) => !pathsEqual(q.projectPath, project)));
      if (
        stealPayloadRef.current?.projectPath &&
        pathsEqual(stealPayloadRef.current.projectPath, project)
      ) {
        stealPayloadRef.current = null;
      }
    },
    [setQueue]
  );

  const messageQueueEnabled = settings?.messageQueueEnabled !== false;

  /** FIFO drain / steal after turn ends. Never double-invokes agent:prompt. */
  const scheduleQueueDrain = useCallback(() => {
    window.setTimeout(() => {
      void (async () => {
        if (busyRef.current || drainLockRef.current) return;
        if (!agentReadyRef.current) return;

        const steal = stealPayloadRef.current;
        if (steal) {
          stealPayloadRef.current = null;
          drainLockRef.current = true;
          try {
            await runAgentPromptRef.current(steal);
          } finally {
            drainLockRef.current = false;
          }
          return;
        }

        const q = promptQueueRef.current;
        if (!q.length) return;
        const next = q[0];
        // Only auto-run when agent cwd still matches queued project (or cwd unknown).
        const cwd = agentCwd;
        if (cwd && next.projectPath && !pathsEqual(cwd, next.projectPath)) {
          return;
        }
        setQueue((prev) => prev.filter((x) => x.id !== next.id));
        drainLockRef.current = true;
        try {
          await runAgentPromptRef.current(next);
        } finally {
          drainLockRef.current = false;
        }
      })();
    }, 40);
  }, [agentCwd, setQueue]);

  const removeQueued = useCallback(
    (id: string) => {
      setQueue((prev) => prev.filter((x) => x.id !== id));
      setQueueMenuId((m) => (m === id ? null : m));
      setEditingQueueId((e) => (e === id ? null : e));
    },
    [setQueue]
  );

  const saveQueueEdit = useCallback(
    (id: string) => {
      const text = editQueueText.trim();
      if (!text) {
        removeQueued(id);
        return;
      }
      setQueue((prev) =>
        prev.map((q) => (q.id === id ? { ...q, text } : q))
      );
      setEditingQueueId(null);
      setEditQueueText("");
      setQueueMenuId(null);
    },
    [editQueueText, removeQueued, setQueue]
  );

  const setMessageQueueEnabled = useCallback(async (enabled: boolean) => {
    try {
      const next = await window.grokApp.saveSettings({ messageQueueEnabled: enabled });
      setSettings(next);
      setDraftSettings((s) => ({ ...s, messageQueueEnabled: enabled }));
    } catch {
      /* ignore */
    }
    setQueueMenuId(null);
  }, []);

  /** Always append to the currently visible tab (local UI hints). */
  const pushLocal = useCallback((item: ChatItem) => {
    setItems((prev) => [...prev, { ...item, ts: item.ts || nowIso() }]);
  }, []);

  const push = useCallback(
    (item: ChatItem) => {
      const stamped = { ...item, ts: item.ts || nowIso() };
      const owner = boundTabIdRef.current;
      const agentKinds =
        item.kind === "assistant" ||
        item.kind === "thought" ||
        item.kind === "tool" ||
        item.kind === "error";
      // While a turn is in-flight, agent lines always go to the owner tab
      if (busyRef.current && owner && agentKinds) {
        mutateOwnerItems((prev) => [...prev, stamped]);
        return;
      }
      // System/error from agent lifecycle while busy → owner
      if (
        busyRef.current &&
        owner &&
        item.kind === "system" &&
        /agent|dừng|exited|stopped|ready/i.test(item.text || "")
      ) {
        mutateOwnerItems((prev) => [...prev, stamped]);
        return;
      }
      setItems((prev) => {
        const next = [...prev, stamped];
        if (busyRef.current && owner && storeRef.current?.activeTabId === owner) {
          ownerItemsRef.current = next;
        }
        return next;
      });
    },
    [mutateOwnerItems]
  );

  const persistActive = useCallback(
    async (
      path: string,
      chatItems: ChatItem[],
      extra: Partial<ChatTab> = {},
      opts?: { syncUi?: boolean }
    ) => {
      if (!path) return;
      try {
        const next = await window.grokApp.saveActiveTab(path, {
          items: chatItems,
          model: modelRef.current,
          reasoningEffort: effortRef.current,
          draft: inputRef.current,
          ...extra,
        });
        // Autosave must NOT setStore — rewriting sidebar state on every keystroke/chunk causes jank.
        storeRef.current = next;
        if (opts?.syncUi !== false) {
          setStore(next);
        }
      } catch {
        /* ignore */
      }
    },
    []
  );

  /** Hard-stop in-flight turn (project change, close owner tab, user cancel). */
  const cancelBusyTurn = useCallback(
    async (reason: string) => {
      if (!busyRef.current) return;
      try {
        await window.grokApp.cancel();
      } catch {
        /* ignore */
      }
      flushStreamBuffers({ urgent: true });
      const owner = boundTabIdRef.current;
      const started = turnStartedAtRef.current;
      const durationMs =
        started != null ? Math.max(0, Date.now() - started) : 0;
      const runId = runItemIdRef.current;
      const wantReport = settings?.turnReport !== false;
      const wantNotify = settings?.notifyOnTurnDone !== false;
      const fileEdits = takeTurnFileEdits();
      const reportBox: { current: TurnReportItem | null } = { current: null };
      mutateOwnerItems((prev) => {
        const next = prev.map((it) => {
          if (it.kind !== "run" || it.status !== "running") return it;
          const isCurrent = runId != null && it.id === runId;
          const start = tsToMs(it.ts);
          return {
            ...it,
            durationMs: isCurrent
              ? durationMs
              : start != null
                ? Math.max(0, Date.now() - start)
                : it.durationMs || 0,
            status: isCurrent ? ("cancelled" as const) : ("done" as const),
            expanded: false,
          };
        });
        next.push({
          id: uid(),
          kind: "system",
          text: `Agent đã dừng — ${reason}`,
          ts: nowIso(),
        });
        {
          const built = buildTurnReportItem(
            next,
            runId,
            "cancelled",
            durationMs,
            fileEdits
          );
          reportBox.current = built;
          if (wantReport) next.push(built);
        }
        return next;
      });
      if (reportBox.current) {
        showTurnDoneToast(reportBox.current);
        if (wantNotify) notifyTurnDone(reportBox.current);
      }
      const ownerProject = busyProjectPathRef.current || projectRef.current;
      if (owner && ownerProject) {
        await persistTab(ownerProject, owner, ownerItemsRef.current);
      }
      clearBusyState();
      assistantBuf.current = null;
      thoughtBuf.current = null;
      // Only continue a *steal* after cancel. User Stop / close-tab must NOT FIFO-drain
      // (would surprise: "I stopped but agent kept going").
      if (stealPayloadRef.current) {
        scheduleQueueDrain();
      }
    },
    [
      mutateOwnerItems,
      flushStreamBuffers,
      persistTab,
      clearBusyState,
      settings?.turnReport,
      settings?.notifyOnTurnDone,
      scheduleQueueDrain,
      takeTurnFileEdits,
      showTurnDoneToast,
    ]
  );

  // Autosave draft + transcript: debounced, silent (no React store rewrite).
  // While streaming, items state may stay still (DOM-only text) — poll itemsRef instead.
  // Longer busy interval: JSON save of long transcripts competes with keystrokes on main/IPC.
  useEffect(() => {
    if (!projectPath) return;
    const readDraft = () =>
      composerRef.current?.getValue() ?? inputRef.current;
    if (busy) {
      const tick = () => {
        // JSON+IPC of long transcripts competes with keystrokes — skip while typing.
        if (isTypingInComposer()) return;
        void persistActive(
          projectPath,
          itemsRef.current,
          { draft: readDraft() },
          { syncUi: false }
        );
      };
      const id = window.setInterval(tick, 4000);
      return () => clearInterval(id);
    }
    const t = setTimeout(
      () =>
        void persistActive(
          projectPath,
          itemsRef.current,
          { draft: readDraft() },
          { syncUi: false }
        ),
      900
    );
    return () => clearTimeout(t);
  // Draft text lives in ComposerDraftField — only poll DOM/ref (no per-keystroke effect).
  }, [items, projectPath, persistActive, busy]);

  // Idle draft-only typing does not change `items` — save draft on a slow poll so
  // tab switch / crash still keeps unsent text without binding save to onInput.
  // Never run the (large) JSON tab write while the user is mid-keystroke.
  const lastSavedDraftRef = useRef<string | null>(null);
  useEffect(() => {
    if (!projectPath || busy) return;
    const id = window.setInterval(() => {
      if (isTypingInComposer()) return;
      const draft = composerRef.current?.getValue() ?? inputRef.current;
      if (draft === lastSavedDraftRef.current) return;
      lastSavedDraftRef.current = draft;
      inputRef.current = draft;
      void persistActive(
        projectPath,
        itemsRef.current,
        { draft },
        { syncUi: false }
      );
    }, 8000);
    return () => clearInterval(id);
  }, [projectPath, busy, persistActive]);

  const refreshAuth = useCallback(async () => {
    const next = await window.grokApp.getAuth();
    setAuth(next);
    setAvatarBroken(false);
    return next;
  }, []);

  const refreshUsage = useCallback(async () => {
    try {
      const snap = await window.grokApp.getUsage();
      usageRef.current = snap;
      setUsage(snap);
    } catch {
      /* ignore */
    }
  }, []);
  const refreshStorage = useCallback(async () => {
    try {
      setStorageReport(await window.grokApp.getStorageReport());
    } catch {
      /* ignore */
    }
  }, []);
  const cleanIndexedDb = useCallback(async () => {
    try {
      const result = await window.grokApp.runStorageHygiene({
        includeOfficialGrok: true,
        forceOfficial: true,
      });
      await refreshStorage();
      push({
        id: uid(),
        kind: "system",
        text:
          result.freedBytes > 0
            ? `Đã dọn IndexedDB / LevelDB WAL — giải phóng ~${result.freed}.`
            : "IndexedDB OK — không có bloat cần xóa.",
      });
    } catch (err: any) {
      push({ id: uid(), kind: "error", text: String(err?.message || err) });
    }
  }, [push, refreshStorage]);
  const loadModels = useCallback(async () => {
    const res = await window.grokApp.listModels();
    setModels(res.models || []);
  }, []);

  const runLogin = useCallback(async () => {
    if (authBusy) return;
    setAuthBusy(true);
    const gen = ++authPollGenRef.current;
    setLoginProgress({ phase: "starting", message: "Đang lấy mã đăng nhập…" });
    setLoginModal(true);
    setAuthMsg(t("auth.loggingIn"));
    try {
      const res = await window.grokApp.login();
      if (authPollGenRef.current !== gen) return;
      if (res.ok) {
        setLoginProgress({
          phase: "done",
          message: res.message,
          email: res.email,
        });
        setAuthMsg(res.message || "Đã đăng nhập.");
        const next = await window.grokApp.getAuth();
        setAuth(next);
        setAvatarBroken(false);
        try {
          await refreshUsage();
          await loadModels();
        } catch {
          /* optional */
        }
        // Auto-close success after a short beat
        window.setTimeout(() => {
          if (authPollGenRef.current === gen) setLoginModal(false);
        }, 1200);
        return;
      }
      if (res.cancelled) {
        setLoginModal(false);
        setLoginProgress(null);
        setAuthMsg(t("auth.cancelled"));
        return;
      }
      setLoginProgress((p) => ({
        phase: "error",
        userCode: p?.userCode,
        verificationUri: p?.verificationUri,
        error: res.error || t("auth.failed"),
        message: res.error || t("auth.failed"),
      }));
      setAuthMsg(res.error || t("auth.failed"));
    } catch (err: any) {
      const msg = String(err?.message || err);
      setLoginProgress({ phase: "error", error: msg, message: msg });
      setAuthMsg(msg);
    } finally {
      if (authPollGenRef.current === gen) setAuthBusy(false);
    }
  }, [authBusy, refreshUsage, loadModels, t]);

  const runLoginCliFallback = useCallback(async () => {
    if (authBusy) return;
    setAuthBusy(true);
    const gen = ++authPollGenRef.current;
    setLoginModal(false);
    setAuthMsg(t("auth.cliFallback"));
    try {
      const res = await window.grokApp.loginCli();
      if (!res.ok) {
        setAuthMsg(res.error || "Không mở được terminal login.");
        return;
      }
      setAuthMsg(
        res.message ||
          "Hoàn tất trong terminal/browser — app đang chờ auth.json…"
      );
      const deadline = Date.now() + 180_000;
      while (Date.now() < deadline && authPollGenRef.current === gen) {
        await new Promise((r) => setTimeout(r, 2000));
        if (authPollGenRef.current !== gen) return;
        const next = await window.grokApp.getAuth();
        setAuth(next);
        setAvatarBroken(false);
        if (next.loggedIn) {
          setAuthMsg(`Đã đăng nhập${next.email ? `: ${next.email}` : ""}.`);
          try {
            await refreshUsage();
            await loadModels();
          } catch {
            /* optional */
          }
          return;
        }
      }
      if (authPollGenRef.current === gen) {
        setAuthMsg("Chưa thấy session. Xong login terminal rồi bấm Làm mới.");
      }
    } catch (err: any) {
      setAuthMsg(String(err?.message || err));
    } finally {
      if (authPollGenRef.current === gen) setAuthBusy(false);
    }
  }, [authBusy, refreshUsage, loadModels, t]);

  const runLogout = useCallback(async () => {
    if (authBusy) return;
    const ok = window.confirm(
      "Đăng xuất sẽ xóa token local (~/.grok/auth.json).\n" +
        "Agent/API sẽ không gọi được cho đến khi đăng nhập lại.\n\nTiếp tục?"
    );
    if (!ok) return;
    authPollGenRef.current += 1; // cancel any login poll
    void window.grokApp.cancelLogin();
    setLoginModal(false);
    setLoginProgress(null);
    setAuthBusy(true);
    setAuthMsg("Đang đăng xuất…");
    try {
      const next = await window.grokApp.logout();
      setAuth(next);
      setAvatarBroken(false);
      setAuthMsg("Đã đăng xuất. Token local đã xóa.");
      try {
        await refreshUsage();
      } catch {
        /* ignore */
      }
    } catch (err: any) {
      setAuthMsg(String(err?.message || err));
    } finally {
      setAuthBusy(false);
    }
  }, [authBusy, refreshUsage]);

  const loadTree = useCallback(async (path: string) => {
    if (!path) return;
    try {
      setTree(await window.grokApp.listTree(path, 3));
    } catch {
      setTree([]);
    }
  }, []);

  const refreshGit = useCallback(async (path: string) => {
    if (!path) {
      setGitInfo(null);
      setGitStatus([]);
      setWorktrees([]);
      return;
    }
    try {
      const [g, st, wt] = await Promise.all([
        window.grokApp.getGitInfo(path),
        window.grokApp.getGitStatus(path),
        window.grokApp.getGitWorktrees(path),
      ]);
      setGitInfo(g);
      setGitStatus(st.lines || []);
      setWorktrees(wt.worktrees || []);
    } catch {
      setGitInfo(null);
      setGitStatus([]);
      setWorktrees([]);
    }
  }, []);

  const refreshRunbooks = useCallback(async (path: string, query = "") => {
    if (!path) {
      setRunbooks([]);
      return;
    }
    try {
      const res = query
        ? await window.grokApp.searchRunbooks(path, query)
        : await window.grokApp.getRunbooks(path);
      setRunbooks(res.runbooks || []);
    } catch {
      setRunbooks([]);
    }
  }, []);

  const applyTheme = useCallback((theme?: string) => {
    const t = theme === "light" ? "light" : "dark";
    document.documentElement.classList.toggle("theme-light", t === "light");
    document.documentElement.dataset.theme = t;
    // Keep Electron titleBarOverlay / window chrome in sync (Win caption strip).
    void window.grokApp.setChromeTheme?.(t);
  }, []);

  const applyProject = useCallback(
    async (bundle: ProjectBundle) => {
      const prevPath = projectRef.current;
      const switching = Boolean(prevPath && !pathsEqual(prevPath, bundle.path));

      if (switching && prevPath) {
        const leavingBusyOwner =
          busyRef.current &&
          boundTabIdRef.current &&
          busyProjectPathRef.current &&
          pathsEqual(busyProjectPathRef.current, prevPath);

        if (leavingBusyOwner && boundTabIdRef.current) {
          // Snapshot owner transcript then leave agent running in background.
          await persistTab(
            prevPath,
            boundTabIdRef.current,
            ownerItemsRef.current.length ? ownerItemsRef.current : itemsRef.current,
            { draft: inputRef.current }
          );
        } else {
          await persistActive(prevPath, itemsRef.current, {
            draft: inputRef.current,
          });
        }

        if (busyRef.current) {
          // Cross-project single-flight: do NOT cancel / stop agent.
          // Stream owner (boundTabId / ownerItems / busy*) stays intact.
        } else {
          await window.grokApp.stopAgent().catch(() => undefined);
          setAgentReady(false);
          setSessionId("");
          sessionIdRef.current = "";
          setActiveMcpServers([]);
          setAgentCwd(null);
          boundTabIdRef.current = null;
          ownerItemsRef.current = [];
          clearBusyState();
          setDiffs([]);
          setSessionAlwaysApprove(false);
        }
      }

      setProjectPath(bundle.path);
      projectRef.current = bundle.path;
      setHarness(bundle.harness);
      setSettings(bundle.settings);
      applyTheme(bundle.settings?.theme);
      setModel(bundle.model || "grok-4.5");
      setEffort(bundle.reasoningEffort || "high");
      setStore(bundle.store);
      storeRef.current = bundle.store;
      // Keep sidebar “Tác vụ” list in sync when this bundle is the standalone workspace.
      if (standalonePath && pathsEqual(bundle.path, standalonePath)) {
        setStandaloneStore(bundle.store);
      }

      const returningToBusy =
        busyRef.current &&
        busyProjectPathRef.current &&
        pathsEqual(busyProjectPathRef.current, bundle.path);
      const ownerTabId = boundTabIdRef.current || busyTabIdRef.current;

      if (
        returningToBusy &&
        ownerTabId &&
        bundle.store.activeTabId === ownerTabId &&
        ownerItemsRef.current.length
      ) {
        // Back on owner tab mid-run → live stream buffer (fresher than disk).
        setItems(ownerItemsRef.current);
      } else {
        setItems(Array.isArray(bundle.chat?.items) ? bundle.chat.items : []);
      }

      setPreview(null);
      setAttachments([]);
      setComposerText(bundle.tab?.draft || "");
      setPrivacyDismissed(false);
      setChecklistOpen(false);
      setVerifyTier(null);
      setRunbookQ("");

      if (!busyRef.current) {
        assistantBuf.current = null;
        thoughtBuf.current = null;
        boundTabIdRef.current = null;
        ownerItemsRef.current = [];
      }

      const isStandalone =
        (standalonePath && pathsEqual(bundle.path, standalonePath)) ||
        /standalone-workspace$/i.test(bundle.path.replace(/[/\\]+$/, ""));

      if (isStandalone) {
        // Sandbox only — no real project tree / git / runbooks.
        setTree([]);
        setGitInfo(null);
        setGitStatus([]);
        setWorktrees([]);
        setRunbooks([]);
      } else {
        await loadTree(bundle.path);
        await Promise.all([
          refreshGit(bundle.path),
          refreshRunbooks(bundle.path),
        ]);
      }
    },
    [
      persistActive,
      persistTab,
      clearBusyState,
      loadTree,
      refreshGit,
      refreshRunbooks,
      applyTheme,
      standalonePath,
    ]
  );

  /** Local empty calendar-year grid (Tháng 1 → 12) when IPC fails. */
  const buildClientEmptyHeatmap = useCallback(() => {
    const dayKeyLocal = (ts: number) => {
      const d = new Date(ts);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };
    const cells: ProfileHeatCell[] = [];
    const year = new Date().getFullYear();
    // Full calendar year Jan 1 → Dec 31; pad start to Sunday (may include Dec prev year).
    let start = new Date(year, 0, 1);
    start.setDate(start.getDate() - start.getDay());
    const end = new Date(year, 11, 31);
    const endPad = new Date(end);
    if (endPad.getDay() < 6) endPad.setDate(endPad.getDate() + (6 - endPad.getDay()));
    for (let d = new Date(start); d.getTime() <= endPad.getTime(); d.setDate(d.getDate() + 1)) {
      cells.push({ date: dayKeyLocal(d.getTime()), tokens: 0, level: 0 });
    }
    const months: { date: string; label: string; month: number; year: number; weekIndex: number }[] =
      [];
    const firstWeekByMonth: Record<number, { date: string; weekIndex: number }> = {};
    for (let i = 0; i < cells.length; i++) {
      const [y, m] = cells[i].date.split("-");
      if (Number(y) !== year) continue;
      const month = Number(m);
      if (firstWeekByMonth[month] === undefined) {
        firstWeekByMonth[month] = { date: cells[i].date, weekIndex: Math.floor(i / 7) };
      }
    }
    for (let month = 1; month <= 12; month++) {
      const hit = firstWeekByMonth[month];
      if (!hit) continue;
      months.push({
        date: hit.date,
        label: `Tháng ${month}`,
        month,
        year,
        weekIndex: hit.weekIndex,
      });
    }
    const weeks = Math.ceil(cells.length / 7);
    return { cells, months, weeks };
  }, []);

  const refreshProfileStats = useCallback(async () => {
    setProfileLoading(true);
    try {
      if (!window.grokApp?.getProfileStats) {
        throw new Error("getProfileStats unavailable — restart app (main/preload)");
      }
      const stats = await window.grokApp.getProfileStats();
      if (!stats) {
        throw new Error("profile:stats returned empty");
      }
      // Guarantee a full heatmap grid so the UI never collapses to a hollow gap
      if (!stats.heatmap?.length) {
        const empty = buildClientEmptyHeatmap();
        stats.heatmap = empty.cells;
        stats.heatmapMonths = empty.months;
        stats.heatmapWeeks = empty.weeks;
      }
      setProfileStats(stats);
      if (stats?.error) {
        console.warn("[profile] stats error:", stats.error);
      }
    } catch (err) {
      console.warn("[profile] getProfileStats failed:", err);
      const empty = buildClientEmptyHeatmap();
      setProfileStats({
        lifetimeTokens: 0,
        lifetimeTokensLabel: "0",
        peakTokens: 0,
        peakTokensLabel: "0",
        longestTaskMs: 0,
        longestTaskLabel: "0s",
        currentStreak: 0,
        longestStreak: 0,
        totalTasks: 0,
        skillsDiscovered: 0,
        skillsUsedTotal: 0,
        topSkills: [],
        fastModePercent: 0,
        reasoning: { total: 0, top: null, topPct: 0, counts: {} },
        heatmap: empty.cells,
        heatmapMonths: empty.months,
        heatmapWeeks: empty.weeks,
        heatActiveDays: 0,
        hasData: false,
        sources: { log: "error", local: false },
        fetchedAt: new Date().toISOString(),
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setProfileLoading(false);
    }
  }, [buildClientEmptyHeatmap]);

  /**
   * Heat levels for coding-agent usage (often multi-million tokens/day).
   * Old chat-scale (5k–400k) painted every heavy day as L5 — useless for power users.
   * Thresholds = upper bound exclusive for L1–L4; L5 = at/above last bound.
   */
  const HEAT_THRESHOLDS = useMemo(
    () =>
      ({
        // /day — floor ~few M common for Grok coding agents
        daily: [2_000_000, 5_000_000, 12_000_000, 25_000_000] as const,
        // /week column
        weekly: [15_000_000, 40_000_000, 90_000_000, 180_000_000] as const,
        // year-to-date running sum
        cumulative: [30_000_000, 80_000_000, 200_000_000, 500_000_000] as const,
      }) as const,
    []
  );

  const heatLevelFor = useCallback(
    (tokens: number, mode: "daily" | "weekly" | "cumulative") => {
      const t = Number(tokens) || 0;
      if (t <= 0) return 0;
      const bounds = HEAT_THRESHOLDS[mode];
      if (t < bounds[0]) return 1;
      if (t < bounds[1]) return 2;
      if (t < bounds[2]) return 3;
      if (t < bounds[3]) return 4;
      return 5;
    },
    [HEAT_THRESHOLDS]
  );

  const formatHeatBound = useCallback((n: number) => {
    const v = Number(n) || 0;
    const fmt = (x: number) => x.toFixed(1).replace(/\.0$/, "").replace(".", ",");
    if (v >= 1e9) return `${fmt(v / 1e9)} Tỷ`;
    if (v >= 1e6) return `${fmt(v / 1e6)} Tr`;
    if (v >= 1e3) return `${fmt(v / 1e3)} N`;
    return String(Math.round(v));
  }, []);

  /** Legend swatch labels for current heatMode (L0…L5). */
  const heatLegendLabels = useMemo(() => {
    const b = HEAT_THRESHOLDS[heatMode];
    return [
      "0",
      `<${formatHeatBound(b[0])}`,
      `<${formatHeatBound(b[1])}`,
      `<${formatHeatBound(b[2])}`,
      `<${formatHeatBound(b[3])}`,
      `≥${formatHeatBound(b[3])}`,
    ] as const;
  }, [HEAT_THRESHOLDS, heatMode, formatHeatBound]);

  const displayHeatmap = useMemo(() => {
    const cells = profileStats?.heatmap || [];
    if (!cells.length) return [] as { date: string; tokens: number; level: number; tip: string }[];
    if (heatMode === "daily") {
      // Always recompute level from tokens (ignore stored level — scale may change).
      return cells.map((c) => {
        const tokens = c.tokens || 0;
        const level = heatLevelFor(tokens, "daily");
        return {
          date: c.date,
          tokens,
          level,
          tip: `${c.date}: ${tokens.toLocaleString()} tokens · L${level}`,
        };
      });
    }
    if (heatMode === "weekly") {
      const out: { date: string; tokens: number; level: number; tip: string }[] = [];
      for (let i = 0; i < cells.length; i += 7) {
        const slice = cells.slice(i, i + 7);
        const sum = slice.reduce((a, c) => a + (c.tokens || 0), 0);
        const level = heatLevelFor(sum, "weekly");
        const from = slice[0]?.date || "";
        const to = slice[slice.length - 1]?.date || "";
        for (const c of slice) {
          out.push({
            date: c.date,
            tokens: sum,
            level,
            tip: `${from} → ${to}: ${sum.toLocaleString()} tokens/tuần · L${level}`,
          });
        }
      }
      return out;
    }
    let run = 0;
    return cells.map((c) => {
      run += c.tokens || 0;
      const level = heatLevelFor(run, "cumulative");
      return {
        date: c.date,
        tokens: run,
        level,
        tip: `${c.date}: tích lũy ${run.toLocaleString()} tokens · L${level}`,
      };
    });
  }, [profileStats?.heatmap, heatMode, heatLevelFor]);

  const heatmapWeeks = useMemo(() => {
    const fromCells = Math.ceil((displayHeatmap.length || 0) / 7);
    if (fromCells > 0) return fromCells;
    if (profileStats?.heatmapWeeks) return profileStats.heatmapWeeks;
    return 0;
  }, [profileStats?.heatmapWeeks, displayHeatmap.length]);

  /** Month labels T1…T12 aligned to week columns (calendar year). */
  const heatmapMonthLabels = useMemo(() => {
    const weeks = heatmapWeeks;
    if (!weeks || !displayHeatmap.length) {
      return [] as { weekIndex: number; label: string; title: string; month: number }[];
    }

    const toShort = (month: number) => ({
      label: `T${month}`,
      title: `Tháng ${month}`,
      month,
    });

    const months = profileStats?.heatmapMonths || [];
    const fromBackend = months
      .filter((m) => typeof m.weekIndex === "number")
      .map((m) => {
        const month =
          typeof m.month === "number"
            ? m.month
            : Number(String(m.label || "").match(/\d+/)?.[0]) || 0;
        return {
          weekIndex: m.weekIndex as number,
          ...toShort(month || 1),
        };
      })
      .filter((m) => m.month >= 1 && m.month <= 12);
    if (fromBackend.length) return fromBackend;

    const yearCounts: Record<number, number> = {};
    for (const c of displayHeatmap) {
      const y = Number(c.date.split("-")[0]);
      if (Number.isFinite(y)) yearCounts[y] = (yearCounts[y] || 0) + 1;
    }
    const primaryYear =
      Number(
        Object.entries(yearCounts).sort((a, b) => b[1] - a[1])[0]?.[0]
      ) || new Date().getFullYear();

    const firstWeekByMonth: Record<number, number> = {};
    for (let i = 0; i < displayHeatmap.length; i++) {
      const [y, m] = displayHeatmap[i].date.split("-");
      if (Number(y) !== primaryYear) continue;
      const month = Number(m);
      if (firstWeekByMonth[month] === undefined) {
        firstWeekByMonth[month] = Math.floor(i / 7);
      }
    }
    const out: { weekIndex: number; label: string; title: string; month: number }[] = [];
    for (let month = 1; month <= 12; month++) {
      if (firstWeekByMonth[month] === undefined) continue;
      out.push({ weekIndex: firstWeekByMonth[month], ...toShort(month) });
    }
    return out;
  }, [heatmapWeeks, profileStats?.heatmapMonths, displayHeatmap]);

  /** One slot per week so month header columns match heat columns exactly. */
  const heatmapMonthSlots = useMemo(() => {
    const weeks = heatmapWeeks;
    if (!weeks) return [] as ({ label: string; title: string } | null)[];
    const slots: ({ label: string; title: string } | null)[] = Array.from(
      { length: weeks },
      () => null
    );
    for (const m of heatmapMonthLabels) {
      if (m.weekIndex >= 0 && m.weekIndex < weeks && !slots[m.weekIndex]) {
        slots[m.weekIndex] = { label: m.label, title: m.title };
      }
    }
    return slots;
  }, [heatmapWeeks, heatmapMonthLabels]);

  const hasHeatActivity = useMemo(
    () => (profileStats?.heatmap || []).some((c) => (c.tokens || 0) > 0),
    [profileStats?.heatmap]
  );

  const refreshMemories = useCallback(async () => {
    try {
      const store = await window.grokApp.listMemories();
      setMemories(store);
    } catch {
      setMemories(null);
    }
  }, []);

  const refreshSkills = useCallback(async () => {
    setSkillsLoading(true);
    try {
      const result = await window.grokApp.listSkills({
        projectPath: projectPath || null,
      });
      setSkillsList(result);
    } catch (err) {
      setSkillsList({
        ok: false,
        count: 0,
        uniqueCount: 0,
        skills: [],
        roots: [],
        projectPath: projectPath || null,
        fetchedAt: new Date().toISOString(),
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSkillsLoading(false);
    }
  }, [projectPath]);

  const filteredSkills = useMemo(() => {
    const list = skillsList?.skills || [];
    const q = skillsQuery.trim().toLowerCase();
    return list.filter((sk) => {
      if (skillsSourceFilter !== "all" && sk.source !== skillsSourceFilter) return false;
      if (!q) return true;
      return (
        sk.name.toLowerCase().includes(q) ||
        sk.folderName.toLowerCase().includes(q) ||
        (sk.description || "").toLowerCase().includes(q) ||
        (sk.sourceLabel || "").toLowerCase().includes(q)
      );
    });
  }, [skillsList?.skills, skillsQuery, skillsSourceFilter]);

  const refreshAppVersion = useCallback(async () => {
    try {
      const v = await window.grokApp.getAppVersion();
      setAppVersion(v);
      return v;
    } catch {
      setAppVersion(null);
      return null;
    }
  }, []);

  /**
   * Check GitHub Releases for a newer version.
   * - Manual (default): spinner + modal (available / info / error).
   * - quiet: no modal, no spinner; toast only when updateAvailable.
   */
  const runUpdateCheck = useCallback(
    async (opts?: { quiet?: boolean }) => {
      const quiet = opts?.quiet === true;
      if (!quiet) {
        setUpdateChecking(true);
        setUpdateError(null);
      }
      try {
        if (!quiet) {
          // Persist repo draft first so check uses the latest path without full Save.
          const draftRepo = (draftSettings.updateGithubRepo ?? "").trim();
          if (draftRepo !== (settings?.updateGithubRepo || "")) {
            const next = await window.grokApp.saveSettings({
              updateGithubRepo: draftRepo,
            });
            setSettings(next);
            setDraftSettings((s) => ({
              ...s,
              updateGithubRepo: next.updateGithubRepo || "",
            }));
          }
        }
        const result = await window.grokApp.checkForUpdates();
        setUpdateCheckResult(result);
        if (!quiet) await refreshAppVersion();
        if (result.updateAvailable) {
          if (quiet) {
            setUpdateToastOpen(true);
          } else {
            setUpdateToastOpen(false);
            setUpdateModal("available");
          }
        } else if (!quiet) {
          setUpdateModal("info");
        }
        return result;
      } catch (err) {
        if (quiet) {
          // Network / API failures stay silent on startup.
          return null;
        }
        const message = String((err as Error)?.message || err);
        setUpdateError(message);
        setUpdateCheckResult({
          ok: false,
          status: "error",
          currentVersion: appVersion?.version || "?",
          latestVersion: null,
          updateAvailable: false,
          message,
          releaseUrl: null,
          asset: null,
        });
        setUpdateModal("error");
        return null;
      } finally {
        if (!quiet) setUpdateChecking(false);
      }
    },
    [
      draftSettings.updateGithubRepo,
      settings?.updateGithubRepo,
      refreshAppVersion,
      appVersion?.version,
    ]
  );

  const startUpdateDownload = useCallback(async () => {
    const asset = updateCheckResult?.asset;
    if (!asset?.url) {
      // No installer asset yet — open release page instead of failing hard.
      if (updateCheckResult?.releaseUrl) {
        void window.grokApp.openExternal(updateCheckResult.releaseUrl);
      }
      setUpdateModal(null);
      return;
    }
    setUpdateProgress({
      phase: "starting",
      received: 0,
      total: asset.size || 0,
      percent: 0,
      bytesPerSecond: 0,
      speedLabel: "—",
      fileName: asset.name,
    });
    setUpdateDownloadPath(null);
    setUpdateError(null);
    setUpdateModal("downloading");
    try {
      const res = await window.grokApp.downloadUpdate(asset);
      if (res.ok && res.path) {
        setUpdateDownloadPath(res.path);
        setUpdateProgress((p) =>
          p
            ? {
                ...p,
                phase: "done",
                percent: 100,
                received: res.received || p.received,
                total: res.total || p.total,
              }
            : p
        );
        setUpdateModal("done");
      } else if (res.cancelled) {
        setUpdateModal(null);
        setUpdateProgress(null);
      } else {
        setUpdateError(res.error || "Tải cập nhật thất bại.");
        setUpdateModal("error");
      }
    } catch (err) {
      setUpdateError(String((err as Error)?.message || err));
      setUpdateModal("error");
    }
  }, [updateCheckResult]);

  const refreshCliStatus = useCallback(async () => {
    try {
      const st = await window.grokApp.getCliStatus();
      setCliStatus(st);
      return st;
    } catch {
      return null;
    }
  }, []);

  const startCliInstall = useCallback(async () => {
    setCliError(null);
    setCliInstallResult(null);
    setCliProgress({
      phase: "starting",
      received: 0,
      total: 0,
      percent: 0,
      bytesPerSecond: 0,
      speedLabel: "—",
      fileName: "Grok CLI",
    });
    setCliModal("downloading");
    try {
      const res = await window.grokApp.installCli({ channel: "stable" });
      if (res.ok && res.path) {
        setCliInstallResult({ version: res.version, path: res.path });
        setCliProgress((p) =>
          p
            ? {
                ...p,
                phase: "done",
                percent: 100,
                version: res.version,
                fileName: res.fileName || p.fileName,
              }
            : p
        );
        setCliModal("done");
        // Sync settings.grokPath (main also saves; refresh UI state)
        try {
          const next = await window.grokApp.getSettings();
          setSettings(next);
          setDraftSettings(next);
        } catch {
          /* ignore */
        }
        await refreshCliStatus();
      } else if (res.cancelled) {
        setCliModal(null);
        setCliProgress(null);
      } else {
        setCliError(res.error || "Cài Grok CLI thất bại.");
        setCliModal("error");
      }
    } catch (err) {
      setCliError(String((err as Error)?.message || err));
      setCliModal("error");
    }
  }, [refreshCliStatus]);

  useEffect(() => {
    (async () => {
      const s = await window.grokApp.getSettings();
      setSettings(s);
      setDraftSettings(s);
      applyTheme(s.theme);
      setModel(s.model || "grok-4.5");
      setEffort(s.reasoningEffort || "high");
      let saPath = "";
      try {
        saPath = await window.grokApp.getStandalonePath();
        setStandalonePath(saPath);
        const saStore = await window.grokApp.getStandaloneStore();
        setStandaloneStore(saStore);
      } catch {
        /* ignore */
      }
      await Promise.all([
        refreshAuth(),
        loadModels(),
        refreshUsage(),
        refreshStorage(),
        refreshAppVersion(),
      ]);
      if (s.lastProject) {
        try {
          const isSa =
            (saPath && pathsEqual(s.lastProject, saPath)) ||
            (await window.grokApp.isStandalonePath(s.lastProject));
          if (isSa) {
            await applyProject(await window.grokApp.openStandalone());
          } else {
            await applyProject(await window.grokApp.openProject(s.lastProject));
          }
        } catch {
          /* stale path — fall through to standalone */
          try {
            await applyProject(await window.grokApp.openStandalone());
          } catch {
            /* ignore */
          }
        }
      } else {
        // No last project → open chat-không-project so user can type immediately.
        try {
          await applyProject(await window.grokApp.openStandalone());
        } catch {
          /* ignore */
        }
      }
    })();
  }, [
    refreshAuth,
    loadModels,
    refreshUsage,
    refreshStorage,
    refreshAppVersion,
    applyProject,
    applyTheme,
  ]);

  runUpdateCheckRef.current = runUpdateCheck;

  // Quiet auto-check once after settings are ready: toast/badge only if newer release.
  // Fires once per app session; failures stay silent (no modal).
  useEffect(() => {
    if (!settings || quietUpdateCheckedRef.current) return;
    const t = window.setTimeout(() => {
      if (quietUpdateCheckedRef.current) return;
      quietUpdateCheckedRef.current = true;
      void runUpdateCheckRef.current({ quiet: true });
    }, 1800);
    return () => window.clearTimeout(t);
    // Only gate on settings being loaded — not on runUpdateCheck identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings != null]);

  // Progress stream while downloading update
  useEffect(() => {
    const off = window.grokApp.on("update:progress", (data) => {
      const p = data as UpdateProgress;
      setUpdateProgress(p);
      if (p.phase === "error") {
        setUpdateError(p.error || "Lỗi tải cập nhật");
        setUpdateModal("error");
      } else if (p.phase === "cancelled") {
        setUpdateModal(null);
        setUpdateProgress(null);
      }
    });
    return off;
  }, []);

  // Progress stream while installing Grok CLI
  useEffect(() => {
    const off = window.grokApp.on("cli:progress", (data) => {
      const p = data as CliProgress;
      setCliProgress(p);
      if (p.phase === "error") {
        setCliError(p.error || "Lỗi cài Grok CLI");
        setCliModal("error");
      } else if (p.phase === "cancelled") {
        setCliModal(null);
        setCliProgress(null);
      }
    });
    return off;
  }, []);

  // Device-code login progress (user code + waiting for web confirm)
  useEffect(() => {
    const off = window.grokApp.on("auth:login-progress", (data) => {
      const p = data as AuthLoginProgress;
      setLoginProgress(p);
      if (p.phase === "pending" || p.phase === "starting") {
        setLoginModal(true);
      }
      if (p.phase === "done" && p.message) {
        setAuthMsg(p.message);
      }
      if (p.phase === "error" && p.error) {
        setAuthMsg(p.error);
      }
    });
    return off;
  }, []);

  // Once per session: if Grok CLI missing → offer install (same UX family as update modal).
  useEffect(() => {
    if (!settings || cliCheckedRef.current) return;
    const t = window.setTimeout(() => {
      if (cliCheckedRef.current) return;
      cliCheckedRef.current = true;
      void (async () => {
        const st = await refreshCliStatus();
        if (st && !st.installed && st.supported) {
          setCliModal("missing");
        }
      })();
    }, 900);
    return () => window.clearTimeout(t);
  }, [settings != null, refreshCliStatus]);

  // Prefetch skill list once when Settings opens (nav badge + tab)
  useEffect(() => {
    if (!showSettings) return;
    void refreshSkills();
  }, [showSettings, projectPath, refreshSkills]);

  // Load profile / memories / version when settings opens on those tabs
  useEffect(() => {
    if (!showSettings) return;
    if (settingsTab === "hoso") {
      void refreshAuth();
      void refreshProfileStats();
    }
    if (settingsTab === "canhanhoa") void refreshMemories();
    if (settingsTab === "chung") {
      void refreshAppVersion();
      void refreshCliStatus();
    }
  }, [
    showSettings,
    settingsTab,
    refreshAuth,
    refreshProfileStats,
    refreshMemories,
    refreshAppVersion,
    refreshCliStatus,
  ]);

  useEffect(() => {
    const offs = [
      window.grokApp.on("usage:update", (d) => {
        const snap = d as UsageSnapshot;
        usageRef.current = snap;
        setUsage(snap);
      }),
      window.grokApp.on("storage:report", (d) => setStorageReport(d as StorageReport)),
      window.grokApp.on("storage:hygiene", () => {
        void refreshStorage();
      }),
      window.grokApp.on("usage:context", (d: any) => {
        // Always apply context snapshot — chip is tiny; suppressing while busy left
        // the footer stuck on "— / —" until a later refresh that often never came.
        setUsage((prev) => {
          const next = prev
            ? { ...prev, context: d }
            : {
                weeklyQuota: null,
                credits: null,
                fiveHour: null,
                week: null,
                context: d,
              };
          usageRef.current = next;
          return next;
        });
      }),
      window.grokApp.on("diff:new", (d) => {
        const diff = d as DiffResult;
        if (busyRef.current && diff?.filePath) {
          turnDiffsRef.current.set(diff.filePath, diff);
          syncLiveTurnEdits();
        }
        setDiffs((prev) => [diff, ...prev].slice(0, 30));
        setRightTab("diff");
      }),
      window.grokApp.on("agent:update", (data: any) => {
        // Drop events from other sessions; always route into owner tab (not the visible tab).
        const eventSession = data?.sessionId;
        if (
          eventSession &&
          sessionIdRef.current &&
          String(eventSession) !== String(sessionIdRef.current)
        ) {
          return;
        }

        const update = data?.update || data;
        const kind = update?.sessionUpdate || update?.type || "";
        if (kind === "agent_message_chunk" || kind === "agent_message" || kind === "message") {
          const chunk = extractTextChunk(update);
          if (!chunk) return;
          // Tier scan only when chunk is small-ish (avoid regex on huge cumulative deltas)
          if (chunk.length < 80) {
            const tierMatch =
              chunk.match(/\bTier\s*([123])\b/i) || chunk.match(/\bverify\s*tier\s*([123])\b/i);
            if (tierMatch) setVerifyTier(`Tier ${tierMatch[1]}`);
          }
          // Append + paint DOM immediately (same feel as Grok chat stream).
          if (!assistantBuf.current) {
            assistantBuf.current = { id: uid(), text: chunk };
            streamAssistantIdxRef.current = -1;
          } else {
            assistantBuf.current.text += chunk;
          }
          if (!paintStreamChunkNow("assistant")) {
            scheduleStreamMount();
          }
          return;
        }
        if (kind === "agent_thought_chunk" || kind === "agent_thought" || kind === "thought") {
          const chunk = extractTextChunk(update);
          if (!chunk) return;
          if (!thoughtBuf.current) {
            thoughtBuf.current = { id: uid(), text: chunk };
            streamThoughtIdxRef.current = -1;
          } else {
            thoughtBuf.current.text += chunk;
          }
          if (!paintStreamChunkNow("thought")) {
            scheduleStreamMount();
          }
          return;
        }
        if (kind === "tool_call" || kind === "tool_call_update") {
          // Commit any pending text before tools so order stays correct.
          if (streamPatchTimerRef.current) {
            clearTimeout(streamPatchTimerRef.current);
            streamPatchTimerRef.current = null;
          }
          flushStreamBuffers({ urgent: true });
          assistantBuf.current = null;
          thoughtBuf.current = null;
          streamAssistantElRef.current = null;
          streamAssistantIdRef.current = null;
          streamThoughtElRef.current = null;
          streamThoughtIdRef.current = null;
          streamAssistantIdxRef.current = -1;
          streamThoughtIdxRef.current = -1;
          hadToolsThisTurn.current = true;
          const t = formatTool(update);
          // While user is typing in composer, prefer transition so keystrokes stay snappy.
          mutateOwnerItems((prev) => upsertToolItem(prev, t), {
            urgent: !isTypingInComposer(),
          });
        }
      }),
      window.grokApp.on("agent:permission", (data: any) => {
        // Session-level always-approve
        if (sessionAlwaysApprove) {
          void window.grokApp.respondPermission({
            id: data.id,
            allow: true,
            optionId: "allow-always",
          });
          return;
        }
        setPermAllowMenuOpen(false);
        setPermission({ id: data.id, params: data.params });
      }),
      window.grokApp.on("agent:error", (data: any) => {
        flushStreamBuffers({ urgent: true });
        const started = turnStartedAtRef.current;
        const durationMs =
          started != null ? Math.max(0, Date.now() - started) : 0;
        const runId = runItemIdRef.current;
        const wantReport = settingsRef.current?.turnReport !== false;
        const wantNotify = settingsRef.current?.notifyOnTurnDone !== false;
        const fileEdits = takeTurnFileEdits();
        const reportBox: { current: TurnReportItem | null } = { current: null };
        mutateOwnerItems((prev) => {
          const next = prev.map((it) => {
            if (it.kind !== "run" || it.status !== "running") return it;
            const isCurrent = runId != null && it.id === runId;
            const start = tsToMs(it.ts);
            return {
              ...it,
              durationMs: isCurrent
                ? durationMs
                : start != null
                  ? Math.max(0, Date.now() - start)
                  : it.durationMs || 0,
              status: "done" as const,
              expanded: false,
            };
          });
          next.push({
            id: uid(),
            kind: "error",
            text: data?.message || String(data),
            ts: nowIso(),
          });
          {
            const built = buildTurnReportItem(
              next,
              runId,
              "error",
              durationMs,
              fileEdits
            );
            reportBox.current = built;
            if (wantReport) next.push(built);
          }
          return next;
        });
        if (reportBox.current) {
          showTurnDoneToast(reportBox.current);
          if (wantNotify) notifyTurnDone(reportBox.current);
        }
        clearBusyState();
        assistantBuf.current = null;
        thoughtBuf.current = null;
        streamAssistantElRef.current = null;
        streamAssistantIdRef.current = null;
        streamThoughtElRef.current = null;
        streamThoughtIdRef.current = null;
        streamAssistantIdxRef.current = -1;
        streamThoughtIdxRef.current = -1;
      }),
      window.grokApp.on("agent:exit", (data: any) => {
        flushStreamBuffers({ urgent: true });
        setAgentReady(false);
        setAgentCwd(null);
        setSessionId("");
        sessionIdRef.current = "";
        setActiveMcpServers([]);
        setSessionAlwaysApprove(false);
        const started = turnStartedAtRef.current;
        const durationMs =
          started != null ? Math.max(0, Date.now() - started) : 0;
        const runId = runItemIdRef.current;
        const wantReport = settingsRef.current?.turnReport !== false;
        const wantNotify = settingsRef.current?.notifyOnTurnDone !== false;
        const fileEdits = takeTurnFileEdits();
        const reportBox: { current: TurnReportItem | null } = { current: null };
        mutateOwnerItems((prev) => {
          const next = prev.map((it) => {
            if (it.kind !== "run" || it.status !== "running") return it;
            const isCurrent = runId != null && it.id === runId;
            const start = tsToMs(it.ts);
            return {
              ...it,
              durationMs: isCurrent
                ? durationMs
                : start != null
                  ? Math.max(0, Date.now() - start)
                  : it.durationMs || 0,
              status: "cancelled" as const,
              expanded: false,
            };
          });
          next.push({
            id: uid(),
            kind: "system",
            text: `Agent exited (code=${data?.code})`,
            ts: nowIso(),
          });
          if (busyRef.current) {
            const built = buildTurnReportItem(
              next,
              runId,
              "cancelled",
              durationMs,
              fileEdits
            );
            reportBox.current = built;
            if (wantReport) next.push(built);
          }
          return next;
        });
        if (reportBox.current) {
          showTurnDoneToast(reportBox.current);
          if (wantNotify) notifyTurnDone(reportBox.current);
        }
        clearBusyState();
        boundTabIdRef.current = null;
        assistantBuf.current = null;
        thoughtBuf.current = null;
        // Agent process dead — queued follow-ups cannot run safely.
        stealPayloadRef.current = null;
        promptQueueRef.current = [];
        setPromptQueue([]);
        setQueueMenuId(null);
        setEditingQueueId(null);
        setEditQueueText("");
      }),
    ];
    return () => offs.forEach((o) => o());
  }, [
    refreshStorage,
    sessionAlwaysApprove,
    mutateOwnerItems,
    clearBusyState,
    scheduleStreamFlush,
    scheduleStreamMount,
    paintStreamChunkNow,
    flushStreamBuffers,
    takeTurnFileEdits,
    showTurnDoneToast,
    syncLiveTurnEdits,
  ]);

  const onChatScroll = useCallback(() => {
    const el = chatRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = dist < 96;
  }, []);

  // Fallback auto-scroll when items commit (mount / tools / turn end). Stream path
  // already scrolls via scheduleStickScroll — avoid double work every token.
  useEffect(() => {
    scheduleStickScroll();
  }, [items, scheduleStickScroll]);

  // Post-task harness checklist when a turn finishes
  useEffect(() => {
    if (prevBusy.current && !busy) {
      const shouldShow =
        settings?.postTaskChecklist !== false &&
        Boolean(harness?.present) &&
        hadToolsThisTurn.current;
      if (shouldShow && projectPath) {
        void (async () => {
          try {
            const cl = await window.grokApp.getChecklist(projectPath);
            setChecklistItems(cl.items || []);
            setChecklistChecked({});
            setChecklistOpen(true);
          } catch {
            /* ignore */
          }
        })();
      }
      hadToolsThisTurn.current = false;
      if (projectPath) void refreshGit(projectPath);
    }
    if (busy) hadToolsThisTurn.current = hadToolsThisTurn.current || false;
    prevBusy.current = busy;
  }, [busy, harness?.present, projectPath, settings?.postTaskChecklist, refreshGit]);

  // Keyboard shortcuts — catalog in SHORTCUT_CATALOG / Settings → Phím tắt
  useEffect(() => {
    const isTypingTarget = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        el.isContentEditable
      );
    };

    const cycleTab = (dir: 1 | -1) => {
      const s = storeRef.current;
      const path = projectRef.current || projectPath;
      if (!s?.tabs?.length || !path) return;
      const ids = s.tabs.map((t) => t.id);
      const cur = s.activeTabId || ids[0];
      const idx = Math.max(0, ids.indexOf(cur || ""));
      const next = ids[(idx + dir + ids.length) % ids.length];
      if (next && next !== cur) void onSwitchTab(next);
    };

    const requestCloseActiveTab = () => {
      const path = projectRef.current || projectPath;
      const tabId = storeRef.current?.activeTabId;
      if (!path || !tabId) return;
      const onBusyProject = pathsEqual(busyProjectPathRef.current, path);
      const title =
        storeRef.current?.tabs.find((t) => t.id === tabId)?.title || "Chat";
      const isOwnerRunning =
        !!busyRef.current &&
        onBusyProject &&
        tabId === boundTabIdRef.current;
      setCloseTabConfirm({
        tabId,
        title,
        running: isOwnerRunning,
        projectPath: path,
        mode: "active",
      });
    };

    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;
      const alt = e.altKey;
      const key = e.key;
      const lower = key.toLowerCase();
      const typing = isTypingTarget(e.target);

      // —— Permission modal (highest priority for single keys) ——
      if (permission) {
        if (!mod && !alt && (lower === "y" || lower === "a") && !typing) {
          e.preventDefault();
          const optIds = resolvePermissionOptionIds(permission.params);
          setPermAllowMenuOpen(false);
          void window.grokApp
            .respondPermission({
              id: permission.id,
              allow: true,
              optionId: optIds.onceId,
            })
            .then(() => setPermission(null));
          return;
        }
        if (!mod && !alt && (lower === "n" || key === "Escape") && !typing) {
          e.preventDefault();
          setPermAllowMenuOpen(false);
          void window.grokApp
            .respondPermission({ id: permission.id, allow: false })
            .then(() => setPermission(null));
          return;
        }
      }

      // —— Escape stack ——
      if (key === "Escape") {
        if (permModeMenuOpen) {
          e.preventDefault();
          setPermModeMenuOpen(false);
          return;
        if (chatMenuOpen) {
          e.preventDefault();
          setChatMenuOpen(null);
          return;
        }
        }
        if (permAllowMenuOpen) {
          e.preventDefault();
          setPermAllowMenuOpen(false);
          return;
        }
        if (projectMenuPath || projectsSortMenuOpen) {
          e.preventDefault();
          setProjectMenuPath(null);
          setProjectsSortMenuOpen(false);
          return;
        }
        if (helpMenuOpen) {
          e.preventDefault();
          setHelpMenuOpen(false);
          return;
        }
        if (shortcutsModalOpen) {
          e.preventDefault();
          setShortcutsModalOpen(false);
          return;
        }
        if (imageLightbox) {
          e.preventDefault();
          closeImageLightbox();
          return;
        }
        if (removeRecentConfirm) {
          e.preventDefault();
          setRemoveRecentConfirm(null);
          return;
        }
        if (renameTabModal) {
          e.preventDefault();
          setRenameTabModal(null);
          return;
        }
        if (renameProjectModal) {
          e.preventDefault();
          setRenameProjectModal(null);
          return;
        }
        if (closeTabConfirm) {
          e.preventDefault();
          setCloseTabConfirm(null);
          return;
        }
        if (paletteOpen) {
          e.preventDefault();
          setPaletteOpen(false);
          return;
        }
        if (checklistOpen) {
          e.preventDefault();
          setChecklistOpen(false);
          return;
        }
        if (showUsage) {
          e.preventDefault();
          setShowUsage(false);
          return;
        }
        if (showSettings) {
          e.preventDefault();
          setShowSettings(false);
          return;
        }
        // Busy turn: stop (does not FIFO-drain queue)
        if (busyRef.current && !permission) {
          e.preventDefault();
          void cancelBusyTurn("user dừng (Esc)");
          return;
        }
        return;
      }

      // Lightbox zoom
      if (imageLightbox && (key === "+" || key === "=")) {
        e.preventDefault();
        nudgeLightboxZoom(25);
        return;
      }
      if (imageLightbox && key === "-") {
        e.preventDefault();
        nudgeLightboxZoom(-25);
        return;
      }
      if (imageLightbox && key === "0") {
        e.preventDefault();
        setLightboxZoom(100);
        return;
      }

      if (!mod) return;

      // Ctrl+K palette
      if (!alt && !shift && lower === "k") {
        e.preventDefault();
        setPaletteOpen(true);
        setPaletteQ("");
        setPaletteIdx(0);
        return;
      }

      // Ctrl+Tab / Ctrl+Shift+Tab — cycle tabs
      if (!alt && lower === "tab") {
        e.preventDefault();
        cycleTab(shift ? -1 : 1);
        return;
      }

      // Ctrl+W — close active tab
      if (!alt && !shift && lower === "w") {
        e.preventDefault();
        requestCloseActiveTab();
        return;
      }

      // Ctrl+L — focus composer
      if (!alt && !shift && lower === "l") {
        e.preventDefault();
        composerRef.current?.focus();
        return;
      }

      // Ctrl+Shift+Enter — start/restart agent
      if (!alt && shift && key === "Enter") {
        e.preventDefault();
        void startAgent();
        return;
      }

      // Ctrl+Shift+N — standalone task
      if (!alt && shift && lower === "n") {
        e.preventDefault();
        void newTab({ forceStandalone: true });
        return;
      }

      // Ctrl+N — new tab
      if (!alt && !shift && lower === "n") {
        e.preventDefault();
        void newTab();
        return;
      }

      // Ctrl+Shift+U — usage
      if (!alt && shift && lower === "u") {
        e.preventDefault();
        setShowUsage(true);
        void refreshUsage();
        return;
      }

      // Ctrl+Shift+/ or Ctrl+? — shortcuts panel (dedicated modal)
      if (!alt && shift && (key === "/" || key === "?" || lower === "/")) {
        e.preventDefault();
        setHelpMenuOpen(false);
        setShortcutQuery("");
        setShortcutsModalOpen(true);
        return;
      }

      // Ctrl+Shift+E/D/G — right panel tabs
      if (!alt && shift && lower === "e") {
        e.preventDefault();
        setShowRight(true);
        setRightTab("files");
        return;
      }
      if (!alt && shift && lower === "d") {
        e.preventDefault();
        setShowRight(true);
        setRightTab("diff");
        return;
      }
      if (!alt && shift && lower === "g") {
        e.preventDefault();
        setShowRight(true);
        setRightTab("git");
        if (projectPath) void refreshGit(projectPath);
        return;
      }

      // Ctrl+Alt+B = right panel (before plain Ctrl+B)
      if (alt && !shift && lower === "b") {
        e.preventDefault();
        setShowRight((v) => !v);
        return;
      }

      // Ctrl+B left sidebar
      if (!alt && !shift && lower === "b") {
        e.preventDefault();
        setShowLeft((v) => !v);
        return;
      }

      // Ctrl+J bottom
      if (!alt && !shift && lower === "j") {
        e.preventDefault();
        setShowBottom((v) => !v);
        return;
      }

      // Ctrl+O open project
      if (!alt && !shift && lower === "o") {
        e.preventDefault();
        void openFolder();
        return;
      }

      // Ctrl+, settings
      if (!alt && !shift && key === ",") {
        e.preventDefault();
        setShowSettings(true);
        setDraftSettings(settings || {});
        return;
      }

      // Ctrl+` terminal
      if (!alt && !shift && key === "`") {
        e.preventDefault();
        if (projectPath) void openTerminalHere();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    projectPath,
    imageLightbox,
    closeImageLightbox,
    nudgeLightboxZoom,
    removeRecentConfirm,
    renameProjectModal,
    renameTabModal,
    chatMenuOpen,
    closeTabConfirm,
    permission,
    permModeMenuOpen,
    permAllowMenuOpen,
    projectMenuPath,
    projectsSortMenuOpen,
    helpMenuOpen,
    shortcutsModalOpen,
    paletteOpen,
    checklistOpen,
    showUsage,
    showSettings,
    settings,
  ]);

  const openFolder = async () => {
    const result = await window.grokApp.pickProject();
    if (result) await applyProject(result);
  };
  const openRecent = async (p: string) => {
    await applyProject(await window.grokApp.openProject(p));
  };
  /** Open chat-không-project workspace (sidebar “Tác vụ”). Returns sandbox path. */
  const openStandaloneWorkspace = async (): Promise<string> => {
    const bundle = await window.grokApp.openStandalone();
    await applyProject(bundle);
    return bundle.path;
  };
  const openTerminalHere = async () => {
    if (!projectPath) {
      push({ id: uid(), kind: "error", text: "Chọn project hoặc Tác vụ trước khi mở terminal." });
      return;
    }
    try {
      const res = await window.grokApp.openTerminal({ cwd: projectPath });
      push({
        id: uid(),
        kind: "system",
        text: `Đã mở terminal ngoài (${res.cmd || "shell"}) · ${projectPath}`,
      });
    } catch (err: any) {
      push({ id: uid(), kind: "error", text: String(err?.message || err) });
    }
  };
  const openInExplorer = async (target?: string) => {
    const p = target || projectPath;
    if (!p) return;
    try {
      await window.grokApp.openPath(p);
    } catch (err: any) {
      push({ id: uid(), kind: "error", text: String(err?.message || err) });
    }
  };
  const openHarnessFile = async (which: "agentsMd" | "agentsIndex" | "memoryMd" | "runbookIndex") => {
    const p = harness?.paths?.[which];
    if (!p) {
      push({ id: uid(), kind: "system", text: `Không tìm thấy file ${which}.` });
      return;
    }
    try {
      const f = await window.grokApp.readFile(projectPath, p);
      setPreview({ path: f.path, content: f.content });
      setRightTab("preview");
      setShowRight(true);
    } catch (err: any) {
      // fallback: show in explorer
      try {
        await window.grokApp.showItemInFolder(p);
      } catch {
        push({ id: uid(), kind: "error", text: String(err?.message || err) });
      }
    }
  };
  const openWorktree = async (wtPath: string | null) => {
    if (!wtPath) return;
    try {
      await applyProject(await window.grokApp.openProject(wtPath));
    } catch (err: any) {
      push({ id: uid(), kind: "error", text: String(err?.message || err) });
    }
  };
  const removeRecent = (p: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRemoveRecentConfirm(p);
  };

  const requestRenameProject = (p: string) => {
    setProjectMenuPath(null);
    setRenameProjectModal({ path: p, name: projectName(p) });
  };

  const executeRenameProject = async () => {
    const conf = renameProjectModal;
    if (!conf) return;
    const nextName = conf.name.trim();
    if (
      !nextName ||
      nextName === "." ||
      nextName === ".." ||
      /^[. ]+$/.test(nextName) ||
      /[<>:"/\\|?*\u0000-\u001f]/.test(nextName)
    ) {
      setRenameProjectModal({ ...conf, error: "\u0054\u00ean project kh\u00f4ng h\u1ee3p l\u1ec7." });
      return;
    }
    if (nextName.length > 180) {
      setRenameProjectModal({ ...conf, error: "\u0054\u00ean project qu\u00e1 d\u00e0i." });
      return;
    }
    if (nextName.toLowerCase() === projectName(conf.path).toLowerCase()) {
      setRenameProjectModal(null);
      return;
    }

    const active = pathsEqual(projectRef.current, conf.path);
    if (busyRef.current && pathsEqual(busyProjectPathRef.current, conf.path)) {
      setRenameProjectModal({
        ...conf,
        error: "H\u00e3y d\u1eebng agent c\u1ee7a project tr\u01b0\u1edbc khi \u0111\u1ed5i t\u00ean.",
      });
      return;
    }

    try {
      if (active && agentReady) await stopAgent();
      const bundle = await window.grokApp.renameProject(conf.path, nextName);
      setPinnedProjects((prev) => {
        const next = prev.map((p) => (pathsEqual(p, conf.path) ? bundle.path : p));
        writeStoredJson(LS_PINNED_PROJECTS, next);
        return next;
      });
      setPinnedTabsByProject((prev) => {
        const oldKey = Object.keys(prev).find((key) => pathsEqual(key, conf.path));
        if (!oldKey) return prev;
        const next = { ...prev, [bundle.path]: prev[oldKey] };
        delete next[oldKey];
        writeStoredJson(LS_PINNED_TABS, next);
        return next;
      });
      setRenameProjectModal(null);
      if (active) {
        // Prevent applyProject from persisting the old path after the folder moved.
        projectRef.current = bundle.path;
        await applyProject(bundle);
      } else {
        setSettings(bundle.settings);
      }
    } catch (err: any) {
      setRenameProjectModal({
        ...conf,
        error: String(err?.message || err || "Kh\u00f4ng \u0111\u1ed5i t\u00ean \u0111\u01b0\u1ee3c project."),
      });
    }
  };

  const executeRemoveRecent = async (p: string) => {
    setRemoveRecentConfirm(null);
    try {
      const removingBusy =
        busyRef.current &&
        busyProjectPathRef.current &&
        pathsEqual(busyProjectPathRef.current, p);
      if (removingBusy || (projectPath === p && busyRef.current)) {
        stealPayloadRef.current = null;
        await cancelBusyTurn("gỡ project đang mở");
        await window.grokApp.stopAgent().catch(() => undefined);
        setAgentReady(false);
        setAgentCwd(null);
        setSessionId("");
        sessionIdRef.current = "";
        setActiveMcpServers([]);
      }
      clearPromptQueueForProject(p);
      // Drop local pin metadata for this path
      setPinnedProjects((prev) => {
        const nextPins = prev.filter((x) => !pathsEqual(x, p));
        writeStoredJson(LS_PINNED_PROJECTS, nextPins);
        return nextPins;
      });
      setPinnedTabsByProject((prev) => {
        const nextTabs = { ...prev };
        for (const k of Object.keys(nextTabs)) {
          if (pathsEqual(k, p)) delete nextTabs[k];
        }
        writeStoredJson(LS_PINNED_TABS, nextTabs);
        return nextTabs;
      });
      const next = await window.grokApp.removeRecentProject(p);
      setSettings(next);
      if (pathsEqual(projectPath, p)) {
        setProjectPath("");
        setStore(null);
        setItems([]);
        setHarness(null);
        clearComposerText();
        if (!busyRef.current) {
          boundTabIdRef.current = null;
          ownerItemsRef.current = [];
          clearBusyState();
        }
      }
    } catch {
      /* ignore */
    }
  };
  const insertRunbookPrompt = (rb: RunbookEntry) => {
    const text = [
      `Dùng runbook "${rb.title}"${rb.domain ? ` (domain: ${rb.domain})` : ""}.`,
      rb.symptom ? `Symptom/context: ${rb.symptom}` : "",
      rb.path ? `File: ${rb.path}` : "",
      "Orient ngắn rồi execute theo runbook; verify sau khi xong.",
    ]
      .filter(Boolean)
      .join("\n");
    setComposerText(text);
  };

  const startAgent = async () => {
    let cwd = projectPath || projectRef.current;
    if (!cwd) {
      // Auto-open standalone if user hits Start with no context.
      try {
        cwd = await openStandaloneWorkspace();
      } catch {
        push({ id: uid(), kind: "error", text: "Hãy chọn project hoặc mở Tác vụ trước." });
        return;
      }
    }
    if (!cwd) {
      push({ id: uid(), kind: "error", text: "Hãy chọn project hoặc mở Tác vụ trước." });
      return;
    }
    if (busyRef.current) {
      const bp = busyProjectPathRef.current;
      const label =
        bp && !pathsEqual(bp, cwd)
          ? `“${contextLabel(bp, standalonePath)}”`
          : storeRef.current?.tabs.find((t) => t.id === busyTabIdRef.current)?.title ||
            "tab khác";
      pushLocal({
        id: uid(),
        kind: "system",
        text: `Agent đang chạy ở ${label}. Đợi xong hoặc Dừng trước khi Start lại.`,
      });
      return;
    }
    setStarting(true);
    try {
      const result = await window.grokApp.startAgent({
        cwd,
        grokPath: settingsRef.current?.grokPath ?? settings?.grokPath,
        model,
        reasoningEffort: effort,
        alwaysApprove:
          settingsRef.current?.alwaysApprove ?? settings?.alwaysApprove,
      });
      setAgentReady(true);
      setAgentCwd(cwd);
      setSessionId(result.sessionId || "");
      sessionIdRef.current = result.sessionId || "";
      setActiveMcpServers(result.mcpServers || []);
      setHarness(result.harness);
      await refreshAuth();
      await refreshUsage();
    } catch (err: any) {
      setAgentReady(false);
      setAgentCwd(null);
      setActiveMcpServers([]);
      push({ id: uid(), kind: "error", text: String(err?.message || err) });
    } finally {
      setStarting(false);
    }
  };

  /**
   * Permission policy modes that actually work here (composer menu):
   * - ask → alwaysApprove off, modal mỗi tool nhạy cảm
   * - always → alwaysApprove on (--always-approve khi start)
   * Không hiện: “phê duyệt giúp tôi”, config.toml Codex (chưa có runtime).
   */
  const setPermissionMode = useCallback(
    async (mode: "ask" | "always") => {
      setPermModeMenuOpen(false);
      const alwaysApprove = mode === "always";
      try {
        const next = await window.grokApp.saveSettings({ alwaysApprove });
        setSettings(next);
        settingsRef.current = next;
        setDraftSettings((s) => ({ ...s, alwaysApprove }));
        if (!alwaysApprove) setSessionAlwaysApprove(false);
        if (agentReady) await startAgent();
      } catch {
        /* ignore */
      }
    },
    [agentReady, startAgent]
  );

  // Close permission-mode menu on outside click
  useEffect(() => {
    if (!permModeMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (t.closest(".perm-mode-wrap")) return;
      setPermModeMenuOpen(false);
      setChatMenuOpen(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [permModeMenuOpen]);

  // Close project / sort / help menus on outside click
  useEffect(() => {
    if (!projectMenuPath && !projectsSortMenuOpen && !helpMenuOpen && !chatMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (
        t.closest(".project-menu-wrap") ||
        t.closest(".chat-menu-wrap") ||
        t.closest(".projects-sort-wrap") ||
        t.closest(".help-menu-wrap")
      )
        return;
      setProjectMenuPath(null);
      setProjectsSortMenuOpen(false);
      setHelpMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [projectMenuPath, projectsSortMenuOpen, helpMenuOpen, chatMenuOpen]);

  const openShortcutsPanel = useCallback(() => {
    setHelpMenuOpen(false);
    setShowSettings(false);
    setShortcutQuery("");
    setShortcutsModalOpen(true);
  }, []);

  const openWhatsNew = useCallback(() => {
    setHelpMenuOpen(false);
    if (updateCheckResult?.updateAvailable) {
      setUpdateModal("available");
      return;
    }
    void runUpdateCheckRef.current({ quiet: false });
  }, [updateCheckResult?.updateAvailable]);

  const stopAgent = async () => {
    // Drop steal so cancelBusyTurn does not auto-run a follow-up into a dying process.
    stealPayloadRef.current = null;
    if (busyRef.current) {
      await cancelBusyTurn("stop agent");
    }
    await window.grokApp.stopAgent();
    setAgentReady(false);
    setAgentCwd(null);
    setSessionId("");
    sessionIdRef.current = "";
    setActiveMcpServers([]);
    boundTabIdRef.current = null;
    ownerItemsRef.current = [];
    clearBusyState();
    clearPromptQueue();
    assistantBuf.current = null;
    thoughtBuf.current = null;
  };

  const onModelChange = async (next: string) => {
    setModel(next);
    if (projectPath) {
      const res = await window.grokApp.setProjectModel(projectPath, next);
      setSettings(res.settings);
    }
    const m = models.find((x) => x.id === next);
    if (m && !m.supportsReasoningEffort) setEffort("high");
    if (agentReady) {
      await startAgent();
    }
  };

  const onEffortChange = async (next: string) => {
    setEffort(next);
    if (projectPath) await window.grokApp.setProjectEffort(projectPath, next);
    if (agentReady) {
      await startAgent();
    }
  };

  /**
   * New chat tab in the current workspace.
   * No project open → open standalone (chat không project) then create tab.
   * forceStandalone → always create under “Tác vụ”, even if a project is active.
   */
  const newTab = async (opts?: { forceStandalone?: boolean; projectPath?: string }) => {
    const beforePath = projectRef.current || projectPath;
    let path = opts?.projectPath || beforePath;
    let switchedWorkspace = false;
    if (opts?.projectPath && !pathsEqual(beforePath, opts.projectPath)) {
      await applyProject(await window.grokApp.openProject(opts.projectPath));
      path = opts.projectPath;
      switchedWorkspace = true;
    }
    if (opts?.forceStandalone || !path) {
      if (!path || !standalonePath || !pathsEqual(path, standalonePath)) {
        path = await openStandaloneWorkspace();
        switchedWorkspace = !pathsEqual(beforePath, path);
      }
    }
    if (!path) return;
    // Keep background turn running — only save current view
    const leavingId = storeRef.current?.activeTabId;
    const leavingOwner =
      busyRef.current &&
      leavingId &&
      leavingId === boundTabIdRef.current &&
      pathsEqual(busyProjectPathRef.current, path);
    if (leavingOwner) {
      ownerItemsRef.current = itemsRef.current;
      await persistTab(path, leavingId!, itemsRef.current, {
        draft: getComposerText(),
      });
    } else if (!switchedWorkspace && projectRef.current) {
      await persistActive(projectRef.current, itemsRef.current, { draft: getComposerText() });
    }
    const next = await window.grokApp.createTab(path, { model, reasoningEffort: effort });
    setStore(next);
    storeRef.current = next;
    if (standalonePath && pathsEqual(path, standalonePath)) {
      setStandaloneStore(next);
    }
    const tab = next.tabs.find((t) => t.id === next.activeTabId)!;
    setItems(tab.items || []);
    setModel(tab.model || model);
    setEffort(tab.reasoningEffort || effort);
    setComposerText(tab.draft || "");
    setAttachments([]);
    // Do not rebind stream owner or newSession while a turn is in-flight
    if (!busyRef.current) {
      assistantBuf.current = null;
      thoughtBuf.current = null;
      boundTabIdRef.current = null;
      if (agentReady) {
        try {
          const s = await window.grokApp.newSession(path);
          setSessionId(s.sessionId || "");
          sessionIdRef.current = s.sessionId || "";
          // MCP inject is per session/new — update badge from refreshed list
          if (Array.isArray((s as { mcpServers?: string[] }).mcpServers)) {
            setActiveMcpServers((s as { mcpServers?: string[] }).mcpServers || []);
          }
        } catch {
          await startAgent();
        }
      }
    }
  };

  // Native menu accelerators / submenu actions: Tệp · Chỉnh sửa · Xem · Trợ giúp
  useEffect(() => {
    const offs = [
      window.grokApp.on("menu:open-project", () => {
        void openFolder();
      }),
      window.grokApp.on("menu:settings", () => {
        setShowSettings(true);
        setDraftSettings(settings || {});
      }),
      window.grokApp.on("menu:usage", () => setShowUsage(true)),
      window.grokApp.on("menu:new-chat", () => {
        void newTab();
      }),
      window.grokApp.on("menu:toggle-right", () => setShowRight((v) => !v)),
      window.grokApp.on("menu:toggle-left", () => setShowLeft((v) => !v)),
      window.grokApp.on("menu:toggle-bottom", () => setShowBottom((v) => !v)),
      window.grokApp.on("menu:terminal", () => {
        void openTerminalHere();
      }),
      window.grokApp.on("menu:palette", () => {
        setPaletteOpen(true);
        setPaletteQ("");
      }),
      window.grokApp.on("menu:about", () => {
        setShowSettings(true);
        setSettingsTab("chung");
        setDraftSettings(settings || {});
        void refreshAppVersion();
        push({
          id: uid(),
          kind: "system",
          text: `Grok Build v${appVersion?.version || "?"} — desktop shell cho Grok CLI (xAI).`,
        });
      }),
    ];
    return () => offs.forEach((o) => o());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectPath, settings, model, effort, agentReady, items]);

  const onSwitchTab = async (tabId: string) => {
    const path = projectRef.current || projectPath;
    if (!path) return;
    if (storeRef.current?.activeTabId === tabId && pathsEqual(path, projectPath)) return;
    const leavingId = storeRef.current?.activeTabId;
    const onBusyProject = pathsEqual(busyProjectPathRef.current, path);

    // Persist leaving tab; if it's the busy owner, snapshot live stream items
    if (
      busyRef.current &&
      onBusyProject &&
      leavingId &&
      leavingId === boundTabIdRef.current
    ) {
      ownerItemsRef.current = itemsRef.current;
      await persistTab(path, leavingId, itemsRef.current, {
        draft: getComposerText(),
      });
    } else {
      await persistActive(path, itemsRef.current, { draft: getComposerText() });
    }

    const next = await window.grokApp.switchTab(path, tabId);
    setStore(next);
    storeRef.current = next;
    if (standalonePath && pathsEqual(path, standalonePath)) {
      setStandaloneStore(next);
    }
    const tab = next.tabs.find((t) => t.id === next.activeTabId)!;

    // Returning to owner mid-run → show live ownerItemsRef (fresher than disk)
    if (
      busyRef.current &&
      onBusyProject &&
      tabId === boundTabIdRef.current
    ) {
      setItems(
        ownerItemsRef.current.length ? ownerItemsRef.current : tab.items || []
      );
    } else {
      setItems(tab.items || []);
    }
    setModel(tab.model || model);
    setEffort(tab.reasoningEffort || effort);
    setComposerText(tab.draft || "");
    setAttachments([]);
    // Keep stream buffers while background turn continues
    if (!busyRef.current) {
      assistantBuf.current = null;
      thoughtBuf.current = null;
    }
  };

  const requestCloseTab = (
    tabId: string,
    path: string,
    mode: "active" | "standalone-list",
    titleOverride?: string
  ) => {
    if (!path) return;
    const sourceStore =
      mode === "standalone-list" ? standaloneStore || storeRef.current : storeRef.current;
    const title =
      titleOverride ||
      sourceStore?.tabs.find((t) => t.id === tabId)?.title ||
      "Chat";
    const onBusyProject = pathsEqual(busyProjectPathRef.current, path);
    const isOwnerRunning =
      !!busyRef.current &&
      onBusyProject &&
      tabId === boundTabIdRef.current;
    setCloseTabConfirm({
      tabId,
      title,
      running: isOwnerRunning,
      projectPath: path,
      mode,
    });
  };
  const onCloseTab = (tabId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const path = projectRef.current || projectPath;
    if (!path) return;

    const onBusyProject = pathsEqual(busyProjectPathRef.current, path);
    const title =
      storeRef.current?.tabs.find((t) => t.id === tabId)?.title || "Chat";
    const isOwnerRunning =
      !!busyRef.current &&
      onBusyProject &&
      tabId === boundTabIdRef.current;

    // Always confirm before delete — in-app modal (no native window.confirm).
    setCloseTabConfirm({
      tabId,
      title,
      running: isOwnerRunning,
      projectPath: path,
      mode: "active",
    });
  };

  const executeCloseTab = async () => {
    const conf = closeTabConfirm;
    if (!conf) return;
    setCloseTabConfirm(null);

    const { tabId, running, projectPath: path, mode } = conf;

    // Closing a Tác vụ from the sidebar while viewing a project (no context switch).
    if (mode === "standalone-list") {
      if (running) {
        stealPayloadRef.current = null;
        await cancelBusyTurn("đóng tab đang chạy");
      }
      clearPromptQueueForTab(tabId);
      try {
        const next = await window.grokApp.closeTab(path, tabId);
        setStandaloneStore(next);
        if (projectRef.current && pathsEqual(projectRef.current, path)) {
          setStore(next);
          storeRef.current = next;
        }
      } catch {
        /* ignore */
      }
      return;
    }

    const onBusyProject = pathsEqual(busyProjectPathRef.current, path);
    if (running) {
      stealPayloadRef.current = null;
      await cancelBusyTurn("đóng tab đang chạy");
    }
    clearPromptQueueForTab(tabId);

    if (storeRef.current?.activeTabId === tabId) {
      await persistActive(path, itemsRef.current, { draft: getComposerText() });
    } else if (
      onBusyProject &&
      tabId === boundTabIdRef.current &&
      ownerItemsRef.current.length
    ) {
      await persistTab(
        busyProjectPathRef.current || path,
        tabId,
        ownerItemsRef.current
      );
    }

    const next = await window.grokApp.closeTab(path, tabId);
    setStore(next);
    storeRef.current = next;
    if (standalonePath && pathsEqual(path, standalonePath)) {
      setStandaloneStore(next);
    }
    const tab = next.tabs.find((t) => t.id === next.activeTabId)!;

    if (
      busyRef.current &&
      onBusyProject &&
      next.activeTabId === boundTabIdRef.current
    ) {
      setItems(ownerItemsRef.current.length ? ownerItemsRef.current : tab.items || []);
    } else {
      setItems(tab.items || []);
    }
    setComposerText(tab.draft || "");
    // Do not rebind owner to the newly active tab while a turn is still running
    if (!busyRef.current) {
      boundTabIdRef.current = null;
    }
  };

  const openTitleMenu = useCallback(
    async (key: "file" | "edit" | "view" | "help", el: HTMLElement | null) => {
      if (!window.grokApp.popupMenu || !el) return;
      const rect = el.getBoundingClientRect();
      await window.grokApp.popupMenu(key, {
        x: Math.round(rect.left),
        y: Math.round(rect.bottom),
      });
    },
    []
  );

  const mergeAttachments = useCallback(
    (next: ComposerAttachment[]) => {
      if (!next.length) return;
      setAttachments((prev) => {
        const merged = [...prev, ...next];
        if (merged.length > MAX_ATTACHMENTS) {
          push({
            id: uid(),
            kind: "system",
            text: `Tối đa ${MAX_ATTACHMENTS} đính kèm / tin. Giữ ${MAX_ATTACHMENTS} mục mới nhất.`,
          });
          return merged.slice(-MAX_ATTACHMENTS);
        }
        return merged;
      });
    },
    [push]
  );

  const addBrowserFiles = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      try {
        const next: ComposerAttachment[] = [];
        // Prefer native path read (more reliable in Electron)
        const paths = files
          .map((f) => (f as File & { path?: string }).path)
          .filter((p): p is string => Boolean(p));
        if (paths.length && window.grokApp.readAttachmentPaths) {
          const results = await window.grokApp.readAttachmentPaths(paths);
          for (const r of results) {
            if (!r.ok) {
              push({ id: uid(), kind: "error", text: r.error || `Lỗi đọc ${r.name}` });
              continue;
            }
            if (r.kind === "image" && r.data) {
              next.push({
                id: uid(),
                kind: "image",
                name: r.name,
                mimeType: r.mimeType || "image/png",
                data: r.data,
                dataUrl: `data:${r.mimeType || "image/png"};base64,${r.data}`,
                size: r.size,
              });
            } else if (r.kind === "file") {
              next.push({
                id: uid(),
                kind: "file",
                name: r.name,
                path: r.path,
                mimeType: r.mimeType || "application/octet-stream",
                text: r.text,
                data: r.data,
                size: r.size,
                isBinary: r.isBinary,
                preview: r.text ? r.text.slice(0, 200) : undefined,
              });
            }
          }
        } else {
          for (const f of files) {
            const a = await browserFileToAttachment(f);
            if (a) next.push(a);
          }
        }
        mergeAttachments(next);
      } catch (err: any) {
        push({ id: uid(), kind: "error", text: String(err?.message || err) });
      }
    },
    [mergeAttachments, push]
  );

  const addFromClipboardImage = useCallback(async () => {
    try {
      const img = await window.grokApp.readClipboardImage();
      if (!img?.data) return false;
      mergeAttachments([
        {
          id: uid(),
          kind: "image",
          name: img.name || "clipboard.png",
          mimeType: img.mimeType || "image/png",
          data: img.data,
          dataUrl: `data:${img.mimeType || "image/png"};base64,${img.data}`,
          size: img.size,
        },
      ]);
      return true;
    } catch {
      return false;
    }
  }, [mergeAttachments]);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const onComposerPaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const cd = e.clipboardData;
      const files: File[] = [];

      if (cd?.items?.length) {
        for (const item of Array.from(cd.items)) {
          if (item.kind === "file") {
            const f = item.getAsFile();
            if (f) files.push(f);
          }
        }
      }
      if (!files.length && cd?.files?.length) {
        files.push(...Array.from(cd.files));
      }

      if (files.length) {
        // Sync preventDefault required
        e.preventDefault();
        const pastedText = cd?.getData("text/plain") || "";
        const cur = e.currentTarget.value || getComposerText();
        const start = e.currentTarget.selectionStart ?? cur.length;
        const end = e.currentTarget.selectionEnd ?? cur.length;
        if (pastedText) {
          setComposerText(cur.slice(0, start) + pastedText + cur.slice(end));
        }
        void addBrowserFiles(files);
        return;
      }

      // Text paste: let browser handle. Also try native image (screenshots on Windows).
      void (async () => {
        try {
          const img = await window.grokApp.readClipboardImage();
          if (!img?.data) return;
          // Avoid re-adding same clipboard image repeatedly within 2s
          const sig = img.data.slice(0, 64) + String(img.size);
          const now = Date.now();
          const last = (window as any).__lastClipImg as { sig: string; t: number } | undefined;
          if (last && last.sig === sig && now - last.t < 2000) return;
          (window as any).__lastClipImg = { sig, t: now };
          mergeAttachments([
            {
              id: uid(),
              kind: "image",
              name: img.name || "clipboard.png",
              mimeType: img.mimeType || "image/png",
              data: img.data,
              dataUrl: `data:${img.mimeType || "image/png"};base64,${img.data}`,
              size: img.size,
            },
          ]);
        } catch {
          /* ignore */
        }
      })();
    },
    [addBrowserFiles, mergeAttachments, getComposerText, setComposerText]
  );

  const onDragEnter = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer?.types?.includes("Files")) {
      e.preventDefault();
      setDragOver(true);
    }
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer?.types?.includes("Files")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setDragOver(true);
    }
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    // only clear when leaving the drop zone root
    if (e.currentTarget === e.target) setDragOver(false);
  }, []);

  const onDropFiles = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      const list = Array.from(e.dataTransfer?.files || []);
      if (!list.length) return;
      void addBrowserFiles(list);
    },
    [addBrowserFiles]
  );

  const pickFiles = async () => {
    try {
      // Prefer native dialog (gets absolute paths)
      const paths = await window.grokApp.pickAttachmentFiles();
      if (paths?.length) {
        const results = await window.grokApp.readAttachmentPaths(paths);
        const next: ComposerAttachment[] = [];
        for (const r of results) {
          if (!r.ok) {
            push({ id: uid(), kind: "error", text: r.error || r.name });
            continue;
          }
          if (r.kind === "image" && r.data) {
            next.push({
              id: uid(),
              kind: "image",
              name: r.name,
              mimeType: r.mimeType || "image/png",
              data: r.data,
              dataUrl: `data:${r.mimeType || "image/png"};base64,${r.data}`,
              size: r.size,
            });
          } else {
            next.push({
              id: uid(),
              kind: "file",
              name: r.name,
              path: r.path,
              mimeType: r.mimeType || "application/octet-stream",
              text: r.text,
              data: r.data,
              size: r.size,
              isBinary: r.isBinary,
              preview: r.text?.slice(0, 200),
            });
          }
        }
        mergeAttachments(next);
        return;
      }
    } catch {
      /* fall back to input */
    }
    fileInputRef.current?.click();
  };

  const finishTurn = useCallback(
    async (opts?: { cancelled?: boolean }) => {
      // Paint any buffered stream text before we finalize the turn.
      flushStreamBuffers({ urgent: true });
      const started = turnStartedAtRef.current;
      const durationMs =
        started != null ? Math.max(0, Date.now() - started) : 0;
      const runId = runItemIdRef.current;
      const status: "done" | "cancelled" = opts?.cancelled ? "cancelled" : "done";
      const wantReport = settings?.turnReport !== false;
      const wantNotify = settings?.notifyOnTurnDone !== false;
      const fileEdits = takeTurnFileEdits();
      // Object box: TS does not track assignments inside mutate callbacks for `let`.
      const reportBox: { current: TurnReportItem | null } = { current: null };

      // Finalize run header(s). Always heal any leftover status:"running"
      // so old activity cards never keep sharing the live clock.
      mutateOwnerItems((prev) => {
        let foundCurrent = false;
        const next: ChatItem[] = prev.map((it): ChatItem => {
          if (it.kind !== "run" || it.status !== "running") return it;
          const isCurrent = runId != null && it.id === runId;
          if (isCurrent) foundCurrent = true;
          const start = tsToMs(it.ts);
          const ownDuration = isCurrent
            ? durationMs
            : start != null
              ? Math.max(0, Date.now() - start)
              : it.durationMs || 0;
          const runStatus: "done" | "cancelled" = isCurrent ? status : "done";
          return {
            id: it.id,
            kind: "run",
            durationMs: ownDuration,
            // Only the active run gets cancelled/done from this finish; stragglers → done
            status: runStatus,
            expanded: false,
            // Keep original ts so static duration from timestamps stays stable
            ts: it.ts,
          };
        });
        if (!foundCurrent && runId) {
          // run id known but missing from list — nothing else to do
        } else if (!foundCurrent && !runId && durationMs > 0) {
          next.push({
            id: uid(),
            kind: "run",
            durationMs,
            status,
            expanded: false,
            ts: nowIso(),
          });
        }

        // Always build report for toast; append to chat when setting on
        const already =
          runId &&
          next.some(
            (it) =>
              it.kind === "turn_report" &&
              it.runId === runId &&
              it.status === status
          );
        if (!already) {
          const built = buildTurnReportItem(
            next,
            runId,
            status,
            durationMs,
            fileEdits
          );
          reportBox.current = built;
          if (wantReport) next.push(built);
        }
        return next;
      });

      const report = reportBox.current;

      if (report) {
        showTurnDoneToast(report);
        if (wantNotify) notifyTurnDone(report);
      }

      // Profile tokens are recorded in main after agent:prompt (turnAccum + log tail).
      // UI only handles auto-memory + refresh when Hồ sơ is open.
      try {
        const usedTools = Boolean(
          report ? report.toolCount > 0 : hadToolsThisTurn.current
        );
        if (settingsRef.current?.memoryEnabled !== false && report) {
          const summary =
            report.assistantPreview ||
            (report.toolTitles.length
              ? `Task used tools: ${report.toolTitles.slice(0, 6).join(", ")}`
              : "");
          if (summary) {
            void window.grokApp.autoMemoryFromTurn({
              summary,
              usedTools,
              projectPath: projectRef.current || null,
            });
          }
        }
        if (showSettings && settingsTab === "hoso") {
          void refreshProfileStats();
        }
      } catch {
        /* ignore analytics failures */
      }

      const owner = boundTabIdRef.current;
      const ownerProject = busyProjectPathRef.current || projectRef.current;
      if (owner && ownerProject) {
        const snap = ownerItemsRef.current.length
          ? ownerItemsRef.current
          : isViewingOwnerTab()
            ? itemsRef.current
            : ownerItemsRef.current;
        if (snap.length) {
          await persistTab(ownerProject, owner, snap);
        }
      }
      const finishedElsewhere =
        Boolean(ownerProject) && !pathsEqual(ownerProject, projectRef.current);
      clearBusyState();
      assistantBuf.current = null;
      thoughtBuf.current = null;
      if (finishedElsewhere && ownerProject) {
        // Bridge still bound to owner project — current view is not ready to send.
        // Leave agent alive so returning to that project can continue chatting.
        pushLocal({
          id: uid(),
          kind: "system",
          text: `Agent đã xong ở “${contextLabel(ownerProject, standalonePath)}”. Quay lại context đó để xem kết quả, hoặc Start Agent ở đây để chat.`,
        });
      }
      // Next queued follow-up (or steal) — only after busy cleared.
      scheduleQueueDrain();
    },
    [
      persistTab,
      clearBusyState,
      isViewingOwnerTab,
      mutateOwnerItems,
      flushStreamBuffers,
      settings?.turnReport,
      settings?.notifyOnTurnDone,
      showSettings,
      settingsTab,
      refreshProfileStats,
      pushLocal,
      standalonePath,
      scheduleQueueDrain,
      takeTurnFileEdits,
      showTurnDoneToast,
    ]
  );

  /**
   * Actually start an agent turn. Caller must ensure !busy (or after cancel).
   * Binds stream owner to payload tab/project so drain works off-tab.
   */
  const runAgentPrompt = useCallback(
    async (payload: QueuedPrompt) => {
      if (busyRef.current) return;
      const text = (payload.text || "").trim();
      const hasMedia =
        Boolean(payload.imagesForPrompt?.length) || Boolean(payload.filesForPrompt?.length);
      if (!text && !hasMedia) return;

      const tabId = payload.tabId || storeRef.current?.activeTabId || null;
      const path = payload.projectPath || projectRef.current || null;
      if (!tabId || !path) {
        pushLocal({
          id: uid(),
          kind: "error",
          text: "Không xác định được tab/project cho prompt.",
          ts: nowIso(),
        });
        return;
      }

      assistantBuf.current = null;
      thoughtBuf.current = null;
      hadToolsThisTurn.current = false;
      turnDiffsRef.current.clear();
      setLiveTurnEdits(null);
      stickToBottomRef.current = true;

      boundTabIdRef.current = tabId;
      setBusyTabId(tabId);
      busyTabIdRef.current = tabId;
      setBusyProjectPath(path);
      busyProjectPathRef.current = path;

      const viewingOwner =
        storeRef.current?.activeTabId === tabId &&
        Boolean(projectRef.current && pathsEqual(projectRef.current, path));

      let base: ChatItem[] = [];
      if (viewingOwner) {
        base = itemsRef.current;
      } else if (
        storeRef.current &&
        projectRef.current &&
        pathsEqual(projectRef.current, path)
      ) {
        base = storeRef.current.tabs.find((t) => t.id === tabId)?.items || [];
      } else if (ownerItemsRef.current.length) {
        base = ownerItemsRef.current;
      }

      // Heal leftover running headers
      base = base.map((it) => {
        if (it.kind !== "run" || it.status !== "running") return it;
        const start = tsToMs(it.ts);
        return {
          ...it,
          status: "done" as const,
          durationMs:
            it.durationMs > 0
              ? it.durationMs
              : start != null
                ? Math.max(0, Date.now() - start)
                : 0,
          expanded: false,
        };
      });

      const labelParts: string[] = [];
      if (payload.imagesForChat?.length) labelParts.push(`${payload.imagesForChat.length} ảnh`);
      if (payload.filesForChat?.length) labelParts.push(`${payload.filesForChat.length} file`);

      const userItem: ChatItem = {
        id: uid(),
        kind: "user",
        text: text || (labelParts.length ? `(${labelParts.join(", ")})` : ""),
        images: payload.imagesForChat?.length ? payload.imagesForChat : undefined,
        files: payload.filesForChat?.length ? payload.filesForChat : undefined,
        ts: nowIso(),
      };
      const runId = uid();
      runItemIdRef.current = runId;
      const runItem: ChatItem = {
        id: runId,
        kind: "run",
        durationMs: 0,
        status: "running",
        expanded: true,
        ts: nowIso(),
      };
      const nextItems = [...base, userItem, runItem];
      ownerItemsRef.current = nextItems;
      if (viewingOwner) {
        itemsRef.current = nextItems;
        setItems(nextItems);
      } else {
        void persistTab(path, tabId, nextItems, {}, { syncUi: false });
      }

      const started = Date.now();
      turnStartedAtRef.current = started;
      setTurnStartedAt(started);
      setBusy(true);
      busyRef.current = true;

      try {
        await window.grokApp.sendPrompt({
          text,
          images: payload.imagesForPrompt?.length ? payload.imagesForPrompt : undefined,
          files: payload.filesForPrompt?.length ? payload.filesForPrompt : undefined,
        });
        await refreshUsage();
      } catch (err: any) {
        mutateOwnerItems((prev) => [
          ...prev,
          {
            id: uid(),
            kind: "error",
            text: String(err?.message || err),
            ts: nowIso(),
          },
        ]);
      } finally {
        await finishTurnRef.current();
      }
    },
    [mutateOwnerItems, persistTab, pushLocal, refreshUsage]
  );

  useEffect(() => {
    runAgentPromptRef.current = runAgentPrompt;
  }, [runAgentPrompt]);

  useEffect(() => {
    finishTurnRef.current = finishTurn;
  }, [finishTurn]);

  const buildPayloadFromComposer = useCallback(
    (text: string): QueuedPrompt | null => {
      const tabId = storeRef.current?.activeTabId;
      const path = projectRef.current || projectPath;
      if (!tabId || !path) return null;

      const imagesForChat: ChatImage[] = attachments
        .filter((a): a is Extract<ComposerAttachment, { kind: "image" }> => a.kind === "image")
        .map(({ mimeType, dataUrl, name }) => ({ mimeType, dataUrl, name }));
      const filesForChat: ChatFileRef[] = attachments
        .filter((a): a is Extract<ComposerAttachment, { kind: "file" }> => a.kind === "file")
        .map(({ name, path: p, mimeType, size, isBinary, preview }) => ({
          name,
          path: p,
          mimeType,
          size,
          isBinary,
          preview,
        }));
      const imagesForPrompt: PromptImage[] = attachments
        .filter((a): a is Extract<ComposerAttachment, { kind: "image" }> => a.kind === "image")
        .map(({ mimeType, data }) => ({ mimeType, data }));
      const filesForPrompt: PromptFile[] = attachments
        .filter((a): a is Extract<ComposerAttachment, { kind: "file" }> => a.kind === "file")
        .map((f) => ({
          name: f.name,
          path: f.path,
          mimeType: f.mimeType,
          text: f.text,
          data: f.data,
          size: f.size,
        }));

      return {
        id: uid(),
        text: text.trim(),
        tabId,
        projectPath: path,
        imagesForPrompt: imagesForPrompt.length ? imagesForPrompt : undefined,
        filesForPrompt: filesForPrompt.length ? filesForPrompt : undefined,
        imagesForChat: imagesForChat.length ? imagesForChat : undefined,
        filesForChat: filesForChat.length ? filesForChat : undefined,
        createdAt: Date.now(),
      };
    },
    [attachments, projectPath]
  );

  const enqueueFollowUp = useCallback(
    (payload: QueuedPrompt) => {
      setQueue((prev) => [...prev, payload]);
      clearComposerText();
      setAttachments([]);
      setQueueMenuId(null);
    },
    [setQueue]
  );

  /** Cancel in-flight turn then run this prompt (Codex steal). */
  const stealWithPayload = useCallback(
    async (payload: QueuedPrompt) => {
      stealPayloadRef.current = payload;
      // Drop same id from queue if promoting a queued item
      setQueue((prev) => prev.filter((x) => x.id !== payload.id));
      setQueueMenuId(null);
      setEditingQueueId(null);
      if (busyRef.current) {
        await cancelBusyTurn("steal — chuyển prompt");
      } else {
        scheduleQueueDrain();
      }
    },
    [cancelBusyTurn, scheduleQueueDrain, setQueue]
  );

  const runStarter = async (prompt: string) => {
    setComposerText(prompt);
    let path = projectPath || projectRef.current;
    if (!path) {
      try {
        path = await openStandaloneWorkspace();
      } catch {
        push({ id: uid(), kind: "error", text: "Hãy mở project hoặc Tác vụ trước." });
        return;
      }
    }
    const text = prompt.trim();
    if (!text) return;

    const onBusyOwner =
      busy &&
      busyProjectPath &&
      path &&
      pathsEqual(busyProjectPath, path) &&
      busyTabId &&
      store?.activeTabId === busyTabId;

    if (busy && !onBusyOwner) {
      const elsewhere =
        busyProjectPath && path && !pathsEqual(busyProjectPath, path);
      const t = elsewhere
        ? `“${contextLabel(busyProjectPath, standalonePath)}”`
        : `“${store?.tabs.find((x) => x.id === busyTabId)?.title || "chat khác"}”`;
      pushLocal({
        id: uid(),
        kind: "system",
        text: `Agent đang chạy ở ${t}. Quay lại để dừng, hoặc đợi xong rồi gửi.`,
      });
      return;
    }

    if (busy && onBusyOwner) {
      const tabId = store?.activeTabId;
      if (!tabId) return;
      const payload: QueuedPrompt = {
        id: uid(),
        text,
        tabId,
        projectPath: path,
        createdAt: Date.now(),
      };
      if (messageQueueEnabled) {
        enqueueFollowUp(payload);
        return;
      }
      clearComposerText();
      await stealWithPayload(payload);
      return;
    }

    if (!agentReady || (agentCwd && path && !pathsEqual(agentCwd, path))) {
      push({
        id: uid(),
        kind: "system",
        text: "Đã điền prompt. Bấm Start Agent rồi Send — hoặc Send sẽ báo nếu agent chưa sẵn sàng.",
      });
      return;
    }

    const tabId = storeRef.current?.activeTabId;
    if (!tabId) return;
    clearComposerText();
    setAttachments([]);
    await runAgentPrompt({
      id: uid(),
      text,
      tabId,
      projectPath: path,
      createdAt: Date.now(),
    });
  };

  const send = async () => {
    const text = getComposerText().trim();
    if (!text && attachments.length === 0) return;

    // No workspace yet → open standalone chat (không project).
    if (!projectPath) {
      try {
        await openStandaloneWorkspace();
      } catch {
        push({ id: uid(), kind: "error", text: "Không mở được Tác vụ. Thử Tác vụ mới trên sidebar." });
        return;
      }
    }
    const cwd = projectRef.current || projectPath;

    const onBusyOwner =
      busy &&
      busyProjectPath &&
      cwd &&
      pathsEqual(busyProjectPath, cwd) &&
      busyTabId &&
      store?.activeTabId === busyTabId;

    if (busy && !onBusyOwner) {
      const elsewhere =
        busyProjectPath && !pathsEqual(busyProjectPath, projectPath);
      const t = elsewhere
        ? `“${contextLabel(busyProjectPath, standalonePath)}”`
        : busyTabId && store?.activeTabId !== busyTabId
          ? `“${store?.tabs.find((x) => x.id === busyTabId)?.title || "chat khác"}”`
          : "tab hiện tại";
      pushLocal({
        id: uid(),
        kind: "system",
        text: `Agent đang chạy ở ${t}. Quay lại tab/project đó để xếp hàng, dừng, hoặc steal.`,
      });
      return;
    }

    if (!agentReady || (agentCwd && cwd && !pathsEqual(agentCwd, cwd))) {
      if (!busy) {
        push({
          id: uid(),
          kind: "error",
          text: "Start Agent trước khi gửi (nút Bắt đầu trên thanh trên).",
        });
      }
      return;
    }

    const payload = buildPayloadFromComposer(text);
    if (!payload) {
      push({
        id: uid(),
        kind: "error",
        text: "Không xác định được tab/project.",
      });
      return;
    }

    if (busy && onBusyOwner) {
      if (messageQueueEnabled) {
        enqueueFollowUp(payload);
        return;
      }
      // Queue off → steal (cancel + run new). No double agent:prompt.
      clearComposerText();
      setAttachments([]);
      await stealWithPayload(payload);
      return;
    }

    clearComposerText();
    setAttachments([]);
    await runAgentPrompt(payload);
  };
  sendFnRef.current = send;

  const mapChatItems = (mapFn: (prev: ChatItem[]) => ChatItem[]) => {
    if (busyRef.current && isViewingOwnerTab()) {
      mutateOwnerItems(mapFn);
    } else {
      setItems(mapFn);
    }
  };

  const toggleToolExpanded = (id: string) => {
    mapChatItems((prev) =>
      prev.map((it) =>
        it.kind === "tool" && it.id === id ? { ...it, expanded: !it.expanded } : it
      )
    );
  };

  const toggleThoughtExpanded = (id: string) => {
    mapChatItems((prev) =>
      prev.map((it) =>
        it.kind === "thought" && it.id === id ? { ...it, expanded: !it.expanded } : it
      )
    );
  };

  const toggleRunExpanded = (id: string) => {
    mapChatItems((prev) =>
      prev.map((it) =>
        it.kind === "run" && it.id === id ? { ...it, expanded: !it.expanded } : it
      )
    );
  };

  const collapseAllTools = () => {
    mapChatItems((prev) =>
      prev.map((it) => {
        if (it.kind === "tool" || it.kind === "thought") return { ...it, expanded: false };
        if (it.kind === "run" && it.status !== "running") return { ...it, expanded: false };
        return it;
      })
    );
  };

  const openFile = async (node: FileNode) => {
    if (node.type !== "file" || !projectPath) return;
    try {
      const f = await window.grokApp.readFile(projectPath, node.path);
      setPreview({ path: f.path, content: f.content });
      setRightTab("preview");
    } catch (err: any) {
      push({ id: uid(), kind: "error", text: String(err?.message || err) });
    }
  };

  const selectedModel = models.find((m) => m.id === model);
  const efforts = selectedModel?.reasoningEfforts?.length
    ? selectedModel.reasoningEfforts
    : [
        { id: "high", label: "High" },
        { id: "medium", label: "Medium" },
        { id: "low", label: "Low" },
      ];
  const showEffort = selectedModel?.supportsReasoningEffort !== false && model.includes("grok-4");

  const authBadge = useMemo(() => {
    if (!auth) return { cls: "", label: "Auth …" };
    if (auth.loggedIn) return { cls: "good", label: auth.email || "Logged in" };
    if (auth.expired) return { cls: "warn", label: "Auth expired" };
    return { cls: "warn", label: "Not logged in" };
  }, [auth]);

  const ctx = usage?.context;
  const ctxUsed = ctx?.promptTokens ?? 0;
  const ctxWindow = ctx?.contextWindow ?? 500_000;
  const ctxUsedPct =
    ctx && Number.isFinite(ctx.usedPercent)
      ? ctx.usedPercent
      : ctxWindow > 0
        ? Math.min(100, (ctxUsed / ctxWindow) * 100)
        : null;
  /** Client style: "2.9K / 500K" — always show window so threshold is visible. */
  const ctxAbs = formatUsedLimit(
    ctx != null ? ctxUsed : null,
    ctx != null ? ctxWindow : null
  );
  // Show 0 / limit once usage snapshot exists; "— / —" only before first getUsage.
  const ctxLabel =
    ctxAbs ||
    (ctx != null ? formatUsedLimit(0, ctxWindow) || "0 / 500K" : "— / —");
  const ctxTone = usedPctTone(ctxUsedPct);
  const ctxTitle = ctx
    ? `Ngữ cảnh: ${formatNum(ctxUsed)} / ${formatNum(ctxWindow)} tokens` +
      (ctxUsedPct != null ? ` (${ctxUsedPct.toFixed(0)}% đã dùng)` : "") +
      (ctxUsed > 0
        ? " — prompt tokens turn gần nhất / cửa sổ model"
        : " — chạy 1 turn (Bắt đầu + gửi) để lấy số thật từ log CLI")
    : "Ngữ cảnh (đang tải… hoặc chưa có dữ liệu usage)";

  const isStandaloneMode = Boolean(
    projectPath && standalonePath && pathsEqual(projectPath, standalonePath)
  );
  const projLabel = isStandaloneMode
    ? "Tác vụ"
    : projectPath
      ? projectName(projectPath)
      : "Project";
  /** Bridge is for this project (or no cwd tracked yet). Must be before paletteCmds (TDZ). */
  const agentReadyHere =
    agentReady && (!agentCwd || pathsEqual(agentCwd, projectPath));
  /** Busy turn belongs to the currently open project. */
  const busyOnThisProject =
    busy && Boolean(busyProjectPath && pathsEqual(busyProjectPath, projectPath));
  /** Busy turn is running on a different project (background). */
  const busyOnOtherProject =
    busy && Boolean(busyProjectPath && projectPath && !pathsEqual(busyProjectPath, projectPath));
  /** Busy on another tab within the current project. */
  const busyOnOtherTab =
    busyOnThisProject && Boolean(busyTabId && store?.activeTabId !== busyTabId);
  /** Busy on the tab the user is currently viewing — can queue / steal. */
  const busyOnThisTab = Boolean(busy && busyOnThisProject && !busyOnOtherTab);
  /** Queue items for the visible tab only. */
  const visibleQueue = useMemo(() => {
    const tabId = store?.activeTabId;
    if (!tabId || !projectPath) return [] as QueuedPrompt[];
    return promptQueue.filter(
      (q) => q.tabId === tabId && pathsEqual(q.projectPath, projectPath)
    );
  }, [promptQueue, store?.activeTabId, projectPath]);
  /** Can type/send follow-ups while agent runs on this tab. */
  const canFollowUpWhileBusy = busyOnThisTab;
  /** Tabs shown under sidebar “Tác vụ” (standalone store). */
  const standaloneTabs = isStandaloneMode
    ? store?.tabs || standaloneStore?.tabs || []
    : standaloneStore?.tabs || [];
  const standaloneActiveId = isStandaloneMode
    ? store?.activeTabId
    : standaloneStore?.activeTabId;
  const starterCards = isStandaloneMode ? STANDALONE_STARTER_CARDS : STARTER_CARDS;

  /** Real projects only (exclude standalone sandbox path). */
  const sidebarProjects = useMemo(() => {
    const base = (settings?.recentProjects || []).filter(
      (p) => !standalonePath || !pathsEqual(p, standalonePath)
    );
    return orderSidebarProjects(base, pinnedProjects, projectSortMode, pathsEqual);
  }, [
    settings?.recentProjects,
    standalonePath,
    pinnedProjects,
    projectSortMode,
  ]);
  const visibleSidebarProjects = showAllProjects
    ? sidebarProjects
    : sidebarProjects.slice(0, SIDEBAR_PROJECTS_PREVIEW);
  const hiddenProjectCount = Math.max(
    0,
    sidebarProjects.length - SIDEBAR_PROJECTS_PREVIEW
  );

  const isProjectPinned = useCallback(
    (p: string) => pinnedProjects.some((x) => pathsEqual(x, p)),
    [pinnedProjects]
  );

  const togglePinProject = useCallback((p: string) => {
    setPinnedProjects((prev) => {
      const has = prev.some((x) => pathsEqual(x, p));
      const next = has
        ? prev.filter((x) => !pathsEqual(x, p))
        : [...prev.filter((x) => !pathsEqual(x, p)), p];
      writeStoredJson(LS_PINNED_PROJECTS, next);
      return next;
    });
    setProjectMenuPath(null);
  }, []);

  const setProjectSort = useCallback((mode: ProjectSortMode) => {
    setProjectSortMode(mode);
    try {
      localStorage.setItem(LS_PROJECT_SORT, mode);
    } catch {
      /* ignore */
    }
    setProjectsSortMenuOpen(false);
  }, []);

  const pinnedTabIdsFor = useCallback(
    (project: string | null | undefined): string[] => {
      if (!project) return [];
      const hit = Object.entries(pinnedTabsByProject).find(([k]) =>
        pathsEqual(k, project)
      );
      return (hit?.[1] || []).map((e) => e.id);
    },
    [pinnedTabsByProject]
  );

  const togglePinTab = useCallback(
    (project: string, tabId: string, title?: string) => {
      setPinnedTabsByProject((prev) => {
        const keyEntry = Object.keys(prev).find((k) => pathsEqual(k, project));
        const key = keyEntry || project;
        const cur = [...(prev[key] || [])];
        const idx = cur.findIndex((e) => e.id === tabId);
        if (idx >= 0) cur.splice(idx, 1);
        else
          cur.push({
            id: tabId,
            title: (title || "Chat").trim() || "Chat",
          });
        const next = { ...prev };
        if (cur.length === 0) delete next[key];
        else next[key] = cur;
        writeStoredJson(LS_PINNED_TABS, next);
        return next;
      });
    },
    []
  );

  const requestRenameTab = (projectPath: string, tabId: string, title: string) => {
    setChatMenuOpen(null);
    setRenameTabModal({
      projectPath,
      tabId,
      name: title.trim() || t("chat.renamePlaceholder"),
    });
  };

  const executeRenameTab = async () => {
    const conf = renameTabModal;
    if (!conf) return;
    const nextName = conf.name.replace(/\s+/g, " ").trim();
    if (!nextName) {
      setRenameTabModal((cur) => (cur ? { ...cur, error: t("chat.renameEmpty") } : cur));
      return;
    }
    if (nextName.length > 120) {
      setRenameTabModal((cur) => (cur ? { ...cur, error: t("chat.renameTooLong") } : cur));
      return;
    }
    try {
      const next = await window.grokApp.saveTab(conf.projectPath, conf.tabId, {
        title: nextName,
      });
      if (standalonePath && pathsEqual(conf.projectPath, standalonePath)) {
        setStandaloneStore(next);
      }
      if (projectRef.current && pathsEqual(projectRef.current, conf.projectPath)) {
        setStore(next);
        storeRef.current = next;
      }
      setPinnedTabsByProject((prev) => {
        const key = Object.keys(prev).find((k) => pathsEqual(k, conf.projectPath));
        if (!key) return prev;
        const nextPinned = {
          ...prev,
          [key]: prev[key].map((entry) =>
            entry.id === conf.tabId ? { ...entry, title: nextName } : entry
          ),
        };
        writeStoredJson(LS_PINNED_TABS, nextPinned);
        return nextPinned;
      });
      setRenameTabModal(null);
    } catch (err) {
      setRenameTabModal((cur) =>
        cur
          ? { ...cur, error: String((err as any)?.message || err || t("common.error")) }
          : cur
      );
    }
  };

  const isChatMenuOpen = (projectPath: string, tabId: string) =>
    Boolean(
      chatMenuOpen &&
        chatMenuOpen.tabId === tabId &&
        pathsEqual(chatMenuOpen.projectPath, projectPath)
    );

  const renderChatMenu = (
    projectPath: string,
    tabId: string,
    title: string,
    pinned: boolean,
    mode: "active" | "standalone-list"
  ) => {
    const menuOpen = isChatMenuOpen(projectPath, tabId);
    return (
      <div className="chat-menu-wrap" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="ghost icon session-more"
          title={t("chat.menu")}
          aria-label={t("chat.menu")}
          aria-expanded={menuOpen}
          onClick={() => {
            setProjectMenuPath(null);
            setChatMenuOpen((current) =>
              current && current.tabId === tabId && pathsEqual(current.projectPath, projectPath)
                ? null
                : { projectPath, tabId }
            );
          }}
        >
          <IconMore size={14} />
        </button>
        {menuOpen && (
          <div className="sidebar-ctx-menu chat-ctx-menu" role="menu">
            <button
              type="button"
              role="menuitem"
              onClick={() => requestRenameTab(projectPath, tabId, title)}
            >
              {t("chat.rename")}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setChatMenuOpen(null);
                togglePinTab(projectPath, tabId, title);
              }}
            >
              {pinned ? t("chat.unpin") : t("chat.pin")}
            </button>
            <button
              type="button"
              role="menuitem"
              className="danger"
              onClick={() => {
                setChatMenuOpen(null);
                requestCloseTab(tabId, projectPath, mode, title);
              }}
            >
              {t("chat.delete")}
            </button>
          </div>
        )}
      </div>
    );
  };

  const isTabPinned = useCallback(
    (project: string | null | undefined, tabId: string) =>
      pinnedTabIdsFor(project).includes(tabId),
    [pinnedTabIdsFor]
  );

  /** Flat list for Codex-style “Đã ghim” section. */
  const pinnedSidebarItems = useMemo((): PinnedSidebarItem[] => {
    const items: PinnedSidebarItem[] = [];
    for (const p of pinnedProjects) {
      items.push({ kind: "project", path: p });
    }
    for (const [proj, tabs] of Object.entries(pinnedTabsByProject)) {
      const isStandalone =
        proj === STANDALONE_PIN_KEY ||
        Boolean(standalonePath && pathsEqual(proj, standalonePath));
      for (const t of tabs) {
        // Live title if that workspace is open
        let title = t.title;
        if (isStandalone) {
          const live = (
            isStandaloneMode ? store?.tabs : standaloneStore?.tabs
          )?.find((x) => x.id === t.id);
          if (live?.title) title = live.title;
        } else if (projectPath && pathsEqual(proj, projectPath) && store?.tabs) {
          const live = store.tabs.find((x) => x.id === t.id);
          if (live?.title) title = live.title;
        }
        items.push({
          kind: "session",
          projectPath: proj,
          tabId: t.id,
          title: title || "Chat",
          isStandalone,
        });
      }
    }
    return items;
  }, [
    pinnedProjects,
    pinnedTabsByProject,
    standalonePath,
    isStandaloneMode,
    store?.tabs,
    standaloneStore?.tabs,
    projectPath,
  ]);

  const pinnedSectionActivity = Boolean(
    busy &&
      busyProjectPath &&
      busyTabId &&
      (pinnedProjects.some((p) => pathsEqual(p, busyProjectPath)) ||
        pinnedTabIdsFor(busyProjectPath).includes(busyTabId) ||
        (standalonePath &&
          pathsEqual(busyProjectPath, standalonePath) &&
          pinnedTabIdsFor(STANDALONE_PIN_KEY).includes(busyTabId)))
  );

  const toggleSidebarPinned = useCallback(() => {
    setSidebarPinnedOpen((v) => {
      const next = !v;
      writeStoredBool(LS_SIDEBAR_PINNED_OPEN, next);
      return next;
    });
  }, []);

  const openPinnedSession = useCallback(
    async (item: Extract<PinnedSidebarItem, { kind: "session" }>) => {
      try {
        if (item.isStandalone || item.projectPath === STANDALONE_PIN_KEY) {
          if (!isStandaloneMode) await openStandaloneWorkspace();
          const cur = storeRef.current;
          if (cur?.activeTabId !== item.tabId) await onSwitchTab(item.tabId);
          return;
        }
        if (!projectPath || !pathsEqual(projectPath, item.projectPath)) {
          await openRecent(item.projectPath);
        }
        // After project open, switch tab (store may have reloaded)
        await onSwitchTab(item.tabId);
      } catch (err: any) {
        push({
          id: uid(),
          kind: "error",
          text: String(err?.message || err || "Không mở được mục đã ghim"),
        });
      }
    },
    [isStandaloneMode, projectPath, openRecent, onSwitchTab, openStandaloneWorkspace, push]
  );

  /** Busy / permission state for sidebar rows (Codex: spinner + “Đang chờ phê duyệt”). */
  const waitingApproval = Boolean(permission);
  const projectsSectionActivity = Boolean(
    busy &&
      busyProjectPath &&
      (!standalonePath || !pathsEqual(busyProjectPath, standalonePath))
  );
  const tasksSectionActivity = Boolean(
    busy &&
      busyProjectPath &&
      standalonePath &&
      pathsEqual(busyProjectPath, standalonePath)
  );

  const toggleSidebarProjects = useCallback(() => {
    setSidebarProjectsOpen((v) => {
      const next = !v;
      writeStoredBool(LS_SIDEBAR_PROJECTS_OPEN, next);
      return next;
    });
  }, []);
  const toggleSidebarTasks = useCallback(() => {
    setSidebarTasksOpen((v) => {
      const next = !v;
      writeStoredBool(LS_SIDEBAR_TASKS_OPEN, next);
      return next;
    });
  }, []);

  const paletteCmds: PaletteCmd[] = useMemo(() => {
    const cmds: PaletteCmd[] = [
      { id: "open", label: "Open Folder…", hint: "Ctrl+O", run: () => void openFolder() },
      { id: "tab", label: "New Chat Tab", hint: "Ctrl+N", run: () => void newTab() },
      {
        id: "standalone",
        label: "Tác vụ mới (không project)",
        hint: "Ctrl+Shift+N",
        run: () => void newTab({ forceStandalone: true }),
      },
      { id: "terminal", label: "Open external terminal", hint: "Ctrl+`", run: () => void openTerminalHere() },
      { id: "explorer", label: "Open project in Explorer", run: () => void openInExplorer() },
      {
        id: "usage",
        label: "Usage panel",
        hint: "Ctrl+Shift+U",
        run: () => {
          setShowUsage(true);
          void refreshUsage();
        },
      },
      {
        id: "storage",
        label: "Clean IndexedDB bloat (x.com LevelDB WAL)",
        hint: storageReport?.officialGrok?.needsPurge
          ? `⚠ ${storageReport.officialGrok.xcomSize}`
          : storageReport?.officialGrok?.xcomSize || "scan",
        run: () => void cleanIndexedDb(),
      },
      { id: "storage-report", label: "Refresh storage report", run: () => void refreshStorage() },
      { id: "left", label: "Toggle left sidebar", hint: "Ctrl+B", run: () => setShowLeft((v) => !v) },
      {
        id: "right",
        label: "Toggle Files/Diff panel",
        hint: "Ctrl+Alt+B",
        run: () => setShowRight((v) => !v),
      },
      {
        id: "bottom",
        label: "Toggle bottom panel",
        hint: "Ctrl+J",
        run: () => setShowBottom((v) => !v),
      },
      {
        id: "collapse-tools",
        label: "Collapse all tool cards",
        run: () => collapseAllTools(),
      },
      { id: "settings", label: "Settings", hint: "Ctrl+,", run: () => setShowSettings(true) },
      {
        id: "shortcuts",
        label: "Keyboard shortcuts",
        hint: "Ctrl+Shift+/",
        run: () => openShortcutsPanel(),
      },
      {
        id: "diff",
        label: "Show Diffs",
        hint: "Ctrl+Shift+D",
        run: () => {
          setShowRight(true);
          setRightTab("diff");
        },
      },
      {
        id: "files",
        label: "Show Files",
        hint: "Ctrl+Shift+E",
        run: () => {
          setShowRight(true);
          setRightTab("files");
        },
      },
      {
        id: "harness",
        label: "Show Harness / Runbooks",
        run: () => {
          setShowRight(true);
          setRightTab("harness");
          if (projectPath) void refreshRunbooks(projectPath, runbookQ);
        },
      },
      {
        id: "git",
        label: "Show Git / Worktrees",
        hint: "Ctrl+Shift+G",
        run: () => {
          setShowRight(true);
          setRightTab("git");
          if (projectPath) void refreshGit(projectPath);
        },
      },
      {
        id: "start",
        label: agentReadyHere ? "Restart Agent" : "Start Agent",
        hint: "Ctrl+Shift+Enter",
        run: () => void startAgent(),
      },
      { id: "stop", label: "Stop turn / agent", hint: "Esc (khi busy)", run: () => void stopAgent() },
      {
        id: "focus-composer",
        label: "Focus composer",
        hint: "Ctrl+L",
        run: () => composerRef.current?.focus(),
      },
      {
        id: "checklist",
        label: "Show post-task checklist",
        run: () => {
          if (!projectPath) return;
          void (async () => {
            const cl = await window.grokApp.getChecklist(projectPath);
            setChecklistItems(cl.items || []);
            setChecklistOpen(true);
          })();
        },
      },
      {
        id: "billing",
        label: "Open xAI billing (browser)",
        run: () => void window.grokApp.openExternal("https://x.ai"),
      },
    ];
    for (const p of settings?.recentProjects || []) {
      cmds.push({
        id: `proj-${p}`,
        label: `Open project: ${projectDisplayName(p, settings?.recentProjects || [])}`,
        hint: p,
        run: () => void openRecent(p),
      });
    }
    return cmds;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    agentReady,
    agentReadyHere,
    settings?.recentProjects,
    storageReport,
    cleanIndexedDb,
    refreshStorage,
    projectPath,
    runbookQ,
    openShortcutsPanel,
  ]);

  const filteredPalette = paletteCmds.filter((c) => {
    if (!paletteQ.trim()) return true;
    const q = paletteQ.toLowerCase();
    return c.label.toLowerCase().includes(q) || (c.hint || "").toLowerCase().includes(q);
  });

  // Prefer SuperGrok weekly (real gate) for chip; fall back to monthly credits.
  const weeklyPct = remainingPctFromWindow(usage?.weeklyQuota);
  const creditPct = remainingPctFromWindow(usage?.credits);
  const primaryQuotaPct = weeklyPct != null ? weeklyPct : creditPct;
  const primaryQuotaLabel =
    weeklyPct != null
      ? `${weeklyPct.toFixed(0)}% tuần`
      : creditPct != null
        ? `${creditPct.toFixed(0)}% tháng`
        : "Usage";

  const titleMenus: { key: "file" | "edit" | "view" | "help"; label: string }[] = [
    { key: "file", label: t("menu.file") },
    { key: "edit", label: t("menu.edit") },
    { key: "view", label: t("menu.view") },
    { key: "help", label: t("menu.help") },
  ];

  const isDarwin =
    typeof navigator !== "undefined" &&
    (/Mac|iPhone|iPod|iPad/i.test(navigator.platform) ||
      /Mac OS X/i.test(navigator.userAgent));

  const liveChatTurn = Boolean(
    busyOnThisProject && busyTabId && store?.activeTabId === busyTabId
  );
  const chatTurnBlocks = useMemo(
    () =>
      buildChatTurnBlocks(items, {
        liveTurn: liveChatTurn,
        // Only the in-flight run item may tick (not older stuck "running" headers)
        liveRunId: liveChatTurn ? runItemIdRef.current : null,
      }),
    [items, liveChatTurn, busy, turnStartedAt]
  );

  const composerResetKey = `${projectPath || ""}::${store?.activeTabId || "none"}`;
  const visibleChatTurnBlocks = useMemo(
    () => chatTurnBlocks.slice(-visibleChatBlockCount),
    [chatTurnBlocks, visibleChatBlockCount]
  );
  const hiddenChatBlockCount = Math.max(
    0,
    chatTurnBlocks.length - visibleChatTurnBlocks.length
  );

  useEffect(() => {
    historyPrependRef.current = null;
    setVisibleChatBlockCount(CHAT_BLOCK_PAGE_SIZE);
  }, [composerResetKey]);

  const loadOlderChatBlocks = useCallback(() => {
    const el = chatRef.current;
    if (el) {
      historyPrependRef.current = {
        scrollHeight: el.scrollHeight,
        scrollTop: el.scrollTop,
      };
    }
    stickToBottomRef.current = false;
    setVisibleChatBlockCount((count) =>
      Math.min(chatTurnBlocks.length, count + CHAT_BLOCK_PAGE_SIZE)
    );
  }, [chatTurnBlocks.length]);

  useLayoutEffect(() => {
    const snapshot = historyPrependRef.current;
    const el = chatRef.current;
    if (!snapshot || !el) return;
    historyPrependRef.current = null;
    el.scrollTop =
      snapshot.scrollTop + el.scrollHeight - snapshot.scrollHeight;
  }, [visibleChatBlockCount]);
  const composerPlaceholder = useMemo(() => {
    if (canFollowUpWhileBusy) {
      return messageQueueEnabled
        ? "Yêu cầu thay đổi tiếp theo…"
        : "Gửi sẽ steal (dừng turn + chạy prompt mới)…";
    }
    if (isStandaloneMode) return "Hỏi bất cứ điều gì (không cần project)…";
    if (projectPath) return "Làm bất cứ điều gì…";
    return "Tác vụ mới hoặc mở project để chat…";
  }, [
    canFollowUpWhileBusy,
    messageQueueEnabled,
    isStandaloneMode,
    projectPath,
  ]);
  const composerDisabled =
    !projectPath || (busy && !canFollowUpWhileBusy);

  // Keep send-button.disabled in sync without draftNonEmpty React state.
  // data-* attrs + attachments length change on App re-render; keystrokes patch via DOM.
  useLayoutEffect(() => {
    attachmentsLenRef.current = attachments.length;
    const btn = sendBtnRef.current;
    if (btn) {
      btn.dataset.ready = agentReadyHere ? "1" : "0";
      btn.dataset.blocked = busy && !canFollowUpWhileBusy ? "1" : "0";
    }
    syncSendEnabled();
  }, [
    attachments.length,
    agentReadyHere,
    busy,
    canFollowUpWhileBusy,
    syncSendEnabled,
  ]);

  return (
    <div className={`shell ${isDarwin ? "is-darwin" : "is-win"}`}>
      {/* Hybrid titlebar: sidebar toggle · Tệp · Chỉnh sửa · Xem · Trợ giúp + drag · native caption only */}
      <header className="app-titlebar" aria-label={t("menu.bar")}>
        <div className="titlebar-left">
          <div className="titlebar-nav">
            <button
              type="button"
              className={`titlebar-nav-btn${showLeft ? " is-active" : ""}`}
              onClick={() => setShowLeft((v) => !v)}
              title={showLeft ? t("menu.hideSidebar") : t("menu.showSidebar")}
              aria-label={showLeft ? t("menu.hideSidebar") : t("menu.showSidebar")}
              aria-pressed={showLeft}
            >
              ☰
            </button>
          </div>
          <nav className="titlebar-menus" aria-label={t("menu.app")}>
            {titleMenus.map((m) => (
              <button
                key={m.key}
                type="button"
                className="titlebar-menu-item"
                onClick={(e) => void openTitleMenu(m.key, e.currentTarget)}
                onMouseDown={(e) => {
                  // Prevent drag region from stealing the click on Windows
                  e.stopPropagation();
                }}
              >
                {m.label}
              </button>
            ))}
          </nav>
        </div>
        <div className="titlebar-drag" aria-hidden />
      </header>

      <div
        className={[
          "app",
          showLeft ? "" : "no-left",
          showRight ? "" : "no-right",
          showBottom ? "has-bottom" : "",
          resizingSide ? "is-resizing" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={
          {
            "--sidebar": `${leftWidth}px`,
            "--right": `${rightWidth}px`,
          } as CSSProperties
        }
      >
      {showLeft && (
      <aside className="sidebar">
        <div
          className={`col-resizer col-resizer-left${resizingSide === "left" ? " is-active" : ""}`}
          role="separator"
          aria-orientation="vertical"
          aria-label={t("sidebar.resize")}
          aria-valuemin={SIDEBAR_MIN}
          aria-valuemax={SIDEBAR_MAX}
          aria-valuenow={leftWidth}
          title={t("sidebar.resizeTitle")}
          onMouseDown={(e) => beginColResize("left", e)}
          onDoubleClick={() => resetColWidth("left")}
        />
        <div className="brand">
          <div className="brand-row">
            <div className="logo-mark" aria-hidden title="Grok Build">
              <img className="logo-img logo-img-dark" src="./logo-dark.svg" alt="" width={28} height={28} />
              <img className="logo-img logo-img-light" src="./logo-light.svg" alt="" width={28} height={28} />
            </div>
            <div>
              <h1>Grok Build</h1>
            </div>
          </div>
        </div>

        <nav className="side-nav">
          <button
            type="button"
            className="side-nav-item"
            onClick={() => void newTab()}
            title={
              isStandaloneMode || !projectPath
                ? t("sidebar.newTaskTitle")
                : t("sidebar.newTabInProject")
            }
          >
            <span className="nav-ico nav-ico-plus">
              <IconPlus size={18} />
            </span>
            {t("sidebar.newTask")}
          </button>
          <button
            type="button"
            className="side-nav-item"
            onClick={() => {
              setPaletteOpen(true);
              setPaletteQ("");
            }}
          >
            <span className="nav-ico">
              <IconSearch size={16} />
            </span>
            {t("sidebar.palette")}
            <kbd>Ctrl+K</kbd>
          </button>
          <button
            type="button"
            className="side-nav-item muted"
            title="Chưa có panel browser — dùng web_search qua agent"
          >
            <span className="nav-ico">
              <IconBrowser size={16} />
            </span>
            {t("sidebar.browser")}
          </button>
          <button
            type="button"
            className="side-nav-item"
            disabled={!projectPath || isStandaloneMode}
            onClick={() => {
              setShowRight(true);
              setRightTab("git");
              if (projectPath) void refreshGit(projectPath);
            }}
            title={isStandaloneMode ? "Git chỉ có khi mở project folder" : "Git"}
          >
            <span className="nav-ico">
              <IconGitBranch size={16} />
            </span>
            Git
          </button>
        </nav>

        <div className="sidebar-scroll">
        {pinnedSidebarItems.length > 0 && (
          <>
            <div className="sidebar-section pinned-head">
              <button
                type="button"
                className="sidebar-section-toggle"
                onClick={toggleSidebarPinned}
                aria-expanded={sidebarPinnedOpen}
                title={
                  sidebarPinnedOpen ? "Thu gọn Đã ghim" : "Mở rộng Đã ghim"
                }
              >
                <span className="section-chevron" aria-hidden>
                  {sidebarPinnedOpen ? "▾" : "›"}
                </span>
                <h2>Đã ghim</h2>
                {!sidebarPinnedOpen && pinnedSectionActivity && (
                  <span
                    className="section-activity-dot"
                    title="Mục đã ghim đang chạy"
                    aria-label="Có hoạt động"
                  />
                )}
              </button>
            </div>
            {sidebarPinnedOpen && (
              <div className="pinned-list" aria-label="Mục đã ghim">
                {pinnedSidebarItems.map((item) => {
                  if (item.kind === "project") {
                    const active =
                      !isStandaloneMode &&
                      projectPath &&
                      pathsEqual(item.path, projectPath);
                    const projectBusy =
                      busy &&
                      busyProjectPath &&
                      pathsEqual(busyProjectPath, item.path);
                    const waiting =
                      waitingApproval && Boolean(projectBusy);
                    return (
                      <button
                        key={`pin-proj-${item.path}`}
                        type="button"
                        className={`session-item pinned-item project ${
                          active ? "active" : ""
                        } ${projectBusy ? "running" : ""} ${
                          waiting ? "waiting" : ""
                        }`}
                        onClick={() => void openRecent(item.path)}
                        title={item.path}
                      >
                        {projectBusy ? (
                          <span className="sidebar-spinner" aria-hidden />
                        ) : (
                          <span className="folder-ico pin-row-ico" aria-hidden>
                            <IconFolder size={14} />
                          </span>
                        )}
                        <span className="session-title">
                          {projectDisplayName(item.path, sidebarProjects)}
                        </span>
                        {waiting && (
                          <span className="session-status-badge waiting">
                            Đang chờ phê duyệt
                          </span>
                        )}
                        <span
                          className="session-pin on"
                          title="Bỏ ghim dự án"
                          onClick={(e) => {
                            e.stopPropagation();
                            togglePinProject(item.path);
                          }}
                          role="button"
                          tabIndex={0}
                        >
                          📌
                        </span>
                      </button>
                    );
                  }
                  // session
                  const sessBusy =
                    busy &&
                    busyTabId === item.tabId &&
                    busyProjectPath &&
                    (item.isStandalone
                      ? standalonePath &&
                        pathsEqual(busyProjectPath, standalonePath)
                      : pathsEqual(busyProjectPath, item.projectPath));
                  const sessWaiting = waitingApproval && sessBusy;
                  const sessActive =
                    item.isStandalone
                      ? isStandaloneMode &&
                        standaloneActiveId === item.tabId
                      : !isStandaloneMode &&
                        projectPath &&
                        pathsEqual(projectPath, item.projectPath) &&
                        store?.activeTabId === item.tabId;
                  return (
                    <button
                      key={`pin-sess-${item.projectPath}-${item.tabId}`}
                      type="button"
                      className={`session-item pinned-item session ${
                        sessActive ? "active" : ""
                      } ${sessBusy ? "running" : ""} ${
                        sessWaiting ? "waiting" : ""
                      }`}
                      onClick={() => void openPinnedSession(item)}
                      title={
                        item.isStandalone
                          ? item.title
                          : `${item.title} · ${projectName(item.projectPath)}`
                      }
                    >
                      {sessBusy ? (
                        <span className="sidebar-spinner" aria-hidden />
                      ) : (
                        <span className="session-dot pinned" />
                      )}
                      <span className="session-title">{item.title}</span>
                      {sessWaiting && (
                        <span className="session-status-badge waiting">
                          Đang chờ phê duyệt
                        </span>
                      )}
                      <span
                        className="session-pin on"
                        title="Bỏ ghim tác vụ"
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePinTab(
                            item.projectPath,
                            item.tabId,
                            item.title
                          );
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        📌
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}

        <div className="sidebar-section projects-head">
          <button
            type="button"
            className="sidebar-section-toggle"
            onClick={toggleSidebarProjects}
            aria-expanded={sidebarProjectsOpen}
            title={sidebarProjectsOpen ? "Thu gọn Dự án" : "Mở rộng Dự án"}
          >
            <span className="section-chevron" aria-hidden>
              {sidebarProjectsOpen ? "▾" : "›"}
            </span>
            <h2>{t("sidebar.projects")}</h2>
            {!sidebarProjectsOpen && projectsSectionActivity && (
              <span
                className="section-activity-dot"
                title="Có agent đang chạy trong dự án"
                aria-label="Có hoạt động"
              />
            )}
          </button>
          <div className="projects-head-actions">
            <div className="projects-sort-wrap">
              <button
                type="button"
                className="ghost icon sidebar-head-btn"
                title="Sắp xếp danh sách dự án"
                aria-expanded={projectsSortMenuOpen}
                aria-label="Sắp xếp danh sách dự án"
                onClick={(e) => {
                  e.stopPropagation();
                  setProjectsSortMenuOpen((v) => !v);
                  setProjectMenuPath(null);
                }}
              >
                <IconMore size={15} />
              </button>
              {projectsSortMenuOpen && (
                <div className="sidebar-ctx-menu projects-sort-menu" role="menu">
                  <p className="sidebar-ctx-label">Sắp xếp theo</p>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={projectSortMode === "pinned"}
                    className={projectSortMode === "pinned" ? "active" : ""}
                    onClick={() => setProjectSort("pinned")}
                  >
                    {projectSortMode === "pinned" ? "✓ " : ""}Ưu tiên (ghim trước)
                  </button>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={projectSortMode === "recent"}
                    className={projectSortMode === "recent" ? "active" : ""}
                    onClick={() => setProjectSort("recent")}
                  >
                    {projectSortMode === "recent" ? "✓ " : ""}Cập nhật gần đây
                  </button>
                </div>
              )}
            </div>
            <button
              type="button"
              className="ghost icon sidebar-head-btn"
              onClick={openFolder}
              title={t("menu.file.openProject")}
              aria-label={t("menu.file.openProject")}
            >
              <IconPlus size={15} />
            </button>
          </div>
        </div>
        {sidebarProjectsOpen && (
        <div className="recent-list">
          {visibleSidebarProjects.map((p) => {
            const active = !isStandaloneMode && pathsEqual(p, projectPath);
            const projectBusy =
              busy && busyProjectPath && pathsEqual(busyProjectPath, p);
            const showProjectWaiting = waitingApproval && Boolean(projectBusy);
            const pinned = isProjectPinned(p);
            const menuOpen = projectMenuPath != null && pathsEqual(projectMenuPath, p);
            const tabList = active
              ? tabsWithoutPinned(store?.tabs || [], pinnedTabIdsFor(p))
              : [];
            return (
              <div
                key={p}
                className={`project-block ${active ? "active" : ""} ${
                  projectBusy ? "project-running" : ""
                } ${showProjectWaiting ? "project-waiting" : ""} ${
                  pinned ? "project-pinned" : ""
                }`}
              >
                <div className="recent-item-row">
                  <button
                    type="button"
                    className="recent-item"
                    onClick={() => openRecent(p)}
                    title={p}
                  >
                    <div className="name">
                      <span className="folder-ico" aria-hidden>
                        <IconFolder size={15} />
                      </span>
                      <span className="project-name-text">{projectDisplayName(p, sidebarProjects)}</span>
                      {pinned && (
                        <span className="pin-mark" title="Đã ghim" aria-label="Đã ghim">
                          📌
                        </span>
                      )}
                      {showProjectWaiting ? (
                        <span
                          className="session-status-badge waiting"
                          title="Đang chờ phê duyệt tool"
                        >
                          Đang chờ phê duyệt
                        </span>
                      ) : projectBusy && !active ? (
                        <span
                          className="sidebar-spinner"
                          title="Agent đang chạy nền ở project này"
                          aria-label="Đang chạy"
                        />
                      ) : null}
                    </div>
                  </button>
                  {!active && (
                    <button
                      type="button"
                      className="ghost icon project-new-chat"
                      title={"\u0054\u1ea1o cu\u1ed9c tr\u00f2 chuy\u1ec7n trong project n\u00e0y"}
                      aria-label={"\u0054\u1ea1o cu\u1ed9c tr\u00f2 chuy\u1ec7n trong project n\u00e0y"}
                      onClick={(e) => {
                        e.stopPropagation();
                        void newTab({ projectPath: p });
                      }}
                    >
                      <IconPlus size={14} />
                    </button>
                  )}
                  <div className="project-menu-wrap">
                    <button
                      type="button"
                      className="ghost icon recent-more"
                      title="Tùy chọn dự án"
                      aria-label="Tùy chọn dự án"
                      aria-expanded={menuOpen}
                      onClick={(e) => {
                        e.stopPropagation();
                        setProjectsSortMenuOpen(false);
                        setProjectMenuPath((cur) =>
                          cur && pathsEqual(cur, p) ? null : p
                        );
                      }}
                    >
                      <IconMore size={15} />
                    </button>
                    {menuOpen && (
                      <div className="sidebar-ctx-menu project-ctx-menu" role="menu">
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => togglePinProject(p)}
                        >
                          {pinned ? "Bỏ ghim dự án" : "Ghim dự án"}
                        </button>
                         <button
                           type="button"
                           role="menuitem"
                           onClick={() => requestRenameProject(p)}
                         >
                           {"\u0110\u1ed5i t\u00ean project"}
                         </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setProjectMenuPath(null);
                            void openInExplorer(p);
                          }}
                        >
                          Mở trong File Explorer
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="danger"
                          onClick={(e) => {
                            setProjectMenuPath(null);
                            void removeRecent(p, e);
                          }}
                        >
                          Gỡ khỏi danh sách
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                {active && (
                  <div className="project-sessions">
                    {tabList.map((tab) => {
                      const tabRunning =
                        projectBusy && busyTabId != null && tab.id === busyTabId;
                      const tabWaiting = waitingApproval && tabRunning;
                      const tabPinned = isTabPinned(p, tab.id);
                      return (
                      <div
                        role="button"
                        tabIndex={0}
                        key={tab.id}
                        className={`session-item ${tab.id === store?.activeTabId ? "active" : ""} ${
                          tabRunning ? "running" : ""
                        } ${tabWaiting ? "waiting" : ""} ${tabPinned ? "pinned" : ""}`}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            void onSwitchTab(tab.id);
                          }
                        }}
                        onClick={() => void onSwitchTab(tab.id)}
                        title={
                          tabWaiting
                            ? "Đang chờ phê duyệt tool"
                            : tabRunning
                              ? "Agent đang chạy trên tab này"
                              : tab.title || "Chat"
                        }
                      >
                        {tabRunning ? (
                          <span className="sidebar-spinner" aria-hidden />
                        ) : (
                          <span className={`session-dot ${tabPinned ? "pinned" : ""}`} />
                        )}
                        <span className="session-title">{tab.title || "Chat"}</span>
                        {tabWaiting ? (
                          <span className="session-status-badge waiting">
                            Đang chờ phê duyệt
                          </span>
                        ) : null}
                        <span
                          className={`session-pin ${tabPinned ? "on" : ""}`}
                          title={tabPinned ? "Bỏ ghim tác vụ" : "Ghim tác vụ"}
                          onClick={(e) => {
                            e.stopPropagation();
                            togglePinTab(p, tab.id, tab.title || "Chat");
                          }}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              e.stopPropagation();
                              togglePinTab(p, tab.id, tab.title || "Chat");
                            }
                          }}
                        >
                          📌
                        </span>
                        <span
                          className="session-x"
                          onClick={(e) => void onCloseTab(tab.id, e)}
                          role="button"
                          tabIndex={0}
                        >
                          ×
                        </span>
                      {renderChatMenu(p, tab.id, tab.title || "Chat", tabPinned, "active")}
                      </div>
                      );
                    })}
                    <button type="button" className="session-item add" onClick={() => void newTab()}>
                      <span className="add-plus" aria-hidden>
                        +
                      </span>
                      Tab mới
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {sidebarProjects.length === 0 && (
            <div className="hint" style={{ padding: "8px 4px" }}>
              {t("sidebar.noProjects")}
            </div>
          )}
          {hiddenProjectCount > 0 && !showAllProjects && (
            <button
              type="button"
              className="sidebar-show-more"
              onClick={() => setShowAllProjects(true)}
            >
              Hiển thị thêm ({hiddenProjectCount})
            </button>
          )}
          {showAllProjects && sidebarProjects.length > SIDEBAR_PROJECTS_PREVIEW && (
            <button
              type="button"
              className="sidebar-show-more"
              onClick={() => setShowAllProjects(false)}
            >
              Thu gọn
            </button>
          )}
        </div>
        )}

        <div className="sidebar-section tasks-head">
          <button
            type="button"
            className="sidebar-section-toggle"
            onClick={toggleSidebarTasks}
            aria-expanded={sidebarTasksOpen}
            title={sidebarTasksOpen ? "Thu gọn Tác vụ" : "Mở rộng Tác vụ"}
          >
            <span className="section-chevron" aria-hidden>
              {sidebarTasksOpen ? "▾" : "›"}
            </span>
            <h2>{t("sidebar.tasks")}</h2>
            {!sidebarTasksOpen && tasksSectionActivity && (
              <span
                className="section-activity-dot"
                title="Có agent đang chạy trong Tác vụ"
                aria-label="Có hoạt động"
              />
            )}
          </button>
          <button
            type="button"
            className="ghost icon sidebar-head-btn"
            title="Tác vụ mới (chat không project)"
            aria-label="Tác vụ mới (chat không project)"
            onClick={() => void newTab({ forceStandalone: true })}
          >
            <IconPlus size={15} />
          </button>
        </div>
        {sidebarTasksOpen && (
        <div className="standalone-list">
          {tabsWithoutPinned(
            standaloneTabs,
            pinnedTabIdsFor(standalonePath || STANDALONE_PIN_KEY)
          ).map((tab) => {
            const active = isStandaloneMode && tab.id === standaloneActiveId;
            const tabRunning =
              busy &&
              busyTabId != null &&
              tab.id === busyTabId &&
              busyProjectPath &&
              standalonePath &&
              pathsEqual(busyProjectPath, standalonePath);
            const tabWaiting = waitingApproval && tabRunning;
            const pinKey = standalonePath || STANDALONE_PIN_KEY;
            const tabPinned = isTabPinned(pinKey, tab.id);
            return (
              <div
                role="button"
                tabIndex={0}
                key={tab.id}
                className={`session-item standalone-item ${active ? "active" : ""} ${
                  tabRunning ? "running" : ""
                } ${tabWaiting ? "waiting" : ""} ${tabPinned ? "pinned" : ""}`}
                onClick={() => {
                  void (async () => {
                    if (!isStandaloneMode) {
                      await openStandaloneWorkspace();
                    }
                    // After open, store may have different active tab — switch if needed
                    const cur = storeRef.current;
                    const wantId = tab.id;
                    if (cur?.activeTabId !== wantId) {
                      await onSwitchTab(wantId);
                    }
                  })();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.currentTarget.click();
                  }
                }}
                title={
                  tabWaiting
                    ? "Đang chờ phê duyệt tool"
                    : tabRunning
                      ? "Agent đang chạy trên tác vụ này"
                      : tab.title || "Hỏi đáp"
                }
              >
                {tabRunning ? (
                  <span className="sidebar-spinner" aria-hidden />
                ) : (
                  <span className={`session-dot ${tabPinned ? "pinned" : ""}`} />
                )}
                <span className="session-title">{tab.title || "Hỏi đáp"}</span>
                {tabWaiting ? (
                  <span className="session-status-badge waiting">
                    Đang chờ phê duyệt
                  </span>
                ) : null}
                <span
                  className={`session-pin ${tabPinned ? "on" : ""}`}
                  title={tabPinned ? "Bỏ ghim tác vụ" : "Ghim tác vụ"}
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePinTab(pinKey, tab.id, tab.title || "Hỏi đáp");
                  }}
                  role="button"
                  tabIndex={0}
                >
                  📌
                </span>
                <span
                  className="session-x"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isStandaloneMode) {
                      onCloseTab(tab.id, e);
                      return;
                    }
                    // Closing a Tác vụ while viewing a project — no context switch.
                    if (!standalonePath) return;
                    const title = tab.title || "Hỏi đáp";
                    const runningNow =
                      !!busyRef.current &&
                      busyTabId != null &&
                      tab.id === busyTabId &&
                      !!busyProjectPathRef.current &&
                      pathsEqual(busyProjectPathRef.current, standalonePath);
                    setCloseTabConfirm({
                      tabId: tab.id,
                      title,
                      running: runningNow,
                      projectPath: standalonePath,
                      mode: "standalone-list",
                    });
                  }}
                  role="button"
                  tabIndex={0}
                >
                  ×
                </span>
              {renderChatMenu(pinKey, tab.id, tab.title || "Chat", tabPinned, "standalone-list")}
              </div>
            );
          })}
          {standaloneTabs.length === 0 && (
            <div className="hint" style={{ padding: "4px 8px 8px" }}>
              Chat không cần mở folder — bấm + để tạo
            </div>
          )}
          <button
            type="button"
            className="session-item add"
            onClick={() => void newTab({ forceStandalone: true })}
          >
            <span className="add-plus" aria-hidden>
              +
            </span>
            {t("sidebar.addTask")}
          </button>
        </div>
        )}
        </div>

        <div className="sidebar-footer">
          <div className="footer-user-row">
            <button
              type="button"
              className="user-pill"
              onClick={() => setShowUsage(true)}
              title="Xem mức sử dụng"
            >
              <span
                className={`user-avatar ${agentReady ? "on" : "off"} ${
                  auth?.avatarUrl && !avatarBroken ? "has-img" : ""
                }`}
                aria-hidden
              >
                {auth?.avatarUrl && !avatarBroken ? (
                  <img
                    src={auth.avatarUrl}
                    alt=""
                    referrerPolicy="no-referrer"
                    draggable={false}
                    onError={() => setAvatarBroken(true)}
                  />
                ) : (
                  (auth?.email || "G").charAt(0).toUpperCase()
                )}
              </span>
              <span className="user-meta">
                <strong title={auth?.email || "Grok"}>{auth?.email || "Grok"}</strong>
                <small className="user-usage-line">
                  <span
                    className={`credit-chip ${
                      primaryQuotaPct == null
                        ? ""
                        : primaryQuotaPct <= 15
                          ? "low"
                          : primaryQuotaPct <= 40
                            ? "mid"
                            : "ok"
                    }`}
                    title={
                      weeklyPct != null && creditPct != null
                        ? `Tuần còn ${weeklyPct.toFixed(0)}% · Tháng còn ${creditPct.toFixed(0)}%`
                        : weeklyPct != null
                          ? `Tuần còn ${weeklyPct.toFixed(0)}%`
                          : creditPct != null
                            ? `Tháng còn ${creditPct.toFixed(0)}%`
                            : "Mức sử dụng"
                    }
                  >
                    <IconBolt size={11} />
                    {primaryQuotaLabel}
                  </span>
                  <span className="usage-sep" aria-hidden>
                    ·
                  </span>
                  <span
                    className={`ctx-chip footer-ctx ${ctxTone}`}
                    title={ctxTitle}
                  >
                    {ctxLabel}
                  </span>
                </small>
              </span>
            </button>
          </div>
          <div className="footer-actions">
            <button
              type="button"
              className="footer-settings"
              onClick={() => {
                setDraftSettings(settings || {});
                if (updateCheckResult?.updateAvailable) {
                  setSettingsTab("chung");
                }
                setShowSettings(true);
              }}
            >
              <IconGear size={15} />
              <span>{t("sidebar.settings")}</span>
              {updateCheckResult?.updateAvailable ? (
                <span
                  className="update-dot"
                  title={
                    updateCheckResult.latestVersion
                      ? `${t("update.available")} v${updateCheckResult.latestVersion}`
                      : t("settings.updateAvailableDot")
                  }
                  aria-label={t("settings.updateAvailableDot")}
                />
              ) : null}
            </button>
            <div className="footer-toggles">
              <div className="help-menu-wrap">
                <button
                  type="button"
                  className={`footer-icon-btn help-trigger ${
                    helpMenuOpen ? "active" : ""
                  }`}
                  title="Trợ giúp"
                  aria-label="Trợ giúp"
                  aria-expanded={helpMenuOpen}
                  aria-haspopup="menu"
                  onClick={() => {
                    setProjectMenuPath(null);
                    setProjectsSortMenuOpen(false);
                    setHelpMenuOpen((v) => !v);
                  }}
                >
                  ?
                </button>
                {helpMenuOpen && (
                  <div className="help-menu sidebar-ctx-menu" role="menu">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => openShortcutsPanel()}
                    >
                      Phím tắt bàn phím
                      <kbd className="help-menu-kbd">Ctrl+Shift+/</kbd>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => openWhatsNew()}
                    >
                      {updateCheckResult?.updateAvailable
                        ? "Có bản mới"
                        : "Kiểm tra cập nhật"}
                      {updateCheckResult?.updateAvailable ? (
                        <span className="update-dot help-menu-dot" aria-hidden />
                      ) : null}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setHelpMenuOpen(false);
                        void window.grokApp.openExternal(
                          "https://docs.x.ai/build/overview"
                        );
                      }}
                    >
                      Tài liệu Grok
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setHelpMenuOpen(false);
                        setShowSettings(true);
                        setSettingsTab("chung");
                        setDraftSettings(settings || {});
                        void refreshAppVersion();
                        push({
                          id: uid(),
                          kind: "system",
                          text: `Grok Build v${appVersion?.version || "?"} — desktop shell cho Grok CLI (xAI).`,
                        });
                      }}
                    >
                      Giới thiệu
                    </button>
                  </div>
                )}
              </div>
              <button
                type="button"
                className={`footer-icon-btn ${showRight ? "active" : ""}`}
                onClick={() => setShowRight((v) => !v)}
                title="Panel phải (Ctrl+Alt+B)"
                aria-label="Panel phải"
                aria-pressed={showRight}
              >
                <IconPanelRight />
              </button>
              <button
                type="button"
                className={`footer-icon-btn ${showBottom ? "active" : ""}`}
                onClick={() => setShowBottom((v) => !v)}
                title="Panel dưới (Ctrl+J)"
                aria-label="Panel dưới"
                aria-pressed={showBottom}
              >
                <IconPanelBottom />
              </button>
            </div>
          </div>
        </div>
      </aside>
      )}

      <div className="center-col">
      <main className="main">
        <header className="topbar slim">
          <div className="top-left">
            {projectPath ? (
              <span className="badge" title={isStandaloneMode ? "Chat không gắn folder project" : projectPath}>
                {isStandaloneMode ? t("sidebar.taskNoProject") : projLabel}
              </span>
            ) : (
              <span className="badge">Chưa mở project / tác vụ</span>
            )}
            <span
              className={`badge ${agentReadyHere ? "good" : busyOnOtherProject ? "warn" : ""}`}
              title={
                busyOnOtherProject && busyProjectPath
                  ? `Agent đang chạy nền ở ${contextLabel(busyProjectPath, standalonePath)}`
                  : agentReady && !agentReadyHere && agentCwd
                    ? `Agent gắn ${contextLabel(agentCwd, standalonePath)} — Start Agent để dùng ở đây`
                    : undefined
              }
            >
              <span
                className={`status-dot ${
                  agentReadyHere ? "on" : busyOnOtherProject ? "on" : "off"
                }`}
              />
              {busyOnOtherProject
                ? `Nền · ${contextLabel(busyProjectPath, standalonePath)}`
                : agentReadyHere
                  ? "Sẵn sàng"
                  : agentReady && agentCwd
                    ? `Khác context`
                    : "Chưa kết nối"}
            </span>
            {agentReadyHere && activeMcpServers.includes("chrome-devtools") && (
              <span className="badge mcp-badge" title="chrome-devtools-mcp đang inject vào session">
                MCP · Chrome
              </span>
            )}
            {busy && (
              <span className="badge warn">
                {busyOnOtherProject && busyProjectPath
                  ? `Đang chạy · ${contextLabel(busyProjectPath, standalonePath)}`
                  : busyTabId && store?.activeTabId === busyTabId
                    ? `Đang chạy · ${formatElapsed(
                        turnStartedAt != null ? Date.now() - turnStartedAt : 0
                      )}`
                    : `Đang chạy · ${
                        store?.tabs.find((t) => t.id === busyTabId)?.title || "tab khác"
                      }`}
              </span>
            )}
            {storageReport?.officialGrok?.needsPurge && (
              <button type="button" className="badge warn" onClick={() => void cleanIndexedDb()}>
                IDB bloat {storageReport.officialGrok.xcomSize}
              </button>
            )}
            {updateCheckResult?.updateAvailable && updateCheckResult.latestVersion ? (
              <button
                type="button"
                className="badge warn update-topbar-badge"
                title={`Có bản mới v${updateCheckResult.latestVersion} — bấm để xem`}
                onClick={() => {
                  setUpdateToastOpen(false);
                  setUpdateModal("available");
                }}
              >
                Cập nhật v{updateCheckResult.latestVersion}
              </button>
            ) : null}
          </div>
          <div className="top-controls">
            <button
              type="button"
              className="ghost"
              disabled={starting}
              onClick={() => void startAgent()}
            >
              {starting
                ? "Đang mở…"
                : agentReadyHere
                  ? "Khởi động lại"
                  : agentReady
                    ? isStandaloneMode
                      ? "Start tác vụ này"
                      : "Start project này"
                    : "Bắt đầu"}
            </button>
            {(agentReady || busy) && (
              <button type="button" className="ghost" onClick={() => void stopAgent()}>
                Dừng agent
              </button>
            )}
          </div>
        </header>

        {(busyOnOtherProject || busyOnOtherTab) && (
          <div className="busy-elsewhere-banner" role="status">
            <div className="busy-elsewhere-text">
              <strong>Agent đang chạy nền</strong>
              <span>
                {busyOnOtherProject && busyProjectPath ? (
                  <>
                    “{contextLabel(busyProjectPath, standalonePath)}” vẫn nhận message. Context
                    này không gửi được cho đến khi xong hoặc dừng.
                  </>
                ) : (
                  <>
                    Tab “{store?.tabs.find((t) => t.id === busyTabId)?.title || "Chat"}” vẫn nhận
                    message. Tab này không gửi được cho đến khi xong hoặc dừng.
                  </>
                )}
              </span>
            </div>
            <div className="row">
              {busyOnOtherProject && busyProjectPath ? (
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    if (standalonePath && pathsEqual(busyProjectPath, standalonePath)) {
                      void openStandaloneWorkspace();
                    } else {
                      void openRecent(busyProjectPath);
                    }
                  }}
                >
                  Quay lại
                </button>
              ) : busyTabId ? (
                <button
                  type="button"
                  className="ghost"
                  onClick={() => void onSwitchTab(busyTabId)}
                >
                  Quay lại tab
                </button>
              ) : null}
              <button
                type="button"
                className="danger"
                onClick={() =>
                  void cancelBusyTurn(
                    busyOnOtherProject ? "dừng từ project khác" : "dừng từ tab khác"
                  )
                }
              >
                Dừng agent
              </button>
            </div>
          </div>
        )}

        {harness?.present && settings?.privacyBanner !== false && !privacyDismissed && (
          <div className="privacy-banner">
            <div>
              <strong>Privacy · Harness</strong>
              <span>
                Không commit <code>.agents/</code>, <code>MEMORY.md</code>, secrets. Session chỉ local.
              </span>
            </div>
            <button type="button" className="ghost" onClick={() => setPrivacyDismissed(true)}>
              Đã hiểu
            </button>
          </div>
        )}

        <div className="chat" ref={chatRef} onScroll={onChatScroll}>
          {items.length === 0 ? (
            <div className="codex-empty">
              <div className="empty-logo" aria-hidden>
                <img className="logo-img logo-img-dark" src="./logo-dark.svg" alt="" width={44} height={44} />
                <img className="logo-img logo-img-light" src="./logo-light.svg" alt="" width={44} height={44} />
              </div>
              <h2>
                {isStandaloneMode
                  ? "Hỏi đáp, skills, không cần project"
                  : projectPath
                    ? `Chúng ta nên xây dựng gì trong ${projLabel}?`
                    : "Mở project hoặc bắt đầu Tác vụ"}
              </h2>
              <p className="empty-sub">
                {isStandaloneMode
                  ? "Chat tự do — skills, brainstorm, đọc log/đính kèm. Không gắn folder code."
                  : projectPath
                    ? "Chọn một hướng bên dưới hoặc gõ bất cứ điều gì vào ô chat."
                    : "Mở folder (Ctrl+O) cho coding agent, hoặc Tác vụ mới để chat không project."}
              </p>
              <div className="starter-grid">
                {(projectPath ? starterCards : STANDALONE_STARTER_CARDS).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`starter-card accent-${c.accent}`}
                    disabled={busy}
                    onClick={() => void runStarter(c.prompt)}
                  >
                    <span className="starter-icon">{c.icon}</span>
                    <span className="starter-title">{c.title}</span>
                  </button>
                ))}
              </div>
              {!projectPath && !busy && (
                <p className="empty-hint">
                  Bấm <strong>Tác vụ mới</strong> (sidebar) để chat ngay, hoặc{" "}
                  <strong>Ctrl+O</strong> mở project.
                </p>
              )}
              {!agentReadyHere && projectPath && !busyOnOtherProject && (
                <p className="empty-hint">
                  Bấm <strong>Bắt đầu</strong> trên thanh trên để kết nối agent, hoặc gửi prompt để
                  tự khởi động.
                </p>
              )}
            </div>
          ) : (
            <>
              {hiddenChatBlockCount > 0 && (
                <button
                  type="button"
                  className="ghost chat-history-more"
                  onClick={loadOlderChatBlocks}
                >
                  Tải tin nhắn cũ hơn ({hiddenChatBlockCount})
                </button>
              )}
              {visibleChatTurnBlocks.map((block) => {
              if (block.type === "user") {
                const it = block.item;
                return (
                  <div
                    className={`bubble ${it.kind}${block.turnStart ? " turn-start" : ""}`}
                    key={it.id}
                  >
                    {it.images && it.images.length > 0 && (
                      <div className="bubble-images">
                        {it.images.map((img, idx) => (
                          <button
                            type="button"
                            key={`${it.id}-img-${idx}`}
                            className="bubble-image-link"
                            title={img.name ? `${img.name} — bấm để xem` : "Bấm để xem ảnh"}
                            onClick={() =>
                              openImageLightbox(img.dataUrl, {
                                alt: img.name || "pasted",
                                name: img.name,
                              })
                            }
                          >
                            <img src={img.dataUrl} alt={img.name || "pasted"} />
                          </button>
                        ))}
                      </div>
                    )}
                    {it.files && it.files.length > 0 && (
                      <div className="bubble-files">
                        {it.files.map((f, idx) => (
                          <div
                            className="bubble-file-chip"
                            key={`${it.id}-f-${idx}`}
                            title={f.path || f.name}
                          >
                            <span className="bf-icon">📄</span>
                            <span className="bf-meta">
                              <strong>{f.name}</strong>
                              <small>
                                {f.isBinary ? "binary" : "text"}
                                {f.size != null ? ` · ${formatBytes(f.size)}` : ""}
                              </small>
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    {it.text ? <div className="body">{it.text}</div> : null}
                  </div>
                );
              }

              if (block.type === "activity") {
                // Prefer run.ts when available so a reopened tab still times correctly
                const liveStartMs =
                  tsToMs(block.run?.ts) ??
                  (turnStartedAt != null ? turnStartedAt : null);
                const durationMs = block.isLive
                  ? 0
                  : activityStaticDurationMs(block);
                const expanded = block.run
                  ? block.isLive
                    ? block.run.expanded !== false
                    : Boolean(block.run.expanded)
                  : Boolean(legacyActivityOpen[block.key]);
                const canToggle = Boolean(block.run) || block.steps.length > 0;

                const toolSteps = block.steps.filter(
                  (s): s is Extract<ChatItem, { kind: "tool" }> => s.kind === "tool"
                );
                const toolFailN = toolSteps.filter((t) => isToolFailed(t.status)).length;
                const thoughtOnly =
                  toolSteps.length === 0 &&
                  block.steps.some((s) => s.kind === "thought");
                // Codex: mid-turn clusters = “Đã chạy các lệnh”; one end marker elsewhere
                const variant: ActivityVariant = block.variant || "tool_group";
                const shellClass =
                  variant === "live"
                    ? "live"
                    : variant === "cancelled"
                      ? "cancelled"
                      : variant === "done"
                        ? "done"
                        : "tool-group";

                let labelNode: ReactNode;
                if (variant === "live") {
                  labelNode = (
                    <>
                      Đang hoạt động ·{" "}
                      <LiveElapsed startedAtMs={liveStartMs} />
                    </>
                  );
                } else if (variant === "cancelled") {
                  labelNode = `Đã dừng · ${formatElapsed(durationMs || 0)}`;
                } else if (variant === "done") {
                  // Fallback when turn_report is off — still only one per turn
                  labelNode = `Đã chạy xong · ${formatElapsed(durationMs || 0)}`;
                } else if (thoughtOnly) {
                  labelNode = "Suy nghĩ";
                } else {
                  // Codex-style tool cluster (not end-of-turn)
                  labelNode = "Đã chạy các lệnh";
                }

                return (
                  <div
                    className={`run-activity ${shellClass} ${
                      expanded ? "expanded" : "collapsed"
                    }`}
                    key={block.key}
                  >
                    <button
                      type="button"
                      className="run-activity-head"
                      onClick={() => {
                        if (block.run) {
                          toggleRunExpanded(block.run.id);
                        } else {
                          setLegacyActivityOpen((m) => ({
                            ...m,
                            [block.key]: !m[block.key],
                          }));
                        }
                      }}
                      disabled={!canToggle}
                      title={expanded ? "Thu gọn chi tiết" : "Xem chi tiết"}
                    >
                      {variant === "done" || variant === "cancelled" ? (
                        <span
                          className={`run-activity-icon ${shellClass}`}
                          aria-hidden
                        >
                          {variant === "cancelled" ? "■" : "✓"}
                        </span>
                      ) : null}
                      <span className="run-activity-chevron" aria-hidden>
                        {expanded ? "▾" : "›"}
                      </span>
                      <span className="run-activity-label">{labelNode}</span>
                      {variant === "live" && (
                        <span className="run-activity-pulse" aria-hidden />
                      )}
                      {variant !== "live" && toolSteps.length > 0 && (
                        <span className="run-activity-meta">
                          {toolSteps.length === 1
                            ? "1 thao tác"
                            : `${toolSteps.length} thao tác`}
                          {toolFailN > 0
                            ? ` · ${toolFailN === 1 ? "1 lỗi" : `${toolFailN} lỗi`}`
                            : ""}
                        </span>
                      )}
                      {variant !== "live" &&
                        toolSteps.length === 0 &&
                        block.steps.length > 0 && (
                        <span className="run-activity-meta">
                          {block.steps.length} bước
                        </span>
                      )}
                    </button>
                    {expanded && block.steps.length > 0 && (
                      <div className="run-activity-body">
                        {block.steps.map((it) => {
                          if (it.kind === "tool") {
                            return (
                              <div
                                className={`bubble tool ${
                                  isToolRunning(it.status) ? "tool-running" : ""
                                } ${isToolFailed(it.status) ? "tool-failed" : ""} ${
                                  it.expanded ? "expanded" : "collapsed"
                                }`}
                                key={it.id}
                              >
                                <button
                                  type="button"
                                  className="tool-head"
                                  onClick={() => toggleToolExpanded(it.id)}
                                  title={it.expanded ? "Thu gọn" : "Xem chi tiết"}
                                >
                                  <span className="tool-chevron" aria-hidden>
                                    {it.expanded ? "▾" : "▸"}
                                  </span>
                                  <span
                                    className={`tool-status-dot ${
                                      isToolRunning(it.status)
                                        ? "run"
                                        : isToolFailed(it.status)
                                          ? "fail"
                                          : "ok"
                                    }`}
                                  />
                                  <span className="tool-title">
                                    {humanizeToolTitle(it.title, it.detail)}
                                  </span>
                                  {(() => {
                                    const st = formatToolStatus(it.status);
                                    return st ? (
                                      <span className="tool-status">{st}</span>
                                    ) : null;
                                  })()}
                                  {!it.expanded &&
                                    (() => {
                                      const prev = toolPreviewLine(it.detail);
                                      return prev ? (
                                        <span className="tool-preview" title={prev}>
                                          {prev}
                                        </span>
                                      ) : null;
                                    })()}
                                </button>
                                {it.expanded && it.detail && (
                                  <div className="body tool-detail">{it.detail}</div>
                                )}
                              </div>
                            );
                          }
                          if (it.kind === "thought") {
                            const thoughtStreaming =
                              busy &&
                              thoughtBuf.current != null &&
                              thoughtBuf.current.id === it.id;
                            const thoughtText =
                              thoughtStreaming && thoughtBuf.current
                                ? thoughtBuf.current.text
                                : it.text;
                            const preview = thoughtText.replace(/\s+/g, " ").trim();
                            return (
                              <div
                                className={`bubble thought ${
                                  it.expanded ? "expanded" : "collapsed"
                                }`}
                                key={it.id}
                              >
                                <button
                                  type="button"
                                  className="thought-head"
                                  onClick={() => toggleThoughtExpanded(it.id)}
                                  title={it.expanded ? "Thu gọn suy nghĩ" : "Xem suy nghĩ"}
                                >
                                  <span className="tool-chevron" aria-hidden>
                                    {it.expanded ? "▾" : "▸"}
                                  </span>
                                  <span className="thought-label">Suy nghĩ</span>
                                  {!it.expanded && preview && (
                                    <span className="thought-preview">
                                      {preview.slice(0, 100)}
                                      {preview.length > 100 ? "…" : ""}
                                    </span>
                                  )}
                                </button>
                                {it.expanded && thoughtText ? (
                                  <div
                                    className="body thought-body"
                                    ref={(el) => {
                                      if (thoughtStreaming) {
                                        streamThoughtElRef.current = el;
                                        streamThoughtIdRef.current = it.id;
                                        if (el && thoughtBuf.current?.id === it.id) {
                                          el.textContent = thoughtBuf.current.text;
                                        }
                                      } else if (streamThoughtIdRef.current === it.id) {
                                        streamThoughtElRef.current = null;
                                        streamThoughtIdRef.current = null;
                                      }
                                    }}
                                  >
                                    {thoughtStreaming ? null : thoughtText}
                                  </div>
                                ) : null}
                              </div>
                            );
                          }
                          return null;
                        })}
                      </div>
                    )}
                  </div>
                );
              }

              if (block.type === "assistant") {
                const it = block.item;
                // Skip URL parse while this bubble is still streaming (saves main-thread work).
                const stillStreaming =
                  busy && assistantBuf.current != null && assistantBuf.current.id === it.id;
                // Prefer live buffer so rare parent re-renders never rewind stream text.
                const liveText =
                  stillStreaming && assistantBuf.current
                    ? assistantBuf.current.text
                    : it.text || "";
                const urls = stillStreaming ? [] : extractHttpUrls(liveText);
                return (
                  <div className="bubble assistant run-summary" key={it.id}>
                    {stillStreaming ? (
                      <div
                        className="body stream-body"
                        ref={(el) => {
                          if (el) {
                            streamAssistantElRef.current = el;
                            streamAssistantIdRef.current = it.id;
                            if (assistantBuf.current?.id === it.id) {
                              el.textContent = assistantBuf.current.text;
                            }
                          } else if (streamAssistantIdRef.current === it.id) {
                            streamAssistantElRef.current = null;
                            streamAssistantIdRef.current = null;
                          }
                        }}
                      />
                    ) : liveText ? (
                      /* Fresh node after stream — key forces remount so stream textContent
                         cannot stick if a prior MarkdownBody render threw. */
                      <div className="body stream-body md-body" key={`md-${it.id}`}>
                        <MarkdownBody text={liveText} locale={locale} />
                      </div>
                    ) : null}
                    {urls.length > 0 && (
                      <div className="link-preview-list">
                        {urls.map((url) => {
                          const { title, sub } = urlPreviewLabel(url);
                          return (
                            <div className="link-preview-card" key={url}>
                              <div className="link-preview-ico" aria-hidden>
                                🌐
                              </div>
                              <div className="link-preview-meta">
                                <strong>{title}</strong>
                                <small title={url}>{sub}</small>
                              </div>
                              <div className="link-preview-actions">
                                <button
                                  type="button"
                                  className="ghost"
                                  onClick={() => void window.grokApp.openExternal(url)}
                                >
                                  Mở
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }

              if (block.type === "turn_report") {
                const it = block.item;
                const headline = turnReportHeadline(it.status, it.durationMs);
                const edits = it.fileEdits;
                const fileN = edits?.files ?? 0;
                const filesLine =
                  fileN > 0
                    ? fileN === 1
                      ? "Đã chỉnh sửa 1 tệp"
                      : `Đã chỉnh sửa ${fileN} tệp`
                    : "";
                const pathRows = edits?.paths ?? [];
                const hiddenN = Math.max(0, fileN - pathRows.length);
                const totalAdd = edits?.additions ?? 0;
                const totalDel = edits?.deletions ?? 0;
                return (
                  <div
                    className={`turn-report ${it.status}${fileN > 0 ? " has-files" : ""}`}
                    key={it.id}
                    role="status"
                    aria-label={
                      filesLine
                        ? `${headline} · ${filesLine} · +${totalAdd} −${totalDel}`
                        : headline
                    }
                  >
                    <div className="turn-report-head">
                      <span className="turn-report-icon" aria-hidden>
                        {it.status === "done"
                          ? "✓"
                          : it.status === "cancelled"
                            ? "■"
                            : "!"}
                      </span>
                      <div className="turn-report-titles">
                        <strong className="turn-report-title">{headline}</strong>
                      </div>
                    </div>
                    {fileN > 0 ? (
                      <div className="turn-report-files">
                        <div className="turn-report-files-head">
                          <span className="turn-report-files-ico" aria-hidden>
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                              <path
                                d="M3.5 2.5h6l3 3V13.5h-9v-11z"
                                stroke="currentColor"
                                strokeWidth="1.25"
                                strokeLinejoin="round"
                              />
                              <path
                                d="M9.5 2.5v3h3"
                                stroke="currentColor"
                                strokeWidth="1.25"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </span>
                          <div className="turn-report-files-titles">
                            <strong className="turn-report-files-label">{filesLine}</strong>
                            <span className="turn-report-files-totals" aria-hidden>
                              <span className="add">+{formatNum(totalAdd)}</span>
                              <span className="del">−{formatNum(totalDel)}</span>
                            </span>
                          </div>
                          <button
                            type="button"
                            className="turn-report-review ghost"
                            title="Mở panel Diff — xem chi tiết thay đổi"
                            onClick={() => {
                              setRightTab("diff");
                              setShowRight(true);
                            }}
                          >
                            Xem xét
                          </button>
                        </div>
                        {pathRows.length > 0 ? (
                          <ul className="turn-report-file-list" aria-label="Tệp đã chỉnh sửa">
                            {pathRows.map((f) => {
                              const label = shortEditPath(f.path);
                              return (
                                <li key={f.path} title={f.path}>
                                  <button
                                    type="button"
                                    className="turn-report-file-row"
                                    onClick={() => {
                                      setRightTab("diff");
                                      setShowRight(true);
                                    }}
                                  >
                                    <span className="turn-report-file-path">{label}</span>
                                    <span className="turn-report-file-stats">
                                      <span className="add">+{formatNum(f.additions)}</span>
                                      <span className="del">−{formatNum(f.deletions)}</span>
                                    </span>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        ) : null}
                        {hiddenN > 0 ? (
                          <button
                            type="button"
                            className="turn-report-files-more"
                            onClick={() => {
                              setRightTab("diff");
                              setShowRight(true);
                            }}
                          >
                            và {hiddenN} tệp khác — mở Diff
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              }

              if (block.type === "error") {
                const it = block.item;
                return (
                  <div className={`bubble ${it.kind}`} key={it.id}>
                    {it.text ? <div className="body">{it.text}</div> : null}
                  </div>
                );
              }

              // Fallback for any remaining kinds
              const it = block.item;
              if (it.kind === "tool") {
                const st = formatToolStatus(it.status);
                const prev = !it.expanded ? toolPreviewLine(it.detail) : "";
                return (
                  <div
                    className={`bubble tool ${isToolRunning(it.status) ? "tool-running" : ""} ${
                      isToolFailed(it.status) ? "tool-failed" : ""
                    } ${it.expanded ? "expanded" : "collapsed"}`}
                    key={it.id}
                  >
                    <button
                      type="button"
                      className="tool-head"
                      onClick={() => toggleToolExpanded(it.id)}
                    >
                      <span className="tool-chevron" aria-hidden>
                        {it.expanded ? "▾" : "▸"}
                      </span>
                      <span className="tool-title">
                        {humanizeToolTitle(it.title, it.detail)}
                      </span>
                      {st ? <span className="tool-status">{st}</span> : null}
                      {prev ? (
                        <span className="tool-preview" title={prev}>
                          {prev}
                        </span>
                      ) : null}
                    </button>
                    {it.expanded && it.detail && (
                      <div className="body tool-detail">{it.detail}</div>
                    )}
                  </div>
                );
              }
              if (it.kind === "thought") {
                return (
                  <div
                    className={`bubble thought ${it.expanded ? "expanded" : "collapsed"}`}
                    key={it.id}
                  >
                    <button
                      type="button"
                      className="thought-head"
                      onClick={() => toggleThoughtExpanded(it.id)}
                    >
                      <span className="tool-chevron" aria-hidden>
                        {it.expanded ? "▾" : "▸"}
                      </span>
                      <span className="thought-label">Suy nghĩ</span>
                    </button>
                    {it.expanded && it.text ? (
                      <div className="body thought-body">{it.text}</div>
                    ) : null}
                  </div>
                );
              }
              return (
                <div className={`bubble ${it.kind}`} key={it.id}>
                  {"text" in it && it.text ? <div className="body">{it.text}</div> : null}
                </div>
              );
              })}
            </>
          )}
        </div>

        <div
          className={`composer codex-composer ${dragOver ? "drag-over" : ""}`}
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDropFiles}
        >
          {dragOver && (
            <div className="drop-overlay">
              <div>
                <strong>Thả ảnh / file vào đây</strong>
                <div className="hint">PNG, JPG, code, text, …</div>
              </div>
            </div>
          )}
          {busy && liveTurnEdits && liveTurnEdits.files > 0 && (
            <div className="live-files-bar" role="status" aria-live="polite">
              <button
                type="button"
                className="live-files-chip"
                title="Mở panel Diff — file agent đã sửa trong lượt này"
                onClick={() => {
                  setRightTab("diff");
                  setShowRight(true);
                }}
              >
                <span className="live-files-label">
                  {liveTurnEdits.files === 1
                    ? "1 tệp đã thay đổi"
                    : `${liveTurnEdits.files} tệp đã thay đổi`}
                </span>
                <span className="live-files-stats" aria-hidden>
                  <span className="add">+{formatNum(liveTurnEdits.additions)}</span>
                  <span className="del">−{formatNum(liveTurnEdits.deletions)}</span>
                </span>
              </button>
            </div>
          )}
          <div className="composer-box">
            {visibleQueue.length > 0 && (
              <div className="prompt-queue" aria-label="Hàng đợi tin nhắn">
                {visibleQueue.map((q) => (
                  <div key={q.id} className="queue-pill">
                    <span className="queue-handle" title="Hàng đợi" aria-hidden>
                      ⋮⋮
                    </span>
                    {editingQueueId === q.id ? (
                      <input
                        className="queue-edit-input"
                        value={editQueueText}
                        autoFocus
                        onChange={(e) => setEditQueueText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            saveQueueEdit(q.id);
                          } else if (e.key === "Escape") {
                            setEditingQueueId(null);
                            setEditQueueText("");
                          }
                        }}
                        onBlur={() => saveQueueEdit(q.id)}
                      />
                    ) : (
                      <span className="queue-text" title={q.text}>
                        {q.text ||
                          (q.imagesForChat?.length || q.filesForChat?.length
                            ? "(đính kèm)"
                            : "(trống)")}
                      </span>
                    )}
                    <span className="queue-badge">Chỉ dẫn</span>
                    <button
                      type="button"
                      className="queue-icon-btn"
                      title="Gửi ngay (steal) — dừng turn hiện tại"
                      onClick={() => void stealWithPayload(q)}
                    >
                      ↗
                    </button>
                    <button
                      type="button"
                      className="queue-icon-btn"
                      title="Xóa khỏi hàng đợi"
                      onClick={() => removeQueued(q.id)}
                    >
                      🗑
                    </button>
                    <div className="queue-more-wrap">
                      <button
                        type="button"
                        className="queue-icon-btn"
                        title="Thêm"
                        onClick={() =>
                          setQueueMenuId((m) => (m === q.id ? null : q.id))
                        }
                      >
                        …
                      </button>
                      {queueMenuId === q.id && (
                        <div className="queue-menu" role="menu">
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setEditingQueueId(q.id);
                              setEditQueueText(q.text);
                              setQueueMenuId(null);
                            }}
                          >
                            Chỉnh sửa tin nhắn
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => void stealWithPayload(q)}
                          >
                            Gửi ngay (steal)
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => void setMessageQueueEnabled(false)}
                          >
                            Tắt tính năng đưa vào hàng đợi
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="composer-context">
              <button
                type="button"
                className="ctx-chip"
                title={
                  isStandaloneMode
                    ? "Chat không project (sandbox local)"
                    : projectPath || ""
                }
                onClick={() => {
                  if (isStandaloneMode) {
                    void newTab({ forceStandalone: true });
                    return;
                  }
                  void openInExplorer();
                }}
                disabled={!projectPath && !isStandaloneMode}
              >
                <span className="ctx-ico">{isStandaloneMode ? "◇" : "▣"}</span>
                {isStandaloneMode
                  ? "Không project"
                  : projectPath
                    ? projLabel
                    : "Chưa chọn"}
              </button>
              <span className="ctx-chip dim">Cục bộ</span>
              {gitInfo?.branch && !isStandaloneMode && (
                <button
                  type="button"
                  className={`ctx-chip dim ${gitInfo.dirty ? "dirty" : ""}`}
                  title={[
                    gitInfo.root || "",
                    gitInfo.upstream ? `↑${gitInfo.upstream}` : "",
                    gitInfo.dirty ? `${gitInfo.dirtyCount} thay đổi` : "clean",
                    gitInfo.ahead || gitInfo.behind
                      ? `ahead ${gitInfo.ahead} / behind ${gitInfo.behind}`
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  onClick={() => {
                    setShowRight(true);
                    setRightTab("git");
                    if (projectPath) void refreshGit(projectPath);
                  }}
                >
                  ⎇ {gitInfo.branch}
                  {gitInfo.dirty ? ` · ${gitInfo.dirtyCount}*` : ""}
                  {gitInfo.ahead ? ` ↑${gitInfo.ahead}` : ""}
                  {gitInfo.behind ? ` ↓${gitInfo.behind}` : ""}
                </button>
              )}
              {harness?.present && (
                <button
                  type="button"
                  className="ctx-chip harness"
                  onClick={() => {
                    setShowRight(true);
                    setRightTab("harness");
                  }}
                >
                  Harness {harness.version || ""}
                  {verifyTier ? ` · ${verifyTier}` : ""}
                </button>
              )}
            </div>
            {attachments.length > 0 && (
              <div className="attach-row">
                {attachments.map((a) =>
                  a.kind === "image" ? (
                    <div className="attach-chip" key={a.id} title={a.name}>
                      <button
                        type="button"
                        className="attach-thumb-btn"
                        title={`${a.name} — bấm để xem`}
                        onClick={() =>
                          openImageLightbox(a.dataUrl, { alt: a.name, name: a.name })
                        }
                      >
                        <img src={a.dataUrl} alt={a.name} />
                      </button>
                      <button
                        type="button"
                        className="attach-remove"
                        aria-label="Xóa"
                        onClick={() => removeAttachment(a.id)}
                        disabled={busy && !canFollowUpWhileBusy}
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <div className="attach-file-chip" key={a.id} title={a.path || a.name}>
                      <span className="af-icon">📄</span>
                      <span className="af-meta">
                        <strong>{a.name}</strong>
                        <small>
                          {a.isBinary ? "binary" : "text"}
                          {a.size != null ? ` · ${formatBytes(a.size)}` : ""}
                        </small>
                      </span>
                      <button
                        type="button"
                        className="attach-remove"
                        aria-label="Xóa"
                        onClick={() => removeAttachment(a.id)}
                        disabled={busy && !canFollowUpWhileBusy}
                      >
                        ×
                      </button>
                    </div>
                  )
                )}
              </div>
            )}
            <ComposerDraftField
              ref={composerRef}
              resetKey={composerResetKey}
              initialValue={draftSeed}
              placeholder={composerPlaceholder}
              disabled={composerDisabled}
              onSync={syncComposerDraft}
              onNonEmptyChange={onDraftNonEmpty}
              onPaste={onComposerPaste}
              onSubmit={handleComposerSubmit}
            />
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              accept="image/*,.txt,.md,.json,.js,.ts,.tsx,.jsx,.css,.html,.py,.rs,.go,.java,.c,.cpp,.cs,.sql,.yml,.yaml,.xml,.csv,.log"
              onChange={(e) => {
                const list = Array.from(e.target.files || []);
                e.target.value = "";
                if (list.length) void addBrowserFiles(list);
              }}
            />
            <div className="composer-actions">
              <div className="composer-actions-left">
                <button
                  type="button"
                  className="icon-round"
                  disabled={!projectPath || (busy && !canFollowUpWhileBusy)}
                  onClick={() => void pickFiles()}
                  title="Đính kèm"
                >
                  +
                </button>
                <PillSelect
                  value={model}
                  disabled={!projectPath || starting}
                  title="Model"
                  onChange={(id) => void onModelChange(id)}
                  options={
                    models.length > 0
                      ? models.map((m) => ({ id: m.id, label: m.name || m.id }))
                      : [{ id: model, label: model }]
                  }
                />
                {showEffort && (
                  <PillSelect
                    value={effort}
                    disabled={!projectPath || starting}
                    title="Reasoning effort"
                    onChange={(id) => void onEffortChange(id)}
                    options={efforts.map((e) => ({
                      id: e.id,
                      label: effortLabel(e.id, e.label),
                    }))}
                  />
                )}
                <div className="perm-mode-wrap">
                  <button
                    type="button"
                    className={`ctx-chip perm-mode-chip ${
                      sessionAlwaysApprove || settings?.alwaysApprove ? "warn" : ""
                    }`}
                    title="Chế độ phê duyệt tool"
                    aria-expanded={permModeMenuOpen}
                    aria-haspopup="menu"
                    onClick={() => setPermModeMenuOpen((v) => !v)}
                  >
                    <span className="ctx-ico" aria-hidden>
                      {sessionAlwaysApprove || settings?.alwaysApprove ? "⚠" : "🛡"}
                    </span>
                    {sessionAlwaysApprove
                      ? "Session full"
                      : settings?.alwaysApprove
                        ? "Luôn cho phép"
                        : "Yêu cầu phê duyệt"}
                  </button>
                  {permModeMenuOpen && (
                    <div
                      className="perm-mode-menu"
                      role="menu"
                      aria-label="Chế độ phê duyệt"
                    >
                      <p className="perm-mode-menu-title">
                        Phê duyệt hành động của agent
                      </p>
                      <button
                        type="button"
                        role="menuitemradio"
                        aria-checked={
                          !settings?.alwaysApprove && !sessionAlwaysApprove
                        }
                        className={
                          !settings?.alwaysApprove && !sessionAlwaysApprove
                            ? "active"
                            : ""
                        }
                        onClick={() => void setPermissionMode("ask")}
                      >
                        <span className="perm-mode-opt-ico" aria-hidden>
                          🛡
                        </span>
                        <span className="perm-mode-opt-text">
                          <strong>Yêu cầu phê duyệt</strong>
                          <small>
                            Hỏi trước khi ghi file, chạy lệnh, hoặc tool nhạy cảm.
                          </small>
                        </span>
                        {!settings?.alwaysApprove && !sessionAlwaysApprove && (
                          <span className="perm-mode-check" aria-hidden>
                            ✓
                          </span>
                        )}
                      </button>
                      <button
                        type="button"
                        role="menuitemradio"
                        aria-checked={Boolean(
                          settings?.alwaysApprove && !sessionAlwaysApprove
                        )}
                        className={
                          settings?.alwaysApprove && !sessionAlwaysApprove
                            ? "active"
                            : ""
                        }
                        onClick={() => void setPermissionMode("always")}
                      >
                        <span className="perm-mode-opt-ico" aria-hidden>
                          ⚠
                        </span>
                        <span className="perm-mode-opt-text">
                          <strong>Luôn cho phép</strong>
                          <small>
                            Tự duyệt mọi tool — nhanh hơn nhưng rủi ro cao hơn.
                          </small>
                        </span>
                        {settings?.alwaysApprove && !sessionAlwaysApprove && (
                          <span className="perm-mode-check" aria-hidden>
                            ✓
                          </span>
                        )}
                      </button>
                      {sessionAlwaysApprove && (
                        <button
                          type="button"
                          role="menuitem"
                          className="active session-row"
                          onClick={() => {
                            setSessionAlwaysApprove(false);
                            setPermModeMenuOpen(false);
                          }}
                        >
                          <span className="perm-mode-opt-ico" aria-hidden>
                            ⏱
                          </span>
                          <span className="perm-mode-opt-text">
                            <strong>Tắt auto-approve session</strong>
                            <small>
                              Đang bật từ “Cho phép mọi chỉnh sửa” — chỉ session
                              này.
                            </small>
                          </span>
                          <span className="perm-mode-check" aria-hidden>
                            ✓
                          </span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="composer-actions-right">
                <button
                  type="button"
                  className="stop-btn"
                  disabled={!busy}
                  onClick={() => void cancelBusyTurn("user dừng")}
                  title={
                    busyOnOtherProject
                      ? "Dừng turn đang chạy ở project khác (không chạy hàng đợi)"
                      : busyOnOtherTab
                        ? "Dừng turn tab khác (không chạy hàng đợi)"
                        : "Dừng turn — hàng đợi giữ nguyên, không tự chạy"
                  }
                >
                  Dừng
                </button>
                <button
                  type="button"
                  ref={sendBtnRef}
                  className="primary send-btn"
                  data-ready={agentReadyHere ? "1" : "0"}
                  data-blocked={busy && !canFollowUpWhileBusy ? "1" : "0"}
                  disabled={
                    !agentReadyHere ||
                    (!draftNonEmptyRef.current && attachments.length === 0) ||
                    (busy && !canFollowUpWhileBusy)
                  }
                  onClick={send}
                  title={
                    busyOnOtherProject
                      ? "Đợi agent xong ở project khác, hoặc Dừng"
                      : busyOnOtherTab
                        ? "Đợi agent xong hoặc quay lại tab đang chạy để xếp hàng / dừng"
                        : canFollowUpWhileBusy
                          ? messageQueueEnabled
                            ? "Xếp vào hàng đợi (chạy sau khi xong)"
                            : "Steal — dừng turn và gửi ngay"
                          : "Gửi"
                  }
                >
                  <span className="send-ico" aria-hidden>
                    {canFollowUpWhileBusy && messageQueueEnabled ? "＋" : "↑"}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>

      {showBottom && (
        <section className="bottom-panel" aria-label="Panel dưới">
          <div className="bottom-panel-head">
            <div className="bottom-panel-title">
              <strong>Terminal / Activity</strong>
              <span className="hint">Ctrl+J · Mở terminal ngoài</span>
            </div>
            <div className="row">
              <button
                type="button"
                className="ghost"
                disabled={!projectPath}
                onClick={() => void openTerminalHere()}
                title="Ctrl+`"
              >
                Mở terminal ngoài
              </button>
              <button
                type="button"
                className="ghost"
                disabled={!items.some((i) => i.kind === "tool")}
                onClick={() => collapseAllTools()}
              >
                Thu gọn tool
              </button>
              <button
                type="button"
                className="ghost icon"
                onClick={() => setShowBottom(false)}
                title="Đóng"
              >
                ×
              </button>
            </div>
          </div>
          <div className="bottom-panel-body">
            {items.filter((i) => i.kind === "tool" || i.kind === "system" || i.kind === "error").length ===
            0 ? (
              <div className="hint">
                Log tool / system sẽ hiện ở đây khi agent chạy. Bấm “Mở terminal ngoài” để shell project.
              </div>
            ) : (
              <div className="activity-log">
                {items
                  .filter((i) => i.kind === "tool" || i.kind === "system" || i.kind === "error")
                  .slice(-40)
                  .map((it) =>
                    it.kind === "tool" ? (
                      <div key={it.id} className="activity-line tool">
                        <span className="al-kind">tool</span>
                        <span className="al-status">{it.status}</span>
                        <span className="al-title">{it.title}</span>
                        {it.detail ? (
                          <span className="al-detail">{it.detail.replace(/\s+/g, " ").slice(0, 100)}</span>
                        ) : null}
                      </div>
                    ) : (
                      <div key={it.id} className={`activity-line ${it.kind}`}>
                        <span className="al-kind">{it.kind}</span>
                        <span className="al-title">{it.text}</span>
                      </div>
                    )
                  )}
              </div>
            )}
          </div>
        </section>
      )}
      </div>
      {/* end center-col */}

      {showRight && (
        <aside className="rightbar">
          <div
            className={`col-resizer col-resizer-right${resizingSide === "right" ? " is-active" : ""}`}
            role="separator"
            aria-orientation="vertical"
            aria-label="Kéo để đổi độ rộng panel phải"
            aria-valuemin={RIGHT_MIN}
            aria-valuemax={RIGHT_MAX}
            aria-valuenow={rightWidth}
            title={`Kéo để đổi kích thước (${RIGHT_MIN}–${RIGHT_MAX}px) · double-click đặt lại`}
            onMouseDown={(e) => beginColResize("right", e)}
            onDoubleClick={() => resetColWidth("right")}
          />
          <div className="right-tabs wrap-tabs">
            <button className={rightTab === "files" ? "active" : ""} onClick={() => setRightTab("files")}>
              Files
            </button>
            <button className={rightTab === "diff" ? "active" : ""} onClick={() => setRightTab("diff")}>
              Diff ({diffs.length})
            </button>
            <button
              className={rightTab === "preview" ? "active" : ""}
              onClick={() => setRightTab("preview")}
            >
              Preview
            </button>
            <button
              className={rightTab === "harness" ? "active" : ""}
              onClick={() => {
                setRightTab("harness");
                if (projectPath) void refreshRunbooks(projectPath, runbookQ);
              }}
            >
              Harness
            </button>
            <button
              className={rightTab === "git" ? "active" : ""}
              onClick={() => {
                setRightTab("git");
                if (projectPath) void refreshGit(projectPath);
              }}
            >
              Git
            </button>
          </div>
          <div className="env-summary">
            <div className="env-summary-row">
              <span className="env-label">{isStandaloneMode ? "Context" : "Project"}</span>
              <span className="env-value" title={isStandaloneMode ? "Chat không project" : projectPath || ""}>
                {isStandaloneMode
                  ? t("sidebar.taskNoProject")
                  : projectPath
                    ? projLabel
                    : "—"}
              </span>
            </div>
            <div className="env-summary-row">
              <span className="env-label">Branch</span>
              <span className="env-value">
                {isStandaloneMode
                  ? "—"
                  : gitInfo?.branch
                    ? `${gitInfo.branch}${gitInfo.dirty ? ` · dirty ${gitInfo.dirtyCount || ""}` : ""}`
                    : "—"}
              </span>
            </div>
            <div className="env-summary-row">
              <span className="env-label">Thay đổi</span>
              <span className="env-value">
                {diffs.length
                  ? `${diffs.length} diff · +${diffs.reduce((a, d) => a + (d.stats?.additions || 0), 0)} −${diffs.reduce((a, d) => a + (d.stats?.deletions || 0), 0)}`
                  : "chưa có diff"}
              </span>
            </div>
            <div className="env-summary-row">
              <span className="env-label">Agent</span>
              <span className="env-value">
                {agentReady ? "ready" : "off"}
                {busy ? " · running" : ""}
                {sessionId ? ` · ${sessionId.slice(0, 8)}…` : ""}
              </span>
            </div>
            <div className="env-summary-row">
              <span className="env-label">MCP</span>
              <span className="env-value">
                {activeMcpServers.length
                  ? activeMcpServers.join(", ")
                  : settings?.chromeDevtoolsMcp
                    ? "bật trong settings · restart agent"
                    : "off"}
              </span>
            </div>
          </div>
          <div className="right-body">
            {rightTab === "files" && (
              <>
                <div className="panel-toolbar">
                  <button
                    type="button"
                    className="ghost"
                    disabled={!projectPath}
                    onClick={() => void openInExplorer()}
                  >
                    Explorer
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    disabled={!projectPath}
                    onClick={() => void openTerminalHere()}
                  >
                    Terminal
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    disabled={!projectPath}
                    onClick={() => void loadTree(projectPath)}
                  >
                    Refresh
                  </button>
                </div>
                {!projectPath && <div className="hint">Chưa chọn project / tác vụ</div>}
                {isStandaloneMode && (
                  <div className="hint" style={{ padding: "6px 4px 10px" }}>
                    Tác vụ không gắn code folder — Files/Git của project sẽ hiện khi bạn mở dự án.
                  </div>
                )}
                {tree.map((n) => (
                  <button
                    key={n.rel}
                    className={`tree-item ${n.type}`}
                    style={{ paddingLeft: 6 + n.depth * 12 }}
                    onClick={() => void openFile(n)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      if (n.type === "file") void window.grokApp.showItemInFolder(n.path);
                      else void window.grokApp.openPath(n.path);
                    }}
                    title="Click mở · Right-click Explorer"
                  >
                    <span>{n.type === "dir" ? "▸" : "·"}</span>
                    <span>{n.name}</span>
                  </button>
                ))}
              </>
            )}
            {rightTab === "diff" && (
              <>
                <div className="panel-toolbar">
                  <button
                    type="button"
                    className="ghost"
                    disabled={!diffs.length}
                    onClick={() => {
                      void window.grokApp.clearDiffs();
                      setDiffs([]);
                    }}
                  >
                    Clear
                  </button>
                </div>
                {diffs.length === 0 && (
                  <div className="hint">Diff xuất hiện khi agent ghi file qua ACP.</div>
                )}
                {diffs.map((d, i) => (
                  <div className="diff-file" key={`${d.filePath}-${i}`}>
                    <div className="dh">
                      <span>{d.filePath.split(/[/\\]/).pop()}</span>
                      <span>
                        +{formatNum(d.stats.additions)} −{formatNum(d.stats.deletions)}
                      </span>
                    </div>
                    <div className="diff-box">
                      <pre>
                        {d.lines.slice(0, 200).map((l, j) => (
                          <span key={j} className={`diff-line ${l.type}`}>
                            {l.type === "add" ? "+" : l.type === "del" ? "-" : " "}
                            {l.text}
                            {"\n"}
                          </span>
                        ))}
                      </pre>
                    </div>
                  </div>
                ))}
              </>
            )}
            {rightTab === "preview" && (
              <div className="preview-box">
                {preview ? (
                  <>
                    <div className="dh" style={{ padding: "7px 9px", fontSize: 11, fontFamily: "var(--mono)" }}>
                      {preview.path}
                      <button
                        type="button"
                        className="ghost"
                        style={{ marginLeft: 8, padding: "2px 6px", fontSize: 10 }}
                        onClick={() => void window.grokApp.showItemInFolder(preview.path)}
                      >
                        Reveal
                      </button>
                    </div>
                    <pre>{preview.content.slice(0, 20000)}</pre>
                  </>
                ) : (
                  <div className="hint" style={{ padding: 10 }}>
                    Chọn file trong Files
                  </div>
                )}
              </div>
            )}
            {rightTab === "harness" && (
              <div className="harness-panel">
                {!projectPath && <div className="hint">Chưa chọn project / tác vụ</div>}
                {projectPath && !harness?.present && (
                  <div className="hint">
                    Không detect harness (AGENTS.md / .agents/). Vẫn có thể chat bình thường.
                  </div>
                )}
                {harness?.present && (
                  <>
                    <div className="harness-head">
                      <span className="badge accent">Harness {harness.version || "on"}</span>
                      {verifyTier && <span className="badge good">{verifyTier}</span>}
                    </div>
                    <p className="hint">
                      Domains:{" "}
                      {harness.domains.length
                        ? harness.domains.join(", ")
                        : "— (chưa có .agents/memory/*.md)"}
                    </p>
                    <div className="panel-toolbar">
                      <button type="button" className="ghost" onClick={() => void openHarnessFile("agentsMd")}>
                        AGENTS.md
                      </button>
                      <button type="button" className="ghost" onClick={() => void openHarnessFile("agentsIndex")}>
                        index.md
                      </button>
                      <button type="button" className="ghost" onClick={() => void openHarnessFile("memoryMd")}>
                        MEMORY
                      </button>
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => {
                          void (async () => {
                            const cl = await window.grokApp.getChecklist(projectPath);
                            setChecklistItems(cl.items || []);
                            setChecklistOpen(true);
                          })();
                        }}
                      >
                        Checklist
                      </button>
                    </div>
                    <div className="privacy-mini">
                      ⚠ Không commit <code>.agents/</code> / <code>MEMORY.md</code> / secrets
                    </div>
                  </>
                )}
                <label className="field">Search runbooks (symptom)</label>
                <input
                  type="search"
                  className="runbook-search"
                  placeholder="vd. login fail, rate limit…"
                  value={runbookQ}
                  disabled={!projectPath}
                  onChange={(e) => {
                    const q = e.target.value;
                    setRunbookQ(q);
                    if (projectPath) void refreshRunbooks(projectPath, q);
                  }}
                />
                <div className="runbook-list">
                  {runbooks.length === 0 && (
                    <div className="hint">
                      {harness?.runbookIndex
                        ? "Không khớp / index trống"
                        : "Chưa có .agents/runbooks/_index.json"}
                    </div>
                  )}
                  {runbooks.map((rb) => (
                    <button
                      key={rb.id}
                      type="button"
                      className="runbook-item"
                      onClick={() => insertRunbookPrompt(rb)}
                      title={rb.path || rb.symptom || rb.title}
                    >
                      <strong>{rb.title}</strong>
                      {rb.domain && <span className="chip">{rb.domain}</span>}
                      {rb.symptom ? <small>{String(rb.symptom).slice(0, 120)}</small> : null}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {rightTab === "git" && (
              <div className="git-panel">
                {!projectPath && <div className="hint">Chưa chọn project / tác vụ</div>}
                {projectPath && !gitInfo?.isRepo && (
                  <div className="hint">Không phải git repo (hoặc git không có trong PATH).</div>
                )}
                {gitInfo?.isRepo && (
                  <>
                    <div className="git-summary">
                      <div>
                        <strong>⎇ {gitInfo.branch || "detached"}</strong>
                        {gitInfo.shortHash ? <span className="hint"> · {gitInfo.shortHash}</span> : null}
                      </div>
                      <div className="hint">
                        {gitInfo.dirty
                          ? `${gitInfo.dirtyCount} thay đổi chưa commit`
                          : "Working tree clean"}
                        {gitInfo.upstream
                          ? ` · ${gitInfo.upstream} ↑${gitInfo.ahead || 0} ↓${gitInfo.behind || 0}`
                          : " · no upstream"}
                      </div>
                    </div>
                    <div className="panel-toolbar">
                      <button type="button" className="ghost" onClick={() => void refreshGit(projectPath)}>
                        Refresh
                      </button>
                      <button type="button" className="ghost" onClick={() => void openTerminalHere()}>
                        Terminal
                      </button>
                    </div>
                    <h4 className="panel-h">Status</h4>
                    {gitStatus.length === 0 ? (
                      <div className="hint">Clean</div>
                    ) : (
                      <div className="git-status-list">
                        {gitStatus.map((l) => (
                          <div key={l.raw} className="git-status-line">
                            <code>{l.code}</code> <span>{l.file}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <h4 className="panel-h">Worktrees</h4>
                    {worktrees.length === 0 ? (
                      <div className="hint">Không list được worktree</div>
                    ) : (
                      <div className="worktree-list">
                        {worktrees.map((wt) => (
                          <button
                            key={wt.path || wt.head || Math.random()}
                            type="button"
                            className={`worktree-item ${
                              wt.path && projectPath &&
                              wt.path.replace(/\\/g, "/").toLowerCase() ===
                                projectPath.replace(/\\/g, "/").toLowerCase()
                                ? "active"
                                : ""
                            }`}
                            onClick={() => void openWorktree(wt.path)}
                            title={wt.path || ""}
                          >
                            <strong>{wt.branch || (wt.detached ? "detached" : "worktree")}</strong>
                            <small>{wt.path}</small>
                            {wt.locked ? <span className="chip">locked</span> : null}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </aside>
      )}

      {shortcutsModalOpen && (
        <div
          className="modal-backdrop center"
          role="presentation"
          onClick={() => setShortcutsModalOpen(false)}
        >
          <div
            className="modal shortcuts-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="shortcuts-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head shortcuts-modal-head">
              <h3 id="shortcuts-modal-title">Phím tắt</h3>
              <button
                type="button"
                className="ghost icon"
                onClick={() => setShortcutsModalOpen(false)}
                aria-label={t("common.close")}
              >
                ×
              </button>
            </div>
            <input
              type="search"
              className="shortcut-search"
              placeholder="Tìm kiếm phím tắt"
              value={shortcutQuery}
              onChange={(e) => setShortcutQuery(e.target.value)}
              autoFocus
            />
            <div className="shortcuts-modal-body">
              {(() => {
                const q = shortcutQuery.trim().toLowerCase();
                const filtered = !q
                  ? SHORTCUT_CATALOG
                  : SHORTCUT_CATALOG.filter(
                      (s) =>
                        s.label.toLowerCase().includes(q) ||
                        s.group.toLowerCase().includes(q) ||
                        s.keys.some((k) => k.toLowerCase().includes(q)) ||
                        (s.note && s.note.toLowerCase().includes(q))
                    );
                const groups = Array.from(new Set(filtered.map((s) => s.group)));
                if (!filtered.length) {
                  return (
                    <p className="hint" style={{ marginTop: 12 }}>
                      Không khớp “{shortcutQuery}”.
                    </p>
                  );
                }
                return groups.map((g) => (
                  <div key={g} className="shortcut-group">
                    <div className="shortcut-group-title">{g}</div>
                    <ul className="shortcut-list">
                      {filtered
                        .filter((s) => s.group === g)
                        .map((s) => (
                          <li key={s.id} className="shortcut-row">
                            <div className="shortcut-meta">
                              <strong>{s.label}</strong>
                              {s.note ? (
                                <span className="shortcut-note">{s.note}</span>
                              ) : null}
                            </div>
                            <div className="shortcut-keys">
                              {s.keys.map((k) => (
                                <kbd key={k}>{k}</kbd>
                              ))}
                            </div>
                          </li>
                        ))}
                    </ul>
                  </div>
                ));
              })()}
            </div>
            <p className="shortcuts-modal-foot hint">
              Chỉ phím app thật sự bind. Settings → Phím tắt cũng mở catalog này.
            </p>
          </div>
        </div>
      )}

      {permission &&
        (() => {
          const parsed = parsePermissionParams(permission.params);
          const optIds = resolvePermissionOptionIds(permission.params);
          const deny = async () => {
            setPermAllowMenuOpen(false);
            await window.grokApp.respondPermission({
              id: permission.id,
              allow: false,
            });
            setPermission(null);
          };
          const allowOnce = async () => {
            setPermAllowMenuOpen(false);
            await window.grokApp.respondPermission({
              id: permission.id,
              allow: true,
              optionId: optIds.onceId,
            });
            setPermission(null);
          };
          const allowAlways = async () => {
            setPermAllowMenuOpen(false);
            setSessionAlwaysApprove(true);
            await window.grokApp.respondPermission({
              id: permission.id,
              allow: true,
              optionId: optIds.alwaysId,
            });
            setPermission(null);
            push({
              id: uid(),
              kind: "system",
              text: "Session auto-approve bật — mọi tool tiếp theo được allow (tắt bằng chip Full-ish).",
            });
          };
          return (
            <div className="modal-backdrop center" role="presentation">
              <div
                className="modal perm-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="perm-title"
              >
                <div className="perm-kind">
                  <span className="perm-kind-ico" aria-hidden>
                    {parsed.kind === "edit"
                      ? "✎"
                      : parsed.kind === "execute"
                        ? "〉"
                        : parsed.kind === "delete"
                          ? "⌫"
                          : parsed.kind === "fetch"
                            ? "↗"
                            : "⚙"}
                  </span>
                  <span>{parsed.kindLabel}</span>
                </div>
                <h3 id="perm-title" className="perm-question">
                  {parsed.question}
                </h3>
                {parsed.title &&
                  parsed.title !== parsed.kindLabel &&
                  !parsed.command && (
                    <p className="perm-subtitle" title={parsed.title}>
                      {parsed.title}
                    </p>
                  )}
                {parsed.paths.length > 0 && (
                  <ul className="perm-file-list" aria-label="Tệp liên quan">
                    {parsed.paths.map((f) => (
                      <li key={f.path} title={f.path}>
                        <span className="perm-file-path">{f.path}</span>
                        {(f.additions != null || f.deletions != null) && (
                          <span className="perm-file-stats">
                            <span className="add">+{f.additions ?? 0}</span>
                            <span className="del">−{f.deletions ?? 0}</span>
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {parsed.command && (
                  <pre className="perm-command" title={parsed.command}>
                    {parsed.command}
                  </pre>
                )}
                {parsed.paths.length === 0 && !parsed.command && (
                  <pre className="perm-raw">{parsed.rawFallback}</pre>
                )}
                <div className="actions perm-actions">
                  <button type="button" className="ghost" onClick={() => void deny()}>
                    Từ chối
                  </button>
                  <div className="perm-allow-split">
                    <button
                      type="button"
                      className="primary perm-allow-main"
                      onClick={() => void allowOnce()}
                    >
                      Cho phép một lần
                    </button>
                    <button
                      type="button"
                      className="primary perm-allow-caret"
                      aria-label="Thêm tùy chọn cho phép"
                      aria-expanded={permAllowMenuOpen}
                      onClick={() => setPermAllowMenuOpen((v) => !v)}
                    >
                      ▾
                    </button>
                    {permAllowMenuOpen && (
                      <div className="perm-allow-menu" role="menu">
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => void allowOnce()}
                        >
                          Cho phép một lần
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => void allowAlways()}
                          title="Auto-approve mọi tool còn lại trong session"
                        >
                          Cho phép mọi chỉnh sửa
                          <span className="perm-menu-hint">session</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <p className="perm-kbd-hint">
                  <kbd>Y</kbd> cho phép · <kbd>N</kbd> / <kbd>Esc</kbd> từ chối
                </p>
              </div>
            </div>
          );
        })()}

      {checklistOpen && (
        <div className="modal-backdrop center" onClick={() => setChecklistOpen(false)}>
          <div className="modal checklist-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Post-task checklist {harness?.version ? `· Harness ${harness.version}` : ""}</h3>
              <button type="button" className="ghost icon" onClick={() => setChecklistOpen(false)}>
                ×
              </button>
            </div>
            <p className="hint">
              Gợi ý sau task (không tự ghi file). {verifyTier ? `Detect: ${verifyTier}` : "Chưa thấy Tier label."}
            </p>
            <div className="checklist">
              {(checklistItems.length
                ? checklistItems
                : [
                    { id: "verify", label: "Verify", detail: "Đã verify chưa?" },
                    { id: "record", label: "Record", detail: "MEMORY / runbook?" },
                    { id: "privacy", label: "Privacy", detail: "Không commit secrets" },
                  ]
              ).map((it) => (
                <label key={it.id} className="check-item">
                  <input
                    type="checkbox"
                    checked={Boolean(checklistChecked[it.id])}
                    onChange={(e) =>
                      setChecklistChecked((prev) => ({ ...prev, [it.id]: e.target.checked }))
                    }
                  />
                  <div>
                    <strong>{it.label}</strong>
                    <p>{it.detail}</p>
                  </div>
                </label>
              ))}
            </div>
            <div className="actions">
              <button type="button" className="ghost" onClick={() => void openHarnessFile("memoryMd")}>
                Mở MEMORY
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => {
                  setChecklistOpen(false);
                  push({
                    id: uid(),
                    kind: "system",
                    text: `Checklist đóng · checked: ${
                      Object.entries(checklistChecked)
                        .filter(([, v]) => v)
                        .map(([k]) => k)
                        .join(", ") || "none"
                    }`,
                  });
                }}
              >
                Xong
              </button>
            </div>
          </div>
        </div>
      )}

      {showUsage && (
        <div className="modal-backdrop center" onClick={() => setShowUsage(false)}>
          <div className="modal usage-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Mức sử dụng</h3>
              <button type="button" className="ghost icon" onClick={() => setShowUsage(false)}>
                ×
              </button>
            </div>
            <div className="usage-modal-grid">
              <UsageLimitRow
                title="Giới hạn tuần"
                remPct={remainingPctFromWindow(usage?.weeklyQuota)}
                hint={
                  formatUsageReset(usage?.weeklyQuota?.periodEnd) ||
                  (usage?.errors?.weekly
                    ? `Không lấy được pool tuần${usage.errors.weekly ? ` (${usage.errors.weekly.slice(0, 80)})` : ""}`
                    : "Pool dùng chung Chat / Build / Imagine / Voice")
                }
              />
              <UsageLimitRow
                title="Giới hạn tháng"
                remPct={remainingPctFromWindow(usage?.credits)}
                used={usage?.credits?.used}
                limit={
                  usage?.credits?.limit != null && usage.credits.limit > 0
                    ? usage.credits.limit
                    : null
                }
                hint={
                  formatUsageReset(usage?.credits?.periodEnd) ||
                  (usage?.errors?.billing ? "Không lấy được billing" : "Kỳ billing Build (thường tháng)")
                }
              />
              <UsageLimitRow
                title="Ngữ cảnh (context window)"
                remPct={
                  ctxUsedPct != null
                    ? Math.max(0, Math.min(100, 100 - ctxUsedPct))
                    : null
                }
                used={ctx ? ctxUsed : null}
                limit={ctx ? ctxWindow : null}
                absoluteLabel={ctxAbs}
                fillMode="used"
                hint={
                  ctx
                    ? "Prompt tokens turn gần nhất / cửa sổ model — biết khi nào gần đầy ngữ cảnh"
                    : "Chạy một turn để cập nhật số token ngữ cảnh"
                }
              />
            </div>
            <div className="usage-modal-foot">
              <span className="hint">
                {usage?.fetchedAt
                  ? `Cập nhật ${new Date(usage.fetchedAt).toLocaleTimeString()}`
                  : "…"}
              </span>
              <button type="button" className="ghost" onClick={() => void refreshUsage()}>
                Làm mới
              </button>
            </div>
            <div className="usage-cta-row">
              <button
                type="button"
                className="usage-cta"
                onClick={() =>
                  void window.grokApp.openExternal("https://grok.com/?_s=usage")
                }
              >
                Usage SuperGrok (web) ↗
              </button>
              <button
                type="button"
                className="usage-cta ghost"
                onClick={() => void window.grokApp.openExternal("https://x.ai")}
              >
                Nâng cấp / billing xAI ↗
              </button>
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="modal-backdrop center" onClick={() => setShowSettings(false)}>
          <div
            className={`modal settings-modal ${
              settingsTab === "hoso" ||
              settingsTab === "canhanhoa" ||
              settingsTab === "skills" ||
              settingsTab === "phimtat"
                ? "settings-wide"
                : ""
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h3>{t("settings.title")}</h3>
              <button type="button" className="ghost icon" onClick={() => setShowSettings(false)}>
                ×
              </button>
            </div>
            <div className="settings-layout">
              <nav className="settings-nav">
                <div className="settings-nav-group">{t("settings.group.personal")}</div>
                {(
                  [
                    ["hoso", t("settings.tab.profile")],
                    ["canhanhoa", t("settings.tab.personalize")],
                    ["skills", t("settings.tab.skills")],
                    ["chung", t("settings.tab.general")],
                    ["phimtat", t("settings.tab.shortcuts")],
                    ["quyen", t("settings.tab.permissions")],
                    ["agent", t("settings.tab.agent")],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={settingsTab === id ? "active" : ""}
                    onClick={() => setSettingsTab(id)}
                  >
                    <span className="settings-nav-label">{label}</span>
                    {id === "chung" && updateCheckResult?.updateAvailable ? (
                      <span
                        className="settings-nav-dot"
                        title={t("settings.updateAvailableDot")}
                        aria-hidden
                      />
                    ) : null}
                    {id === "skills" && (skillsList?.count ?? 0) > 0 ? (
                      <span className="settings-nav-count" title={t("settings.skillsCount")}>
                        {skillsList!.count}
                      </span>
                    ) : null}
                  </button>
                ))}
              </nav>
              <div className="settings-body">
                {settingsTab === "hoso" && (
                  <div className="profile-pane">
                    <div className="profile-hero">
                      <div className="profile-actions">
                        {auth?.loggedIn ? (
                          <button
                            type="button"
                            className="ghost small danger"
                            disabled={authBusy}
                            onClick={() => void runLogout()}
                          >
                            {authBusy ? "…" : t("auth.logout")}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="primary small"
                            disabled={authBusy}
                            onClick={() => void runLogin()}
                          >
                            {authBusy
                              ? "…"
                              : auth?.expired
                                ? t("auth.loginAgain")
                                : t("auth.login")}
                          </button>
                        )}
                        <button
                          type="button"
                          className="ghost small"
                          disabled={authBusy}
                          onClick={() => {
                            void refreshAuth().then((next) => {
                              if (next?.loggedIn) {
                                setAuthMsg(
                                  `${t("auth.badge.ok")}${next.email ? `: ${next.email}` : ""}`
                                );
                              } else if (next?.expired) {
                                setAuthMsg(t("auth.expired"));
                              } else {
                                setAuthMsg(t("auth.notLoggedIn"));
                              }
                            });
                          }}
                          title="~/.grok/auth.json"
                        >
                          {t("auth.refresh")}
                        </button>
                      </div>
                      <span
                        className={`profile-avatar ${
                          auth?.avatarUrl && !avatarBroken ? "has-img" : ""
                        }`}
                      >
                        {auth?.avatarUrl && !avatarBroken ? (
                          <img
                            src={auth.avatarUrl}
                            alt=""
                            referrerPolicy="no-referrer"
                            draggable={false}
                            onError={() => setAvatarBroken(true)}
                          />
                        ) : (
                          (
                            draftSettings.displayName ||
                            auth?.email ||
                            "G"
                          )
                            .charAt(0)
                            .toUpperCase()
                        )}
                      </span>
                      <div className="profile-identity">
                        <strong>
                          {(draftSettings.displayName || "").trim() ||
                            (auth?.email ? auth.email.split("@")[0] : "Grok")}
                        </strong>
                        <span className="profile-handle">
                          {auth?.email || t("auth.notLoggedIn")}
                          {auth?.loggedIn ? (
                            <span className="profile-badge good">{t("auth.badge.ok")}</span>
                          ) : auth?.expired ? (
                            <span className="profile-badge warn">{t("auth.badge.expired")}</span>
                          ) : (
                            <span className="profile-badge warn">{t("auth.badge.none")}</span>
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="profile-auth-card">
                      <div className="profile-auth-row">
                        <span className="profile-auth-label">{t("auth.status")}</span>
                        <span>
                          {!auth
                            ? t("common.loading")
                            : auth.loggedIn
                              ? t("auth.loggedIn")
                              : auth.expired
                                ? t("auth.expired")
                                : t("auth.notLoggedIn")}
                        </span>
                      </div>
                      {auth?.email ? (
                        <div className="profile-auth-row">
                          <span className="profile-auth-label">{t("auth.email")}</span>
                          <span title={auth.email}>{auth.email}</span>
                        </div>
                      ) : null}
                      {auth?.expiresAt ? (
                        <div className="profile-auth-row">
                          <span className="profile-auth-label">{t("auth.expires")}</span>
                          <span title={auth.expiresAt}>
                            {(() => {
                              const t = Date.parse(auth.expiresAt);
                              return Number.isFinite(t)
                                ? new Date(t).toLocaleString()
                                : auth.expiresAt;
                            })()}
                          </span>
                        </div>
                      ) : null}
                      {auth?.path ? (
                        <div className="profile-auth-row">
                          <span className="profile-auth-label">{t("auth.file")}</span>
                          <code className="profile-auth-path" title={auth.path}>
                            {auth.path}
                          </code>
                        </div>
                      ) : null}
                      {authMsg ? (
                        <p className={`profile-auth-msg ${authBusy ? "pending" : ""}`}>
                          {authMsg}
                        </p>
                      ) : null}
                      <p className="hint profile-auth-hint">{t("auth.hint")}</p>
                      {!auth?.loggedIn && !authBusy ? (
                        <div className="profile-auth-cta">
                          <button
                            type="button"
                            className="primary small"
                            onClick={() => void runLogin()}
                          >
                            {auth?.expired ? t("auth.loginAgain") : t("auth.loginGrok")}
                          </button>
                          <button
                            type="button"
                            className="ghost small"
                            disabled={authBusy}
                            onClick={() => void runLoginCliFallback()}
                            title={t("auth.loginTerminal")}
                          >
                            {t("auth.loginTerminal")}
                          </button>
                          <button
                            type="button"
                            className="ghost small"
                            onClick={() =>
                              void window.grokApp.openExternal("https://accounts.x.ai/")
                            }
                          >
                            {t("auth.openAccounts")}
                          </button>
                        </div>
                      ) : null}
                    </div>

                    <div className="profile-stats-row">
                      <div className="profile-stat">
                        <strong>
                          {profileLoading
                            ? "…"
                            : profileStats?.lifetimeTokensLabel || "0"}
                        </strong>
                        <span>Token trọn đời</span>
                      </div>
                      <div className="profile-stat">
                        <strong>
                          {profileLoading ? "…" : profileStats?.peakTokensLabel || "0"}
                        </strong>
                        <span>Token cao nhất</span>
                      </div>
                      <div className="profile-stat">
                        <strong>
                          {profileLoading
                            ? "…"
                            : profileStats?.longestTaskLabel || "0s"}
                        </strong>
                        <span>Tác vụ dài nhất</span>
                      </div>
                      <div className="profile-stat">
                        <strong>
                          {profileLoading
                            ? "…"
                            : `${profileStats?.currentStreak ?? 0} ngày`}
                        </strong>
                        <span>Chuỗi hiện tại</span>
                      </div>
                      <div className="profile-stat">
                        <strong>
                          {profileLoading
                            ? "…"
                            : `${profileStats?.longestStreak ?? 0} ngày`}
                        </strong>
                        <span>Chuỗi dài nhất</span>
                      </div>
                    </div>

                    <div className="profile-heatmap-block">
                      <div className="profile-section-head">
                        <h4>Hoạt động token</h4>
                        <div className="profile-section-tools">
                          <div className="profile-heat-tabs" role="tablist" aria-label="Chế độ heatmap">
                            {(
                              [
                                ["daily", "Hằng ngày"],
                                ["weekly", "Hằng tuần"],
                                ["cumulative", "Tích lũy"],
                              ] as const
                            ).map(([id, label]) => (
                              <button
                                key={id}
                                type="button"
                                role="tab"
                                aria-selected={heatMode === id}
                                className={heatMode === id ? "active" : ""}
                                onClick={() => setHeatMode(id)}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                          <button
                            type="button"
                            className="ghost small"
                            onClick={() => void refreshProfileStats()}
                            disabled={profileLoading}
                          >
                            {profileLoading ? "…" : "Làm mới"}
                          </button>
                        </div>
                      </div>
                      {displayHeatmap.length > 0 ? (
                        <div
                          className="profile-heatmap-scroll"
                          style={
                            {
                              "--heat-weeks": String(Math.max(heatmapWeeks, 1)),
                            } as CSSProperties
                          }
                        >
                          {heatmapWeeks > 0 && (
                            <div
                              className="profile-heatmap-months"
                              aria-hidden={heatmapMonthLabels.length === 0}
                            >
                              {heatmapMonthSlots.map((slot, w) => (
                                <span
                                  key={`mw-${w}`}
                                  className={slot ? "has-label" : undefined}
                                  title={slot?.title}
                                >
                                  {slot?.label || ""}
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="profile-heatmap" aria-label="Token heatmap">
                            {displayHeatmap.map((c) => (
                              <span
                                key={c.date}
                                className={`heat-cell l${c.level ?? 0}`}
                                title={c.tip}
                              />
                            ))}
                          </div>
                        </div>
                      ) : (
                        !profileLoading && (
                          <p className="profile-heatmap-empty">
                            {profileStats?.error
                              ? `Lỗi hồ sơ: ${profileStats.error}`
                              : "Đang chờ dữ liệu heatmap… bấm Làm mới hoặc restart app."}
                          </p>
                        )
                      )}
                      {!profileLoading && displayHeatmap.length > 0 && !hasHeatActivity && (
                        <p className="profile-heatmap-empty">
                          Chưa có hoạt động token từ tháng 1 đến tháng 12.
                          {profileStats?.error
                            ? ` (lỗi: ${profileStats.error})`
                            : profileStats?.sources?.log === "missing-log"
                              ? " (không thấy ~/.grok/logs/unified.jsonl)"
                              : profileStats?.sources?.logError
                                ? ` (lỗi đọc log: ${profileStats.sources.logError})`
                                : profileStats?.sources?.logTurns === 0
                                  ? " (log chưa có inference_done)"
                                  : profileStats?.sources?.log
                                    ? ` (nguồn: ${profileStats.sources.log})`
                                    : ""}
                        </p>
                      )}
                      {displayHeatmap.length > 0 && (
                        <div
                          className="profile-heatmap-legend"
                          title={
                            heatMode === "daily"
                              ? "Thang tuyệt đối token/ngày (agent coding)"
                              : heatMode === "weekly"
                                ? "Thang tuyệt đối token/tuần"
                                : "Thang tuyệt đối token tích lũy trong năm"
                          }
                        >
                          <span className="heat-legend-end">Ít</span>
                          <div className="heat-legend-scale">
                            {[0, 1, 2, 3, 4, 5].map((lv) => (
                              <div key={lv} className="heat-legend-item" title={`L${lv}: ${heatLegendLabels[lv]}`}>
                                <span className={`heat-cell l${lv}`} />
                                <span className="heat-legend-n">{heatLegendLabels[lv]}</span>
                              </div>
                            ))}
                          </div>
                          <span className="heat-legend-end">Nhiều</span>
                          <span className="heat-legend-unit">
                            {heatMode === "daily"
                              ? "token/ngày"
                              : heatMode === "weekly"
                                ? "token/tuần"
                                : "token tích lũy"}
                          </span>
                        </div>
                      )}
                      {!profileLoading && profileStats?.sources && (
                        <p className="profile-source-hint" title={profileStats.sources.logPath || ""}>
                          Nguồn: {profileStats.sources.log || "—"}
                          {typeof profileStats.sources.logTurns === "number"
                            ? ` · ${profileStats.sources.logTurns} turn log`
                            : ""}
                          {typeof profileStats.sources.logLifetimeTokens === "number" &&
                          profileStats.sources.logLifetimeTokens > 0
                            ? ` · ${profileStats.lifetimeTokensLabel || profileStats.sources.logLifetimeTokens} tok`
                            : ""}
                          {profileStats.sources.local ? " · local" : ""}
                          {profileStats.fetchedAt
                            ? ` · ${new Date(profileStats.fetchedAt).toLocaleTimeString()}`
                            : ""}
                        </p>
                      )}
                    </div>

                    <div className="profile-detail-grid">
                      <div>
                        <h4>Chi tiết</h4>
                        <dl className="profile-dl">
                          <div>
                            <dt>Chế độ nhanh</dt>
                            <dd>{profileStats?.fastModePercent ?? 0}%</dd>
                          </div>
                          <div>
                            <dt>Suy luận hay dùng</dt>
                            <dd>
                              {profileStats?.reasoning?.top
                                ? `${
                                    profileStats.reasoning.top === "high"
                                      ? "Cao"
                                      : profileStats.reasoning.top === "medium"
                                        ? "TB"
                                        : profileStats.reasoning.top === "low"
                                          ? "Thấp"
                                          : profileStats.reasoning.top
                                  } · ${profileStats.reasoning.topPct}%`
                                : "—"}
                            </dd>
                          </div>
                          <div>
                            <dt>Skills đã khám phá</dt>
                            <dd>{profileStats?.skillsDiscovered ?? 0}</dd>
                          </div>
                          <div>
                            <dt>Skills đã dùng</dt>
                            <dd>{profileStats?.skillsUsedTotal ?? 0}</dd>
                          </div>
                          <div>
                            <dt>Tác vụ</dt>
                            <dd>{profileStats?.totalTasks ?? 0}</dd>
                          </div>
                        </dl>
                      </div>
                      <div>
                        <h4>Skills hay dùng</h4>
                        {(profileStats?.topSkills || []).length === 0 ? (
                          <p className="hint">Chưa có skill.</p>
                        ) : (
                          <ul className="profile-skill-list">
                            {profileStats!.topSkills.map((sk) => (
                              <li key={sk.name}>
                                <span className="skill-chip">${sk.name}</span>
                                <span className="skill-count">{sk.count}×</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>

                  </div>
                )}

                {settingsTab === "canhanhoa" && (
                  <>
                    <div className="settings-banner">
                      Giọng điệu + custom instructions + memory lưu local trên máy này.
                    </div>

                    <label className="field">Tính cách</label>
                    <select
                      value={draftSettings.personality ?? "realistic"}
                      onChange={(e) =>
                        setDraftSettings((s) => ({ ...s, personality: e.target.value }))
                      }
                    >
                      {PERSONALITY_OPTIONS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label} — {p.hint}
                        </option>
                      ))}
                    </select>

                    <div className="settings-section-head">
                      <div>
                        <label className="field" style={{ marginBottom: 0 }}>
                          Hướng dẫn tùy chỉnh
                        </label>
                        <p className="hint" style={{ margin: "4px 0 8px" }}>
                          Áp dụng cho mọi tác vụ trên máy này.
                        </p>
                      </div>
                      <button
                        type="button"
                        className="ghost small"
                        onClick={() =>
                          setDraftSettings((s) => ({
                            ...s,
                            customInstructions: DEFAULT_CUSTOM_INSTRUCTIONS,
                          }))
                        }
                      >
                        Mẫu
                      </button>
                    </div>
                    <textarea
                      className="settings-textarea"
                      rows={7}
                      placeholder="VD: trả lời tiếng Việt; hỏi lại khi mơ hồ; sửa tối thiểu…"
                      value={draftSettings.customInstructions ?? ""}
                      onChange={(e) =>
                        setDraftSettings((s) => ({
                          ...s,
                          customInstructions: e.target.value,
                        }))
                      }
                    />

                    <div className="settings-section-head" style={{ marginTop: 16 }}>
                      <div>
                        <strong>Bộ nhớ (thử nghiệm)</strong>
                      </div>
                    </div>
                    <label className="check settings-toggle">
                      <div>
                        <strong>Bật bộ nhớ</strong>
                        <p>Tạo memory từ tác vụ và dùng lại ở tác vụ sau.</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={draftSettings.memoryEnabled !== false}
                        onChange={(e) =>
                          setDraftSettings((s) => ({
                            ...s,
                            memoryEnabled: e.target.checked,
                          }))
                        }
                      />
                    </label>
                    <label className="check settings-toggle">
                      <div>
                        <strong>Memory từ tool / MCP</strong>
                        <p>Ghi nhớ khi agent đã dùng tool hoặc web search.</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={draftSettings.memoryFromTools !== false}
                        onChange={(e) =>
                          setDraftSettings((s) => ({
                            ...s,
                            memoryFromTools: e.target.checked,
                          }))
                        }
                      />
                    </label>

                    <div className="memory-list-head">
                      <span>
                        Đã lưu: {memories?.memories?.length ?? 0}
                        {memories?.updatedAt
                          ? ` · ${new Date(memories.updatedAt).toLocaleString()}`
                          : ""}
                      </span>
                      <button
                        type="button"
                        className="ghost danger small"
                        onClick={async () => {
                          if (!confirm("Xóa tất cả bộ nhớ đã lưu?")) return;
                          const next = await window.grokApp.clearMemories();
                          setMemories(next);
                        }}
                      >
                        Đặt lại
                      </button>
                    </div>
                    <div className="memory-add-row">
                      <input
                        type="text"
                        placeholder="Thêm memory thủ công…"
                        value={memoryDraft}
                        onChange={(e) => setMemoryDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void (async () => {
                              const t = memoryDraft.trim();
                              if (!t) return;
                              const next = await window.grokApp.addMemory({ text: t });
                              setMemories(next);
                              setMemoryDraft("");
                            })();
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="primary small"
                        onClick={async () => {
                          const t = memoryDraft.trim();
                          if (!t) return;
                          const next = await window.grokApp.addMemory({ text: t });
                          setMemories(next);
                          setMemoryDraft("");
                        }}
                      >
                        Thêm
                      </button>
                    </div>
                    <ul className="memory-list">
                      {(memories?.memories || []).slice(0, 20).map((m) => (
                        <li key={m.id}>
                          <span className="memory-text">{m.text}</span>
                          <button
                            type="button"
                            className="ghost icon"
                            title="Xóa"
                            onClick={async () => {
                              const next = await window.grokApp.removeMemory(m.id);
                              setMemories(next);
                            }}
                          >
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                {settingsTab === "skills" && (
                  <div className="skills-pane">
                    <div className="settings-banner">
                      Skill cài trên máy (SKILL.md). Agent Grok tự load khi task khớp — app chỉ
                      liệt kê, không bật/tắt từng skill.
                    </div>

                    <div className="skills-toolbar">
                      <input
                        type="search"
                        className="skills-search"
                        placeholder="Tìm skill (tên, mô tả)…"
                        value={skillsQuery}
                        onChange={(e) => setSkillsQuery(e.target.value)}
                        aria-label="Tìm skill"
                      />
                      <select
                        value={skillsSourceFilter}
                        onChange={(e) =>
                          setSkillsSourceFilter(
                            e.target.value as
                              | "all"
                              | "user"
                              | "agents"
                              | "bundled"
                              | "project"
                          )
                        }
                        aria-label="Lọc nguồn skill"
                      >
                        <option value="all">Tất cả nguồn</option>
                        <option value="user">User (~/.grok/skills)</option>
                        <option value="agents">Agents (~/.agents/skills)</option>
                        <option value="bundled">Bundled</option>
                        <option value="project">Project</option>
                      </select>
                      <button
                        type="button"
                        className="ghost small"
                        disabled={skillsLoading}
                        onClick={() => void refreshSkills()}
                      >
                        {skillsLoading ? "…" : "Làm mới"}
                      </button>
                    </div>

                    <div className="skills-summary">
                      <span>
                        {skillsLoading
                          ? "Đang quét…"
                          : `${filteredSkills.length} / ${skillsList?.count ?? 0} skill`}
                        {!skillsLoading && (skillsList?.uniqueCount ?? 0) > 0
                          ? ` · ${skillsList!.uniqueCount} tên khác nhau`
                          : ""}
                      </span>
                      {projectPath ? (
                        <span className="hint" title={projectPath}>
                          Project: {projectPath.split(/[/\\]/).filter(Boolean).pop()}
                        </span>
                      ) : (
                        <span className="hint">Chưa mở project — chỉ skill global</span>
                      )}
                    </div>

                    {skillsList?.error ? (
                      <p className="hint settings-hint" style={{ color: "var(--bad)" }}>
                        Lỗi: {skillsList.error}
                      </p>
                    ) : null}

                    {!skillsLoading && filteredSkills.length === 0 ? (
                      <p className="hint">
                        {skillsList?.count
                          ? "Không khớp bộ lọc."
                          : "Không tìm thấy skill. Cài vào ~/.grok/skills hoặc ~/.agents/skills (mỗi skill = thư mục có SKILL.md)."}
                      </p>
                    ) : (
                      <ul className="skills-list">
                        {filteredSkills.map((sk) => (
                          <li key={sk.id} className="skills-item">
                            <div className="skills-item-head">
                              <span className="skill-chip">${sk.name}</span>
                              <span
                                className={`skills-source-badge source-${sk.source}`}
                                title={sk.root}
                              >
                                {sk.sourceLabel}
                              </span>
                            </div>
                            {sk.description ? (
                              <p className="skills-item-desc">{sk.description}</p>
                            ) : (
                              <p className="skills-item-desc muted">Không có mô tả</p>
                            )}
                            <div className="skills-item-meta">
                              <code title={sk.skillPath}>{sk.folderName}</code>
                              <button
                                type="button"
                                className="ghost small"
                                title="Mở folder skill trong Explorer"
                                onClick={() => void window.grokApp.showItemInFolder(sk.skillPath)}
                              >
                                Mở folder
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}

                    <div className="skills-roots">
                      <div className="memory-list-head">
                        <span>Thư mục quét</span>
                      </div>
                      <ul className="skills-roots-list">
                        {(skillsList?.roots || []).map((r) => (
                          <li key={`${r.source}:${r.path}`}>
                            <span
                              className={`skills-root-dot ${r.exists ? "ok" : "miss"}`}
                              title={r.exists ? "Có" : "Không tồn tại"}
                            />
                            <span className="skills-root-label">{r.label}</span>
                            <code className="skills-root-path" title={r.path}>
                              {r.path}
                            </code>
                          </li>
                        ))}
                      </ul>
                    </div>

                  </div>
                )}

                {settingsTab === "chung" && (
                  <>
                    <div className="update-card">
                      <div className="update-card-head">
                        <div>
                          <div className="update-card-title">Phiên bản &amp; cập nhật</div>
                          <div className="update-card-sub">
                            Kiểm tra release trên GitHub · hiện tại{" "}
                            <strong>v{appVersion?.version || "…"}</strong>
                          </div>
                        </div>
                        <span className="update-version-pill" title="Phiên bản app">
                          v{appVersion?.version || "—"}
                        </span>
                      </div>
                      <div className="update-meta-grid">
                        <div className="update-meta-row">
                          <span className="update-meta-label">App</span>
                          <span>{appVersion?.name || "Grok Build"}</span>
                        </div>
                        <div className="update-meta-row">
                          <span className="update-meta-label">Đóng gói</span>
                          <span>
                            {appVersion
                              ? appVersion.isPackaged
                                ? "Packaged"
                                : "Dev (npm run dev)"
                              : "—"}
                          </span>
                        </div>
                        <div className="update-meta-row">
                          <span className="update-meta-label">Repo</span>
                          <span title={appVersion?.resolvedRepo || ""}>
                            {appVersion?.resolvedRepo ||
                              (draftSettings.updateGithubRepo || "").trim() ||
                              "Chưa cấu hình"}
                          </span>
                        </div>
                        {updateCheckResult?.latestVersion ? (
                          <div className="update-meta-row">
                            <span className="update-meta-label">Mới nhất</span>
                            <span>
                              v{updateCheckResult.latestVersion}
                              {updateCheckResult.updateAvailable ? (
                                <span className="profile-badge warn" style={{ marginLeft: 8 }}>
                                  Có update
                                </span>
                              ) : (
                                <span className="profile-badge good" style={{ marginLeft: 8 }}>
                                  Mới nhất
                                </span>
                              )}
                            </span>
                          </div>
                        ) : null}
                      </div>
                      <div className="update-actions">
                        <button
                          type="button"
                          className="primary small"
                          disabled={updateChecking || updateModal === "downloading"}
                          onClick={() => void runUpdateCheck()}
                        >
                          {updateChecking ? t("update.checking") : t("update.check")}
                        </button>
                        {updateCheckResult?.releaseUrl ? (
                          <button
                            type="button"
                            className="ghost small"
                            onClick={() =>
                              void window.grokApp.openExternal(updateCheckResult.releaseUrl!)
                            }
                          >
                            {t("update.openReleases")}
                          </button>
                        ) : null}
                      </div>
                      {updateCheckResult && !updateModal ? (
                        <p
                          className={`update-status-line ${
                            updateCheckResult.updateAvailable
                              ? "warn"
                              : updateCheckResult.ok
                                ? "good"
                                : "bad"
                          }`}
                        >
                          {updateCheckResult.message}
                        </p>
                      ) : null}
                    </div>

                    <label className="field">{t("settings.language")}</label>
                    <select
                      value={normalizeLocale(draftSettings.locale ?? settings?.locale ?? "vi")}
                      onChange={(e) =>
                        setDraftSettings((s) => ({
                          ...s,
                          locale: e.target.value === "en" ? "en" : "vi",
                        }))
                      }
                    >
                      {LOCALES.map((L) => (
                        <option key={L.id} value={L.id}>
                          {L.native} ({L.label})
                        </option>
                      ))}
                    </select>

                    <label className="field">{t("settings.grokPath")}</label>
                    <input
                      type="text"
                      value={draftSettings.grokPath ?? ""}
                      onChange={(e) => setDraftSettings((s) => ({ ...s, grokPath: e.target.value }))}
                    />
                    <div className="cli-install-row">
                      <p
                        className={`update-status-line ${
                          cliStatus == null
                            ? ""
                            : cliStatus.installed
                              ? "good"
                              : cliStatus.supported
                                ? "warn"
                                : "bad"
                        }`}
                      >
                        {cliStatus == null
                          ? t("cli.checking")
                          : cliStatus.installed
                            ? `${t("cli.installed")}${cliStatus.path ? ` — ${cliStatus.path}` : ""}`
                            : cliStatus.supported
                              ? t("cli.missing")
                              : `${t("cli.unsupported")} — ${cliStatus.installCommand}`}
                      </p>
                      <div className="actions" style={{ marginTop: 6 }}>
                        <button
                          type="button"
                          className="ghost small"
                          disabled={cliModal === "downloading"}
                          onClick={() => void refreshCliStatus()}
                        >
                          {t("common.refresh")}
                        </button>
                        {cliStatus?.supported !== false ? (
                          <button
                            type="button"
                            className="primary small"
                            disabled={cliModal === "downloading"}
                            onClick={() => void startCliInstall()}
                          >
                            {cliStatus?.installed ? t("cli.reinstall") : t("cli.install")}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="ghost small"
                            onClick={() =>
                              void window.grokApp.openExternal(
                                cliStatus?.docsUrl || "https://docs.x.ai/build/overview"
                              )
                            }
                          >
                            {t("cli.docs")}
                          </button>
                        )}
                      </div>
                    </div>
                    <label className="field">{t("settings.theme")}</label>
                    <select
                      value={draftSettings.theme ?? "dark"}
                      onChange={(e) => setDraftSettings((s) => ({ ...s, theme: e.target.value }))}
                    >
                      <option value="dark">Dark</option>
                      <option value="light">Light</option>
                    </select>
                    <label className="field">Terminal ngoài</label>
                    <select
                      value={draftSettings.terminal ?? "auto"}
                      onChange={(e) => setDraftSettings((s) => ({ ...s, terminal: e.target.value }))}
                    >
                      {/Mac|iPhone|iPod|iPad/i.test(
                        `${navigator.platform || ""} ${navigator.userAgent || ""}`
                      ) ? (
                        <>
                          <option value="auto">Auto (Terminal.app)</option>
                          <option value="terminal">Terminal.app</option>
                          <option value="iterm">iTerm2</option>
                        </>
                      ) : (
                        <>
                          <option value="auto">Auto (WT → PowerShell → cmd)</option>
                          <option value="wt">Windows Terminal</option>
                          <option value="powershell">PowerShell</option>
                          <option value="cmd">cmd</option>
                        </>
                      )}
                    </select>
                  </>
                )}
                {settingsTab === "quyen" && (
                  <>
                    <label className="check settings-toggle">
                      <div>
                        <strong>Quyền mặc định</strong>
                        <p>Hỏi trước khi agent chạy tool nguy hiểm (shell, ghi file…).</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={!draftSettings.alwaysApprove}
                        onChange={(e) =>
                          setDraftSettings((s) => ({ ...s, alwaysApprove: !e.target.checked }))
                        }
                      />
                    </label>
                    <label className="check settings-toggle">
                      <div>
                        <strong>Luôn cho phép</strong>
                        <p>Tự duyệt mọi tool. Nhanh hơn, rủi ro cao hơn.</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={Boolean(draftSettings.alwaysApprove)}
                        onChange={(e) =>
                          setDraftSettings((s) => ({ ...s, alwaysApprove: e.target.checked }))
                        }
                      />
                    </label>
                    <label className="check settings-toggle">
                      <div>
                        <strong>Checklist sau lượt</strong>
                        <p>Hiện checklist sau mỗi lượt có tool.</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={draftSettings.postTaskChecklist !== false}
                        onChange={(e) =>
                          setDraftSettings((s) => ({ ...s, postTaskChecklist: e.target.checked }))
                        }
                      />
                    </label>
                    <label className="check settings-toggle">
                      <div>
                        <strong>Báo cáo cuối lượt</strong>
                        <p>Thẻ tóm tắt thời gian + file đã sửa, kèm nút xem Diff.</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={draftSettings.turnReport !== false}
                        onChange={(e) =>
                          setDraftSettings((s) => ({ ...s, turnReport: e.target.checked }))
                        }
                      />
                    </label>
                    <label className="check settings-toggle">
                      <div>
                        <strong>Thông báo Windows</strong>
                        <p>Báo hệ thống khi agent xong lúc app đang ẩn.</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={draftSettings.notifyOnTurnDone !== false}
                        onChange={(e) =>
                          setDraftSettings((s) => ({
                            ...s,
                            notifyOnTurnDone: e.target.checked,
                          }))
                        }
                      />
                    </label>
                    <label className="check settings-toggle">
                      <div>
                        <strong>Hàng đợi tin nhắn</strong>
                        <p>
                          Agent đang chạy → tin mới xếp hàng. Tắt → dừng lượt hiện tại và chạy tin
                          mới ngay.
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={draftSettings.messageQueueEnabled !== false}
                        onChange={(e) =>
                          setDraftSettings((s) => ({
                            ...s,
                            messageQueueEnabled: e.target.checked,
                          }))
                        }
                      />
                    </label>
                    <label className="check settings-toggle">
                      <div>
                        <strong>Cảnh báo privacy</strong>
                        <p>Nhắc không commit .agents/ và MEMORY khi mở project.</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={draftSettings.privacyBanner !== false}
                        onChange={(e) =>
                          setDraftSettings((s) => ({ ...s, privacyBanner: e.target.checked }))
                        }
                      />
                    </label>
                  </>
                )}
                {settingsTab === "phimtat" && (
                  <>
                    <p className="hint settings-hint">
                      Danh sách phím tắt hiện có (chưa đổi được). Mở nhanh:{" "}
                      <kbd>Ctrl+Shift+/</kbd> hoặc <strong>?</strong>.
                    </p>
                    <input
                      type="search"
                      className="shortcut-search"
                      placeholder="Tìm phím tắt…"
                      value={shortcutQuery}
                      onChange={(e) => setShortcutQuery(e.target.value)}
                      autoFocus
                    />
                    {(() => {
                      const q = shortcutQuery.trim().toLowerCase();
                      const filtered = !q
                        ? SHORTCUT_CATALOG
                        : SHORTCUT_CATALOG.filter(
                            (s) =>
                              s.label.toLowerCase().includes(q) ||
                              s.group.toLowerCase().includes(q) ||
                              s.keys.some((k) => k.toLowerCase().includes(q)) ||
                              (s.note && s.note.toLowerCase().includes(q))
                          );
                      const groups = Array.from(
                        new Set(filtered.map((s) => s.group))
                      );
                      if (!filtered.length) {
                        return (
                          <p className="hint" style={{ marginTop: 12 }}>
                            Không khớp “{shortcutQuery}”.
                          </p>
                        );
                      }
                      return groups.map((g) => (
                        <div key={g} className="shortcut-group">
                          <div className="shortcut-group-title">{g}</div>
                          <ul className="shortcut-list">
                            {filtered
                              .filter((s) => s.group === g)
                              .map((s) => (
                                <li key={s.id} className="shortcut-row">
                                  <div className="shortcut-meta">
                                    <strong>{s.label}</strong>
                                    {s.note ? (
                                      <span className="shortcut-note">{s.note}</span>
                                    ) : null}
                                  </div>
                                  <div className="shortcut-keys">
                                    {s.keys.map((k) => (
                                      <kbd key={k}>{k}</kbd>
                                    ))}
                                  </div>
                                </li>
                              ))}
                          </ul>
                        </div>
                      ));
                    })()}
                  </>
                )}

                {settingsTab === "agent" && (
                  <>
                    <p className="hint">
                      Bật MCP bên dưới để agent dùng tool ngoài. Cần Chrome + Node/npx. Đổi MCP →
                      Lưu rồi <strong>Khởi động lại</strong> agent.
                    </p>

                    <label className="check settings-toggle">
                      <div>
                        <strong>Chrome DevTools MCP</strong>
                        <p>
                          Agent điều khiển Chrome (mở trang, screenshot, console…). Quyền browser lớn
                          — opt-in.
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={Boolean(draftSettings.chromeDevtoolsMcp)}
                        onChange={(e) =>
                          setDraftSettings((s) => ({ ...s, chromeDevtoolsMcp: e.target.checked }))
                        }
                      />
                    </label>

                    {Boolean(draftSettings.chromeDevtoolsMcp) && (
                      <div className="settings-mcp-options">
                        <label className="check settings-toggle">
                          <div>
                            <strong>Headless</strong>
                            <p>Chrome không hiện cửa sổ.</p>
                          </div>
                          <input
                            type="checkbox"
                            checked={Boolean(draftSettings.chromeDevtoolsMcpHeadless)}
                            onChange={(e) =>
                              setDraftSettings((s) => ({
                                ...s,
                                chromeDevtoolsMcpHeadless: e.target.checked,
                              }))
                            }
                          />
                        </label>
                        <label className="check settings-toggle">
                          <div>
                            <strong>Slim tools</strong>
                            <p>Chỉ điều hướng, screenshot, evaluate — ít tốn context hơn.</p>
                          </div>
                          <input
                            type="checkbox"
                            checked={Boolean(draftSettings.chromeDevtoolsMcpSlim)}
                            onChange={(e) =>
                              setDraftSettings((s) => ({
                                ...s,
                                chromeDevtoolsMcpSlim: e.target.checked,
                              }))
                            }
                          />
                        </label>
                        <label className="check settings-toggle">
                          <div>
                            <strong>Isolated profile</strong>
                            <p>Profile Chrome tạm, xóa khi đóng.</p>
                          </div>
                          <input
                            type="checkbox"
                            checked={Boolean(draftSettings.chromeDevtoolsMcpIsolated)}
                            onChange={(e) =>
                              setDraftSettings((s) => ({
                                ...s,
                                chromeDevtoolsMcpIsolated: e.target.checked,
                              }))
                            }
                          />
                        </label>
                        <label className="check settings-toggle">
                          <div>
                            <strong>Tắt usage statistics</strong>
                            <p>Không gửi telemetry của Chrome DevTools MCP.</p>
                          </div>
                          <input
                            type="checkbox"
                            checked={draftSettings.chromeDevtoolsMcpNoUsageStats !== false}
                            onChange={(e) =>
                              setDraftSettings((s) => ({
                                ...s,
                                chromeDevtoolsMcpNoUsageStats: e.target.checked,
                              }))
                            }
                          />
                        </label>
                        <label className="field">Browser URL (attach CDP — tùy chọn)</label>
                        <input
                          type="text"
                          placeholder="http://127.0.0.1:9222 — để trống = MCP tự mở Chrome"
                          value={draftSettings.chromeDevtoolsMcpBrowserUrl ?? ""}
                          onChange={(e) =>
                            setDraftSettings((s) => ({
                              ...s,
                              chromeDevtoolsMcpBrowserUrl: e.target.value,
                            }))
                          }
                        />
                        <label className="field">npm package</label>
                        <input
                          type="text"
                          value={
                            draftSettings.chromeDevtoolsMcpPackage ?? "chrome-devtools-mcp@latest"
                          }
                          onChange={(e) =>
                            setDraftSettings((s) => ({
                              ...s,
                              chromeDevtoolsMcpPackage: e.target.value,
                            }))
                          }
                        />
                      </div>
                    )}
                  </>
                )}
                <div className="actions">
                  <button type="button" onClick={() => setShowSettings(false)}>
                    {t("common.cancel")}
                  </button>
                  <button
                    type="button"
                    className="primary"
                    onClick={async () => {
                      const prevMcp = Boolean(settings?.chromeDevtoolsMcp);
                      const next = await window.grokApp.saveSettings(draftSettings);
                      setSettings(next);
                      setDraftSettings(next);
                      applyTheme(next.theme);
                      setShowSettings(false);
                      void refreshAppVersion();
                      const mcpChanged =
                        prevMcp !== Boolean(next.chromeDevtoolsMcp) ||
                        settings?.chromeDevtoolsMcpHeadless !== next.chromeDevtoolsMcpHeadless ||
                        settings?.chromeDevtoolsMcpSlim !== next.chromeDevtoolsMcpSlim ||
                        settings?.chromeDevtoolsMcpIsolated !== next.chromeDevtoolsMcpIsolated ||
                        (settings?.chromeDevtoolsMcpBrowserUrl || "") !==
                          (next.chromeDevtoolsMcpBrowserUrl || "") ||
                        (settings?.chromeDevtoolsMcpPackage || "") !==
                          (next.chromeDevtoolsMcpPackage || "");
                      if (agentReady && mcpChanged) {
                        // MCP is bound at session/new only — must restart agent + new session
                        await startAgent();
                        pushLocal({
                          id: uid(),
                          kind: "system",
                          text: next.chromeDevtoolsMcp
                            ? "Đã bật Chrome DevTools MCP. Agent đã restart — dùng chat MỚI (không dùng session cũ). Lần đầu có thể tải package qua npx."
                            : "Đã tắt Chrome DevTools MCP. Agent đã restart; session mới sẽ không inject MCP.",
                        });
                      }
                    }}
                  >
                    {t("common.save")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {turnDoneToast && (
        <div
          className={`turn-done-toast ${turnDoneToast.status}`}
          role="status"
          aria-live="polite"
          aria-label={turnDoneToast.headline}
        >
          <span className="turn-done-toast-icon" aria-hidden>
            {turnDoneToast.status === "done"
              ? "✓"
              : turnDoneToast.status === "cancelled"
                ? "■"
                : "!"}
          </span>
          <div className="turn-done-toast-body">
            <div className="turn-done-toast-title">{turnDoneToast.headline}</div>
            {turnDoneToast.body ? (
              <div className="turn-done-toast-msg">{turnDoneToast.body}</div>
            ) : null}
          </div>
          <button
            type="button"
            className="ghost small"
            onClick={() => setTurnDoneToast(null)}
            aria-label="Đóng"
          >
            Đóng
          </button>
        </div>
      )}
      {updateToastOpen &&
        updateCheckResult?.updateAvailable &&
        updateCheckResult.latestVersion && (
          <div
            className="update-toast"
            role="status"
            aria-live="polite"
            aria-label="Có bản cập nhật mới"
          >
            <div className="update-toast-body">
              <div className="update-toast-title">Có bản mới</div>
              <div className="update-toast-msg">
                v{updateCheckResult.currentVersion} →{" "}
                <strong>v{updateCheckResult.latestVersion}</strong>
              </div>
            </div>
            <div className="update-toast-actions">
              <button
                type="button"
                className="primary small"
                onClick={() => {
                  setUpdateToastOpen(false);
                  setUpdateModal("available");
                }}
              >
                Xem
              </button>
              <button
                type="button"
                className="ghost small"
                onClick={() => setUpdateToastOpen(false)}
                aria-label="Đóng thông báo cập nhật"
              >
                Đóng
              </button>
            </div>
          </div>
        )}

      {renameTabModal && (
        <div
          className="modal-backdrop center"
          onClick={() => setRenameTabModal(null)}
        >
          <div
            className="modal update-modal confirm-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="rename-tab-title"
          >
            <div className="modal-head">
              <h3 id="rename-tab-title">{t("chat.renameTitle")}</h3>
              <button
                type="button"
                className="ghost icon"
                onClick={() => setRenameTabModal(null)}
                aria-label={t("common.close")}
              >
                {"\u00d7"}
              </button>
            </div>
            <p className="update-prompt">{t("chat.renamePrompt")}</p>
            <label className="rename-project-label" htmlFor="rename-tab-input">
              {t("chat.renameLabel")}
            </label>
            <input
              id="rename-tab-input"
              className="rename-project-input"
              value={renameTabModal.name}
              placeholder={t("chat.renamePlaceholder")}
              maxLength={120}
              autoFocus
              onChange={(e) =>
                setRenameTabModal((cur) =>
                  cur ? { ...cur, name: e.target.value, error: undefined } : cur
                )
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void executeRenameTab();
                }
              }}
            />
            {renameTabModal.error && (
              <p className="rename-project-error" role="alert">
                {renameTabModal.error}
              </p>
            )}
            <div className="actions">
              <button
                type="button"
                className="ghost"
                onClick={() => setRenameTabModal(null)}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className="primary"
                disabled={!renameTabModal.name.trim()}
                onClick={() => void executeRenameTab()}
              >
                {t("common.save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {renameProjectModal && (
        <div
          className="modal-backdrop center"
          onClick={() => setRenameProjectModal(null)}
        >
          <div
            className="modal update-modal confirm-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="rename-project-title"
          >
            <div className="modal-head">
              <h3 id="rename-project-title">{"\u0110\u1ed5i t\u00ean project"}</h3>
              <button
                type="button"
                className="ghost icon"
                onClick={() => setRenameProjectModal(null)}
                aria-label={"\u0110\u00f3ng"}
              >
                {"\u00d7"}
              </button>
            </div>
            <p className="update-prompt">
              {"\u0110\u1ed5i t\u00ean folder project v\u00e0 gi\u1eef nguy\u00ean l\u1ecbch s\u1eed chat trong app."}
            </p>
            <label className="rename-project-label" htmlFor="rename-project-input">
              {"T\u00ean m\u1edbi"}
            </label>
            <input
              id="rename-project-input"
              className="rename-project-input"
              value={renameProjectModal.name}
              autoFocus
              onChange={(e) =>
                setRenameProjectModal((cur) =>
                  cur ? { ...cur, name: e.target.value, error: undefined } : cur
                )
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void executeRenameProject();
                }
              }}
            />
            {renameProjectModal.error && (
              <p className="rename-project-error" role="alert">
                {renameProjectModal.error}
              </p>
            )}
            <p className="confirm-path" title={renameProjectModal.path}>
              <span className="confirm-path-label">{"Folder hi\u1ec7n t\u1ea1i"}</span>
              <code>{renameProjectModal.path}</code>
            </p>
            <ul className="confirm-list">
              <li>Kh&#xF4;ng x&#xF3;a file trong folder</li>
              <li>L&#x1ECB;ch s&#x1EED; chat v&#xE0; tab s&#x1EBD; &#x111;&#x1B0;&#x1EE3;c gi&#x1EEF; l&#x1EA1;i</li>
            </ul>
            <div className="actions">
              <button
                type="button"
                className="ghost"
                onClick={() => setRenameProjectModal(null)}
              >
                H&#x1EE7;y
              </button>
              <button
                type="button"
                className="primary"
                disabled={!renameProjectModal.name.trim()}
                onClick={() => void executeRenameProject()}
              >
                &#x110;&#x1ED5;i t&#xEA;n
              </button>
            </div>
          </div>
        </div>
      )}

      {removeRecentConfirm && (
        <div
          className="modal-backdrop center"
          onClick={() => setRemoveRecentConfirm(null)}
        >
          <div
            className="modal update-modal confirm-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-recent-title"
          >
            <div className="modal-head">
              <h3 id="remove-recent-title">Gỡ khỏi danh sách gần đây</h3>
              <button
                type="button"
                className="ghost icon"
                onClick={() => setRemoveRecentConfirm(null)}
                aria-label="Đóng"
              >
                ×
              </button>
            </div>
            <p className="update-prompt">
              Gỡ project “{projectName(removeRecentConfirm)}” khỏi danh sách gần đây?
            </p>
            <ul className="confirm-list">
              <li>Không xóa folder trên đĩa</li>
              <li>Lịch sử chat trong app vẫn giữ trong %APPDATA%</li>
            </ul>
            <p className="confirm-path" title={removeRecentConfirm}>
              <span className="confirm-path-label">Path</span>
              <code>{removeRecentConfirm}</code>
            </p>
            <div className="actions">
              <button
                type="button"
                className="ghost"
                onClick={() => setRemoveRecentConfirm(null)}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => void executeRemoveRecent(removeRecentConfirm)}
              >
                Gỡ
              </button>
            </div>
          </div>
        </div>
      )}

      {closeTabConfirm && (
        <div
          className="modal-backdrop center"
          onClick={() => setCloseTabConfirm(null)}
        >
          <div
            className="modal update-modal confirm-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="close-tab-title"
          >
            <div className="modal-head">
              <h3 id="close-tab-title">
                {t(closeTabConfirm.running ? "chat.stopDeleteTitle" : "chat.deleteTitle")}
              </h3>
              <button
                type="button"
                className="ghost icon"
                onClick={() => setCloseTabConfirm(null)}
                aria-label="Đóng"
              >
                ×
              </button>
            </div>
            <p className="update-prompt">
              {t(
                closeTabConfirm.running ? "chat.stopDeletePrompt" : "chat.deletePrompt",
                { name: closeTabConfirm.title }
              )}
            </p>
            <ul className="confirm-list">
              {closeTabConfirm.running && <li>{t("chat.deleteRunningNote")}</li>}
              <li>{t("chat.deleteHistoryNote")}</li>
              <li>{t("chat.deleteUndoNote")}</li>
            </ul>
            <div className="actions">
              <button
                type="button"
                className="ghost"
                onClick={() => setCloseTabConfirm(null)}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => void executeCloseTab()}
              >
                {closeTabConfirm.running ? t("chat.stopDeleteAction") : t("chat.delete")}
              </button>
            </div>
          </div>
        </div>
      )}

      {loginModal && (
        <div
          className="modal-backdrop center update-backdrop"
          onClick={() => {
            if (loginProgress?.phase === "pending" || loginProgress?.phase === "starting") {
              return;
            }
            setLoginModal(false);
          }}
        >
          <div
            className="modal update-modal login-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="login-modal-title"
          >
            <div className="modal-head">
              <h3 id="login-modal-title">
                {loginProgress?.phase === "done"
                  ? t("auth.modal.done")
                  : loginProgress?.phase === "error"
                    ? t("auth.modal.error")
                    : t("auth.modal.title")}
              </h3>
              {loginProgress?.phase !== "pending" &&
              loginProgress?.phase !== "starting" ? (
                <button
                  type="button"
                  className="ghost icon"
                  onClick={() => setLoginModal(false)}
                  aria-label="Đóng"
                >
                  ×
                </button>
              ) : null}
            </div>

            {(loginProgress?.phase === "starting" || !loginProgress) && (
              <p className="update-prompt">{t("auth.modal.fetching")}</p>
            )}

            {(loginProgress?.phase === "pending" ||
              (loginProgress?.userCode && loginProgress.phase !== "done")) &&
            loginProgress?.phase !== "error" ? (
              <>
                <p className="update-prompt">{t("auth.modal.instructions")}</p>
                <div className="login-code-box">
                  <span className="login-code-label">{t("auth.modal.codeLabel")}</span>
                  <strong className="login-code" title={t("auth.modal.copyCode")}>
                    {loginProgress?.userCode || "······"}
                  </strong>
                  <button
                    type="button"
                    className="ghost small"
                    disabled={!loginProgress?.userCode}
                    onClick={() => {
                      const code = loginProgress?.userCode;
                      if (!code) return;
                      void navigator.clipboard?.writeText(code);
                      setAuthMsg(`${t("auth.modal.copyCode")}: ${code}`);
                    }}
                  >
                    {t("auth.modal.copyCode")}
                  </button>
                </div>
                <p className="hint login-wait-hint">
                  {loginProgress?.message || t("auth.modal.waiting")}
                </p>
                <div className="actions">
                  <button
                    type="button"
                    className="ghost danger"
                    onClick={() => {
                      void window.grokApp.cancelLogin();
                      authPollGenRef.current += 1;
                      setAuthBusy(false);
                      setLoginModal(false);
                      setLoginProgress(null);
                      setAuthMsg(t("auth.cancelled"));
                    }}
                  >
                    {t("common.cancel")}
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    disabled={!loginProgress?.verificationUri}
                    onClick={() => {
                      const u =
                        loginProgress?.verificationUri ||
                        loginProgress?.verificationUriBase;
                      if (u) void window.grokApp.openExternal(u);
                    }}
                  >
                    {t("auth.modal.reopenBrowser")}
                  </button>
                </div>
              </>
            ) : null}

            {loginProgress?.phase === "done" && (
              <>
                <p className="update-done-msg">
                  {loginProgress.message ||
                    (loginProgress.email
                      ? `${t("auth.modal.done")}: ${loginProgress.email}`
                      : t("auth.modal.done"))}
                </p>
                <div className="actions">
                  <button type="button" className="primary" onClick={() => setLoginModal(false)}>
                    {t("common.close")}
                  </button>
                </div>
              </>
            )}

            {loginProgress?.phase === "error" && (
              <>
                <p className="update-status-line bad">
                  {loginProgress.error || loginProgress.message || t("auth.failed")}
                </p>
                <p className="hint">{t("auth.modal.errorHint")}</p>
                <div className="actions">
                  <button type="button" className="ghost" onClick={() => setLoginModal(false)}>
                    {t("common.close")}
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => void runLoginCliFallback()}
                  >
                    {t("auth.modal.fallbackCli")}
                  </button>
                  <button type="button" className="primary" onClick={() => void runLogin()}>
                    {t("common.retry")}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {cliModal && (
        <div
          className="modal-backdrop center update-backdrop"
          onClick={() => {
            if (cliModal === "downloading") return;
            setCliModal(null);
          }}
        >
          <div
            className="modal update-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="cli-modal-title"
          >
            <div className="modal-head">
              <h3 id="cli-modal-title">
                {cliModal === "missing"
                  ? t("cli.needTitle")
                  : cliModal === "downloading"
                    ? t("cli.installing")
                    : cliModal === "done"
                      ? t("cli.done")
                      : t("cli.error")}
              </h3>
              {cliModal !== "downloading" ? (
                <button
                  type="button"
                  className="ghost icon"
                  onClick={() => setCliModal(null)}
                  aria-label="Đóng"
                >
                  ×
                </button>
              ) : null}
            </div>

            {cliModal === "missing" && (
              <>
                <p className="update-prompt">{t("cli.needBody")}</p>
                <p className="hint">{t("cli.source")}</p>
                <div className="actions">
                  <button type="button" className="ghost" onClick={() => setCliModal(null)}>
                    {t("common.later")}
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() =>
                      void window.grokApp.openExternal("https://docs.x.ai/build/overview")
                    }
                  >
                    {t("common.docs")}
                  </button>
                  <button type="button" className="primary" onClick={() => void startCliInstall()}>
                    {t("cli.install")}
                  </button>
                </div>
              </>
            )}

            {cliModal === "downloading" && (
              <>
                <div className="update-progress-panel">
                  <div className="update-progress-head">
                    <span className="update-progress-file" title={cliProgress?.fileName || ""}>
                      {cliProgress?.phase === "installing"
                        ? t("cli.writing")
                        : cliProgress?.fileName || "Grok CLI"}
                      {cliProgress?.version ? ` · v${cliProgress.version}` : ""}
                    </span>
                    <span className="update-progress-pct">
                      {Math.min(100, Math.round(cliProgress?.percent || 0))}%
                    </span>
                  </div>
                  <div
                    className="update-progress-track"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.min(100, Math.round(cliProgress?.percent || 0))}
                  >
                    <div
                      className="update-progress-fill"
                      style={{
                        width: `${Math.min(100, Math.max(0, cliProgress?.percent || 0))}%`,
                      }}
                    />
                  </div>
                  <div className="update-progress-stats">
                    <span>
                      {cliProgress?.receivedLabel ||
                        (cliProgress
                          ? `${(cliProgress.received / (1024 * 1024)).toFixed(1)} MB`
                          : "0 MB")}
                      {" / "}
                      {cliProgress?.totalLabel ||
                        (cliProgress?.total
                          ? `${(cliProgress.total / (1024 * 1024)).toFixed(1)} MB`
                          : "?")}
                    </span>
                    <span className="update-speed">{cliProgress?.speedLabel || "—"}</span>
                  </div>
                </div>
                <div className="actions">
                  <button
                    type="button"
                    className="ghost danger"
                    onClick={() => {
                      void window.grokApp.cancelCliInstall();
                      setCliModal(null);
                      setCliProgress(null);
                    }}
                  >
                    {t("cli.cancelDownload")}
                  </button>
                </div>
              </>
            )}

            {cliModal === "done" && (
              <>
                <p className="update-done-msg">
                  {t("cli.done")}
                  {cliInstallResult?.version ? (
                    <>
                      {" "}
                      <strong>v{cliInstallResult.version}</strong>
                    </>
                  ) : null}
                  {cliInstallResult?.path ? (
                    <>
                      {" "}
                      → <code>{cliInstallResult.path}</code>
                    </>
                  ) : null}
                  . {t("cli.loginAfter")}
                </p>
                <div className="actions">
                  <button type="button" className="ghost" onClick={() => setCliModal(null)}>
                    {t("common.close")}
                  </button>
                  <button
                    type="button"
                    className="primary"
                    onClick={() => {
                      setCliModal(null);
                      void runLogin();
                    }}
                  >
                    {t("auth.login")}
                  </button>
                </div>
              </>
            )}

            {cliModal === "error" && (
              <>
                <p className="update-status-line bad">{cliError || t("cli.error")}</p>
                <p className="hint">
                  {t("cli.fallbackHint")}{" "}
                  <code>{cliStatus?.installCommand || "irm https://x.ai/cli/install.ps1 | iex"}</code>
                </p>
                <div className="actions">
                  <button type="button" className="ghost" onClick={() => setCliModal(null)}>
                    {t("common.close")}
                  </button>
                  <button type="button" className="primary" onClick={() => void startCliInstall()}>
                    {t("common.retry")}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {updateModal && (
        <div
          className="modal-backdrop center update-backdrop"
          onClick={() => {
            if (updateModal === "downloading") return;
            setUpdateModal(null);
          }}
        >
          <div
            className="modal update-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="update-modal-title"
          >
            <div className="modal-head">
              <h3 id="update-modal-title">
                {updateModal === "available"
                  ? t("update.available")
                  : updateModal === "downloading"
                    ? t("update.downloading")
                    : updateModal === "done"
                      ? t("update.done")
                      : updateModal === "error"
                        ? t("update.error")
                        : t("update.version")}
              </h3>
              {updateModal !== "downloading" ? (
                <button
                  type="button"
                  className="ghost icon"
                  onClick={() => setUpdateModal(null)}
                  aria-label="Đóng"
                >
                  ×
                </button>
              ) : null}
            </div>

            {updateModal === "available" && updateCheckResult && (
              <>
                <div className="update-compare">
                  <div className="update-compare-col">
                    <span className="update-meta-label">{t("update.current")}</span>
                    <strong>v{updateCheckResult.currentVersion}</strong>
                  </div>
                  <span className="update-compare-arrow" aria-hidden>
                    →
                  </span>
                  <div className="update-compare-col">
                    <span className="update-meta-label">{t("update.available")}</span>
                    <strong className="update-new-ver">
                      v{updateCheckResult.latestVersion}
                    </strong>
                  </div>
                </div>
                {updateCheckResult.asset ? (
                  <div className="update-asset-line">
                    <span className="update-meta-label">{t("auth.file")}</span>
                    <code>
                      {updateCheckResult.asset.name}
                      {updateCheckResult.asset.size
                        ? ` · ${(updateCheckResult.asset.size / (1024 * 1024)).toFixed(1)} MB`
                        : ""}
                    </code>
                  </div>
                ) : (
                  <p className="hint">
                    Release chưa có installer (.exe). Có thể mở trang Releases để tải thủ công.
                  </p>
                )}
                {updateCheckResult.body ? (
                  <pre className="update-notes">
                    {updateCheckResult.body.slice(0, 1200)}
                    {updateCheckResult.body.length > 1200 ? "…" : ""}
                  </pre>
                ) : null}
                <p className="update-prompt">{t("update.prompt")}</p>
                <div className="actions">
                  <button type="button" className="ghost" onClick={() => setUpdateModal(null)}>
                    {t("common.later")}
                  </button>
                  {updateCheckResult.releaseUrl ? (
                    <button
                      type="button"
                      className="ghost"
                      onClick={() =>
                        void window.grokApp.openExternal(updateCheckResult.releaseUrl!)
                      }
                    >
                      {t("update.viewRelease")}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="primary"
                    onClick={() => void startUpdateDownload()}
                  >
                    {updateCheckResult.asset ? t("update.now") : t("update.openPage")}
                  </button>
                </div>
              </>
            )}

            {updateModal === "downloading" && (
              <>
                <div className="update-progress-panel">
                  <div className="update-progress-head">
                    <span className="update-progress-file" title={updateProgress?.fileName || ""}>
                      {updateProgress?.fileName || updateCheckResult?.asset?.name || "Đang tải…"}
                    </span>
                    <span className="update-progress-pct">
                      {Math.min(100, Math.round(updateProgress?.percent || 0))}%
                    </span>
                  </div>
                  <div
                    className="update-progress-track"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.min(100, Math.round(updateProgress?.percent || 0))}
                  >
                    <div
                      className="update-progress-fill"
                      style={{
                        width: `${Math.min(100, Math.max(0, updateProgress?.percent || 0))}%`,
                      }}
                    />
                  </div>
                  <div className="update-progress-stats">
                    <span>
                      {updateProgress?.receivedLabel ||
                        (updateProgress
                          ? `${(updateProgress.received / (1024 * 1024)).toFixed(1)} MB`
                          : "0 MB")}
                      {" / "}
                      {updateProgress?.totalLabel ||
                        (updateProgress?.total
                          ? `${(updateProgress.total / (1024 * 1024)).toFixed(1)} MB`
                          : "?")}
                    </span>
                    <span className="update-speed">
                      {updateProgress?.speedLabel || "—"}
                    </span>
                  </div>
                </div>
                <div className="actions">
                  <button
                    type="button"
                    className="ghost danger"
                    onClick={() => {
                      void window.grokApp.cancelUpdateDownload();
                      setUpdateModal(null);
                      setUpdateProgress(null);
                    }}
                  >
                    {t("update.cancel")}
                  </button>
                </div>
              </>
            )}

            {updateModal === "done" && (
              <>
                <p className="update-done-msg">
                  Đã tải xong
                  {updateProgress?.fileName ? (
                    <>
                      {" "}
                      <code>{updateProgress.fileName}</code>
                    </>
                  ) : null}
                  . Mở installer để cài và khởi động lại app.
                </p>
                <div className="actions">
                  <button type="button" className="ghost" onClick={() => setUpdateModal(null)}>
                    Đóng
                  </button>
                  {updateDownloadPath ? (
                    <>
                      <button
                        type="button"
                        className="ghost"
                        onClick={() =>
                          void window.grokApp.applyUpdate({
                            path: updateDownloadPath,
                            mode: "reveal",
                          })
                        }
                      >
                        Hiện trong folder
                      </button>
                      <button
                        type="button"
                        className="primary"
                        onClick={() =>
                          void window.grokApp.applyUpdate({
                            path: updateDownloadPath,
                            mode: "open",
                          })
                        }
                      >
                        Cài đặt ngay
                      </button>
                    </>
                  ) : null}
                </div>
              </>
            )}

            {updateModal === "info" && (
              <>
                <p className="update-done-msg">
                  {updateCheckResult?.message || "Không có bản cập nhật mới."}
                </p>
                <div className="update-meta-grid" style={{ marginBottom: 12 }}>
                  <div className="update-meta-row">
                    <span className="update-meta-label">Local</span>
                    <span>v{updateCheckResult?.currentVersion || appVersion?.version || "—"}</span>
                  </div>
                  {updateCheckResult?.latestVersion ? (
                    <div className="update-meta-row">
                      <span className="update-meta-label">GitHub</span>
                      <span>v{updateCheckResult.latestVersion}</span>
                    </div>
                  ) : null}
                </div>
                <div className="actions">
                  {updateCheckResult?.releaseUrl ? (
                    <button
                      type="button"
                      className="ghost"
                      onClick={() =>
                        void window.grokApp.openExternal(updateCheckResult.releaseUrl!)
                      }
                    >
                      Mở Releases
                    </button>
                  ) : null}
                  <button type="button" className="primary" onClick={() => setUpdateModal(null)}>
                    Đóng
                  </button>
                </div>
              </>
            )}

            {updateModal === "error" && (
              <>
                <p className="update-error-msg">
                  {updateError || updateCheckResult?.message || "Lỗi không xác định."}
                </p>
                <div className="actions">
                  {updateCheckResult?.releaseUrl ? (
                    <button
                      type="button"
                      className="ghost"
                      onClick={() =>
                        void window.grokApp.openExternal(updateCheckResult.releaseUrl!)
                      }
                    >
                      Mở Releases
                    </button>
                  ) : null}
                  <button type="button" className="primary" onClick={() => setUpdateModal(null)}>
                    Đóng
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {paletteOpen && (
        <div className="modal-backdrop" onClick={() => setPaletteOpen(false)}>
          <div className="modal palette" onClick={(e) => e.stopPropagation()}>
            <input
              autoFocus
              placeholder="Type a command…"
              value={paletteQ}
              onChange={(e) => {
                setPaletteQ(e.target.value);
                setPaletteIdx(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setPaletteIdx((i) => Math.min(filteredPalette.length - 1, i + 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setPaletteIdx((i) => Math.max(0, i - 1));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  const cmd = filteredPalette[paletteIdx];
                  if (cmd) {
                    setPaletteOpen(false);
                    cmd.run();
                  }
                }
              }}
            />
            <div className="palette-list">
              {filteredPalette.map((c, i) => (
                <button
                  key={c.id}
                  className={`palette-item ${i === paletteIdx ? "active" : ""}`}
                  onMouseEnter={() => setPaletteIdx(i)}
                  onClick={() => {
                    setPaletteOpen(false);
                    c.run();
                  }}
                >
                  <span>{c.label}</span>
                  {c.hint && <span className="k">{c.hint}</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {imageLightbox && (
        <div
          className="image-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={imageLightbox.name || "Xem ảnh"}
          onClick={closeImageLightbox}
          onWheel={(e) => {
            if (!e.ctrlKey && !e.metaKey) return;
            e.preventDefault();
            nudgeLightboxZoom(e.deltaY < 0 ? 15 : -15);
          }}
        >
          <div className="image-lightbox-chrome" onClick={(e) => e.stopPropagation()}>
            <div className="image-lightbox-top">
              <span className="image-lightbox-title" title={imageLightbox.name || ""}>
                {imageLightbox.name || "Ảnh"}
              </span>
              <button
                type="button"
                className="image-lightbox-close"
                aria-label="Đóng"
                title="Đóng (Esc)"
                onClick={closeImageLightbox}
              >
                ×
              </button>
            </div>
            <div
              className="image-lightbox-stage"
              onClick={closeImageLightbox}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setLightboxZoom((z) => (z === 100 ? 200 : 100));
              }}
            >
              <img
                src={imageLightbox.src}
                alt={imageLightbox.alt || imageLightbox.name || "image"}
                style={{
                  transform: `scale(${lightboxZoom / 100})`,
                }}
                draggable={false}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
            <div className="image-lightbox-toolbar">
              <button
                type="button"
                className="ghost"
                aria-label="Thu nhỏ"
                title="Thu nhỏ (−)"
                onClick={() => nudgeLightboxZoom(-25)}
                disabled={lightboxZoom <= 25}
              >
                −
              </button>
              <button
                type="button"
                className="image-lightbox-zoom-label ghost"
                title="Đặt lại 100% (0)"
                onClick={() => setLightboxZoom(100)}
              >
                {lightboxZoom}%
              </button>
              <button
                type="button"
                className="ghost"
                aria-label="Phóng to"
                title="Phóng to (+)"
                onClick={() => nudgeLightboxZoom(25)}
                disabled={lightboxZoom >= 400}
              >
                +
              </button>
            </div>
          </div>
        </div>
      )}
      </div>{/* .app */}
    </div>
  );
}
