import { getUser } from "@/lib/supabase/server";
import { getAppMode, modeSetting } from "@/lib/ai/mode";
import { DemoTools } from "@/components/cabinet/mode-controls";
import { ProfileForm } from "./profile-form";

export const metadata = { title: "Profile — Cabinet" };

export default async function ProfilePage() {
  const { user } = await getUser();
  const firstName = typeof user?.user_metadata?.first_name === "string" ? (user.user_metadata.first_name as string) : "";
  const email = user?.email ?? "";
  const setting = modeSetting();

  return (
    <div className="mx-auto max-w-xl space-y-8 pb-12 pt-4">
      <header className="cab-rise flex flex-col items-center text-center">
        <span className="font-display grid h-20 w-20 place-items-center rounded-full bg-surface text-[32px] text-ink shadow-sm">
          {(firstName || email || "?").charAt(0).toUpperCase()}
        </span>
        <h1 className="font-display mt-4 text-[28px] font-normal tracking-tight text-ink">{firstName || "Your profile"}</h1>
      </header>

      <ProfileForm firstName={firstName} email={email} />

      {/* Demo tools (switch, reset, run history) exist only where the site isn't fixed to Live AI. */}
      {setting !== "live" && <DemoTools mode={await getAppMode()} switchable={setting === "switchable"} />}

    </div>
  );
}
