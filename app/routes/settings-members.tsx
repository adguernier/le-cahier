import { Form, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/settings-members";
import { requireAuth } from "~/lib/session.server";
import {
  archiveMember,
  createMember,
  listActiveMembers,
  updateMember,
} from "~/lib/queries.server";
import { memberSchema } from "~/lib/validation";
import { formatEuros } from "~/lib/money";
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
  return { members: listActiveMembers() };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent"));

  if (intent === "create") {
    const parsed = memberSchema.safeParse({
      name: formData.get("name"),
      defaultCostOfLiving: formData.get("defaultCostOfLiving"),
    });
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    createMember(parsed.data);
    return redirect("/settings/members");
  }

  if (intent === "update") {
    const id = Number(formData.get("id"));
    const parsed = memberSchema.safeParse({
      name: formData.get("name"),
      defaultCostOfLiving: formData.get("defaultCostOfLiving"),
    });
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    updateMember(id, parsed.data);
    return redirect("/settings/members");
  }

  if (intent === "archive") {
    const id = Number(formData.get("id"));
    archiveMember(id);
    return redirect("/settings/members");
  }

  return { error: "Unknown intent" };
}

export default function SettingsMembers() {
  const { members } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">Membres du foyer</h1>
      {actionData?.error && (
        <p className="text-sm text-red-600">{actionData.error}</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Ajouter un membre</CardTitle>
        </CardHeader>
        <CardContent>
          <Form
            method="post"
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
          >
            <input type="hidden" name="intent" value="create" />
            <div className="flex-1 space-y-1">
              <Label htmlFor="name">Nom</Label>
              <Input id="name" name="name" required />
            </div>
            <div className="flex-1 space-y-1">
              <Label htmlFor="defaultCostOfLiving">Reste à vivre (€)</Label>
              <Input
                id="defaultCostOfLiving"
                name="defaultCostOfLiving"
                required
                defaultValue="800"
              />
            </div>
            <Button type="submit">Ajouter</Button>
          </Form>
        </CardContent>
      </Card>

      {members.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Membres actifs</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Reste à vivre</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <Form method="post" className="flex gap-2">
                        <input type="hidden" name="intent" value="update" />
                        <input type="hidden" name="id" value={m.id} />
                        <Input
                          name="name"
                          defaultValue={m.name}
                          className="w-32"
                        />
                        <Input
                          name="defaultCostOfLiving"
                          defaultValue={(m.defaultCostOfLiving / 100).toString()}
                          className="w-24"
                        />
                        <Button type="submit" variant="outline" size="sm">
                          OK
                        </Button>
                      </Form>
                    </TableCell>
                    <TableCell>{formatEuros(m.defaultCostOfLiving)}</TableCell>
                    <TableCell className="text-right">
                      <Form method="post">
                        <input type="hidden" name="intent" value="archive" />
                        <input type="hidden" name="id" value={m.id} />
                        <Button type="submit" variant="destructive" size="sm">
                          Archiver
                        </Button>
                      </Form>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
