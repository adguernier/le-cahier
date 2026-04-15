import { createCookieSessionStorage, redirect } from "react-router";

const secret = process.env.SESSION_SECRET ?? "dev-only-insecure";

export const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: "__ec_session",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secrets: [secret],
    maxAge: 60 * 60 * 24 * 30, // 30 days
  },
});

export async function getSession(request: Request) {
  return sessionStorage.getSession(request.headers.get("Cookie"));
}

export async function requireAuth(request: Request) {
  const session = await getSession(request);
  if (!session.get("authed")) {
    throw redirect("/login");
  }
}

export async function createUserSession(redirectTo: string) {
  const session = await sessionStorage.getSession();
  session.set("authed", true);
  return redirect(redirectTo, {
    headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
  });
}

export async function destroySession(request: Request) {
  const session = await getSession(request);
  return redirect("/login", {
    headers: { "Set-Cookie": await sessionStorage.destroySession(session) },
  });
}
