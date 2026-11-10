import type { ConnectionProfile } from "./api";
import { emptyTransportProxyDraft, transportProxyToDraft, type TransportProxyDraft } from "./transportProxy";

export type AuthMethod =
  | "none"
  | "password"
  | "passwordKbdi"
  | "passwordPlusKbdi"
  | "keyboardInteractive"
  | "publickey"
  | "publickeyPassword"
  | "publickeyKbdi"
  | "gssapiWithMic";

export type ElevationMode = "default" | "yes" | "no";

export type QuickConnectFields = {
  host: string;
  port: number;
  enableObfuscation: boolean;
  obfuscationKeyword: string;
  username: string;
  authMethod: AuthMethod;
  rememberPassword: boolean;
  password: string;
  passwordKbdiFallback: boolean;
  elevation: ElevationMode;
  kerberosSpn: string;
  kerberosGssKex: boolean;
  kerberosDelegation: boolean;
  kerberosGssapiKeyex: boolean;
  proxyJump: string;
  transportProxy: TransportProxyDraft;
};

export const AUTH_METHOD_OPTIONS: { value: AuthMethod; label: string }[] = [
  { value: "none", label: "none" },
  { value: "password", label: "password" },
  { value: "passwordKbdi", label: "password/kbdi" },
  { value: "passwordPlusKbdi", label: "password +kbdi" },
  { value: "keyboardInteractive", label: "keyboard-interactive" },
  { value: "publickey", label: "publickey" },
  { value: "publickeyPassword", label: "publickey +password" },
  { value: "publickeyKbdi", label: "publickey +kbdi" },
  { value: "gssapiWithMic", label: "gssapi-with-mic" },
];

export const ELEVATION_OPTIONS: { value: ElevationMode; label: string }[] = [
  { value: "default", label: "Default" },
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

export function authMethodForBackend(method: AuthMethod): string {
  if (method === "publickey" || method === "publickeyPassword" || method === "publickeyKbdi") {
    return "publicKey";
  }
  if (method === "gssapiWithMic") {
    return "gssapi-with-mic";
  }
  if (method === "none") {
    return "none";
  }
  return "password";
}

export function authMethodShowsPassword(method: AuthMethod): boolean {
  return !["none", "publickey", "gssapiWithMic"].includes(method);
}

export function authMethodShowsKbdiFallback(method: AuthMethod): boolean {
  return ["password", "passwordKbdi", "passwordPlusKbdi", "publickeyPassword"].includes(method);
}

export type AuthTab = "password" | "privateKey" | "sshAgent";

export function authTabFromMethod(method: AuthMethod): AuthTab {
  if (method === "publickey" || method === "publickeyPassword" || method === "publickeyKbdi") {
    return "privateKey";
  }
  if (method === "gssapiWithMic") {
    return "sshAgent";
  }
  return "password";
}

export function authMethodFromTab(tab: AuthTab, current: AuthMethod): AuthMethod {
  if (tab === "privateKey") {
    return current === "publickeyPassword" || current === "publickeyKbdi" ? current : "publickey";
  }
  if (tab === "sshAgent") {
    return "gssapiWithMic";
  }
  if (current === "publickey" || current === "gssapiWithMic" || current === "none") {
    return "password";
  }
  return current;
}

export function authMethodUsesPasswordCredential(method: AuthMethod): boolean {
  return [
    "password",
    "passwordKbdi",
    "passwordPlusKbdi",
    "keyboardInteractive",
    "publickeyPassword",
    "publickeyKbdi",
  ].includes(method);
}

export function emptyQuickConnectFields(): QuickConnectFields {
  return {
    host: "",
    port: 22,
    enableObfuscation: false,
    obfuscationKeyword: "",
    username: "root",
    authMethod: "password",
    rememberPassword: false,
    password: "",
    passwordKbdiFallback: false,
    elevation: "default",
    kerberosSpn: "",
    kerberosGssKex: false,
    kerberosDelegation: false,
    kerberosGssapiKeyex: false,
    proxyJump: "",
    transportProxy: emptyTransportProxyDraft(),
  };
}

export function quickConnectFromProfile(p: ConnectionProfile): QuickConnectFields {
  return {
    ...emptyQuickConnectFields(),
    host: p.host,
    port: p.port,
    username: p.username,
    authMethod: p.authMethod === "publicKey" ? "publickey" : "password",
    rememberPassword: p.rememberPassword,
    proxyJump: p.proxyJump ?? "",
    transportProxy: transportProxyToDraft(p.transportProxy),
  };
}
