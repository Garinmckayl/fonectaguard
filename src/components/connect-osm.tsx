"use client";
import { ActionButton } from "./actions";

/** OpenStreetMap connect: a real OAuth2 login on openstreetmap.org, then approved fixes become edits under the owner's own account. */
export function ConnectOsm({ account, configured, flash }: { account: string | null; configured: boolean; flash?: string }) {
  const msg: Record<string, [boolean, string]> = {
    connected: [true, "Connected. Approved fixes will be saved to OpenStreetMap under your account."],
    denied: [false, "Authorisation was cancelled on openstreetmap.org."],
    failed: [false, "OpenStreetMap login failed. Please try again."],
    state_mismatch: [false, "The login session expired. Please try again."],
    not_configured: [false, "OpenStreetMap login is not configured on this server."],
    forbidden: [false, "Your role cannot connect accounts."],
  };
  const m = flash ? msg[flash] : undefined;
  return (
    <div className="mt-3 space-y-3 text-sm">
      {account ? (
        <>
          <p className="text-slate-700">Connected as <b className="text-ink">{account}</b>. Approved fixes are public edits made under this account, each with a changeset comment.</p>
          <ActionButton url="/api/connections/osm/disconnect" label="Disconnect" busyLabel="Disconnecting…" confirm="Remove the stored OpenStreetMap token?" />
        </>
      ) : configured ? (
        <a className="btn btn-primary" href="/api/connections/osm/start">Connect OpenStreetMap</a>
      ) : <p className="text-slate-500">Not configured on this server.</p>}
      {m && <p role="status" className={m[0] ? "font-medium text-emerald-700" : "font-medium text-red-700"}>{m[1]}</p>}
    </div>
  );
}
