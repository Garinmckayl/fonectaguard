"use client";
import { CopyBlock } from "./copy-block";

export function AccessLink({ token }: { token: string }) {
  const url = `${typeof window === "undefined" ? "https://fonectaguard.arcumet.com" : window.location.origin}/api/auth/restore?t=${encodeURIComponent(token)}`;
  return (
    <div className="space-y-2 text-sm">
      <p className="text-slate-700">There are no passwords here: your workspace is remembered by this browser. Save this private link to open the same workspace from another browser or device, or if this one forgets you.</p>
      <p className="font-semibold text-[#9B1C12]">Treat it like a password. Anyone who has it can open and change this workspace. Deleting the workspace makes it stop working.</p>
      <CopyBlock text={url} label="Copy link" />
    </div>
  );
}
