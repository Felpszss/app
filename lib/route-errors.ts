// Mirrors examples/d1's error translation so a missing/un-migrated table
// produces an actionable message instead of a raw SQLite error.
export function toRouteErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Erro inesperado.";
  const detail = error instanceof Error && error.cause instanceof Error ? error.cause.message : "";
  const combined = `${message}\n${detail}`;

  if (combined.includes("no such table")) {
    return "O banco de dados ainda não foi inicializado. Rode `npm run db:generate`, aplique a migração e faça o deploy antes de usar esta funcionalidade.";
  }

  return message;
}
