import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-analytics.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getFirestore,
  onSnapshot,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/12.12.0/firebase-firestore.js";

// Replace these values with your own Firebase project config if needed.
const firebaseConfig = {
  apiKey: "AIzaSyDUVzzUXOEN66UN9I2TAN9BABWpR3UxqWw",
  authDomain: "spaced-repetition-app-d664e.firebaseapp.com",
  projectId: "spaced-repetition-app-d664e",
  storageBucket: "spaced-repetition-app-d664e.firebasestorage.app",
  messagingSenderId: "810497176338",
  appId: "1:810497176338:web:ad1e5ea3d05b9b93df39cb",
  measurementId: "G-GDWB01DPS8",
};

const app = initializeApp(firebaseConfig);
const analytics = typeof window !== "undefined" ? getAnalytics(app) : null;
const db = getFirestore(app);
const tasksCollection = collection(db, "tasks");

const SCHEDULE_STEPS = [
  { day: "Day 1", offset: 0 },
  { day: "Day 2", offset: 1 },
  { day: "Day 4", offset: 3 },
  { day: "Day 7", offset: 6 },
  { day: "Day 15", offset: 14 },
];

let tasks = [];
let selectedDate = getTodayDate();

const taskForm = document.getElementById("taskForm");
const taskInput = document.getElementById("taskInput");
const taskList = document.getElementById("taskList");
const dateFilter = document.getElementById("dateFilter");
const showTodayBtn = document.getElementById("showTodayBtn");
const totalTasks = document.getElementById("totalTasks");
const todayTasks = document.getElementById("todayTasks");
const completedTasks = document.getElementById("completedTasks");
const emptyState = document.getElementById("emptyState");
const resultsTitle = document.getElementById("resultsTitle");
const resultsCount = document.getElementById("resultsCount");
const activeDateLabel = document.getElementById("activeDateLabel");
const todaySummary = document.getElementById("todaySummary");
const statusBanner = document.getElementById("statusBanner");

init();

function init() {
  dateFilter.value = selectedDate;
  attachEvents();
  subscribeToTasks();
}

function attachEvents() {
  taskForm.addEventListener("submit", handleTaskSubmit);
  dateFilter.addEventListener("change", handleDateFilterChange);
  showTodayBtn.addEventListener("click", showToday);
  taskList.addEventListener("change", handleTaskListChange);
  taskList.addEventListener("click", handleTaskListClick);
}

function subscribeToTasks() {
  onSnapshot(
    tasksCollection,
    (snapshot) => {
      tasks = snapshot.docs
        .map((item) => ({
          ...item.data(),
          id: item.id,
        }))
        .sort((a, b) => b.createdDate.localeCompare(a.createdDate));

      statusBanner.textContent = "Connected to Firestore with real-time sync.";
      statusBanner.classList.remove("error");
      renderTasks();
    },
    (error) => {
      console.error("Firestore listener error:", error);
      statusBanner.textContent =
        "Could not connect to Firestore. Check your Firebase config and Firestore rules.";
      statusBanner.classList.add("error");
    }
  );
}

async function handleTaskSubmit(event) {
  event.preventDefault();

  const text = taskInput.value.trim();

  if (!text) {
    window.alert("Please enter a task before adding it.");
    return;
  }

  try {
    statusBanner.textContent = "Saving task to Firestore...";
    const task = createTask(text);
    const docRef = await addDoc(tasksCollection, task);

    // Store the Firestore document id inside the document so the structure stays consistent.
    await updateDoc(docRef, { id: docRef.id });

    taskForm.reset();
    showToday();
    taskInput.focus();
  } catch (error) {
    console.error("Error adding task:", error);
    statusBanner.textContent = "Task could not be saved. Please try again.";
    statusBanner.classList.add("error");
  }
}

function handleDateFilterChange(event) {
  selectedDate = event.target.value || getTodayDate();
  renderTasks();
}

function showToday() {
  selectedDate = getTodayDate();
  dateFilter.value = selectedDate;
  renderTasks();
}

