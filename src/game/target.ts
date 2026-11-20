import factory from '../../factory.json'

// The game's single target profile, declared in factory.json at the project root. The game is designed only for it:
// desktop = fluid full-viewport canvas, keyboard + mouse; mobile-* = stage with a flexible long axis (shell.css), touch first.
export type Target = 'desktop' | 'mobile-portrait' | 'mobile-landscape'

const targets: readonly Target[] = ['desktop', 'mobile-portrait', 'mobile-landscape']
const declared = factory.target as string

// An unknown value falls back to desktop, with a warning (the Factory harness rejects it).
if (!targets.includes(declared as Target)) {
  console.warn(`factory.json: unknown target "${declared}"; using "desktop". Valid targets: ${targets.join(', ')}.`)
}

export const target: Target = targets.includes(declared as Target) ? (declared as Target) : 'desktop'
export const isMobileTarget = target !== 'desktop'
