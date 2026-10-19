import { notFound } from "next/navigation";
import { Page } from "../prose";

export const metadata = { title: "Contact us — Cabinet" };

/** Only exists once a real address is configured (CONTACT_EMAIL), so it never pretends to offer support. */
export default function ContactPage() {
  const email = process.env.CONTACT_EMAIL;
  if (!email) notFound();
  return (
    <Page title="Contact us">
      <p className="text-[15px] leading-relaxed text-ink-soft">
        Questions, feedback, or a request to delete your account? Email{" "}
        <a href={`mailto:${email}`} className="font-medium text-ink underline underline-offset-4">
          {email}
        </a>
        .
      </p>
      <p className="text-sm text-ink-faint">Please don&apos;t send policy documents by email.</p>
    </Page>
  );
}
