// At the dungeon entrance (forest clearing, drawn behind): each hero picks a hero nobody else has, then one of its
// two passives, and presses "Entrar a la mazmorra". The Maestro builds meanwhile; the heroes' match starts when
// everyone is ready.
import { useEffect, useState } from 'react'
import { useNet } from '../net/connection'
import { HERO_CLASSES, type HeroClass, type HeroView, type PassiveId, type Snapshot } from '../shared/protocol'
import { CLASS_PASSIVES } from '../shared/rules'
import { PassiveIcon } from './icons'
import { art, CLASS_NAME, CLASS_TAG, PASSIVE_INFO, PHOTO, PLAYER_COLORS } from './screens'

export default function EntrancePick({ s, own }: { s: Snapshot; own: HeroView }) {
  const send = useNet((st) => st.send)
  const players = useNet((st) => st.players)
  const ready = !s.introWaiting.includes(own.id)
  // Taps light up at once; the snapshot confirms (or a refused pick falls back to what the server has).
  const [want, setWant] = useState<{ cls?: HeroClass; passive?: PassiveId; at: number } | null>(null)
  useEffect(() => {
    if (!want) return
    const t = setTimeout(() => setWant(null), 1200)
    return () => clearTimeout(t)
  }, [want])
  const cls = want?.cls ?? (own.chosen ? own.cls : null)
  const passive = want?.passive ?? (want?.cls && want.cls !== own.cls ? null : own.passive)
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? '?'
  const colorOf = (id: string) => PLAYER_COLORS[players.find((p) => p.id === id)?.color ?? 0]
  const takenBy = (c: HeroClass) => s.heroes.find((h) => h.id !== own.id && h.chosen && h.cls === c)

  function pickClass(c: HeroClass) {
    if (ready || takenBy(c)) return
    setWant({ cls: c, at: performance.now() })
    send({ type: 'class', cls: c })
  }
  function pickPassive(p: PassiveId) {
    if (ready) return
    setWant({ cls: cls ?? undefined, passive: p, at: performance.now() })
    send({ type: 'passive', passive: p })
  }

  const waiting = s.introWaiting.filter((id) => id !== own.id)
  return (
    <div className="entrance" role="dialog" aria-label="Elige tu héroe">
      <div className="entrance-card">
        <ul className="entrance-party" aria-label="El grupo">
          {s.heroes.map((h) => {
            const done = !s.introWaiting.includes(h.id)
            return (
              <li key={h.id} className={done ? 'is-ready' : ''}>
                <span className="player-dot" style={{ background: colorOf(h.id) }} />
                <span className="entrance-party-name">{nameOf(h.id)}</span>
                <span className="entrance-party-pick">{h.chosen ? CLASS_NAME[h.cls] : '…'}</span>
                {done && <span className="entrance-check">✓</span>}
              </li>
            )
          })}
        </ul>

        {ready ? (
          <p className="entrance-wait">
            {waiting.length > 0 ? `Esperando a ${waiting.map(nameOf).join(', ')}…` : '¡Adentro!'}
          </p>
        ) : (
          <>
            <h2 className="entrance-title">{cls ? 'Elige tu pasiva' : 'Elige tu héroe'}</h2>
            <div className={cls ? 'hero-picks is-compact' : 'hero-picks'} role="group" aria-label="Héroes">
              {HERO_CLASSES.map((c) => {
                const taken = takenBy(c)
                const sel = cls === c
                return (
                  <button
                    key={c}
                    type="button"
                    className={['hero-pick', sel ? 'is-selected' : '', taken ? 'is-taken' : ''].join(' ')}
                    aria-pressed={sel}
                    disabled={!!taken}
                    onClick={() => pickClass(c)}
                  >
                    <img className="hero-pick-photo" src={art(PHOTO[c])} alt="" />
                    <b>{CLASS_NAME[c]}</b>
                    <small style={taken ? { color: colorOf(taken.id) } : undefined}>{taken ? nameOf(taken.id) : CLASS_TAG[c]}</small>
                  </button>
                )
              })}
            </div>
            {cls && (
              <div className="passive-picks" role="group" aria-label="Pasivas">
                {CLASS_PASSIVES[cls].map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={passive === p ? 'passive-pick is-selected' : 'passive-pick'}
                    aria-pressed={passive === p}
                    onClick={() => pickPassive(p)}
                  >
                    <span className="passive-badge">
                      <PassiveIcon id={p} />
                    </span>
                    <span className="passive-text">
                      <b>{PASSIVE_INFO[p].name}</b>
                      <small>{PASSIVE_INFO[p].text}</small>
                    </span>
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              className="ui-button ui-button-primary"
              disabled={!own.chosen || !own.passive || cls !== own.cls || passive !== own.passive}
              onClick={() => send({ type: 'introReady' })}
            >
              Entrar a la mazmorra
            </button>
          </>
        )}
      </div>
    </div>
  )
}
