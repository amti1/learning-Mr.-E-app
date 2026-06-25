import api from '../api.js';
import { $, on } from '../utils/dom.js';
import { showToast } from '../components/toast.js';
import { navigate } from '../router.js';

export async function renderLoginPage() {
  return `
    <div class="login-page">
      <div class="login-bg"></div>
      <div class="login-card card-glass">
        <div class="login-header">
          <div class="login-logo">📚</div>
          <h1 class="login-title">عربي</h1>
          <p class="login-subtitle">Arabic Learning Platform</p>
        </div>
        <div id="login-form-container">
          <form id="login-form" class="login-form">
            <div class="input-group">
              <label for="login-username">Username</label>
              <input type="text" class="input" id="login-username" placeholder="Enter username" required autocomplete="username" />
            </div>
            <div class="input-group">
              <label for="login-password">Password</label>
              <input type="password" class="input" id="login-password" placeholder="Enter password" required autocomplete="current-password" />
            </div>
            <button type="submit" class="btn btn-primary btn-lg btn-full" id="login-submit">Sign In</button>
            <div id="login-error" class="form-error" style="display:none"></div>
          </form>
          <div class="login-footer">
            <p>Don't have an account? <button class="btn btn-ghost" id="show-register">Register</button></p>
          </div>
        </div>
        <div id="register-form-container" style="display:none">
          <form id="register-form" class="login-form">
            <div class="input-group">
              <label for="reg-username">Username</label>
              <input type="text" class="input" id="reg-username" placeholder="Choose a username" required />
            </div>
            <div class="input-group">
              <label for="reg-email">Email</label>
              <input type="email" class="input" id="reg-email" placeholder="Enter email" />
            </div>
            <div class="input-group">
              <label for="reg-display">Display Name</label>
              <input type="text" class="input" id="reg-display" placeholder="Your display name" />
            </div>
            <div class="input-group">
              <label for="reg-password">Password</label>
              <input type="password" class="input" id="reg-password" placeholder="Choose a password" required minlength="6" />
            </div>
            <button type="submit" class="btn btn-primary btn-lg btn-full" id="register-submit">Create Account</button>
            <div id="register-error" class="form-error" style="display:none"></div>
          </form>
          <div class="login-footer">
            <p>Already have an account? <button class="btn btn-ghost" id="show-login">Sign In</button></p>
          </div>
        </div>
        <div class="login-demo">
          <p class="text-muted" style="font-size:0.85rem">Demo: admin / admin123 or student / student123</p>
        </div>
      </div>
    </div>
  `;
}

export async function initLoginPage() {
  on('#show-register', 'click', () => {
    $('#login-form-container').style.display = 'none';
    $('#register-form-container').style.display = '';
  });
  on('#show-login', 'click', () => {
    $('#login-form-container').style.display = '';
    $('#register-form-container').style.display = 'none';
  });

  on('#login-form', 'submit', async (e) => {
    e.preventDefault();
    const username = $('#login-username').value.trim();
    const password = $('#login-password').value;
    const errEl = $('#login-error');
    const btn = $('#login-submit');

    try {
      btn.disabled = true; btn.textContent = 'Signing in...';
      const data = await api.login(username, password);
      api.setToken(data.token);
      localStorage.setItem('arabic_lp_user', JSON.stringify(data.user));
      showToast('Welcome back! 👋', 'success');
      navigate('/dashboard');
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = '';
    } finally {
      btn.disabled = false; btn.textContent = 'Sign In';
    }
  });

  on('#register-form', 'submit', async (e) => {
    e.preventDefault();
    const username = $('#reg-username').value.trim();
    const email = $('#reg-email').value.trim();
    const display_name = $('#reg-display').value.trim();
    const password = $('#reg-password').value;
    const errEl = $('#register-error');
    const btn = $('#register-submit');

    try {
      btn.disabled = true; btn.textContent = 'Creating...';
      const data = await api.register({ username, email, password, display_name });
      api.setToken(data.token);
      localStorage.setItem('arabic_lp_user', JSON.stringify(data.user));
      showToast('Account created! Welcome! 🎉', 'success');
      navigate('/dashboard');
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = '';
    } finally {
      btn.disabled = false; btn.textContent = 'Create Account';
    }
  });
}
