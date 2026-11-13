import {
  BookMarked,
  BookOpen,
  File,
  FileText,
  Globe,
  GraduationCap,
  Lightbulb,
  NotebookPen,
  Presentation,
} from "lucide-react";
import type { Kind } from "@/lib/binder";

const ICONS = {
  article: FileText,
  book: BookOpen,
  chapter: BookMarked,
  webpage: Globe,
  lecture: GraduationCap,
  slides: Presentation,
  note: NotebookPen,
  thought: Lightbulb,
  file: File,
} satisfies Record<Kind, unknown>;

/** The icon of a kind of item. */
export function KindIcon({ kind, className }: { kind: Kind; className?: string }) {
  const Icon = ICONS[kind];
  return <Icon className={className} aria-hidden />;
}
