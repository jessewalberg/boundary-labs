import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { ulid } from "ulid";
import { getBoundaryConfig } from "@/server/config";
import {
  assertEmailCanAuthenticate,
  ensureOperatorForAccount
} from "@/server/operators/repository";

const config = getBoundaryConfig();
fs.mkdirSync(path.dirname(config.sqlitePath), { recursive: true });

export const auth = betterAuth({
  baseURL: config.betterAuthUrl,
  secret: config.betterAuthSecret,
  database: new Database(config.sqlitePath),
  trustedOrigins: config.betterAuthUrl ? [config.betterAuthUrl] : undefined,
  emailAndPassword: {
    enabled: process.env.BOUNDARY_ENABLE_PASSWORD_AUTH === "1"
  },
  socialProviders: buildSocialProviders(),
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      const email = typeof ctx.body?.email === "string" ? ctx.body.email : undefined;
      if (email && (ctx.path === "/sign-up/email" || ctx.path === "/sign-in/email")) {
        assertEmailCanAuthenticate(email);
      }
    })
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          assertEmailCanAuthenticate(user.email);
          return { data: { ...user, email: user.email.toLowerCase() } };
        }
      }
    },
    account: {
      create: {
        before: async (account) => {
          const authDb = new Database(config.sqlitePath);
          try {
            const user = authDb.prepare("SELECT id, email, name FROM user WHERE id = ?").get(account.userId) as
              | { id: string; email: string; name: string | null }
              | undefined;

            if (!user) {
              throw new APIError("BAD_REQUEST", { message: "Auth user record is missing." });
            }

            ensureOperatorForAccount(user, {
              userId: account.userId,
              providerId: account.providerId,
              accountId: account.accountId
            });
          } finally {
            authDb.close();
          }
        }
      }
    }
  },
  advanced: {
    database: {
      generateId: () => ulid()
    },
    defaultCookieAttributes: {
      sameSite: "strict",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production"
    }
  },
  plugins: [nextCookies()]
});

function buildSocialProviders() {
  const providers: Record<string, { clientId: string; clientSecret: string }> = {};

  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    providers.github = {
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET
    };
  }

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    providers.google = {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET
    };
  }

  return providers;
}
