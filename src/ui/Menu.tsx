// Main menu (from the spool button).
import { useEffect, useState, type ReactNode } from 'react'
import type { Level } from '../bot/search'
import { discardQueued, track } from '../lib/analytics'
import { canVibrate } from '../lib/hooks'
import { LEVELS, LEVEL_INFO } from '../lib/levels'
import { updateSettings, type Mode, type Settings, type ThemePref } from '../lib/settings'
import { canPromptInstall, isIOS, isStandalone, promptInstall } from '../pwa'
import { NAME_MAX, cleanName } from '../../shared/protocol'
import { LevelOptions, ModeOptions } from './Dialogs'
import { Sheet } from './Sheet'

let iosHintTracked = false // once per session, not per menu open

interface Props {
  settings: Settings
  mode: Mode
  canNewGame: boolean
  onNewGame: () => void
  onMode: (m: Mode) => void
  onLevel: (l: Level) => void
  onRename: (name: string) => void
  onClose: () => void
}

export function Menu({ settings, mode, canNewGame, onNewGame, onMode, onLevel, onRename, onClose }: Props) {
  const [name, setName] = useState(settings.name)
  const [installable, setInstallable] = useState(canPromptInstall)
  const commitName = () => {
    const n = cleanName(name)
    if (n && n !== settings.name) onRename(n)
    else setName(settings.name)
  }
  const { stats } = settings
  const showIosHint = !installable && isIOS() && !isStandalone()
  useEffect(() => {
    if (!showIosHint || iosHintTracked) return
    iosHintTracked = true
    track('ios_hint_shown')
  }, [showIosHint])
  const setSound = (sound: boolean) => {
    updateSettings({ sound })
    track('setting', { key: 'sound', value: sound ? 'on' : 'off' })
  }
  const setHaptics = (haptics: boolean) => {
    updateSettings({ haptics })
    track('setting', { key: 'haptics', value: haptics ? 'on' : 'off' })
  }
  const setTheme = (theme: ThemePref) => {
    if (theme === settings.theme) return
    updateSettings({ theme })
    track('setting', { key: 'theme', value: theme })
  }
  const setAnalytics = (analytics: boolean) => {
    updateSettings({ analytics })
    if (!analytics) discardQueued()
  }

  return (
    <Sheet title="Stitch Four" onClose={onClose}>
      {canNewGame && (
        <button type="button" className="btn is-primary is-wide" onClick={onNewGame}>
          New game
        </button>
      )}

      <Section title="Mode">
        <ModeOptions mode={mode} onPick={onMode} />
      </Section>

      {mode === 'bot' && (
        <Section title="Difficulty">
          <LevelOptions level={settings.level} onPick={onLevel} compact />
        </Section>
      )}

      <Section title="Your name">
        <input
          className="text-input"
          value={name}
          maxLength={NAME_MAX}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="done"
          aria-label="Your name"
        />
      </Section>

      <Section title="Settings">
        <div className="rows">
          <Toggle label="Sound" on={settings.sound} onChange={setSound} />
          {canVibrate() && <Toggle label="Haptics" on={settings.haptics} onChange={setHaptics} />}
          <div className="row">
            <span className="row-label">Theme</span>
            <div className="segmented is-small" role="radiogroup" aria-label="Theme">
              {(['light', 'dark', 'system'] as ThemePref[]).map((t) => (
                <button key={t} type="button" role="radio" aria-checked={settings.theme === t} className={`seg${settings.theme === t ? ' is-on' : ''}`} onClick={() => setTheme(t)}>
                  {t[0].toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <Toggle label="Share anonymous usage stats" on={settings.analytics} onChange={setAnalytics} />
        </div>
      </Section>

      <Section title="Stats">
        <table className="stats">
          <thead>
            <tr>
              <th />
              <th>Won</th>
              <th>Lost</th>
              <th>Drawn</th>
            </tr>
          </thead>
          <tbody>
            {LEVELS.map((l) => (
              <tr key={l}>
                <th>
                  <span aria-hidden>{LEVEL_INFO[l].emoji}</span> {LEVEL_INFO[l].label}
                </th>
                <td>{stats.bot[l].wins}</td>
                <td>{stats.bot[l].losses}</td>
                <td>{stats.bot[l].draws}</td>
              </tr>
            ))}
            <tr>
              <th>
                <span aria-hidden>🧵</span> Online
              </th>
              <td>{stats.online.wins}</td>
              <td>{stats.online.losses}</td>
              <td>{stats.online.draws}</td>
            </tr>
          </tbody>
        </table>
        <p className="streak">
          Streak <strong>{stats.streak}</strong>
          <span className="dot" aria-hidden>
            ·
          </span>
          Best <strong>{stats.best}</strong>
        </p>
      </Section>

      {!isStandalone() && (installable || showIosHint) && (
        <Section title="Install">
          {installable ? (
            <button
              type="button"
              className="btn is-wide"
              onClick={async () => {
                await promptInstall()
                setInstallable(canPromptInstall())
              }}
            >
              Add Stitch Four to your home screen
            </button>
          ) : (
            <p className="sheet-text">
              Tap <strong>Share</strong> then <strong>Add to Home Screen</strong> to keep Stitch Four on your phone. It works offline.
            </p>
          )}
        </Section>
      )}

      <Section title="How to play">
        <p className="sheet-text">
          Take turns dropping a piece into a column. Get four of your colour in a row, across, up or diagonally, to win. Tap a column or drag along the top and let go.
        </p>
      </Section>

      <p className="sheet-foot">Stitch Four · v0.1</p>
    </Sheet>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="menu-section">
      <h3 className="section-title">{title}</h3>
      {children}
    </section>
  )
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="row">
      <span className="row-label">{label}</span>
      <button type="button" role="switch" aria-checked={on} aria-label={label} className={`switch${on ? ' is-on' : ''}`} onClick={() => onChange(!on)}>
        <span className="switch-knob" />
      </button>
    </div>
  )
}
