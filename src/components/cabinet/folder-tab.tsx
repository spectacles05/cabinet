import Link from "next/link";
import { folderTones } from "./theme";

export type FolderRef = { id: string | null; type: string; label: string };

const TAB = "inline-flex shrink-0 items-center font-semibold uppercase leading-none";
const SIZE = {
  sm: "h-[19px] rounded-t-[6px] px-[7px] text-[10px] tracking-[0.14em]",
  lg: "h-[30px] rounded-t-[9px] px-3.5 text-[11px] tracking-[0.16em]",
};

/** A policy folder's tab, in miniature: the folder's own colour and name. Links to the folder when asked. */
export function FolderTab({ folder, link = false, size = "sm" }: { folder: FolderRef; link?: boolean; size?: keyof typeof SIZE }) {
  const { back, label } = folderTones(folder.type);
  const style = { background: back, color: label };
  return link && folder.id ? (
    <Link href={`/app/policies/${folder.id}`} className={`${TAB} ${SIZE[size]} transition-opacity hover:opacity-75`} style={style}>
      {folder.label}
    </Link>
  ) : (
    <span className={`${TAB} ${SIZE[size]}`} style={style}>
      {folder.label}
    </span>
  );
}