async function handleTaskListChange(event) {
  const checkbox = event.target.closest('input[type="checkbox"][data-task-id]');

  if (!checkbox) {
    return;
  }

  const taskId = checkbox.dataset.taskId;
  const scheduleIndex = Number(checkbox.dataset.scheduleIndex);
  await toggleCheckbox(taskId, scheduleIndex);
}

async function handleTaskListClick(event) {
  const button = event.target.closest("button[data-action]");

  if (!button) {
    return;
  }

  const taskId = button.dataset.taskId;
  const action = button.dataset.action;

  if (action === "delete") {
    await deleteTask(taskId);
    return;
  }

  if (action === "edit") {
    await editTask(taskId);
  }
}

function createTask(text) {
  const createdDate = getTodayDate();

  // This matches the exact structure requested for each task document.
  return {
    id: "",
    text,
    createdDate,
    schedule: generateSchedule(createdDate),
  };
}

function generateSchedule(createdDate) {
  // Build the spaced repetition dates from the task creation date.
  return SCHEDULE_STEPS.map((step) => ({
    day: step.day,
    date: addDays(createdDate, step.offset),
    completed: false,
  }));
}

function filterTasksByDate(dateString) {
  return tasks.filter((task) =>
    task.schedule.some((item) => item.date === dateString)
  );
}

async function toggleCheckbox(taskId, scheduleIndex) {
  const task = tasks.find((item) => item.id === taskId);

  if (!task || Number.isNaN(scheduleIndex) || !task.schedule[scheduleIndex]) {
    return;
  }

  const updatedSchedule = task.schedule.map((item, index) => {
    if (index !== scheduleIndex) {
      return item;
    }

    return {
      ...item,
      completed: !item.completed,
    };
  });

  try {
    await updateDoc(doc(db, "tasks", taskId), {
      schedule: updatedSchedule,
    });
  } catch (error) {
    console.error("Error updating checkbox:", error);
    statusBanner.textContent = "Checkbox update failed. Please try again.";
    statusBanner.classList.add("error");
  }
}

async function deleteTask(taskId) {
  const confirmed = window.confirm("Delete this task permanently?");

  if (!confirmed) {
    return;
  }

  try {
    await deleteDoc(doc(db, "tasks", taskId));
  } catch (error) {
    console.error("Error deleting task:", error);
    statusBanner.textContent = "Task deletion failed. Please try again.";
    statusBanner.classList.add("error");
  }
}

async function editTask(taskId) {
  const task = tasks.find((item) => item.id === taskId);

  if (!task) {
    return;
  }

  const nextText = window.prompt("Edit task text:", task.text);

  if (nextText === null) {
    return;
  }

  const trimmedText = nextText.trim();

  if (!trimmedText) {
    window.alert("Task text cannot be empty.");
    return;
  }

  try {
    await updateDoc(doc(db, "tasks", taskId), {
      text: trimmedText,
    });
  } catch (error) {
    console.error("Error editing task:", error);
    statusBanner.textContent = "Task edit failed. Please try again.";
    statusBanner.classList.add("error");
  }
}

function renderTasks() {
  const today = getTodayDate();
  const filteredTasks = filterTasksByDate(selectedDate);
  const showingToday = selectedDate === today;

  updateDashboardStats(today, filteredTasks.length);

  activeDateLabel.textContent = showingToday
    ? "Today"
    : formatLongDate(selectedDate);

  todaySummary.textContent = showingToday
    ? `${filteredTasks.length} task${filteredTasks.length === 1 ? "" : "s"} scheduled for today's review.`
    : `${filteredTasks.length} task${filteredTasks.length === 1 ? "" : "s"} scheduled for ${formatLongDate(selectedDate)}.`;

  resultsTitle.textContent = showingToday
    ? "Today's reviews"
    : `Reviews for ${formatLongDate(selectedDate)}`;

  resultsCount.textContent = `${filteredTasks.length} task${filteredTasks.length === 1 ? "" : "s"}`;
  emptyState.classList.toggle("hidden", filteredTasks.length > 0);

  taskList.innerHTML = filteredTasks
    .map((task) => renderTaskCard(task, selectedDate))
    .join("");
}

