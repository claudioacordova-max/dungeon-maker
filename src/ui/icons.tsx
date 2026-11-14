// Inline SVG icons (no network assets). They take the current text color.
export function ClockIcon() {
  return (
    <svg className="icon" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 4.5V8l2.5 1.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function CubeIcon() {
  return (
    <svg className="icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 1.5 14 4.75v6.5L8 14.5l-6-3.25v-6.5z" fill="var(--color-accent)" />
      <path d="M8 8v6.5M8 8l6-3.25M8 8 2 4.75" fill="none" stroke="var(--color-bg)" strokeWidth="0.75" />
    </svg>
  )
}

export function PauseIcon() {
  return (
    <svg className="icon" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="3" y="2" width="3.5" height="12" rx="1" fill="currentColor" />
      <rect x="9.5" y="2" width="3.5" height="12" rx="1" fill="currentColor" />
    </svg>
  )
}
