import { LegalPage } from "@/components/legal";

export const metadata = { title: "Privacy Policy" };

export default function Privacy() {
  return (
    <LegalPage title="Privacy Policy" updated="October 2026">
      <p>This explains what RecruitGPT.ai collects and how it is handled. This is a working draft and should be reviewed by counsel before launch.</p>
      <h2>What we store</h2>
      <ul>
        <li><b>Account data:</b> name, email, hashed password, workspace and role.</li>
        <li><b>Recruiting data you create or import:</b> candidates, contacts, clients, roles, messages, notes, interviews.</li>
        <li><b>Integration credentials:</b> OAuth tokens and API keys, stored encrypted (AES-256-GCM) and never shown back in the app.</li>
        <li><b>Usage and audit logs:</b> AI usage, sourcing runs, sign-ins and approvals, for cost control and security.</li>
      </ul>
      <h2>Candidate data</h2>
      <p>Candidate information is collected from sources you direct us to (your own signed-in LinkedIn/Indeed session, Apollo, web search, CSV imports). You are the controller of that data and we act as your processor. Candidates can ask you to delete their data or stop contacting them; use the do-not-contact list and delete functions in the app. Replies containing STOP or similar opt-outs are added to your do-not-contact list automatically.</p>
      <h2>Isolation</h2>
      <p>Every record belongs to one workspace, and all queries are scoped to that workspace. We do not share your data with other customers.</p>
      <h2>AI processing</h2>
      <p>Candidate and role text is sent to our AI provider to produce scores, briefs and drafts. It is not used by us to train models, and we use a provider agreement that restricts training on our data.</p>
      <h2>The local helper</h2>
      <p>The helper runs on your computer, reads pages in your own browser when instructed by your workspace, and returns the visible text to your workspace. It does not store your LinkedIn or Indeed password.</p>
      <h2>Retention and deletion</h2>
      <p>Data is retained while your workspace is active. On cancellation, you may export your data and request deletion; backups are purged on a rolling schedule.</p>
      <h2>Security</h2>
      <p>HTTPS everywhere, hashed passwords, encrypted secrets, role-based access, rate limiting and audit logging.</p>
    </LegalPage>
  );
}
