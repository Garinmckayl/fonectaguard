import { LegalPage } from "@/components/legal-page";
export const metadata = { title: "Terms of service · FonectaGuard" };

export default function Terms() {
  return (
    <LegalPage title="Terms of service" updated="6 November 2026">
      <p>FonectaGuard is a hackathon prototype. By using it you agree to these terms.</p>
      <h2>Use it on businesses you are entitled to act for</h2>
      <p>Anyone may run a read-only check on a public website. Only connect accounts and approve changes for a business, Page or map entry you own or are authorised to manage.</p>
      <h2>You approve every change</h2>
      <p>Nothing is changed on a connected service until you press Approve. Changes to OpenStreetMap are public edits under your own account; changes to a Facebook Page or website are live. You are responsible for the changes you approve.</p>
      <h2>AI answers can be wrong</h2>
      <p>Answers come from AI models and can vary between runs. Reports show what the assistants said, compared with what the business publishes. They are information, not advice or a guarantee.</p>
      <h2>No warranty</h2>
      <p>The service is provided as is, without warranties, and may change or stop at any time. To the extent the law allows, we are not liable for losses arising from its use.</p>
      <h2>Misuse</h2>
      <p>Do not use the service to harass, to submit false information, or to overload it. We may rate-limit or block misuse.</p>
      <p>See also the <a href="/privacy">privacy policy</a>.</p>
    </LegalPage>
  );
}
