import { LegalPage } from "@/components/legal";

export const metadata = { title: "Platform compliance" };

export default function Compliance() {
  return (
    <LegalPage title="Platform compliance: LinkedIn, Indeed and outreach" updated="October 2026">
      <p>Automating third-party platforms carries account and legal risk. This is our documented position. It is a working draft and should be reviewed by counsel before launch.</p>
      <h2>Our stance</h2>
      <ul>
        <li><b>Your account, your session.</b> Browser actions run in your own signed-in browser, from your own connection, under your own LinkedIn Recruiter or Indeed licence. We never ask for or store your platform password.</li>
        <li><b>Human in the loop.</b> Searches are started by you. Every outbound message must be approved by a recruiter before it is sent.</li>
        <li><b>No bypassing.</b> If a site shows a CAPTCHA, verification or security checkpoint, the Service stops, tells you, and waits for you to resolve it yourself. It never attempts to solve or evade these checks.</li>
        <li><b>Rate limits.</b> The local helper paces itself like a person and enforces hard hourly limits. Daily send caps apply per channel (LinkedIn 25, email 150, SMS 100).</li>
        <li><b>Opt-outs.</b> STOP and unsubscribe replies are detected by fixed rules, not AI, and placed on the do-not-contact list, which is re-checked at send time.</li>
        <li><b>Compensation.</b> Pay is only ever mentioned in outreach when the role is explicitly set to allow disclosure.</li>
      </ul>
      <h2>Your responsibilities</h2>
      <p>Review LinkedIn&apos;s and Indeed&apos;s current terms for your plan. Use the Service for legitimate recruiting only. Comply with applicable anti-spam (CAN-SPAM, TCPA for SMS, CASL, GDPR) and anti-discrimination law for your jurisdiction.</p>
      <h2>If a platform objects</h2>
      <p>If LinkedIn or Indeed restricts an account, stop using the helper on it and contact us. We will not help circumvent a restriction.</p>
    </LegalPage>
  );
}
