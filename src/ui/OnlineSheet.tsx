// Online: create a room (code + share link) or join with a code.
import { useState, type FormEvent } from 'react'
import { CODE_LENGTH, normalizeCode } from '../../shared/protocol'
import { ShareIcon } from './icons'
import { Sheet } from './Sheet'

interface Props {
  offline: boolean
  code: string | null // current room, if any
  waiting: boolean
  onCreate: () => void
  onJoin: (code: string) => void
  onShare: () => void
  onLeave: () => void
  onClose: () => void
}

export function OnlineSheet({ offline, code, waiting, onCreate, onJoin, onShare, onLeave, onClose }: Props) {
  const [input, setInput] = useState('')
  const [err, setErr] = useState<string | null>(null)

  const join = (e: FormEvent) => {
    e.preventDefault()
    const c = normalizeCode(input)
    if (!c) return setErr(`Codes are ${CODE_LENGTH} letters and numbers`)
    if (c === code) return onClose()
    onJoin(c)
  }

  if (offline) {
    return (
      <Sheet title="Play online" onClose={onClose}>
        <Offline />
        <div className="btn-row">
          <button type="button" className="btn is-primary" onClick={onClose} data-autofocus>
            OK
          </button>
        </div>
      </Sheet>
    )
  }

  if (code) {
    return (
      <Sheet title="Your room" onClose={onClose}>
        <RoomCode code={code} />
        <p className="sheet-text is-center">{waiting ? 'Send this to a friend. The game starts when they join.' : 'You are in this room.'}</p>
        <div className="btn-row">
          <button type="button" className="btn" onClick={onClose}>
            Done
          </button>
          <button type="button" className="btn is-primary" onClick={onShare} data-autofocus>
            <ShareIcon /> Share link
          </button>
        </div>
        <button type="button" className="link-btn" onClick={onLeave}>
          Leave this room
        </button>
      </Sheet>
    )
  }

  return (
    <Sheet title="Play online" onClose={onClose}>
      <button type="button" className="choice is-big" onClick={onCreate}>
        <span className="choice-icon is-emoji" aria-hidden>
          🧵
        </span>
        <span className="choice-text">
          <span className="choice-label">Create a room</span>
          <span className="choice-blurb">Get a code to send to a friend.</span>
        </span>
      </button>
      <div className="divider" aria-hidden>
        <span>or join one</span>
      </div>
      <form className="join" onSubmit={join}>
        <input
          className="text-input is-code"
          value={input}
          onChange={(e) => {
            setErr(null)
            setInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH))
          }}
          placeholder="K7Q2MX"
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          aria-label="Room code"
          aria-invalid={!!err}
        />
        <button type="submit" className="btn is-primary" disabled={input.length !== CODE_LENGTH}>
          Join
        </button>
      </form>
      {err && <p className="field-error">{err}</p>}
    </Sheet>
  )
}

export function RoomCode({ code }: { code: string }) {
  return (
    <div className="room-code" aria-label={`Room code ${code.split('').join(' ')}`}>
      {code.split('').map((ch, i) => (
        <span key={i} className="room-char">
          {ch}
        </span>
      ))}
    </div>
  )
}

export function Offline() {
  return (
    <div className="offline-note">
      <span className="offline-emoji" aria-hidden>
        🧶
      </span>
      <p>
        <strong>You're offline.</strong> Online play needs data. Computer and Pass & play still work.
      </p>
    </div>
  )
}
