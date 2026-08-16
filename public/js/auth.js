/* ============================================
   SHOEPHILE — Authentication
   ============================================ */

const Auth = {
  TOKEN_KEY: 'shoephile_auth_token',
  USER_KEY: 'shoephile_user',

  getAuthToken() {
    return localStorage.getItem(this.TOKEN_KEY) || null;
  },

  getCurrentUser() {
    try {
      return JSON.parse(localStorage.getItem(this.USER_KEY)) || null;
    } catch {
      return null;
    }
  },

  isLoggedIn() {
    return !!this.getAuthToken();
  },

  setSession(token, user) {
    if (!token) return;
    localStorage.setItem(this.TOKEN_KEY, token);
    if (user) {
      const safe = {
        id: user.id,
        name: user.name || '',
        email: user.email || '',
        phone: user.phone || ''
      };
      localStorage.setItem(this.USER_KEY, JSON.stringify(safe));
    }
  },

  clearSession() {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
  },

  async loginUser(email, password) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.message || data.error || 'Invalid email or password.');
    }
    if (data.token) this.setSession(data.token, data.user);
    return data;
  },

  async signupUser(payload) {
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.message || data.error || 'Could not create account.');
    }
    if (data.token) this.setSession(data.token, data.user);
    return data;
  },

  async logoutUser() {
    const token = this.getAuthToken();
    try {
      if (token) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          }
        });
      }
    } catch (_) {}
    this.clearSession();
    this.updateNavbar();
  },

  async getMe() {
    const token = this.getAuthToken();
    if (!token) return null;
    try {
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        this.clearSession();
        return null;
      }
      const data = await res.json();
      const user = data.user || data;
      this.setSession(token, user);
      return user;
    } catch {
      this.clearSession();
      return null;
    }
  },

  async requireLogin(redirectTo = 'login.html') {
    if (!this.isLoggedIn()) {
      const returnUrl = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `${redirectTo}?return=${returnUrl}`;
      return false;
    }
    const user = await this.getMe();
    if (!user) {
      window.location.href = redirectTo;
      return false;
    }
    return true;
  },

  getFirstName(user) {
    if (!user || !user.name) return 'there';
    return user.name.trim().split(/\s+/)[0];
  },

  updateNavbar() {
    const user = this.getCurrentUser();
    const loggedIn = this.isLoggedIn() && user;

    // Desktop header-actions
    document.querySelectorAll('.header-actions').forEach(actions => {
      let area = actions.querySelector('.auth-area');
      if (!area) {
        area = document.createElement('div');
        area.className = 'auth-area';
        // Insert before cart if possible, otherwise append
        const cart = actions.querySelector('a[href="cart.html"], a[href*="cart"]');
        if (cart) actions.insertBefore(area, cart);
        else actions.appendChild(area);
      }

      if (loggedIn) {
        area.innerHTML = `
          <div class="auth-dropdown">
            <button class="header-action auth-trigger" aria-label="Account" aria-expanded="false">
              <span class="auth-greeting">Hi, ${this.getFirstName(user)}</span>
              <svg class="icon" viewBox="0 0 24 24" width="16" height="16" style="margin-left:4px;"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>
            </button>
            <div class="auth-menu">
              <a href="account.html">My Account</a>
              <a href="account.html#orders">My Orders</a>
              <button type="button" class="auth-logout">Logout</button>
            </div>
          </div>`;
      } else {
        area.innerHTML = `
          <a href="login.html" class="header-action auth-login-link" aria-label="Login">
            <svg class="icon" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          </a>`;
      }
    });

    // Mobile nav
    document.querySelectorAll('.mobile-nav-links').forEach(nav => {
      let mobileAuth = nav.querySelector('.mobile-auth');
      if (!mobileAuth) {
        mobileAuth = document.createElement('div');
        mobileAuth.className = 'mobile-auth';
        nav.appendChild(mobileAuth);
      }
      if (loggedIn) {
        mobileAuth.innerHTML = `
          <a href="account.html">My Account</a>
          <a href="account.html#orders">My Orders</a>
          <button type="button" class="auth-logout mobile-logout">Logout</button>`;
      } else {
        mobileAuth.innerHTML = `<a href="login.html">Login</a><a href="signup.html">Create Account</a>`;
      }
    });

    // Bind logout + dropdown
    document.querySelectorAll('.auth-logout').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        await this.logoutUser();
        if (typeof Cart !== 'undefined' && Cart.showToast) {
          Cart.showToast('You have been logged out');
        }
        window.location.href = 'index.html';
      });
    });

    document.querySelectorAll('.auth-trigger').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const dropdown = btn.closest('.auth-dropdown');
        const isOpen = dropdown.classList.contains('open');
        document.querySelectorAll('.auth-dropdown').forEach(d => d.classList.remove('open'));
        if (!isOpen) {
          dropdown.classList.add('open');
          btn.setAttribute('aria-expanded', 'true');
        } else {
          btn.setAttribute('aria-expanded', 'false');
        }
      });
    });

    // Close dropdown on outside click
    document.addEventListener('click', () => {
      document.querySelectorAll('.auth-dropdown').forEach(d => {
        d.classList.remove('open');
        const t = d.querySelector('.auth-trigger');
        if (t) t.setAttribute('aria-expanded', 'false');
      });
    });
  },

  async init() {
    if (this.isLoggedIn()) {
      await this.getMe();
    }
    this.updateNavbar();
  }
};

// Password visibility toggle helper
function bindPasswordToggles(root = document) {
  root.querySelectorAll('[data-password-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-password-toggle');
      const input = document.getElementById(targetId);
      if (!input) return;
      const isPass = input.type === 'password';
      input.type = isPass ? 'text' : 'password';
      btn.setAttribute('aria-label', isPass ? 'Hide password' : 'Show password');
      btn.innerHTML = isPass
        ? `<svg class="icon" viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`
        : `<svg class="icon" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
    });
  });
}

// Simple password strength (visual only, minimal)
function bindPasswordStrength(inputId, meterId) {
  const input = document.getElementById(inputId);
  const meter = document.getElementById(meterId);
  if (!input || !meter) return;
  input.addEventListener('input', () => {
    const v = input.value;
    let score = 0;
    if (v.length >= 8) score++;
    if (/[A-Z]/.test(v)) score++;
    if (/[0-9]/.test(v)) score++;
    if (/[^A-Za-z0-9]/.test(v)) score++;
    meter.dataset.score = score;
    const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
    meter.textContent = labels[score] || '';
  });
}