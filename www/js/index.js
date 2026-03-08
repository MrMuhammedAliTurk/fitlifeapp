const DEFAULT_DAILY_GOAL = 10000;
const APP_DB_KEY = "fitlife_merged_db";
const SESSION_KEY = "fitlife_merged_session";
const THEME_KEY = "fitlife_merged_theme";
const SQL_TABLE = "app_kv";

const state = {
  dbMode: "local",
  sqliteDb: null,
  sessionUserId: null,
  selectedMood: null,
  onboardingTheme: "dark"
};

document.addEventListener("deviceready", onReady, false);
document.addEventListener("DOMContentLoaded", () => {
  applyTheme(localStorage.getItem(THEME_KEY) || "dark");
});

async function onReady() {
  await initStorage();
  applyTheme(await getAppTheme());

  const sessionId = await getSession();
  if (sessionId) {
    state.sessionUserId = sessionId;
    const user = await getCurrentUser();
    if (user && !user.onboarded) openPage("onboarding");
    else openPage("menu");
  } else {
    const users = await getUsers();
    if (users.length > 0) openPage("login");
    else openPage("register");
  }
}

/* ======================
   STORAGE
====================== */

async function initStorage() {
  if (window.sqlitePlugin) {
    state.dbMode = "sqlite";
    state.sqliteDb = window.sqlitePlugin.openDatabase({ name: "fitlife.db", location: "default" });

    await runSql(
      `CREATE TABLE IF NOT EXISTS ${SQL_TABLE} (
        key TEXT PRIMARY KEY,
        value TEXT
      )`,
      []
    );

    const existing = await sqlGet(APP_DB_KEY);
    if (!existing) {
      await sqlSet(APP_DB_KEY, JSON.stringify({ users: [] }));
    }
  } else {
    state.dbMode = "local";
    if (!localStorage.getItem(APP_DB_KEY)) {
      localStorage.setItem(APP_DB_KEY, JSON.stringify({ users: [] }));
    }
  }
}

function runSql(query, params = []) {
  return new Promise((resolve, reject) => {
    if (!state.sqliteDb) return reject(new Error("SQLite database not available."));
    state.sqliteDb.transaction(tx => {
      tx.executeSql(query, params, (_, res) => resolve(res), (_, err) => {
        reject(err);
        return false;
      });
    });
  });
}

async function sqlGet(key) {
  const res = await runSql(`SELECT value FROM ${SQL_TABLE} WHERE key = ?`, [key]);
  if (res.rows.length) return res.rows.item(0).value;
  return null;
}

async function sqlSet(key, value) {
  await runSql(`INSERT OR REPLACE INTO ${SQL_TABLE}(key, value) VALUES(?, ?)`, [key, value]);
}

async function sqlRemove(key) {
  await runSql(`DELETE FROM ${SQL_TABLE} WHERE key = ?`, [key]);
}

async function readDB() {
  try {
    if (state.dbMode === "sqlite") {
      const raw = await sqlGet(APP_DB_KEY);
      return JSON.parse(raw || '{"users":[]}');
    }
    return JSON.parse(localStorage.getItem(APP_DB_KEY) || '{"users":[]}');
  } catch {
    return { users: [] };
  }
}

async function writeDB(db) {
  const data = JSON.stringify(db);
  if (state.dbMode === "sqlite") {
    await sqlSet(APP_DB_KEY, data);
  } else {
    localStorage.setItem(APP_DB_KEY, data);
  }
}

async function getUsers() {
  const db = await readDB();
  return db.users || [];
}

async function saveUsers(users) {
  const db = await readDB();
  db.users = users;
  await writeDB(db);
}

function createEmptyUser(username, passwordHash, profilePhoto = "", metrics = {}) {
  return {
    id: randomId(),
    username,
    passwordHash,
    profilePhoto,
    rememberMe: false,
    onboarded: false,
    friends: [],
    settings: {
      dailyGoal: DEFAULT_DAILY_GOAL,
      theme: localStorage.getItem(THEME_KEY) || "dark",
      notificationsEnabled: false
    },
    metrics: {
      heightCm: metrics.heightCm || 0,
      weightKg: metrics.weightKg || 0,
      goalWeightKg: metrics.goalWeightKg || 0
    },
    stats: {
      todaySteps: 0,
      todayWater: 0,
      todayCalories: 0
    },
    stepHistory: [],
    moodHistory: [],
    waterHistory: [],
    calorieHistory: [],
    badges: [],
    createdAt: new Date().toISOString()
  };
}

function randomId() {
  return "u_" + Math.random().toString(36).slice(2, 11);
}

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

async function findUserById(id) {
  const users = await getUsers();
  return users.find(u => u.id === id) || null;
}

async function findUserByUsername(username) {
  const users = await getUsers();
  return users.find(u => u.username.toLowerCase() === username.toLowerCase()) || null;
}

