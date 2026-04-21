import { Form, redirect, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/login";
import {
  isRateLimited,
  recordLoginAttempt,
  verifyPassword,
} from "~/lib/auth.server";
import { createUserSession, getSession } from "~/lib/session.server";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

export async function loader({ request }: Route.LoaderArgs) {
  const session = await getSession(request);
  if (session.get("authed")) throw redirect("/");
  return null;
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const password = String(formData.get("password") ?? "");
  const ip = request.headers.get("x-forwarded-for") ?? "local";

  if (isRateLimited(ip)) {
    return { error: "Trop de tentatives. Réessayez dans quelques minutes." };
  }

  if (!verifyPassword(password)) {
    recordLoginAttempt(ip);
    return { error: "Mot de passe incorrect." };
  }

  return createUserSession("/");
}

export default function Login() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-6 py-12">
      <div className="w-full max-w-sm rise">
        <p className="eyebrow">Comptes du foyer</p>
        <h1 className="mt-2 font-heading text-5xl leading-none text-ink">
          Le Cahier
        </h1>
        <p className="mt-3 max-w-[32ch] text-sm text-ink-soft">
          Chacun sa part, selon ses revenus. Ouvrez le cahier pour lire le
          mois en cours.
        </p>

        <hr className="rule-h my-8" />

        <Form method="post" className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="password">Mot de passe du foyer</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              autoFocus
              className="text-lg"
            />
          </div>
          {actionData?.error && (
            <p className="text-sm text-danger" role="alert">
              <span aria-hidden className="mr-2 text-danger">—</span>
              {actionData.error}
            </p>
          )}
          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full"
            disabled={submitting}
          >
            {submitting ? "Ouverture…" : "Entrer"}
          </Button>
        </Form>
      </div>
    </div>
  );
}
