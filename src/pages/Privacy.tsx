import { Link } from "react-router-dom";

import { LegalLayout, LegalSection } from "@/components/legal/LegalLayout";
import { LEGAL } from "@/lib/legal";
import { usePageMeta } from "@/lib/usePageMeta";

export function Privacy() {
  usePageMeta(
    "Privacy Policy · BranchChat",
    "How BranchChat collects, uses, and protects your information.",
  );
  return (
    <LegalLayout title="Privacy Policy" updated={LEGAL.effectiveDate}>
      <p className="text-sm leading-relaxed text-muted-foreground">
        This Privacy Policy explains how {LEGAL.entity} ("{LEGAL.product},"
        "we," "us") collects, uses, and protects your information when you use
        our website and product at {LEGAL.website}. {LEGAL.product} is in early
        access, and this policy may evolve as the product does.
      </p>

      <LegalSection heading="Information we collect">
        <p>
          <strong className="text-foreground">Information you provide:</strong>
        </p>
        <ul>
          <li>
            <strong className="text-foreground">Waitlist</strong> — the email
            address you submit to request early access.
          </li>
          <li>
            <strong className="text-foreground">Account</strong> — if you
            create an account, your email address and a securely hashed
            password.
          </li>
          <li>
            <strong className="text-foreground">Conversations</strong> — the
            prompts and content you enter into the chat. Your conversation tree
            is stored locally in your browser; when you request an AI response,
            the relevant content is sent to our backend and AI provider to
            generate a reply. For signed-in users, chats are also backed up to
            our servers so they follow you across devices — encrypted at rest,
            so database access alone cannot read them. Deleting a chat in the
            app deletes the server copy too.
          </li>
        </ul>
        <p>
          <strong className="text-foreground">
            Information collected automatically (only with your consent):
          </strong>
        </p>
        <ul>
          <li>
            <strong className="text-foreground">Product analytics</strong> (via
            PostHog) — pages and features viewed, clicks and interactions,
            device and browser type, and approximate location derived from your
            IP address.
          </li>
          <li>
            <strong className="text-foreground">Session recordings</strong> —
            replays of your interactions, used to improve usability.{" "}
            <strong className="text-foreground">
              We mask all text and inputs inside the chat workspace
            </strong>
            , so your conversation content is not captured in recordings.
          </li>
          <li>
            <strong className="text-foreground">
              Cookies and local storage
            </strong>{" "}
            — see "Cookies and analytics" below.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="How we use your information">
        <ul>
          <li>To provide, operate, secure, and maintain the service.</li>
          <li>To respond to waitlist and early-access requests.</li>
          <li>
            To understand usage and improve the product (analytics, with your
            consent).
          </li>
          <li>
            To detect, prevent, and address abuse, fraud, and security issues.
          </li>
          <li>To communicate with you about the service.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="AI processing">
        <p>
          To generate responses, the content you submit in a conversation is
          sent to our backend and to our third-party AI provider (Google
          Gemini). Please do not enter sensitive personal information you would
          not want processed by an AI service. AI output may be inaccurate — see
          our <Link to="/terms">Terms of Service</Link>.
        </p>
      </LegalSection>

      <LegalSection heading="Cookies and analytics">
        <p>
          We use cookies and local storage that are strictly necessary to run
          the site (for example, to keep you signed in and to remember your
          consent choice) and — only with your consent — analytics storage used
          by PostHog for product analytics and session replay.
        </p>
        <p>
          When you first visit, we ask for your consent before enabling
          non-essential analytics and session recording. You can change or
          withdraw your consent at any time using the{" "}
          <strong className="text-foreground">"Cookie settings"</strong> link in
          the footer.
        </p>
      </LegalSection>

      <LegalSection heading="Legal bases (EEA / UK)">
        <p>
          If you are in the EEA or UK, we process personal data on these bases:
          your <strong className="text-foreground">consent</strong> (analytics
          and session recording); <strong className="text-foreground">
          performance of a contract</strong> (to provide the service you
          request); and our{" "}
          <strong className="text-foreground">legitimate interests</strong> (to
          secure and improve the service). You may withdraw consent at any time.
        </p>
      </LegalSection>

      <LegalSection heading="How we share information">
        <p>
          We do not sell your personal data. We share it with service providers
          ("processors") that help us operate {LEGAL.product}, under appropriate
          agreements:
        </p>
        <ul>
          <li>
            <strong className="text-foreground">PostHog</strong> — product
            analytics and session replay (data hosted in the United States).
          </li>
          <li>
            <strong className="text-foreground">Google (Gemini)</strong> — AI
            response generation.
          </li>
          <li>
            <strong className="text-foreground">Railway and Supabase</strong> —
            application hosting and database.
          </li>
        </ul>
        <p>
          We may also disclose information where required to comply with law or
          to protect our rights, users, or the public.
        </p>
      </LegalSection>

      <LegalSection heading="International transfers">
        <p>
          Our providers may process data in the United States and other
          countries. Where required, we rely on appropriate safeguards for such
          transfers.
        </p>
      </LegalSection>

      <LegalSection heading="Data retention">
        <p>
          We keep personal data only as long as needed for the purposes
          described here. Analytics and session-recording data are retained
          according to our PostHog plan's retention period; waitlist and account
          data are kept until you ask us to delete them or your account is
          closed.
        </p>
      </LegalSection>

      <LegalSection heading="Your rights">
        <p>
          Depending on where you live (for example, under the GDPR or CCPA), you
          may have the right to access, correct, delete, export, or restrict
          processing of your personal data, to object to processing, and to
          withdraw consent. To exercise any of these rights, contact us at{" "}
          <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>.
          EEA/UK residents may also lodge a complaint with their local data
          protection authority.
        </p>
      </LegalSection>

      <LegalSection heading="Security">
        <p>
          We use reasonable technical and organizational measures — including
          encryption in transit, hashed passwords, and least-privilege database
          access — to protect your information. No method of transmission or
          storage is completely secure.
        </p>
      </LegalSection>

      <LegalSection heading="Children">
        <p>
          {LEGAL.product} is not directed to children under 16, and we do not
          knowingly collect their personal data.
        </p>
      </LegalSection>

      <LegalSection heading="Changes to this policy">
        <p>
          We may update this policy from time to time. We will revise the "Last
          updated" date above and, for material changes, provide additional
          notice.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          Questions or requests about this policy:{" "}
          <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
