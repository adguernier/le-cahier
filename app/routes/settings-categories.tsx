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
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";

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
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">Catégories</h1>
      {actionData?.error && (
        <p className="text-sm text-red-600">{actionData.error}</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Ajouter une catégorie</CardTitle>
        </CardHeader>
        <CardContent>
          <Form method="post" className="flex items-end gap-2">
            <input type="hidden" name="intent" value="create" />
            <div className="flex-1 space-y-1">
              <Label htmlFor="name">Nom</Label>
              <Input id="name" name="name" required />
            </div>
            <Button type="submit">Ajouter</Button>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Toutes les catégories</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Form method="post" className="flex gap-2">
                      <input type="hidden" name="intent" value="rename" />
                      <input type="hidden" name="id" value={c.id} />
                      <Input name="name" defaultValue={c.name} className="w-40" />
                      <Button type="submit" variant="outline" size="sm">
                        Renommer
                      </Button>
                    </Form>
                  </TableCell>
                  <TableCell>
                    {c.isDefault ? (
                      <Badge>Par défaut</Badge>
                    ) : (
                      <Badge variant="outline">Custom</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {c.isDefault ? null : (
                      <Form method="post">
                        <input type="hidden" name="intent" value="delete" />
                        <input type="hidden" name="id" value={c.id} />
                        <Button type="submit" variant="destructive" size="sm">
                          Supprimer
                        </Button>
                      </Form>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
