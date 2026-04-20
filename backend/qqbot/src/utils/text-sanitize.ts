/**
 * Remove model-private reasoning blocks before text leaves the QQ bridge.
 *
 * Some reasoning models emit <think>...</think> in their assistant text. The
 * web UI can decide how to render that, but QQ should only receive the public
 * answer. Dangling tags are treated as private text too so partial or malformed
 * output does not leak.
 */
export function sanitizeQQOutboundText(text: unknown): string {
  if (text == null) return "";

  let result = String(text);
  if (!result) return "";

  result = result
    .replace(/<think\b[^>]*\/>/gi, "")
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "")
    .replace(/<think\b[^>]*>[\s\S]*$/gi, "")
    .replace(/<\/think>/gi, "");

  return result
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
