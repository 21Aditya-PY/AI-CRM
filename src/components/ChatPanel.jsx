import React, { useRef, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  addChatMessage, setChatInput, setAiThinking,
  updateForm, saveInteraction, setAiSuggestedFollowUps
} from '../store/interactionSlice';
import { chatWithAgent } from '../services/api';
import HCPHistoryPanel from './HCPHistory.jsx';

const SAMPLE_PROMPTS = [
  'Met Dr. Sharma today, discussed OncoBoost Phase III data, she was positive about efficacy',
  'Phone call with Dr. Mehta, shared brochure on CardioPlus, neutral sentiment, wants more data',
  'Distributed 2 samples of NeuroClear to Dr. Kumar at AIIMS, follow up next week',
];

// ── Session memory — survives re-renders, dies when tab closes ─────────────────
let activeInteractionId = null;

function buildMessage(userText) {
  const hasExplicitId = /INT-[A-Z0-9]+/.test(userText);

  if (hasExplicitId) {
    // User typed an ID themselves — update our active pointer
    const match = userText.match(/INT-[A-Z0-9]+/);
    if (match) activeInteractionId = match[0];
    return userText;
  }

  if (activeInteractionId) {
    // Silently inject the active ID so the agent can find it
    return `[Ref: ${activeInteractionId}] ${userText}`;
  }

  return userText;
}

// ── Mock parser ────────────────────────────────────────────────────────────────
function mockParseInteraction(text) {
  const lower = text.toLowerCase();
  const nameMatch = lower.match(/dr\.?\s+([a-z]+(?:\s+[a-z]+)?)/);
  const hcpName = nameMatch ? 'Dr. ' + nameMatch[1].replace(/\b\w/g, c => c.toUpperCase()) : '';

  const posWords = ['positive', 'great', 'happy', 'interested', 'enthusiastic', 'impressed'];
  const negWords = ['negative', 'skeptical', 'concerned', 'unhappy', 'resistant'];
  let sentiment = 'Neutral';
  if (posWords.some(w => lower.includes(w))) sentiment = 'Positive';
  else if (negWords.some(w => lower.includes(w))) sentiment = 'Negative';

  const typeMap = { 'call': 'Phone Call', 'phone': 'Phone Call', 'email': 'Email' };
  let interactionType = 'Meeting';
  for (const [key, val] of Object.entries(typeMap)) {
    if (lower.includes(key)) { interactionType = val; break; }
  }

  const materials = ['brochure', 'pdf', 'study'].filter(m => lower.includes(m));
  const samples = ['sample', 'vial'].filter(s => lower.includes(s));

  return {
    hcpName,
    interactionType,
    sentiment,
    topicsDiscussed: 'Clinical discussion',
    materialsShared: materials,
    samplesDistributed: samples,
    outcomes: '',
    followUpActions: lower.includes('follow') ? 'Follow-up as discussed' : '',
  };
}

function mapBackendRecord(record) {
  if (!record) return null;
  return {
    hcpName: record.hcp_name || record.hcpName || '',
    interactionType: mapInteractionType(record.interaction_type || record.interactionType || 'Meeting'),
    topicsDiscussed: record.topics_discussed || record.topicsDiscussed || '',
    sentiment: record.sentiment || 'Neutral',
    materialsShared: ensureArray(record.materials_shared || record.materialsShared || []),
    samplesDistributed: ensureArray(record.samples_distributed || record.samplesDistributed || []),
    outcomes: record.outcomes || '',
    followUpActions: record.follow_up_actions || record.followUpActions || '',
    attendees: record.attendees || '',
    aiSuggestedFollowUps: ensureArray(record.ai_suggested_follow_ups || record.aiSuggestedFollowUps || []),
    date: record.date || '',
    time: record.time || '',
    id: record.id || '',
  };
}

function mapInteractionType(backendType) {
  const typeMap = {
    'call': 'Phone Call', 'phone': 'Phone Call', 'phone call': 'Phone Call',
    'meeting': 'Meeting', 'email': 'Email', 'virtual': 'Virtual Meeting',
  };
  return typeMap[backendType?.toLowerCase()] || backendType || 'Meeting';
}

function ensureArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

function buildAssistantReply(parsed) {
  const lines = ["I've analyzed your note:"];
  if (parsed.hcpName) lines.push(`\n**HCP:** ${parsed.hcpName}`);
  lines.push(`**Type:** ${parsed.interactionType}`);
  lines.push(`**Sentiment:** ${parsed.sentiment}`);
  if (parsed.topicsDiscussed) lines.push(`**Topics:** ${parsed.topicsDiscussed}`);
  if (parsed.materialsShared?.length) lines.push(`**Materials:** ${parsed.materialsShared.join(', ')}`);
  lines.push('\nForm pre-filled ✅ Review & submit!');
  return lines.join('\n');
}

// ── Render bold markdown in bubble text ───────────────────────────────────────
function BubbleLine({ line }) {
  const parts = line.split(/\*\*(.*?)\*\*/g);
  return (
    <div style={{ marginBottom: line === '' ? 6 : 0 }}>
      {parts.map((part, i) =>
        i % 2 === 1
          ? <strong key={i}>{part}</strong>
          : <span key={i}>{part}</span>
      )}
    </div>
  );
}

