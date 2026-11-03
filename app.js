const API_BASE = "https://api.github.com"; // github api

// Four app.js layers ->

// 1) API LAYER

// A custom error so the UI can show a friendly message.
// `type` for egrrors -- not-found, rate-limiting, network, unknown

class ApiError extends Error {
  constructor(type, message) {
    super(message);
    this.type = type;
  }
}

// Fetches a URL and returns parsed JSON, or throws an ApiError.
async function fetchJSON(url) {
  let response;

  // fetch() only throws when the network itself fails (offline, DNS...)
  try {
    response = await fetch(url);
  } catch (err) {
    throw new ApiError("network", "Network error. Check your internet connection.");
  }

  // HTTP errors (404, 403...) do NOT throw, so we check manually
  if (response.status === 404) {
    throw new ApiError("not-found", "User not found. Check the username and try again.");
  }

  // GitHub signals a rate limit with 403 or 429 and remaining = 0
  const isRateLimited =
    (response.status === 403 || response.status === 429) &&
    response.headers.get("x-ratelimit-remaining") === "0";

  if (isRateLimited) {
    // Header is a Unix timestamp in seconds; Date wants milliseconds so changing units. a bit of mathematics lol
    const resetSeconds = Number(response.headers.get("x-ratelimit-reset"));
    const resetTime = new Date(resetSeconds * 1000).toLocaleTimeString();
    throw new ApiError(
      "rate-limit",
      `GitHub rate limit reached. Try again after ${resetTime}.`
    );
  }

  if (!response.ok) {
    throw new ApiError("unknown", `Something went wrong (status ${response.status}).`);
  }

  return response.json();
}

const getUser = (username) =>
  fetchJSON(`${API_BASE}/users/${encodeURIComponent(username)}`);

const getRepos = (username) =>
  fetchJSON(`${API_BASE}/users/${encodeURIComponent(username)}/repos?per_page=100`);

const getEvents = (username) =>
  fetchJSON(`${API_BASE}/users/${encodeURIComponent(username)}/events/public?per_page=10`);


// 2) CORE LOGIC (pure functions: data in, data out, no DOM)

// Top 5 repos by star count. Forks are excluded, because they are not the user's own work
function getTopRepos(repos, count = 5) {
  return repos
    .filter((repo) => !repo.fork)
    .sort((a, b) => b.stargazers_count - a.stargazers_count) // highest first
    .slice(0, count);
}

// Counts how many repos use each language, returns the top 5 sorted.

