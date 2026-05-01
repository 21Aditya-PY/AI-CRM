import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  updateField, addMaterial, removeMaterial,
  addSample, removeSample, setSentiment,
  setSubmitting, saveInteraction, resetForm,
  setAiSuggestedFollowUps
} from '../store/interactionSlice';
import { logInteractionForm, getSuggestedFollowUps } from '../services/api';

const INTERACTION_TYPES = ['Meeting', 'Phone Call', 'Email', 'Conference', 'Virtual Meeting', 'CME Event'];

const MOCK_HCPS = [
  'Dr. Ravi Sharma', 'Dr. Priya Mehta', 'Dr. Anil Kumar',
  'Dr. Sunita Patel', 'Dr. Vikram Singh', 'Dr. Nandita Roy',
];

export default function InteractionForm() {
  const dispatch = useDispatch();
  const { form, isSubmitting, editingId } = useSelector(s => s.interaction);
  const [materialInput, setMaterialInput] = useState('');
  const [sampleInput, setSampleInput] = useState('');
  const [hcpSearch, setHcpSearch] = useState('');
  const [showHcpDropdown, setShowHcpDropdown] = useState(false);
  const [isGettingSuggestions, setIsGettingSuggestions] = useState(false);
  const safeForm = {
    ...form,
    materialsShared: Array.isArray(form.materialsShared) ? form.materialsShared : [],
    samplesDistributed: Array.isArray(form.samplesDistributed) ? form.samplesDistributed : [],
    aiSuggestedFollowUps: Array.isArray(form.aiSuggestedFollowUps) ? form.aiSuggestedFollowUps : [],
  };

  const filteredHCPs = MOCK_HCPS.filter(h =>
    h.toLowerCase().includes(hcpSearch.toLowerCase())
  );

  const handleAddMaterial = () => {
    if (materialInput.trim()) {
      dispatch(addMaterial(materialInput.trim()));
      setMaterialInput('');
    }
  };

  const handleAddSample = () => {
    if (sampleInput.trim()) {
      dispatch(addSample(sampleInput.trim()));
      setSampleInput('');
    }
  };

  const handleGetSuggestions = async () => {
    setIsGettingSuggestions(true);
    try {
      // Try API, fall back to mock
      let suggestions;
      try {
        const result = await getSuggestedFollowUps(safeForm);
        suggestions = result.suggestions;
      } catch {
        // Mock AI suggestions based on form data
        suggestions = [
          `Schedule follow-up with ${safeForm.hcpName || 'HCP'} in 2 weeks`,
          safeForm.materialsShared.length > 0
            ? `Send digital copy of ${safeForm.materialsShared[0]} to HCP`
            : 'Send product efficacy data summary via email',
          'Add to advisory board invite list for Q3 symposium',
          'Log sample usage in compliance tracker',
        ];
      }
      dispatch(setAiSuggestedFollowUps(suggestions));
    } finally {
      setIsGettingSuggestions(false);
    }
  };

  const handleSubmit = async () => {
    if (!safeForm.hcpName) { alert('Please select an HCP.'); return; }
    dispatch(setSubmitting(true));
    try {
      const payload = {
        ...safeForm,
        id: editingId || `INT-${Date.now()}`,
        createdAt: new Date().toISOString(),
      };
      try {
        await logInteractionForm(payload);
      } catch {
      
      }
      dispatch(saveInteraction(payload));
      dispatch(resetForm()); 
      setTimeout(() => {
        dispatch(setSubmitting(false));
      }, 600);
    } catch {
      dispatch(setSubmitting(false));
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-header-icon icon-blue">📋</div>
        <div className="card-header-text">
          <div className="card-header-title">Interaction Details</div>
          <div className="card-header-sub">Structured form entry</div>
        </div>
      </div>

      {/* ── Section: Core Info ── */}
      <div className="form-section">
        <div className="section-title">Core Information</div>
        <div className="form-grid-2">

          {/* HCP Name */}
          <div className="field-group" style={{ position: 'relative' }}>
            <label className="field-label">HCP Name *</label>
            <input
              className="field-input"
              placeholder="Search or select HCP..."
              value={safeForm.hcpName || hcpSearch}
              onChange={e => {
                setHcpSearch(e.target.value);
                dispatch(updateField({ field: 'hcpName', value: '' }));
                setShowHcpDropdown(true);
              }}
              onFocus={() => setShowHcpDropdown(true)}
              onBlur={() => setTimeout(() => setShowHcpDropdown(false), 150)}
            />
            {showHcpDropdown && filteredHCPs.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow-md)',
                marginTop: 4, overflow: 'hidden',
              }}>
                {filteredHCPs.map(hcp => (
                  <div key={hcp}
                    style={{
                      padding: '9px 12px', cursor: 'pointer', fontSize: 13,
                      color: 'var(--text-primary)',
                    }}
                    onMouseOver={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                    onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                    onMouseDown={() => {
                      dispatch(updateField({ field: 'hcpName', value: hcp }));
                      setHcpSearch(hcp);
                      setShowHcpDropdown(false);
                    }}
                  >
                    {hcp}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Interaction Type */}
          <div className="field-group">
            <label className="field-label">Interaction Type</label>
            <select
              className="field-input field-select"
              value={safeForm.interactionType}
              onChange={e => dispatch(updateField({ field: 'interactionType', value: e.target.value }))}
            >
              {INTERACTION_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>

          {/* Date */}
          <div className="field-group">
            <label className="field-label">Date</label>
            <input
              type="date"
              className="field-input"
              value={safeForm.date}
              onChange={e => dispatch(updateField({ field: 'date', value: e.target.value }))}
            />
          </div>

          {/* Time */}
          <div className="field-group">
            <label className="field-label">Time</label>
            <input
              type="time"
              className="field-input"
              value={safeForm.time}
              onChange={e => dispatch(updateField({ field: 'time', value: e.target.value }))}
            />
          </div>

          {/* Attendees */}
          <div className="field-group span-2">
            <label className="field-label">Attendees</label>
            <input
              className="field-input"
              placeholder="Enter names or search..."
              value={safeForm.attendees}
              onChange={e => dispatch(updateField({ field: 'attendees', value: e.target.value }))}
            />
          </div>

          {/* Topics Discussed */}
          <div className="field-group span-2">
            <label className="field-label">Topics Discussed</label>
            <textarea
              className="field-input field-textarea"
              placeholder="Enter key discussion points..."
              value={safeForm.topicsDiscussed}
              onChange={e => dispatch(updateField({ field: 'topicsDiscussed', value: e.target.value }))}
            />
          </div>
        </div>
      </div>

      {/* ── Section: Voice Note ── */}
      <div className="form-section">
        <button className="voice-btn" onClick={() => alert('Voice Note feature requires microphone access. This would trigger speech-to-text summarization via the AI agent.')}>
          🎙️ Summarize from Voice Note <span style={{ opacity: .6, fontSize: 11 }}>(Requires Consent)</span>
        </button>
      </div>

      {/* ── Section: Materials & Samples ── FIXED 🛡️ */}
      <div className="form-section">
        <div className="section-title">Materials Shared / Samples Distributed</div>

        <div className="form-grid-2">
          <div className="field-group">
            <label className="field-label">Materials Shared</label>
            <div className="tag-list">
              {safeForm.materialsShared.length === 0
                ? <span className="tag-empty">No materials added</span>
                : safeForm.materialsShared.map((m, i) => (
                    <span key={i} className="tag">
                      {String(m)}
                      <span className="tag-remove" onClick={() => dispatch(removeMaterial(i))}>×</span>
                    </span>
                  ))
              }
            </div>
            <div className="add-row">
              <input
                className="field-input"
                style={{ flex: 1 }}
                placeholder="Add material..."
                value={materialInput}
                onChange={e => setMaterialInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddMaterial()}
              />
              <button className="btn btn-ghost btn-sm" onClick={handleAddMaterial}>+ Add</button>
            </div>
          </div>

          <div className="field-group">
            <label className="field-label">Samples Distributed</label>
            <div className="tag-list">
              {safeForm.samplesDistributed.length === 0
                ? <span className="tag-empty">No samples added</span>
                : safeForm.samplesDistributed.map((s, i) => (
                    <span key={i} className="tag sample">
                      {String(s)}
                      <span className="tag-remove" onClick={() => dispatch(removeSample(i))}>×</span>
                    </span>
                  ))
              }
            </div>
            <div className="add-row">
              <input
                className="field-input"
                style={{ flex: 1 }}
                placeholder="Add sample..."
                value={sampleInput}
                onChange={e => setSampleInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddSample()}
              />
              <button className="btn btn-ghost btn-sm" onClick={handleAddSample}>+ Add</button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Section: Sentiment & Outcomes ── */}
      <div className="form-section">
        <div className="section-title">Observed HCP Sentiment</div>
        <div className="sentiment-group">
          {[
            { key: 'Positive', emoji: '😊', cls: 'active-pos' },
            { key: 'Neutral', emoji: '😐', cls: 'active-neu' },
            { key: 'Negative', emoji: '😕', cls: 'active-neg' },
          ].map(({ key, emoji, cls }) => (
            <button
              key={key}
              className={`sentiment-btn ${safeForm.sentiment === key ? cls : ''}`}
              onClick={() => dispatch(setSentiment(key))}
            >
              {emoji} {key}
            </button>
          ))}
        </div>
      </div>

      <div className="form-section">
        <div className="form-grid-2">
          <div className="field-group span-2">
            <label className="field-label">Outcomes</label>
            <textarea
              className="field-input field-textarea"
              placeholder="Key outcomes or agreements..."
              value={safeForm.outcomes}
              onChange={e => dispatch(updateField({ field: 'outcomes', value: e.target.value }))}
            />
          </div>

          <div className="field-group span-2">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label className="field-label">Follow-up Actions</label>
              <button
                className="btn btn-ghost btn-sm"
                onClick={handleGetSuggestions}
                disabled={isGettingSuggestions}
                style={{ fontSize: 11 }}
              >
                {isGettingSuggestions ? <><span className="spinner" /> Getting AI suggestions…</> : '✨ AI Suggest'}
              </button>
            </div>
            <textarea
              className="field-input field-textarea"
              placeholder="Enter next steps or tasks..."
              value={safeForm.followUpActions}
              onChange={e => dispatch(updateField({ field: 'followUpActions', value: e.target.value }))}
            />
          </div>
        </div>

        {safeForm.aiSuggestedFollowUps.length > 0 && (
          <div className="ai-suggestions mt-12">
            <div className="ai-suggestion-header">
              ✨ AI Suggested Follow-ups
            </div>
            {safeForm.aiSuggestedFollowUps.map((s, i) => (
              <div key={i} className="ai-suggestion-item">{s}</div>
            ))}
          </div>
        )}
      </div>

      {/* ── Action Bar ── */}
      <div className="action-bar">
        <button className="btn btn-ghost" onClick={() => dispatch(resetForm())}>
          🗑 Discard
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost">Save Draft</button>
          <button
            className="btn btn-primary btn-lg"
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting
              ? <><span className="spinner" /> Logging…</>
              : editingId ? 'Update Interaction' : ' Log Interaction'
            }
          </button>
        </div>
      </div>
    </div>
  );
}