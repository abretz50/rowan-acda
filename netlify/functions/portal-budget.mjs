import { randomUUID } from 'node:crypto';
import { getCollection, setCollection } from './_lib/blobs.mjs';
import { requireAuth, json } from './_lib/auth.mjs';

const ACCOUNTS = ['regular', 'fundraising', 'convention'];

// Seeded once from the chapter's real FY27 budget plan (ACDA FY27
// Budget.xlsx) — only the planned amounts carry over; actual transactions
// start empty so real spending/fundraising gets tracked from a clean slate
// against this plan, not backfilled with fake history.
function buildDefaultBudget() {
  const categories = [];
  const addCat = (account, name, plannedAmount, plannedRevenue) => {
    const cat = { id: randomUUID(), account, name, plannedAmount };
    if (plannedRevenue !== undefined) cat.plannedRevenue = plannedRevenue;
    categories.push(cat);
  };
  // Regular account ($3,000 SGA allocation) — Line-Item Budget categories.
  addCat('regular', 'Membership & Fees', 150);
  addCat('regular', 'Meetings & Food', 300);
  addCat('regular', 'Supplies', 455);
  addCat('regular', 'Technology & Operations', 164);
  addCat('regular', 'Professional Development', 640);
  addCat('regular', 'Prizes & Awards', 650);
  addCat('regular', 'On Campus Events & Programming', 401.05);
  addCat('regular', 'Merchandise', 450);
  addCat('regular', 'Travel', 1050);
  // Extra account — Fundraising Plan categories, each with a planned cost
  // (what a fundraiser costs to run) and planned revenue (what it's
  // expected to bring in).
  addCat('fundraising', 'Bake Sales', 500, 800);
  addCat('fundraising', 'Hispanic Heritage Month Fundraiser', 100, 200);
  addCat('fundraising', 'Asian Heritage Month Fundraiser', 50, 100);
  addCat('fundraising', 'Carnival Foods', 80, 150);
  addCat('fundraising', 'TB Merch', 1200, 2000);
  addCat('fundraising', 'Christmas Caroling', 0, 100);
  addCat('fundraising', 'Spring Musical', 400, 1000);
  addCat('fundraising', 'Songs of the Seasons', 200, 400);
  // Convention Trip — a separate SGA special request (2027 ACDA National
  // Conference, Minneapolis), not part of the two accounts above. Each
  // category is a per-person cost times a planning attendee count, so the
  // whole trip's projected cost (and cost-per-person) updates live as the
  // headcount or per-person prices change — this account is a planning
  // tool first, a ledger second.
  categories.push(
    { id: randomUUID(), account: 'convention', name: 'Registration', perPerson: true, unitCost: 250, plannedAmount: 0 },
    { id: randomUUID(), account: 'convention', name: 'Flights', perPerson: true, unitCost: 300, plannedAmount: 0 },
    { id: randomUUID(), account: 'convention', name: 'Hotel', perPerson: true, unitCost: 240, plannedAmount: 0 },
  );

  return {
    accounts: {
      regular: { targetAmount: 3000, label: 'Regular Account', startingBalance: 0 },
      // $3,355.22 is the account's real current balance as reported by the
      // treasurer when this tool shipped — the starting point for "current
      // balance" math, not a transaction, so it doesn't inflate Raised/Spent.
      fundraising: { targetAmount: 1000, label: 'Extra Account', startingBalance: 3355.22 },
      convention: { targetAmount: 12000, label: 'Convention Trip (2027 ACDA National Conference)', startingBalance: 0, attendeeCount: 10 },
    },
    categories,
    transactions: [],
    _fundraisingBalanceSeeded: true,
    _conventionPerPersonMigrated: true,
    _onCampusHyphenFixed: true,
    _fundraisingGoal1000Migrated: true,
  };
}

