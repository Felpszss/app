// Lightweight, dependency-free text moderation for check-in titles/descriptions.
// Not a substitute for a real moderation pipeline, but stops the obvious cases
// (hate speech, incitement to dangerous drinking) from reaching the feed.

const BLOCKED_TERMS = [
  "beber até morrer",
  "beber até desmaiar",
  "coma até apagar",
  "matar de beber",
  "overdose de álcool",
];

export function moderateText(...parts: (string | null | undefined)[]): {
  flagged: boolean;
  reason?: string;
} {
  const text = parts.filter(Boolean).join(" ").toLowerCase();
  for (const term of BLOCKED_TERMS) {
    if (text.includes(term)) {
      return { flagged: true, reason: "Incentivo a consumo perigoso." };
    }
  }
  return { flagged: false };
}

export const RESPONSIBLE_DRINKING_NOTICE =
  "Beba com responsabilidade. Se o consumo estiver te preocupando, procure apoio: CVV 188 (24h, gratuito).";
