import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import cors from 'cors';
import fetch from 'node-fetch';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  Client,
  GatewayIntentBits,
  Partials,
} from 'discord.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------- CONFIG ----------
const {
  DISCORD_BOT_TOKEN,
  DISCORD_APPLICATION_ID,
  DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET,
  DISCORD_REDIRECT_URI,
  SESSION_SECRET,
  PORT = 3000,
} = process.env;

const DEFAULT_ADMIN_ID = '510792663210131456';

const DATA_DIR = path.join(__dirname, 'data');
const ADMINS_FILE = path.join(DATA_DIR, 'admins.json');
const MANUAL_COMMANDS_FILE = path.join(DATA_DIR, 'manualCommands.json');

// ---------- DISCORD CLIENT (BOT) ----------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
  ],
  partials: [Partials.GuildMember],
});

// cached analytics-ish data (you can expand this)
const analyticsCache = {
  lastUpdated: null,
  guildCount: 0,
  totalMemberCount: 0, // will be approximate if you add more intents
};

// command usage logs – in-memory; you can persist if you want
let commandLogs = [];

// Hook this into your actual bot code: send logs to this server (see comment later)
// For demo we'll just keep full control here.

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await refreshAnalytics();
});

// ---------- HELPERS ----------
async function ensureDataFiles() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  try {
    await fs.access(ADMINS_FILE);
  } catch {
    await fs.writeFile(ADMINS_FILE, JSON.stringify([DEFAULT_ADMIN_ID], null, 2));
  }

  try {
    await fs.access(MANUAL_COMMANDS_FILE);
  } catch {
    await fs.writeFile(MANUAL_COMMANDS_FILE, JSON.stringify([], null, 2));
  }
}

async function getAdmins() {
  await ensureDataFiles();
  const raw = await fs.readFile(ADMINS_FILE, 'utf8');
  return JSON.parse(raw);
}

async function saveAdmins(admins) {
  await fs.writeFile(ADMINS_FILE, JSON.stringify(admins, null, 2));
}

async function getManualCommands() {
  await ensureDataFiles();
  const raw = await fs.readFile(MANUAL_COMMANDS_FILE, 'utf8');
  return JSON.parse(raw);
}

async function saveManualCommands(commands) {
  await fs.writeFile(MANUAL_COMMANDS_FILE, JSON.stringify(commands, null, 2));
}

function isAdmin(userId, adminList) {
  return adminList.includes(userId);
}

async function refreshAnalytics() {
  analyticsCache.guildCount = client.guilds.cache.size;
  analyticsCache.totalMemberCount = client.guilds.cache.reduce((acc, g) => acc + (g.memberCount ?? 0), 0);
  analyticsCache.lastUpdated = new Date().toISOString();
}

// Convert Discord role color (integer) to HEX
function intToHexColor(colorInt) {
  if (!colorInt || colorInt === 0) return '#000000';
  return `#${colorInt.toString(16).padStart(6, '0')}`;
}

// ---------- EXPRESS APP ----------
const app = express();

app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(express.json());
app.use(session({
  secret: SESSION_SECRET || 'changeme',
  resave: false,
  saveUninitialized: false,
}));

// Serve static frontend
app.use(express.static(path.join(__dirname, 'public')));

// ---------- AUTH ROUTES (DISCORD OAUTH2) ----------

// Step 1: redirect to Discord
app.get('/auth/discord', (req, res) => {
  const state = cryptoRandomString(32);
  req.session.oauthState = state;

  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope: 'identify',
    state,
    prompt: 'consent',
  });

  res.redirect(`https://discord.com/api/oauth2/authorize?${params.toString()}`);
});

// Step 2: Discord redirects back here
app.get('/auth/discord/callback', async (req, res) => {
  const { code, state } = req.query;

  if (!code || !state || state !== req.session.oauthState) {
    return res.status(400).send('Invalid OAuth state');
  }

  try {
    const body = new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      client_secret: DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: DISCORD_REDIRECT_URI,
    });

    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      body,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error('Token error:', tokenData);
      return res.status(500).send('OAuth token exchange failed');
    }

    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: {
        Authorization: `${tokenData.token_type} ${tokenData.access_token}`,
      },
    });

    const userData = await userResponse.json();

    req.session.user = {
      id: userData.id,
      username: `${userData.username}#${userData.discriminator}`,
      avatar: userData.avatar,
    };

    res.redirect('/#admin');
  } catch (err) {
    console.error(err);
    res.status(500).send('OAuth callback error');
  }
});

app.post('/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

async function requireAdmin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const admins = await getAdmins();
  if (!isAdmin(req.session.user.id, admins)) {
    return res.status(403).json({ error: 'Not an admin' });
  }
  next();
}