// One-time backfills as the budget tool's shape has grown — each guarded so
// it only ever runs once per store and never overwrites something an admin
// has since edited themselves.
function migrateBudgetShape(budget) {
  let changed = false;
  for (const acc of Object.values(budget.accounts)) {
    if (typeof acc.startingBalance !== 'number') { acc.startingBalance = 0; changed = true; }
  }
  if (!budget._fundraisingBalanceSeeded) {
    budget.accounts.fundraising.startingBalance = 3355.22;
    budget._fundraisingBalanceSeeded = true;
    changed = true;
  }
  if (!budget.accounts.convention) {
    budget.accounts.convention = { targetAmount: 12000, label: 'Convention Trip (2027 ACDA National Conference)', startingBalance: 0, attendeeCount: 10 };
    budget.categories.push(
      { id: randomUUID(), account: 'convention', name: 'Registration', perPerson: true, unitCost: 250, plannedAmount: 0 },
      { id: randomUUID(), account: 'convention', name: 'Flights', perPerson: true, unitCost: 300, plannedAmount: 0 },
      { id: randomUUID(), account: 'convention', name: 'Hotel', perPerson: true, unitCost: 240, plannedAmount: 0 },
    );
    changed = true;
  }
  if (budget.accounts.fundraising.label !== 'Extra Account') {
    budget.accounts.fundraising.label = 'Extra Account';
    changed = true;
  }
  if (!budget._fundraisingGoal1000Migrated) {
    budget.accounts.fundraising.targetAmount = 1000;
    budget._fundraisingGoal1000Migrated = true;
    changed = true;
  }
  if (typeof budget.accounts.convention.attendeeCount !== 'number') {
    budget.accounts.convention.attendeeCount = 10;
    changed = true;
  }
  if (!budget._conventionPerPersonMigrated) {
    // The original 3 seeded categories baked a 10-attendee assumption
    // straight into fixed totals — convert them to the per-person model at
    // the same effective unit cost so nothing changes numerically today,
    // only how it recalculates going forward.
    const renameMap = {
      'Registration (10 attendees @ $250)': { name: 'Registration', unitCost: 250 },
      'Flights (10 attendees @ $300, round-trip)': { name: 'Flights', unitCost: 300 },
      'Hotel (3 rooms x 4 nights @ $200, quad occupancy)': { name: 'Hotel', unitCost: 240 },
    };
    for (const cat of budget.categories) {
      if (cat.account !== 'convention') continue;
      const mapped = renameMap[cat.name];
      if (mapped) {
        cat.name = mapped.name;
        cat.perPerson = true;
        cat.unitCost = mapped.unitCost;
      } else if (typeof cat.perPerson !== 'boolean') {
        cat.perPerson = false;
      }
    }
    budget._conventionPerPersonMigrated = true;
    changed = true;
  }
  if (!budget._onCampusHyphenFixed) {
    const c = budget.categories.find(x => x.account === 'regular' && x.name === 'On-Campus Events & Programming');
    if (c) c.name = 'On Campus Events & Programming';
    budget._onCampusHyphenFixed = true;
    changed = true;
  }
  return changed;
}

async function loadBudget() {
  const stored = await getCollection('budget', null);
  if (!stored) {
    const seeded = buildDefaultBudget();
    await setCollection('budget', seeded);
    return seeded;
  }
  if (migrateBudgetShape(stored)) await setCollection('budget', stored);
  return stored;
}

// A convention-trip category's real planned amount is unitCost × the
// account's current attendee count, recomputed live rather than stored, so
// changing the headcount instantly reprices every per-person category.
function effectivePlannedAmount(cat, attendeeCount) {
  if (cat.perPerson) return (Number(cat.unitCost) || 0) * (Number(attendeeCount) || 0);
  return Number(cat.plannedAmount) || 0;
}

