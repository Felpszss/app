import { getAppUser } from "../../../../lib/auth";
import { getPhoto } from "../../../../lib/photos";

export async function GET(_request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const user = await getAppUser();
  if (!user) return new Response("Não autenticado.", { status: 401 });

  const { key: keyParts } = await params;
  const key = keyParts.join("/");
  const object = await getPhoto(key);
  if (!object) return new Response("Foto não encontrada.", { status: 404 });

  return new Response(object.body, {
    headers: {
      "content-type": object.httpMetadata?.contentType ?? "application/octet-stream",
      "cache-control": "private, max-age=31536000, immutable",
    },
  });
}
