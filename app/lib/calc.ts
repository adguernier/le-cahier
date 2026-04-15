export type CalcMember = {
  id: number;
  name: string;
  income: number;
  costOfLiving: number;
};

export type CalcExpense = {
  id: number;
  amount: number;
  memberIds: number[];
};

export type CalcInput = {
  members: CalcMember[];
  expenses: CalcExpense[];
};

export type Share = { memberId: number; total: number };

export type ExpenseBreakdown = {
  expenseId: number;
  proportional: { memberId: number; share: number }[];
  afterCostOfLiving: { memberId: number; share: number }[];
};

export type CalcResult = {
  proportional: Share[];
  afterCostOfLiving: Share[];
  byExpense: ExpenseBreakdown[];
};

function computeShares(
  amount: number,
  weights: { memberId: number; weight: number }[]
): { memberId: number; share: number }[] {
  if (weights.length === 0) return [];

  const total = weights.reduce((s, w) => s + w.weight, 0);

  if (total === 0) {
    // equal split fallback
    const per = Math.floor(amount / weights.length);
    const shares = weights.map((w) => ({ memberId: w.memberId, share: per }));
    const residual = amount - per * weights.length;
    if (shares.length > 0) shares[0].share += residual;
    return shares;
  }

  const raw = weights.map((w) => ({
    memberId: w.memberId,
    share: Math.round((amount * w.weight) / total),
  }));
  const sum = raw.reduce((s, r) => s + r.share, 0);
  const residual = amount - sum;
  if (residual !== 0) {
    // Assign residual to the member with the largest weight
    let maxIdx = 0;
    for (let i = 1; i < weights.length; i++) {
      if (weights[i].weight > weights[maxIdx].weight) maxIdx = i;
    }
    raw[maxIdx].share += residual;
  }
  return raw;
}

export function calculate(input: CalcInput): CalcResult {
  const memberIds = input.members.map((m) => m.id);
  const memberById = new Map(input.members.map((m) => [m.id, m]));

  const totalsProp = new Map<number, number>(memberIds.map((id) => [id, 0]));
  const totalsCost = new Map<number, number>(memberIds.map((id) => [id, 0]));
  const byExpense: ExpenseBreakdown[] = [];

  for (const expense of input.expenses) {
    const affected = expense.memberIds
      .map((id) => memberById.get(id))
      .filter((m): m is CalcMember => m !== undefined);

    const propWeights = affected.map((m) => ({
      memberId: m.id,
      weight: Math.max(0, m.income),
    }));
    const propShares = computeShares(expense.amount, propWeights);

    const costWeights = affected.map((m) => ({
      memberId: m.id,
      weight: Math.max(0, Math.max(0, m.income) - m.costOfLiving),
    }));
    const costSum = costWeights.reduce((s, w) => s + w.weight, 0);
    const costShares =
      costSum === 0
        ? // Fallback to proportional when nobody has capacity
          propShares
        : computeShares(expense.amount, costWeights);

    byExpense.push({
      expenseId: expense.id,
      proportional: propShares,
      afterCostOfLiving: costShares,
    });

    for (const s of propShares) {
      totalsProp.set(s.memberId, (totalsProp.get(s.memberId) ?? 0) + s.share);
    }
    for (const s of costShares) {
      totalsCost.set(s.memberId, (totalsCost.get(s.memberId) ?? 0) + s.share);
    }
  }

  return {
    proportional: memberIds.map((id) => ({
      memberId: id,
      total: totalsProp.get(id) ?? 0,
    })),
    afterCostOfLiving: memberIds.map((id) => ({
      memberId: id,
      total: totalsCost.get(id) ?? 0,
    })),
    byExpense,
  };
}
