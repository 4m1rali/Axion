import {
  AUTH_METHOD_OPTIONS,
  ELEVATION_OPTIONS,
  type AuthMethod,
  type ElevationMode,
} from "../quickConnect";
import { tAuthMethod, tElevation } from "./helpers";
import type { MessageKey } from "./en";

export function localizedAuthOptions(t: (k: MessageKey) => string) {
  return AUTH_METHOD_OPTIONS.map((o) => ({
    value: o.value,
    label: tAuthMethod(o.value, t),
  }));
}

export function localizedElevationOptions(t: (k: MessageKey) => string) {
  return ELEVATION_OPTIONS.map((o) => ({
    value: o.value,
    label: tElevation(o.value, t),
  }));
}

export type { AuthMethod, ElevationMode };