// ---------- API ROUTES ----------

// Current user (for frontend)
app.get('/api/auth/me', async (req, res) => {
  if (!req.session.user) {
    return res.json({ user: null, isAdmin: false });
  }
  const admins = await getAdmins();
  res.json({
    user: req.session.user,
    isAdmin: isAdmin(req.session.user.id, admins),
  });
});

// Bot info for Home page
app.get('/api/bot/info', (req, res) => {
  if (!client.user) {
    return res.status(503).json({ error: 'Bot not ready' });
  }

  res.json({
    id: client.user.id,
    tag: client.user.tag,
    avatar: client.user.displayAvatarURL?.(),
    guildCount: client.guilds.cache.size,
  });
});

// Commands list (Discord + manual)
app.get('/api/commands', async (req, res) => {
  try {
    const url = `https://discord.com/api/v10/applications/${DISCORD_APPLICATION_ID}/commands`;
    const apiRes = await fetch(url, {
      headers: {
        Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
      },
    });

    const discordCommands = await apiRes.json();
    const manualCommands = await getManualCommands();

    const formatted = [
      ...discordCommands.map(cmd => ({
        source: 'discord',
        id: cmd.id,
        name: cmd.name,
        description: cmd.description || '',
        default_member_permissions: cmd.default_member_permissions,
        dm_permission: cmd.dm_permission,
        type: cmd.type,
      })),
      ...manualCommands.map(cmd => ({
        source: 'manual',
        ...cmd,
      })),
    ];

    res.json(formatted);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch commands' });
  }
});

// Admin: add manual command ("Sync & Fix")
app.post('/api/admin/manual-command', requireAdmin, async (req, res) => {
  const { name, description, permissions, dm_permission } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  const current = await getManualCommands();
  const newCommand = {
    id: `manual_${Date.now()}`,
    name,
    description: description || '',
    permissions: permissions || null,
    dm_permission: dm_permission ?? true,
    type: 'manual',
  };
  current.push(newCommand);
  await saveManualCommands(current);
  res.json(newCommand);
});

// Admin: add other admins
app.post('/api/admin/add-admin', requireAdmin, async (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  const admins = await getAdmins();
  if (!admins.includes(userId)) {
    admins.push(userId);
    await saveAdmins(admins);
  }

  res.json({ success: true, admins });
});

// Command logs (GET)
app.get('/api/admin/command-logs', requireAdmin, (req, res) => {
  res.json(commandLogs.slice(-200)); // latest 200
});

// Endpoint your bot can POST to when a command is used
app.post('/api/bot/command-log', async (req, res) => {
  // To keep this safe, add some sort of shared secret or IP allowlist.
  const { userId, username, commandName, options, guildId, channelId } = req.body;

  commandLogs.push({
    timestamp: new Date().toISOString(),
    userId,
    username,
    commandName,
    options: options || {},
    guildId,
    channelId,
  });

  if (commandLogs.length > 1000) {
    commandLogs = commandLogs.slice(-500);
  }

  res.json({ success: true });
});

// Analytics
app.get('/api/admin/analytics', requireAdmin, async (req, res) => {
  await refreshAnalytics();
  res.json(analyticsCache);
});

// Server list
app.get('/api/admin/guilds', requireAdmin, async (req, res) => {
  const guilds = await Promise.all(
    client.guilds.cache.map(async (g) => {
      let owner = null;
      try {
        const fetchedOwner = await g.fetchOwner();
        owner = {
          id: fetchedOwner.id,
          tag: fetchedOwner.user.tag,
        };
      } catch {
        owner = null;
      }

      return {
        id: g.id,
        name: g.name,
        icon: g.iconURL?.(),
        owner,
        roleCount: g.roles.cache.size,
      };
    })
  );

  res.json(guilds);
});

// Roles for a specific guild
app.get('/api/admin/guilds/:id/roles', requireAdmin, async (req, res) => {
  const guild = client.guilds.cache.get(req.params.id);
  if (!guild) {
    return res.status(404).json({ error: 'Guild not found' });
  }

  const roles = guild.roles.cache
    .sort((a, b) => b.position - a.position)
    .map(role => ({
      id: role.id,
      name: role.name,
      color: intToHexColor(role.color),
      position: role.position,
    }));

  res.json(roles);
});

// Fallback (SPA)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---------- UTIL ----------
function cryptoRandomString(length) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out = '';
  for (let i = 0; i < length; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

// ---------- START ----------
await ensureDataFiles();

app.listen(PORT, () => {
  console.log(`Dashboard listening on http://localhost:${PORT}`);
});

client.login(DISCORD_BOT_TOKEN);
