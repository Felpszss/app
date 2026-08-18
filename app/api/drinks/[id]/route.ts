import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { drinks } from "../../../../db/schema";
import { getAppUser } from "../../../../lib/auth";
import { toRouteErrorMessage } from "../../../../lib/route-errors";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAppUser();
    if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });
    if (!user.isAdmin) return Response.json({ error: "Apenas administradores podem editar o catálogo." }, { status: 403 });

    const { id } = await params;
    const drinkId = Number(id);
    if (!drinkId) return Response.json({ error: "Bebida inválida." }, { status: 400 });

    const payload = (await request.json()) as {
      category?: string;
      icon?: string;
      name?: string;
      abv?: number;
      note?: string | null;
      active?: boolean;
    };

    const db = getDb();
    const [existing] = await db.select().from(drinks).where(eq(drinks.id, drinkId)).limit(1);
    if (!existing) return Response.json({ error: "Bebida não encontrada." }, { status: 404 });

    const update: Partial<typeof existing> = {};
    if (payload.category !== undefined) {
      const category = payload.category.trim();
      if (!category) return Response.json({ error: "Categoria não pode ser vazia." }, { status: 400 });
      update.category = category;
    }
    if (payload.icon !== undefined) {
      const icon = payload.icon.trim();
      if (!icon) return Response.json({ error: "Ícone não pode ser vazio." }, { status: 400 });
      update.icon = icon;
    }
    if (payload.name !== undefined) {
      const name = payload.name.trim();
      if (!name) return Response.json({ error: "Nome não pode ser vazio." }, { status: 400 });
      update.name = name;
    }
    if (payload.abv !== undefined) {
      if (typeof payload.abv !== "number" || payload.abv < 0 || payload.abv > 100) {
        return Response.json({ error: "Teor alcoólico deve ser um número entre 0 e 100." }, { status: 400 });
      }
      update.abv = payload.abv;
    }
    if (payload.note !== undefined) {
      update.note = payload.note?.trim() || null;
    }
    if (payload.active !== undefined) {
      update.active = payload.active ? 1 : 0;
    }

    const [drink] = await db.update(drinks).set(update).where(eq(drinks.id, drinkId)).returning();
    return Response.json({ drink });
  } catch (error) {
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}
