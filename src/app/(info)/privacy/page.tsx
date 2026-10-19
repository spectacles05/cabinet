import { Page, Section } from "../prose";

export const metadata = { title: "Privacy policy — Cabinet" };

export default function PrivacyPage() {
  return (
    <Page title="Privacy policy" updated="15 October 2026">
      <Section title="A prototype">
        <p>
          Cabinet is a prototype built for the 2026 Shenzhen FinTechathon. Please use the fictional sample policies, and don&apos;t add real
          documents containing your own or anyone else&apos;s personal details.
        </p>
      </Section>
      <Section title="What we keep">
        <p>
          Your email address and, if you add it, your first name. The documents you add, the text read from them and the details saved
          from them. Your questions and the answers. Findings and tasks from reviews. Claims you prepare: what you describe, your answers
          and your checklist.
        </p>
        <p>
          If a claim involves an injury or illness, please share only what&apos;s needed to prepare it: health details are sensitive.
        </p>
        <p>
          A technical log of each step the service runs (timings, counts and outcomes) so it can be checked and improved. It never contains
          your document text, names, addresses, policy numbers or questions.
        </p>
      </Section>
      <Section title="Where it&apos;s kept">
        <p>
          With Supabase (database and private file storage). Access is restricted so each account can only reach its own data. The app is
          hosted by Vercel.
        </p>
      </Section>
      <Section title="AI processing">
        <p>
          To read policies, answer questions and prepare claims, text from your documents, your questions and what you describe are sent
          to Anthropic&apos;s API to produce a reply, and may be processed outside your country, including in the US. Under
          Anthropic&apos;s commercial terms it isn&apos;t used to train its models. In Demo Mode, nothing is sent to Anthropic.
        </p>
      </Section>
      <Section title="Cookies">
        <p>Only what&apos;s needed to keep you signed in and remember your Demo or Live AI choice. No advertising or tracking cookies.</p>
      </Section>
      <Section title="Deleting your data">
        <p>
          Deleting a policy permanently removes its document, text, chats, findings, tasks and claims. You can delete a claim on its own
          at any time. To have your whole account deleted, contact us.
        </p>
      </Section>
    </Page>
  );
}
