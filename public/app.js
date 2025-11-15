// ==================== Theme Management ====================
const ThemeManager = {
  init() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    this.setTheme(savedTheme);

    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
      themeToggle.addEventListener('click', () => this.toggleTheme());
    }
  },

  setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  },

  toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    this.setTheme(newTheme);
  }
};

// ==================== Navigation ====================
const sections = {
  home: document.getElementById('home'),
  commands: document.getElementById('commands'),
  admin: document.getElementById('admin'),
};

function showSection(key) {
  Object.entries(sections).forEach(([k, el]) => {
    if (!el) return;
    el.classList.toggle('visible', k === key);
  });

  // Update active nav link
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.remove('active');
  });
  document.querySelectorAll(`[data-nav="${key}"]`).forEach(link => {
    link.classList.add('active');
  });

  window.location.hash = `#${key}`;

  // Scroll to top smoothly
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.querySelectorAll('[data-nav]').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.getAttribute('data-nav');
    showSection(target);
  });
});

const hash = window.location.hash.replace('#', '');
if (sections[hash]) {
  showSection(hash);
} else {
  showSection('home');
}

// ==================== Authentication ====================
const loginBtn = document.getElementById('login-btn');
const adminLoginBtn = document.getElementById('admin-login-btn');
const logoutBtn = document.getElementById('logout-btn');
const userChip = document.getElementById('user-chip');
const userNameEl = document.getElementById('user-name');

if (loginBtn) {
  loginBtn.addEventListener('click', () => {
    window.location.href = '/auth/discord';
  });
}

if (adminLoginBtn) {
  adminLoginBtn.addEventListener('click', () => {
    window.location.href = '/auth/discord';
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
    location.reload();
  });
}

async function refreshAuthUI() {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    const data = await res.json();

    const adminNavLink = document.getElementById('admin-nav-link');

    if (data.user) {
      if (loginBtn) loginBtn.classList.add('hidden');
      if (userChip) userChip.classList.remove('hidden');
      if (userNameEl) userNameEl.textContent = data.user.username;

      // Show admin nav link if user is admin
      if (data.isAdmin && adminNavLink) {
        adminNavLink.classList.remove('hidden');
      } else if (adminNavLink) {
        adminNavLink.classList.add('hidden');
      }
    } else {
      if (loginBtn) loginBtn.classList.remove('hidden');
      if (userChip) userChip.classList.add('hidden');

      // Hide admin nav link
      if (adminNavLink) {
        adminNavLink.classList.add('hidden');
      }
    }

    const adminLocked = document.getElementById('admin-locked');
    const adminContent = document.getElementById('admin-content');

    if (data.user && data.isAdmin) {
      if (adminLocked) adminLocked.classList.add('hidden');
      if (adminContent) adminContent.classList.remove('hidden');
      loadAnalytics();
      loadCommandLogs();
      loadGuilds();
      loadAdmins();
    } else {
      if (adminLocked) adminLocked.classList.remove('hidden');
      if (adminContent) adminContent.classList.add('hidden');
    }
  } catch (err) {
    console.error('Failed to refresh auth UI', err);
  }
}

// ==================== Bot Info ====================
async function loadBotInfo() {
  const tagEl = document.getElementById('bot-tag-label');
  const guildsEl = document.getElementById('bot-guilds-label');
  try {
    const res = await fetch('/api/bot/info');
    if (!res.ok) return;
    const info = await res.json();
    if (tagEl) tagEl.textContent = `${info.tag}`;
    if (guildsEl) guildsEl.textContent = `${info.guildCount}`;
  } catch (err) {
    console.error(err);
    if (tagEl) tagEl.textContent = 'Loading...';
    if (guildsEl) guildsEl.textContent = 'Loading...';
  }
}

// ==================== Commands ====================
const commandsListEl = document.getElementById('commands-list');
const commandSearch = document.getElementById('command-search');
let commandsCache = [];

