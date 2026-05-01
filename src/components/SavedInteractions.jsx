import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  loadInteractionForEdit,
  resetForm
} from '../store/interactionSlice';
import InteractionForm from './InteractionForm';
import ChatPanel from './ChatPanel';

const sentimentMeta = {
  Positive: { cls: 'dot-pos', label: '😊 Positive' },
  Neutral: { cls: 'dot-neu', label: '😐 Neutral' },
  Negative: { cls: 'dot-neg', label: '😕 Negative' },
};

export default function SavedInteractions({onNavigate}) {
  const dispatch = useDispatch();
  const { savedInteractions, editingId, isSubmitting } = useSelector(s => s.interaction);

  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    if (!isSubmitting && expandedId && editingId === null) {
      setExpandedId(null);
    }
  }, [isSubmitting, editingId]);

  if (savedInteractions.length === 0) return null;

  return (
    <div style={{ marginTop: 24 }}>
      <div className="section-title" style={{ marginBottom: 12 }}>
        Logged Interactions
        <span style={{
          background: 'var(--accent-blue-dim)',
          color: 'var(--accent-blue)',
          borderRadius: 99,
          padding: '2px 8px',
          fontSize: 10,
          fontWeight: 700,
        }}>
          {savedInteractions.length}
        </span>
      </div>

      {savedInteractions.map(interaction => {
        const sm = sentimentMeta[interaction.sentiment] || sentimentMeta.Neutral;
        const isExpanded = expandedId === interaction.id;

        return (
          <div key={interaction.id}>

            {/* ── CARD ── */}
            <div
              className="interaction-item"
              style={isExpanded
                ? {
                    borderColor: 'var(--accent-amber)',
                    background: 'rgba(245,166,35,.05)'
                  }
                : {}
              }
              onClick={() => {
                dispatch(loadInteractionForEdit(interaction.id));
                setExpandedId(prev =>
                  prev === interaction.id ? null : interaction.id
                );
              }}
            >
              <div className="interaction-item-icon">🏥</div>

              <div className="interaction-item-body">
                <div className="interaction-item-name">
                  {interaction.hcpName || 'Unknown HCP'}
                </div>
                <div className="interaction-item-meta">
                  {interaction.interactionType} · {interaction.date}
                </div>
              </div>

              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                gap: 4
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span className={`sentiment-dot ${sm.cls}`} />
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    {interaction.sentiment}
                  </span>
                </div>

                {isExpanded && (
                  <span style={{
                    fontSize: 10,
                    color: 'var(--accent-amber)',
                    fontWeight: 600
                  }}>
                    EDITING
                  </span>
                )}
              </div>
            </div>

            {/* ── INLINE FORM ── */}
          {isExpanded && (
            <div style={{ marginTop: 12 }}>
              <div className="split-layout">
                <div>
                  <InteractionForm />
                </div>
                <div>
                  <ChatPanel />
                </div>
              </div>
            </div>
          )}

          </div>
        );
      })}

      {/* New Interaction Button */}
      <button
        className="btn btn-ghost btn-sm"
        style={{ width: '100%', marginTop: 8, fontSize: 12 }}
        onClick={() => {
          dispatch(resetForm());
          setExpandedId(null);
          onNavigate('form');
        }}
      >
        + New Interaction
      </button>
    </div>
  );
}
