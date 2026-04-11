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
import {
  deleteObject,
  getDownloadURL,
  getStorage,
  ref,
  uploadBytes,
} from "https://www.gstatic.com/firebasejs/12.12.0/firebase-storage.js";

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
const storage = getStorage(app);
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
let currentView = "active";
let toastTimeoutId = null;

const taskForm = document.getElementById("taskForm");
const taskInput = document.getElementById("taskInput");
const taskImageInput = document.getElementById("taskImageInput");
const imagePreview = document.getElementById("imagePreview");
const previewImage = document.getElementById("previewImage");
const clearImageBtn = document.getElementById("clearImageBtn");
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
const activeViewBtn = document.getElementById("activeViewBtn");
const doneViewBtn = document.getElementById("doneViewBtn");
const toastMessage = document.getElementById("toastMessage");

init();

function init() {
  dateFilter.value = selectedDate;
  attachEvents();
  subscribeToTasks();
  startTaskTimer();
}

function attachEvents() {
  taskForm.addEventListener("submit", handleTaskSubmit);
  taskImageInput.addEventListener("change", handleImageSelection);
  clearImageBtn.addEventListener("click", clearSelectedImage);
  dateFilter.addEventListener("change", handleDateFilterChange);
  showTodayBtn.addEventListener("click", showToday);
  activeViewBtn.addEventListener("click", () => setCurrentView("active"));
  doneViewBtn.addEventListener("click", () => setCurrentView("done"));
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
  const selectedImage = taskImageInput.files[0];

  if (!text) {
    window.alert("Please enter a task before adding it.");
    return;
  }

  try {
    statusBanner.textContent = "Saving task to Firestore...";
    const task = createTask(text);
    const docRef = await addDoc(tasksCollection, task);
    const updates = { id: docRef.id };

    // Upload the optional image after the task document exists.
    if (selectedImage) {
      try {
        const imageUpload = await uploadTaskImage(docRef.id, selectedImage);
        updates.imageUrl = imageUpload.imageUrl;
        updates.imagePath = imageUpload.imagePath;
      } catch (uploadError) {
        console.error("Error uploading image:", uploadError);
        statusBanner.textContent =
          "Task saved, but the image upload failed. Please try another image.";
        statusBanner.classList.add("error");
      }
    }

    // Store the Firestore document id and optional image metadata on the task.
    await updateDoc(docRef, updates);

    taskForm.reset();
    clearSelectedImage();
    showToday();
    taskInput.focus();
  } catch (error) {
    console.error("Error adding task:", error);
    statusBanner.textContent = "Task could not be saved. Please try again.";
    statusBanner.classList.add("error");
  }
}

function handleImageSelection(event) {
  const file = event.target.files[0];

  if (!file) {
    clearSelectedImage();
    return;
  }

  if (!file.type.startsWith("image/")) {
    window.alert("Please choose a valid image file.");
    clearSelectedImage();
    return;
  }

  const reader = new FileReader();

  reader.onload = () => {
    previewImage.src = reader.result;
    imagePreview.classList.remove("hidden");
  };

  reader.readAsDataURL(file);
}