export default function ChatPanel() {
  const dispatch = useDispatch();
  const { chatMessages, chatInput, isAiThinking, form } = useSelector(s => s.interaction);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const [localInput, setLocalInput] = useState('');

  // Clear activeInteractionId when component unmounts or tab closes
  useEffect(() => {
    const clear = () => { activeInteractionId = null; };
    window.addEventListener('beforeunload', clear);
    return () => {
      window.removeEventListener('beforeunload', clear);
      activeInteractionId = null;
    };
  }, []);

  const handleSend = async () => {
    const msg = localInput.trim();
    if (!msg || isAiThinking) return;

    setLocalInput('');
    dispatch(addChatMessage({
      role: 'user',
      content: msg,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }));
    dispatch(setAiThinking(true));

    let parsed = null;
    let tool_used = null;
    let historyData = null;

    try {
      let assistantText = '';

      try {
        const history = chatMessages.map(m => ({ role: m.role, content: m.content }));

        // Inject activeInteractionId into the message if needed
        const messageToSend = buildMessage(msg);

        const result = await chatWithAgent(messageToSend, history);

        assistantText = result.message || '';
        tool_used = result.tool_used;

        // If a new interaction was just created, store its ID as the active one
        if (result?.message) {
          const match = result.message.match(/INT-[A-Z0-9]+/);
          if (match) {
            activeInteractionId = match[0];
          }
        }

        if (tool_used === 'get_interaction_history' && result.extracted_data) {
          historyData = result.extracted_data;
        } else if (tool_used === 'update_interaction' && result.extracted_data) {
  // 🔥 Merge update into existing form
  dispatch(updateForm({
    ...form,                     // keep existing data
    ...mapBackendRecord({
      ...form,                  // base
      ...result.extracted_data  // override only updated fields
    })
  }));

} else if (tool_used === 'get_interaction_history' && result.extracted_data) {
  historyData = result.extracted_data;

} else if (result.extracted_data) {
  parsed = mapBackendRecord(result.extracted_data);
}
      } catch (apiErr) {
        console.warn('API down, using mock:', apiErr.message);
        await new Promise(r => setTimeout(r, 1000));
        parsed = mockParseInteraction(msg);
        assistantText = buildAssistantReply(parsed);
      }

      if (!assistantText && !parsed && !historyData) {
        assistantText = "Couldn't extract details. Try rephrasing.";
      }

      dispatch(addChatMessage({
        role: 'assistant',
        content: assistantText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        parsedData: parsed,
        historyData,
      }));

    } catch (err) {
      console.error('Unhandled chat error:', err);
      dispatch(addChatMessage({
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }));
    } finally {
      dispatch(setAiThinking(false));
    }

    // Sync form only for log/edit tools, not history queries
    if (parsed) {
      dispatch(updateForm({
        ...parsed,
        date: parsed.date || form.date,
        time: parsed.time || form.time,
      }));

      if (parsed.aiSuggestedFollowUps?.length) {
        dispatch(setAiSuggestedFollowUps(parsed.aiSuggestedFollowUps));
      }
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handlePromptClick = (prompt) => {
    setLocalInput(prompt);
    textareaRef.current?.focus();
  };

  return (
    <div className="card chat-panel">
      <div className="card-header">
        <div className="card-header-icon icon-teal">🤖</div>
        <div className="card-header-text">
          <div className="card-header-title">AI Assistant</div>
          <div className="card-header-sub">Log interaction via chat</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--accent-teal)' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-teal)', display: 'inline-block', animation: 'pulse 2s infinite' }} />
          Online
        </div>
      </div>

      <div className="chat-messages">
        {chatMessages.length === 0 ? (
          <div className="chat-empty">
            <div className="chat-empty-icon">💬</div>
            <div className="chat-empty-title">Describe your HCP interaction</div>
            <div className="chat-empty-sub">Natural language → Auto form fill</div>
            <div className="chat-prompt-pills">
              {SAMPLE_PROMPTS.map((p, i) => (
                <button key={i} className="chat-pill" onClick={() => handlePromptClick(p)}>
                  "{p}"
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {chatMessages.map((msg, i) => (
              <div key={i} className={`chat-bubble ${msg.role}`}>
                <div className="bubble-meta">
                  {msg.role === 'assistant' ? '🤖 AI' : '👤 You'} · {msg.timestamp}
                </div>

                {/* Message text */}
                <div className="bubble-content">
                  {msg.content.split('\n').map((line, j) => (
                    <BubbleLine key={j} line={line} />
                  ))}
                </div>

                {/* Extracted data preview (log/edit tools) */}
                {msg.parsedData && (
                  <div className="parsed-preview">
                    <div className="parsed-preview-title">⚡ Extracted</div>
                    {msg.parsedData.hcpName && (
                      <div className="parsed-row"><span>HCP</span><span>{msg.parsedData.hcpName}</span></div>
                    )}
                    <div className="parsed-row"><span>Type</span><span>{msg.parsedData.interactionType}</span></div>
                    <div className="parsed-row"><span>Sentiment</span><span>{msg.parsedData.sentiment}</span></div>
                  </div>
                )}

                {/* History panel (get_interaction_history tool) */}
                {msg.role === 'assistant' && msg.historyData && (
                  <HCPHistoryPanel
                    hcpName={msg.historyData.hcp_name}
                    interactions={msg.historyData.interactions || []}
                    compact={true}
                  />
                )}
              </div>
            ))}

            {isAiThinking && (
              <div className="chat-bubble assistant">
                <div className="bubble-meta">🤖 AI Assistant</div>
                <div className="typing-indicator">
                  <div className="typing-dot" /><div className="typing-dot" /><div className="typing-dot" />
                </div>
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area">
        <div className="chat-input-wrap">
          <textarea
            ref={textareaRef}
            className="chat-input"
            rows={2}
            placeholder='e.g. "Phone call with Dr. Mehta, shared brochure..."'
            value={localInput}
            onChange={e => setLocalInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
        <button
          className="chat-send-btn"
          onClick={handleSend}
          disabled={!localInput.trim() || isAiThinking}
        >
          ↑
        </button>
      </div>
    </div>
  );
}