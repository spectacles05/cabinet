"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FIELD_KEYS, POLICY_TYPES, PREMIUM_FREQUENCIES, type FieldKey, type VerifiedExtraction } from "@/lib/extraction/schema";
import type { ReviewedPolicy } from "@/lib/extraction/service";
import { FREQUENCY_LABEL, POLICY_TYPE_LABEL } from "@/lib/format";

type ListKey = "limits" | "inclusions" | "exclusions" | "conditions" | "optional_extensions";
const LIST_KEYS: ListKey[] = ["limits", "inclusions", "exclusions", "conditions", "optional_extensions"];

const NUMBER_FIELDS: FieldKey[] = ["premium_amount", "excess_amount"];
const DATE_FIELDS: FieldKey[] = ["start_date", "end_date", "renewal_date"];

const LABELS: Record<FieldKey, string> = {
  display_name: "Name",
  insurer: "Insurer",
  policy_number: "Policy number",
  insured: "Who's covered",
  start_date: "Starts",
  end_date: "Expires",
  renewal_date: "Renews",
  premium_amount: "Premium",
  premium_frequency: "Paid",
  currency: "Currency",
  excess_amount: "Excess",
};

const GROUPS: { title: string; keys: FieldKey[] }[] = [
  { title: "Policy", keys: ["display_name", "insurer", "policy_number", "insured"] },
  { title: "Dates", keys: ["start_date", "end_date", "renewal_date"] },
  { title: "Cost", keys: ["premium_amount", "premium_frequency", "currency", "excess_amount"] },
];

function itemText(key: ListKey, item: Record<string, unknown>): string {
  if (key === "limits") return String(item.label);
  if (key === "optional_extensions") return String(item.name);
  return String(item.summary);
}

const INPUT = "w-full min-w-0 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-faint";

