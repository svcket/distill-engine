import type { NextAuthConfig } from "next-auth"

export const authConfig = {
  pages: {
    signIn: "/login",
    verifyRequest: "/login/verify",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const isOnDashboard = nextUrl.pathname.startsWith("/sources") || 
                            nextUrl.pathname.startsWith("/exports") ||
                            nextUrl.pathname.startsWith("/settings")

      if (isOnDashboard) {
        if (isLoggedIn) return true
        return false // Redirect unauthenticated users to login page
      } else if (isLoggedIn && nextUrl.pathname === "/login") {
        return Response.redirect(new URL("/sources", nextUrl))
      }
      return true
    },
  },
  session: { strategy: "jwt" },
  providers: [], // Add providers with window/node dependencies in auth.ts
} satisfies NextAuthConfig
