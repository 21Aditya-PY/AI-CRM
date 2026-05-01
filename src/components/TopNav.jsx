import React from 'react';
import { useSelector } from 'react-redux';

export default function TopNav({ currentView, onNavigate, darkMode, onToggleTheme }) {
  const { editingId } = useSelector(s => s.interaction);

  return (
    <nav className="top-nav">
      <div className="nav-logo">
        <div className="nav-logo-icon">⚕</div>
        LifeSync CRM
      </div>
      <div className="nav-divider" />
      <div className="nav-breadcrumb">
        <span>HCP Module</span>
        <span>›</span>
        <span className="current">
          {currentView === 'form' ? 'Log Interaction' : 'Interaction History'}
        </span>
      </div>

      <div className="nav-actions">
        {currentView === 'form' ? (
          <button
            className="nav-btn"
            onClick={() => onNavigate('history')}
          >
            HCP History
          </button>
        ) : (
          <button
            className="nav-btn"
            onClick={() => onNavigate('form')}
          >
            New Entry
          </button>
        )}

        <button
          className="nav-btn theme-toggle"
          onClick={onToggleTheme}
          title="Toggle theme"
        >
          {darkMode ? '☀️' : '🌙'}
        </button>
        <div className="nav-avatar" title="Field Rep">FR</div>
      </div>
    </nav>
  );
}