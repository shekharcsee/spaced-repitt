const STORAGE_KEY = "looplearn-extension-state-v1";

const cardForm = document.getElementById("cardForm");
const cardList = document.getElementById("cardList");
const emptyState = document.getElementById("emptyState");
const statusText = document.getElementById("statusText");
const statusHelp = document.getElementById("statusHelp");
const testReminderBtn = document.getElementById("testReminderBtn");
const totalCardsStat = document.getElementById("totalCardsStat");
const activeCardsStat = document.getElementById("activeCardsStat");
const sentCountStat = document.getElementById("sentCountStat");

init();

async function init() {
  attachEvents();
  await ensureState();
  await render();
}

function attachEvents() {
  cardForm.addEventListener("submit", onAddCard);
  cardList.addEventListener("click", onCardAction);
  testReminderBtn.addEventListener("click", sendTestReminder);
}

async function ensureState() {
  const { [STORAGE_KEY]: stored } = await chrome.storage.local.get(STORAGE_KEY);

  if (stored) {
    return;
  }

  await saveState({
    cards: [
      {
        id: crypto.randomUUID(),
        text: "Binary search needs sorted data. Check middle, then eliminate half.",
        label: "DSA",
        intervalMinutes: 20,
        active: true,
        reminderCount: 0,
        createdAt: Date.now(),
        nextReminderAt: Date.now() + 20 * 60 * 1000,
        lastRemindedAt: null
      }
    ]
  });
}

async function getState() {
  const { [STORAGE_KEY]: stored } = await chrome.storage.local.get(STORAGE_KEY);
  return (
    stored || {
      cards: []
    }
  );
}

async function saveState(state) {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}

async function onAddCard(event) {
  event.preventDefault();

  const formData = new FormData(cardForm);
  const text = String(formData.get("cardText")).trim();
  const label = String(formData.get("cardLabel")).trim();
  const intervalMinutes = clampNumber(Number(formData.get("intervalMinutes")), 1, 1440, 15);

  if (!text) {
    return;
  }

  const state = await getState();
  state.cards.unshift({
    id: crypto.randomUUID(),
    text,
    label,
    intervalMinutes,
    active: true,
    reminderCount: 0,
    createdAt: Date.now(),
    nextReminderAt: Date.now() + intervalMinutes * 60 * 1000,
    lastRemindedAt: null
  });

  await saveState(state);
  await syncBackground();
  cardForm.reset();
  document.getElementById("intervalMinutes").value = "15";
  await render();
}

async function onCardAction(event) {
  const button = event.target.closest("button[data-action]");

  if (!button) {
    return;
  }

  const cardId = button.dataset.cardId;
  const action = button.dataset.action;
  const state = await getState();
  const card = state.cards.find((item) => item.id === cardId);

  if (!card) {
    return;
  }

  if (action === "toggle") {
    card.active = !card.active;
    if (card.active) {
      card.nextReminderAt = Date.now() + card.intervalMinutes * 60 * 1000;
    }
  }

  if (action === "remind-now") {
    await chrome.runtime.sendMessage({
      type: "SEND_REMINDER_NOW",
      cardId
    });
    await render();
    return;
  }

  if (action === "delete") {
    state.cards = state.cards.filter((item) => item.id !== cardId);
  }

  await saveState(state);
  await syncBackground();
  await render();
}

async function sendTestReminder() {
  await chrome.runtime.sendMessage({
    type: "SEND_TEST_NOTIFICATION"
  });
  await renderStatus();
}

async function syncBackground() {
  await chrome.runtime.sendMessage({
    type: "SYNC_REMINDERS"
  });
}

async function render() {
  const state = await getState();
  await renderStatus();
  renderStats(state);
  renderCards(state.cards);
}

async function renderStatus() {
  const level = await chrome.notifications.getPermissionLevel();

  if (level === "granted") {
    statusText.textContent = "Enabled";
    statusHelp.textContent = "Keep Chrome open so your reminders continue while you browse.";
    return;
  }

  statusText.textContent = "Unavailable";
  statusHelp.textContent =
    "Chrome notifications are not available right now. Check your browser or Mac notification settings.";
}

function renderStats(state) {
  const totalCards = state.cards.length;
  const activeCards = state.cards.filter((card) => card.active).length;
  const sentCount = state.cards.reduce((sum, card) => sum + card.reminderCount, 0);

  totalCardsStat.textContent = String(totalCards);
  activeCardsStat.textContent = String(activeCards);
  sentCountStat.textContent = String(sentCount);
}

function renderCards(cards) {
  emptyState.classList.toggle("hidden", cards.length > 0);
  cardList.innerHTML = cards
    .map((card) => {
      const nextReminder = card.active ? getCountdownLabel(card.nextReminderAt) : "Paused";
      const nextTime = card.active ? formatDateTime(card.nextReminderAt) : "Not scheduled";
      const lastTime = card.lastRemindedAt ? formatDateTime(card.lastRemindedAt) : "Not sent yet";

      return `
        <article class="study-card ${card.active ? "" : "inactive"}">
          <div class="card-top">
            <strong>${escapeHtml(card.label || "Reminder card")}</strong>
          </div>
          <div class="chip-row">
            <span class="chip">${card.intervalMinutes} min loop</span>
            <span class="chip ${card.active ? "" : "paused"}">${card.active ? "Active" : "Paused"}</span>
          </div>
          <p class="card-text">${escapeHtml(card.text)}</p>
          <p class="meta-line">Next: ${escapeHtml(nextReminder)} (${escapeHtml(nextTime)})</p>
          <p class="meta-line">Last: ${escapeHtml(lastTime)}</p>
          <p class="meta-line">Sent: ${card.reminderCount}</p>
          <div class="card-actions">
            <button class="ghost-button" type="button" data-action="toggle" data-card-id="${card.id}">
              ${card.active ? "Pause" : "Resume"}
            </button>
            <button class="primary-button" type="button" data-action="remind-now" data-card-id="${card.id}">
              Remind now
            </button>
            <button class="ghost-button" type="button" data-action="delete" data-card-id="${card.id}">
              Delete
            </button>
          </div>
        </article>
      `;
    })
    .join("");
}

function getCountdownLabel(nextReminderAt) {
  const diff = Math.max(0, nextReminderAt - Date.now());
  const totalSeconds = Math.floor(diff / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")} left`;
}

function formatDateTime(timestamp) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(timestamp));
}

function clampNumber(value, min, max, fallback) {
  if (Number.isNaN(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, value));
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
