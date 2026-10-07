import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  ACCENTS,
  MAX_PROJECT_BYTES,
  PRESETS,
  ProjectSchema,
  makeWidget,
  parseProjectJson,
  slugify,
  type Project,
  type Widget,
  type Accent,
} from '../../../packages/studio/src/config'
import { encodeProject } from '../../../packages/studio/src/share'
import { pluginFiles } from '../../../packages/studio/src/export'
import { pluginArchive } from '../../../packages/studio/src/archive'
import runtimeSource from '../../../packages/studio/src/runtime.js?raw'
import registerSource from '../../../packages/studio/src/register.js?raw'
import { loadProject, STORAGE_KEY } from './storage'
import { Preview, type Scenario } from './Preview'
import { Icon } from './icons'

const KIND_LABELS: Record<Widget['kind'], string> = {
  status: 'Session status',
  context: 'Context meter',
  checklist: 'Checklist',
  note: 'Pinned note',
  budget: 'Session budget',
  tokens: 'Token usage',
  timing: 'Turn timing',
}
const KIND_NOTES = {
  status: 'Know when a turn is working or finished.',
  context: 'Keep an eye on your context window.',
  checklist: 'Keep the little things from slipping.',
  note: 'Keep a goal or reminder in view.',
  budget: 'Compare reported cost with your target.',
  tokens: 'See the actual context token count.',
  timing: 'See how long your turns took.',
}
const download = (name: string, data: BlobPart, type: string) => {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export function App() {
  const boot = useMemo(() => {
    try {
      return loadProject(localStorage, location.hash)
    } catch {
      return {
        project: structuredClone(PRESETS[0]!.project),
        notice: 'Browser storage is unavailable. Export your project to keep it.',
        source: 'starter' as const,
        previous: undefined,
      }
    }
  }, [])
  const [project, setProject] = useState<Project>(boot.project)
  const [history, setHistory] = useState<Project[]>(boot.previous ? [boot.previous] : [])
  const [selected, setSelected] = useState(boot.project.widgets[0]!.id)
  const [scenario, setScenario] = useState<Scenario>('working')
  const [narrow, setNarrow] = useState(false)
  const [checked, setChecked] = useState<Record<string, boolean[]>>({})
  const [tab, setTab] = useState<'preview' | 'files'>('preview')
  const [file, setFile] = useState('hooks/register.js')
  const [notice, setNotice] = useState(boot.notice)
  const [saved, setSaved] = useState('Saved on this device')
  const [modal, setModal] = useState<'share' | 'export' | 'help' | null>(null)
  const [copied, setCopied] = useState('')
  const [shareLink, setShareLink] = useState('')
  const [hasEdited, setHasEdited] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const valid = useMemo(() => ProjectSchema.safeParse(project), [project])
  const issue = valid.success ? undefined : valid.error.issues[0]
  const issueLabel = issue?.path.includes('items')
    ? 'Checklist'
    : issue?.path.includes('title')
      ? 'Widget label'
      : issue?.path.includes('name')
        ? 'Workspace name'
        : issue?.path.includes('text')
          ? 'Pinned note'
          : issue?.path.includes('targetUsd')
            ? 'Budget target'
            : 'Workspace'
  const files = useMemo(() => (valid.success ? pluginFiles(valid.data, runtimeSource, registerSource) : {}), [valid])
  const widget = project.widgets.find((w) => w.id === selected) || project.widgets[0]!
  const update = (next: Project) => {
    setHistory((h) => [...h.slice(-29), project])
    setProject(next)
    setHasEdited(true)
    setCopied('')
  }
  const changeWidget = (next: Widget) =>
    update({ ...project, widgets: project.widgets.map((w) => (w.id === next.id ? next : w)) })
  const undo = () => {
    const previous = history.at(-1)
    if (previous) {
      setProject(previous)
      setHistory((h) => h.slice(0, -1))
      setHasEdited(true)
      setSelected(previous.widgets[0]!.id)
    }
  }
  useEffect(() => {
    if (boot.source === 'remix' && location.hash.startsWith('#studio='))
      window.history.replaceState(null, '', location.pathname + location.search)
  }, [boot.source])
  useEffect(() => {
    if (!valid.success) {
      setSaved('Finish editing to save')
      return
    }
    // A malformed link must not overwrite a saved project simply by opening it.
    if (!hasEdited && boot.notice.includes('could not')) {
      setSaved('Previous save preserved')
      return
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(valid.data))
      setSaved('Saved on this device')
    } catch {
      setSaved('Not saved — export to keep your work')
    }
  }, [project, valid, hasEdited, boot.notice])
  useEffect(() => {
    if (modal) {
      dialog.current?.showModal()
    } else dialog.current?.close()
  }, [modal])
  useEffect(() => {
    if (!copied) return
    const id = setTimeout(() => setCopied(''), 2500)
    return () => clearTimeout(id)
  }, [copied])
  const add = (kind: Widget['kind']) => {
    if (project.widgets.length >= 6) return
    const id = kind + '-' + Math.random().toString(36).slice(2, 9)
    update({ ...project, widgets: [...project.widgets, makeWidget(kind, id)] })
    setSelected(id)
  }
  const reorder = (id: string, direction: number) => {
    const index = project.widgets.findIndex((w) => w.id === id),
      target = index + direction
    if (target < 0 || target >= project.widgets.length) return
    const widgets = [...project.widgets]
    ;[widgets[index], widgets[target]] = [widgets[target]!, widgets[index]!]
    update({ ...project, widgets })
  }
  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
    } catch {
      setNotice('Clipboard unavailable. Select the text in the dialog and copy it manually.')
    }
  }
  const openShare = () => {
    if (!valid.success) return
    const url = new URL(location.href)
    url.search = ''
    url.hash = encodeProject(valid.data)
    setShareLink(url.href)
    setModal('share')
  }
  const importFile = async (file: File | undefined) => {
    if (!file) return
    try {
      if (file.size > MAX_PROJECT_BYTES) throw Error('Project is too large (12 KB maximum).')
      const next = parseProjectJson(await file.text())
      update(next)
      setSelected(next.widgets[0]!.id)
      setChecked({})
      setNotice('Project imported. You can undo to return to your previous workspace.')
    } catch (error) {
      setNotice(
        error instanceof Error && error.message.includes('too large')
          ? error.message
          : 'Could not import this project. Choose a valid Studio JSON file. Your current workspace is unchanged.',
      )
    }
    if (input.current) input.current.value = ''
  }
  const exportZip = () => {
    if (!valid.success) return
    try {
      const zip = pluginArchive(valid.data, runtimeSource, registerSource)
      download(valid.data.slug + '.zip', zip.buffer, 'application/zip')
      setNotice('Download started. Extract the ZIP, then use the command shown here.')
    } catch {
      setNotice('The ZIP could not be created. Try again, or save the project JSON to keep your work.')
    }
  }
  return (
    <>
      <a href="#workspace" className="skip-link">
        Skip to workspace
      </a>
      <header className="app-header">
        <a className="brand" href="https://github.com/claudemodz/claudemodz" target="_blank" rel="noreferrer">
          <span className="brand-mark">
            m<span>✳</span>
          </span>
          <span>
            claudemodz<span className="brand-studio">studio</span>
          </span>
          <span className="version">ALPHA</span>
        </a>
        <span className="save-state">
          <span className="save-dot" />
          {saved}
        </span>
        <div className="header-actions">
          <button className="button ghost import-button" onClick={() => input.current?.click()}>
            <Icon name="upload" />
            Import
          </button>
          <button className="button ghost" onClick={openShare} disabled={!valid.success}>
            <Icon name="share" />
            Share
          </button>
          <button className="button primary" onClick={() => setModal('export')} disabled={!valid.success}>
            <Icon name="download" />
            Export mod
          </button>
        </div>
        <input
          ref={input}
          type="file"
          accept=".json,application/json"
          onChange={(e) => void importFile(e.target.files?.[0])}
          className="file-input"
          aria-label="Import Studio project"
        />
      </header>
      <main>
        <section className="intro">
          <div>
            <div className="eyebrow">
              <span className="orange-dot" /> YOUR CLAUDE, A LITTLE MORE YOU.
            </div>
            <h1>
              Make room for <em>your workflow.</em>
            </h1>
            <p>Build a workspace. Try it on. Make it yours.</p>
          </div>
          <button className="how-button" onClick={() => setModal('help')}>
            <span className="play-icon">▶</span> How it works <Icon name="arrow" size={16} />
          </button>
        </section>
        {notice && (
          <div className="notice" role="status">
            <Icon name="spark" size={16} />
            <span>{notice}</span>
            <button className="icon-button" onClick={() => setNotice('')} aria-label="Dismiss notification">
              <Icon name="close" size={15} />
            </button>
          </div>
        )}
        {!valid.success && (
          <div className="validation-error" role="alert">
            {issueLabel}: {issue?.message} Finish this edit before saving or exporting.
          </div>
        )}
        <div className="workspace" id="workspace">
          <aside className="library panel">
            <div className="panel-heading">
              <span>YOUR TOOLKIT</span>
              <span className="small-number">01</span>
            </div>
            <div className="section-label">Start somewhere good</div>
            <div className="preset-list">
              {PRESETS.map((preset, i) => (
                <button
                  key={preset.id}
                  className={`preset ${project.slug === preset.project.slug ? 'active' : ''}`}
                  onClick={() => {
                    update(structuredClone(preset.project))
                    setSelected(preset.project.widgets[0]!.id)
                    setChecked({})
                    setNotice('Starter loaded. Undo brings back your previous workspace.')
                  }}
                >
                  <span className={`preset-art art-${i}`}>
                    <i />
                    <i />
                    <i />
                  </span>
                  <span>
                    <b>{preset.name}</b>
                    <small>
                      {i === 0
                        ? 'A bit of everything'
                        : i === 1
                          ? 'Less, but better'
                          : i === 2
                            ? 'The finishing touches'
                            : 'Costs, tokens & time'}
                    </small>
                  </span>
                  <Icon name="arrow" size={14} />
                </button>
              ))}
            </div>
            <div className="section-label stack-label">
              <span>In your workspace</span>
              <span>{project.widgets.length}/6</span>
            </div>
            <div className="widget-stack">
              {project.widgets.map((w, i) => (
                <div className={`stack-row ${widget.id === w.id ? 'selected' : ''}`} key={w.id}>
                  <button className="stack-select" onClick={() => setSelected(w.id)}>
                    <span className="stack-icon" style={{ color: ACCENTS[w.accent] }}>
                      <Icon name={w.kind} />
                    </span>
                    <span>
                      {w.title || 'Untitled widget'}
                      <small>{KIND_LABELS[w.kind]}</small>
                    </span>
                  </button>
                  <div className="reorder-buttons">
                    <button onClick={() => reorder(w.id, -1)} disabled={i === 0} aria-label={`Move ${w.title} up`}>
                      <Icon name="up" size={13} />
                    </button>
                    <button
                      onClick={() => reorder(w.id, 1)}
                      disabled={i === project.widgets.length - 1}
                      aria-label={`Move ${w.title} down`}
                    >
                      <Icon name="down" size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <details className="add-widgets">
              <summary>
                <Icon name="plus" size={16} />
                Add a widget<span>{project.widgets.length === 6 ? 'Full' : ''}</span>
              </summary>
              <div>
                {(Object.keys(KIND_LABELS) as Widget['kind'][]).map((kind) => (
                  <button onClick={() => add(kind)} disabled={project.widgets.length >= 6} key={kind}>
                    <Icon name={kind} />
                    <span>
                      <b>{KIND_LABELS[kind]}</b>
                      <small>{KIND_NOTES[kind]}</small>
                    </span>
                    <Icon name="plus" size={14} />
                  </button>
                ))}
              </div>
            </details>
            <div className="library-note">
              <Icon name="code" size={18} />
              <p>
                Real mods. Yours to keep.
                <br />
                <span>Open source, with no account required.</span>
              </p>
            </div>
          </aside>
          <section className="preview-panel panel" aria-label="Workspace preview">
            <div className="preview-toolbar">
              <div className="tabs" role="tablist" aria-label="Workspace views">
                <button role="tab" aria-selected={tab === 'preview'} onClick={() => setTab('preview')}>
                  <Icon name="terminal" size={15} />
                  Live preview
                </button>
                <button role="tab" aria-selected={tab === 'files'} onClick={() => setTab('files')}>
                  <Icon name="code" size={15} />
                  Plugin files<span>{Object.keys(files).length}</span>
                </button>
              </div>
              <button
                className="icon-button"
                onClick={undo}
                disabled={!history.length}
                aria-label="Undo last change"
                title="Undo last change"
              >
                <Icon name="undo" size={16} />
              </button>
            </div>
            {tab === 'preview' ? (
              <div className="preview-stage">
                <div className="preview-controls">
                  <span>
                    <span className="simulation-dot" />
                    SIMULATED SESSION
                  </span>
                  <button
                    className={`width-toggle ${narrow ? 'active' : ''}`}
                    onClick={() => setNarrow(!narrow)}
                    aria-pressed={narrow}
                  >
                    {narrow ? 'Narrow' : 'Wide'} <Icon name="terminal" size={13} />
                  </button>
                </div>
                <Preview
                  project={project}
                  scenario={scenario}
                  narrow={narrow}
                  selected={widget.id}
                  onSelect={setSelected}
                  checked={checked}
                  onCheck={setChecked}
                />
                <div className="scenario-bar">
                  <span>TRY A STATE</span>
                  <div>
                    {(['ready', 'working', 'finished', 'error'] as const).map((s) => (
                      <button
                        key={s}
                        className={scenario === s ? 'active' : ''}
                        aria-pressed={scenario === s}
                        onClick={() => setScenario(s)}
                      >
                        <span className={`state-tick ${s}`} />
                        {s === 'error' ? 'Hit a snag' : s[0]!.toUpperCase() + s.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="preview-footnote">
                  Sample activity, real widget logic. Your exported mod listens to your actual session.
                </p>
              </div>
            ) : (
              <div className="code-panel">
                <div className="code-top">
                  <label htmlFor="file-select">EXPORTED FILE</label>
                  <select id="file-select" value={file} onChange={(e) => setFile(e.target.value)}>
                    {Object.keys(files).map((path) => (
                      <option key={path}>{path}</option>
                    ))}
                  </select>
                  <button
                    className="icon-button"
                    onClick={() => void copy(files[file] || '', 'file')}
                    aria-label="Copy file contents"
                  >
                    <Icon name={copied === 'file' ? 'check' : 'copy'} size={16} />
                  </button>
                </div>
                <pre>
                  <code>{files[file] || 'Finish editing to preview your plugin files.'}</code>
                </pre>
                <p>These are the exact files included in your download. No build step needed.</p>
              </div>
            )}
            <div className="preview-bottom">
              <span>
                <Icon name="check" size={14} />
                No model calls
              </span>
              <span>
                <Icon name="check" size={14} />
                No network requests
              </span>
              <span>
                <Icon name="check" size={14} />
                Editable source
              </span>
            </div>
          </section>
          <aside className="properties panel">
            <div className="panel-heading">
              <span>MAKE IT YOURS</span>
              <span className="small-number">02</span>
            </div>
            <div className="property-widget-name">
              <span style={{ color: ACCENTS[widget.accent] }}>
                <Icon name={widget.kind} size={23} />
              </span>
              <div>
                <h2>{KIND_LABELS[widget.kind]}</h2>
                <p>{KIND_NOTES[widget.kind]}</p>
              </div>
            </div>
            <label className="field">
              Widget label
              <input
                maxLength={32}
                value={widget.title}
                onChange={(e) => changeWidget({ ...widget, title: e.target.value })}
              />
            </label>
            <fieldset className="color-field">
              <legend>Accent color</legend>
              <div>
                {(Object.keys(ACCENTS) as Accent[]).map((color) => (
                  <button
                    key={color}
                    className={`swatch ${widget.accent === color ? 'selected' : ''}`}
                    style={{ '--swatch': ACCENTS[color] } as CSSProperties}
                    aria-label={`${color} accent`}
                    aria-pressed={widget.accent === color}
                    onClick={() => changeWidget({ ...widget, accent: color })}
                  >
                    {widget.accent === color && <Icon name="check" size={14} />}
                  </button>
                ))}
              </div>
              <span>{widget.accent[0]!.toUpperCase() + widget.accent.slice(1)}</span>
            </fieldset>
            {widget.kind === 'context' && (
              <label className="toggle-field">
                <span>
                  Show session cost<small>Only when Claude reports it</small>
                </span>
                <input
                  type="checkbox"
                  checked={widget.showCost}
                  onChange={(e) => changeWidget({ ...widget, showCost: e.target.checked })}
                />
              </label>
            )}
            {widget.kind === 'checklist' && (
              <div className="checklist-editor">
                <label htmlFor="checklist-items">Your checklist</label>
                <textarea
                  id="checklist-items"
                  rows={5}
                  value={widget.items.join('\n')}
                  onChange={(e) => changeWidget({ ...widget, items: e.target.value.split('\n') })}
                />
                <small>One item per line. Up to 6 items, 80 characters each. Progress resets each session.</small>
              </div>
            )}
            {widget.kind === 'status' && (
              <div className="tip">
                <span className="tip-label">SMALL WIDGET. USEFUL SIGNAL.</span>
                <p>
                  Follows your turn from ready to working to finished. An interrupted or failed turn gets its own state.
                </p>
              </div>
            )}
            {widget.kind === 'note' && (
              <label className="field">
                Your reminder
                <input
                  maxLength={160}
                  value={widget.text}
                  onChange={(e) => changeWidget({ ...widget, text: e.target.value })}
                />
                <small>One line, up to 160 characters. Included in shared links and exports.</small>
              </label>
            )}
            {widget.kind === 'budget' && (
              <>
                <label className="field">
                  Budget target (USD)
                  <input
                    type="number"
                    min="0.01"
                    max="10000"
                    step="0.01"
                    value={Number.isFinite(widget.targetUsd) ? widget.targetUsd : ''}
                    onChange={(e) => changeWidget({ ...widget, targetUsd: e.target.valueAsNumber })}
                  />
                </label>
                <div className="tip">
                  <span className="tip-label">A REMINDER, NOT A LIMIT</span>
                  <p>Uses the cost Claude reports. This does not stop a turn or enforce a spending cap.</p>
                </div>
              </>
            )}
            {widget.kind === 'tokens' && (
              <div className="tip">
                <span className="tip-label">MEASURED CONTEXT</span>
                <p>
                  Shows tokens in the current context and the model’s window size. It is not a cumulative or billed
                  token total.
                </p>
              </div>
            )}
            {widget.kind === 'timing' && (
              <div className="tip">
                <span className="tip-label">AFTER EACH TURN</span>
                <p>
                  Shows the last turn’s duration and total time across observed turns, including interruptions. Resets
                  with the session.
                </p>
              </div>
            )}
            <div className="property-separator" />
            <div className="section-label">The whole workspace</div>
            <label className="field">
              Workspace name
              <input
                maxLength={48}
                value={project.name}
                onChange={(e) => update({ ...project, name: e.target.value, slug: slugify(e.target.value) })}
              />
            </label>
            <div className="density-field">
              <span>Density</span>
              <div className="segmented">
                {(['comfortable', 'compact'] as const).map((d) => (
                  <button
                    key={d}
                    className={project.density === d ? 'active' : ''}
                    aria-pressed={project.density === d}
                    onClick={() => update({ ...project, density: d })}
                  >
                    {d === 'comfortable' ? 'Roomy' : 'Compact'}
                  </button>
                ))}
              </div>
            </div>
            <div className="capabilities">
              <Icon name="check" size={15} />
              <div>
                <b>Only what your widgets need</b>
                <p>
                  Session events & interface rendering.
                  <br />
                  No files, shell, or model usage.
                </p>
              </div>
            </div>
            <button
              className="remove-widget"
              disabled={project.widgets.length <= 1}
              onClick={() => {
                update({ ...project, widgets: project.widgets.filter((w) => w.id !== widget.id) })
                setSelected(project.widgets.find((w) => w.id !== widget.id)!.id)
              }}
            >
              <Icon name="close" size={14} />
              Remove widget
            </button>
          </aside>
        </div>
        <section className="bottom-strip">
          <div>
            <span className="small-mark">✳</span>
            <p>A small tool for making your tools feel like home.</p>
          </div>
          <a href="https://github.com/claudemodz/claudemodz" target="_blank" rel="noreferrer">
            <Icon name="github" size={16} />
            Build with us <Icon name="arrow" size={14} />
          </a>
        </section>
      </main>
      <footer>
        <span>Independent, open source, and made for tinkering.</span>
        <span>Unofficial. Not affiliated with Anthropic.</span>
      </footer>
      <dialog
        ref={dialog}
        onCancel={() => setModal(null)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setModal(null)
        }}
        aria-labelledby="dialog-title"
      >
        <div className="dialog-inner">
          {notice && modal !== 'help' && (
            <p className="dialog-feedback" role="status">
              {notice}
            </p>
          )}
          <button className="icon-button dialog-close" onClick={() => setModal(null)} aria-label="Close dialog">
            <Icon name="close" />
          </button>
          {modal === 'export' ? (
            <>
              <div className="dialog-icon">
                <Icon name="download" size={26} />
              </div>
              <div className="eyebrow">FROM YOUR BROWSER TO YOUR WORKSPACE</div>
              <h2 id="dialog-title">Take it for a spin.</h2>
              <p>Your download is a complete Claude Code plugin. No build step or extra dependencies.</p>
              <div className="install-steps">
                <p>
                  <b>1</b>Download and extract <strong>{project.slug}.zip</strong>
                </p>
                <p>
                  <b>2</b>From the extracted folder's parent, run:
                </p>
                <div className="command-box">
                  <code>claude --plugin-dir ./{project.slug}</code>
                  <button
                    className="icon-button"
                    aria-label="Copy launch command"
                    onClick={() => void copy(`claude --plugin-dir ./${project.slug}`, 'command')}
                  >
                    <Icon name={copied === 'command' ? 'check' : 'copy'} size={16} />
                  </button>
                </div>
                <p>
                  <b>3</b>Your workspace appears above the prompt. Use <code>/{project.slug}</code> for its commands.
                </p>
              </div>
              <div className="dialog-note">
                Requires Claude Code 2.1.288+ with mods enabled in your profile. If it does not appear, check your
                Claude sign-in and mod availability. Browser previews are simulations; terminal sizing and desktop
                rendering may differ. Keep the extracted folder and use this launch option for future sessions.
              </div>
              <div className="dialog-actions">
                <button
                  className="button ghost"
                  onClick={() => {
                    if (valid.success)
                      download(project.slug + '.studio.json', JSON.stringify(valid.data, null, 2), 'application/json')
                  }}
                  disabled={!valid.success}
                >
                  Save project JSON
                </button>
                <button className="button primary" onClick={exportZip} disabled={!valid.success}>
                  <Icon name="download" />
                  Download plugin
                </button>
              </div>
            </>
          ) : modal === 'share' ? (
            <>
              <div className="dialog-icon">
                <Icon name="share" size={26} />
              </div>
              <div className="eyebrow">GOOD SETUPS ARE BETTER SHARED</div>
              <h2 id="dialog-title">Let someone make it theirs.</h2>
              <p>This link opens a copy of your workspace that anyone can remix. No account or upload needed.</p>
              <div className="dialog-note">
                The link includes your widget labels, notes, budget target and checklist text. Review them before
                sharing. Studio does not read your Claude conversations or credentials. A localhost link only works
                where this app is running; use project JSON to share between machines.
              </div>
              <label className="field">
                Remix link
                <textarea readOnly rows={3} value={shareLink} onFocus={(e) => e.currentTarget.select()} />
              </label>
              <div className="dialog-actions">
                <button
                  className="button ghost"
                  onClick={() => {
                    if (valid.success)
                      download(project.slug + '.studio.json', JSON.stringify(valid.data, null, 2), 'application/json')
                  }}
                >
                  Download project JSON
                </button>
                <button className="button primary" onClick={() => void copy(shareLink, 'link')}>
                  <Icon name={copied === 'link' ? 'check' : 'link'} />
                  {copied === 'link' ? 'Copied' : 'Copy remix link'}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="dialog-icon">
                <Icon name="spark" size={26} />
              </div>
              <div className="eyebrow">MAKE SOMETHING SMALL. MAKE IT YOURS.</div>
              <h2 id="dialog-title">A mod in three little steps.</h2>
              <ol className="help-steps">
                <li>
                  <b>Choose your building blocks.</b>
                  <p>
                    Start with a preset, then choose from seven widgets, including notes, budgets and turn timing.
                    Reorder them to fit how you work.
                  </p>
                </li>
                <li>
                  <b>Try it on.</b>
                  <p>
                    Change labels and colors. Switch between sample session states. Click checklist items. The preview
                    uses the same widget logic as your mod.
                  </p>
                </li>
                <li>
                  <b>Take it with you.</b>
                  <p>
                    Download a plugin you can load into Claude Code, or save and share your configuration for someone
                    else to remix.
                  </p>
                </li>
              </ol>
              <div className="dialog-note">
                Your work saves in this browser. No model calls or remote services are used to build your mod. Export
                JSON for a portable backup.
              </div>
              <button className="button primary full-width" onClick={() => setModal(null)}>
                Let's make it mine <Icon name="arrow" />
              </button>
            </>
          )}
        </div>
      </dialog>
    </>
  )
}
