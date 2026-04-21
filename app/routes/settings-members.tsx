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
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { AppShell } from "~/components/app-shell";

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
    <AppShell>
      <div className="page space-y-12">
        <header className="rise">
          <p className="eyebrow">Réglages</p>
          <h1 className="mt-2 font-heading text-4xl leading-tight text-ink">
            Membres du foyer
          </h1>
          <p className="mt-3 max-w-[56ch] text-ink-soft">
            Les adultes qui partagent les charges. Chacun a un reste à vivre
            par défaut — la somme qu’on lui retire avant de calculer sa part
            selon la méthode « après reste à vivre ».
          </p>
        </header>

        {actionData?.error && (
          <p className="text-sm text-danger" role="alert">
            <span aria-hidden className="mr-2">—</span>
            {actionData.error}
          </p>
        )}

        <section aria-labelledby="add-member-title" className="rise rise-1">
          <h2 id="add-member-title" className="eyebrow mb-3">
            Ajouter un membre
          </h2>
          <Form
            method="post"
            className="grid grid-cols-1 items-end gap-5 sm:grid-cols-[1fr_1fr_auto]"
          >
            <input type="hidden" name="intent" value="create" />
            <div className="flex flex-col gap-1">
              <Label htmlFor="name">Nom</Label>
              <Input id="name" name="name" required />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="defaultCostOfLiving">
                Reste à vivre par défaut (€)
              </Label>
              <Input
                id="defaultCostOfLiving"
                name="defaultCostOfLiving"
                required
                defaultValue="800"
                inputMode="decimal"
                className="num"
              />
            </div>
            <Button type="submit" variant="primary">
              Ajouter
            </Button>
          </Form>
        </section>

        <section aria-labelledby="members-list-title" className="rise rise-2">
          <h2 id="members-list-title" className="eyebrow mb-3">
            Membres actifs
          </h2>
          {members.length === 0 ? (
            <p className="text-ink-soft">Aucun membre pour l’instant.</p>
          ) : (
            <ul className="divide-y divide-rule border-t border-rule-strong">
              {members.map((m) => (
                <li key={m.id} className="py-4">
                  <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-[1fr_1fr_auto_auto]">
                    <Form
                      method="post"
                      className="contents"
                      id={`member-${m.id}`}
                    >
                      <input type="hidden" name="intent" value="update" />
                      <input type="hidden" name="id" value={m.id} />
                      <div className="flex flex-col gap-1">
                        <Label htmlFor={`name-${m.id}`}>Nom</Label>
                        <Input
                          id={`name-${m.id}`}
                          name="name"
                          defaultValue={m.name}
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label htmlFor={`col-${m.id}`}>
                          Reste à vivre (€)
                        </Label>
                        <Input
                          id={`col-${m.id}`}
                          name="defaultCostOfLiving"
                          defaultValue={(m.defaultCostOfLiving / 100).toString()}
                          inputMode="decimal"
                          className="num"
                        />
                      </div>
                      <Button type="submit" variant="outline" size="sm">
                        Enregistrer
                      </Button>
                    </Form>
                    <Form method="post">
                      <input type="hidden" name="intent" value="archive" />
                      <input type="hidden" name="id" value={m.id} />
                      <Button type="submit" variant="destructive" size="sm">
                        Archiver
                      </Button>
                    </Form>
                  </div>
                  <p className="mt-2 text-xs text-ink-faint">
                    Soit {formatEuros(m.defaultCostOfLiving)} retirés avant
                    répartition.
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
