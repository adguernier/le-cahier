import { Form, Link, NavLink } from "react-router";
import type { ReactNode } from "react";

const navClass = ({ isActive }: { isActive: boolean }) =>
  [
    "text-sm transition-colors",
    isActive
      ? "text-ink underline decoration-accent decoration-2 underline-offset-[6px]"
      : "text-ink-soft hover:text-ink",
  ].join(" ");

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="page py-0!">
        <header className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3 pt-8 pb-5">
          <Link to="/" className="inline-flex items-baseline gap-3">
            <span className="font-heading text-2xl leading-none">Le Cahier</span>
            <span className="eyebrow hidden sm:inline">comptes du foyer</span>
          </Link>
          <nav className="flex items-center gap-x-6 gap-y-2">
            <NavLink to="/months" className={navClass}>
              Historique
            </NavLink>
            <NavLink to="/settings/members" className={navClass}>
              Membres
            </NavLink>
            <NavLink to="/settings/categories" className={navClass}>
              Catégories
            </NavLink>
            <Form method="post" action="/logout">
              <button
                type="submit"
                className="text-sm text-ink-soft underline-offset-[6px] hover:text-ink hover:underline"
              >
                Sortir
              </button>
            </Form>
          </nav>
        </header>
        <hr className="rule-h" />
      </div>
      <main>{children}</main>
    </div>
  );
}
