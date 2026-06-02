const state = {
  board: null,
  drag: null,
  lastBoardPoint: { x: 180, y: 180 },
};

const dom = {
  boardCanvas: document.querySelector("#board-canvas"),
  boardScroller: document.querySelector("#board-scroller"),
  emptyState: document.querySelector("#empty-state"),
  statusMessage: document.querySelector("#status-message"),
  shareUrl: document.querySelector("#share-url"),
  fileInput: document.querySelector("#file-input"),
  addNoteButton: document.querySelector("#add-note-button"),
  copyLinkButton: document.querySelector("#copy-link-button"),
  itemTemplate: document.querySelector("#item-template"),
};

function getBoardIdFromPath() {
  const match = window.location.pathname.match(/^\/boards\/([^/]+)$/);
  return match ? match[1] : null;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(options.headers || {}),
    },
    ...options,
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || "Request failed.");
  }

  return payload;
}

function setStatus(message) {
  dom.statusMessage.textContent = message;
}

function boardPointFromClient(clientX, clientY) {
  const rect = dom.boardCanvas.getBoundingClientRect();
  return {
    x: Math.max(32, Math.round(clientX - rect.left)),
    y: Math.max(32, Math.round(clientY - rect.top)),
  };
}

function formatBytes(size) {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function badgeText(item) {
  if (item.type === "note") {
    return "TEXT";
  }
  if (item.type === "image") {
    return "IMAGE";
  }
  return "FILE";
}

function createItemElement(item) {
  const fragment = dom.itemTemplate.content.cloneNode(true);
  const element = fragment.querySelector(".board-item");
  const header = fragment.querySelector(".item-header");
  const badge = fragment.querySelector(".item-badge");
  const title = fragment.querySelector(".item-title");
  const body = fragment.querySelector(".item-body");

  element.dataset.itemId = item.id;
  element.style.left = `${item.x}px`;
  element.style.top = `${item.y}px`;
  badge.textContent = badgeText(item);
  title.textContent = item.title;

  if (item.type === "note") {
    element.classList.add("note");
    const text = document.createElement("div");
    text.className = "note-text";
    text.textContent = item.text;
    body.append(text);
  } else {
    const contentUrl = `/api/boards/${state.board.id}/items/${item.id}/content`;
    const downloadUrl = `/api/boards/${state.board.id}/items/${item.id}/download`;

    if (item.type === "image") {
      const frame = document.createElement("div");
      frame.className = "image-frame";
      const image = document.createElement("img");
      image.src = contentUrl;
      image.alt = item.title;
      frame.append(image);
      body.append(frame);
    }

    const meta = document.createElement("div");
    meta.className = "file-meta";

    const name = document.createElement("div");
    name.className = "file-name";
    name.textContent = item.fileName;
    meta.append(name);

    const detail = document.createElement("div");
    detail.className = "file-detail";
    detail.textContent = `${item.mimeType} / ${formatBytes(item.size)}`;
    meta.append(detail);

    const actions = document.createElement("div");
    actions.className = "card-actions";

    if (item.type === "image") {
      const open = document.createElement("a");
      open.className = "link-button secondary";
      open.href = contentUrl;
      open.target = "_blank";
      open.rel = "noreferrer";
      open.textContent = "開く";
      actions.append(open);
    }

    const download = document.createElement("a");
    download.className = "link-button";
    download.href = downloadUrl;
    download.textContent = "ダウンロード";
    actions.append(download);

    body.append(meta, actions);
  }

  header.addEventListener("pointerdown", (event) => {
    const origin = boardPointFromClient(event.clientX, event.clientY);
    state.drag = {
      itemId: item.id,
      offsetX: origin.x - item.x,
      offsetY: origin.y - item.y,
      element,
    };

    element.classList.add("dragging");
    header.setPointerCapture(event.pointerId);
  });

  return element;
}

function renderBoard() {
  const items = state.board?.items || [];
  dom.boardCanvas.querySelectorAll(".board-item").forEach((node) => node.remove());

  items.forEach((item) => {
    dom.boardCanvas.append(createItemElement(item));
  });

  dom.emptyState.classList.toggle("hidden", items.length > 0);
}

async function ensureBoard() {
  const currentBoardId = getBoardIdFromPath();

  if (!currentBoardId) {
    const payload = await api("/api/boards", {
      method: "POST",
      body: JSON.stringify({ title: "Shared board" }),
    });

    window.history.replaceState({}, "", `/boards/${payload.board.id}`);
    return payload.board;
  }

  const payload = await api(`/api/boards/${currentBoardId}`);
  return payload.board;
}

async function refreshBoard() {
  state.board = await ensureBoard();
  dom.shareUrl.value = window.location.href;
  renderBoard();
  setStatus("ドラッグ、貼り付け、アップロードに対応しています。");
}

async function createNote(text, point = state.lastBoardPoint) {
  const payload = await api(`/api/boards/${state.board.id}/notes`, {
    method: "POST",
    body: JSON.stringify({
      text,
      x: point.x,
      y: point.y,
    }),
  });

  state.board = payload.board;
  renderBoard();
}

async function uploadFiles(files, point = state.lastBoardPoint) {
  if (!files.length) {
    return;
  }

  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));
  formData.append("x", String(point.x));
  formData.append("y", String(point.y));

  const payload = await api(`/api/boards/${state.board.id}/files`, {
    method: "POST",
    body: formData,
  });

  state.board = payload.board;
  renderBoard();
}

