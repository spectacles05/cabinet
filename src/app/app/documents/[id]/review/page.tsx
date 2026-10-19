import Link from "next/link";
import { notFound } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { getLatestExtraction } from "@/lib/extraction/service";
import { HedgehogReading } from "@/components/cabinet/animals";
import { Icon } from "@/components/cabinet/illustrations";
import { ExtractButton } from "./extract-button";
import { ReviewForm } from "./review-form";

export const metadata = { title: "Edit details — Cabinet" };

/** Edit a policy's details (or, for a document not yet in the wallet, read it and add it). */
export default async function EditDetailsPage({ params }: PageProps<"/app/documents/[id]/review">) {
  const { id } = await params;
  const { supabase } = await getUser();
  const { data: doc } = await supabase
    .from("documents")
    .select("id, file_name, page_count, processing_status, error_message, policy_id")
    .eq("id", id)
    .maybeSingle();
  if (!doc) notFound();

  const extraction = await getLatestExtraction(supabase, id);
  const policyId = extraction?.policy_id ?? doc.policy_id;
  const name =
    (extraction?.reviewed?.fields.display_name?.value as string | null | undefined) ??
    (extraction?.verified.fields.display_name.value as string | null | undefined) ??
    doc.file_name;

  return (
    <div className="mx-auto max-w-xl pb-28 pt-2">
      <Link href={policyId ? `/app/policies/${policyId}` : "/app"} className="inline-flex items-center gap-1 text-sm font-medium text-ink-soft hover:text-ink">
        <Icon.Chevron className="h-4 w-4 rotate-180" /> Back
      </Link>
      <h1 className="font-display mt-4 text-[30px] font-normal tracking-tight text-ink">Edit details</h1>
      <p className="mt-1 truncate text-[15px] text-ink-soft">{name}</p>

      {!extraction && (
        <div className="mt-12 flex flex-col items-center text-center">
          <HedgehogReading className="h-32 w-auto" />
          {doc.processing_status === "failed" ? (
            <p className="mt-6 max-w-sm text-sm text-danger">{doc.error_message ?? "This document couldn't be read."}</p>
          ) : (
            <>
              <p className="font-display mt-6 text-[22px] text-ink">Not read yet</p>
              <p className="mt-1 text-sm text-ink-soft">Cabinet will pick out the key details and add it to your wallet.</p>
              {doc.error_message && (
                <p role="alert" className="mt-4 max-w-sm rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">
                  Last attempt failed: {doc.error_message}
                </p>
              )}
              <ExtractButton documentId={doc.id} disabled={doc.processing_status !== "parsed"} />
            </>
          )}
        </div>
      )}

      {extraction && (
        <>
          <ReviewForm
            key={extraction.id}
            documentId={doc.id}
            verified={extraction.verified}
            reviewed={extraction.reviewed}
            policyId={policyId}
          />
          <div className="mt-8 text-center">
            <ExtractButton documentId={doc.id} label="Read the document again" secondary />
          </div>
        </>
      )}
    </div>
  );
}
