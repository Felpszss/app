import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { users } from "../../../../db/schema";
import { getAppUser } from "../../../../lib/auth";
import { toRouteErrorMessage } from "../../../../lib/route-errors";

// Self-declared age confirmation, not identity verification. It exists to
// put a deliberate "I am 18+" acknowledgment in front of anyone before they
// can see alcohol-related content, matching how most drink-related apps and
// sites handle this — it is not a substitute for real age verification.
export async function POST(request: Request) {
  try {
    const user = await getAppUser();
    if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });

    const payload = (await request.json().catch(() => ({}))) as { confirmed?: boolean };
    if (payload.confirmed !== true) {
      return Response.json({ error: "Confirmação obrigatória." }, { status: 400 });
    }

    const db = getDb();
    await db.update(users).set({ ageConfirmed: 1 }).where(eq(users.id, user.id));

    return Response.json({ user: { ...user, ageConfirmed: true } });
  } catch (error) {
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}
