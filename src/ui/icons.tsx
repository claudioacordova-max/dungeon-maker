// Inline SVG icons (no network assets). They take the current text color unless they set their own.
export function HeartIcon({ empty = false }: { empty?: boolean }) {
  return (
    <svg className="icon" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M8 14S1.5 10 1.5 5.6A3.4 3.4 0 0 1 8 4a3.4 3.4 0 0 1 6.5 1.6C14.5 10 8 14 8 14z"
        fill={empty ? 'none' : '#f43f5e'}
        stroke={empty ? 'var(--color-text-muted)' : '#f43f5e'}
        strokeWidth="1.2"
      />
    </svg>
  )
}

export function CrownIcon() {
  return (
    <svg className="icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2 12h12l1-7-4 3-3-5-3 5-4-3z" fill="#facc15" />
    </svg>
  )
}

export function SwordIcon() {
  return (
    <svg className="icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M13.5 1.5 6 9l1 1 7.5-7.5zM4 9.5l2.5 2.5M3 13l2-2" stroke="currentColor" strokeWidth="1.4" fill="none" />
    </svg>
  )
}

export function DoorIcon() {
  return (
    <svg className="icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 14V3a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v11M1.5 14h13" stroke="currentColor" strokeWidth="1.4" fill="none" />
      <circle cx="10" cy="8.5" r="0.9" fill="currentColor" />
    </svg>
  )
}

export function GemIcon() {
  return (
    <svg className="icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4 2h8l3 4-7 8-7-8z" fill="#a78bfa" />
    </svg>
  )
}

export function ExitIcon() {
  return (
    <svg className="icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M6 2H3v12h3M10 5l3 3-3 3M13 8H6" stroke="currentColor" strokeWidth="1.4" fill="none" />
    </svg>
  )
}

export function BowIcon() {
  return (
    <svg className="icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4 2c5 1 9 5 10 10M4 2l10 10M3 6l1-4 4-1" stroke="currentColor" strokeWidth="1.4" fill="none" />
    </svg>
  )
}
