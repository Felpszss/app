import { getAppUser } from "../../../lib/auth";
import { MAX_PHOTO_BYTES, isAllowedPhotoType, newPhotoKey, putPhoto } from "../../../lib/photos";

export async function POST(request: Request) {
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Não autenticado." }, { status: 401 });

  const form = await request.formData();
  const file = form.get("photo");
  if (!(file instanceof File)) {
    return Response.json({ error: "Envie um arquivo de foto." }, { status: 400 });
  }
  if (!isAllowedPhotoType(file.type)) {
    return Response.json({ error: "Formato de imagem não suportado." }, { status: 400 });
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return Response.json({ error: "Foto acima do limite de 8 MB." }, { status: 400 });
  }

  const key = newPhotoKey(user.id, file.type);
  await putPhoto(key, await file.arrayBuffer(), file.type);

  return Response.json({ key, url: `/api/photos/${key}` }, { status: 201 });
}
