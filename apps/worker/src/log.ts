const ts = () => new Date().toISOString();

export const log = {
  info: (scope: string, msg: string) => console.log(`${ts()} [${scope}] ${msg}`),
  warn: (scope: string, msg: string) => console.warn(`${ts()} [${scope}] WARN ${msg}`),
  error: (scope: string, msg: string, err?: unknown) =>
    console.error(`${ts()} [${scope}] ERROR ${msg}${err ? ` :: ${(err as Error).stack ?? String(err)}` : ""}`),
};
