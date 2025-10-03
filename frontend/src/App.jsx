import React, { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

function Message({ role, content }) {
  const isUser = role === 'user'
  const color = isUser ? 'bg-blue-600 text-white' : 'bg-green-600 text-white'
  const align = isUser ? 'ml-auto' : 'mr-auto'
  return (
    <div className={`max-w-[80%] rounded-lg px-4 py-2 ${color} ${align}`}>
      <div className="prose prose-sm text-white 
      prose-headings:text-white prose-p:text-white prose-strong:text-white 
      prose-li:text-white prose-code:text-white prose-a:text-white 
      marker:text-white">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {content}
        </ReactMarkdown>
      </div>
    </div>
  )
}

export default function App() {
  const [persona, setPersona] = useState({
    name: 'Chandni',
    displayName: 'ChandniBot',
    emoji: '👩‍💻',
    greeting: "Hey! I'm ChandniBot. What's up? 🙂",
  })
  const [team, setTeam] = useState([])
  const [speaker, setSpeaker] = useState('general')
  const [messages, setMessages] = useState([])
  const [messagesBySpeaker, setMessagesBySpeaker] = useState({})
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const listRef = useRef(null)

  // Load persona from backend
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch(`${API_URL}/persona`)
        if (!res.ok) throw new Error(`status ${res.status}`)
        const data = await res.json()
        if (!cancelled) {
          setPersona(prev => ({ ...prev, ...data }))
          // Seed greeting if no messages yet
          const greet = data.greeting || persona.greeting
          setMessages(curr => (curr.length ? curr : [{ role: 'assistant', content: greet }]))
          setMessagesBySpeaker(prevMap => {
            const next = { ...prevMap }
            if (!next[speaker] || !next[speaker].length) {
              next[speaker] = [{ role: 'assistant', content: greet }]
            }
            return next
          })
        }
      } catch (e) {
        if (!cancelled) {
          // Fallback: seed default greeting if no messages
          setMessages(curr => (curr.length ? curr : [{ role: 'assistant', content: persona.greeting }]))
          setMessagesBySpeaker(prevMap => {
            const next = { ...prevMap }
            if (!next[speaker] || !next[speaker].length) {
              next[speaker] = [{ role: 'assistant', content: persona.greeting }]
            }
            return next
          })
        }
      }
    }
    load()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load team member list
  useEffect(() => {
    let cancelled = false
    const loadTeam = async () => {
      try {
        const res = await fetch(`${API_URL}/team`)
        if (!res.ok) throw new Error(`status ${res.status}`)
        const data = await res.json()
        if (!cancelled) setTeam(data.team || [])
      } catch (e) {
        if (!cancelled) setTeam([{ key: 'general', name: 'General' }])
      }
    }
    loadTeam()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages, loading])

  const send = async () => {
    const q = input.trim()
    if (!q) return
    setInput('')
    const next = [...messages, { role: 'user', content: q }]
    setMessages(next)
    setMessagesBySpeaker(prevMap => ({
      ...prevMap,
      [speaker]: next,
    }))
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          speaker,
          history: (messagesBySpeaker[speaker] || []).slice(-6),
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setMessages(prev => {
        const updated = [...prev, { role: 'assistant', content: data.answer }]
        setMessagesBySpeaker(prevMap => ({
          ...prevMap,
          [speaker]: updated,
        }))
        return updated
      })
    } catch (e) {
      setMessages(prev => {
        const updated = [...prev, { role: 'assistant', content: `Oops, something went wrong: ${e.message}` }]
        setMessagesBySpeaker(prevMap => ({
          ...prevMap,
          [speaker]: updated,
        }))
        return updated
      })
    } finally {
      setLoading(false)
    }
  }

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-white">
        <div className="mx-auto max-w-3xl px-4 py-4">
          <h1 className="text-2xl font-semibold">{persona.emoji} {persona.displayName}</h1>
          <p className="text-sm text-gray-600">Friendly, witty, and supportive—just like {persona.name}.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-500">Talking as:</span>
            {team.map(t => (
              <button
                key={t.key}
                onClick={async () => {
                  const newKey = t.key
                  setSpeaker(newKey)
                  // Load this speaker's history (if any) or seed greeting
                  setMessages(prev => {
                    const existing = messagesBySpeaker[newKey]
                    if (existing && existing.length) return existing
                    return prev
                  })
                  if (!messagesBySpeaker[newKey] || !messagesBySpeaker[newKey].length) {
                    try {
                      const res = await fetch(`${API_URL}/team/${newKey}`)
                      const data = await res.json()
                      const greet = data?.greetingOverride || persona.greeting
                      const seed = [{ role: 'assistant', content: greet }]
                      setMessages(seed)
                      setMessagesBySpeaker(prevMap => ({
                        ...prevMap,
                        [newKey]: seed,
                      }))
                    } catch (e) {
                      const seed = [{ role: 'assistant', content: persona.greeting }]
                      setMessages(seed)
                      setMessagesBySpeaker(prevMap => ({
                        ...prevMap,
                        [newKey]: seed,
                      }))
                    }
                  }
                }}
                className={`text-xs rounded-full px-3 py-1 border ${speaker === t.key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                title={t.name}
              >
                {t.name}
              </button>
            ))}
            {!team.length && (
              <button className="text-xs rounded-full px-3 py-1 border bg-white text-gray-700" disabled>General</button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-4 py-4">
          <div ref={listRef} className="h-[65vh] overflow-y-auto space-y-3 p-3 bg-white rounded-xl border">
            {messages.map((m, i) => (
              <div key={i} className="flex">
                <Message role={m.role} content={m.content} />
              </div>
            ))}
            {loading && (
              <div className="text-gray-500 text-sm">Typing…</div>
            )}
          </div>

          <div className="mt-4 flex gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              rows={2}
              className="flex-1 rounded-xl border p-3 focus:outline-none focus:ring focus:ring-blue-300"
              placeholder={`Ask ${persona.displayName} anything…`}
            />
            <button onClick={send} disabled={loading} className="rounded-xl bg-blue-600 text-white px-6 py-3 hover:bg-blue-700 disabled:opacity-60">
              Send
            </button>
          </div>
        </div>
      </main>

      <footer className="py-4 text-center text-xs text-gray-500">
        Built with ❤️ for our tech lead.
      </footer>
    </div>
  )
}
