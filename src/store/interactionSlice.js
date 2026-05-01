import { createSlice } from '@reduxjs/toolkit';

const initialFormState = {
  hcpName: '',
  interactionType: 'Meeting',
  date: new Date().toISOString().split('T')[0],
  time: new Date().toTimeString().slice(0, 5),
  attendees: '',
  topicsDiscussed: '',
  materialsShared: [],
  samplesDistributed: [],
  sentiment: 'Neutral',
  outcomes: '',
  followUpActions: '',
  aiSuggestedFollowUps: [],
};

const initialState = {
  form: initialFormState,
  chatMessages: [],
  activeTab: 'form', // 'form' | 'chat'
  isSubmitting: false,
  isAiThinking: false,
  submitStatus: null, // null | 'success' | 'error'
  savedInteractions: [],
  editingId: null,
  chatInput: '',
};

const interactionSlice = createSlice({
  name: 'interaction',
  initialState,
  reducers: {
    setActiveTab(state, action) {
      state.activeTab = action.payload;
    },
    updateField(state, action) {
      const { field, value } = action.payload;
      state.form[field] = value;
    },
    updateForm(state, action) {
      state.form = { ...state.form, ...action.payload };
    },
    addMaterial(state, action) {
      state.form.materialsShared.push(action.payload);
    },
    removeMaterial(state, action) {
      state.form.materialsShared = state.form.materialsShared.filter((_, i) => i !== action.payload);
    },
    addSample(state, action) {
      state.form.samplesDistributed.push(action.payload);
    },
    removeSample(state, action) {
      state.form.samplesDistributed = state.form.samplesDistributed.filter((_, i) => i !== action.payload);
    },
    setSentiment(state, action) {
      state.form.sentiment = action.payload;
    },
    addChatMessage(state, action) {
      state.chatMessages.push(action.payload);
    },
    setChatInput(state, action) {
      state.chatInput = action.payload;
    },
    setAiThinking(state, action) {
      state.isAiThinking = action.payload;
    },
    setAiSuggestedFollowUps(state, action) {
      state.form.aiSuggestedFollowUps = action.payload;
    },
    setSubmitting(state, action) {
      state.isSubmitting = action.payload;
    },
    setSubmitStatus(state, action) {
      state.submitStatus = action.payload;
    },
    saveInteraction(state, action) {
      const existing = state.savedInteractions.findIndex(i => i.id === action.payload.id);
      if (existing >= 0) {
        state.savedInteractions[existing] = action.payload;
      } else {
        state.savedInteractions.push(action.payload);
      }
      state.submitStatus = 'success';
    },
    resetForm(state) {
      state.form = initialFormState;
      state.chatMessages = [];
      state.submitStatus = null;
      state.editingId = null;
    },
    loadInteractionForEdit(state, action) {
      const interaction = state.savedInteractions.find(i => i.id === action.payload);
      if (interaction) {
        state.form = { ...interaction };
        state.editingId = action.payload;
        state.submitStatus = null;
      }
    },
  },
});

export const {
  setActiveTab, updateField, updateForm, addMaterial, removeMaterial,
  addSample, removeSample, setSentiment, addChatMessage, setChatInput,
  setAiThinking, setAiSuggestedFollowUps, setSubmitting, setSubmitStatus,
  saveInteraction, resetForm, loadInteractionForEdit,
} = interactionSlice.actions;

export default interactionSlice.reducer;