async function persistItemPosition(itemId, x, y) {
  await api(`/api/boards/${state.board.id}/items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify({ x, y }),
  });

  const item = state.board.items.find((candidate) => candidate.id === itemId);
  if (item) {
    item.x = x;
    item.y = y;
  }
}

document.addEventListener("pointermove", (event) => {
  if (event.target.closest("#board-canvas")) {
    state.lastBoardPoint = boardPointFromClient(event.clientX, event.clientY);
  }

  if (!state.drag) {
    return;
  }

  const point = boardPointFromClient(event.clientX, event.clientY);
  const x = Math.max(16, point.x - state.drag.offsetX);
  const y = Math.max(16, point.y - state.drag.offsetY);
  state.drag.element.style.left = `${x}px`;
  state.drag.element.style.top = `${y}px`;
});

document.addEventListener("pointerup", async (event) => {
  if (!state.drag) {
    return;
  }

  const point = boardPointFromClient(event.clientX, event.clientY);
  const x = Math.max(16, point.x - state.drag.offsetX);
  const y = Math.max(16, point.y - state.drag.offsetY);
  const drag = state.drag;

  state.drag = null;
  drag.element.classList.remove("dragging");

  try {
    setStatus("位置を保存しました。");
    await persistItemPosition(drag.itemId, x, y);
  } catch (error) {
    setStatus(error.message);
    await refreshBoard();
  }
});

dom.fileInput.addEventListener("change", async (event) => {
  const files = Array.from(event.target.files || []);
  if (!files.length) {
    return;
  }

  try {
    setStatus("ファイルを追加しています...");
    await uploadFiles(files);
    setStatus(`${files.length} 件のファイルを追加しました。`);
  } catch (error) {
    setStatus(error.message);
  } finally {
    dom.fileInput.value = "";
  }
});

dom.addNoteButton.addEventListener("click", async () => {
  const text = window.prompt("追加したいテキストを入力してください。");
  if (!text || !text.trim()) {
    return;
  }

  try {
    setStatus("テキストを追加しています...");
    await createNote(text.trim());
    setStatus("テキストを追加しました。");
  } catch (error) {
    setStatus(error.message);
  }
});

dom.copyLinkButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(window.location.href);
    setStatus("共有 URL をコピーしました。");
  } catch (_error) {
    dom.shareUrl.select();
    setStatus("URL を選択しました。コピーしてください。");
  }
});

["dragenter", "dragover"].forEach((eventName) => {
  dom.boardScroller.addEventListener(eventName, (event) => {
    event.preventDefault();
    dom.boardScroller.classList.add("dragover");
  });
});

["dragleave", "dragend"].forEach((eventName) => {
  dom.boardScroller.addEventListener(eventName, () => {
    dom.boardScroller.classList.remove("dragover");
  });
});

dom.boardScroller.addEventListener("drop", async (event) => {
  event.preventDefault();
  dom.boardScroller.classList.remove("dragover");

  const files = Array.from(event.dataTransfer?.files || []);
  if (!files.length) {
    return;
  }

  try {
    const point = boardPointFromClient(event.clientX, event.clientY);
    setStatus("ドロップされたファイルを追加しています...");
    await uploadFiles(files, point);
    setStatus(`${files.length} 件のファイルを追加しました。`);
  } catch (error) {
    setStatus(error.message);
  }
});

document.addEventListener("paste", async (event) => {
  const clipboardItems = Array.from(event.clipboardData?.items || []);
  if (!clipboardItems.length) {
    return;
  }

  const imageFiles = clipboardItems
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter(Boolean);

  if (imageFiles.length) {
    event.preventDefault();
    try {
      setStatus("貼り付け画像を追加しています...");
      await uploadFiles(imageFiles, state.lastBoardPoint);
      setStatus(`${imageFiles.length} 件の画像を追加しました。`);
    } catch (error) {
      setStatus(error.message);
    }
    return;
  }

  const text = event.clipboardData?.getData("text/plain")?.trim();
  if (!text) {
    return;
  }

  event.preventDefault();
  try {
    setStatus("貼り付けテキストを追加しています...");
    await createNote(text, state.lastBoardPoint);
    setStatus("テキストを追加しました。");
  } catch (error) {
    setStatus(error.message);
  }
});

window.addEventListener("load", async () => {
  try {
    await refreshBoard();
  } catch (error) {
    setStatus(error.message);
  }
});
