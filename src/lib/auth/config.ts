import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { canSignIn } from "@/lib/access-control";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async signIn({ user }) {
      return canSignIn(user.email);
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.email = token.email as string;
        session.user.name = (token.name as string) ?? session.user.email;
      }
      return session;
    },
  },
};