async function getCurrentUser() {
  if (!state.sessionUserId) return null;
  return await findUserById(state.sessionUserId);
}

async function saveCurrentUser(user) {
  const users = await getUsers();
  const idx = users.findIndex(u => u.id === user.id);
  if (idx !== -1) {
    users[idx] = user;
    await saveUsers(users);
  }
}

async function setSession(userId) {
  state.sessionUserId = userId;
  if (state.dbMode === "sqlite") await sqlSet(SESSION_KEY, userId);
  else localStorage.setItem(SESSION_KEY, userId);
}

async function getSession() {
  if (state.dbMode === "sqlite") return await sqlGet(SESSION_KEY);
  return localStorage.getItem(SESSION_KEY);
}

async function clearSession() {
  state.sessionUserId = null;
  if (state.dbMode === "sqlite") await sqlRemove(SESSION_KEY);
  else localStorage.removeItem(SESSION_KEY);
}

async function getAppTheme() {
  const user = await getCurrentUser();
  if (user?.settings?.theme) return user.settings.theme;
  return localStorage.getItem(THEME_KEY) || "dark";
}

/* ======================
   NAVIGATION
====================== */

function openPage(pageId) {
  const authPages = ["landing", "login", "register", "onboarding"];
  const protectedPages = ["menu", "steps", "mood", "health", "stats", "summary", "calendar", "compare", "social", "tasks", "profile", "about"];

  if (!state.sessionUserId && protectedPages.includes(pageId)) {
    pageId = "login";
  }

  document.querySelectorAll(".page").forEach(p => (p.style.display = "none"));
  const page = document.getElementById(pageId);
  if (page) page.style.display = "block";

  const bottomMenu = document.getElementById("bottomMenu");
  const isAuth = authPages.includes(pageId);
  if (bottomMenu) bottomMenu.style.display = (!state.sessionUserId || isAuth) ? "none" : "flex";

  refreshPageData(pageId);
}

function goBack() {
  openPage("menu");
}

async function refreshPageData(pageId) {
  if (pageId === "login") await renderUserList();
  if (pageId === "menu" || pageId === "profile") await loadUserUI();
  if (pageId === "steps") await loadSteps();
  if (pageId === "mood") await loadMoodPage();
  if (pageId === "health") await loadHealthPage();
  if (pageId === "stats") {
    await drawStepChart();
    await drawMonthlyStepChart();
    await drawMoodPieChart();
  }
  if (pageId === "summary") await loadWeeklySummary();
  if (pageId === "calendar") await renderCalendarView();
  if (pageId === "compare") await loadComparisonView();
  if (pageId === "social") {
    await renderFriendList();
    await renderLeaderboard();
  }
  if (pageId === "tasks") await renderDailyTasks();
}

/* ======================
   AUTH
====================== */

async function registerUser() {
  const username = (document.getElementById("regUsername")?.value || "").trim();
  const password = (document.getElementById("regPassword")?.value || "").trim();
  const profilePhoto = (document.getElementById("regPhoto")?.value || "").trim();
  const heightCm = parseInt(document.getElementById("regHeight")?.value || "0", 10);
  const weightKg = parseFloat(document.getElementById("regWeight")?.value || "0");
  const goalWeightKg = parseFloat(document.getElementById("regGoalWeight")?.value || "0");

  if (!username) return alert("Please enter a username.");
  if (password.length < 6) return alert("Password must be at least 6 characters.");
  if (heightCm && heightCm < 100) return alert("Please enter a valid height.");
  if (weightKg && weightKg < 20) return alert("Please enter a valid weight.");

  const existing = await findUserByUsername(username);
  if (existing) return alert("This username is already taken.");

  const passwordHash = await hashPassword(password);
  const user = createEmptyUser(username, passwordHash, profilePhoto, {
    heightCm, weightKg, goalWeightKg
  });

  const users = await getUsers();
  users.push(user);
  await saveUsers(users);

  alert("Registered successfully! Please login.");
  clearRegisterForm();
  openPage("login");
}

async function loginUser() {
  const username = (document.getElementById("loginUsername")?.value || "").trim();
  const password = (document.getElementById("loginPassword")?.value || "").trim();
  const remember = !!document.getElementById("rememberMe")?.checked;

  if (!username || !password) return alert("Please enter username and password.");

  const user = await findUserByUsername(username);
  if (!user) return alert("User not found.");

  const passwordHash = await hashPassword(password);
  if (user.passwordHash !== passwordHash) return alert("Wrong password.");

  user.rememberMe = remember;
  await saveCurrentUser(user);
  await setSession(user.id);

  document.getElementById("loginPassword").value = "";
  if (!user.onboarded) openPage("onboarding");
  else openPage("menu");
}

async function logout() {
  await clearSession();
  openPage("login");
}

