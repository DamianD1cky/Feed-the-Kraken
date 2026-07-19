const ENABLED_VALUES = new Set(["1", "true", "yes", "on"]);

export const gameDebugEnabled = ENABLED_VALUES.has(
  (process.env.FTK_DEBUG ?? "").trim().toLowerCase(),
);

export function gameDebugLog(
  scope: string,
  message: string,
  details?: Record<string, unknown>,
) {
  if (!gameDebugEnabled) return;
  const prefix = `[FTK DEBUG][${scope}] ${message}`;
  if (details) {
    console.log(prefix, details);
  } else {
    console.log(prefix);
  }
}