// Cash model (all on the Extra Account, since that's the only account money
// ever comes into):
//   - income with `cash: true` was collected in hand (e.g. a bake sale) and
//     hasn't been deposited yet — it counts as money raised, but isn't in the
//     bank until a 'deposit' transaction moves it there.
//   - an expense with a `reimburse` object was paid out-of-pocket by a person
//     (`reimburse.to`) and is owed back to them; it counts as spent right
//     away, but never touches the bank — it's paid from cash on hand, which
//     stamps `reimburse.paidAt`.
function computeStats(budget) {
  const stats = {};
  let cashIn = 0, deposits = 0, paidFromCash = 0;
  const owed = [];
  for (const account of ACCOUNTS) {
    const attendeeCount = budget.accounts[account].attendeeCount;
    const cats = budget.categories.filter(c => c.account === account);
    const txns = budget.transactions.filter(t => t.account === account);
    const spentByCat = new Map();
    const raisedByCat = new Map();
    let totalSpent = 0, totalIncome = 0, bankIncome = 0, bankExpenses = 0, accountDeposits = 0;
    for (const t of txns) {
      if (t.type === 'deposit') { accountDeposits += t.amount; continue; }
      if (t.type === 'expense') {
        totalSpent += t.amount;
        if (t.categoryId) spentByCat.set(t.categoryId, (spentByCat.get(t.categoryId) || 0) + t.amount);
        if (t.reimburse) {
          if (t.reimburse.paidAt) paidFromCash += t.amount;
          else owed.push({ id: t.id, to: t.reimburse.to, description: t.description, amount: t.amount, date: t.date, categoryId: t.categoryId || null });
        } else {
          bankExpenses += t.amount;
        }
      } else {
        totalIncome += t.amount;
        if (t.categoryId) raisedByCat.set(t.categoryId, (raisedByCat.get(t.categoryId) || 0) + t.amount);
        if (t.cash) cashIn += t.amount; else bankIncome += t.amount;
      }
    }
    deposits += accountDeposits;
    const startingBalance = budget.accounts[account].startingBalance || 0;
    const plannedTotal = cats.reduce((s, c) => s + effectivePlannedAmount(c, attendeeCount), 0);
    stats[account] = {
      targetAmount: budget.accounts[account].targetAmount,
      startingBalance,
      currentBalance: startingBalance + bankIncome + accountDeposits - bankExpenses,
      plannedTotal,
      plannedRevenueTotal: cats.reduce((s, c) => s + (c.plannedRevenue || 0), 0),
      totalSpent,
      totalIncome,
      categories: cats.map(c => ({ ...c, plannedAmount: effectivePlannedAmount(c, attendeeCount), spent: spentByCat.get(c.id) || 0, raised: raisedByCat.get(c.id) || 0 })),
      ...(typeof attendeeCount === 'number' ? { attendeeCount, costPerPerson: attendeeCount > 0 ? plannedTotal / attendeeCount : 0 } : {}),
    };
  }
  owed.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const round = (n) => Math.round(n * 100) / 100;
  return {
    accounts: stats,
    cash: {
      onHand: round(cashIn - deposits - paidFromCash),
      owedTotal: round(owed.reduce((s, o) => s + o.amount, 0)),
      owed,
    },
  };
}

function cashOnHand(budget) { return computeStats(budget).cash.onHand; }

// Called before saving any transaction change — an edit or delete that would
// leave the cash tracker below zero (e.g. deleting cash income that a later
// deposit was drawn from) is rejected instead of silently corrupting it.
async function saveTxns(budget) {
  if (cashOnHand(budget) < -0.005) {
    return json({ ok: false, error: 'That would put Cash on Hand below zero — log the cash collected first, or undo the later deposit/reimbursement.' }, 400);
  }
  await setCollection('budget', budget);
  return json({ ok: true, transactions: budget.transactions, stats: computeStats(budget) });
}