/** Edit a policy's key details. Starts from what's saved (or what Cabinet read), saves in one go. */
export function ReviewForm({
  documentId,
  verified,
  reviewed,
  policyId,
}: {
  documentId: string;
  verified: VerifiedExtraction;
  reviewed: ReviewedPolicy | null;
  policyId: string | null;
}) {
  const router = useRouter();

  const initialValues = useMemo(() => {
    const v = {} as Record<FieldKey, string>;
    for (const k of FIELD_KEYS) {
      const val = reviewed ? reviewed.fields[k]?.value : verified.fields[k].value;
      v[k] = val === null || val === undefined ? "" : String(val);
    }
    return v;
  }, [verified, reviewed]);

  // Covered items, exclusions and so on aren't edited here: keep whatever is already saved (or everything read).
  const keep = useMemo(() => {
    const out = {} as Record<ListKey, number[]>;
    for (const key of LIST_KEYS) {
      const items = verified[key] as unknown as Record<string, unknown>[];
      const saved = reviewed ? new Set((reviewed[key] as unknown as Record<string, unknown>[]).map((i) => itemText(key, i))) : null;
      out[key] = items.flatMap((item, i) => (!saved || saved.has(itemText(key, item)) ? [i] : []));
    }
    return out;
  }, [verified, reviewed]);

  const [policyType, setPolicyType] = useState<string>(reviewed?.policy_type ?? verified.policy_type);
  // Details people add themselves (not read from the document).
  const [extras, setExtras] = useState({
    nickname: reviewed?.extras?.nickname ?? "",
    emergency_phone: reviewed?.extras?.emergency_phone ?? "",
    excess_percent: reviewed?.extras?.excess_percent == null ? "" : String(reviewed.extras.excess_percent),
  });
  const [values, setValues] = useState(initialValues);
  const [showNumber, setShowNumber] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: FieldKey, v: string) => setValues((prev) => ({ ...prev, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const fields: Record<string, string | number | null> = {};
    for (const k of FIELD_KEYS) {
      const raw = values[k].trim();
      if (!raw) fields[k] = null;
      else if (NUMBER_FIELDS.includes(k)) {
        const n = Number(raw.replace(/,/g, ""));
        if (!Number.isFinite(n)) return setError(`${LABELS[k]} must be a number.`);
        fields[k] = n;
      } else if (k === "currency") fields[k] = raw.toUpperCase();
      else fields[k] = raw;
    }
    const pct = extras.excess_percent.trim();
    const excessPercent = pct ? Number(pct.replace(/%/g, "")) : null;
    if (excessPercent !== null && !Number.isFinite(excessPercent)) return setError("% Excess must be a number.");
    setBusy(true);
    const res = await fetch(`/api/documents/${documentId}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        policy_type: policyType,
        fields,
        keep,
        extras: { nickname: extras.nickname.trim() || null, emergency_phone: extras.emergency_phone.trim() || null, excess_percent: excessPercent },
      }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(body.error ?? "We couldn't save your changes.");
    router.push(`/app/policies/${body.policyId}`);
    router.refresh();
  }

  function field(k: FieldKey) {
    const id = `field-${k}`;
    if (k === "premium_frequency") {
      return (
        <select id={id} value={values[k]} onChange={(e) => set(k, e.target.value)} className={INPUT}>
          <option value="">Not stated</option>
          {PREMIUM_FREQUENCIES.map((fr) => (
            <option key={fr} value={fr}>
              {FREQUENCY_LABEL[fr]}
            </option>
          ))}
        </select>
      );
    }
    if (k === "policy_number" && !showNumber && values[k]) {
      return (
        <span className="flex items-center gap-3">
          <span className="font-mono text-[15px] text-ink">•••• {values[k].replace(/[^A-Za-z0-9]/g, "").slice(-4)}</span>
          <button type="button" onClick={() => setShowNumber(true)} className="text-[13px] font-medium text-ink-soft underline underline-offset-2 hover:text-ink">
            Show
          </button>
        </span>
      );
    }
    return (
      <input
        id={id}
        type={DATE_FIELDS.includes(k) ? "date" : NUMBER_FIELDS.includes(k) ? "number" : "text"}
        inputMode={NUMBER_FIELDS.includes(k) ? "decimal" : undefined}
        step={NUMBER_FIELDS.includes(k) ? "0.01" : undefined}
        min={NUMBER_FIELDS.includes(k) ? "0" : undefined}
        maxLength={k === "currency" ? 3 : 200}
        value={values[k]}
        placeholder="Not stated"
        onChange={(e) => set(k, e.target.value)}
        className={INPUT}
      />
    );
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-4">
      {GROUPS.map((group) => (
        <section key={group.title} aria-label={group.title}>
          <div className="divide-y divide-line overflow-hidden rounded-[22px] bg-surface shadow-[0_1px_2px_rgba(21,23,28,0.05)]">
            {group.title === "Policy" && (
              <Row id="field-nickname" label="Alternate name">
                <input
                  id="field-nickname"
                  value={extras.nickname}
                  maxLength={80}
                  placeholder="A name you'll recognise"
                  onChange={(e) => setExtras({ ...extras, nickname: e.target.value })}
                  className={INPUT}
                />
              </Row>
            )}
            {group.title === "Policy" && (
              <Row id="field-policy_type" label="Type">
                <select id="field-policy_type" value={policyType} onChange={(e) => setPolicyType(e.target.value)} className={INPUT}>
                  {POLICY_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {POLICY_TYPE_LABEL[t]}
                    </option>
                  ))}
                </select>
              </Row>
            )}
            {group.keys.map((k) => {
              const f = verified.fields[k];
              const page = f.check.verified && f.quote ? f.check.page : null;
              return (
                <Row
                  key={k}
                  id={`field-${k}`}
                  label={LABELS[k]}
                  note={f.status === "ambiguous" && f.note ? f.note : null}
                  source={
                    page ? (
                      <a
                        href={`/api/documents/${documentId}/file?page=${page}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`Found on page ${page}: “${f.quote}”`}
                        className="shrink-0 rounded-full px-2 py-1 text-[11px] font-medium text-ink-faint hover:bg-paper hover:text-ink"
                      >
                        p.{page}
                      </a>
                    ) : null
                  }
                >
                  {field(k)}
                </Row>
              );
            })}
            {group.title === "Policy" && (
              <Row id="field-emergency" label="Emergency number">
                <input
                  id="field-emergency"
                  type="tel"
                  value={extras.emergency_phone}
                  maxLength={30}
                  placeholder="Not stated"
                  onChange={(e) => setExtras({ ...extras, emergency_phone: e.target.value })}
                  className={INPUT}
                />
              </Row>
            )}
            {group.title === "Cost" && (
              <Row id="field-excess-percent" label="% Excess">
                <input
                  id="field-excess-percent"
                  inputMode="decimal"
                  value={extras.excess_percent}
                  maxLength={6}
                  placeholder="Not stated"
                  onChange={(e) => setExtras({ ...extras, excess_percent: e.target.value })}
                  className={INPUT}
                />
              </Row>
            )}
          </div>
        </section>
      ))}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-xl items-center gap-3 px-4 py-3">
          {error ? (
            <p role="alert" className="flex-1 text-sm text-danger">
              {error}
            </p>
          ) : (
            <Link href={policyId ? `/app/policies/${policyId}` : "/app"} className="flex-1 text-sm font-medium text-ink-soft hover:text-ink">
              Cancel
            </Link>
          )}
          <button type="submit" disabled={busy} className="cab-press rounded-full bg-ink px-7 py-3 text-[15px] font-semibold text-paper disabled:opacity-60">
            {busy ? "Saving…" : policyId ? "Save changes" : "Add to my wallet"}
          </button>
        </div>
      </div>
    </form>
  );
}

function Row({ id, label, note, source, children }: { id: string; label: string; note?: string | null; source?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="px-5 py-3.5 transition-colors focus-within:bg-paper/60">
      <div className="flex items-center gap-4">
        <label htmlFor={id} className="w-24 shrink-0 text-[14px] text-ink-soft sm:w-[7.5rem]">
          {label}
        </label>
        <div className="min-w-0 flex-1">{children}</div>
        {source}
      </div>
      {note && <p className="mt-1.5 pl-28 text-[12px] leading-snug text-warn sm:pl-[8.5rem]">{note}</p>}
    </div>
  );
}
