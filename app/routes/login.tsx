import { Form, redirect, useActionData } from "react-router";
import type { Route } from "./+types/login";
import {
  isRateLimited,
  recordLoginAttempt,
  verifyPassword,
} from "~/lib/auth.server";
import { createUserSession, getSession } from "~/lib/session.server";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
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
    return { error: "Trop de tentatives. Réessayez plus tard." };
  }

  if (!verifyPassword(password)) {
    recordLoginAttempt(ip);
    return { error: "Mot de passe incorrect." };
  }

  return createUserSession("/");
}

export default function Login() {
  const actionData = useActionData<typeof action>();
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Ethical Calc</CardTitle>
        </CardHeader>
        <CardContent>
          <Form method="post" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe du foyer</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                autoFocus
              />
            </div>
            {actionData?.error && (
              <p className="text-sm text-red-600">{actionData.error}</p>
            )}
            <Button type="submit" className="w-full">
              Entrer
            </Button>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
