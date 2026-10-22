import { useState, useEffect, useRef } from 'react'
import EmojiPicker from './EmojiPicker'

const SECRETS_PREFIX = '/app/config/secrets/'

const CATEGORIES = ['project', 'server', 'tool']
const MGMT_TYPES = ['none', 'ssh-server', 'ssh-compose']
const OS_OPTIONS = ['linux', 'windows']

function slugify(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function emptyForm() {
  return {
    name: '', id: '', category: 'project', description: '',
    url: '', healthCheck: '', tags: '',
    iconType: 'favicon', iconEmoji: '', iconInvertDark: false,
    mgmtType: 'none',
    mgmtOs: 'linux',
    mgmtAllowReboot: true,
    mgmtServerId: '',
    mgmtHost: '', mgmtPort: '22', mgmtUser: '', mgmtSshKey: '',
    mgmtCheckInterval: '60', mgmtCpuWarning: '', mgmtMemoryWarning: '',
    mgmtStorageWarnings: [],
    mgmtComposeDir: '', mgmtComposeFile: '', mgmtComposeService: '',
  }
}

function itemToForm(item) {
  const m = item.managementInfo
  return {
    name: item.name,
    id: item.id,
    category: item.category,
    description: item.description || '',
    url: item.url || '',
    healthCheck: item.healthCheck || '',
    tags: (item.tags || []).join(', '),
    iconType: item.iconEmoji ? 'emoji' : 'favicon',
    iconEmoji: item.iconEmoji || '',
    iconInvertDark: item.iconInvertDark === true,
    mgmtType: m?.type || 'none',
    mgmtOs: m?.os || 'linux',
    mgmtAllowReboot: m?.allowReboot !== false,
    mgmtServerId: m?.serverId || '',
    mgmtHost: m?.host || '',
    mgmtPort: String(m?.port || 22),
    mgmtUser: m?.user || '',
    mgmtSshKey: m?.sshKey || '',
    mgmtCheckInterval: String(m?.checkInterval || 60),
    mgmtCpuWarning: m?.cpuWarning != null ? String(m.cpuWarning) : '',
    mgmtMemoryWarning: m?.memoryWarning != null ? String(m.memoryWarning) : '',
    mgmtStorageWarnings: (m?.storageWarnings || []).map(w => ({ mount: w.mount, percent: String(w.percent) })),
    mgmtComposeDir: m?.composeDir || '',
    mgmtComposeFile: m?.composeFile || '',
    mgmtComposeService: m?.composeService || '',
  }
}

function formToBody(form, isEdit) {
  const body = {
    name: form.name.trim(),
    category: form.category,
  }
  if (form.url.trim()) body.url = form.url.trim()
  if (!isEdit && form.id.trim()) body.id = form.id.trim()
  if (form.description.trim()) body.description = form.description.trim()
  if (form.healthCheck.trim()) body.health_check = form.healthCheck.trim()
  if (form.iconType === 'emoji' && form.iconEmoji) body.icon_emoji = form.iconEmoji
  if (form.iconType === 'favicon' && form.iconInvertDark) body.icon_invert_dark = true
  body.tags = form.tags.split(',').map(t => t.trim()).filter(Boolean)

  if (form.mgmtType !== 'none') {
    if (form.mgmtType === 'ssh-compose') {
      body.management = {
        type: 'ssh-compose',
        server_id: form.mgmtServerId,
        compose_dir: form.mgmtComposeDir.trim(),
      }
      if (form.mgmtComposeFile.trim()) {
        body.management.compose_file = form.mgmtComposeFile.trim()
      }
      if (form.mgmtComposeService.trim()) {
        body.management.compose_service = form.mgmtComposeService.trim()
      }
    } else {
      body.management = {
        type: form.mgmtType,
        host: form.mgmtHost.trim(),
        port: parseInt(form.mgmtPort, 10) || 22,
        user: form.mgmtUser.trim(),
        ssh_key: SECRETS_PREFIX + form.mgmtSshKey.trim(),
        os: form.mgmtOs || 'linux',
        allow_reboot: form.mgmtAllowReboot,
        storage_warnings: filledStorageWarnings(form).map(w => ({
          mount: w.mount.trim(),
          percent: Number(w.percent),
        })),
        check_interval: Number(form.mgmtCheckInterval) || 60,
      }
      if (form.mgmtCpuWarning.trim()) body.management.cpu_warning = Number(form.mgmtCpuWarning)
      if (form.mgmtMemoryWarning.trim()) body.management.memory_warning = Number(form.mgmtMemoryWarning)
    }
  }

  return body
}

function isIntBetween(value, min, max) {
  const n = Number(value)
  return String(value).trim() !== '' && Number.isInteger(n) && n >= min && n <= max
}

// Rows left completely empty are ignored instead of failing validation
function filledStorageWarnings(form) {
  return form.mgmtStorageWarnings.filter(w => w.mount.trim() || String(w.percent).trim())
}

function validateStorageWarnings(form) {
  const seen = new Set()
  for (const w of filledStorageWarnings(form)) {
    const mount = w.mount.trim()
    if (!mount) return 'Enter a mount point'
    if (seen.has(mount)) return `${mount} is listed twice`
    seen.add(mount)
    const pct = Number(w.percent)
    if (!Number.isInteger(pct) || pct < 1 || pct > 100) return `Percentage for ${mount} must be 1–100`
  }
  return null
}

function validateForm(form) {
  const errs = {}
  if (!form.name.trim()) errs.name = 'Required'
  if (!form.url.trim() && form.mgmtType !== 'ssh-server') errs.url = 'Required'
  if (form.iconType === 'emoji' && !form.iconEmoji) errs.iconEmoji = 'Select an emoji'
  if (form.mgmtType !== 'none') {
    if (form.mgmtType === 'ssh-compose') {
      if (!form.mgmtServerId) errs.mgmtServerId = 'Required'
      if (!form.mgmtComposeDir.trim()) errs.mgmtComposeDir = 'Required'
    } else {
      if (!form.mgmtHost.trim()) errs.mgmtHost = 'Required'
      if (!form.mgmtUser.trim()) errs.mgmtUser = 'Required'
      if (!form.mgmtSshKey.trim()) errs.mgmtSshKey = 'Required'
      const swErr = validateStorageWarnings(form)
      if (swErr) errs.mgmtStorageWarnings = swErr
      for (const key of ['mgmtCpuWarning', 'mgmtMemoryWarning']) {
        if (form[key].trim() && !isIntBetween(form[key], 1, 100)) errs[key] = '1–100 or empty'
      }
      if (!isIntBetween(form.mgmtCheckInterval, 10, 86400)) errs.mgmtCheckInterval = '10–86400 seconds'
    }
  }
  return Object.keys(errs).length ? errs : null
}

// ─── Small field components ───────────────────────────────────────────────────

function Field({ label, error, required, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-600 mt-0.5">{error}</p>}
    </div>
  )
}

const inputClass = (hasError) =>
  `w-full border rounded px-2.5 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${
    hasError ? 'border-red-400' : 'border-gray-300 dark:border-gray-600'
  }`

function SshKeyInfoPopover() {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div className="relative inline-flex" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors leading-none"
        title="How to set up SSH keys"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-5 z-50 w-80 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl p-3 text-xs text-gray-700 dark:text-gray-300 flex flex-col gap-2">
          <p className="font-semibold text-gray-900 dark:text-white">Setting up SSH key access</p>
          <p>1. Generate a key pair on the dashboard host:</p>
          <pre className="bg-gray-100 dark:bg-gray-800 rounded px-2 py-1.5 text-gray-800 dark:text-gray-200 overflow-x-auto whitespace-pre-wrap">{`ssh-keygen -t ed25519 \\\n  -f config/secrets/<filename> \\\n  -N ""`}</pre>
          <p>2. Copy the public key to the target server:</p>
          <pre className="bg-gray-100 dark:bg-gray-800 rounded px-2 py-1.5 text-gray-800 dark:text-gray-200 overflow-x-auto whitespace-pre-wrap">{`ssh-copy-id -i config/secrets/<filename>.pub user@server`}</pre>
          <p className="text-gray-500 dark:text-gray-400">The private key file stays in <code className="bg-gray-100 dark:bg-gray-800 px-0.5 rounded">config/secrets/</code> on the dashboard host. Enter only the filename (without path) in the field above.</p>
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

// Per-mountpoint storage warning thresholds. Mount points reported by the server
// (existing items only) are offered as quick-add chips; any mount can be typed in.
function StorageWarningsEditor({ rows, onChange, knownMounts, error }) {
  // inputClass sets w-full, which would override the widths below and squash the mount input
  const rowInput = inputClass(false).replace('w-full ', '')
  const configured = new Set(rows.map(r => r.mount.trim()))
  const suggestions = knownMounts.filter(m => !configured.has(m))

  function update(idx, key, value) {
    onChange(rows.map((r, i) => (i === idx ? { ...r, [key]: value } : r)))
  }

  return (
    <Field label="Storage warnings" error={error}>
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">
        Show a warning when a mount point's usage reaches the given percentage. Mount points without an entry are not checked.
      </p>
      {rows.length > 0 && (
        <div className="flex flex-col gap-1.5 mb-2">
          {rows.map((row, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <input
                className={`${rowInput} flex-1 min-w-0`}
                value={row.mount}
                onChange={e => update(idx, 'mount', e.target.value)}
                placeholder="/  or  C:\"
                list="storage-mounts"
                aria-label="Mount point"
              />
              <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">warn at ≥</span>
              <input
                className={`${rowInput} w-20 shrink-0`}
                type="number"
                min="1"
                max="100"
                value={row.percent}
                onChange={e => update(idx, 'percent', e.target.value)}
                placeholder="90"
                aria-label="Warning percentage"
              />
              <span className="text-xs text-gray-500 dark:text-gray-400">%</span>
              <button
                type="button"
                onClick={() => onChange(rows.filter((_, i) => i !== idx))}
                title="Remove"
                className="text-gray-400 hover:text-red-500 text-sm leading-none px-1"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      <datalist id="storage-mounts">
        {suggestions.map(m => <option key={m} value={m} />)}
      </datalist>
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => onChange([...rows, { mount: '', percent: '90' }])}
          className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          + Add mount point
        </button>
        {suggestions.map(m => (
          <button
            key={m}
            type="button"
            onClick={() => onChange([...rows, { mount: m, percent: '90' }])}
            title={`Add warning for ${m}`}
            className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
          >
            + {m}
          </button>
        ))}
      </div>
    </Field>
  )
}

export default function ItemFormModal({ item, token, servers = [], onSave, onSaveCopy, onClose }) {
  const isEdit = !!item
  const [form, setForm] = useState(isEdit ? itemToForm(item) : emptyForm())
  const [idTouched, setIdTouched] = useState(isEdit)
  const [errors, setErrors] = useState({})
  const [serverErrors, setServerErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false)
  const [knownMounts, setKnownMounts] = useState([])

  // For existing SSH servers, look up the mount points the server reports (cached by the backend)
  const isSshServerItem = isEdit && item.managementInfo?.type === 'ssh-server'
  useEffect(() => {
    if (!isSshServerItem || !token) return
    let cancelled = false
    fetch(`/api/items/${item.id}/details`, { headers: { Authorization: `Basic ${token}` } })
      .then(res => (res.ok ? res.json() : null))
      .then(data => { if (data && !cancelled) setKnownMounts((data.storageList || []).map(s => s.mount)) })
      .catch(() => { /* suggestions are optional */ })
    return () => { cancelled = true }
  }, [isSshServerItem, item?.id, token])

  // Auto-fill ID from name while the user hasn't manually edited it
  useEffect(() => {
    if (!idTouched) {
      set('id', slugify(form.name))
    }
  }, [form.name]) // eslint-disable-line react-hooks/exhaustive-deps

  function set(key, value) {
    setForm(f => ({ ...f, [key]: value }))
    setErrors(e => ({ ...e, [key]: undefined }))
    setServerErrors(e => ({ ...e, [key]: undefined }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const clientErrors = validateForm(form)
    if (clientErrors) { setErrors(clientErrors); return }

    setLoading(true)
    setServerErrors({})
    try {
      await onSave(formToBody(form, isEdit))
      onClose()
    } catch (err) {
      if (err.fields) {
        setServerErrors(err.fields)
      } else {
        setServerErrors({ _general: err.message })
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleSaveAsCopy() {
    const clientErrors = validateForm(form)
    if (clientErrors) { setErrors(clientErrors); return }

    setLoading(true)
    setServerErrors({})
    try {
      const body = formToBody(form, true) // omit id — backend generates one
      delete body.id
      if (form.name.trim() === item.name) {
        body.name = `${body.name} (copy)`
      }
      await onSaveCopy(body)
      onClose()
    } catch (err) {
      if (err.fields) {
        setServerErrors(err.fields)
      } else {
        setServerErrors({ _general: err.message })
      }
    } finally {
      setLoading(false)
    }
  }

  // Servers with ssh-server management are the ones usable as compose targets
  const sshServers = servers.filter(s => s.managementInfo?.type === 'ssh-server')

  const showSsh = form.mgmtType !== 'none'
  const showServerPicker = form.mgmtType === 'ssh-compose'
  const showComposeFields = form.mgmtType === 'ssh-compose'

  const err = (key) => errors[key] || serverErrors[key] || serverErrors[`management.${key.replace('mgmt', '').toLowerCase()}`]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">{isEdit ? 'Edit item' : 'Add item'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg leading-none">✕</button>
        </div>

        {/* Scrollable body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto px-4 py-4 flex flex-col gap-4">

          {serverErrors._general && (
            <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{serverErrors._general}</p>
          )}

          {/* Basic fields */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name" required error={err('name')} >
              <input
                className={inputClass(err('name'))}
                value={form.name}
                onChange={e => set('name', e.target.value)}
                placeholder="My API"
              />
            </Field>
            <Field label="ID" error={err('id')}>
              <input
                className={`${inputClass(err('id'))} ${isEdit ? 'bg-gray-50 dark:bg-gray-600 text-gray-500' : ''}`}
                value={form.id}
                readOnly={isEdit}
                onChange={e => { setIdTouched(true); set('id', e.target.value) }}
                placeholder="my-api"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <select
                className={inputClass(false)}
                value={form.category}
                onChange={e => set('category', e.target.value)}
              >
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Tags">
              <input
                className={inputClass(false)}
                value={form.tags}
                onChange={e => set('tags', e.target.value)}
                placeholder="docker, api"
              />
            </Field>
          </div>

          <Field label="URL" required={form.mgmtType !== 'ssh-server'} error={err('url')}>
            <input
              className={inputClass(err('url'))}
              value={form.url}
              onChange={e => set('url', e.target.value)}
              placeholder="https://api.example.com"
            />
          </Field>

          {form.mgmtType !== 'ssh-server' && (
            <Field label="Health check URL">
              <input
                className={inputClass(false)}
                value={form.healthCheck}
                onChange={e => set('healthCheck', e.target.value)}
                placeholder="https://api.example.com/health  (defaults to URL)"
              />
            </Field>
          )}

          <Field label="Description">
            <textarea
              className={`${inputClass(false)} resize-none`}
              rows={2}
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="Short description shown on the card"
            />
          </Field>

          {/* Icon */}
          <Field label="Icon" error={err('iconEmoji') || serverErrors.icon_emoji}>
            <div className="flex items-center gap-4 mb-2">
              {[['favicon', 'Favicon'], ['emoji', 'Emoji']].map(([value, label]) => (
                <label key={value} className="flex items-center gap-1.5 text-xs cursor-pointer text-gray-700 dark:text-gray-300">
                  <input
                    type="radio"
                    name="iconType"
                    value={value}
                    checked={form.iconType === value}
                    onChange={() => {
                      set('iconType', value)
                      // Nothing picked yet: open the picker right away so the user can choose one.
                      if (value === 'emoji' && !form.iconEmoji) setEmojiPickerOpen(true)
                    }}
                  />
                  {label}
                </label>
              ))}
              {form.iconType === 'emoji' && form.iconEmoji && (
                <span className="text-xl leading-none" title="Selected emoji">{form.iconEmoji}</span>
              )}
              {form.iconType === 'emoji' && (
                <button
                  type="button"
                  onClick={() => setEmojiPickerOpen(o => !o)}
                  className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  {emojiPickerOpen ? 'Hide emojis' : form.iconEmoji ? 'Change emoji' : 'Choose emoji'}
                </button>
              )}
            </div>
            {form.iconType === 'favicon' ? (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-gray-400 dark:text-gray-500">Uses the app icon or favicon of the URL, if available.</p>
                <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form.iconInvertDark}
                    onChange={e => set('iconInvertDark', e.target.checked)}
                    className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                  />
                  Invert in dark mode
                </label>
              </div>
            ) : emojiPickerOpen && (
              <EmojiPicker
                value={form.iconEmoji}
                onChange={v => { set('iconEmoji', v); setEmojiPickerOpen(false) }}
              />
            )}
          </Field>

          {/* Remote management section */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 flex flex-col gap-3">
            <div>
              <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Remote management</p>
              <div className="flex gap-3">
                {MGMT_TYPES.map(t => {
                  const disabled = t === 'ssh-compose' && sshServers.length === 0
                  return (
                    <label key={t} className={`flex items-center gap-1.5 text-xs cursor-pointer ${disabled ? 'text-gray-400 dark:text-gray-600' : 'text-gray-700 dark:text-gray-300'}`}>
                      <input
                        type="radio"
                        name="mgmtType"
                        value={t}
                        checked={form.mgmtType === t}
                        onChange={() => set('mgmtType', t)}
                        disabled={disabled}
                      />
                      {t === 'none' ? 'None' : t === 'ssh-server' ? 'SSH server' : 'SSH + Compose'}
                    </label>
                  )
                })}
              </div>
            </div>

            {showSsh && (
              <>
                {showServerPicker ? (
                  <Field label="Server" required error={err('mgmtServerId')}>
                    <select
                      className={inputClass(err('mgmtServerId'))}
                      value={form.mgmtServerId}
                      onChange={e => set('mgmtServerId', e.target.value)}
                    >
                      <option value="">Select a server…</option>
                      {sshServers.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </Field>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="col-span-2">
                        <Field label="Host" required error={err('mgmtHost')}>
                          <input
                            className={inputClass(err('mgmtHost'))}
                            value={form.mgmtHost}
                            onChange={e => set('mgmtHost', e.target.value)}
                            placeholder="192.168.1.100"
                          />
                        </Field>
                      </div>
                      <Field label="Port">
                        <input
                          className={inputClass(false)}
                          value={form.mgmtPort}
                          onChange={e => set('mgmtPort', e.target.value)}
                          placeholder="22"
                        />
                      </Field>
                    </div>

                    <Field label="User" required error={err('mgmtUser')}>
                      <input
                        className={inputClass(err('mgmtUser'))}
                        value={form.mgmtUser}
                        onChange={e => set('mgmtUser', e.target.value)}
                        placeholder="pi"
                      />
                    </Field>

                    <Field label={<span className="inline-flex items-center gap-1">SSH key filename <SshKeyInfoPopover /></span>} required error={err('mgmtSshKey') || serverErrors['management.ssh_key']}>
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">secrets/</span>
                        <input
                          className={inputClass(err('mgmtSshKey') || serverErrors['management.ssh_key'])}
                          value={form.mgmtSshKey}
                          onChange={e => set('mgmtSshKey', e.target.value)}
                          placeholder="rpi_home_key"
                        />
                      </div>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                        File must exist in <code>config/secrets/</code> on the host.
                      </p>
                    </Field>

                    <Field label="Operating system">
                      <select
                        className={inputClass(false)}
                        value={form.mgmtOs}
                        onChange={e => set('mgmtOs', e.target.value)}
                      >
                        {OS_OPTIONS.map(os => (
                          <option key={os} value={os}>{os.charAt(0).toUpperCase() + os.slice(1)}</option>
                        ))}
                      </select>
                    </Field>

                    <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={form.mgmtAllowReboot}
                        onChange={e => set('mgmtAllowReboot', e.target.checked)}
                        className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                      />
                      Allow server reboot
                    </label>

                    <div className="border-t border-gray-200 dark:border-gray-700 pt-3 flex flex-col gap-3">
                      <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Monitoring</p>
                      <div className="grid grid-cols-3 gap-3">
                        <Field label="Check every (s)" error={errors.mgmtCheckInterval || serverErrors['management.check_interval']}>
                          <input
                            className={inputClass(errors.mgmtCheckInterval || serverErrors['management.check_interval'])}
                            type="number"
                            min="10"
                            value={form.mgmtCheckInterval}
                            onChange={e => set('mgmtCheckInterval', e.target.value)}
                            placeholder="60"
                          />
                        </Field>
                        <Field label="CPU warning ≥ %" error={errors.mgmtCpuWarning || serverErrors['management.cpu_warning']}>
                          <input
                            className={inputClass(errors.mgmtCpuWarning || serverErrors['management.cpu_warning'])}
                            type="number"
                            min="1"
                            max="100"
                            value={form.mgmtCpuWarning}
                            onChange={e => set('mgmtCpuWarning', e.target.value)}
                            placeholder="off"
                          />
                        </Field>
                        <Field label="Memory warning ≥ %" error={errors.mgmtMemoryWarning || serverErrors['management.memory_warning']}>
                          <input
                            className={inputClass(errors.mgmtMemoryWarning || serverErrors['management.memory_warning'])}
                            type="number"
                            min="1"
                            max="100"
                            value={form.mgmtMemoryWarning}
                            onChange={e => set('mgmtMemoryWarning', e.target.value)}
                            placeholder="off"
                          />
                        </Field>
                      </div>
                      <p className="text-xs text-gray-400 dark:text-gray-500 -mt-1">
                        Leave a warning empty to disable it. The server is only checked in the background when at least one warning is set.
                      </p>

                    <StorageWarningsEditor
                      rows={form.mgmtStorageWarnings}
                      onChange={rows => set('mgmtStorageWarnings', rows)}
                      knownMounts={knownMounts}
                      error={errors.mgmtStorageWarnings || serverErrors['management.storage_warnings']}
                    />
                    </div>
                  </>
                )}

                {showComposeFields && (
                  <>
                    <Field label="Compose directory" required error={err('mgmtComposeDir') || serverErrors['management.compose_dir']}>
                      <input
                        className={inputClass(err('mgmtComposeDir') || serverErrors['management.compose_dir'])}
                        value={form.mgmtComposeDir}
                        onChange={e => set('mgmtComposeDir', e.target.value)}
                        placeholder="/home/pi/apps/my-api"
                      />
                    </Field>
                    <Field label="Compose file">
                      <input
                        className={inputClass(false)}
                        value={form.mgmtComposeFile}
                        onChange={e => set('mgmtComposeFile', e.target.value)}
                        placeholder="docker-compose-zigbee.yml  (optional — omit to use default)"
                      />
                    </Field>
                    <Field label="Service name">
                      <input
                        className={inputClass(false)}
                        value={form.mgmtComposeService}
                        onChange={e => set('mgmtComposeService', e.target.value)}
                        placeholder="api  (optional — omit to restart all services)"
                      />
                    </Field>
                  </>
                )}
              </>
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-200 dark:border-gray-700">
          {isEdit && (
            <button
              type="button"
              onClick={handleSaveAsCopy}
              disabled={loading}
              className="text-sm border border-gray-300 dark:border-gray-600 dark:text-gray-300 rounded px-4 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              Save as copy
            </button>
          )}
          <span className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="text-sm border border-gray-300 dark:border-gray-600 dark:text-gray-300 rounded px-4 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="text-sm bg-blue-600 text-white rounded px-4 py-1.5 hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Saving…' : isEdit ? 'Save changes' : 'Add item'}
          </button>
        </div>
      </div>
    </div>
  )
}
