import { LegalPage, CONTACT } from "@/components/legal-page";
export const metadata = { title: "Delete your data · FonectaGuard" };

export default function DataDeletion() {
  return (
    <LegalPage title="Delete your data" updated="6 November 2026">
      <p>You can remove your data yourself, immediately, without contacting anyone.</p>
      <h2>1. Delete everything (recommended)</h2>
      <p>Sign in, open <a href="/dashboard/settings">Settings</a>, and use <b>Delete my workspace</b> at the bottom. It permanently deletes your business details, scans, AI checks and shareable reports, and every stored connection token, and signs you out.</p>
      <h2>2. Only remove a connection</h2>
      <p>Open <a href="/dashboard/connections">Connections</a> and press <b>Disconnect</b> on Facebook or OpenStreetMap. The stored token is removed at once.</p>
      <h2>3. Also revoke access on the other service</h2>
      <ul>
        <li><b>Facebook:</b> Facebook Settings → Business Integrations (or Apps and Websites) → remove FonectaGuard.</li>
        <li><b>OpenStreetMap:</b> openstreetmap.org → My Settings → OAuth 2 applications → Authorized applications → revoke.</li>
      </ul>
      <p>Edits already published to a Facebook Page or to OpenStreetMap stay there; they belong to that service and can be changed or reverted there.</p>
      <h2>Can&apos;t sign in?</h2>
      <p>{CONTACT ? <>Email <a href={`mailto:${CONTACT}`}>{CONTACT}</a> from the address connected to the workspace and ask for deletion.</> : "Contact the project team through the hackathon submission and ask for deletion."}</p>
    </LegalPage>
  );
}
