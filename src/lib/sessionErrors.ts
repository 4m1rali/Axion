export function isSessionDeadError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("session is closed") ||
    m.includes("channel send error") ||
    m.includes("connection not found") ||
    m.includes("connectionnotfound")
  );
}
