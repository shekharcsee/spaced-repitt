const STORAGE_KEY = "looplearn-extension-state-v1";
const ALARM_PREFIX = "card:";

chrome.runtime.onInstalled.addListener(async () => {
  await ensureState();
  await syncReminderAlarms();
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureState();
  await syncReminderAlarms();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith(ALARM_PREFIX)) {
    return;
  }

  const cardId = alarm.name.slice(ALARM_PREFIX.length);
  await sendReminder(cardId);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message)
    .then((result) => sendResponse(result))
    .catch((error) => {
      console.error(error);
      sendResponse({ ok: false, error: String(error) });
    });

  return true;
});

async function handleMessage(message) {
  if (message.type === "SYNC_REMINDERS") {
    await syncReminderAlarms();
    return { ok: true };
  }

  if (message.type === "SEND_REMINDER_NOW") {
    await sendReminder(message.cardId, true);
    return { ok: true };
  }

  if (message.type === "SEND_TEST_NOTIFICATION") {
    await chrome.notifications.create({
      type: "basic",
      iconUrl: "icon128.png",
      title: "LoopLearn test reminder",
      message: "Your extension notifications are working.",
      priority: 2,
      requireInteraction: true
    });
    return { ok: true };
  }

  return { ok: false };
}

async function ensureState() {
  const state = await getState();

  if (state.cards.length > 0) {
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
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return (
    stored[STORAGE_KEY] || {
      cards: []
    }
  );
}

async function saveState(state) {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}

async function syncReminderAlarms() {
  const state = await getState();
  const alarms = await chrome.alarms.getAll();

  for (const alarm of alarms) {
    if (alarm.name.startsWith(ALARM_PREFIX)) {
      await chrome.alarms.clear(alarm.name);
    }
  }

  for (const card of state.cards) {
    if (!card.active) {
      continue;
    }

    const delayInMinutes = Math.max(0.1, (card.nextReminderAt - Date.now()) / 60000);
    await chrome.alarms.create(`${ALARM_PREFIX}${card.id}`, {
      delayInMinutes
    });
  }
}

async function sendReminder(cardId, fromManualTrigger = false) {
  const state = await getState();
  const card = state.cards.find((item) => item.id === cardId);

  if (!card || !card.active && !fromManualTrigger) {
    return;
  }

  const now = Date.now();
  card.lastRemindedAt = now;
  card.reminderCount += 1;
  card.nextReminderAt = now + card.intervalMinutes * 60 * 1000;

  await chrome.notifications.create(`looplearn-${card.id}-${now}`, {
    type: "basic",
    iconUrl: "icon128.png",
    title: card.label || "LoopLearn reminder",
    message: card.text,
    priority: 2,
    requireInteraction: true
  });

  await saveState(state);
  await syncReminderAlarms();
}
