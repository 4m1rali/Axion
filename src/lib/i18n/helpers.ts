import type { AuthMethod, ElevationMode } from "../quickConnect";
import type { MessageKey } from "./en";

export function tAuthMethod(method: AuthMethod, t: (k: MessageKey) => string): string {
  const map: Record<AuthMethod, MessageKey> = {
    none: "authNone",
    password: "authPassword",
    passwordKbdi: "authPasswordKbdi",
    passwordPlusKbdi: "authPasswordPlusKbdi",
    keyboardInteractive: "authKeyboardInteractive",
    publickey: "authPublickey",
    publickeyPassword: "authPublickeyPassword",
    publickeyKbdi: "authPublickeyKbdi",
    gssapiWithMic: "authGssapi",
  };
  return t(map[method]);
}

export function tElevation(mode: ElevationMode, t: (k: MessageKey) => string): string {
  const map: Record<ElevationMode, MessageKey> = {
    default: "elevDefault",
    yes: "elevYes",
    no: "elevNo",
  };
  return t(map[mode]);
}

/** Replace `{name}` / `{host}` / `{count}` placeholders. */
export function tFmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? ""));
}