async function resetAccount() {
  const first = confirm("Reset account and delete all your personal data?");
  if (!first) return;

  const second = prompt('Type DELETE to confirm account reset.');
  if (second !== "DELETE") {
    alert("Reset cancelled.");
    return;
  }

  const user = await getCurrentUser();
  if (!user) return;

  const users = (await getUsers()).filter(u => u.id !== user.id);
  await saveUsers(users);
  await clearSession();

  alert("Account deleted.");
  openPage(users.length ? "login" : "register");
}

async function renderUserList() {
  const box = document.getElementById("userList");
  if (!box) return;

  const users = await getUsers();
  if (!users.length) {
    box.innerHTML = `<div class="muted tiny">No users yet.</div>`;
    return;
  }

  box.innerHTML = users.map(u => `
    <div class="userRow">
      <div class="userRowLeft">
        <img class="avatar small" src="${escapeHtml(u.profilePhoto || placeholderAvatar(u.username))}" alt="avatar" />
        <div>
          <div class="userName">${escapeHtml(u.username)}</div>
          <div class="tiny muted">Goal: ${u.settings?.dailyGoal || DEFAULT_DAILY_GOAL}</div>
        </div>
      </div>
      <button class="btn mini" onclick="fillLoginUsername('${escapeJs(u.username)}')">Use</button>
    </div>
  `).join("");
}

function fillLoginUsername(username) {
  const el = document.getElementById("loginUsername");
  if (el) el.value = username;
}

