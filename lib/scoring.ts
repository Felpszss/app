// Server-only rules for converting a check-in into stored, trustworthy data.
// The client never supplies ABV or points directly — both are derived here
// from the catalog entry and the raw amount/unit the user picked.

export const UNIT_TO_ML: Record<string, number> = {
  ml: 1,
  L: 1000,
  lata: 350,
  "long neck": 330,
  garrafa: 600,
  dose: 45,
  taça: 150,
  copo: 300,
};

const ETHANOL_DENSITY_G_PER_ML = 0.789;

// A single check-in above this is almost certainly a data-entry mistake or
// an attempt to game the ranking; reject rather than silently clamp.
export const MAX_SINGLE_AMOUNT_ML = 4000;

// Prevents rapid-fire check-ins from inflating a score.
export const MIN_CHECKIN_INTERVAL_MINUTES = 10;

// Points earned beyond this in a single day stop counting toward the
// ranking (the check-in is still saved, just capped for scoring purposes).
export const DAILY_POINT_CAP = 120;

// Rough "increasing risk" line (grams of pure alcohol/week) used only to
// surface a non-blocking wellbeing notice, not to restrict usage.
export const WEEKLY_RISK_THRESHOLD_G = 140;

export class CheckinValidationError extends Error {}

export function unitToMl(amountRaw: number, unitLabel: string): number {
  const factor = UNIT_TO_ML[unitLabel];
  if (!factor) {
    throw new CheckinValidationError(`Unidade desconhecida: ${unitLabel}`);
  }
  if (!Number.isFinite(amountRaw) || amountRaw <= 0) {
    throw new CheckinValidationError("Quantidade inválida.");
  }
  const ml = Math.round(amountRaw * factor);
  if (ml > MAX_SINGLE_AMOUNT_ML) {
    throw new CheckinValidationError(
      `Quantidade acima do limite permitido por check-in (${MAX_SINGLE_AMOUNT_ML} ml).`
    );
  }
  return ml;
}

// Standard-drink style formula: grams of pure alcohol = volume(ml) * abv% * density.
export function gramsOfAlcohol(amountMl: number, abvPercent: number): number {
  return amountMl * (abvPercent / 100) * ETHANOL_DENSITY_G_PER_ML;
}

export function pointsForGrams(grams: number): number {
  return Math.max(1, Math.round(grams));
}

// Applied when aggregating a single day's raw points for ranking purposes.
// Individual check-ins always keep their true, uncapped point value in
// storage; only the ranking total is capped per day.
export function capDailyPoints(dailyRawTotal: number): number {
  return Math.min(dailyRawTotal, DAILY_POINT_CAP);
}

// SQLite's CURRENT_TIMESTAMP yields "YYYY-MM-DD HH:MM:SS" in UTC with no
// timezone suffix; Date needs one to avoid parsing it as local time.
export function parseSqliteTimestamp(value: string): Date {
  return new Date(`${value.replace(" ", "T")}Z`);
}

// Inverse of parseSqliteTimestamp — formats a Date the same way SQLite's
// CURRENT_TIMESTAMP does, so stored values stay lexically comparable.
export function toSqliteTimestamp(date: Date): string {
  return date.toISOString().slice(0, 19).replace("T", " ");
}
