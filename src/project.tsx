import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, setActiveProject, type Project } from "./api";

interface ProjectCtx {
  projectId: string;
  project: Project | null;
  projects: Project[];
  reloadProjects: () => Promise<void>;
}

const Ctx = createContext<ProjectCtx | null>(null);

/** アクティブプロジェクトの情報（/projects/:projectId 配下でのみ有効）。 */
export function useProject(): ProjectCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useProject must be used within ProjectProvider");
  return c;
}

/**
 * URL の :projectId をアクティブプロジェクトとして API に設定し、
 * 切替ドロップダウン用にプロジェクト一覧を提供する。
 * key={projectId} で再マウントされる前提（切替で子の再ロードを促す）。
 */
export function ProjectProvider({ projectId, children }: { projectId: string; children: ReactNode }) {
  // render 中に設定（子の effect（getTrip など）より前に確実に反映させる）。
  setActiveProject(projectId);

  const [projects, setProjects] = useState<Project[]>([]);
  const reloadProjects = useCallback(async () => {
    try {
      setProjects(await api.listProjects());
    } catch {
      /* 一覧取得失敗は致命的でない（本体は表示する） */
    }
  }, []);

  useEffect(() => {
    reloadProjects();
  }, [reloadProjects]);

  const project = projects.find((p) => p.id === projectId) ?? null;

  return <Ctx.Provider value={{ projectId, project, projects, reloadProjects }}>{children}</Ctx.Provider>;
}
