import React, { useState, useEffect } from 'react';
import { getHCPHistory } from '../services/api';
const SENTIMENT = {
  Positive: { color: 'var(--accent-teal)',  bg: 'rgba(56,189,160,0.10)', emoji: '😊' },
  Neutral:  { color: 'var(--text-muted)',   bg: 'rgba(148,163,184,0.10)', emoji: '😐' },
  Negative: { color: 'var(--accent-red,#f87171)', bg: 'rgba(248,113,113,0.10)', emoji: '😕' },
};

function typeIcon(type = '') {
  const t = type.toLowerCase();
  if (t.includes('phone') || t.includes('call')) return '📞';
  if (t.includes('email'))   return '📧';
  if (t.includes('virtual')) return '💻';
  if (t.includes('cme') || t.includes('conference')) return '🎓';
  return '🤝';
}
function HistoryCard({ interaction, index, onEdit }) {
  const [expanded, setExpanded] = useState(false);
  const sm = SENTIMENT[interaction.sentiment] || SENTIMENT.Neutral;
  const hasDetails =
    interaction.outcomes || interaction.follow_up_actions || interaction.topics;

  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        opacity: 0,
        animation: `slideIn 0.3s ease forwards`,
        animationDelay: `${index * 60}ms`,
      }}
    >

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: 'var(--bg-card, #1e293b)',
          border: '1.5px solid var(--border, #334155)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, flexShrink: 0,
          boxShadow: '0 0 0 3px var(--bg-main, #0f172a)',
        }}>
          {typeIcon(interaction.type)}
        </div>
        <div style={{
          width: 1,
          flex: 1,
          minHeight: 12,
          background: 'var(--border, #334155)',
          marginTop: 4,
        }} />
      </div>

      <div style={{
        flex: 1,
        background: 'var(--bg-card, #1e293b)',
        border: '1px solid var(--border, #334155)',
        borderRadius: 'var(--radius-sm, 8px)',
        padding: '10px 12px',
        marginBottom: 8,
        cursor: hasDetails ? 'pointer' : 'default',
        transition: 'border-color 0.15s',
      }}
        onMouseEnter={e => { if (hasDetails) e.currentTarget.style.borderColor = 'var(--accent-blue, #60a5fa)'; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border, #334155)'; }}
        onClick={() => hasDetails && setExpanded(v => !v)}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{
                fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 99,
                background: 'var(--bg-hover, #0f172a)',
                color: 'var(--text-muted, #94a3b8)',
                textTransform: 'uppercase', letterSpacing: '0.05em',
              }}>
                {interaction.type || 'Meeting'}
              </span>
              <span style={{
                fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 99,
                background: sm.bg, color: sm.color,
              }}>
                {sm.emoji} {interaction.sentiment}
              </span>
              <span style={{
                fontSize: 10, color: 'var(--text-muted, #94a3b8)',
                fontFamily: 'monospace', opacity: 0.6,
              }}>
                {interaction.id}
              </span>
            </div>

            {interaction.topics && (
              <div style={{
                marginTop: 5, fontSize: 12.5,
                color: 'var(--text-primary, #f1f5f9)',
                fontWeight: 500,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {interaction.topics}
              </div>
            )}
          </div>
          <div style={{
            fontSize: 11, color: 'var(--text-muted, #94a3b8)',
            whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            {interaction.date || '—'}
            <button
                onClick={(e) => {
                e.stopPropagation(); 
                onEdit && onEdit(interaction);
                }}
                style={{
                fontSize: 11,
                background: 'var(--accent-blue, #60a5fa)',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                padding: '3px 8px',
                cursor: 'pointer'
                }}
            >
                Edit
            </button>
          </div>
        </div>

        
        {expanded && hasDetails && (
          <div style={{
            marginTop: 10,
            paddingTop: 10,
            borderTop: '1px solid var(--border, #334155)',
            display: 'flex', flexDirection: 'column', gap: 7,
          }}>
            {interaction.outcomes && (
              <DetailRow label="Outcomes" value={interaction.outcomes} />
            )}
            {interaction.follow_up_actions && (
              <DetailRow label="Follow-up" value={interaction.follow_up_actions} />
            )}
          </div>
        )}

       
        {hasDetails && (
          <div style={{
            marginTop: 6, fontSize: 10,
            color: 'var(--accent-blue, #60a5fa)', opacity: 0.6,
          }}>
            {expanded ? '▲ collapse' : '▼ expand'}
          </div>
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: 12 }}>
      <span style={{
        color: 'var(--text-muted, #94a3b8)', fontWeight: 600,
        minWidth: 72, flexShrink: 0,
      }}>
        {label}
      </span>
      <span style={{ color: 'var(--text-primary, #f1f5f9)', lineHeight: 1.5 }}>
        {value}
      </span>
    </div>
  );
}

function SummaryBar({ interactions }) {
  const counts = interactions.reduce((acc, i) => {
    acc[i.sentiment] = (acc[i.sentiment] || 0) + 1;
    return acc;
  }, {});

  return (
    <div style={{
      display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap',
    }}>
      {Object.entries(counts).map(([sentiment, count]) => {
        const sm = SENTIMENT[sentiment] || SENTIMENT.Neutral;
        return (
          <div key={sentiment} style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: sm.bg,
            border: `1px solid ${sm.color}33`,
            borderRadius: 99, padding: '3px 10px',
            fontSize: 11, color: sm.color, fontWeight: 600,
          }}>
            {sm.emoji} {count} {sentiment}
          </div>
        );
      })}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 5,
        background: 'var(--bg-hover, #0f172a)',
        border: '1px solid var(--border, #334155)',
        borderRadius: 99, padding: '3px 10px',
        fontSize: 11, color: 'var(--text-muted, #94a3b8)',
      }}>
        📊 {interactions.length} total
      </div>
    </div>
  );
}


