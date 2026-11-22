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

export function UserIcon() {
  return (
    <svg className="icon" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="5" r="3.2" fill="currentColor" />
      <path d="M2 15c0-3.6 2.7-5.6 6-5.6s6 2 6 5.6z" fill="currentColor" />
    </svg>
  )
}

export function HammerIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 20 13 11M20 20 11 11" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
      <path d="M10 4l5 5-2 2-5-5zM14 4l-5 5 2 2 5-5z" fill="currentColor" />
    </svg>
  )
}

export function ScanIcon() {
  return (
    <svg className="icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2 5V2h3M11 2h3v3M14 11v3h-3M5 14H2v-3" stroke="currentColor" strokeWidth="1.6" fill="none" />
    </svg>
  )
}

export function EnterIcon() {
  return (
    <svg className="icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M9 2h5v12H9M2 8h8M7 5l3 3-3 3" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round" />
    </svg>
  )
}

export function ShareIcon() {
  return (
    <svg className="icon" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="12" cy="3.5" r="2" fill="currentColor" />
      <circle cx="4" cy="8" r="2" fill="currentColor" />
      <circle cx="12" cy="12.5" r="2" fill="currentColor" />
      <path d="M5.7 7l4.6-2.5M5.7 9l4.6 2.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

export function PotionIcon() {
  return (
    <svg className="icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M6 1.5h4M6.5 1.5v3.2L3 10.5a3.6 3.6 0 0 0 3 4.5h4a3.6 3.6 0 0 0 3-4.5L9.5 4.7V1.5" fill="none" stroke="#fde2e4" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M4 10.2h8a3 3 0 0 1-2.3 3.8H6.3A3 3 0 0 1 4 10.2z" fill="#f43f5e" />
      <circle cx="7" cy="11.6" r="0.7" fill="#fecdd3" />
    </svg>
  )
}

export function SkullIcon() {
  return (
    <svg className="icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 1.5c-3.3 0-5.5 2.2-5.5 5.2 0 1.8.8 3 2 3.7V13a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1v-2.6c1.2-.7 2-1.9 2-3.7 0-3-2.2-5.2-5.5-5.2z" fill="#f3e8ff" stroke="#1a0f2e" strokeWidth="0.9" />
      <circle cx="5.7" cy="7.3" r="1.35" fill="#1a0f2e" />
      <circle cx="10.3" cy="7.3" r="1.35" fill="#1a0f2e" />
      <path d="M7.3 10.2 8 9l.7 1.2zM6.5 14v-1.6M8 14v-1.6M9.5 14v-1.6" stroke="#1a0f2e" strokeWidth="0.8" fill="#1a0f2e" />
    </svg>
  )
}
