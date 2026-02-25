/* ======================
   FitLife - index.js (FINAL)
   - Always starts on landing
   - Requires login for app pages
   - One-time cleanup for old localStorage keys
   - Cleans auth inputs on navigation
   - Optional: resetAccount() for “delete previous records”
====================== */

const DAILY_GOAL = 10000;
const RESET_FLAG_KEY = "fitlife_reset_done_v1";

/** Keys used by this app */
const KEYS = {
  old1: "userName",
  old2: "user",
  old3: "pass",
  regUser: "registeredUser",
  regPass: "registeredPass",
  session: "sessionUser",
  steps: "steps",
  mood: "mood",
  history: "stepHistory"
};

document.addEventListener("deviceready", onReady, false);

function onReady() {
  // One-time cleanup (prevents old data causing auto-login)
  if (!localStorage.getItem(RESET_FLAG_KEY)) {
    wipeOldKeysOnly();
    localStorage.setItem(RESET_FLAG_KEY, "1");
  }

  // Always require login on each app start (no auto login)
  localStorage.removeItem(KEYS.session);

  // Init UI (safe even if pages hidden)
  renderGoalText();
  loadSteps();
  loadMood();
  updateProgressBar();

  // Start screen
  openPage("landing");
}

/** Only remove OLD keys once (does NOT delete the new account automatically) */
function wipeOldKeysOnly() {
  [KEYS.old1, KEYS.old2, KEYS.old3].forEach(k => localStorage.removeItem(k));
}

function isLoggedIn() {
  return !!localStorage.getItem(KEYS.session);
}

/* ======================
   NAVIGATION (with guard)
====================== */
function openPage(pageId) {
  const authPages = ["landing", "login", "register"];
  const protectedPages = ["menu", "steps", "mood", "stats", "profile", "about"];

  // Guard FIRST
  if (!isLoggedIn() && protectedPages.includes(pageId)) {
    pageId = "landing";
  }

  // Hide all
  document.querySelectorAll(".page").forEach(p => (p.style.display = "none"));

  // Show page
  const page = document.getElementById(pageId);
  if (page) page.style.display = "block";

  // Re-check login after guard adjustment
  const loggedInNow = isLoggedIn();

  // Bottom menu
  const bottomMenu = document.getElementById("bottomMenu");
  const isAuthScreen = authPages.includes(pageId);
  if (bottomMenu) bottomMenu.style.display = (!loggedInNow || isAuthScreen) ? "none" : "flex";

  // Clean inputs when switching auth screens
  if (pageId === "landing") clearAuthInputs();
  if (pageId === "login") clearLoginInputs(false);
  if (pageId === "register") clearRegisterInputs(false);

  // Page-specific actions
  if (pageId === "menu" || pageId === "profile") loadUserUI();
  if (pageId === "steps") {
    loadSteps();
    updateProgressBar();
  }
  if (pageId === "mood") loadMood();
  if (pageId === "stats") drawChart();
}

function goBack() {
  openPage("menu");
}

/* ======================
   AUTH
====================== */
function registerUser() {
  const username = (document.getElementById("regUsername")?.value || "").trim();
  const password = (document.getElementById("regPassword")?.value || "").trim();

  if (!username) return alert("Please enter a username.");
  if (password.length < 4) return alert("Password must be at least 4 characters.");

  // Demo storage (not secure)
  localStorage.setItem(KEYS.regUser, username);
  localStorage.setItem(KEYS.regPass, password);

  alert("Registered successfully! Please login.");
  clearRegisterInputs(true);
  openPage("login");
}

function loginUser() {
  const username = (document.getElementById("loginUsername")?.value || "").trim();
  const password = (document.getElementById("loginPassword")?.value || "").trim();

  const savedUser = localStorage.getItem(KEYS.regUser);
  const savedPass = localStorage.getItem(KEYS.regPass);

  if (!savedUser || !savedPass) {
    alert("No account found. Please register first.");
    clearLoginInputs(true);
    return openPage("register");
  }

  if (username !== savedUser || password !== savedPass) {
    return alert("Wrong username or password.");
  }

  localStorage.setItem(KEYS.session, username);
  clearLoginInputs(true);
  openPage("menu");
}

function logout() {
  localStorage.removeItem(KEYS.session);
  openPage("landing");
}

