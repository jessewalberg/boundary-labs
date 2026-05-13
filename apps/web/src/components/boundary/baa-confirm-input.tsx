import { FileCheck2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type BaaConfirmInputProps = {
  action: (formData: FormData) => void | Promise<void>;
};

export function BaaConfirmInput({ action }: BaaConfirmInputProps) {
  return (
    <form action={action} className="grid gap-3">
      <label className="grid gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-bl-bone-4">
        BAA document hash
        <Input
          name="baaHash"
          autoComplete="off"
          spellCheck={false}
          placeholder="sha256:..."
          className="h-9 text-xs"
          required
        />
      </label>
      <Button type="submit" className="justify-self-start">
        <FileCheck2 size={12} aria-hidden="true" /> Confirm BAA
      </Button>
    </form>
  );
}
