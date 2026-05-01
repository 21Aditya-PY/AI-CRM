import axios from 'axios';

const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Single unified chat endpoint — handles new logs, edits, queries
export const chatWithAgent = async (message, conversationHistory = []) => {
  const response = await api.post('/api/agent/chat', {
    message,
    history: conversationHistory,
  });
  return response.data;
};

// Log a structured form interaction (form submit, not chat)
export const logInteractionForm = async (formData) => {
  const response = await api.post('/api/interactions', formData);
  return response.data;
};

// Edit an existing interaction (direct field update, not chat)
export const editInteraction = async (id, updates) => {
  const response = await api.put(`/api/interactions/${id}`, updates);
  return response.data;
};

// Get AI suggested follow-ups
export const getSuggestedFollowUps = async (interactionData) => {
  const response = await api.post('/api/agent/suggest-followups', interactionData);
  return response.data;
};

// Search HCP by name
export const searchHCP = async (query) => {
  const response = await api.get(`/api/hcp/search?q=${encodeURIComponent(query)}`);
  return response.data;
};

// Get all interactions
export const getInteractions = async () => {
  const response = await api.get('/api/interactions');
  return response.data;
};

export const getHCPHistory = async (hcpName, limit = 5) => {
  const response = await api.get(
    `/api/hcp/history/${encodeURIComponent(hcpName)}?limit=${limit}`
  );
  return response.data;
};

export default api;