/** Deletes account + all data (what you asked: “remove previous records”) */
function resetAccount() {
  const ok = confirm("Reset account and delete all data?\nThis cannot be undone.");
  if (!ok) return;

  [
    KEYS.regUser, KEYS.regPass, KEYS.session,
    KEYS.steps, KEYS.mood, KEYS.history
  ].forEach(k => localStorage.removeItem(k));

  clearAuthInputs();
  renderGoalText();
  loadSteps();
  loadMood();
  updateProgressBar();

  alert("All data cleared.");
  openPage("landing");
}

function loadUserUI() {
  const user = localStorage.getItem(KEYS.session);
  const welcome = document.getElementById("welcomeText");
  const profile = document.getElementById("profileName");

  if (welcome) welcome.innerText = user ? `Welcome, ${user} 👋` : "";
  if (profile) profile.innerText = user ? `User: ${user}` : "";
}

/* Input helpers */
function clearAuthInputs() {
  clearLoginInputs(true);
  clearRegisterInputs(true);
}
function clearLoginInputs(clearUser) {
  const u = document.getElementById("loginUsername");
  const p = document.getElementById("loginPassword");
  if (u && clearUser) u.value = "";
  if (p) p.value = "";
}
function clearRegisterInputs(clearUser) {
  const u = document.getElementById("regUsername");
  const p = document.getElementById("regPassword");
  if (u && clearUser) u.value = "";
  if (p) p.value = "";
}

/* ======================
   STEPS + GOAL + PROGRESS
====================== */
function renderGoalText() {
  const el = document.getElementById("goalText");
  if (el) el.innerText = String(DAILY_GOAL);
}

function loadSteps() {
  const steps = parseInt(localStorage.getItem(KEYS.steps) || "0", 10);
  const el = document.getElementById("stepCount");
  if (el) el.innerText = `${steps} steps`;
}

function addSteps(amount) {
  if (!isLoggedIn()) return openPage("landing");

  saveTodaySteps();

  let steps = parseInt(localStorage.getItem(KEYS.steps) || "0", 10);
  steps += amount;
  localStorage.setItem(KEYS.steps, String(steps));

  loadSteps();
  updateProgressBar();
}

function resetSteps() {
  if (!isLoggedIn()) return openPage("landing");

  localStorage.setItem(KEYS.steps, "0");
  loadSteps();
  updateProgressBar();
}

function updateProgressBar() {
  const bar = document.getElementById("progressBar");
  if (!bar) return;

  const steps = parseInt(localStorage.getItem(KEYS.steps) || "0", 10);
  const percent = Math.min(Math.round((steps / DAILY_GOAL) * 100), 100);

  bar.style.width = percent + "%";
  bar.innerText = percent + "%";
}

/* ======================
   MOOD
====================== */
function setMood(mood) {
  if (!isLoggedIn()) return openPage("landing");

  localStorage.setItem(KEYS.mood, mood);
  showMood();
}

function loadMood() {
  showMood();
}

function showMood() {
  const el = document.getElementById("moodResult");
  const hint = document.getElementById("moodHint");
  if (!el) return;

  const mood = localStorage.getItem(KEYS.mood);
  el.innerText = mood ? `Today: ${mood}` : "No mood selected today.";
  if (hint) hint.style.display = mood ? "none" : "block";
  if (hint) hint.innerText = mood ? "" : "Pick one mood above to save it.";
}

/* ======================
   WEEKLY CHART
====================== */
function saveTodaySteps() {
  const steps = parseInt(localStorage.getItem(KEYS.steps) || "0", 10);
  const today = new Date().toISOString().split("T")[0];

  const history = JSON.parse(localStorage.getItem(KEYS.history) || "{}");
  history[today] = steps;
  localStorage.setItem(KEYS.history, JSON.stringify(history));
}

function drawChart() {
  if (!isLoggedIn()) return openPage("landing");

  saveTodaySteps();

  const canvas = document.getElementById("stepChart");
  const hint = document.getElementById("chartHint");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const history = JSON.parse(localStorage.getItem(KEYS.history) || "{}");
  const values = Object.values(history).slice(-7);

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!values.length) {
    if (hint) hint.innerText = "No data yet. Add steps to see your chart.";
    return;
  }
  if (hint) hint.innerText = "Chart shows last saved days.";

  const max = Math.max(...values, 1);
  values.forEach((v, i) => {
    const h = (v / max) * 160;
    ctx.fillStyle = "#1abc9c";
    ctx.fillRect(20 + i * 42, 190 - h, 26, h);
  });
}