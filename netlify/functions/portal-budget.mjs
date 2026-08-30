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

function computeStats(budget) {
  const stats = {};
  for (const account of ACCOUNTS) {
    const attendeeCount = budget.accounts[account].attendeeCount;
    const cats = budget.categories.filter(c => c.account === account);
    const txns = budget.transactions.filter(t => t.account === account);
    const spentByCat = new Map();
    let totalSpent = 0, totalIncome = 0;
    for (const t of txns) {
      if (t.type === 'expense') {
        totalSpent += t.amount;
        if (t.categoryId) spentByCat.set(t.categoryId, (spentByCat.get(t.categoryId) || 0) + t.amount);
      } else {
        totalIncome += t.amount;
      }
    }
    const startingBalance = budget.accounts[account].startingBalance || 0;
    const plannedTotal = cats.reduce((s, c) => s + effectivePlannedAmount(c, attendeeCount), 0);
    stats[account] = {
      targetAmount: budget.accounts[account].targetAmount,
      startingBalance,
      currentBalance: startingBalance + totalIncome - totalSpent,
      plannedTotal,
      plannedRevenueTotal: cats.reduce((s, c) => s + (c.plannedRevenue || 0), 0),
      totalSpent,
      totalIncome,
      categories: cats.map(c => ({ ...c, plannedAmount: effectivePlannedAmount(c, attendeeCount), spent: spentByCat.get(c.id) || 0 })),
      ...(typeof attendeeCount === 'number' ? { attendeeCount, costPerPerson: attendeeCount > 0 ? plannedTotal / attendeeCount : 0 } : {}),
    };
  }
  return { accounts: stats };
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
      const { categoryId, description, cost, revenue, date } = body;
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
      if (revenueNum > 0) budget.transactions.push({ id: randomUUID(), type: 'income', amount: revenueNum, ...base });
      await setCollection('budget', budget);
      return json({ ok: true, transactions: budget.transactions, stats: computeStats(budget) });
    }

    if (op === 'addTransaction') {
      const { account, type, categoryId, description, amount, date } = body;
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
      const txn = {
        id: randomUUID(), account, type,
        categoryId: categoryId || null,
        description: String(description).trim(),
        amount: numAmount,
        date: date || new Date().toISOString().slice(0, 10),
        addedById: me.id, addedByName: me.name,
        createdAt: new Date().toISOString(),
      };
      budget.transactions.push(txn);
      await setCollection('budget', budget);
      return json({ ok: true, transactions: budget.transactions, stats: computeStats(budget) });
    }

    if (op === 'updateTransaction') {
      const target = budget.transactions.find(t => t.id === body.id);
      if (!target) return json({ ok: false, error: 'Transaction not found.' }, 404);
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
      await setCollection('budget', budget);
      return json({ ok: true, transactions: budget.transactions, stats: computeStats(budget) });
    }

    return json({ ok: false, error: 'Unknown operation.' }, 400);
  }

  if (req.method === 'DELETE') {
    if (!budget.transactions.some(t => t.id === body.id)) return json({ ok: false, error: 'Transaction not found.' }, 404);
    budget.transactions = budget.transactions.filter(t => t.id !== body.id);
    await setCollection('budget', budget);
    return json({ ok: true, transactions: budget.transactions, stats: computeStats(budget) });
  }

  return json({ ok: false, error: 'Method not allowed' }, 405);
}
