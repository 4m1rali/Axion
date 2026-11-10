import type { ConnectionProfile } from "./api";
import { authMethodForBackend, authMethodUsesPasswordCredential, type QuickConnectFields } from "./quickConnect";

export function connectHostLabel(host: string, port: number, username: string): string {
  return port === 22 ? `${username}@${host}` : `${username}@${host}:${port}`;
}

export function profileUsesPassword(profile: ConnectionProfile): boolean {
  return profile.authMethod === "password";
}

export function quickConnectUsesPassword(qc: QuickConnectFields): boolean {
  return authMethodUsesPasswordCredential(qc.authMethod);
}

export function isPasswordAuthError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("authentication failed") ||
    m.includes("password required") ||
    m.includes("missing password") ||
    m.includes("password auth")
  );
}

export function authMethodForConnect(profile: ConnectionProfile | undefined, qc: QuickConnectFields): string {
  if (profile) {
    return profile.authMethod === "publicKey" ? "publicKey" : "password";
  }
  return authMethodForBackend(qc.authMethod);
}

export function needsPasswordPrompt(
  profile: ConnectionProfile | undefined,
  qc: QuickConnectFields,
  password?: string,
): boolean {
  const uses = profile ? profileUsesPassword(profile) : quickConnectUsesPassword(qc);
  if (!uses) return false;
  if (password?.trim() || qc.password.trim()) return false;
  // Saved profiles may have a password in Credential Manager — try SSH first.
  if (profile?.id) return false;
  return true;
}
