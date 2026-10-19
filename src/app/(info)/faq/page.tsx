import { Page, Section } from "../prose";

export const metadata = { title: "FAQ — Cabinet" };

export default function FaqPage() {
  return (
    <Page title="FAQ">
      <Section title="What is Cabinet?">
        <p>A wallet for your insurance. Add your policy documents, see the essentials at a glance, and ask anything else.</p>
      </Section>
      <Section title="Where do the answers come from?">
        <p>Only from your own policy documents. Each answer links to the page it&apos;s based on. If your documents don&apos;t settle a question, Cabinet says so rather than guessing.</p>
      </Section>
      <Section title="Is this insurance advice?">
        <p>No. Cabinet helps you understand your documents, but it can&apos;t tell you whether a claim will be paid. For decisions, check with your insurer.</p>
      </Section>
      <Section title="Who can see my documents?">
        <p>Only you. Files are kept in private storage, and every request is checked so that one account can never see another&apos;s data.</p>
      </Section>
      <Section title="What can I add?">
        <p>PDFs up to 15 MB and 50 pages, with selectable text. Scanned images can&apos;t be read yet.</p>
      </Section>
      <Section title="How do I delete a policy?">
        <p>Open it and choose &ldquo;Delete this policy&rdquo; at the bottom. Its document, text, chats, findings and tasks are deleted with it.</p>
      </Section>
      <Section title="What is Demo Mode?">
        <p>A way to try Cabinet with the three fictional sample policies. Answers to a set of prepared questions are ready-made, and nothing is sent to an AI service.</p>
      </Section>
    </Page>
  );
}
