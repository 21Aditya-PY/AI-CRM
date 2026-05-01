import React, { useState } from 'react';
import { Provider } from 'react-redux';
import store from './store';
import TopNav from './components/TopNav';
import InteractionForm from './components/InteractionForm';
import ChatPanel from './components/ChatPanel';
import SavedInteractions from './components/SavedInteractions';
import Toast from './components/Toast';
import './styles/global.css';

function AppContent() {
  const [currentView, setCurrentView] = useState('form'); 
  const [darkMode, setDarkMode] = useState(false);

  return (
    <div className={`app-shell ${darkMode ? 'dark' : 'light'}`}>
      <TopNav
        currentView={currentView}
        onNavigate={setCurrentView}
        darkMode={darkMode}
        onToggleTheme={() => setDarkMode(d => !d)}
      />

      <main className="page-content">
        {currentView === 'form' ? (
          <>
            <div className="page-header">
              <div className="page-title-block">
                <h1 className="page-title">Log HCP Interaction</h1>
                <p className="page-subtitle">
                  Use the structured form or describe the interaction to the AI assistant
                </p>
              </div>
            </div>
            <div className="split-layout">
              <div>
                <InteractionForm />
              </div>
              <div>
                <ChatPanel />
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="page-header">
              <div className="page-title-block">
                <h1 className="page-title">Interaction History</h1>
                <p className="page-subtitle">
                  All logged HCP interactions
                </p>
              </div>
            </div>
            <SavedInteractions onNavigate={setCurrentView}/>
          </>
        )}
      </main>

      <Toast />
    </div>
  );
}

export default function App() {
  return (
    <Provider store={store}>
      <AppContent />
    </Provider>
  );
}