import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { wallets: [], totalBalance: 0, expenseSoFar: 0, incomeSoFar: 0 };

    const wallets = await ctx.db
      .query("wallets")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const totalBalance = wallets.reduce((sum, w) => sum + w.balance, 0);

    // Compute period expense and income for wallets
    const allTxs = await ctx.db
      .query("transactions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    let expenseSoFar = 0;
    let incomeSoFar = 0;

    for (const tx of allTxs) {
      if (tx.type === "expense") expenseSoFar += tx.amount;
      if (tx.type === "income") incomeSoFar += tx.amount;
    }

    return {
      wallets: wallets.sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0)),
      totalBalance,
      expenseSoFar,
      incomeSoFar,
    };
  },
});

export const seedDefaultWallets = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { count: 0 };

    const existing = await ctx.db
      .query("wallets")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (existing) return { count: 0 };

    const now = Date.now();
    await ctx.db.insert("wallets", {
      userId,
      name: "Primary Bank Account",
      type: "bank",
      balance: 0,
      initialBalance: 0,
      color: "#00F0FF",
      icon: "Building2",
      isDefault: true,
      notes: "Main checking & salary account",
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("wallets", {
      userId,
      name: "Cash in Hand",
      type: "cash",
      balance: 0,
      initialBalance: 0,
      color: "#05DF72",
      icon: "Banknote",
      isDefault: false,
      notes: "Physical cash & daily pocket change",
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("wallets", {
      userId,
      name: "UPI & Digital Wallet",
      type: "wallet",
      balance: 0,
      initialBalance: 0,
      color: "#FFE600",
      icon: "Wallet",
      isDefault: false,
      notes: "Fast UPI / GPay / Paytm payments",
      createdAt: now,
      updatedAt: now,
    });

    return { count: 3 };
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    type: v.union(
      v.literal("bank"),
      v.literal("cash"),
      v.literal("card"),
      v.literal("wallet"),
      v.literal("savings"),
      v.literal("investment")
    ),
    balance: v.number(),
    color: v.string(),
    icon: v.string(),
    accountNumberLast4: v.optional(v.string()),
    isDefault: v.boolean(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    if (args.isDefault) {
      // Unset previous default wallet
      const prevDefaults = await ctx.db
        .query("wallets")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .filter((q) => q.eq(q.field("isDefault"), true))
        .collect();

      for (const w of prevDefaults) {
        await ctx.db.patch(w._id, { isDefault: false });
      }
    }

    const now = Date.now();
    return await ctx.db.insert("wallets", {
      userId,
      name: args.name.trim(),
      type: args.type,
      balance: args.balance,
      initialBalance: args.balance,
      color: args.color,
      icon: args.icon,
      accountNumberLast4: args.accountNumberLast4?.trim() || undefined,
      isDefault: args.isDefault,
      notes: args.notes?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("wallets"),
    name: v.string(),
    type: v.union(
      v.literal("bank"),
      v.literal("cash"),
      v.literal("card"),
      v.literal("wallet"),
      v.literal("savings"),
      v.literal("investment")
    ),
    balance: v.number(),
    color: v.string(),
    icon: v.string(),
    accountNumberLast4: v.optional(v.string()),
    isDefault: v.boolean(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const wallet = await ctx.db.get(args.id);
    if (!wallet || wallet.userId !== userId) {
      throw new Error("Wallet not found or unauthorized");
    }

    if (args.isDefault && !wallet.isDefault) {
      const prevDefaults = await ctx.db
        .query("wallets")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .filter((q) => q.eq(q.field("isDefault"), true))
        .collect();

      for (const w of prevDefaults) {
        await ctx.db.patch(w._id, { isDefault: false });
      }
    }

    await ctx.db.patch(args.id, {
      name: args.name.trim(),
      type: args.type,
      balance: args.balance,
      color: args.color,
      icon: args.icon,
      accountNumberLast4: args.accountNumberLast4?.trim() || undefined,
      isDefault: args.isDefault,
      notes: args.notes?.trim() || undefined,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

export const remove = mutation({
  args: {
    id: v.id("wallets"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const wallet = await ctx.db.get(args.id);
    if (!wallet || wallet.userId !== userId) {
      throw new Error("Wallet not found or unauthorized");
    }

    await ctx.db.delete(args.id);
    return { success: true };
  },
});

export const transfer = mutation({
  args: {
    fromWalletId: v.id("wallets"),
    toWalletId: v.id("wallets"),
    amount: v.number(),
    date: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    if (args.amount <= 0) {
      throw new Error("Transfer amount must be greater than 0");
    }

    if (args.fromWalletId === args.toWalletId) {
      throw new Error("Cannot transfer to the same wallet");
    }

    const fromWallet = await ctx.db.get(args.fromWalletId);
    const toWallet = await ctx.db.get(args.toWalletId);

    if (!fromWallet || fromWallet.userId !== userId) {
      throw new Error("Source wallet not found");
    }
    if (!toWallet || toWallet.userId !== userId) {
      throw new Error("Destination wallet not found");
    }

    // Update balances atomically
    const now = Date.now();
    await ctx.db.patch(args.fromWalletId, {
      balance: fromWallet.balance - args.amount,
      updatedAt: now,
    });

    await ctx.db.patch(args.toWalletId, {
      balance: toWallet.balance + args.amount,
      updatedAt: now,
    });

    // Record internal transfer transaction
    const title = `Transfer: ${fromWallet.name} → ${toWallet.name}`;
    await ctx.db.insert("transactions", {
      userId,
      title,
      amount: args.amount,
      type: "transfer",
      category: "Transfer",
      date: args.date,
      notes: args.notes?.trim() || `Transferred from ${fromWallet.name} to ${toWallet.name}`,
      walletId: args.fromWalletId,
      transferToWalletId: args.toWalletId,
      createdAt: now,
    });

    return {
      success: true,
      fromBalance: fromWallet.balance - args.amount,
      toBalance: toWallet.balance + args.amount,
    };
  },
});
