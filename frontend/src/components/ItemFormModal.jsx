import { useState, useEffect } from 'react'

const SECRETS_PREFIX = '/app/config/secrets/'

const CATEGORIES = ['project', 'server', 'tool']
const MGMT_TYPES = ['none', 'ssh-server', 'ssh-compose']

function slugify(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function emptyForm() {
  return {
    name: '', id: '', category: 'project', description: '',
    url: '', healthCheck: '', tags: '',
    mgmtType: 'none',
    mgmtServerId: '',
    mgmtHost: '', mgmtPort: '22', mgmtUser: '', mgmtSshKey: '',
    mgmtComposeDir: '', mgmtComposeService: '',
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
    mgmtType: m?.type || 'none',
    mgmtServerId: m?.serverId || '',
    mgmtHost: m?.host || '',
    mgmtPort: String(m?.port || 22),
    mgmtUser: m?.user || '',
    mgmtSshKey: m?.sshKey || '',
    mgmtComposeDir: m?.composeDir || '',
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
  body.tags = form.tags.split(',').map(t => t.trim()).filter(Boolean)

  if (form.mgmtType !== 'none') {
    if (form.mgmtType === 'ssh-compose') {
      body.management = {
        type: 'ssh-compose',
        server_id: form.mgmtServerId,
        compose_dir: form.mgmtComposeDir.trim(),
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
      }
    }
  }

  return body
}

function validateForm(form) {
  const errs = {}
  if (!form.name.trim()) errs.name = 'Required'
  if (!form.url.trim() && form.mgmtType !== 'ssh-server') errs.url = 'Required'
  if (form.mgmtType !== 'none') {
    if (form.mgmtType === 'ssh-compose') {
      if (!form.mgmtServerId) errs.mgmtServerId = 'Required'
      if (!form.mgmtComposeDir.trim()) errs.mgmtComposeDir = 'Required'
    } else {
      if (!form.mgmtHost.trim()) errs.mgmtHost = 'Required'
      if (!form.mgmtUser.trim()) errs.mgmtUser = 'Required'
      if (!form.mgmtSshKey.trim()) errs.mgmtSshKey = 'Required'
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

// ─── Main component ───────────────────────────────────────────────────────────

export default function ItemFormModal({ item, servers = [], onSave, onClose }) {
  const isEdit = !!item
  const [form, setForm] = useState(isEdit ? itemToForm(item) : emptyForm())
  const [idTouched, setIdTouched] = useState(isEdit)
  const [errors, setErrors] = useState({})
  const [serverErrors, setServerErrors] = useState({})
  const [loading, setLoading] = useState(false)

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

  // Servers with ssh-server management are the ones usable as compose targets
  const sshServers = servers.filter(s => s.managementInfo?.type === 'ssh-server')

  const showSsh = form.mgmtType !== 'none'
  const showServerPicker = form.mgmtType === 'ssh-compose'
  const showComposeFields = form.mgmtType === 'ssh-compose'

  const err = (key) => errors[key] || serverErrors[key] || serverErrors[`management.${key.replace('mgmt', '').toLowerCase()}`]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-white">{isEdit ? 'Edit item' : 'Add item'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg leading-none">✕</button>
        </div>

        {/* Scrollable body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto px-5 py-4 flex flex-col gap-4">

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

                    <Field label="SSH key filename" required error={err('mgmtSshKey') || serverErrors['management.ssh_key']}>
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
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-200 dark:border-gray-700">
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