function getLanguageStats(repos, count = 5) {
  const ownRepos = repos.filter((repo) => !repo.fork && repo.language);
  const totals = {};

  for (const repo of ownRepos) {
    totals[repo.language] = (totals[repo.language] || 0) + 1;
  }

  return Object.entries(totals)
    .map(([language, repoCount]) => ({
      language,
      count: repoCount,
      percent: Math.round((repoCount / ownRepos.length) * 100),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, count);
}

// Turns a raw GitHub event into a short readable sentence, Returns null for event types we don't care about
function describeEvent(event) {
  const repo = event.repo.name;

  switch (event.type) { // switch case for events
    case "PushEvent": {
      const commits = event.payload.commits ? event.payload.commits.length : 0;
      return `Pushed ${commits} commit${commits === 1 ? "" : "s"} to ${repo}`;
    }
    case "WatchEvent":
      return `Starred ${repo}`;
    case "ForkEvent":
      return `Forked ${repo}`;
    case "CreateEvent":
      return `Created ${event.payload.ref_type} in ${repo}`;
    case "PullRequestEvent":
      return `${capitalize(event.payload.action)} a pull request in ${repo}`;
    case "IssuesEvent":
      return `${capitalize(event.payload.action)} an issue in ${repo}`;
    default:
      return null;
  }
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Returns up to 5 readable activity strings, skipping unknown event types.
function getRecentActivity(events, count = 5) {
  return events
    .map(describeEvent)
    .filter((text) => text !== null)
    .slice(0, count);
}


// 3) RENDERING (DOM Part)


const form = document.querySelector("#search-form");
const input = document.querySelector("#username-input");
const submitBtn = document.querySelector("#submit-btn");
const statusEl = document.querySelector("#status");
const card = document.querySelector("#card");

// A fixed palette so each language gets a consistent color in the bar
const COLORS = ["#3178c6", "#f1e05a", "#e34c26", "#3572a5", "#563d7c"];

function showStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
  statusEl.hidden = false;
}

function hideStatus() {
  statusEl.hidden = true;
}

// Empties a list element and fills it with <li> items.
// textContent (not innerHTML) is used so user data can never inject HTML.
function fillList(listId, items, emptyMessage) {
  const list = document.querySelector(listId);
  list.innerHTML = "";

  if (items.length === 0) {
    const li = document.createElement("li");
    li.textContent = emptyMessage;
    li.className = "empty";
    list.appendChild(li);
    return;
  }

  items.forEach((item) => list.appendChild(item));
}

function createLi(text) {
  const li = document.createElement("li");
  li.textContent = text;
  return li;
}

function renderProfile(user) {
  document.querySelector("#avatar").src = user.avatar_url;
  document.querySelector("#name").textContent = user.name || user.login;

  const loginLink = document.querySelector("#login");
  loginLink.textContent = `@${user.login}`;
  loginLink.href = user.html_url;

  document.querySelector("#bio").textContent = user.bio || "No bio provided.";
  document.querySelector("#followers").textContent = user.followers;
  document.querySelector("#following").textContent = user.following;
  document.querySelector("#repo-count").textContent = user.public_repos;
}

function renderRepos(topRepos) {
  const items = topRepos.map((repo) => {
    const li = document.createElement("li");
    const link = document.createElement("a");
    link.href = repo.html_url;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = repo.name;
    li.appendChild(link);
    li.append(` (⭐ ${repo.stargazers_count})`);
    return li;
  });
  fillList("#repo-list", items, "No public repositories.");
}

function renderLanguages(stats) {
  // Colored proportional bar
  const bar = document.querySelector("#language-bar");
  bar.innerHTML = "";
  stats.forEach((stat, i) => {
    const segment = document.createElement("div");
    segment.style.width = `${stat.percent}%`;
    segment.style.background = COLORS[i % COLORS.length];
    segment.title = `${stat.language} ${stat.percent}%`;
    bar.appendChild(segment);
  });

  // Legend list
  const items = stats.map((stat, i) => {
    const li = document.createElement("li");

    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = COLORS[i % COLORS.length];

    const repoWord = stat.count === 1 ? "repo" : "repos";
    li.append(dot, `${stat.language}: ${stat.count} ${repoWord} (${stat.percent}%)`);
    return li;
  });
  fillList("#language-list", items, "No language data available.");
}

function renderActivity(activity) {
  fillList("#activity-list", activity.map(createLi), "No recent public activity.");
}


// 4) EVENTS: tie everything together

async function handleSearch(event) {
  event.preventDefault(); // stop the browser from reloading the page

  const username = input.value.trim();
  if (!username) return;

  // Loading state
  card.hidden = true;
  submitBtn.disabled = true;
  showStatus("Loading...");

  try {
    // Fetch the user first: if it 404s we skip the other two calls
    const user = await getUser(username);

    // These two are independent, so run them in parallel
    const [repos, events] = await Promise.all([getRepos(username), getEvents(username)]);

    renderProfile(user);
    renderRepos(getTopRepos(repos));
    renderLanguages(getLanguageStats(repos));
    renderActivity(getRecentActivity(events));

    hideStatus();
    card.hidden = false;
  } catch (err) {
    // Our own errors carry friendly messages, anything else is a bug
    const message = err instanceof ApiError ? err.message : "Unexpected error. Please try again.";
    showStatus(message, true);
    if (!(err instanceof ApiError)) console.error(err);
  } finally {
    // Runs on success and failure, so the button never stays stuck
    submitBtn.disabled = false;
  }
}

form.addEventListener("submit", handleSearch);
