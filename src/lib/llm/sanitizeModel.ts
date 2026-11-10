const IM_START = /<\|im_start\|>\s*(?:system|user|assistant)?\s*/gi;
const IM_END = /<\|im_end\|>/gi;

const ECHO_TRANSCRIPT =
  /Commands run on server:\s*\n(?:[$] .+\n)+(?:\s*Output:\s*(?:\(empty[^\n]*\)|(?:[$] .+\n)*))?/gi;

/** Strip ChatML / role noise and echoed agent transcripts from model text. */
export function sanitizeModelOutput(raw: string): string {
  let text = raw.trim();
  if (!text) return text;

  text = text.replace(IM_START, "").replace(IM_END, "");
  text = text.replace(/^(?:system|user|assistant)\s*\n+/im, "");
  text = text.replace(ECHO_TRANSCRIPT, "").trim();

  // Sometimes the model returns multiple pseudo-turns in one completion.
  const parts = text.split(/<\|im_start\|>/i);
  if (parts.length > 1) {
    text = parts
      .map((p) => p.replace(/^assistant\s*\n?/i, "").replace(/<\|im_end\|>/gi, "").trim())
      .filter(Boolean)
      .join("\n\n");
  }

  return text.trim();
}
