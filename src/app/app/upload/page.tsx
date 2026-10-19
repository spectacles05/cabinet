import { getAppMode } from "@/lib/ai/mode";
import { UploadForm } from "./upload-form";

export const metadata = { title: "Add a policy — Cabinet" };

export default async function UploadPage() {
  const demo = (await getAppMode()) === "demo";
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-9rem)] max-w-md flex-col justify-center py-6">
      <UploadForm demo={demo} />
    </div>
  );
}