function clearRegisterForm() {
  ["regUsername", "regPassword", "regHeight", "regWeight", "regGoalWeight", "regPhoto"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
}

/* ======================
   ONBOARDING
====================== */

function setOnboardTheme(theme) {
  state.onboardingTheme = theme;
}

async function completeOnboarding() {
  const user = await getCurrentUser();
  if (!user) return;

  const goal = parseInt(document.getElementById("onboardGoal")?.value || "0", 10);
  const notif = !!document.getElementById("onboardNotif")?.checked;

  if (goal && goal >= 1000) user.settings.dailyGoal = goal;
  user.settings.notificationsEnabled = notif;
  user.settings.theme = state.onboardingTheme || "dark";
  user.onboarded = true;

  await saveCurrentUser(user);
  localStorage.setItem(THEME_KEY, user.settings.theme);
  applyTheme(user.settings.theme);

  if (notif) await tryNotificationPermission();

  openPage("menu");
}

/* ======================
   PROFILE
====================== */

async function loadUserUI() {
  const user = await getCurrentUser();
  if (!user) return;

  setText("welcomeText", `Welcome, ${user.username} 👋`);
  setText("profileName", `User: ${user.username}`);
  setImage("menuAvatar", user.profilePhoto || placeholderAvatar(user.username));
  setImage("profileAvatar", user.profilePhoto || placeholderAvatar(user.username));

  const notifToggle = document.getElementById("notifToggle");
  const photoInput = document.getElementById("profilePhotoInput");
  if (notifToggle) notifToggle.checked = !!user.settings.notificationsEnabled;
  if (photoInput) photoInput.value = user.profilePhoto || "";

  setText("menuStepsValue", String(user.stats.todaySteps || 0));
  setText("menuWaterValue", String(user.stats.todayWater || 0));
  setText("menuCaloriesValue", String(user.stats.todayCalories || 0));
  setText("menuStreakValue", String(calculateMoodStreak(user)));

  renderBadges(user.badges || []);
}

async function saveProfilePhoto() {
  const user = await getCurrentUser();
  if (!user) return;

  user.profilePhoto = (document.getElementById("profilePhotoInput")?.value || "").trim();
  await saveCurrentUser(user);
  await loadUserUI();
  alert("Profile photo updated.");
}

async function uploadProfilePhoto(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async function(e) {
    const user = await getCurrentUser();
    if (!user) return;

    user.profilePhoto = e.target.result;
    await saveCurrentUser(user);
    await loadUserUI();
    alert("Profile photo uploaded.");
  };
  reader.readAsDataURL(file);
}

async function setTheme(theme) {
  const user = await getCurrentUser();
  if (user) {
    user.settings.theme = theme;
    await saveCurrentUser(user);
  }
  localStorage.setItem(THEME_KEY, theme);
  applyTheme(theme);
}

function applyTheme(theme) {
  document.body.classList.toggle("light-theme", theme === "light");
}

async function toggleNotifications() {
  const user = await getCurrentUser();
  if (!user) return;

  const enabled = !!document.getElementById("notifToggle")?.checked;
  user.settings.notificationsEnabled = enabled;
  await saveCurrentUser(user);

  if (enabled) await tryNotificationPermission();
  alert("Notification preference saved.");
}

async function tryNotificationPermission() {
  if ("Notification" in window && Notification.permission !== "granted") {
    try { await Notification.requestPermission(); } catch {}
  }
}

/* ======================
   STEPS
====================== */

async function getDailyGoal() {
  const user = await getCurrentUser();
  return user?.settings?.dailyGoal || DEFAULT_DAILY_GOAL;
}

async function loadSteps() {
  const user = await getCurrentUser();
  if (!user) return;

  setText("stepCount", `${user.stats.todaySteps || 0} steps`);
  setText("goalText", String(await getDailyGoal()));

  await updateProgressBar();
  await awardBadges(user);
}

async function addSteps(amount) {
  const user = await getCurrentUser();
  if (!user) return openPage("login");

  const newSteps = (user.stats.todaySteps || 0) + amount;
  user.stats.todaySteps = newSteps;
  await saveTodayStepsToHistory(user, newSteps);
  await saveCurrentUser(user);
  await loadSteps();
}

async function addCustomSteps() {
  const value = parseInt(document.getElementById("customStepsInput")?.value || "0", 10);
  if (!value || value < 1) return alert("Enter a valid step number.");

  document.getElementById("customStepsInput").value = "";
  await addSteps(value);
}

async function resetSteps() {
  const user = await getCurrentUser();
  if (!user) return;

  user.stats.todaySteps = 0;
  await saveTodayStepsToHistory(user, 0);
  await saveCurrentUser(user);
  await loadSteps();
}

async function saveDailyGoal() {
  const user = await getCurrentUser();
  if (!user) return;

  const value = parseInt(document.getElementById("dailyGoalInput")?.value || "0", 10);
  if (!value || value < 1000) return alert("Goal must be at least 1000.");

  user.settings.dailyGoal = value;
  await saveCurrentUser(user);
  document.getElementById("dailyGoalInput").value = "";
  await loadSteps();
  alert("Daily goal updated.");
}

async function saveTodayStepsToHistory(user, stepsValue) {
  const today = todayISO();
  const existing = user.stepHistory.find(x => x.date === today);

  if (existing) existing.steps = stepsValue;
  else user.stepHistory.push({ date: today, steps: stepsValue });

  user.stepHistory.sort((a, b) => a.date.localeCompare(b.date));
  user.stepHistory = user.stepHistory.slice(-90);
}

async function updateProgressBar() {
  const bar = document.getElementById("progressBar");
  if (!bar) return;

  const user = await getCurrentUser();
  if (!user) return;

  const steps = user.stats.todaySteps || 0;
  const goal = user.settings.dailyGoal || DEFAULT_DAILY_GOAL;
  const percent = Math.min(Math.round((steps / goal) * 100), 100);

  bar.style.width = percent + "%";
  bar.innerText = percent + "%";
}

/* ======================
   MOOD
====================== */

function selectMood(mood) {
  state.selectedMood = mood;
  setText("moodResult", `Selected mood: ${mood}`);
}

async function saveMoodEntry() {
  const user = await getCurrentUser();
  if (!user) return;
  if (!state.selectedMood) return alert("Please select a mood first.");

  const note = (document.getElementById("moodNote")?.value || "").trim();
  const entry = { date: todayISO(), mood: state.selectedMood, note };

  user.moodHistory.push(entry);
  user.moodHistory.sort((a, b) => a.date.localeCompare(b.date));
  user.moodHistory = user.moodHistory.slice(-180);

  await saveCurrentUser(user);
  document.getElementById("moodNote").value = "";
  state.selectedMood = null;

  await loadMoodPage();
  await awardBadges(user);
  alert("Mood entry saved.");
}

async function loadMoodPage() {
  await showMood();
  await renderMoodHistory();
  await drawMoodChart();
}

async function showMood() {
  const user = await getCurrentUser();
  const hint = document.getElementById("moodHint");
  if (!user) return;

  const last = [...user.moodHistory].sort((a, b) => b.date.localeCompare(a.date))[0];
  setText("moodResult", last ? `Latest mood: ${last.mood}${last.note ? " — " + last.note : ""}` : "No mood selected yet.");

  if (hint) {
    hint.style.display = last ? "none" : "block";
    hint.innerText = last ? "" : "Pick a mood and save a note.";
  }
}

async function renderMoodHistory() {
  const user = await getCurrentUser();
  const list = document.getElementById("moodHistoryList");
  if (!user || !list) return;

  const items = [...user.moodHistory].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12);
  if (!items.length) {
    list.innerHTML = `<div class="muted tiny">No mood history yet.</div>`;
    return;
  }

  list.innerHTML = items.map(item => `
    <div class="historyItem">
      <div class="historyTitle">${formatDate(item.date)} — ${escapeHtml(item.mood)}</div>
      <div class="tiny muted">${escapeHtml(item.note || "No note")}</div>
    </div>
  `).join("");
}

