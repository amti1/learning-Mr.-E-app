// ============================================
// STORE — Simple Reactive State Management
// ============================================

const _state = {
  user: null,
  token: null,
  theme: 'dark',
  currentSession: null,
  notifications: [],
  soundEnabled: true,
  dailyGoal: 20,
  weeklyGoal: 100,
};

const _listeners = {};

export function setState(key, value) {
  _state[key] = value;
  if (_listeners[key]) {
    _listeners[key].forEach(cb => {
      try { cb(value); } catch (e) { console.error(`Store listener error for "${key}":`, e); }
    });
  }
  saveToStorage();
}

export function getState(key) {
  return key ? _state[key] : { ..._state };
}

export function subscribe(key, callback) {
  if (!_listeners[key]) _listeners[key] = [];
  _listeners[key].push(callback);
  return () => {
    _listeners[key] = _listeners[key].filter(cb => cb !== callback);
  };
}

export function loadFromStorage() {
  try {
    const saved = localStorage.getItem('arabi_state');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.token) _state.token = parsed.token;
      if (parsed.user) _state.user = parsed.user;
      if (parsed.theme) _state.theme = parsed.theme;
      if (parsed.soundEnabled !== undefined) _state.soundEnabled = parsed.soundEnabled;
      if (parsed.dailyGoal) _state.dailyGoal = parsed.dailyGoal;
      if (parsed.weeklyGoal) _state.weeklyGoal = parsed.weeklyGoal;
    }
  } catch (e) {
    console.warn('Failed to load state from storage:', e);
  }
}

export function saveToStorage() {
  try {
    const toSave = {
      token: _state.token,
      user: _state.user,
      theme: _state.theme,
      soundEnabled: _state.soundEnabled,
      dailyGoal: _state.dailyGoal,
      weeklyGoal: _state.weeklyGoal,
    };
    localStorage.setItem('arabi_state', JSON.stringify(toSave));
  } catch (e) {
    console.warn('Failed to save state to storage:', e);
  }
}

export function clearState() {
  _state.user = null;
  _state.token = null;
  _state.currentSession = null;
  _state.notifications = [];
  localStorage.removeItem('arabi_state');
}

export default { setState, getState, subscribe, loadFromStorage, saveToStorage, clearState };
