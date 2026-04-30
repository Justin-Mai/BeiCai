/**
 * 头像裁剪模块
 * 支持从相册选择图片，拖动定位，圆形裁剪
 */

let img = null;
let imgX = 0;
let imgY = 0;
let imgScale = 1;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let imgStartX = 0;
let imgStartY = 0;
let canvasWidth = 0;
let canvasHeight = 0;
let circleSize = 250;

const canvas = document.getElementById('avatarCropCanvas');
const ctx = canvas ? canvas.getContext('2d') : null;
const overlay = document.getElementById('cropCircleOverlay');

/**
 * 初始化头像选择和裁剪功能
 * @param {Function} onCropDone - 裁剪完成后的回调，参数为 base64 dataURL
 */
export function initAvatarCrop(onCropDone) {
    const avatarPreviewWrap = document.getElementById('avatarPreviewWrap');
    const fileInput = document.getElementById('avatarFileInput');
    const cropModal = document.getElementById('avatarCropModal');
    const closeCropBtn = document.getElementById('closeCropModal');
    const confirmCropBtn = document.getElementById('confirmCropBtn');

    if (!avatarPreviewWrap || !fileInput || !cropModal) return;

    // 点击头像触发文件选择
    avatarPreviewWrap.onclick = () => {
        fileInput.click();
    };

    // 文件选择后打开裁剪
    fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            img = new Image();
            img.onload = () => {
                openCropModal();
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
        fileInput.value = '';
    };

    // 关闭裁剪
    if (closeCropBtn) {
        closeCropBtn.onclick = () => {
            cropModal.classList.remove('active');
            img = null;
        };
    }

    // 确认裁剪
    if (confirmCropBtn) {
        confirmCropBtn.onclick = () => {
            const dataUrl = cropImage();
            if (dataUrl && onCropDone) {
                onCropDone(dataUrl);
            }
            cropModal.classList.remove('active');
        };
    }

    // 拖动
    if (canvas) {
        canvas.addEventListener('touchstart', onTouchStart, { passive: false });
        canvas.addEventListener('touchmove', onTouchMove, { passive: false });
        canvas.addEventListener('touchend', onTouchEnd);

        canvas.addEventListener('mousedown', onMouseDown);
        canvas.addEventListener('mousemove', onMouseMove);
        canvas.addEventListener('mouseup', onMouseUp);
        canvas.addEventListener('mouseleave', onMouseUp);

        // 缩放（滚轮）
        canvas.addEventListener('wheel', onWheel, { passive: false });
    }
}

function openCropModal() {
    const cropModal = document.getElementById('avatarCropModal');
    if (!cropModal || !canvas || !ctx || !img) return;

    cropModal.classList.add('active');

    // 等 DOM 渲染后设置 canvas 尺寸
    requestAnimationFrame(() => {
        const container = canvas.parentElement;
        canvasWidth = container.clientWidth;
        canvasHeight = container.clientHeight;

        // 高 DPI 支持
        const dpr = window.devicePixelRatio || 1;
        canvas.width = canvasWidth * dpr;
        canvas.height = canvasHeight * dpr;
        canvas.style.width = canvasWidth + 'px';
        canvas.style.height = canvasHeight + 'px';
        ctx.scale(dpr, dpr);

        // 让圆形裁剪区域自适应
        circleSize = Math.min(canvasWidth, canvasHeight) * 0.7;
        if (overlay) {
            overlay.style.width = circleSize + 'px';
            overlay.style.height = circleSize + 'px';
        }

        // 初始缩放：让图片刚好覆盖圆形区域
        const imgMinDim = Math.min(img.width, img.height);
        imgScale = circleSize / imgMinDim;

        // 居中
        imgX = (canvasWidth - img.width * imgScale) / 2;
        imgY = (canvasHeight - img.height * imgScale) / 2;

        drawCanvas();
    });
}

function drawCanvas() {
    if (!ctx || !img) return;
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.drawImage(img, imgX, imgY, img.width * imgScale, img.height * imgScale);
}

function cropImage() {
    if (!img) return null;

    const outSize = 200; // 输出尺寸
    const outCanvas = document.createElement('canvas');
    outCanvas.width = outSize;
    outCanvas.height = outSize;
    const outCtx = outCanvas.getContext('2d');

    // 圆形裁剪
    outCtx.beginPath();
    outCtx.arc(outSize / 2, outSize / 2, outSize / 2, 0, Math.PI * 2);
    outCtx.clip();

    // 计算源区域：从 canvas 中心的圆形区域映射到输出
    const centerX = canvasWidth / 2;
    const centerY = canvasHeight / 2;
    const radius = circleSize / 2;

    // 源图片中对应圆形区域的坐标
    const srcX = (centerX - radius - imgX) / imgScale;
    const srcY = (centerY - radius - imgY) / imgScale;
    const srcSize = circleSize / imgScale;

    outCtx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, outSize, outSize);

    return outCanvas.toDataURL('image/jpeg', 0.8);
}

// 触摸事件
function onTouchStart(e) {
    e.preventDefault();
    const touch = e.touches[0];
    startDrag(touch.clientX, touch.clientY);
}

function onTouchMove(e) {
    e.preventDefault();
    const touch = e.touches[0];
    doDrag(touch.clientX, touch.clientY);
}

function onTouchEnd() {
    isDragging = false;
}

// 鼠标事件
function onMouseDown(e) {
    startDrag(e.clientX, e.clientY);
}

function onMouseMove(e) {
    doDrag(e.clientX, e.clientY);
}

function onMouseUp() {
    isDragging = false;
}

function onWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = imgScale * delta;

    // 限制缩放范围
    const minScale = circleSize / Math.max(img.width, img.height) * 0.5;
    const maxScale = circleSize / Math.min(img.width, img.height) * 3;
    if (newScale < minScale || newScale > maxScale) return;

    // 以 canvas 中心为缩放中心
    const cx = canvasWidth / 2;
    const cy = canvasHeight / 2;
    imgX = cx - (cx - imgX) * delta;
    imgY = cy - (cy - imgY) * delta;
    imgScale = newScale;

    drawCanvas();
}

function startDrag(clientX, clientY) {
    isDragging = true;
    const rect = canvas.getBoundingClientRect();
    dragStartX = clientX - rect.left;
    dragStartY = clientY - rect.top;
    imgStartX = imgX;
    imgStartY = imgY;
}

function doDrag(clientX, clientY) {
    if (!isDragging) return;
    const rect = canvas.getBoundingClientRect();
    const currentX = clientX - rect.left;
    const currentY = clientY - rect.top;

    imgX = imgStartX + (currentX - dragStartX);
    imgY = imgStartY + (currentY - dragStartY);

    drawCanvas();
}
