import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import Resend from "next-auth/providers/resend"
import Credentials from "next-auth/providers/credentials"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/prisma"

import { withRetry } from "@/lib/prisma"

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
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.RESEND_FROM || "onboarding@resend.dev",
      async sendVerificationRequest({ identifier, url, provider }) {
        if (process.env.NODE_ENV === "development") {
          console.log("-----------------------------------------")
          console.log(`MAGIC LINK FOR ${identifier}:`)
          console.log(url)
          console.log("-----------------------------------------")
          // We no longer return here, so Resend is also called if configured
        }
        
        // Use a premium, branded HTML template for Production
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${provider.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: provider.from,
            to: identifier,
            subject: `Sign in to Distill`,
            html: `
              <div style="background-color: #050505; color: #ffffff; padding: 60px 20px; font-family: sans-serif; text-align: center;">
                <div style="max-width: 480px; margin: 0 auto; background-color: #0a0a0a; border: 1px solid rgba(255,255,255,0.05); padding: 40px; border-radius: 16px;">
                  <div style="margin-bottom: 24px;">
                    <span style="font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.3em; color: #10b981;">Distill Engine</span>
                  </div>
                  <h1 style="font-size: 24px; font-weight: 600; margin-bottom: 16px;">Magic Link</h1>
                  <p style="font-size: 15px; color: #a1a1aa; line-height: 1.6; margin-bottom: 32px;">
                    Click the button below to sign in to your Distill account. For your security, this link will expire in 24 hours.
                  </p>
                  <a href="${url}" style="background-color: #10b981; color: #ffffff; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">
                    Sign in to Distill
                  </a>
                  <p style="font-size: 12px; color: #52525b; margin-top: 40px;">
                    If you didn't request this email, you can safely ignore it.
                  </p>
                </div>
              </div>
            `,
          }),
        })
        if (!res.ok) {
          const errorText = await res.text()
          console.error("Resend API Error:", errorText)
          throw new Error("Resend error: " + errorText)
        }
      },
    }),
    Credentials({
      name: "Developer Access",
      credentials: {
        password: { label: "Password", type: "password" },
        email: { label: "Email Bypass", type: "text" }
      },
      async authorize(credentials) {
        // 1. Password Bypass (dawg)
        if (credentials?.password === "dawg") {
          const targetEmail = (credentials?.email as string) || "operator@distill.agency"
          console.log(`Authorize: Operator Bypass for ${targetEmail}`)
          
          let user = await withRetry(() => prisma.user.findUnique({
            where: { email: targetEmail }
          }))
          
          if (!user && targetEmail === "operator@distill.agency") {
            user = await withRetry(() => prisma.user.create({
              data: {
                id: "operator-uuid",
                name: "Operator",
                email: "operator@distill.agency",
              }
            }))
          }
          
          return user
        }
        return null
      }
    })
  ],
  callbacks: {
    async signIn({ user, account }) {
      try {
        console.log(`SignIn Attempt: ${user.email} via ${account?.provider}`)
        
        // 1. Always allow Developer Access bypass
        if (user.email === "operator@distill.agency") {
          console.log("SignIn: Developer Access granted.")
          return true
        }

        // 2. Check Whitelist for production email/google signups
        if (account?.provider === "google" || account?.provider === "resend") {
          // Development Bypass for User's email
          if (process.env.NODE_ENV === "development" && user.email === "nsikan.design@gmail.com") {
            console.log(`SignIn: Development bypass for ${user.email}`)
            return true
          }

          // Safeguard: Check if model exists on prisma object
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const betaWhitelist = (prisma as any).betaWhitelist;
          if (!betaWhitelist) {
            console.error("Critical: 'betaWhitelist' model not found on Prisma client.")
            return true // Allow in dev if the table is missing
          }

          const whitelisted = await withRetry(() => betaWhitelist.findUnique({
            where: { email: user.email! }
          }))
          
          if (!whitelisted) {
            console.warn(`SignIn: Denied. ${user.email} not in betaWhitelist table.`)
            return false 
          }
          console.log(`SignIn: Success for whitelisted user ${user.email}`)
        }
        return true
      } catch (error) {
        console.error("SignIn Callback Error:", error)
        return false
      }
    },
    async jwt({ token, user, trigger }) {
      try {
        if (user) {
          console.log(`JWT: Hydrating token for user ${user.id}`)
          token.id = user.id
          token.role = (user as { role?: string }).role || "USER"
          
          // Fetch plan safely
          if (user.id) {
            const usage = await withRetry(() => prisma.usage.findUnique({
              where: { userId: user.id }
            }))
            token.plan = usage?.currentPlan || "free"
          } else {
            token.plan = "free"
          }
        }
        return token
      } catch (error) {
        console.error("JWT Callback Error:", error)
        return token
      }
    },
    async session({ session, token }) {
      try {
        if (session.user && token) {
          session.user.id = token.id as string
          (session.user as { role?: string }).role = token.role as string
          (session.user as { plan?: string }).plan = token.plan as string
        }
        return session
      } catch (error) {
        console.error("Session Callback Error:", error)
        return session
      }
    },
  },
  pages: {
    signIn: "/login",
    verifyRequest: "/auth/verify-request",
  },
})
