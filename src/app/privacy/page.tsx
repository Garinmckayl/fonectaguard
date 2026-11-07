import { LegalPage, CONTACT } from "@/components/legal-page";
export const metadata = { title: "Privacy policy · FonectaGuard" };

export default function Privacy() {
  return (
    <LegalPage title="Privacy policy" updated="6 November 2026">
      <p>FonectaGuard is a prototype built for the AI Hackathon 2026 (Fonecta challenge). It checks what AI assistants say about a business and helps correct the sources behind wrong answers. This page says what it stores and why.</p>
      <h2>What we collect</h2>
      <ul>
        <li><b>A website address you enter</b>, and the public business details read from that site (name, address, phone, opening hours).</li>
        <li><b>The questions asked and the answers returned</b> by AI assistants about that business, and our comparison results.</li>
        <li><b>A workspace</b> created for you: a random id kept in a session cookie, and the business details you confirm.</li>
        <li><b>Connection tokens</b> if you connect an account: an OpenStreetMap token, a Facebook Page token (with the Page id and name), or a GitHub Pages repository name. Tokens are encrypted at rest.</li>
        <li><b>Activity records</b> of scans, approvals and edits made through the app.</li>
      </ul>
      <p>From Facebook we receive only what the permissions you approve allow: the list of Pages you fully manage (including Pages owned through a Meta Business portfolio, which is why we ask for the business_management permission, used only to list them) and, for the Page you choose, its name, phone, website and opening hours. We do not read or store your personal profile, friends, posts or messages.</p>
      <h2>What we do with it</h2>
      <p>Only to run the service you asked for: read your public site, ask AI assistants about your business, compare answers with your details, and apply corrections that you approve. We do not sell data, show ads, or build advertising profiles.</p>
      <h2>Who processes it</h2>
      <ul>
        <li>Cloudflare: hosting and the database.</li>
        <li>OpenRouter and the AI models it routes to (Perplexity, OpenAI): they receive the questions and the page text we ask them to read.</li>
        <li>TinyFish: web search and page fetching.</li>
        <li>OpenStreetMap, Facebook (Meta) and GitHub: only when you connect them, to read and edit what you approve.</li>
      </ul>
      <h2>Reports are shareable</h2>
      <p>A free check produces a report page that anyone with its link can open. It contains public information about the business and the AI answers. It is not listed or indexed.</p>
      <h2>Cookies</h2>
      <p>One session cookie to keep you signed in to your workspace, and short-lived cookies (about 10 minutes) while you log in to a connected service. No tracking or advertising cookies.</p>
      <h2>Keeping and deleting data</h2>
      <p>We keep data until you delete it. You can disconnect any account at any time in <a href="/dashboard/connections">Connections</a>, which removes the stored token, and you can delete your whole workspace yourself. See <a href="/data-deletion">how to delete your data</a>.</p>
      <h2>Contact</h2>
      <p>{CONTACT ? <>Questions or requests: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.</> : "Questions or requests: contact the project team through the hackathon submission."}</p>
    </LegalPage>
  );
}
