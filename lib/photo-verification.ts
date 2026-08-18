import { env } from "cloudflare:workers";

// Cloudflare Workers AI image-classification model: small, fast, and good
// enough for a coarse "does this look like a drink" gate. This is not a
// substitute for real content moderation — just a cheap deterrent against
// check-ins with an obviously unrelated photo.
const MODEL = "@cf/microsoft/resnet-50";

const DRINK_LABEL_KEYWORDS = [
  "beer",
  "wine",
  "champagne",
  "cocktail",
  "goblet",
  "cup",
  "mug",
  "espresso",
  "eggnog",
  "mate",
  "bottle",
  "flute",
  "punch bowl",
  "pitcher",
  "barrel",
  "keg",
  "wine bottle",
  "red wine",
];

// Labels a photo can legitimately show that would otherwise trip the
// "confident + unrelated" rejection below (a beer can photographed next to
// a plate of food is still a valid check-in).
const CONFIDENCE_REJECT_THRESHOLD = 0.6;

export type PhotoVerification = { verified: true } | { verified: false; reason: string } | { verified: null };

type WorkersAI = { run: (model: string, input: Record<string, unknown>) => Promise<unknown> };

function getAiBinding(): WorkersAI | null {
  const bound = (env as { AI?: WorkersAI }).AI;
  return bound ?? null;
}

// Best-effort image classification for a check-in photo.
// - No AI binding configured, the call errors, or times out: skip silently
//   (`verified: null`) — this check is a bonus, never a hard requirement,
//   since not every deployment target is guaranteed to provision it.
// - The model is confident about a specific, clearly unrelated object:
//   reject (`verified: false`).
// - Anything else (a drink-ish label, or low confidence either way): let it
//   through (`verified: true` or `null`).
export async function verifyDrinkPhoto(imageBytes: ArrayBuffer): Promise<PhotoVerification> {
  const ai = getAiBinding();
  if (!ai) return { verified: null };

  try {
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000));
    const result = (await Promise.race([
      ai.run(MODEL, { image: [...new Uint8Array(imageBytes)] }),
      timeout,
    ])) as { label: string; score: number }[] | undefined;

    if (!Array.isArray(result) || result.length === 0) return { verified: null };

    const top = result[0];
    const looksLikeDrink = result
      .slice(0, 3)
      .some((r) => DRINK_LABEL_KEYWORDS.some((keyword) => r.label.toLowerCase().includes(keyword)));
    if (looksLikeDrink) return { verified: true };

    if (top.score > CONFIDENCE_REJECT_THRESHOLD) {
      return { verified: false, reason: `A foto parece mostrar "${top.label}", não uma bebida. Tire uma foto mostrando o copo, lata ou garrafa.` };
    }
    return { verified: null };
  } catch {
    return { verified: null };
  }
}
