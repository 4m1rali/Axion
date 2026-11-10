import { invoke } from "@tauri-apps/api/core";
import { Server } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { SessionPasswordDialog } from "../components/SessionPasswordDialog";
import {
  draftFromLiveConnection,
  draftFromProfile,
  emptyDraft,
  SftpConnectDialog,
  transportProxyForConnect,
  type SftpConnectDraft,
} from "../components/sftp/SftpConnectDialog";
import { Skeleton } from "../components/ui/Skeleton";
import { SftpPane } from "../components/sftp/SftpPane";
import { SftpTransferQueue } from "../components/sftp/SftpTransferQueue";
import type { SftpDragPayload } from "../lib/sftpDrag";
import {
  cancelTransfer,
  fileBaseName,
  runTransfer,
  type TransferTask,
} from "../lib/sftpTransfer";
import { connectSftp, type ConnectionProfile, type HostKeyInfo } from "../lib/api";
import type { SftpFileEntry } from "../lib/sftp";
import { useI18n } from "../lib/i18n";
import { isPasswordAuthError } from "../lib/connectAuth";
import { authMethodForBackend, authMethodUsesPasswordCredential } from "../lib/quickConnect";
import { waitForSshConnection } from "../lib/waitConnection";
import { joinChildPath, parentPath, pathSegments } from "../lib/sftpFormat";
import {
  SFTP_DEFAULT_REMOTE_PATH,
  readSavedRemotePath,
  writeSavedRemotePath,
} from "../lib/sftpRemotePathStore";
import { readSftpSessionLink, writeSftpSessionLink } from "../lib/sftpSessionLinkStore";
import { isSessionDeadError } from "../lib/sessionErrors";
import type { SftpMenuAction } from "../components/sftp/SftpContextMenu";
import { useSessionStore, type ConnectionRow } from "../stores/sessionStore";
import { useUiStore } from "../stores/uiStore";

type PathHistory = { back: string[]; forward: string[] };

function emptyHistory(): PathHistory {
  return { back: [], forward: [] };
}


