import { useEffect, useRef, useState } from 'react'

type Message = { role: 'user' | 'assistant'; content: string; sources?: string[] }
const endpoint = './api/project-assistant'
const examples = ['What does this website do?', 'How are site match scores calculated?', 'How do I compare locations on Earth, the Moon, and Mars?']

export function ProjectAssistant() {
  const [messages, setMessages] = useState<Message[]>([])
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [available, setAvailable] = useState<boolean | null>(null)
  const [configured, setConfigured] = useState(false)
  const [key, setKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [setupMessage, setSetupMessage] = useState('')
  const request = useRef<AbortController | null>(null)

  useEffect(() => {
    const status = new AbortController()
    fetch(endpoint, { signal: status.signal, headers: { Accept: 'application/json' } }).then(async response => {
      const ok = response.ok && response.headers.get('content-type')?.includes('application/json') === true
      const data = ok ? await response.json() : null
      if (!status.signal.aborted) {
        setAvailable(ok)
        setConfigured(data?.configured === true)
      }
    }).catch(() => { if (!status.signal.aborted) setAvailable(false) })
    return () => { status.abort(); request.current?.abort() }
  }, [])

  async function saveKey() {
    if (saving || !key.trim()) return
    setSaving(true)
    setSetupMessage('')
    try {
      const response = await fetch(endpoint + '/configure', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: key.trim() }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not save your API key.')
      setKey('')
      setConfigured(true)
      setAvailable(true)
      setSetupMessage('API key saved. Ask a question to check the connection.')
    } catch (error) {
      setSetupMessage(error instanceof Error ? error.message : 'Could not save your API key.')
    } finally { setSaving(false) }
  }

  async function ask() {
    const content = question.trim()
    if (!content || request.current || available !== true) return
    const controller = new AbortController()
    request.current = controller
    setError('')
    setBusy(true)
    const next: Message[] = [...messages, { role: 'user', content }]
    setMessages(next)
    setQuestion('')
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify(next.slice(-9).map(({ role, content }) => ({ role, content: content.slice(0, 3000) }))),
      })
      if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('The assistant server is unavailable.')
      const result = await response.json()
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'The assistant could not answer.')
      if (typeof result.answer !== 'string') throw new Error('The assistant returned an invalid answer.')
      const sources = Array.isArray(result.sources) ? result.sources.filter((item: unknown): item is string => typeof item === 'string') : []
      setMessages([...next, { role: 'assistant', content: result.answer, sources }])
    } catch (failure) {
      if (controller.signal.aborted) return
      setMessages(messages)
      setQuestion(content)
      setError(failure instanceof Error ? failure.message : 'The assistant could not connect.')
    } finally {
      if (!controller.signal.aborted) setBusy(false)
      request.current = null
    }
  }

  return <section className="feature-panel assistant-panel" aria-label="Project assistant">
    {available === null && <p role="status">Checking the assistant connection…</p>}
    {available === false && <p role="status">The assistant server is unavailable. Start the local website server and reload this page.</p>}
    {available && <p role="status">{configured ? 'OpenAI answers with project sources.' : 'Project-document search is ready. Connect OpenAI below for AI answers.'}</p>}
    {available && <details className="assistant-setup" open={!configured}>
      <summary>{configured ? 'Update the OpenAI API key' : 'Connect OpenAI'}</summary>
      <p>The key is saved in the local server’s ignored environment file. Only the server uses it to contact OpenAI.</p>
      <form onSubmit={event => { event.preventDefault(); void saveKey() }}>
        <label htmlFor="assistant-api-key">OpenAI API key</label>
        <input id="assistant-api-key" type="password" autoComplete="off" value={key} maxLength={1024}
          onChange={event => setKey(event.target.value)} placeholder="sk-…" />
        <button type="submit" disabled={saving || !key.trim() || busy}>{saving ? 'Saving…' : 'Save API key'}</button>
      </form>
      {setupMessage && <p role="status">{setupMessage}</p>}
    </details>}
    <div className="assistant-messages" aria-live="polite" aria-busy={busy}>
      {messages.map((item, index) => <article key={index} className={`assistant-message assistant-${item.role}`}>
        <strong>{item.role === 'user' ? 'You' : 'Proving Ground'}</strong>
        <p>{item.content}</p>
        {!!item.sources?.length && <ul aria-label="Project sources">{item.sources.map(source => <li key={source}>{source}</li>)}</ul>}
      </article>)}
    </div>
    {busy && <p role="status">Looking up the project…</p>}
    {error && <p role="alert">{error}</p>}
    {messages.length === 0 && <div className="assistant-examples" aria-label="Example questions">
      {examples.map(example => <button key={example} type="button" onClick={() => setQuestion(example)}>{example}</button>)}
    </div>}
    <form onSubmit={event => { event.preventDefault(); void ask() }}>
      <label htmlFor="project-question">Your question</label>
      <textarea id="project-question" value={question} onChange={event => setQuestion(event.target.value)} rows={3} maxLength={1500} />
      <p className="feature-muted">{configured ? 'Questions and relevant project excerpts are sent to OpenAI.' : 'Search the local project documentation. AI answers become available after connecting your key.'}</p>
      <button className="feature-primary" type="submit" disabled={busy || available !== true || !question.trim()}>Ask question</button>
    </form>
  </section>
}
