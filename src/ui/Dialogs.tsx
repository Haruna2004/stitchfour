// Small sheets: mode, difficulty, rename, confirm, reactions.
import { useState, type FormEvent, type ReactNode } from 'react'
import type { Level } from '../bot/search'
import { LEVELS, LEVEL_INFO } from '../lib/levels'
import type { Mode } from '../lib/settings'
import { NAME_MAX, REACTIONS, cleanName } from '../../shared/protocol'
import { ComputerIcon, OnlineIcon, PassIcon } from './icons'
import { Sheet } from './Sheet'

export const MODE_INFO: Record<Mode, { label: string; blurb: string; icon: ReactNode }> = {
  bot: { label: 'vs Computer', blurb: 'Play the bot. Works offline.', icon: <ComputerIcon /> },
  local: { label: 'Pass & play', blurb: 'Two players, one device.', icon: <PassIcon /> },
  online: { label: 'Online', blurb: 'Invite a friend with a code.', icon: <OnlineIcon /> },
}

export function ModeOptions({ mode, onPick }: { mode: Mode; onPick: (m: Mode) => void }) {
  return (
    <div className="choice-list" role="list">
      {(Object.keys(MODE_INFO) as Mode[]).map((m) => (
        <button key={m} type="button" role="listitem" className={`choice${m === mode ? ' is-on' : ''}`} onClick={() => onPick(m)} aria-current={m === mode}>
          <span className="choice-icon">{MODE_INFO[m].icon}</span>
          <span className="choice-text">
            <span className="choice-label">{MODE_INFO[m].label}</span>
            <span className="choice-blurb">{MODE_INFO[m].blurb}</span>
          </span>
          {m === mode && <span className="choice-check" aria-hidden />}
        </button>
      ))}
    </div>
  )
}

export function ModeSheet({ mode, onPick, onClose }: { mode: Mode; onPick: (m: Mode) => void; onClose: () => void }) {
  return (
    <Sheet title="Choose a mode" onClose={onClose}>
      <ModeOptions mode={mode} onPick={onPick} />
    </Sheet>
  )
}

export function LevelOptions({ level, onPick, compact }: { level: Level; onPick: (l: Level) => void; compact?: boolean }) {
  return (
    <div className={compact ? 'segmented' : 'choice-list'} role="radiogroup" aria-label="Difficulty">
      {LEVELS.map((l) =>
        compact ? (
          <button key={l} type="button" role="radio" aria-checked={l === level} className={`seg tone-${l}${l === level ? ' is-on' : ''}`} onClick={() => onPick(l)}>
            <span aria-hidden>{LEVEL_INFO[l].emoji}</span> {LEVEL_INFO[l].label}
          </button>
        ) : (
          <button key={l} type="button" role="radio" aria-checked={l === level} className={`choice tone-${l}${l === level ? ' is-on' : ''}`} onClick={() => onPick(l)}>
            <span className="choice-icon is-emoji">{LEVEL_INFO[l].emoji}</span>
            <span className="choice-text">
              <span className="choice-label">{LEVEL_INFO[l].label}</span>
              <span className="choice-blurb">{LEVEL_INFO[l].blurb}</span>
            </span>
            {l === level && <span className="choice-check" aria-hidden />}
          </button>
        ),
      )}
    </div>
  )
}

export function DifficultySheet({ level, onPick, onClose }: { level: Level; onPick: (l: Level) => void; onClose: () => void }) {
  return (
    <Sheet title="Computer difficulty" onClose={onClose}>
      <LevelOptions level={level} onPick={onPick} />
    </Sheet>
  )
}

export function RenameSheet({ title, value, onSave, onClose }: { title: string; value: string; onSave: (v: string) => void; onClose: () => void }) {
  const [v, setV] = useState(value)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const name = cleanName(v)
    if (name) onSave(name)
    else onClose()
  }
  return (
    <Sheet title={title} onClose={onClose} compact>
      <form className="rename" onSubmit={submit}>
        <input
          className="text-input"
          value={v}
          maxLength={NAME_MAX}
          onChange={(e) => setV(e.target.value)}
          onFocus={(e) => e.target.select()}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="done"
          aria-label="Name"
          data-autofocus
        />
        <div className="btn-row">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn is-primary" disabled={!cleanName(v)}>
            Save
          </button>
        </div>
      </form>
    </Sheet>
  )
}

export interface ConfirmInfo {
  title: string
  body: string
  ok: string
  onOk: () => void
  danger?: boolean
}

export function ConfirmSheet({ info, onClose }: { info: ConfirmInfo; onClose: () => void }) {
  return (
    <Sheet title={info.title} onClose={onClose} compact>
      <p className="sheet-text">{info.body}</p>
      <div className="btn-row">
        <button type="button" className="btn" onClick={onClose} data-autofocus>
          Keep playing
        </button>
        <button type="button" className={`btn is-primary${info.danger ? ' is-danger' : ''}`} onClick={info.onOk}>
          {info.ok}
        </button>
      </div>
    </Sheet>
  )
}

export function ReactionsSheet({ onSend, onClose, cooling }: { onSend: (id: number) => void; onClose: () => void; cooling: boolean }) {
  const phrases = REACTIONS.map((r, i) => ({ r, i })).filter(({ r }) => /[a-z]/i.test(r))
  const emojis = REACTIONS.map((r, i) => ({ r, i })).filter(({ r }) => !/[a-z]/i.test(r))
  return (
    <Sheet title="Send a reaction" onClose={onClose}>
      <div className="react-grid">
        {phrases.map(({ r, i }) => (
          <button key={i} type="button" className="react-chip" disabled={cooling} onClick={() => onSend(i)}>
            {r}
          </button>
        ))}
      </div>
      <div className="react-emojis">
        {emojis.map(({ r, i }) => (
          <button key={i} type="button" className="react-emoji" disabled={cooling} onClick={() => onSend(i)} aria-label={`Send ${r}`}>
            {r}
          </button>
        ))}
      </div>
    </Sheet>
  )
}
