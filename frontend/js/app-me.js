// ================================================================
// MONIX v7.0 — Me tab (guest + connected)
// ================================================================

window.renderShellTab_me = function() {
  const content = document.querySelector('.app-tab[data-shell-tab="me"]');
  if (!content) return;

  const u = MONIX_STATE.user || {};
  const connected = MONIX_IS_CONNECTED();
  const initial = (u.username || 'U').trim().charAt(0).toUpperCase();
  const isAdmin = u.is_admin === 1 || u.is_admin === true;

  content.innerHTML = `
    <div class="app-hero">
      <div class="app-hero-title">Me</div>
      <div class="app-hero-sub">Your account and settings</div>
    </div>

    <div class="app-panel">
      <div style="display:flex;align-items:center;gap:14px;">
        <div class="app-user-avatar" style="width:52px;height:52px;font-size:20px;border-radius:12px;">${initial}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:16px;font-weight:700;color:var(--text);">${u.username || 'Guest'}</div>
          <div style="font-size:12.5px;color:var(--muted);margin-top:2px;">${u.email || ''}</div>
          <div style="margin-top:6px;">
            <span class="status-pill ${connected ? 'connected' : 'guest'}">
              <span class="dot"></span>${connected ? 'Connected · ' + (u.demo_token ? 'DEMO' : 'REAL') : 'Not connected'}
            </span>
          </div>
        </div>
      </div>
    </div>

    ${!connected ? `
      <div class="app-panel">
        <div class="app-panel-title">
          <div class="app-panel-title-left"><i class="fa-solid fa-rocket"></i>Get started</div>
        </div>
        <div class="progress-list">
          <div class="progress-item done"><div class="progress-check"><i class="fa-solid fa-check"></i></div><span>Create account</span></div>
          <div class="progress-item"><div class="progress-check"></div><span>Connect Deriv account</span></div>
          <div class="progress-item"><div class="progress-check"></div><span>Choose strategy</span></div>
          <div class="progress-item"><div class="progress-check"></div><span>Start earning</span></div>
        </div>
      </div>
    ` : ''}

    <div class="app-panel">
      <div class="app-panel-title">
        <div class="app-panel-title-left"><i class="fa-solid fa-user"></i>Account</div>
      </div>

      ${connected ? `
        <div class="app-act-row" onclick="window.monixOpenApiKeys()" style="cursor:pointer;">
          <div class="app-act-icon"><i class="fa-solid fa-key"></i></div>
          <div class="app-act-body">
            <div class="app-act-title">API Keys</div>
            <div class="app-act-meta">Connected · ${u.demo_token ? 'DEMO' : 'REAL'}</div>
          </div>
          <i class="fa-solid fa-chevron-right" style="color:var(--muted);font-size:12px;"></i>
        </div>

        <div class="app-act-row" data-shell-tab="wallet" style="cursor:pointer;">
          <div class="app-act-icon"><i class="fa-solid fa-trophy"></i></div>
          <div class="app-act-body">
            <div class="app-act-title">Strategy</div>
            <div class="app-act-meta">${MONIX_STATE.strategy || 'Balanced'}</div>
          </div>
          <i class="fa-solid fa-chevron-right" style="color:var(--muted);font-size:12px;"></i>
        </div>
      ` : `
        <div class="app-act-row" onclick="window.monixOpenApiKeys()" style="cursor:pointer;">
          <div class="app-act-icon"><i class="fa-solid fa-key"></i></div>
          <div class="app-act-body">
            <div class="app-act-title">Connect Deriv account</div>
            <div class="app-act-meta">Start investing</div>
          </div>
          <i class="fa-solid fa-chevron-right" style="color:var(--muted);font-size:12px;"></i>
        </div>

        <div class="app-act-row" onclick="window.monixOpenWaitlist()" style="cursor:pointer;">
          <div class="app-act-icon" style="color:#34d399;"><i class="fa-solid fa-envelope"></i></div>
          <div class="app-act-body">
            <div class="app-act-title">Easy Start</div>
            <div class="app-act-meta">Coming soon · Join waitlist</div>
          </div>
          <i class="fa-solid fa-chevron-right" style="color:var(--muted);font-size:12px;"></i>
        </div>
      `}

      <div class="app-act-row" onclick="window.monixOpenSettings()" style="cursor:pointer;">
        <div class="app-act-icon"><i class="fa-solid fa-gear"></i></div>
        <div class="app-act-body">
          <div class="app-act-title">Settings</div>
          <div class="app-act-meta">Preferences, theme, alerts</div>
        </div>
        <i class="fa-solid fa-chevron-right" style="color:var(--muted);font-size:12px;"></i>
      </div>

      ${isAdmin ? `
        <div class="app-act-row" onclick="window.monixOpenAdmin()" style="cursor:pointer;">
          <div class="app-act-icon" style="color:#fbbf24;"><i class="fa-solid fa-shield-halved"></i></div>
          <div class="app-act-body">
            <div class="app-act-title">Admin Panel</div>
            <div class="app-act-meta">Vouchers, users, stats</div>
          </div>
          <i class="fa-solid fa-chevron-right" style="color:var(--muted);font-size:12px;"></i>
        </div>
      ` : ''}
    </div>

    <div class="app-panel">
      <div class="app-panel-title">
        <div class="app-panel-title-left"><i class="fa-solid fa-circle-question"></i>Help</div>
      </div>
      <div class="app-act-row" onclick="window.open('https://deriv.com', '_blank')" style="cursor:pointer;">
        <div class="app-act-icon"><i class="fa-solid fa-book"></i></div>
        <div class="app-act-body">
          <div class="app-act-title">How MONIX works</div>
          <div class="app-act-meta">Learn the basics</div>
        </div>
      </div>
      <div class="app-act-row" onclick="window.open('https://wa.me/263714587259', '_blank')" style="cursor:pointer;">
        <div class="app-act-icon" style="color:#25D366;"><i class="fa-brands fa-whatsapp"></i></div>
        <div class="app-act-body">
          <div class="app-act-title">Contact support</div>
          <div class="app-act-meta">We reply within 24h</div>
        </div>
      </div>
    </div>

    <div class="app-panel">
      <button class="app-btn app-btn-danger app-btn-block" onclick="window.monixLogout()" style="background:transparent;border:1px solid rgba(239,68,68,0.4);color:var(--danger);">
        <i class="fa-solid fa-right-from-bracket"></i> Logout
      </button>
    </div>
  `;
};
