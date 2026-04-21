import { Form, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/settings-categories";
import { requireAuth } from "~/lib/session.server";
import {
  createCategory,
  deleteCategory,
  listCategories,
  renameCategory,
} from "~/lib/queries.server";
import { categorySchema } from "~/lib/validation";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { AppShell } from "~/components/app-shell";

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  return { categories: listCategories() };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent"));

  try {
    if (intent === "create") {
      const parsed = categorySchema.parse({ name: formData.get("name") });
      createCategory(parsed.name);
    } else if (intent === "rename") {
      const id = Number(formData.get("id"));
      const parsed = categorySchema.parse({ name: formData.get("name") });
      renameCategory(id, parsed.name);
    } else if (intent === "delete") {
      const id = Number(formData.get("id"));
      deleteCategory(id);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erreur";
    return { error: msg };
  }

  return redirect("/settings/categories");
}

export default function SettingsCategories() {
  const { categories } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <AppShell>
      <div className="page space-y-12">
        <header className="rise">
          <p className="eyebrow">Réglages</p>
          <h1 className="mt-2 font-heading text-4xl leading-tight text-ink">
            Catégories de dépenses
          </h1>
          <p className="mt-3 max-w-[56ch] text-ink-soft">
            Les étiquettes qu’on attache aux dépenses — loyer, électricité,
            courses, et ce que vous voudrez ajouter.
          </p>
        </header>

        {actionData?.error && (
          <p className="text-sm text-danger" role="alert">
            <span aria-hidden className="mr-2">—</span>
            {actionData.error}
          </p>
        )}

        <section aria-labelledby="add-cat-title" className="rise rise-1">
          <h2 id="add-cat-title" className="eyebrow mb-3">
            Ajouter une catégorie
          </h2>
          <Form
            method="post"
            className="grid grid-cols-1 items-end gap-5 sm:grid-cols-[1fr_auto]"
          >
            <input type="hidden" name="intent" value="create" />
            <div className="flex flex-col gap-1">
              <Label htmlFor="name">Nom</Label>
              <Input id="name" name="name" required />
            </div>
            <Button type="submit" variant="primary">
              Ajouter
            </Button>
          </Form>
        </section>

        <section aria-labelledby="cat-list-title" className="rise rise-2">
          <h2 id="cat-list-title" className="eyebrow mb-3">
            Toutes les catégories
          </h2>
          <ul className="divide-y divide-rule border-t border-rule-strong">
            {categories.map((c) => (
              <li
                key={c.id}
                className="grid grid-cols-[1fr_auto] items-center gap-x-6 py-4 sm:grid-cols-[1fr_auto_auto_auto]"
              >
                <Form
                  method="post"
                  className="contents"
                >
                  <input type="hidden" name="intent" value="rename" />
                  <input type="hidden" name="id" value={c.id} />
                  <Input
                    name="name"
                    defaultValue={c.name}
                    aria-label={`Nom de la catégorie ${c.name}`}
                  />
                  <Button type="submit" variant="outline" size="sm">
                    Renommer
                  </Button>
                </Form>
                <Badge variant={c.isDefault ? "outline" : "ghost"}>
                  {c.isDefault ? "Par défaut" : "Ajoutée"}
                </Badge>
                <div>
                  {!c.isDefault && (
                    <Form method="post">
                      <input type="hidden" name="intent" value="delete" />
                      <input type="hidden" name="id" value={c.id} />
                      <Button type="submit" variant="destructive" size="sm">
                        Supprimer
                      </Button>
                    </Form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
