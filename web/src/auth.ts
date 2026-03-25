import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import Resend from "next-auth/providers/resend"
import Credentials from "next-auth/providers/credentials"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/prisma"

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
    Resend({
      from: "no-reply@distill.agency",
    }),
    Credentials({
      name: "Developer Access",
      credentials: {
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (credentials?.password === "dawg") {
          // Hardcheck for development bypass
          let user = await prisma.user.findUnique({
            where: { email: "operator@distill.agency" }
          })
          
          if (!user) {
            user = await prisma.user.create({
              data: {
                id: "operator-uuid",
                name: "Operator",
                email: "operator@distill.agency",
              }
            })
          }
          
          return user
        }
        return null
      }
    })
  ],
  callbacks: {
    async signIn({ user, account }) {
      // 1. Always allow Developer Access bypass
      if (user.email === "operator@distill.agency") return true

      // 2. Check Whitelist for production email/google signups
      if (account?.provider === "google" || account?.provider === "resend") {
        const whitelisted = await (prisma as any).betaWhitelist.findUnique({
          where: { email: user.email! }
        })
        if (!whitelisted) return false // Deny access
      }
      return true
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = (user as { role?: string }).role || "USER"
        
        // Fetch plan
        const usage = await prisma.usage.findUnique({
          where: { userId: user.id }
        })
        token.plan = usage?.currentPlan || "free"
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        (session.user as { role?: string }).role = token.role as string
        (session.user as { plan?: string }).plan = token.plan as string
      }
      return session
    },
  },
  pages: {
    signIn: "/login",
  },
})
