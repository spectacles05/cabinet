import { Page, Section } from "../prose";

export const metadata = { title: "Terms of use — Cabinet" };

export default function TermsPage() {
  return (
    <Page title="Terms of use" updated="15 October 2026">
      <Section title="Information, not advice">
        <p>
          Cabinet helps you understand your insurance documents. It isn&apos;t an insurance broker, doesn&apos;t give regulated advice and
          can&apos;t promise how an insurer will handle a claim. Always check your policy documents or your insurer before making a decision.
        </p>
        <p>
          Cabinet doesn&apos;t sell insurance, submit claims, negotiate with insurers or contact them for you. When you prepare a claim, it
          gives you a checklist and the relevant wording; you decide whether and how to claim.
        </p>
      </Section>
      <Section title="Answers can be wrong">
        <p>
          Every answer links to the wording it&apos;s based on so you can check it. If something matters, read that wording yourself. Your
          documents always take precedence over anything Cabinet says.
        </p>
      </Section>
      <Section title="A prototype">
        <p>
          Cabinet is a competition prototype. It may change, be unavailable or lose data, and it&apos;s provided as it is, without warranties.
        </p>
      </Section>
      <Section title="Fair use">
        <p>
          Only add documents you&apos;re entitled to share, and use the fictional samples where you can. Don&apos;t add other people&apos;s
          personal data, or try to access data that isn&apos;t yours.
        </p>
      </Section>
    </Page>
  );
}
