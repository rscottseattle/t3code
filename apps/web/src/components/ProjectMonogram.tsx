import { cn } from "~/lib/utils";

/**
 * Non-hierarchical project mark for the inbox-style sidebar.
 * Folders imply nesting; a monogram only labels the project.
 */
export function ProjectMonogram({
  label,
  className,
}: {
  readonly label: string;
  readonly className?: string | undefined;
}) {
  const letter = monogramLetter(label);
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-3.5 shrink-0 items-center justify-center rounded-[0.2rem]",
        "bg-foreground/[0.08] text-[0.55rem] font-semibold leading-none text-muted-foreground/80",
        className,
      )}
    >
      {letter}
    </span>
  );
}

function monogramLetter(label: string): string {
  const trimmed = label.trim();
  if (trimmed.length === 0) return "·";
  // Skip common path prefixes / punctuation for a readable first character.
  const match = trimmed.match(/[A-Za-z0-9]/);
  return (match?.[0] ?? trimmed[0] ?? "·").toUpperCase();
}
