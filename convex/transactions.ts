import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

export const list = query({
  args: {
    type: v.optional(v.union(v.literal("income"), v.literal("expense"))),
    category: v.optional(v.string()),
    search: v.optional(v.string()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    let txQuery = ctx.db
      .query("transactions")
      .withIndex("by_user", (q) => q.eq("userId", userId));

    const all = await txQuery.order("desc").collect();

    // Filter in-memory for flexible combination of search, date range, type, category
    return all.filter((tx) => {
      if (args.type && tx.type !== args.type) return false;
      if (args.category && args.category !== "all" && tx.category !== args.category) return false;
      if (args.startDate && tx.date < args.startDate) return false;
      if (args.endDate && tx.date > args.endDate) return false;
      if (args.search) {
        const queryLower = args.search.toLowerCase();
        const matchesTitle = tx.title.toLowerCase().includes(queryLower);
        const matchesNotes = tx.notes?.toLowerCase().includes(queryLower);
        const matchesCategory = tx.category.toLowerCase().includes(queryLower);
        if (!matchesTitle && !matchesNotes && !matchesCategory) return false;
      }
      return true;
    }).slice(0, args.limit ?? 100);
  },
});

export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return {
        totalIncome: 0,
        totalExpense: 0,
        totalBalance: 0,
        thisMonthIncome: 0,
        thisMonthExpense: 0,
        savingsRate: 0,
        transactionCount: 0,
      };
    }

    const all = await ctx.db
      .query("transactions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const now = new Date();
    const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    let totalIncome = 0;
    let totalExpense = 0;
    let thisMonthIncome = 0;
    let thisMonthExpense = 0;

    for (const tx of all) {
      if (tx.type === "income") {
        totalIncome += tx.amount;
        if (tx.date.startsWith(currentMonthPrefix)) {
          thisMonthIncome += tx.amount;
        }
      } else if (tx.type === "expense") {
        totalExpense += tx.amount;
        if (tx.date.startsWith(currentMonthPrefix)) {
          thisMonthExpense += tx.amount;
        }
      }
    }

    const totalBalance = totalIncome - totalExpense;
    const savingsRate =
      thisMonthIncome > 0
        ? Math.max(0, Math.round(((thisMonthIncome - thisMonthExpense) / thisMonthIncome) * 100))
        : 0;

    return {
      totalIncome,
      totalExpense,
      totalBalance,
      thisMonthIncome,
      thisMonthExpense,
      savingsRate,
      transactionCount: all.length,
    };
  },
});