async function drawMoodChart() {
  const user = await getCurrentUser();
  const canvas = document.getElementById("moodChart");
  const hint = document.getElementById("moodChartHint");
  if (!user || !canvas) return;

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const entries = [...user.moodHistory].slice(-7);
  if (!entries.length) {
    if (hint) hint.innerText = "No mood data yet.";
    return;
  }

  if (hint) hint.innerText = "Mood values: Happy=3, Normal=2, Tired=1";

  const moodMap = { Happy: 3, Normal: 2, Tired: 1 };
  const max = 3;

  entries.forEach((entry, i) => {
    const value = moodMap[entry.mood] || 1;
    const h = (value / max) * 140;
    const x = 20 + i * 42;
    const y = 180 - h;

    ctx.fillStyle = "#7c9cff";
    ctx.fillRect(x, y, 26, h);

    ctx.fillStyle = "#ffffff";
    ctx.font = "10px Arial";
    ctx.fillText(entry.mood[0], x + 8, y - 6);
    ctx.fillText(dayNameShort(entry.date), x + 2, 200);
  });
}

/* ======================
   WATER / CALORIES / BMI
====================== */

async function loadHealthPage() {
  const user = await getCurrentUser();
  if (!user) return;

  setText("waterCount", String(user.stats.todayWater || 0));
  setText("calorieCount", String(user.stats.todayCalories || 0));
  renderBmiBox(user);
}

async function addWater(amount) {
  const user = await getCurrentUser();
  if (!user) return;

  user.stats.todayWater = (user.stats.todayWater || 0) + amount;
  saveTodayWaterToHistory(user, amount);
  await saveCurrentUser(user);
  await loadHealthPage();
  await awardBadges(user);
}

async function addCustomWater() {
  const value = parseInt(document.getElementById("customWaterInput")?.value || "0", 10);
  if (!value || value < 1) return alert("Enter a valid water amount.");

  document.getElementById("customWaterInput").value = "";
  await addWater(value);
}

async function addCalories() {
  const user = await getCurrentUser();
  if (!user) return;

  const value = parseInt(document.getElementById("customCalorieInput")?.value || "0", 10);
  if (!value || value < 1) return alert("Enter a valid calorie amount.");

  user.stats.todayCalories = (user.stats.todayCalories || 0) + value;
  saveTodayCaloriesToHistory(user, value);
  await saveCurrentUser(user);
  document.getElementById("customCalorieInput").value = "";
  await loadHealthPage();
}

function saveTodayWaterToHistory(user, amount) {
  const today = todayISO();
  const existing = user.waterHistory.find(x => x.date === today);
  if (existing) existing.amount += amount;
  else user.waterHistory.push({ date: today, amount });
  user.waterHistory = user.waterHistory.slice(-90);
}

function saveTodayCaloriesToHistory(user, amount) {
  const today = todayISO();
  const existing = user.calorieHistory.find(x => x.date === today);
  if (existing) existing.amount += amount;
  else user.calorieHistory.push({ date: today, amount });
  user.calorieHistory = user.calorieHistory.slice(-90);
}

function renderBmiBox(user) {
  const box = document.getElementById("bmiBox");
  if (!box) return;

  const h = parseFloat(user.metrics.heightCm || 0);
  const w = parseFloat(user.metrics.weightKg || 0);
  const gw = parseFloat(user.metrics.goalWeightKg || 0);

  let bmiText = "Not enough data";
  if (h > 0 && w > 0) {
    const bmi = w / Math.pow(h / 100, 2);
    bmiText = `${bmi.toFixed(1)} BMI`;
  }

  box.innerHTML = `
    <div class="summaryItem"><b>Height:</b> ${h || "-"} cm</div>
    <div class="summaryItem"><b>Weight:</b> ${w || "-"} kg</div>
    <div class="summaryItem"><b>Goal Weight:</b> ${gw || "-"} kg</div>
    <div class="summaryItem"><b>BMI:</b> ${bmiText}</div>
  `;
}

/* ======================
   CHARTS
====================== */

async function drawStepChart() {
  const user = await getCurrentUser();
  const canvas = document.getElementById("stepChart");
  const hint = document.getElementById("chartHint");
  if (!user || !canvas) return;

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const items = [...user.stepHistory].slice(-7);
  if (!items.length) {
    if (hint) hint.innerText = "No step data yet. Add steps to see your chart.";
    return;
  }

  if (hint) hint.innerText = "Last 7 days with labels and values.";

  const max = Math.max(...items.map(x => x.steps), 1);

  items.forEach((item, i) => {
    const x = 20 + i * 42;
    const h = (item.steps / max) * 150;
    const y = 180 - h;

    ctx.fillStyle = "#1abc9c";
    ctx.fillRect(x, y, 26, h);

    ctx.fillStyle = "#ffffff";
    ctx.font = "10px Arial";
    ctx.fillText(String(item.steps), x - 4, y - 6);
    ctx.fillText(dayNameShort(item.date), x + 2, 200);
  });
}

