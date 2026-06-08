import { Link } from "react-router-dom";

import { LegalLayout, LegalSection } from "@/components/legal/LegalLayout";
import { LEGAL } from "@/lib/legal";

export function Terms() {
  return (
    <LegalLayout title="Terms of Service" updated={LEGAL.effectiveDate}>
      <p className="text-sm leading-relaxed text-muted-foreground">
        These Terms of Service ("Terms") govern your access to and use of{" "}
        {LEGAL.product} and our website at {LEGAL.website}, provided by{" "}
        {LEGAL.entity} ("we," "us"). By using {LEGAL.product}, you agree to these
        Terms. If you do not agree, do not use the service.
      </p>

      <LegalSection heading="Early access">
        <p>
          {LEGAL.product} is in early access and is provided on an "as is" and
          "as available" basis. Features may change, break, or be discontinued
          at any time, and the service may be unavailable.
        </p>
      </LegalSection>

      <LegalSection heading="Eligibility">
        <p>
          You must be at least 16 years old (or the age of digital consent in
          your country) to use {LEGAL.product}.
        </p>
      </LegalSection>

      <LegalSection heading="Accounts and access">
        <p>
          Some areas require an account or access credentials. You are
          responsible for keeping your credentials secure and for activity under
          your account. Notify us promptly of any unauthorized use.
        </p>
      </LegalSection>

      <LegalSection heading="Acceptable use">
        <p>You agree not to:</p>
        <ul>
          <li>use the service unlawfully or to harm others;</li>
          <li>
            attempt to disrupt, overload, or gain unauthorized access to the
            service;
          </li>
          <li>
            reverse engineer or scrape the service except as permitted by law;
          </li>
          <li>
            use it to generate unlawful, infringing, or abusive content; or
          </li>
          <li>violate the terms of any underlying AI provider.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="Your content">
        <p>
          You retain ownership of the prompts and content you submit ("Your
          Content"). You grant us a limited license to process Your Content
          solely to operate and improve the service. You are responsible for
          Your Content and for ensuring you have the rights to submit it.
        </p>
      </LegalSection>

      <LegalSection heading="AI-generated output">
        <p>
          {LEGAL.product} uses third-party AI models to generate responses.
          Output may be inaccurate, incomplete, or otherwise unsuitable, and is
          not professional advice. You are responsible for evaluating and using
          any output. See our <Link to="/privacy">Privacy Policy</Link> for how
          conversation content is processed.
        </p>
      </LegalSection>

      <LegalSection heading="Intellectual property">
        <p>
          The service, including its software, design, and branding, is owned by
          {" "}
          {LEGAL.entity} and protected by applicable law. These Terms do not
          grant you any rights to our intellectual property except to use the
          service as permitted.
        </p>
      </LegalSection>

      <LegalSection heading="Third-party services">
        <p>
          The service relies on third-party providers (for example, AI, hosting,
          and analytics). We are not responsible for third-party services, and
          their terms may also apply to your use.
        </p>
      </LegalSection>

      <LegalSection heading="Disclaimers">
        <p>
          To the maximum extent permitted by law, the service is provided "as
          is" and "as available" without warranties of any kind, whether express
          or implied, including fitness for a particular purpose and
          non-infringement.
        </p>
      </LegalSection>

      <LegalSection heading="Limitation of liability">
        <p>
          To the maximum extent permitted by law, {LEGAL.entity} will not be
          liable for any indirect, incidental, special, consequential, or
          punitive damages, or for any loss of data or profits, arising from or
          related to your use of the service.
        </p>
      </LegalSection>

      <LegalSection heading="Termination">
        <p>
          We may suspend or terminate your access at any time, including for
          violation of these Terms. You may stop using the service at any time.
        </p>
      </LegalSection>

      <LegalSection heading="Governing law">
        <p>
          These Terms are governed by the laws of {LEGAL.jurisdiction}, without
          regard to its conflict-of-laws rules.
        </p>
      </LegalSection>

      <LegalSection heading="Changes to these Terms">
        <p>
          We may update these Terms from time to time. We will revise the "Last
          updated" date above and, for material changes, provide notice.
          Continued use of the service means you accept the updated Terms.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          Questions about these Terms:{" "}
          <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
