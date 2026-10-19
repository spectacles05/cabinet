import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { AppNav } from "@/components/cabinet/app-nav";
import { getAppMode } from "@/lib/ai/mode";

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const { supabase, user } = await getUser();
  if (!user) redirect("/login");
  // Until the first policy is saved there's nothing to browse: the bar keeps just the logo and the account menu.
  const { count } = await supabase.from("policies").select("id", { count: "exact", head: true }).eq("status", "confirmed");
  const firstName = typeof user.user_metadata?.first_name === "string" ? user.user_metadata.first_name : null;
  const initial = (firstName ?? user.email ?? "?").trim().charAt(0).toUpperCase();

  return (
    <div className="flex min-h-full flex-1 flex-col overflow-x-clip">
      <AppNav initial={initial} email={user.email ?? ""} mode={await getAppMode()} contact={Boolean(process.env.CONTACT_EMAIL)} setup={!count} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-10 pt-2 sm:px-6 md:pb-12">{children}</main>
    </div>
  );
}