export const add = mutation({
  args: {
    title: v.string(),
    amount: v.number(),
    type: v.union(v.literal("income"), v.literal("expense"), v.literal("transfer")),
    category: v.string(),
    date: v.string(),
    notes: v.optional(v.string()),
    walletId: v.optional(v.id("wallets")),
    transferToWalletId: v.optional(v.id("wallets")),
    budgetId: v.optional(v.id("budgets")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    if (args.amount <= 0) {
      throw new Error("Amount must be greater than 0");
    }

    const now = Date.now();
    const cleanAmount = Math.abs(args.amount);

    // Apply wallet balance change
    if (args.walletId) {
      const wallet = await ctx.db.get(args.walletId);
      if (wallet && wallet.userId === userId) {
        if (args.type === "expense") {
          await ctx.db.patch(args.walletId, {
            balance: wallet.balance - cleanAmount,
            updatedAt: now,
          });
        } else if (args.type === "income") {
          await ctx.db.patch(args.walletId, {
            balance: wallet.balance + cleanAmount,
            updatedAt: now,
          });
        } else if (args.type === "transfer" && args.transferToWalletId) {
          const destWallet = await ctx.db.get(args.transferToWalletId);
          if (destWallet && destWallet.userId === userId) {
            await ctx.db.patch(args.walletId, {
              balance: wallet.balance - cleanAmount,
              updatedAt: now,
            });
            await ctx.db.patch(args.transferToWalletId, {
              balance: destWallet.balance + cleanAmount,
              updatedAt: now,
            });
          }
        }
      }
    }

    return await ctx.db.insert("transactions", {
      userId,
      title: args.title.trim(),
      amount: cleanAmount,
      type: args.type,
      category: args.category,
      date: args.date,
      notes: args.notes?.trim(),
      walletId: args.walletId,
      transferToWalletId: args.transferToWalletId,
      budgetId: args.budgetId,
      createdAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("transactions"),
    title: v.string(),
    amount: v.number(),
    type: v.union(v.literal("income"), v.literal("expense"), v.literal("transfer")),
    category: v.string(),
    date: v.string(),
    notes: v.optional(v.string()),
    walletId: v.optional(v.id("wallets")),
    transferToWalletId: v.optional(v.id("wallets")),
    budgetId: v.optional(v.id("budgets")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const oldTx = await ctx.db.get(args.id);
    if (!oldTx || oldTx.userId !== userId) {
      throw new Error("Transaction not found or unauthorized");
    }

    const now = Date.now();
    const newAmount = Math.abs(args.amount);

    // 1. Revert previous wallet impact
    if (oldTx.walletId) {
      const oldWallet = await ctx.db.get(oldTx.walletId);
      if (oldWallet) {
        if (oldTx.type === "expense") {
          await ctx.db.patch(oldTx.walletId, {
            balance: oldWallet.balance + oldTx.amount,
            updatedAt: now,
          });
        } else if (oldTx.type === "income") {
          await ctx.db.patch(oldTx.walletId, {
            balance: oldWallet.balance - oldTx.amount,
            updatedAt: now,
          });
        } else if (oldTx.type === "transfer" && oldTx.transferToWalletId) {
          const oldDest = await ctx.db.get(oldTx.transferToWalletId);
          await ctx.db.patch(oldTx.walletId, {
            balance: oldWallet.balance + oldTx.amount,
            updatedAt: now,
          });
          if (oldDest) {
            await ctx.db.patch(oldTx.transferToWalletId, {
              balance: oldDest.balance - oldTx.amount,
              updatedAt: now,
            });
          }
        }
      }
    }

    // 2. Apply new wallet impact
    if (args.walletId) {
      const newWallet = await ctx.db.get(args.walletId);
      if (newWallet) {
        if (args.type === "expense") {
          await ctx.db.patch(args.walletId, {
            balance: newWallet.balance - newAmount,
            updatedAt: now,
          });
        } else if (args.type === "income") {
          await ctx.db.patch(args.walletId, {
            balance: newWallet.balance + newAmount,
            updatedAt: now,
          });
        } else if (args.type === "transfer" && args.transferToWalletId) {
          const newDest = await ctx.db.get(args.transferToWalletId);
          await ctx.db.patch(args.walletId, {
            balance: newWallet.balance - newAmount,
            updatedAt: now,
          });
          if (newDest) {
            await ctx.db.patch(args.transferToWalletId, {
              balance: newDest.balance + newAmount,
              updatedAt: now,
            });
          }
        }
      }
    }

    await ctx.db.patch(args.id, {
      title: args.title.trim(),
      amount: newAmount,
      type: args.type,
      category: args.category,
      date: args.date,
      notes: args.notes?.trim(),
      walletId: args.walletId,
      transferToWalletId: args.transferToWalletId,
      budgetId: args.budgetId,
    });

    return { success: true };
  },
});

export const remove = mutation({
  args: {
    id: v.id("transactions"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const tx = await ctx.db.get(args.id);
    if (!tx || tx.userId !== userId) {
      throw new Error("Transaction not found or unauthorized");
    }

    // Revert wallet impact before deleting
    if (tx.walletId) {
      const wallet = await ctx.db.get(tx.walletId);
      if (wallet) {
        const now = Date.now();
        if (tx.type === "expense") {
          await ctx.db.patch(tx.walletId, {
            balance: wallet.balance + tx.amount,
            updatedAt: now,
          });
        } else if (tx.type === "income") {
          await ctx.db.patch(tx.walletId, {
            balance: wallet.balance - tx.amount,
            updatedAt: now,
          });
        } else if (tx.type === "transfer" && tx.transferToWalletId) {
          const destWallet = await ctx.db.get(tx.transferToWalletId);
          await ctx.db.patch(tx.walletId, {
            balance: wallet.balance + tx.amount,
            updatedAt: now,
          });
          if (destWallet) {
            await ctx.db.patch(tx.transferToWalletId, {
              balance: destWallet.balance - tx.amount,
              updatedAt: now,
            });
          }
        }
      }
    }

    await ctx.db.delete(args.id);
    return { success: true };
  },
});

export const getCategories = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    return await ctx.db
      .query("categories")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
  },
});

export const addCategory = mutation({
  args: {
    name: v.string(),
    type: v.union(v.literal("income"), v.literal("expense")),
    color: v.string(),
    icon: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    return await ctx.db.insert("categories", {
      userId,
      name: args.name.trim(),
      type: args.type,
      color: args.color,
      icon: args.icon,
      isCustom: true,
    });
  },
});
