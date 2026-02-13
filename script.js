document.addEventListener("DOMContentLoaded", () => {
  // Chỉ còn 2 mệnh giá: 100k (70%) và 200k (30%)
  const vouchers = [
    { amount: 100000, weight: 70, message: "Năm 2026 bung lụa – Mua iPhone giá quá đã!" },
    { amount: 200000, weight: 30, message: "Phát tài phát lộc – Chốt máy là hết sẩy!" }
  ];

  const wishes = [
    "Chúc bạn Tết rực rỡ, quẹt là trúng!",
    "Mở lì xì là chốt đơn, vui như pháo hoa!",
    "Vía tốt đến tay, săn máy giá mê say!",
    "Ăn Tết thật xôm, trúng quẻ cực om!",
    "Xuân sang lộc tới, chốt deal hết sẩy!"
  ];

  const fomoNames = [
    "Anh Minh", "Chị Lan", "Đức Huy", "Trang", "Anh Đức", "My", "Vũ Khôi", "Nguyễn Vy"
  ];

  const drawBtn = document.getElementById("drawBtn");
  const ruleBtn = document.getElementById("ruleBtn");
  const modal = document.getElementById("voucherModal");
  const amountEl = document.getElementById("voucherAmount");
  const messageEl = document.getElementById("voucherMessage");
  const wishEl = document.getElementById("voucherWish");
  const closeBtn = document.getElementById("closeModal");
  const claimZaloBtn = document.getElementById("claimZalo");
  const checkoutBtn = document.getElementById("checkoutNow");
  const envelope = document.getElementById("envelope");
  const overlay = modal.querySelector("[data-close]");
  const rulesSection = document.getElementById("rules");
  const fomoTicker = document.getElementById("fomoTicker");
  const fortuneScene = document.querySelector(".fortune-box__scene");
  const nameInput = document.getElementById("customerName");
  const phoneInput = document.getElementById("customerPhone");
  const codeInput = document.getElementById("customerCode");
  const getCodeBtn = document.getElementById("getCodeBtn");
  const verifyCodeBtn = document.getElementById("verifyCodeBtn");
  const formStatus = document.getElementById("formStatus");

  let verifiedCode = null;
  let isSubmitting = false;

  // Load sheet values via Vercel serverless API to keep the key hidden
  async function fetchSheetValues(range = "Trang1!A2:C50") {
    try {
      const res = await fetch(`/api/sheet-data?range=${encodeURIComponent(range)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không đọc được Google Sheets");
      return data.values || [];
    } catch (err) {
      console.warn("Sheet fetch failed:", err.message);
      return [];
    }
  }

  function formatAmount(number) {
    return number.toLocaleString("vi-VN") + "đ";
  }

  function weightedPick(items) {
    const total = items.reduce((sum, item) => sum + item.weight, 0);
    let r = Math.random() * total;
    for (const item of items) {
      if (r < item.weight) return item;
      r -= item.weight;
    }
    return items[items.length - 1];
  }

  function openModal(voucher, options = {}) {
    amountEl.textContent = formatAmount(voucher.amount);
    messageEl.textContent = voucher.message;
    wishEl.textContent = options.wish || wishes[Math.floor(Math.random() * wishes.length)];
    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");

    envelope.classList.remove("pop");
    requestAnimationFrame(() => {
      envelope.classList.add("pop");
    });
  }

  function closeModal() {
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
  }

  function runFomoTicker() {
    const pickName = fomoNames[Math.floor(Math.random() * fomoNames.length)];
    const pickVoucher = weightedPick(vouchers);
    fomoTicker.textContent = `${pickName} vừa trúng ${formatAmount(pickVoucher.amount)}`;
  }

  function triggerShake() {
    if (!fortuneScene) return;
    fortuneScene.classList.remove("shake-strong");
    void fortuneScene.offsetWidth;
    fortuneScene.classList.add("shake-strong");
    setTimeout(() => {
      fortuneScene.classList.remove("shake-strong");
    }, 1000);
  }

  function setDrawButtonState(disabled, label) {
    drawBtn.disabled = disabled;
    if (label) drawBtn.textContent = label;
  }

  function setStatus(message, tone = "info") {
    if (!formStatus) return;
    formStatus.textContent = message || "";
    formStatus.style.color = tone === "error" ? "#ffb3b3" : "#ffe9c7";
  }

  async function callApi(path, payload) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Có lỗi xảy ra");
    return data;
  }

  async function handleGetCode() {
    if (isSubmitting) return;
    const name = nameInput?.value.trim();
    const phone = phoneInput?.value.trim();
    if (!name || !phone) {
      setStatus("Nhập họ tên và SĐT để lấy mã", "error");
      return;
    }
    isSubmitting = true;
    setStatus("Đang tạo mã...");
    getCodeBtn.disabled = true;
    try {
      const data = await callApi("/api/register", { name, phone });
      const code = (data.code || "").toString().toUpperCase();
      if (codeInput) codeInput.value = code;
      setStatus(`Mã của bạn: ${code}`);
    } catch (err) {
      setStatus(err.message, "error");
    } finally {
      isSubmitting = false;
      getCodeBtn.disabled = false;
    }
  }

  async function handleVerifyCode() {
    if (isSubmitting) return;
    const code = codeInput?.value.trim().toUpperCase();
    if (!code || code.length < 4) {
      setStatus("Nhập mã 6 ký tự", "error");
      return;
    }
    isSubmitting = true;
    setStatus("Đang xác thực mã...");
    verifyCodeBtn.disabled = true;
    setDrawButtonState(true);
    try {
      await callApi("/api/redeem", { code });
      verifiedCode = code;
      setDrawButtonState(false, "GIEO QUẺ NGAY");
      setStatus("Mã hợp lệ, bạn có 1 lượt quay!");
    } catch (err) {
      verifiedCode = null;
      setStatus(err.message, "error");
    } finally {
      isSubmitting = false;
      verifyCodeBtn.disabled = false;
    }
  }

  async function logVoucher(voucher) {
    if (!verifiedCode) return;
    try {
      await callApi("/api/log-voucher", {
        code: verifiedCode,
        amount: voucher.amount,
        message: voucher.message,
        name: nameInput?.value?.trim() || "",
        phone: phoneInput?.value?.trim() || ""
      });
    } catch (err) {
      // Chỉ log lỗi, không chặn UI
      console.warn("Không ghi được voucher:", err.message);
    }
  }

  function handleDraw() {
    if (!verifiedCode) {
      setStatus("Hãy xác thực mã trước khi quay", "error");
      return;
    }

    if (fortuneScene) {
      fortuneScene.classList.add("spinning");
      setTimeout(() => fortuneScene.classList.remove("spinning"), 1000);
    }

    triggerShake();

    setTimeout(() => {
      const voucher = weightedPick(vouchers);
      openModal(voucher);
      logVoucher(voucher);
      setDrawButtonState(true, "ĐÃ QUAY");
    }, 1000);
  }

  drawBtn.addEventListener("click", handleDraw);
  closeBtn.addEventListener("click", closeModal);
  overlay.addEventListener("click", closeModal);
  getCodeBtn.addEventListener("click", handleGetCode);
  verifyCodeBtn.addEventListener("click", handleVerifyCode);

  ruleBtn.addEventListener("click", () => {
    rulesSection.scrollIntoView({ behavior: "smooth" });
  });

  claimZaloBtn.addEventListener("click", () => {
    window.open("https://zalo.me/", "_blank");
  });

  checkoutBtn.addEventListener("click", () => {
    window.open("https://www.apple.com/vn/iphone/", "_blank");
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal.classList.contains("show")) {
      closeModal();
    }
  });

  runFomoTicker();
  setInterval(runFomoTicker, 10000);

  // Demo: lấy mẫu dữ liệu Google Sheets (ẩn key nhờ serverless API)
  fetchSheetValues().then((values) => {
    if (values.length) {
      console.log("Sheet sample", values.slice(0, 3));
    }
  });
});