async function loadCommands() {
  if (!commandsListEl) return;

  commandsListEl.innerHTML = '';
  const loading = document.createElement('div');
  loading.textContent = 'Loading commands…';
  loading.className = 'small-text';
  loading.style.gridColumn = '1/-1';
  loading.style.textAlign = 'center';
  loading.style.padding = '48px';
  loading.style.color = 'var(--text-muted)';
  commandsListEl.appendChild(loading);

  try {
    const res = await fetch('/api/commands');
    const data = await res.json();
    commandsCache = data;
    renderCommands();
  } catch (err) {
    console.error(err);
    commandsListEl.innerHTML =
      '<p class="small-text" style="grid-column: 1/-1; text-align: center; padding: 48px; color: var(--text-muted);">Failed to load commands.</p>';
  }
}

function renderCommands() {
  if (!commandsListEl) return;

  const query = (commandSearch?.value || '').trim().toLowerCase();
  commandsListEl.innerHTML = '';

  const filtered = commandsCache.filter(cmd => {
    if (!query) return true;
    return (
      cmd.name.toLowerCase().includes(query) ||
      (cmd.description || '').toLowerCase().includes(query)
    );
  });

  if (!filtered.length) {
    commandsListEl.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 48px; color: var(--text-muted);">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity: 0.3; margin-bottom: 16px;">
          <circle cx="11" cy="11" r="8"/>
          <path d="m21 21-4.35-4.35"/>
        </svg>
        <p>No commands match that search.</p>
      </div>
    `;
    return;
  }

  for (const cmd of filtered) {
    const card = document.createElement('div');
    card.className = 'command-card';

    const header = document.createElement('div');
    header.className = 'command-card-header';

    const name = document.createElement('div');
    name.className = 'command-name';
    name.textContent = `/${cmd.name}`;

    const badge = document.createElement('span');
    badge.className = 'command-badge';
    badge.textContent = cmd.source === 'manual' ? 'Manual' : 'Discord';

    header.appendChild(name);
    header.appendChild(badge);

    const desc = document.createElement('div');
    desc.className = 'command-desc';
    desc.textContent = cmd.description || 'No description set.';

    const meta = document.createElement('div');
    meta.className = 'command-meta';
    meta.style.fontSize = '0.75rem';
    meta.style.color = 'var(--text-muted)';
    meta.style.marginTop = '6px';
    meta.innerHTML = `
      <span>DM: ${cmd.dm_permission ? 'Yes' : 'No'}</span>
      ·
      <span>Type: ${cmd.type ?? 'slash'}</span>
    `;

    card.appendChild(header);
    card.appendChild(desc);
    card.appendChild(meta);

    commandsListEl.appendChild(card);
  }
}

if (commandSearch) {
  commandSearch.addEventListener('input', () => renderCommands());
}

// ==================== Admin Analytics ====================
async function loadAnalytics() {
  try {
    const res = await fetch('/api/admin/analytics', { credentials: 'include' });
    if (!res.ok) return;
    const data = await res.json();

    const guildsEl = document.querySelector('[data-analytics="guilds"]');
    const membersEl = document.querySelector('[data-analytics="members"]');
    const updatedEl = document.querySelector('[data-analytics="updated"]');

    if (guildsEl) guildsEl.textContent = data.guildCount.toLocaleString();
    if (membersEl) membersEl.textContent = data.totalMemberCount.toLocaleString();
    if (updatedEl) updatedEl.textContent = new Date(data.lastUpdated).toLocaleString();

    const serverCount = document.getElementById('server-count');
    if (serverCount) {
      serverCount.textContent = data.guildCount.toLocaleString();
    }
  } catch (err) {
    console.error(err);
  }
}

// ==================== Command Logs ====================
const logsEl = document.getElementById('command-logs');

async function loadCommandLogs() {
  if (!logsEl) return;

  try {
    const res = await fetch('/api/admin/command-logs', { credentials: 'include' });
    if (!res.ok) return;
    const logs = await res.json();
    logsEl.innerHTML = '';

    if (!logs.length) {
      logsEl.innerHTML = '<p class="small-text">No logs yet.</p>';
      return;
    }

    logs
      .slice()
      .reverse()
      .forEach(log => {
        const div = document.createElement('div');
        div.className = 'log-item';
        const ts = new Date(log.timestamp).toLocaleString();
        div.innerHTML = `
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
            <span style="font-weight: 600; color: var(--text);">${log.commandName}</span>
            <span style="font-size: 0.75rem; color: var(--text-dimmed);">${ts}</span>
          </div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">
            by ${log.username || log.userId}
          </div>
          <div style="font-size: 0.75rem; color: var(--text-dimmed);">
            Guild: ${log.guildId || 'DM'} · Channel: ${log.channelId || 'N/A'}
          </div>
        `;
        logsEl.appendChild(div);
      });
  } catch (err) {
    console.error(err);
  }
}

// ==================== Add Admin ====================
const addAdminForm = document.getElementById('add-admin-form');
if (addAdminForm) {
  addAdminForm.addEventListener('submit', async e => {
    e.preventDefault();
    const idInput = document.getElementById('new-admin-id');
    const id = idInput.value.trim();
    if (!id) return;
    try {
      const res = await fetch('/api/admin/add-admin', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(body.error || 'Failed to add admin');
        return;
      }
      idInput.value = '';
      alert('Admin added successfully!');
      loadAdmins();
    } catch (err) {
      console.error(err);
      alert('Error adding admin');
    }
  });
}

// ==================== Admin List ====================
const adminsListEl = document.getElementById('admins-list');

async function loadAdmins() {
  if (!adminsListEl) return;
  adminsListEl.innerHTML = '<p class="small-text">Loading admins...</p>';

  try {
    const res = await fetch('/api/admin/admins', { credentials: 'include' });
    if (!res.ok) {
      adminsListEl.innerHTML = '<p class="small-text">Failed to load admins.</p>';
      return;
    }

    const admins = await res.json(); // [{ userId, tag? }, ...]
    adminsListEl.innerHTML = '';

    if (!admins.length) {
      adminsListEl.innerHTML = '<p class="small-text">No additional admins yet.</p>';
      return;
    }

    admins.forEach(a => {
      const pill = document.createElement('div');
      pill.className = 'admin-pill';

      const label = document.createElement('span');
      label.textContent = a.tag ? `${a.tag} (${a.userId})` : a.userId;
      label.className = 'admin-pill-id';

      const btn = document.createElement('button');
      btn.className = 'btn ghost small';
      btn.type = 'button';
      btn.textContent = 'Remove';

      btn.addEventListener('click', async () => {
        if (!confirm(`Remove admin ${a.tag || a.userId}?`)) return;

        try {
          const res = await fetch('/api/admin/remove-admin', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: a.userId }),
          });
          const body = await res.json().catch(() => ({}));

          if (!res.ok) {
            alert(body.error || 'Failed to remove admin');
            return;
          }

          loadAdmins();
        } catch (err) {
          console.error(err);
          alert('Error removing admin');
        }
      });

      pill.appendChild(label);
      pill.appendChild(btn);
      adminsListEl.appendChild(pill);
    });
  } catch (err) {
    console.error(err);
    adminsListEl.innerHTML = '<p class="small-text">Error loading admins.</p>';
  }
}

// ==================== Manual Commands ====================
const manualForm = document.getElementById('manual-command-form');
if (manualForm) {
  manualForm.addEventListener('submit', async e => {
    e.preventDefault();
    const nameInput = document.getElementById('mc-name');
    const descInput = document.getElementById('mc-desc');
    const permsInput = document.getElementById('mc-perms');
    const dmInput = document.getElementById('mc-dm');

    const name = nameInput.value.trim();
    const desc = descInput.value.trim();
    const perms = permsInput.value.trim();
    const dm = dmInput.checked;

    if (!name) return;

    try {
      const res = await fetch('/api/admin/manual-command', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description: desc,
          permissions: perms || null,
          dm_permission: dm,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(body.error || 'Failed to add command');
        return;
      }
      nameInput.value = '';
      descInput.value = '';
      permsInput.value = '';
      dmInput.checked = true;

      alert('Command added successfully!');
      await loadCommands();
    } catch (err) {
      console.error(err);
      alert('Error adding command');
    }
  });
}

// ==================== Remove Manual Command ====================
const removeCommandBtn = document.getElementById('remove-command-btn');

if (removeCommandBtn) {
  removeCommandBtn.addEventListener('click', async () => {
    const name = prompt('Enter the manual command name to remove (without /):');
    if (!name) return;

    try {
      const res = await fetch('/api/admin/manual-command', {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        alert(body.error || 'Failed to remove command');
        return;
      }

      alert('Command removed successfully!');
      loadCommands();
    } catch (err) {
      console.error(err);
      alert('Error removing command');
    }
  });
}

// ==================== Guilds List ====================
const guildsListEl = document.getElementById('guilds-list');

async function loadGuilds() {
  if (!guildsListEl) return;

  try {
    const res = await fetch('/api/admin/guilds', { credentials: 'include' });
    if (!res.ok) return;
    const guilds = await res.json();

    guildsListEl.innerHTML = '';
    if (!guilds.length) {
      guildsListEl.innerHTML = '<p class="small-text">Bot is not in any guilds.</p>';
      return;
    }

    guilds.forEach(g => {
      const row = document.createElement('div');
      row.className = 'guild-row';

      const main = document.createElement('div');
      main.className = 'guild-main';

      const guildName = document.createElement('div');
      guildName.className = 'guild-name';
      guildName.textContent = g.name;

      const guildMeta = document.createElement('div');
      guildMeta.className = 'guild-meta';
      guildMeta.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: -2px;">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        Owner: ${g.owner ? `${g.owner.tag} (${g.owner.id})` : 'Unknown'} ·
        Roles: ${g.roleCount} ·
        ID: ${g.id}
      `;

      main.appendChild(guildName);
      main.appendChild(guildMeta);

      const moreBtn = document.createElement('button');
      moreBtn.className = 'btn ghost small';
      moreBtn.textContent = 'Roles';

      const rolesContainer = document.createElement('div');
      rolesContainer.className = 'guild-roles hidden';
      rolesContainer.textContent = 'Loading roles…';

      moreBtn.addEventListener('click', async () => {
        const isHidden = rolesContainer.classList.contains('hidden');
        if (isHidden) {
          rolesContainer.classList.remove('hidden');
          rolesContainer.textContent = 'Loading roles…';
          try {
            const res = await fetch(`/api/admin/guilds/${g.id}/roles`, {
              credentials: 'include',
            });
            const roles = await res.json();
            if (!Array.isArray(roles)) {
              rolesContainer.textContent = 'Failed to load roles.';
              return;
            }

            rolesContainer.innerHTML = '';
            roles.forEach(r => {
              const pill = document.createElement('span');
              pill.className = 'role-pill';
              const color = document.createElement('span');
              color.className = 'role-color-square';
              color.style.backgroundColor = r.color;
              const text = document.createElement('span');
              text.textContent = `${r.name} (${r.id})`;
              pill.appendChild(color);
              pill.appendChild(text);
              rolesContainer.appendChild(pill);
            });
          } catch (err) {
            console.error(err);
            rolesContainer.textContent = 'Failed to load roles.';
          }
        } else {
          rolesContainer.classList.add('hidden');
        }
      });

      row.appendChild(main);
      row.appendChild(moreBtn);

      const wrapper = document.createElement('div');
      wrapper.appendChild(row);
      wrapper.appendChild(rolesContainer);

      guildsListEl.appendChild(wrapper);
    });
  } catch (err) {
    console.error(err);
  }
}

// ==================== Initialize ====================
document.addEventListener('DOMContentLoaded', () => {
  ThemeManager.init();
  loadBotInfo();
  loadCommands();
  refreshAuthUI();

  console.log('✨ Bot Dashboard initialized successfully!');
});
