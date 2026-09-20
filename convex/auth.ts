import Google from "@auth/core/providers/google";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Google({
      profile(googleProfile) {
        return {
          id: googleProfile.sub,
          name: googleProfile.name,
          email: googleProfile.email,
          image: googleProfile.picture,
        };
      },
    }),
    Password,
  ],
  callbacks: {
    async createOrUpdateUser(ctx, args) {
      if (args.existingUserId) {
        const existingUser = await ctx.db.get(args.existingUserId);
        const updates: any = {};
        const profile = args.profile as any;

        // Never overwrite an existing user's custom name if they already have one
        if (!existingUser?.name && profile?.name) {
          updates.name = profile.name;
        }
        if (!existingUser?.email && profile?.email) {
          updates.email = profile.email;
        }
        if (!existingUser?.image && (profile?.picture || profile?.image)) {
          updates.image = profile.picture || profile.image;
        }
        if (Object.keys(updates).length > 0) {
          await ctx.db.patch(args.existingUserId, updates);
        }
        return args.existingUserId;
      }
      const profile = args.profile as any;
      return ctx.db.insert("users", {
        name: profile?.name,
        email: profile?.email,
        image: profile?.picture || profile?.image,
      });
    },
  },
});
