# Ethical Calc

Calculateur de répartition éthique des charges d'un foyer. Chaque membre paie
selon ses revenus, avec deux méthodes de calcul (proportionnelle pure et
proportionnelle après reste à vivre) affichées côte-à-côte.

Self-hosted, déployable sur Raspberry Pi.

## Dev

```bash
npm install
npm run db:migrate
npm run db:seed
npm run set-password -- "<password>"
npm run dev
```

Ouvrir http://localhost:5173.

## Deploy (Raspberry Pi)

Voir [docs/deployment.md](docs/deployment.md).

## Spec

Voir [docs/superpowers/specs/2026-04-15-ethical-calc-design.md](docs/superpowers/specs/2026-04-15-ethical-calc-design.md).
