import { ArrowRight, Laptop, Server, Globe } from "lucide-react";
import type { ReactNode } from "react";

export type TunnelMappingPreview = {
  localPort: number;
  remoteHost: string;
  remotePort: number;
};

type Props = {
  kind: "Local" | "Dynamic";
  localAddress: string;
  localPort?: number;
  mappings?: TunnelMappingPreview[];
  serverLabel: string;
  className?: string;
};

function bindLabel(address: string, port: number) {
  if (!port) return "—";
  const host = address === "0.0.0.0" || address === "::" ? "*" : address;
  return `${host}:${port}`;
}

export function TunnelDiagram({ kind, localAddress, localPort, mappings, serverLabel, className = "" }: Props) {
  const localMaps = mappings?.filter((m) => m.localPort > 0) ?? [];

  return (
    <div
      className={`flex min-h-[14rem] flex-col overflow-y-auto rounded-xl border border-axion-border/80 bg-gradient-to-b from-axion-surface/40 to-axion-bg/80 p-4 sm:p-5 xl:h-full xl:min-h-0 ${className}`}
    >
      <p className="mb-4 text-[10px] font-semibold uppercase tracking-wide text-axion-text-muted">
        Traffic flow
      </p>
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
          <Node icon={<Laptop size={18} />} title="This PC" subtitle="Axion" />
          <Arrow />
          {kind === "Dynamic" ? (
            <Node
              icon={<Globe size={18} />}
              title="SOCKS5 bind"
              subtitle={bindLabel(localAddress, localPort ?? 0)}
              accent
            />
          ) : (
            <Node
              icon={<Globe size={18} />}
              title="Local binds"
              subtitle={localMaps.length > 1 ? `${localMaps.length} ports` : bindLabel(localAddress, localMaps[0]?.localPort ?? 0)}
              accent
            />
          )}
          <Arrow />
          <Node icon={<Server size={18} />} title="SSH server" subtitle={serverLabel || "Select session"} accent />
          {kind === "Local" && localMaps.length === 1 && localMaps[0].remoteHost ? (
            <>
              <Arrow />
              <Node
                icon={<Server size={18} />}
                title="Destination"
                subtitle={`${localMaps[0].remoteHost}:${localMaps[0].remotePort || "?"}`}
              />
            </>
          ) : kind === "Dynamic" ? (
            <>
              <Arrow />
              <Node icon={<Globe size={18} />} title="Internet" subtitle="via SSH" />
            </>
          ) : null}
        </div>

        {kind === "Local" && localMaps.length > 0 && (
          <ul className="w-full max-w-md space-y-1.5 rounded-lg border border-axion-border/60 bg-axion-bg/50 px-3 py-2 text-[10px] font-mono text-axion-text-secondary">
            {localMaps.map((m, i) => (
              <li key={`${m.localPort}-${i}`} className="flex items-center justify-between gap-2">
                <span className="text-axion-accent">{bindLabel(localAddress, m.localPort)}</span>
                <ArrowRight size={12} className="shrink-0 text-axion-text-muted" aria-hidden />
                <span className="truncate">
                  {m.remoteHost}:{m.remotePort || "?"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="mt-3 text-center text-[11px] leading-relaxed text-axion-text-muted">
        {kind === "Local"
          ? "Each local port on your PC is forwarded through the SSH session to a service on the server side."
          : "Point apps at the SOCKS5 port on your PC; traffic exits from the remote SSH host."}
      </p>
    </div>
  );
}

function Node({
  icon,
  title,
  subtitle,
  accent,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`flex min-w-[5.5rem] flex-col items-center rounded-lg border px-3 py-2 text-center ${
        accent ? "border-axion-accent/40 bg-axion-accent/10" : "border-axion-border bg-axion-surface"
      }`}
    >
      <span className={accent ? "text-axion-accent" : "text-axion-text-muted"}>{icon}</span>
      <span className="mt-1 text-[10px] font-medium text-axion-text">{title}</span>
      <span className="mt-0.5 max-w-[8rem] truncate text-[9px] text-axion-text-muted" title={subtitle}>
        {subtitle}
      </span>
    </div>
  );
}

function Arrow() {
  return <ArrowRight size={16} className="shrink-0 text-axion-text-muted/60" aria-hidden />;
}