export function SftpPage() {
  const { t } = useI18n();
  const connections = useSessionStore((s) => s.connections);
  const setConnections = useSessionStore((s) => s.setConnections);
  const setPage = useUiStore((s) => s.setPage);

  const [profiles, setProfiles] = useState<ConnectionProfile[]>([]);
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [remoteLabel, setRemoteLabel] = useState<string | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);
  const [connectDraft, setConnectDraft] = useState<SftpConnectDraft>(emptyDraft());
  const [sessionPrompt, setSessionPrompt] = useState<SftpConnectDraft | null>(null);
  const [sessionPassword, setSessionPassword] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [hostKey, setHostKey] = useState<{
    pendingId: string;
    prompt: HostKeyInfo;
    draft: SftpConnectDraft;
  } | null>(null);

  const [localPath, setLocalPath] = useState("");
  const [localEntries, setLocalEntries] = useState<SftpFileEntry[]>([]);
  const [localLoading, setLocalLoading] = useState(true);
  const [localError, setLocalError] = useState("");
  const [localFilter, setLocalFilter] = useState("");
  const [localHist, setLocalHist] = useState<PathHistory>(emptyHistory);

  const [remotePath, setRemotePath] = useState("/root");
  const [remoteEntries, setRemoteEntries] = useState<SftpFileEntry[]>([]);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState("");
  const [remoteFilter, setRemoteFilter] = useState("");
  const [remoteHist, setRemoteHist] = useState<PathHistory>(emptyHistory);
  const [transferTasks, setTransferTasks] = useState<TransferTask[]>([]);
  const recoveringRef = useRef(false);
  const lastAutoRecoverRef = useRef(0);

  const activeConn = connections.find((c) => c.id === connectionId);
  const transfersOn = Boolean(connectionId);

  const addTask = useCallback((task: TransferTask) => {
    setTransferTasks((prev) => {
      const dup = prev.some(
        (t) =>
          !t.done &&
          t.direction === task.direction &&
          t.localPath === task.localPath &&
          t.remotePath === task.remotePath,
      );
      if (dup) return prev;
      return [...prev, task];
    });
  }, []);

  const patchTask = useCallback((key: string, updater: (t: TransferTask) => TransferTask) => {
    setTransferTasks((prev) => prev.map((t) => (t.key === key ? updater(t) : t)));
  }, []);

  const refreshConnections = useCallback(async () => {
    const list = await invoke<ConnectionRow[]>("ssh_list_connections");
    setConnections(
      list.map((c) => ({
        id: c.id,
        host: c.host,
        port: c.port,
        username: c.username,
        connectedAt: c.connectedAt,
      })),
    );
    return list;
  }, [setConnections]);

  const loadProfiles = useCallback(async () => {
    const list = await invoke<ConnectionProfile[]>("profiles_list");
    setProfiles(list);
    return list;
  }, []);

  const loadLocal = useCallback(async (path: string) => {
    setLocalLoading(true);
    setLocalError("");
    try {
      const list = await invoke<SftpFileEntry[]>("sftp_list_local", { path });
      setLocalEntries(list);
      if (!path && list.length > 0) {
        const sample = list[0].path;
        const parent = sample.replace(/[/\\][^/\\]+$/, "");
        setLocalPath(parent || path);
      } else {
        setLocalPath(path);
      }
    } catch (e) {
      setLocalError(String(e));
    } finally {
      setLocalLoading(false);
    }
  }, []);

  const recoverRemoteSession = useCallback(async (): Promise<boolean> => {
    if (recoveringRef.current) return false;
    recoveringRef.current = true;
    setConnecting(true);
    setRemoteError("");
    const path =
      remotePath ||
      (connectionId ? readSavedRemotePath(connectionId) : SFTP_DEFAULT_REMOTE_PATH);
    try {
      const saved = readSftpSessionLink();
      const host = activeConn?.host ?? saved?.host;
      const port = activeConn?.port ?? saved?.port ?? 22;
      const username = activeConn?.username ?? saved?.username;
      if (!host || !username) {
        setRemoteError("SSH session closed — pick a saved host to reconnect.");
        return false;
      }

      const profile =
        profiles.find((p) => p.id && p.id === saved?.profileId) ??
        profiles.find((p) => p.host === host && p.port === port && p.username === username);

      const meta = {
        host,
        port,
        username,
        profileId: profile?.id || saved?.profileId,
      };

      const tryId = async (connId: string) => {
        await invoke("sftp_attach", { connectionId: connId });
        const list = await invoke<SftpFileEntry[]>("sftp_list_remote", {
          connectionId: connId,
          path,
        });
        writeSftpSessionLink({ connectionId: connId, ...meta });
        setConnectionId(connId);
        setRemoteLabel(`${username}@${host}${port !== 22 ? `:${port}` : ""}`);
        setRemoteEntries(list);
        setRemotePath(path);
        writeSavedRemotePath(connId, path);
        setRemoteError("");
        await refreshConnections();
        return true;
      };

      if (connectionId) {
        const stillLive = connections.some((c) => c.id === connectionId);
        if (stillLive) {
          try {
            return await tryId(connectionId);
          } catch (e) {
            if (!isSessionDeadError(String(e))) throw e;
          }
        }
      }

      const list = await refreshConnections();
      const live = list.find((c) => c.host === host && c.port === port && c.username === username);
      if (live) {
        try {
          return await tryId(live.id);
        } catch (e) {
          if (!isSessionDeadError(String(e))) throw e;
        }
      }

      if (!profile) {
        setRemoteError(
          "SSH session closed — add a matching saved host (with stored password/key) to auto-reconnect.",
        );
        return false;
      }

      const draft = draftFromProfile(profile);
      const outcome = await connectSftp({
        profileId: draft.profileId || undefined,
        host: draft.host,
        port: draft.port,
        username: draft.username,
        authMethod: authMethodForBackend(draft.authMethod),
        password: draft.password.trim() || undefined,
        rememberPassword: draft.rememberPassword,
        keyRef: draft.keyRef,
        proxyJump: draft.proxyJump.trim() || undefined,
        transportProxy: transportProxyForConnect(draft),
      });

      if (outcome.kind === "hostKey") {
        setHostKey({ pendingId: outcome.pendingId, prompt: outcome.prompt, draft });
        setRemoteError("Confirm host key to reconnect.");
        return false;
      }

      return await tryId(outcome.connectionId);
    } catch (e) {
      setRemoteError(String(e));
      return false;
    } finally {
      setConnecting(false);
      recoveringRef.current = false;
    }
  }, [activeConn, connectionId, connections, profiles, refreshConnections, remotePath]);

  const loadRemote = useCallback(
    async (path: string) => {
      if (!connectionId) return;
      setRemoteLoading(true);
      setRemoteError("");
      try {
        const list = await invoke<SftpFileEntry[]>("sftp_list_remote", {
          connectionId,
          path,
        });
        setRemoteEntries(list);
        setRemotePath(path);
        writeSavedRemotePath(connectionId, path);
      } catch (e) {
        const msg = String(e);
        if (isSessionDeadError(msg)) {
          const ok = await recoverRemoteSession();
          if (ok) return;
        }
        setRemoteError(msg);
      } finally {
        setRemoteLoading(false);
      }
    },
    [connectionId, recoverRemoteSession],
  );

  useEffect(() => {
    if (!remoteError || connecting) return;
    if (!isSessionDeadError(remoteError)) return;
    const now = Date.now();
    if (now - lastAutoRecoverRef.current < 4000) return;
    lastAutoRecoverRef.current = now;
    void recoverRemoteSession();
  }, [remoteError, connecting, recoverRemoteSession]);

  const queueUpload = useCallback(
    (localFilePath: string, remoteFilePath: string, fileName: string) => {
      if (!connectionId) return;
      const { promise } = runTransfer(
        "upload",
        connectionId,
        localFilePath,
        remoteFilePath,
        fileName,
        addTask,
        patchTask,
      );
      void promise.finally(() => void loadRemote(remotePath));
    },
    [connectionId, addTask, patchTask, loadRemote, remotePath],
  );

  const queueDownload = useCallback(
    (remoteFilePath: string, localFilePath: string, fileName: string) => {
      if (!connectionId) return;
      const { promise } = runTransfer(
        "download",
        connectionId,
        localFilePath,
        remoteFilePath,
        fileName,
        addTask,
        patchTask,
      );
      void promise.finally(() => void loadLocal(localPath));
    },
    [connectionId, addTask, patchTask, loadLocal, localPath],
  );

  useEffect(() => {
    if (!connectionId || !transfersOn) return;
    let unlisten: (() => void) | undefined;
    void getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type !== "drop") return;
        const seen = new Set<string>();
        for (const p of event.payload.paths) {
          if (seen.has(p)) continue;
          seen.add(p);
          const name = fileBaseName(p);
          queueUpload(p, joinChildPath(remotePath, name, true), name);
        }
      })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => undefined);
    return () => unlisten?.();
  }, [connectionId, transfersOn, queueUpload, remotePath]);

  useEffect(() => {
    void loadProfiles();
    void refreshConnections();
    void loadLocal("");
  }, [loadLocal, loadProfiles, refreshConnections]);

  useEffect(() => {
    if (!connectionId) return;
    const path = readSavedRemotePath(connectionId);
    setRemotePath(path);
    void loadRemote(path);
  }, [connectionId, loadRemote]);


  const attachExistingSession = async (conn: ConnectionRow) => {
    const label = `${conn.username}@${conn.host}${conn.port !== 22 ? `:${conn.port}` : ""}`;
    setConnecting(true);
    setRemoteError("");
    try {
      await invoke("sftp_attach", { connectionId: conn.id });
      await beginSftpSession(conn.id, label, {
        host: conn.host,
        port: conn.port,
        username: conn.username,
        profileId: profiles.find(
          (p) => p.host === conn.host && p.port === conn.port && p.username === conn.username,
        )?.id,
      });
    } catch (e) {
      const msg = String(e);
      if (isSessionDeadError(msg)) {
        const ok = await recoverRemoteSession();
        if (!ok) setRemoteError(msg);
      } else {
        setRemoteError(msg);
      }
      if (isSessionDeadError(msg)) {
        await refreshConnections();
      }
    } finally {
      setConnecting(false);
    }
  };

  const beginSftpSession = async (
    id: string,
    label: string,
    link?: { host: string; port: number; username: string; profileId?: string },
  ) => {
    setConnectionId(id);
    setRemoteLabel(label);
    setRemoteHist(emptyHistory());
    setConnectOpen(false);
    setSessionPrompt(null);
    setSessionPassword("");
    if (link) {
      writeSftpSessionLink({ connectionId: id, ...link });
    }
    await refreshConnections();
  };

  const runConnect = async (draft: SftpConnectDraft) => {
    setConnecting(true);
    setRemoteError("");
    const label = draft.label || `${draft.username}@${draft.host}`;
    try {
      if (draft.existingConnectionId) {
        await invoke("sftp_attach", { connectionId: draft.existingConnectionId });
        await beginSftpSession(draft.existingConnectionId, label, {
          host: draft.host,
          port: draft.port,
          username: draft.username,
          profileId: draft.profileId || undefined,
        });
        return;
      }

      const list = await refreshConnections();
      const existing = list.find(
        (c) => c.host === draft.host && c.port === draft.port && c.username === draft.username,
      );

      if (existing) {
        await invoke("sftp_attach", { connectionId: existing.id });
        await beginSftpSession(existing.id, label, {
          host: draft.host,
          port: draft.port,
          username: draft.username,
          profileId: draft.profileId || undefined,
        });
        return;
      }

      const outcome = await connectSftp({
        profileId: draft.profileId || undefined,
        host: draft.host,
        port: draft.port,
        username: draft.username,
        authMethod: authMethodForBackend(draft.authMethod),
        password: draft.password.trim() || undefined,
        rememberPassword: draft.rememberPassword && !!draft.password.trim(),
        keyRef: draft.keyRef,
        proxyJump: draft.proxyJump.trim() || undefined,
        transportProxy: transportProxyForConnect(draft),
      });

      if (outcome.kind === "hostKey") {
        setHostKey({ pendingId: outcome.pendingId, prompt: outcome.prompt, draft });
        return;
      }

      await beginSftpSession(outcome.connectionId, label, {
        host: draft.host,
        port: draft.port,
        username: draft.username,
        profileId: draft.profileId || undefined,
      });
    } catch (e) {
      const msg = String(e);
      if (authMethodUsesPasswordCredential(draft.authMethod) && isPasswordAuthError(msg)) {
        setSessionPrompt(draft);
        setSessionPassword("");
      } else {
        setRemoteError(msg);
      }
    } finally {
      setConnecting(false);
    }
  };

  const requestConnect = (draft: SftpConnectDraft) => {
    if (authMethodUsesPasswordCredential(draft.authMethod) && !draft.password.trim()) {
      if (!draft.profileId) {
        setSessionPrompt(draft);
        setSessionPassword("");
        return;
      }
    }
    void runConnect(draft);
  };

  const submitSessionPassword = () => {
    if (!sessionPrompt || !sessionPassword.trim()) return;
    const draft: SftpConnectDraft = {
      ...sessionPrompt,
      password: sessionPassword,
      rememberPassword: false,
    };
    void runConnect(draft);
  };

  const resolveHostKey = async (accept: boolean) => {
    if (!hostKey) return;
    const { draft } = hostKey;
    const label = draft.label || `${draft.username}@${draft.host}`;
    try {
      setConnecting(true);
      await invoke("ssh_resolve_host_key", { pendingId: hostKey.pendingId, accept });
      if (!accept) {
        setRemoteError("Host key rejected");
        return;
      }
      const id = await waitForSshConnection(draft.host, draft.port, draft.username);
      await invoke("sftp_attach", { connectionId: id });
      await beginSftpSession(id, label, {
        host: draft.host,
        port: draft.port,
        username: draft.username,
        profileId: draft.profileId || undefined,
      });
    } catch (e) {
      setRemoteError(String(e));
    } finally {
      setConnecting(false);
      setHostKey(null);
    }
  };

  const openConnectDialog = () => {
    const initial =
      connections.length > 0
        ? draftFromLiveConnection(connections[0])
        : profiles[0]
          ? draftFromProfile(profiles[0])
          : emptyDraft();
    setConnectDraft(initial);
    setConnectOpen(true);
  };

  const navigateLocal = (next: string, pushHistory = true) => {
    if (pushHistory && localPath !== next) {
      setLocalHist((h) => ({ back: [...h.back, localPath], forward: [] }));
    }
    void loadLocal(next);
  };

  const navigateRemote = (next: string, pushHistory = true) => {
    if (!connectionId) return;
    if (pushHistory && remotePath !== next) {
      setRemoteHist((h) => ({ back: [...h.back, remotePath], forward: [] }));
    }
    void loadRemote(next);
  };

  const localBack = () => {
    const h = localHist.back;
    if (h.length) {
      const prev = h[h.length - 1];
      setLocalHist({ back: h.slice(0, -1), forward: [localPath, ...localHist.forward] });
      void loadLocal(prev);
      return;
    }
    const parent = parentPath(localPath, false);
    if (parent != null) navigateLocal(parent);
  };

  const localForward = () => {
    const h = localHist.forward;
    if (!h.length) return;
    const next = h[0];
    setLocalHist({ back: [...localHist.back, localPath], forward: h.slice(1) });
    void loadLocal(next);
  };

  const remoteBack = () => {
    const h = remoteHist.back;
    if (h.length) {
      const prev = h[h.length - 1];
      setRemoteHist({ back: h.slice(0, -1), forward: [remotePath, ...remoteHist.forward] });
      void loadRemote(prev);
      return;
    }
    const parent = parentPath(remotePath, true);
    if (parent != null) navigateRemote(parent);
  };

  const remoteForward = () => {
    const h = remoteHist.forward;
    if (!h.length) return;
    const next = h[0];
    setRemoteHist({ back: [...remoteHist.back, remotePath], forward: h.slice(1) });
    void loadRemote(next);
  };

  const buildLocalBreadcrumb = (index: number) => {
    const parts = pathSegments(localPath, false);
    if (index < 0) {
      void loadLocal("");
      return;
    }
    const isWin = localPath.includes("\\");
    const sep = isWin ? "\\" : "/";
    const next = parts.slice(0, index + 1).join(sep);
    navigateLocal(next);
  };

  const buildRemoteBreadcrumb = (index: number) => {
    if (index < 0) {
      navigateRemote("/");
      return;
    }
    const parts = pathSegments(remotePath, true).filter((p) => p !== "/");
    const next = `/${parts.slice(0, index + 1).join("/")}`;
    navigateRemote(next);
  };

  const remoteTitle =
    activeConn != null
      ? `${activeConn.username}@${activeConn.host} · SSH SFTP`
      : remoteLabel ?? t("sftpRemotePane");

  const promptName = (label: string) => {
    const v = window.prompt(label);
    if (!v?.trim()) return null;
    return v.trim().replace(/[/\\]/g, "");
  };

  const handleLocalFileAction = async (action: SftpMenuAction, entry?: SftpFileEntry) => {
    try {
      switch (action) {
        case "refresh":
          await loadLocal(localPath);
          break;
        case "new-folder": {
          const name = promptName("New folder name");
          if (!name) return;
          await invoke("sftp_mkdir_local", { path: joinChildPath(localPath, name, false) });
          await loadLocal(localPath);
          break;
        }
        case "new-file": {
          const name = promptName("New file name");
          if (!name) return;
          await invoke("sftp_create_file_local", { path: joinChildPath(localPath, name, false) });
          await loadLocal(localPath);
          break;
        }
        case "open":
          if (entry?.isDir) navigateLocal(entry.path);
          break;
        case "upload":
          if (entry && !entry.isDir && connectionId) {
            queueUpload(
              entry.path,
              joinChildPath(remotePath, entry.name, true),
              entry.name,
            );
          }
          break;
        case "download":
          break;
        case "rename": {
          if (!entry) return;
          const name = promptName(`Rename "${entry.name}" to`);
          if (!name) return;
          const parent = parentPath(entry.path, false) ?? localPath;
          const to = joinChildPath(parent, name, false);
          await invoke("sftp_rename_local", { from: entry.path, to });
          await loadLocal(localPath);
          break;
        }
        case "delete": {
          if (!entry) return;
          if (!window.confirm(`Delete ${entry.name}?`)) return;
          await invoke("sftp_delete_local", { path: entry.path, isDir: entry.isDir });
          await loadLocal(localPath);
          break;
        }
      }
    } catch (e) {
      setLocalError(String(e));
    }
  };

  const handleRemoteFileAction = async (action: SftpMenuAction, entry?: SftpFileEntry) => {
    if (!connectionId) return;
    try {
      switch (action) {
        case "refresh":
          await loadRemote(remotePath);
          break;
        case "new-folder": {
          const name = promptName("New folder name");
          if (!name) return;
          await invoke("sftp_mkdir", {
            connectionId,
            path: joinChildPath(remotePath, name, true),
          });
          await loadRemote(remotePath);
          break;
        }
        case "new-file": {
          const name = promptName("New file name");
          if (!name) return;
          await invoke("sftp_create_file", {
            connectionId,
            path: joinChildPath(remotePath, name, true),
          });
          await loadRemote(remotePath);
          break;
        }
        case "open":
          if (entry?.isDir) navigateRemote(entry.path);
          break;
        case "download":
          if (entry && !entry.isDir) {
            queueDownload(
              entry.path,
              joinChildPath(localPath, entry.name, false),
              entry.name,
            );
          }
          break;
        case "upload":
          break;
        case "rename": {
          if (!entry) return;
          const name = promptName(`Rename "${entry.name}" to`);
          if (!name) return;
          const parent = parentPath(entry.path, true) ?? "/";
          const to = joinChildPath(parent, name, true);
          await invoke("sftp_rename", { connectionId, from: entry.path, to });
          await loadRemote(remotePath);
          break;
        }
        case "delete": {
          if (!entry) return;
          if (!window.confirm(`Delete ${entry.name}?`)) return;
          await invoke("sftp_delete", {
            connectionId,
            path: entry.path,
            isDir: entry.isDir,
          });
          await loadRemote(remotePath);
          break;
        }
      }
    } catch (e) {
      setRemoteError(String(e));
    }
  };

  const handleDropOnLocal = (payload: SftpDragPayload) => {
    if (payload.side === "remote") {
      queueDownload(payload.path, joinChildPath(localPath, payload.name, false), payload.name);
    }
  };

  const handleDropOnRemote = (payload: SftpDragPayload) => {
    if (payload.side === "local") {
      queueUpload(payload.path, joinChildPath(remotePath, payload.name, true), payload.name);
    }
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 overflow-hidden">
      <SftpPane
        title={t("sftpLocalPane")}
        path={localPath}
        remote={false}
        entries={localEntries}
        loading={localLoading}
        error={localError}
        filter={localFilter}
        onFilterChange={setLocalFilter}
        canBack={localHist.back.length > 0 || parentPath(localPath, false) != null}
        canForward={localHist.forward.length > 0}
        onBack={localBack}
        onForward={localForward}
        onBreadcrumb={buildLocalBreadcrumb}
        onOpenEntry={(e) => {
          if (e.isDir) navigateLocal(e.path);
        }}
        onFileAction={(a, e) => void handleLocalFileAction(a, e)}
        fileActionsEnabled={!localLoading}
        transfersEnabled={transfersOn}
        onTransferDrop={handleDropOnLocal}
      />

      <div className="w-px shrink-0 bg-axion-border/40" />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <SftpPane
        title={remoteTitle}
        path={remotePath}
        remote
        entries={connectionId ? remoteEntries : []}
        loading={remoteLoading || connecting}
        error={remoteError || undefined}
        filter={remoteFilter}
        onFilterChange={setRemoteFilter}
        canBack={!!connectionId && (remoteHist.back.length > 0 || parentPath(remotePath, true) != null)}
        canForward={!!connectionId && remoteHist.forward.length > 0}
        onBack={remoteBack}
        onForward={remoteForward}
        onBreadcrumb={buildRemoteBreadcrumb}
        onOpenEntry={(e) => {
          if (e.isDir) navigateRemote(e.path);
        }}
        onFileAction={(a, e) => void handleRemoteFileAction(a, e)}
        fileActionsEnabled={!!connectionId && !connecting}
        transfersEnabled={transfersOn && !connecting}
        onTransferDrop={handleDropOnRemote}
        emptyOverlay={
          !connectionId ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-axion-bg/90 px-6 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-axion-border bg-axion-surface">
                <Server size={28} className="text-axion-text-muted" />
              </div>
              <h2 className="text-lg font-semibold text-axion-text">SFTP</h2>
              {connecting && (
                <div className="mt-4 flex w-full max-w-xs flex-col gap-2" aria-busy aria-label="Opening SFTP">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="mx-auto h-3 w-4/5" />
                  <Skeleton className="mx-auto h-8 w-32 rounded-lg" />
                </div>
              )}
              {remoteError && !connecting && (
                <p className="mt-2 max-w-sm text-sm text-axion-error">{remoteError}</p>
              )}
              {!connecting && connections.length > 0 ? (
                <>
                  <p className="mt-2 max-w-sm text-sm text-axion-text-secondary">
                    SSH is connected — open SFTP on the same session:
                  </p>
                  <ul className="mt-4 flex w-full max-w-sm flex-col gap-2">
                    {connections.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => void attachExistingSession(c)}
                          className="w-full rounded-xl border border-axion-accent/40 bg-axion-surface px-4 py-3 text-left text-sm transition hover:bg-axion-hover"
                        >
                          <span className="font-medium text-axion-text">
                            {c.username}@{c.host}
                            {c.port !== 22 ? `:${c.port}` : ""}
                          </span>
                          <span className="mt-0.5 block text-xs text-axion-accent">Connected — tap for SFTP</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : !connecting && profiles.length > 0 ? (
                <>
                  <p className="mt-2 max-w-sm text-sm text-axion-text-secondary">
                    Saved hosts you added — connect SFTP or SSH from Dashboard first:
                  </p>
                  <ul className="mt-4 flex w-full max-w-sm flex-col gap-2">
                    {profiles.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => requestConnect(draftFromProfile(p))}
                          className="w-full rounded-xl border border-axion-border bg-axion-surface px-4 py-3 text-left text-sm transition hover:bg-axion-hover"
                        >
                          <span className="font-medium text-axion-text">
                            {p.name || `${p.username}@${p.host}`}
                          </span>
                          <span className="mt-0.5 block text-xs text-axion-text-muted">
                            Saved host — {p.username}@{p.host}
                            {p.port !== 22 ? `:${p.port}` : ""}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : !connecting ? (
                <p className="mt-2 max-w-sm text-sm text-axion-text-muted">
                  Connect via Dashboard/Terminal first, or add a saved host in Connections.
                </p>
              ) : null}
              {!connecting && (
              <button
                type="button"
                onClick={openConnectDialog}
                className="mt-6 rounded-xl border border-axion-border bg-axion-surface px-5 py-2.5 text-sm font-medium text-axion-text transition hover:bg-axion-hover"
              >
                {connections.length > 0 || profiles.length > 0 ? "All connections…" : "Select connection"}
              </button>
              )}
              {profiles.length === 0 && connections.length === 0 && (
                <button
                  type="button"
                  onClick={() => setPage("connections")}
                  className="mt-3 text-sm text-axion-accent hover:underline"
                >
                  Add a saved host
                </button>
              )}
            </div>
          ) : null
        }
      />
      <SftpTransferQueue
        tasks={transferTasks}
        onCancel={(t) => {
          if (t.backendId) void cancelTransfer(t.backendId);
        }}
        onDismiss={(key) => setTransferTasks((prev) => prev.filter((x) => x.key !== key))}
      />
      </div>
      </div>

      <SftpConnectDialog
        open={connectOpen}
        profiles={profiles}
        liveConnections={connections}
        draft={connectDraft}
        onDraftChange={setConnectDraft}
        connecting={connecting}
        onCancel={() => setConnectOpen(false)}
        onConnect={() => requestConnect(connectDraft)}
      />

      {sessionPrompt && (
        <SessionPasswordDialog
          hostLabel={`${sessionPrompt.username}@${sessionPrompt.host}`}
          password={sessionPassword}
          onPasswordChange={setSessionPassword}
          connecting={connecting}
          onCancel={() => {
            setSessionPrompt(null);
            setSessionPassword("");
          }}
          onSubmit={submitSessionPassword}
        />
      )}

      {hostKey && (
        <HostKeyModal
          prompt={hostKey.prompt}
          onAccept={() => void resolveHostKey(true)}
          onReject={() => void resolveHostKey(false)}
        />
      )}
    </div>
  );
}

function HostKeyModal({
  prompt,
  onAccept,
  onReject,
}: {
  prompt: HostKeyInfo;
  onAccept: () => void;
  onReject: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onReject}
    >
      <div
        role="alertdialog"
        className="w-full max-w-md rounded-xl border border-axion-border bg-axion-elevated p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-axion-warning">Verify host key</h3>
        <p className="mt-2 text-sm text-axion-text-secondary">
          {prompt.host}:{prompt.port} — {prompt.trustState}
        </p>
        <p className="mt-2 font-mono text-xs text-axion-text">{prompt.fingerprintSha256}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onReject} className="rounded-lg px-3 py-2 text-sm text-axion-text-secondary">
            Reject
          </button>
          <button type="button" onClick={onAccept} className="rounded-lg bg-axion-accent px-3 py-2 text-sm font-medium text-black">
            Trust and continue
          </button>
        </div>
      </div>
    </div>
  );
}
