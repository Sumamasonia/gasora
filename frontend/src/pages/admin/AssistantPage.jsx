import { useEffect, useRef, useState } from 'react'
import { askAssistant } from '../../api'
import Spinner from '../../components/Spinner'
import './admin.css'

const INITIAL_MESSAGES = [
  {
    id: 1,
    sender: 'bot',
    text: "Hello! I am your Gasora AI Business Assistant.\n\nI can query your agency's real-time operational data. Try asking questions like **'Who is overdue?'**, **'Stock today'**, **'Recent sales'**, or **'Urgent requests'**.",
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  },
]

const QUICK_PROMPTS = [
  'Who is overdue?',
  'Stock today',
  'Recent sales',
  'Urgent requests',
  'Operating expenses',
  'Active routes',
]

export default function AssistantPage({ auth, onNavigate, onExpired }) {
  const [messages, setMessages] = useState(INITIAL_MESSAGES)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, loading])

  const handleSend = async (queryText) => {
    const textToSend = (queryText || input).trim()
    if (!textToSend || loading) return

    const userMsg = {
      id: Date.now(),
      sender: 'user',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }

    setMessages((prev) => [...prev, userMsg])
    if (!queryText) setInput('')
    setLoading(true)

    try {
      const res = await askAssistant(auth.token, textToSend)
      const botMsg = {
        id: Date.now() + 1,
        sender: 'bot',
        text: res.reply || "I didn't receive a response for that query.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        suggestions: res.suggestions || [],
      }
      setMessages((prev) => [...prev, botMsg])
    } catch (err) {
      if (err && err.status === 401) { onExpired?.(); return; }
      const errorMsg = {
        id: Date.now() + 1,
        sender: 'bot',
        text: `⚠️ Error querying assistant: ${err.message || 'Network request failed'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }
      setMessages((prev) => [...prev, errorMsg])
    } finally {
      setLoading(false)
    }
  }

  const handleClear = () => {
    setMessages(INITIAL_MESSAGES)
  }

  // Helper to render simple markdown formatting (bold, bullets, italics)
  const renderFormattedText = (text) => {
    const lines = text.split('\n')
    return lines.map((line, idx) => {
      // Bullet point
      if (line.startsWith('• ') || line.startsWith('* ')) {
        const content = line.slice(2)
        return (
          <li key={idx} style={{ marginBottom: 4 }}>
            {renderInlineSpans(content)}
          </li>
        )
      }
      if (!line.trim()) {
        return <div key={idx} style={{ height: 8 }} />
      }
      return (
        <p key={idx} style={{ margin: '0 0 4px 0' }}>
          {renderInlineSpans(line)}
        </p>
      )
    })
  }

  const renderInlineSpans = (text) => {
    // Basic bold **text** replacement
    const parts = text.split(/(\*\*.*?\*\*|\*.*?\*)/g)
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i}>{part.slice(2, -2)}</strong>
      }
      if (part.startsWith('*') && part.endsWith('*')) {
        return <em key={i} style={{ color: '#475569' }}>{part.slice(1, -1)}</em>
      }
      return part
    })
  }

  return (
    <div className="admin-page-container">
      {/* Top Header */}
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">
            <span>🤖</span>
            <span>AI Business Assistant</span>
          </h1>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            Query inventory, overdue customers, urgent requests, and financial performance through natural dialogue.
          </p>
        </div>

        <button
          type="button"
          className="secondary"
          onClick={handleClear}
          style={{ fontSize: 12 }}
        >
          🗑️ Clear Conversation
        </button>
      </div>

      {/* Demo Mode Notice Banner */}
      <div
        style={{
          background: 'rgba(2, 132, 199, 0.1)',
          border: '1px solid rgba(2, 132, 199, 0.3)',
          borderRadius: 8,
          padding: '10px 14px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div style={{ fontSize: 20 }}>💡</div>
        <div style={{ flex: 1, fontSize: 12, color: 'var(--color-primary)' }}>
          <strong>DEMO AI ASSISTANT:</strong> Answers are synthesized locally using rule-based natural language processing over your live mock database. No external LLM or API key is required.
        </div>
      </div>

      {/* Quick Suggestion Chips */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          marginBottom: 16,
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', alignSelf: 'center' }}>
          Suggested:
        </span>
        {QUICK_PROMPTS.map((p) => (
          <button
            key={p}
            type="button"
            className="secondary"
            onClick={() => handleSend(p)}
            disabled={loading}
            style={{
              padding: '4px 10px',
              fontSize: 12,
              borderRadius: 9999,
              background: 'var(--bg-subtle)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Chat Container */}
      <div
        className="admin-card"
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '520px',
          padding: 0,
          overflow: 'hidden',
        }}
      >
        {/* Messages Stream */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            background: 'var(--bg-subtle)',
          }}
        >
          {messages.map((m) => {
            const isUser = m.sender === 'user'
            return (
              <div
                key={m.id}
                style={{
                  display: 'flex',
                  justifyContent: isUser ? 'flex-end' : 'flex-start',
                  alignItems: 'flex-start',
                  gap: 10,
                }}
              >
                {!isUser && (
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      background: 'var(--color-primary)',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 16,
                      flexShrink: 0,
                    }}
                  >
                    🤖
                  </div>
                )}

                <div
                  style={{
                    maxWidth: '75%',
                    background: isUser ? 'var(--color-primary)' : 'var(--bg-card)',
                    color: isUser ? '#ffffff' : 'var(--text-primary)',
                    padding: '12px 16px',
                    borderRadius: 12,
                    borderTopRightRadius: isUser ? 2 : 12,
                    borderTopLeftRadius: !isUser ? 2 : 12,
                    boxShadow: 'var(--shadow-sm)',
                    border: isUser ? 'none' : '1px solid var(--border-subtle)',
                    fontSize: 13,
                    lineHeight: 1.5,
                  }}
                >
                  <div style={{ marginBottom: 4 }}>
                    {isUser ? m.text : renderFormattedText(m.text)}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: isUser ? 'rgba(255,255,255,0.7)' : 'var(--text-muted)',
                      textAlign: 'right',
                      marginTop: 4,
                    }}
                  >
                    {m.timestamp}
                  </div>
                </div>

                {isUser && (
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      background: 'var(--sidebar-bg)',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 14,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {auth?.username?.charAt(0).toUpperCase() || 'U'}
                  </div>
                )}
              </div>
            )
          })}

          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: 'var(--color-primary)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 16,
                }}
              >
                🤖
              </div>
              <div
                style={{
                  background: 'var(--bg-card)',
                  padding: '10px 14px',
                  borderRadius: 12,
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <Spinner />
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Analyzing database...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleSend()
          }}
          style={{
            padding: 12,
            background: 'var(--bg-card)',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            gap: 10,
            alignItems: 'center',
          }}
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question (e.g. 'Who is overdue?', 'Stock today')..."
            disabled={loading}
            style={{
              flex: 1,
              margin: 0,
              padding: '10px 14px',
              fontSize: 13,
              borderRadius: 8,
            }}
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            style={{
              padding: '10px 18px',
              fontWeight: 700,
              fontSize: 13,
              borderRadius: 8,
            }}
          >
            Send
          </button>
        </form>
      </div>
    </div>
  )
}
