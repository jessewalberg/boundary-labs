"use client";

import { Github, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

const providers = [
  { id: "github", label: "GitHub", icon: Github },
  { id: "google", label: "Google", icon: Mail }
] as const;

export function LoginButtons() {
  return (
    <div className="grid gap-2">
      {providers.map((provider) => {
        const Icon = provider.icon;
        return (
          <Button
            key={provider.id}
            type="button"
            size="lg"
            className="w-full justify-center"
            onClick={() => {
              void authClient.signIn.social({
                provider: provider.id,
                callbackURL: "/dashboard",
                errorCallbackURL: "/login"
              });
            }}
          >
            <Icon size={14} aria-hidden="true" /> Continue with {provider.label}
          </Button>
        );
      })}
    </div>
  );
}
