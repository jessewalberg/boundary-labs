"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

type AuthMode = "sign-in" | "create-account";

export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isCreatingAccount = mode === "create-account";

  return (
    <form
      className="grid gap-3"
      onSubmit={async (event) => {
        event.preventDefault();
        setError(null);
        setIsSubmitting(true);

        const formData = new FormData(event.currentTarget);
        const email = String(formData.get("email") ?? "").trim().toLowerCase();
        const password = String(formData.get("password") ?? "");
        const name = String(formData.get("name") ?? "").trim() || email;

        try {
          const result = isCreatingAccount
            ? await authClient.signUp.email({
                email,
                password,
                name,
                callbackURL: "/dashboard"
              })
            : await authClient.signIn.email({
                email,
                password,
                callbackURL: "/dashboard"
              });

          if (result.error) {
            setError(result.error.message ?? "Authentication failed.");
            return;
          }

          router.push("/dashboard");
          router.refresh();
        } catch {
          setError("Authentication failed. Check the server and try again.");
        } finally {
          setIsSubmitting(false);
        }
      }}
    >
      <div className="grid gap-2">
        {isCreatingAccount ? (
          <label className="grid gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-bl-bone-4">
            Name
            <Input
              name="name"
              autoComplete="name"
              placeholder="Demo Operator"
              required={isCreatingAccount}
            />
          </label>
        ) : null}
        <label className="grid gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-bl-bone-4">
          Email
          <Input
            name="email"
            type="email"
            autoComplete="email"
            placeholder="operator@example.com"
            required
          />
        </label>
        <label className="grid gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-bl-bone-4">
          Password
          <Input
            name="password"
            type="password"
            autoComplete={isCreatingAccount ? "new-password" : "current-password"}
            minLength={8}
            required
          />
        </label>
      </div>

      {error ? (
        <div role="alert" className="border border-bl-alarm-deep bg-bl-alarm-wash px-3 py-2 text-xs text-bl-bone">
          {error}
        </div>
      ) : null}

      <div className="grid gap-2">
        <Button type="submit" size="lg" className="w-full justify-center" disabled={isSubmitting}>
          {isSubmitting ? "Working..." : isCreatingAccount ? "Create account" : "Sign in"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="w-full justify-center"
          onClick={() => {
            setError(null);
            setMode(isCreatingAccount ? "sign-in" : "create-account");
          }}
          disabled={isSubmitting}
        >
          {isCreatingAccount ? "Use existing account" : "Create account"}
        </Button>
      </div>
    </form>
  );
}