function updateDashboardStats(today, todayCount) {
  totalTasks.textContent = String(tasks.length);
  todayTasks.textContent = String(todayCount);
  completedTasks.textContent = String(
    tasks.filter((task) => isTaskFullyCompleted(task)).length
  );

  if (selectedDate !== today) {
    todayTasks.textContent = String(filterTasksByDate(today).length);
  }
}

function renderTaskCard(task, activeDate) {
  const completedDays = task.schedule.filter((item) => item.completed).length;
  const totalDays = task.schedule.length;
  const progressPercent = Math.round((completedDays / totalDays) * 100);
  const fullyCompleted = isTaskFullyCompleted(task);
  const highlightedReview = task.schedule.find((item) => item.date === activeDate);

  return `
    <article class="task-card ${fullyCompleted ? "is-complete" : ""}">
      <div class="task-top">
        <div>
          <p class="task-created">Created on ${formatLongDate(task.createdDate)}</p>
          <h3 class="task-title">${escapeHtml(task.text)}</h3>
        </div>

        <div class="task-actions">
          <button
            type="button"
            class="icon-button"
            data-action="edit"
            data-task-id="${task.id}"
          >
            Edit
          </button>
          <button
            type="button"
            class="icon-button danger-button"
            data-action="delete"
            data-task-id="${task.id}"
          >
            Delete
          </button>
        </div>
      </div>

      <div class="task-meta">
        <span class="state-badge ${fullyCompleted ? "done" : "active"}">
          ${fullyCompleted ? "Fully completed" : "In progress"}
        </span>

        ${
          highlightedReview
            ? `
              <div class="today-emphasis ${highlightedReview.completed ? "is-complete" : ""}">
                <span>Today's repetition</span>
                <label class="focus-checkbox">
                  <input
                    type="checkbox"
                    data-task-id="${task.id}"
                    data-schedule-index="${task.schedule.findIndex((item) => item.date === activeDate)}"
                    ${highlightedReview.completed ? "checked" : ""}
                  />
                  <span>${highlightedReview.day} · ${highlightedReview.completed ? "Completed" : "Due now"}</span>
                </label>
              </div>
            `
            : ""
        }
      </div>

      <div class="progress-block">
        <div class="progress-labels">
          <span>Progress</span>
          <strong>${progressPercent}%</strong>
        </div>
        <div class="progress-track" aria-hidden="true">
          <div class="progress-fill" style="width: ${progressPercent}%"></div>
        </div>
        <p class="progress-caption">
          ${completedDays} of ${totalDays} review days completed
        </p>
      </div>

      <div class="schedule-grid">
        ${task.schedule
          .map((item, index) => {
            const isToday = item.date === activeDate;

            return `
              <label class="schedule-item ${item.completed ? "complete" : ""} ${isToday ? "today" : ""}">
                <input
                  type="checkbox"
                  data-task-id="${task.id}"
                  data-schedule-index="${index}"
                  ${item.completed ? "checked" : ""}
                />
                <span class="schedule-day">${item.day}</span>
                <span class="schedule-date">${formatShortDate(item.date)}</span>
              </label>
            `;
          })
          .join("")}
      </div>
    </article>
  `;
}

function isTaskFullyCompleted(task) {
  return task.schedule.every((item) => item.completed);
}

function getTodayDate() {
  return new Date().toLocaleDateString("en-CA");
}

function addDays(dateString, daysToAdd) {
  const date = new Date(`${dateString}T00:00:00`);
  date.setDate(date.getDate() + daysToAdd);
  return date.toLocaleDateString("en-CA");
}

function formatLongDate(dateString) {
  const date = new Date(`${dateString}T00:00:00`);

  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatShortDate(dateString) {
  const date = new Date(`${dateString}T00:00:00`);

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
