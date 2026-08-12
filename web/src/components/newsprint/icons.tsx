/**
 * Newsprint icon set.
 *
 * The handoff's prototypes use bare glyphs (⚙ ◉ ⌂ ❏ ⌕) and say outright that
 * they are stand-ins to be replaced with the codebase's real icons, kept
 * monochrome. This app had no icon set — the standard skin uses emoji — and
 * emoji are exactly what the paper forbids ("no colour, no emoji"). Several of
 * those glyphs also carry emoji presentation by default, which neither
 * `font-variant-emoji: text` nor a U+FE0E selector reliably overrides.
 *
 * So they are drawn here instead: single-weight strokes in `currentColor`, so
 * a caller sets the tone with `color` alone and active/inactive states come
 * out of the ink scale.
 */

type IconProps = { size?: number; strokeWidth?: number };

function Svg({
  size = 18,
  strokeWidth = 1.4,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      style={{ display: "block" }}
    >
      {children}
    </svg>
  );
}

/**
 * Settings. Drawn as sliders rather than a cog: at 17px a cog's teeth close
 * up into a sun, which is both unreadable and easily mistaken for the theme
 * control sitting next to it in the standard skin.
 */
export function GearIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 8h16M4 16h16" />
      <circle cx="9.5" cy="8" r="2.1" />
      <circle cx="15" cy="16" r="2.1" />
    </Svg>
  );
}

/** Past editions — a stack of filed sheets. */
export function ArchiveIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 7h12v13H6z" />
      <path d="M8.5 4.5h11V17" />
      <path d="M8.6 11h6.8M8.6 14.2h6.8" />
    </Svg>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 10.5 12 4l8 6.5" />
      <path d="M6.2 9.6V20h11.6V9.6" />
    </Svg>
  );
}

/**
 * My library — a bookmark. `filled` inks the flag solid, which is how the
 * reader's save button says "saved" without colour doing the work alone.
 */
export function BookmarkIcon({ filled, ...props }: IconProps & { filled?: boolean }) {
  return (
    <Svg {...props}>
      <path d="M7 4h10v16l-5-4-5 4z" fill={filled ? "currentColor" : undefined} />
    </Svg>
  );
}

/*
 * There was a SpeakerIcon ("듣기") and a MoreIcon ("더보기") here, drawn for
 * the reader's foot bar. Neither had anything behind it: the app has no
 * text-to-speech anywhere (nothing in the codebase touches speechSynthesis)
 * and there is no overflow menu to open. A printed icon for a feature that
 * does not exist is the same promise a fabricated fact is, so the buttons
 * went and the glyphs went with them. Draw them back when there is something
 * to attach them to.
 */

export function BackIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M19 12H5" />
      <path d="M11 6l-6 6 6 6" />
    </Svg>
  );
}