export default function HCPHistoryPanel({
  hcpName,
  interactions: prefetched,
  limit = 5,
  compact = false,
  onClose,
}) {
  const [interactions, setInteractions] = useState(prefetched || []);
  const [loading, setLoading] = useState(!prefetched);
  const [error, setError] = useState(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (prefetched) return; 
    if (!hcpName) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    getHCPHistory(hcpName, limit)
      .then(data => {
        if (!cancelled) setInteractions(data.interactions || []);
      })
      .catch(err => {
        if (!cancelled) setError(err.message || 'Failed to load history');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [hcpName, limit, prefetched]);

  const visible = showAll ? interactions : interactions.slice(0, 3);

  return (
    <>
      
      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div style={{
        background: 'var(--bg-card, #1e293b)',
        border: '1px solid var(--border, #334155)',
        borderRadius: 'var(--radius, 12px)',
        padding: compact ? '12px 14px' : '16px 18px',
        marginTop: compact ? 8 : 0,
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', marginBottom: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8,
              background: 'var(--accent-blue-dim, rgba(96,165,250,0.15))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14,
            }}>
              🕐
            </div>
            <div>
              <div style={{
                fontSize: 13, fontWeight: 600,
                color: 'var(--text-primary, #f1f5f9)',
              }}>
                History · {hcpName}
              </div>
              {!loading && !error && (
                <div style={{ fontSize: 11, color: 'var(--text-muted, #94a3b8)' }}>
                  {interactions.length === 0
                    ? 'No interactions found'
                    : `${interactions.length} past interaction${interactions.length > 1 ? 's' : ''}`}
                </div>
              )}
            </div>
          </div>

          {onClose && (
            <button
              onClick={onClose}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted, #94a3b8)', fontSize: 16, padding: 4,
                lineHeight: 1,
              }}
              aria-label="Close history"
            >
              ×
            </button>
          )}
        </div>

        {/* Loading */}
        {loading && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            color: 'var(--text-muted, #94a3b8)', fontSize: 13, padding: '8px 0',
          }}>
            <div style={{
              width: 14, height: 14, border: '2px solid var(--border, #334155)',
              borderTopColor: 'var(--accent-blue, #60a5fa)',
              borderRadius: '50%', animation: 'spin 0.7s linear infinite',
            }} />
            Loading history…
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div style={{
            fontSize: 12, color: 'var(--accent-red, #f87171)',
            padding: '8px 0',
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* Empty */}
        {!loading && !error && interactions.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '20px 0',
            color: 'var(--text-muted, #94a3b8)', fontSize: 13,
          }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>📭</div>
            No past interactions with {hcpName}
          </div>
        )}

        {/* Summary + timeline */}
        {!loading && !error && interactions.length > 0 && (
          <>
            <SummaryBar interactions={interactions} />

            <div>
              {visible.map((interaction, i) => (
                <HistoryCard key={interaction.id || i} interaction={interaction} index={i} />
              ))}
            </div>

            {/* Show more / less */}
            {interactions.length > 3 && (
              <button
                onClick={() => setShowAll(v => !v)}
                style={{
                  width: '100%', marginTop: 4,
                  background: 'none',
                  border: '1px dashed var(--border, #334155)',
                  borderRadius: 'var(--radius-sm, 8px)',
                  color: 'var(--accent-blue, #60a5fa)',
                  fontSize: 12, padding: '6px 0',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover, #0f172a)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                {showAll
                  ? `▲ Show less`
                  : `▼ Show ${interactions.length - 3} more`}
              </button>
            )}
          </>
        )}
      </div>
    </>
  );
}