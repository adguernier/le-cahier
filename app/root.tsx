import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Gloock&family=Vollkorn:ital,wght@0,400..900;1,400..900&display=swap",
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Erreur";
  let details = "Une erreur inattendue est survenue.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : `Erreur ${error.status}`;
    details =
      error.status === 404
        ? "Page introuvable."
        : error.statusText || details;
  } else if (error && error instanceof Error) {
    if (!import.meta.env.DEV) {
      console.error(error);
    }
    details = import.meta.env.DEV ? error.message : details;
    stack = import.meta.env.DEV ? error.stack : undefined;
  }

  return (
    <main className="page">
      <p className="eyebrow">Le Cahier</p>
      <h1 className="mt-2 text-4xl">{message}</h1>
      <p className="mt-4 max-w-[60ch] text-ink-soft">{details}</p>
      {stack && (
        <pre className="mt-6 overflow-x-auto rounded-md bg-paper-sunken p-4 text-xs">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