export default async function handler(req) {
  const budget = await loadBudget();

  if (req.method === 'GET') {
    const auth = await requireAuth(req, { perm: 'budget' });
    if (auth.deny) return auth.deny;
    return json({ ok: true, accounts: budget.accounts, transactions: budget.transactions, stats: computeStats(budget) });
  }

  const auth = await requireAuth(req, { perm: 'budget' });
  if (auth.deny) return auth.deny;
  const { user: me } = auth;

  let body;
  try { body = req.method === 'DELETE' ? Object.fromEntries(new URL(req.url).searchParams) : await req.json(); }
  catch { return json({ ok: false, error: 'Bad JSON' }, 400); }

  if (req.method === 'POST') {
    const { op } = body;

    if (op === 'setAccountTarget') {
      const { account, targetAmount } = body;
      if (!ACCOUNTS.includes(account)) return json({ ok: false, error: 'Unknown account.' }, 400);
      if (typeof targetAmount !== 'number' || targetAmount < 0) return json({ ok: false, error: 'A valid target amount is required.' }, 400);
      budget.accounts[account].targetAmount = targetAmount;
      await setCollection('budget', budget);
      return json({ ok: true, accounts: budget.accounts, stats: computeStats(budget) });
    }

    if (op === 'setStartingBalance') {
      const { account, startingBalance } = body;
      if (!ACCOUNTS.includes(account)) return json({ ok: false, error: 'Unknown account.' }, 400);
      if (typeof startingBalance !== 'number') return json({ ok: false, error: 'A valid balance is required.' }, 400);
      budget.accounts[account].startingBalance = startingBalance;
      budget._fundraisingBalanceSeeded = true; // a manual edit always wins over the one-time seed
      await setCollection('budget', budget);
      return json({ ok: true, accounts: budget.accounts, stats: computeStats(budget) });
    }

    if (op === 'setAttendeeCount') {
      if (body.account !== 'convention') return json({ ok: false, error: 'Attendee count only applies to the Convention Trip account.' }, 400);
      const n = Number(body.attendeeCount);
      if (!Number.isFinite(n) || n < 0) return json({ ok: false, error: 'A valid attendee count is required.' }, 400);
      budget.accounts.convention.attendeeCount = n;
      await setCollection('budget', budget);
      return json({ ok: true, accounts: budget.accounts, stats: computeStats(budget) });
    }

    if (op === 'createCategory') {
      const { account, name, plannedAmount, plannedRevenue, perPerson, unitCost } = body;
      if (!ACCOUNTS.includes(account)) return json({ ok: false, error: 'Unknown account.' }, 400);
      const trimmed = String(name || '').trim();
      if (!trimmed) return json({ ok: false, error: 'Category name is required.' }, 400);
      const cat = { id: randomUUID(), account, name: trimmed, plannedAmount: 0 };
      if (account === 'convention' && perPerson) {
        cat.perPerson = true;
        cat.unitCost = Number(unitCost) || 0;
      } else {
        cat.perPerson = false;
        cat.plannedAmount = Number(plannedAmount) || 0;
      }
      if (account === 'fundraising') cat.plannedRevenue = Number(plannedRevenue) || 0;
      budget.categories.push(cat);
      await setCollection('budget', budget);
      return json({ ok: true, stats: computeStats(budget) });
    }

    if (op === 'updateCategory') {
      const target = budget.categories.find(c => c.id === body.id);
      if (!target) return json({ ok: false, error: 'Category not found.' }, 404);
      if (body.name) target.name = String(body.name).trim();
      if (target.account === 'convention' && 'perPerson' in body) {
        target.perPerson = !!body.perPerson;
        if (target.perPerson) {
          target.unitCost = Number(body.unitCost) || 0;
        } else if ('plannedAmount' in body) {
          target.plannedAmount = Number(body.plannedAmount) || 0;
        }
      } else if ('plannedAmount' in body) {
        target.plannedAmount = Number(body.plannedAmount) || 0;
      }
      if ('plannedRevenue' in body && target.account === 'fundraising') target.plannedRevenue = Number(body.plannedRevenue) || 0;
      await setCollection('budget', budget);
      return json({ ok: true, stats: computeStats(budget) });
    }

    if (op === 'deleteCategory') {
      if (!budget.categories.some(c => c.id === body.id)) return json({ ok: false, error: 'Category not found.' }, 404);
      budget.categories = budget.categories.filter(c => c.id !== body.id);
      // Existing transactions keep their categoryId — they just show as
      // "Uncategorized" rather than disappearing or blocking the delete.
      await setCollection('budget', budget);
      return json({ ok: true, transactions: budget.transactions, stats: computeStats(budget) });
    }

    if (op === 'addFundraiserEvent') {
      // "Sometimes we have to spend money to make money" — one fundraiser
      // logged as a single linked cost+revenue pair instead of two
      // unrelated transactions, matching how the real Fundraising Plan
      // tracks cost/revenue/net per fundraiser.
      const { categoryId, description, cost, revenue, date, cash } = body;
      const costNum = Number(cost) || 0;
      const revenueNum = Number(revenue) || 0;
      if (costNum < 0 || revenueNum < 0) return json({ ok: false, error: 'Amounts cannot be negative.' }, 400);
      if (!costNum && !revenueNum) return json({ ok: false, error: 'Enter a cost, a revenue amount, or both.' }, 400);
      const desc = String(description || '').trim();
      if (!desc) return json({ ok: false, error: 'A description is required.' }, 400);
      if (categoryId && !budget.categories.some(c => c.id === categoryId && c.account === 'fundraising')) {
        return json({ ok: false, error: 'Category not found.' }, 404);
      }
      const linkId = randomUUID();
      const now = new Date().toISOString();
      const txnDate = date || now.slice(0, 10);
      const base = { account: 'fundraising', categoryId: categoryId || null, description: desc, date: txnDate, addedById: me.id, addedByName: me.name, createdAt: now, linkId };
      if (costNum > 0) budget.transactions.push({ id: randomUUID(), type: 'expense', amount: costNum, ...base });
      if (revenueNum > 0) budget.transactions.push({ id: randomUUID(), type: 'income', amount: revenueNum, ...(cash ? { cash: true } : {}), ...base });
      return await saveTxns(budget);
    }

    if (op === 'addTransaction') {
      const { account, type, categoryId, description, amount, date, cash, reimburseTo } = body;
      if (!ACCOUNTS.includes(account)) return json({ ok: false, error: 'Unknown account.' }, 400);
      if (!['expense', 'income'].includes(type)) return json({ ok: false, error: 'Unknown transaction type.' }, 400);
      if (type === 'income' && account !== 'fundraising') {
        return json({ ok: false, error: 'Income can only be logged against the Extra Account.' }, 400);
      }
      const numAmount = Number(amount);
      if (!numAmount || numAmount <= 0) return json({ ok: false, error: 'A positive amount is required.' }, 400);
      if (!String(description || '').trim()) return json({ ok: false, error: 'A description is required.' }, 400);
      if (categoryId && !budget.categories.some(c => c.id === categoryId && c.account === account)) {
        return json({ ok: false, error: 'Category not found for this account.' }, 404);
      }
      const reimburseName = String(reimburseTo || '').trim();
      if (reimburseName && (type !== 'expense' || account !== 'fundraising')) {
        return json({ ok: false, error: 'Cash reimbursements are logged against the Extra Account.' }, 400);
      }
      const txn = {
        id: randomUUID(), account, type,
        categoryId: categoryId || null,
        description: String(description).trim(),
        amount: numAmount,
        date: date || new Date().toISOString().slice(0, 10),
        addedById: me.id, addedByName: me.name,
        createdAt: new Date().toISOString(),
        ...(type === 'income' && cash ? { cash: true } : {}),
        ...(reimburseName ? { reimburse: { to: reimburseName, paidAt: null } } : {}),
      };
      budget.transactions.push(txn);
      return await saveTxns(budget);
    }

    if (op === 'depositCash') {
      const numAmount = Number(body.amount);
      if (!numAmount || numAmount <= 0) return json({ ok: false, error: 'A positive amount is required.' }, 400);
      const onHand = cashOnHand(budget);
      if (numAmount - onHand > 0.005) {
        return json({ ok: false, error: `Only $${onHand.toFixed(2)} in cash on hand — can't deposit more than that.` }, 400);
      }
      budget.transactions.push({
        id: randomUUID(), account: 'fundraising', type: 'deposit', categoryId: null,
        description: String(body.description || '').trim() || 'Cash deposited into the Extra Account',
        amount: numAmount,
        date: body.date || new Date().toISOString().slice(0, 10),
        addedById: me.id, addedByName: me.name, createdAt: new Date().toISOString(),
      });
      return await saveTxns(budget);
    }

    if (op === 'payReimbursement' || op === 'undoReimbursement') {
      const target = budget.transactions.find(t => t.id === body.id && t.reimburse);
      if (!target) return json({ ok: false, error: 'Reimbursement not found.' }, 404);
      if (op === 'payReimbursement') {
        if (target.reimburse.paidAt) return json({ ok: false, error: 'Already reimbursed.' }, 400);
        const onHand = cashOnHand(budget);
        if (target.amount - onHand > 0.005) {
          return json({ ok: false, error: `Only $${onHand.toFixed(2)} in cash on hand — not enough to reimburse $${target.amount.toFixed(2)}. Log the cash you collected first.` }, 400);
        }
        target.reimburse.paidAt = new Date().toISOString();
        target.reimburse.paidByName = me.name;
      } else {
        target.reimburse.paidAt = null;
        delete target.reimburse.paidByName;
      }
      return await saveTxns(budget);
    }

    if (op === 'updateTransaction') {
      const target = budget.transactions.find(t => t.id === body.id);
      if (!target) return json({ ok: false, error: 'Transaction not found.' }, 404);
      if (target.type === 'deposit') return json({ ok: false, error: "A cash deposit can't be edited — delete it and log it again." }, 400);
      if (body.description) target.description = String(body.description).trim();
      if ('amount' in body) {
        const numAmount = Number(body.amount);
        if (!numAmount || numAmount <= 0) return json({ ok: false, error: 'A positive amount is required.' }, 400);
        target.amount = numAmount;
      }
      if (body.date) target.date = body.date;
      if ('categoryId' in body) {
        if (body.categoryId && !budget.categories.some(c => c.id === body.categoryId && c.account === target.account)) {
          return json({ ok: false, error: 'Category not found for this account.' }, 404);
        }
        target.categoryId = body.categoryId || null;
      }
      if (target.type === 'income' && 'cash' in body) {
        if (body.cash) target.cash = true; else delete target.cash;
      }
      if (target.reimburse && 'reimburseTo' in body) {
        const name = String(body.reimburseTo || '').trim();
        if (!name) return json({ ok: false, error: 'Who this is owed to is required.' }, 400);
        target.reimburse.to = name;
      }
      return await saveTxns(budget);
    }

    return json({ ok: false, error: 'Unknown operation.' }, 400);
  }

  if (req.method === 'DELETE') {
    if (!budget.transactions.some(t => t.id === body.id)) return json({ ok: false, error: 'Transaction not found.' }, 404);
    budget.transactions = budget.transactions.filter(t => t.id !== body.id);
    return await saveTxns(budget);
  }

  return json({ ok: false, error: 'Method not allowed' }, 405);
}
