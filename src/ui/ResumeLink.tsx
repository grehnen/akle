import { AppLink } from "./AppLink";

/**
 * The way back to an unfinished game, on two lines: what it is in bold, how far it got muted
 * below, and Fortsätt beside both. The spaces between the lines keep them apart when read out.
 */
export function ResumeLink({
  className,
  href,
  what,
  progress,
}: {
  className: string;
  href: string;
  what: string;
  progress: string;
}) {
  return (
    <AppLink className={`resume-link ${className}`} href={href}>
      <strong className="resume-what">{what}</strong>{" "}
      <span className="resume-progress">{progress}</span>{" "}
      <span className="resume-go">Fortsätt</span>
    </AppLink>
  );
}
