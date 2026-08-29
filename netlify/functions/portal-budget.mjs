import { randomUUID } from 'node:crypto';
import { getCollection, setCollection } from './_lib/blobs.mjs';
import { requireAuth, json } from './_lib/auth.mjs';

const ACCOUNTS = ['regular', 'fundraising'];

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
  addCat('regular', 'On-Campus Events & Programming', 401.05);
  addCat('regular', 'Merchandise', 450);
  addCat('regular', 'Travel', 1050);
  // Fundraising/Extra account — Fundraising Plan categories, each with a
  // planned cost (what a fundraiser costs to run) and planned revenue
  // (what it's expected to bring in).
  addCat('fundraising', 'Bake Sales', 500, 800);
  addCat('fundraising', 'Hispanic Heritage Month Fundraiser', 100, 200);
  addCat('fundraising', 'Asian Heritage Month Fundraiser', 50, 100);
  addCat('fundraising', 'Carnival Foods', 80, 150);
  addCat('fundraising', 'TB Merch', 1200, 2000);
  addCat('fundraising', 'Christmas Caroling', 0, 100);
  addCat('fundraising', 'Spring Musical', 400, 1000);
  addCat('fundraising', 'Songs of the Seasons', 200, 400);

  return {
    accounts: {
      regular: { targetAmount: 3000, label: 'Regular Account' },
      fundraising: { targetAmount: 3000, label: 'Fundraising / Extra Account' },
    },
    categories,
    transactions: [],
  };
}

async function loadBudget() {
  const stored = await getCollection('budget', null);
  if (stored) return stored;
  const seeded = buildDefaultBudget();
  await setCollection('budget', seeded);
  return seeded;
}

function computeStats(budget) {
  const stats = {};
  for (const account of ACCOUNTS) {
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
    stats[account] = {
      targetAmount: budget.accounts[account].targetAmount,
      plannedTotal: cats.reduce((s, c) => s + c.plannedAmount, 0),
      plannedRevenueTotal: cats.reduce((s, c) => s + (c.plannedRevenue || 0), 0),
      totalSpent,
      totalIncome,
      categories: cats.map(c => ({ ...c, spent: spentByCat.get(c.id) || 0 })),
    };
  }
  return stats;
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

    if (op === 'createCategory') {
      const { account, name, plannedAmount, plannedRevenue } = body;
      if (!ACCOUNTS.includes(account)) return json({ ok: false, error: 'Unknown account.' }, 400);
      const trimmed = String(name || '').trim();
      if (!trimmed) return json({ ok: false, error: 'Category name is required.' }, 400);
      const cat = { id: randomUUID(), account, name: trimmed, plannedAmount: Number(plannedAmount) || 0 };
      if (account === 'fundraising') cat.plannedRevenue = Number(plannedRevenue) || 0;
      budget.categories.push(cat);
      await setCollection('budget', budget);
      return json({ ok: true, stats: computeStats(budget) });
    }

    if (op === 'updateCategory') {
      const target = budget.categories.find(c => c.id === body.id);
      if (!target) return json({ ok: false, error: 'Category not found.' }, 404);
      if (body.name) target.name = String(body.name).trim();
      if ('plannedAmount' in body) target.plannedAmount = Number(body.plannedAmount) || 0;
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

    if (op === 'addTransaction') {
      const { account, type, categoryId, description, amount, date } = body;
      if (!ACCOUNTS.includes(account)) return json({ ok: false, error: 'Unknown account.' }, 400);
      if (!['expense', 'income'].includes(type)) return json({ ok: false, error: 'Unknown transaction type.' }, 400);
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
