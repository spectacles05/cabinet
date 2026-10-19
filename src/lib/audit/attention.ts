// What needs the user's attention on Your cover, in one place, so it and the Home page always agree:
// open findings and their quick questions. (Claim deadlines live in Claim Files.)
import { isActiveFinding, type InsightRow } from "./service";

/** Findings for Your cover (renewals live in Notifications). */
export function reviewFindings(insights: InsightRow[]): InsightRow[] {
  return insights.filter((i) => isActiveFinding(i));
}

export function attentionCount(insights: InsightRow[]): number {
  return reviewFindings(insights).length;
}