function clearSelectedImage() {
  taskImageInput.value = "";
  previewImage.removeAttribute("src");
  imagePreview.classList.add("hidden");
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

function setCurrentView(viewName) {
  currentView = viewName;
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

  // The task keeps the original learning fields plus optional image metadata.
  return {
    id: "",
    text,
    createdDate,
    schedule: generateSchedule(createdDate),
    imageUrl: "",
    imagePath: "",
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

function isTaskDoneForDate(task, dateString) {
  return task.schedule.some(
    (item) => item.date === dateString && item.completed
  );
}

async function toggleCheckbox(taskId, scheduleIndex) {
  const task = tasks.find((item) => item.id === taskId);

  if (!task || Number.isNaN(scheduleIndex) || !task.schedule[scheduleIndex]) {
    return;
  }

  const selectedScheduleItem = task.schedule[scheduleIndex];
  const nextCompletedState = !selectedScheduleItem.completed;

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

    if (nextCompletedState && selectedScheduleItem.date === selectedDate) {
      showToast(`"${task.text}" moved to Done.`);
    }
  } catch (error) {
    console.error("Error updating checkbox:", error);
    statusBanner.textContent = "Checkbox update failed. Please try again.";
    statusBanner.classList.add("error");
  }
}

async function deleteTask(taskId) {
  const confirmed = window.confirm("Delete this task permanently?");
  const task = tasks.find((item) => item.id === taskId);

  if (!confirmed) {
    return;
  }

  try {
    if (task?.imagePath) {
      try {
        await deleteObject(ref(storage, task.imagePath));
      } catch (storageError) {
        console.error("Error deleting image from storage:", storageError);
      }
    }

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
  const pendingTasks = filteredTasks.filter(
    (task) => !isTaskDoneForDate(task, selectedDate)
  );
  const doneTasks = filteredTasks.filter((task) =>
    isTaskDoneForDate(task, selectedDate)
  );
  const showingToday = selectedDate === today;

  updateDashboardStats(today, filteredTasks.length);

  activeDateLabel.textContent = showingToday
    ? "Today"
    : formatLongDate(selectedDate);

  todaySummary.textContent = showingToday
    ? `${filteredTasks.length} task${filteredTasks.length === 1 ? "" : "s"} scheduled for today's review.`
    : `${filteredTasks.length} task${filteredTasks.length === 1 ? "" : "s"} scheduled for ${formatLongDate(selectedDate)}.`;

  const tasksToRender = currentView === "active" ? pendingTasks : doneTasks;
  const titlePrefix = currentView === "active" ? "Reviews" : "Done reviews";

  resultsTitle.textContent = showingToday
    ? currentView === "active"
      ? "Today's reviews"
      : "Today's completed reviews"
    : `${titlePrefix} for ${formatLongDate(selectedDate)}`;

  resultsCount.textContent = `${tasksToRender.length} task${tasksToRender.length === 1 ? "" : "s"}`;
  emptyState.classList.toggle("hidden", filteredTasks.length > 0);
  emptyState.textContent =
    currentView === "active"
      ? "No active tasks are scheduled for this date yet."
      : "No completed tasks for this date yet.";

  activeViewBtn.classList.toggle("is-active", currentView === "active");
  doneViewBtn.classList.toggle("is-active", currentView === "done");

  taskList.innerHTML = tasksToRender.length
    ? tasksToRender.map((task) => renderTaskCard(task, selectedDate)).join("")
    : "";
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
  const timerState = getTaskTimerState(highlightedReview);

  return `
    <article class="task-card ${fullyCompleted ? "is-complete" : ""}">
      ${
        task.imageUrl
          ? `
            <div class="task-image-wrap">
              <img class="task-image" src="${escapeHtml(task.imageUrl)}" alt="${escapeHtml(task.text)}" />
            </div>
          `
          : ""
      }

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
        <div class="task-status-stack">
          <span class="state-badge ${fullyCompleted ? "done" : "active"}">
            ${fullyCompleted ? "Fully completed" : "In progress"}
          </span>
          ${
            timerState
              ? `<span class="timer-badge ${timerState.kind}">${timerState.label}</span>`
              : ""
          }
        </div>

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

function getTaskTimerState(scheduleItem) {
  if (!scheduleItem) {
    return null;
  }

  if (scheduleItem.completed) {
    return { kind: "done", label: "Completed for this day" };
  }

  const now = new Date();
  const start = new Date(`${scheduleItem.date}T00:00:00`);
  const end = new Date(`${scheduleItem.date}T23:59:59`);

  if (now < start) {
    return {
      kind: "upcoming",
      label: `Starts in ${formatTimeDistance(start.getTime() - now.getTime())}`,
    };
  }

  if (now <= end) {
    return {
      kind: "urgent",
      label: `Time left ${formatTimeDistance(end.getTime() - now.getTime())}`,
    };
  }

  return {
    kind: "overdue",
    label: `Overdue by ${formatTimeDistance(now.getTime() - end.getTime())}`,
  };
}

function formatTimeDistance(milliseconds) {
  const totalMinutes = Math.max(1, Math.floor(milliseconds / 60000));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `${days}d ${hours}h`;
  }

  return `${hours}h ${minutes}m`;
}

function startTaskTimer() {
  window.setInterval(() => {
    if (tasks.length > 0) {
      renderTasks();
    }
  }, 60000);
}

function showToast(message) {
  toastMessage.textContent = message;
  toastMessage.classList.remove("hidden");
  toastMessage.classList.add("is-visible");

  if (toastTimeoutId) {
    window.clearTimeout(toastTimeoutId);
  }

  toastTimeoutId = window.setTimeout(() => {
    toastMessage.classList.remove("is-visible");
    toastMessage.classList.add("hidden");
  }, 2600);
}

async function uploadTaskImage(taskId, file) {
  const fileName = `${Date.now()}-${file.name.replace(/\s+/g, "-")}`;
  const imagePath = `tasks/${taskId}/${fileName}`;
  const imageRef = ref(storage, imagePath);

  await uploadBytes(imageRef, file);
  const imageUrl = await getDownloadURL(imageRef);

  return { imagePath, imageUrl };
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