async function drawMonthlyStepChart() {
  const user = await getCurrentUser();
  const canvas = document.getElementById("monthlyStepChart");
  const hint = document.getElementById("monthlyChartHint");
  if (!user || !canvas) return;

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const items = [...user.stepHistory].slice(-30);
  if (!items.length) {
    if (hint) hint.innerText = "No monthly step data yet.";
    return;
  }

  const buckets = [];
  for (let i = 0; i < items.length; i += 5) {
    const group = items.slice(i, i + 5);
    buckets.push({
      label: `${i + 1}-${i + group.length}`,
      value: group.reduce((sum, x) => sum + x.steps, 0)
    });
  }

  const max = Math.max(...buckets.map(x => x.value), 1);
  if (hint) hint.innerText = "Grouped monthly step totals.";

  buckets.forEach((item, i) => {
    const x = 18 + i * 50;
    const h = (item.value / max) * 150;
    const y = 180 - h;

    ctx.fillStyle = "#ffb454";
    ctx.fillRect(x, y, 30, h);

    ctx.fillStyle = "#ffffff";
    ctx.font = "10px Arial";
    ctx.fillText(item.label, x - 2, 200);
  });
}

async function drawMoodPieChart() {
  const user = await getCurrentUser();
  const canvas = document.getElementById("moodPieChart");
  const hint = document.getElementById("moodPieHint");
  if (!user || !canvas) return;

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const moods = user.moodHistory.slice(-30);
  if (!moods.length) {
    if (hint) hint.innerText = "No mood distribution data yet.";
    return;
  }

  const counts = {
    Happy: moods.filter(x => x.mood === "Happy").length,
    Normal: moods.filter(x => x.mood === "Normal").length,
    Tired: moods.filter(x => x.mood === "Tired").length
  };

  const total = counts.Happy + counts.Normal + counts.Tired || 1;
  const centerX = 150;
  const centerY = 110;
  const radius = 70;

  const slices = [
    { value: counts.Happy, color: "#36d399" },
    { value: counts.Normal, color: "#60a5fa" },
    { value: counts.Tired, color: "#f87171" }
  ];

  let start = 0;
  slices.forEach(slice => {
    const angle = (slice.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.fillStyle = slice.color;
    ctx.arc(centerX, centerY, radius, start, start + angle);
    ctx.closePath();
    ctx.fill();
    start += angle;
  });

  ctx.fillStyle = "#ffffff";
  ctx.font = "11px Arial";
  ctx.fillText(`H ${counts.Happy}`, 20, 25);
  ctx.fillText(`N ${counts.Normal}`, 80, 25);
  ctx.fillText(`T ${counts.Tired}`, 140, 25);

  if (hint) hint.innerText = "Mood distribution for recent entries.";
}

/* ======================
   BADGES / STREAK / TASKS
====================== */

async function awardBadges(user) {
  const badges = new Set(user.badges || []);
  const steps = user.stats.todaySteps || 0;
  const water = user.stats.todayWater || 0;
  const moods = user.moodHistory.length || 0;
  const streak = calculateMoodStreak(user);

  if (steps >= 5000) badges.add("Walker 5K");
  if (steps >= 10000) badges.add("Goal Crusher");
  if (steps >= 15000) badges.add("Marathon Spirit");
  if (water >= 2000) badges.add("Hydration Hero");
  if (moods >= 7) badges.add("Mood Logger");
  if (streak >= 3) badges.add("3-Day Streak");
  if (streak >= 7) badges.add("7-Day Streak");

  user.badges = Array.from(badges);
  await saveCurrentUser(user);
  renderBadges(user.badges);
}

function renderBadges(badges) {
  const box = document.getElementById("badgeList");
  if (!box) return;

  if (!badges.length) {
    box.innerHTML = `<span class="tiny muted">No badges yet</span>`;
    return;
  }

  box.innerHTML = badges.map(b => `<span class="badge">${escapeHtml(b)}</span>`).join("");
}

function calculateMoodStreak(user) {
  const dates = [...new Set(user.moodHistory.map(x => x.date))].sort().reverse();
  if (!dates.length) return 0;

  let streak = 0;
  let current = new Date(todayISO() + "T00:00:00");

  for (const d of dates) {
    const ds = current.toISOString().split("T")[0];
    if (d === ds) {
      streak++;
      current.setDate(current.getDate() - 1);
    } else if (new Date(d + "T00:00:00") < current) {
      break;
    }
  }
  return streak;
}

async function renderDailyTasks() {
  const user = await getCurrentUser();
  const box = document.getElementById("dailyTasksList");
  if (!user || !box) return;

  const goal = user.settings.dailyGoal || DEFAULT_DAILY_GOAL;
  const tasks = [
    { text: `Reach ${goal} steps`, done: (user.stats.todaySteps || 0) >= goal },
    { text: `Drink 2000 ml water`, done: (user.stats.todayWater || 0) >= 2000 },
    { text: `Add one mood entry`, done: user.moodHistory.some(x => x.date === todayISO()) },
    { text: `Stay under 2500 kcal`, done: (user.stats.todayCalories || 0) > 0 && (user.stats.todayCalories || 0) <= 2500 }
  ];

  box.innerHTML = tasks.map(t => `
    <div class="historyItem">
      <div class="historyTitle">${t.done ? "✅" : "⬜"} ${escapeHtml(t.text)}</div>
    </div>
  `).join("");
}

/* ======================
   SUMMARY / COACH
====================== */

async function loadWeeklySummary() {
  const user = await getCurrentUser();
  const box = document.getElementById("weeklySummaryBox");
  const coach = document.getElementById("coachAdviceBox");
  if (!user || !box || !coach) return;

  const last7Steps = user.stepHistory.slice(-7).map(x => x.steps);
  const last7Moods = user.moodHistory.slice(-7);
  const last7Water = user.waterHistory.slice(-7).reduce((sum, x) => sum + x.amount, 0);

  const totalSteps = last7Steps.reduce((a, b) => a + b, 0);
  const avgSteps = last7Steps.length ? Math.round(totalSteps / last7Steps.length) : 0;
  const moodCount = {
    Happy: last7Moods.filter(x => x.mood === "Happy").length,
    Normal: last7Moods.filter(x => x.mood === "Normal").length,
    Tired: last7Moods.filter(x => x.mood === "Tired").length
  };

  box.innerHTML = `
    <div class="summaryItem"><b>Total weekly steps:</b> ${totalSteps}</div>
    <div class="summaryItem"><b>Average daily steps:</b> ${avgSteps}</div>
    <div class="summaryItem"><b>Water last 7 entries:</b> ${last7Water} ml</div>
    <div class="summaryItem"><b>Calories today:</b> ${user.stats.todayCalories || 0} kcal</div>
    <div class="summaryItem"><b>Mood count:</b> Happy ${moodCount.Happy}, Normal ${moodCount.Normal}, Tired ${moodCount.Tired}</div>
    <div class="summaryItem"><b>Badges:</b> ${(user.badges || []).join(", ") || "None"}</div>
  `;

  coach.innerHTML = generateCoachAdvice(user, { avgSteps, moodCount, last7Water });
}

function generateCoachAdvice(user, data) {
  const tips = [];

  if (data.avgSteps < (user.settings.dailyGoal || DEFAULT_DAILY_GOAL) * 0.7) {
    tips.push("Your average steps are below your goal. Try a short evening walk every day.");
  } else {
    tips.push("Your step performance looks solid this week. Keep the momentum going.");
  }

  if (data.moodCount.Tired > data.moodCount.Happy) {
    tips.push("You logged more tired days than happy ones. Consider better rest and lighter goals for a few days.");
  } else if (data.moodCount.Happy >= 3) {
    tips.push("Your mood trend is positive this week. Great consistency.");
  }

  if (data.last7Water < 7000) {
    tips.push("Water intake seems low across your recent entries. Aim for more hydration.");
  }

  if ((user.stats.todayCalories || 0) > 3000) {
    tips.push("Today's calorie intake is high. Balance it with movement and hydration.");
  }

  const bestDay = findBestStepDay(user);
  const worstDay = findWorstWaterDay(user);

  if (bestDay) tips.push(`Best recent step day: ${formatDate(bestDay.date)} with ${bestDay.steps} steps.`);
  if (worstDay) tips.push(`Lowest water day: ${formatDate(worstDay.date)} with ${worstDay.amount} ml.`);

  return tips.map(t => `<div class="summaryItem">${escapeHtml(t)}</div>`).join("");
}

function findBestStepDay(user) {
  if (!user.stepHistory.length) return null;
  return [...user.stepHistory].sort((a, b) => b.steps - a.steps)[0];
}

function findWorstWaterDay(user) {
  if (!user.waterHistory.length) return null;
  return [...user.waterHistory].sort((a, b) => a.amount - b.amount)[0];
}

async function exportUserData() {
  const user = await getCurrentUser();
  if (!user) return;

  const blob = new Blob([JSON.stringify(user, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${user.username}_fitlife_export.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function backupAppData() {
  const db = await readDB();
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "fitlife_backup.json";
  a.click();
  URL.revokeObjectURL(url);
}

async function importAppData(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const text = await file.text();
  try {
    const parsed = JSON.parse(text);
    if (!parsed.users || !Array.isArray(parsed.users)) throw new Error("Invalid backup");
    await writeDB(parsed);
    alert("Backup imported successfully.");
    openPage("login");
  } catch {
    alert("Invalid backup file.");
  }
}

async function notifySummary() {
  const user = await getCurrentUser();
  if (!user) return;

  const message = `Weekly summary ready for ${user.username}.`;
  if (window.cordova && navigator.notification && navigator.notification.alert) {
    navigator.notification.alert(message, null, "FitLife", "OK");
  } else if ("Notification" in window && Notification.permission === "granted") {
    new Notification("FitLife", { body: message });
  } else {
    alert(message);
  }
}

/* ======================
   CALENDAR / COMPARE / SOCIAL
====================== */

async function renderCalendarView() {
  const user = await getCurrentUser();
  const list = document.getElementById("calendarList");
  if (!user || !list) return;

  const dates = new Set([
    ...user.stepHistory.map(x => x.date),
    ...user.moodHistory.map(x => x.date),
    ...user.waterHistory.map(x => x.date),
    ...user.calorieHistory.map(x => x.date)
  ]);

  const items = Array.from(dates).sort().reverse().slice(0, 20);

  if (!items.length) {
    list.innerHTML = `<div class="muted tiny">No calendar data yet.</div>`;
    return;
  }

  list.innerHTML = items.map(date => {
    const steps = user.stepHistory.find(x => x.date === date)?.steps || 0;
    const mood = user.moodHistory.find(x => x.date === date)?.mood || "-";
    const water = user.waterHistory.find(x => x.date === date)?.amount || 0;
    const calories = user.calorieHistory.find(x => x.date === date)?.amount || 0;

    return `
      <div class="historyItem">
        <div class="historyTitle">${formatDate(date)}</div>
        <div class="tiny muted">Steps: ${steps} | Mood: ${escapeHtml(mood)} | Water: ${water} ml | Calories: ${calories} kcal</div>
      </div>
    `;
  }).join("");
}

async function loadComparisonView() {
  const user = await getCurrentUser();
  const box = document.getElementById("compareBox");
  if (!user || !box) return;

  const thisWeek = user.stepHistory.slice(-7).reduce((sum, x) => sum + x.steps, 0);
  const lastWeek = user.stepHistory.slice(-14, -7).reduce((sum, x) => sum + x.steps, 0);
  const diff = thisWeek - lastWeek;

  box.innerHTML = `
    <div class="summaryItem"><b>This week:</b> ${thisWeek} steps</div>
    <div class="summaryItem"><b>Last week:</b> ${lastWeek} steps</div>
    <div class="summaryItem"><b>Difference:</b> ${diff >= 0 ? "+" : ""}${diff} steps</div>
  `;
}

async function addFriend() {
  const user = await getCurrentUser();
  if (!user) return;

  const username = (document.getElementById("friendUsernameInput")?.value || "").trim();
  if (!username) return alert("Enter a username.");

  const friend = await findUserByUsername(username);
  if (!friend) return alert("User not found.");
  if (friend.id === user.id) return alert("You cannot add yourself.");
  if (user.friends.includes(friend.id)) return alert("Already added.");

  user.friends.push(friend.id);
  await saveCurrentUser(user);
  document.getElementById("friendUsernameInput").value = "";
  await renderFriendList();
  await renderLeaderboard();
}

async function renderFriendList() {
  const user = await getCurrentUser();
  const box = document.getElementById("friendList");
  if (!user || !box) return;

  if (!user.friends.length) {
    box.innerHTML = `<div class="muted tiny">No friends added yet.</div>`;
    return;
  }

  const users = await getUsers();
  box.innerHTML = user.friends.map(fid => {
    const f = users.find(u => u.id === fid);
    if (!f) return "";
    return `
      <div class="historyItem">
        <div class="historyTitle">${escapeHtml(f.username)}</div>
        <div class="tiny muted">Goal: ${f.settings.dailyGoal || DEFAULT_DAILY_GOAL}</div>
      </div>
    `;
  }).join("");
}

async function renderLeaderboard() {
  const user = await getCurrentUser();
  const box = document.getElementById("leaderboardList");
  if (!user || !box) return;

  const users = await getUsers();
  const pool = users.filter(u => u.id === user.id || user.friends.includes(u.id));

  const sorted = pool
    .map(u => ({ username: u.username, steps: u.stats?.todaySteps || 0 }))
    .sort((a, b) => b.steps - a.steps);

  if (!sorted.length) {
    box.innerHTML = `<div class="muted tiny">No leaderboard data.</div>`;
    return;
  }

  box.innerHTML = sorted.map((item, i) => `
    <div class="historyItem">
      <div class="historyTitle">#${i + 1} ${escapeHtml(item.username)}</div>
      <div class="tiny muted">${item.steps} steps today</div>
    </div>
  `).join("");
}

/* ======================
   HELPERS
====================== */

function todayISO() {
  return new Date().toISOString().split("T")[0];
}

function dayNameShort(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short" });
}

function formatDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function placeholderAvatar(name = "U") {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=4c7dff&color=fff`;
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.innerText = text;
}

function setImage(id, src) {
  const el = document.getElementById(id);
  if (el) el.src = src;
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeJs(text) {
  return String(text).replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}