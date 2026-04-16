import { z } from "zod";
import { eurosToCents } from "./money";

const money = z
  .string()
  .transform((v, ctx) => {
    try {
      return eurosToCents(v);
    } catch {
      ctx.addIssue({ code: "custom", message: "Montant invalide" });
      return z.NEVER;
    }
  });

export const memberSchema = z.object({
  name: z.string().trim().min(1, "Nom requis"),
  defaultCostOfLiving: money,
});

export const categorySchema = z.object({
  name: z.string().trim().min(1, "Nom requis"),
});

export const incomeSchema = z.object({
  amount: money,
  costOfLiving: money,
});

export const expenseSchema = z.object({
  label: z.string().trim().min(1, "Libellé requis"),
  amount: money,
  categoryId: z.coerce.number().int().positive(),
  memberIds: z
    .array(z.coerce.number().int().positive())
    .min(1, "Au moins un membre"),
});
