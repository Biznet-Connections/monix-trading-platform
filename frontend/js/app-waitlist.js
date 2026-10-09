// ================================================================
// MONIX v7.0 — Waitlist (Easy Start)
// ================================================================

window.monixOpenWaitlist = function() {
  const existing = document.getElementById('waitlistModal');
  if (existing) existing.remove();

  const u = MONIX_STATE.user || {};

  const modal = document.createElement('div');
  modal.id = 'waitlistModal';
  modal.className = 'waitlist-modal';
  modal.innerHTML = `
    <div class="waitlist-inner">
      <button class="waitlist-close" onclick="document.getElementById('waitlistModal').remove()">
        <i class="fa-solid fa-xmark"></i>
      </button>

      <div class="waitlist-icon">💰</div>
      <div class="waitlist-title">Get early access</div>
      <div class="waitlist-desc">Be the first to invest with just $5. No Deriv account needed.</div>

      <div class="waitlist-field">
        <label class="waitlist-label">Email</label>
        <input type="email" id="waitlistEmail" class="waitlist-input" placeholder="you@example.com" value="${u.email || ''}">
      </div>

      <div class="waitlist-field">
        <label class="waitlist-label">Country</label>
        <select id="waitlistCountry" class="waitlist-input">
          <option value="Zimbabwe">Zimbabwe</option>
          <option value="South Africa">South Africa</option>
          <option value="Zambia">Zambia</option>
          <option value="Malawi">Malawi</option>
          <option value="Botswana">Botswana</option>
          <option value="Kenya">Kenya</option>
          <option value="Nigeria">Nigeria</option>
          <option value="Other">Other</option>
        </select>
      </div>

      <div class="waitlist-field">
        <label class="waitlist-label">Amount you'd invest</label>
        <div class="waitlist-options">
          <button class="waitlist-option" data-waitlist-amt="5-20">$5-20</button>
          <button class="waitlist-option active" data-waitlist-amt="20-100">$20-100</button>
          <button class="waitlist-option" data-waitlist-amt="100+">$100+</button>
        </div>
      </div>

      <button class="waitlist-cta" id="waitlistSubmit">
        <i class="fa-solid fa-arrow-right"></i> Join the waitlist
      </button>

      <div class="waitlist-count">
        <strong id="waitlistCount">1,247</strong> people already on the waitlist
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Wire amount buttons
  let selectedAmount = '20-100';
  modal.querySelectorAll('[data-waitlist-amt]').forEach(btn => {
    btn.addEventListener('click', () => {
      modal.querySelectorAll('[data-waitlist-amt]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedAmount = btn.getAttribute('data-waitlist-amt');
    });
  });

  // Wire submit
  document.getElementById('waitlistSubmit').addEventListener('click', async () => {
    const email = document.getElementById('waitlistEmail').value.trim();
    const country = document.getElementById('waitlistCountry').value;

    if (!email || !email.includes('@')) {
      if (window.showToast) window.showToast('Invalid email', 'Please enter a valid email address', 'error');
      return;
    }

    const btn = document.getElementById('waitlistSubmit');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Joining...';

    try {
      const res = await fetch('/api/waitlist/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, country, amountInterested: selectedAmount, userId: u.id || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');

      modal.querySelector('.waitlist-inner').innerHTML = `
        <div class="waitlist-icon" style="background:rgba(16,185,129,0.2);">✅</div>
        <div class="waitlist-title">You're on the list!</div>
        <div class="waitlist-desc">We'll email you the moment Easy Start launches in ${country}. You're #${data.position || '1,248'}.</div>
        <button class="waitlist-cta" onclick="document.getElementById('waitlistModal').remove()">
          Got it
        </button>
      `;
    } catch (e) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-arrow-right"></i> Join the waitlist';
      if (window.showToast) window.showToast('Failed', e.message, 'error');
    }
  });

  // Load count
  fetch('/api/waitlist/count').then(r => r.json()).then(d => {
    const el = document.getElementById('waitlistCount');
    if (el && d.count) el.textContent = d.count.toLocaleString();
  }).catch(() => {});
};
