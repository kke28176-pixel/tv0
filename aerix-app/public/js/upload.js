/* ============================================================
   AERIX — 上傳頁邏輯
   ============================================================ */

let selectedFile = null;
let capturedThumbBlob = null;

function checkGate() {
  document.getElementById('login-gate').style.display = CURRENT_USER ? 'none' : 'block';
  document.getElementById('upload-form-wrap').style.display = CURRENT_USER ? 'block' : 'none';
  if (!CURRENT_USER) document.getElementById('gate-login-btn').onclick = () => openAuthModal('login');
  return CURRENT_USER;
}

function initUploadPage() {
  if (!checkGate()) return;

  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('video-file');
  dropzone.onclick = () => fileInput.click();
  dropzone.ondragover = (e) => { e.preventDefault(); dropzone.classList.add('dragover'); };
  dropzone.ondragleave = () => dropzone.classList.remove('dragover');
  dropzone.ondrop = (e) => { e.preventDefault(); dropzone.classList.remove('dragover'); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); };
  fileInput.onchange = () => { if (fileInput.files[0]) handleFile(fileInput.files[0]); };

  document.getElementById('cancel-upload').onclick = () => {
    selectedFile = null; capturedThumbBlob = null;
    document.getElementById('after-select').style.display = 'none';
    document.getElementById('dropzone').style.display = 'block';
    document.getElementById('upload-form').reset();
  };

  const customThumbBtn = document.getElementById('custom-thumb-btn');
  const customThumbInput = document.getElementById('custom-thumb-input');
  customThumbBtn.onclick = () => customThumbInput.click();
  customThumbInput.onchange = () => {
    const file = customThumbInput.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('請選擇圖片檔案。'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.getElementById('thumb-canvas');
        const ctx = canvas.getContext('2d');
        const targetRatio = canvas.width / canvas.height;
        const srcRatio = img.width / img.height;
        let sx, sy, sw, sh;
        if (srcRatio > targetRatio) { sh = img.height; sw = sh * targetRatio; sx = (img.width - sw) / 2; sy = 0; }
        else { sw = img.width; sh = sw / targetRatio; sx = 0; sy = (img.height - sh) / 2; }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(blob => { capturedThumbBlob = blob; }, 'image/jpeg', 0.85);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  document.getElementById('upload-form').onsubmit = handleSubmit;
}

function handleFile(file) {
  if (!file.type.startsWith('video/')) { alert('請選擇影片檔案（例如 .mp4, .webm）。'); return; }
  selectedFile = file;
  document.getElementById('dropzone').style.display = 'none';
  document.getElementById('after-select').style.display = 'block';

  const previewVideo = document.getElementById('preview-video');
  previewVideo.src = URL.createObjectURL(file);
  previewVideo.muted = true;
  previewVideo.addEventListener('loadeddata', () => {
    try { previewVideo.currentTime = Math.min(1, previewVideo.duration / 3); } catch (e) {}
  }, { once: true });
  previewVideo.addEventListener('seeked', captureThumbnail, { once: true });
}

function captureThumbnail() {
  const previewVideo = document.getElementById('preview-video');
  const canvas = document.getElementById('thumb-canvas');
  const ctx = canvas.getContext('2d');
  try {
    ctx.drawImage(previewVideo, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(blob => { if (!capturedThumbBlob) capturedThumbBlob = blob; }, 'image/jpeg', 0.8);
  } catch (e) {}
}

async function handleSubmit(e) {
  e.preventDefault();
  if (!CURRENT_USER) { openAuthModal('login'); return; }
  if (!selectedFile) { alert('請先選擇影片檔案。'); return; }

  const fd = new FormData(e.target);
  const title = fd.get('title').trim();
  if (!title) return;

  const submitBtn = e.target.querySelector('button[type=submit]');
  submitBtn.disabled = true;
  submitBtn.textContent = '上傳中...';
  const progressEl = document.getElementById('upload-progress');
  progressEl.style.display = 'block';
  progressEl.textContent = '正在上傳影片檔案，請稍候（大檔案可能需要幾分鐘）...';

  const previewVideo = document.getElementById('preview-video');
  const durationSeconds = Math.round(previewVideo.duration || 0);

  const form = new FormData();
  form.append('video', selectedFile);
  if (capturedThumbBlob) form.append('thumbnail', capturedThumbBlob, 'thumb.jpg');
  form.append('title', title);
  form.append('description', fd.get('description') || '');
  form.append('visibility', fd.get('visibility'));
  form.append('durationSeconds', String(durationSeconds));

  try {
    const { video } = await api.upload('/api/videos', form);
    location.href = `watch.html?v=${video.id}`;
  } catch (err) {
    alert('上傳失敗：' + err.message);
    submitBtn.disabled = false;
    submitBtn.textContent = '發布';
    progressEl.style.display = 'none';
  }
}

(async function () {
  await initLayout('you', '');
  initUploadPage();
})();
