// @ts-nocheck

const DEFAULT_PIN = "admin";
const INACTIVITY_LIMIT_DAYS = 90;

// Base coupon cost & profit margin per coupon (INR)
const COUPON_BASE_PRICES = {
  UTIITSL: 100,
  NSDL: 107
};
const COUPON_PROFIT_MARGIN = {
  RETAILER: 8,
  DISTRIBUTOR: 5
};

let APPS_SCRIPT_URL = "";
let WHATSAPP_API_URL = "";
let RAZORPAY_PAYMENT_LINK = "";

let GLOBAL_USERS = [];

let GLOBAL_OFFICERS = [
  {
    userId: "OFC202688192",
    password: DEFAULT_PIN,
    name: "Debajit Biswas (Super Officer)",
    phone: "9876543210",
    email: "biswascybercafe88@gmail.com",
    role: "SUPER_OFFICER",
    isFirstLogin: false,
    permissions: ["PERM_CHANNEL_REG", "PERM_PAN_PROCESS", "PERM_NETWORK_COUPONS", "PERM_SETTINGS", "PERM_COMPLAINTS", "PERM_OFFICERS_MGMT"]
  }
];

let GLOBAL_APPLICATIONS = [];
let GLOBAL_COMPLAINTS = [];
let GLOBAL_CHANNEL_REGISTRATIONS = [];
let GLOBAL_COUPON_REQUESTS = [];
let GLOBAL_ACTIVITY_LOGS = [];
let PUBLIC_MOBILE_COUPONS = {};

let OFFICER_CONFIGURED_IDS = [
  { idCode: "UTI_PSA", appName: "UTIITSL PSA Portal App" },
  { idCode: "NSDL_SMART", appName: "Smart NSDL Branch Node" },
  { idCode: "RECHARGE_DIST", appName: "Multi-Recharge Fast Dist App" }
];

const DOB_PROOF_OPTIONS = [
  "--- Select DOB/DOI Proof ---",
  "Affidavit sworn before Magistrate stating Date of Birth (In Copy)",
  "Birth Certificate issued by Municipal Authority or any office authorized to issue Birth & Death Certificate by Registrar of Birth and Deaths or the Indian Consulate (In Copy)",
  "Central Govt Health Scheme Card or Ex serviceman Contributory Health Scheme photo card (In Copy)",
  "Domicile certificate issued by Government (In Copy)",
  "Driving License (In Copy)",
  "Marriage Certificate issued by Registrar of Marriages (In Copy)",
  "Matriculation certificate or mark sheet of recognised board (In Copy)",
  "Passport (In Copy)",
  "Pension payment order (In Copy)",
  "Photo ID card issued by Central Govt or State Govt or a Public Sector undertaking or State Public sector undertaking (In Copy)",
  "Voters ID card (In Copy)"
];

let GLOBAL_SETTINGS = {
  brand_title: "BISWAS DIGITAL",
  brand_sub: "Enterprise Smart Portal",
  brand_logo: "",
  whatsapp_api_url: "",
  razorpay_payment_link: "",
  apk_download_url: "BiswasDigital.apk",
  hero_title: "Next-Gen Digital Operations & Coupon Network",
  hero_desc: "Authorized distributor network delivering Smart NSDL without OTP/Biometrics, UTIITSL offline processing, correction engine, and automated coupon float allocation.",
  broadcast_notice: "Welcome to Biswas Enterprise Portal! All services are active and running securely.",
  business_whatsapp: "919876543210",
  whatsapp_pre_msg: "Hello Debajit Sir, I want to inquire about PAN Services and Distributor Onboarding.",
  company_phone: "+91 9876543210",
  company_email: "biswascybercafe88@gmail.com"
};

let ACTIVE_USER_SESSION = null;
let PENDING_FIRST_LOGIN_USER = null;
let VERIFIED_PUBLIC_MOBILE = null;
let VERIFIED_CORR_PUBLIC_MOBILE = null;
let TEMP_UPLOADED_LOGO_DATA = "";
let PENDING_RAZORPAY_ORDER = null;

// ================= NEW RETAILER SELF-REGISTRATION (PIN ROUTING) =================
window.openRetailerSelfRegModal = function() {
  document.getElementById("retailerSelfRegForm")?.reset();
  if (document.getElementById("selfRegRoutePreview")) {
    document.getElementById("selfRegRoutePreview").value = "Enter 6-digit PIN";
  }
  document.getElementById("retailerSelfRegModal")?.classList.add("open");
};

window.closeRetailerSelfRegModal = function() {
  document.getElementById("retailerSelfRegModal")?.classList.remove("open");
};

function findDistributorByPinCode(pinCode) {
  const cleanPin = String(pinCode || "").trim();
  if (cleanPin.length !== 6) return null;
  return GLOBAL_USERS.find(u => {
    if (u.role !== "DISTRIBUTOR" || u.userStatus === "REJECTED" || !u.territoryValue) return false;
    const pins = String(u.territoryValue).split(",").map(p => p.trim());
    return pins.includes(cleanPin);
  }) || null;
}

window.checkSelfRegPinDistributor = function(pinVal) {
  const previewEl = document.getElementById("selfRegRoutePreview");
  if (!previewEl) return;
  const cleanPin = String(pinVal || "").trim();
  if (cleanPin.length !== 6) {
    previewEl.value = "Enter 6-digit PIN";
    return;
  }
  const dist = findDistributorByPinCode(cleanPin);
  if (dist) {
    previewEl.value = `Distributor: ${dist.name} (${dist.userId})`;
  } else {
    previewEl.value = "No Distributor -> Routes to Admin";
  }
};

function initRetailerSelfRegistration() {
  document.getElementById("retailerSelfRegForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const pin = document.getElementById("selfRegPin")?.value.trim();
    const name = document.getElementById("selfRegName")?.value.trim().toUpperCase();
    const phone = document.getElementById("selfRegPhone")?.value.trim();
    const email = document.getElementById("selfRegEmail")?.value.trim();
    const pan = document.getElementById("selfRegPan")?.value.trim().toUpperCase();
    const idNo = document.getElementById("selfRegIdNo")?.value.trim();
    const address = document.getElementById("selfRegAddress")?.value.trim();

    if (!/^[0-9]{6}$/.test(pin)) return showToast("Enter valid 6-digit PIN code.", "error");
    if (!name || name.length < 3) return showToast("Enter valid Full Name.", "error");
    if (!/^[0-9]{10}$/.test(phone)) return showToast("Enter valid 10-digit Mobile.", "error");
    if (!email || !email.includes("@")) return showToast("Enter valid Email ID.", "error");
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan)) return showToast("Enter valid 10-char PAN.", "error");
    if (!/^[0-9]{12}$/.test(idNo)) return showToast("Enter valid 12-digit ID Number.", "error");

    const dupMsg = findDuplicateUserField(phone, email, idNo);
    if (dupMsg) return alert(`Duplicate Account Blocked:\n${dupMsg}`);

    const matchedDist = findDistributorByPinCode(pin);
    const parentRouteId = matchedDist ? matchedDist.userId : "ADMIN";
    const newRetId = generate9DigitUserId("RETAILER");
    const newRetPass = generateAutoPassword();
    const nowIso = new Date().toISOString();

    const newRetailer = {
      userId: newRetId,
      password: newRetPass,
      name,
      role: "RETAILER",
      coupons: 0,
      parentId: parentRouteId,
      phone,
      email,
      aadhaar: idNo,
      pan,
      pinCode: pin,
      address,
      userStatus: "KYC_PENDING",
      rejectionReason: "",
      lastActiveAt: nowIso,
      isFirstLogin: true,
      territoryType: "NONE",
      territoryValue: ""
    };

    GLOBAL_USERS.push(newRetailer);
    await pushToGoogleSheets("ADD_USER", newRetailer);

    const regId = "REG" + generateRandomDigits(9);
    const regRecord = {
      regId,
      date: new Date().toLocaleDateString(),
      accountRole: "RETAILER",
      applicantName: name,
      phone,
      email,
      shop: name,
      idCode: "RETAILER_SELF",
      appName: "Retailer Portal",
      pincode: pin,
      address,
      pan,
      assignedParentId: parentRouteId,
      status: "PENDING",
      rejectionReason: ""
    };
    GLOBAL_CHANNEL_REGISTRATIONS.unshift(regRecord);
    await pushToGoogleSheets("ADD_REGISTRATION", regRecord);

    await logPortalActivity(
      phone,
      "PUBLIC_SELF_REG",
      "New Retailer Self Registration",
      `${name} (${newRetId}) • PIN: ${pin} → Routed to ${matchedDist ? `${matchedDist.name} (${matchedDist.userId})` : "ADMIN"}`
    );

    closeRetailerSelfRegModal();
    renderOfficerRetailerList();
    renderChannelRegistrationsQueue();
    updateDashboardKpis();

    showSuccessModal(
      name,
      newRetId,
      matchedDist
        ? `Request sent to Distributor ${matchedDist.name} (${matchedDist.userId}) for PIN ${pin}.`
        : `No Distributor found for PIN ${pin}. Request sent to Admin.`
    );
  });
}

// ================= DIRECT COUPON REQUEST (AUTO AMOUNT + RAZORPAY REDIRECT) =================
window.openCouponRequestModal = function() {
  if (!ACTIVE_USER_SESSION) return showToast("Please sign in first.", "error");
  if (!ensureKycApprovedOrBlock()) return;
  recalculateCouponRequestTotal();
  document.getElementById("couponRequestModal")?.classList.add("open");
};

window.closeCouponRequestModal = function() {
  document.getElementById("couponRequestModal")?.classList.remove("open");
};

window.recalculateCouponRequestTotal = function() {
  const portal = document.getElementById("coupReqPortalSelect")?.value || "UTIITSL";
  const qty = Math.max(1, Number(document.getElementById("coupReqQtyInput")?.value || 1));
  const liveUser = GLOBAL_USERS.find(u => u.userId === ACTIVE_USER_SESSION?.userId) || ACTIVE_USER_SESSION;
  const roleKey = liveUser?.role === "DISTRIBUTOR" ? "DISTRIBUTOR" : "RETAILER";

  const baseRate = COUPON_BASE_PRICES[portal] || 100;
  const marginRate = COUPON_PROFIT_MARGIN[roleKey] || 8;
  const unitRate = baseRate + marginRate;
  const totalAmount = unitRate * qty;

  if (document.getElementById("coupReqUnitRateDisplay")) {
    document.getElementById("coupReqUnitRateDisplay").value = `₹${unitRate} / Coupon`;
  }
  if (document.getElementById("coupReqAmountDisplay")) {
    document.getElementById("coupReqAmountDisplay").value = `₹${totalAmount}`;
  }
  if (document.getElementById("coupReqAmountInput")) {
    document.getElementById("coupReqAmountInput").value = String(totalAmount);
  }
};

function initCouponRequestEngine() {
  document.getElementById("directCouponRequestForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!ensureKycApprovedOrBlock()) return;

    recalculateCouponRequestTotal();
    const portal = document.getElementById("coupReqPortalSelect")?.value || "UTIITSL";
    const qty = Math.max(1, Number(document.getElementById("coupReqQtyInput")?.value || 1));
    const amount = Number(document.getElementById("coupReqAmountInput")?.value || 0);
    const rzpUrl = RAZORPAY_PAYMENT_LINK || GLOBAL_SETTINGS.razorpay_payment_link || "";

    const user = GLOBAL_USERS.find(u => u.userId === ACTIVE_USER_SESSION.userId) || ACTIVE_USER_SESSION;
    const reqId = "CPN" + generateRandomDigits(8);

    const reqRecord = {
      reqId,
      date: new Date().toLocaleDateString(),
      userId: user.userId,
      userName: user.name,
      role: user.role,
      portal,
      qty,
      amount,
      paymentMode: "RAZORPAY",
      status: "PENDING_PAYMENT"
    };

    GLOBAL_COUPON_REQUESTS.unshift(reqRecord);
    PENDING_RAZORPAY_ORDER = reqRecord;
    await pushToGoogleSheets("ADD_COUPON_REQUEST", reqRecord);
    await logPortalActivity(user.userId, user.role, "Coupon Request Submitted", `${qty} ${portal} Coupons • Total: ₹${amount} (${reqId})`);

    closeCouponRequestModal();
    renderOfficerCouponRequests();
    updateDashboardKpis();

    if (rzpUrl) {
      window.open(rzpUrl, "_blank");
      showToast(`Redirecting to Razorpay for ₹${amount} (${qty} Coupons)...`, "success");
    } else {
      alert(`Coupon Request Created (${reqId}) for ${qty} Coupons (₹${amount}). Please configure Razorpay Payment Link in Settings.`);
    }
  });

  // Auto-approve pending Razorpay coupon order when returning to portal after payment
  window.addEventListener("focus", async () => {
    if (!PENDING_RAZORPAY_ORDER) return;
    const order = PENDING_RAZORPAY_ORDER;
    PENDING_RAZORPAY_ORDER = null;

    const confirmPaid = confirm(`Did you complete the Razorpay payment of ₹${order.amount} for ${order.qty} Coupons (${order.reqId})?`);
    if (!confirmPaid) return;

    order.status = "APPROVED_AUTO_RAZORPAY";
    await pushToGoogleSheets("UPDATE_COUPON_REQUEST_STATUS", { reqId: order.reqId, status: "APPROVED_AUTO_RAZORPAY" });

    const targetUser = GLOBAL_USERS.find(u => u.userId === order.userId);
    if (targetUser) {
      targetUser.coupons = Number(targetUser.coupons || 0) + Number(order.qty || 0);
      await pushToGoogleSheets("UPDATE_USER_COUPONS", { userId: targetUser.userId, coupons: targetUser.coupons });
    }

    await logPortalActivity(order.userId, order.role, "Razorpay Payment Done — Coupon Auto-Approved", `+${order.qty} Pcs (₹${order.amount}) • ${order.reqId}`);
    updateSessionWalletUI();
    updateDashboardKpis();
    if (ACTIVE_USER_SESSION?.role === "DISTRIBUTOR") setupDistributorConsoleView(ACTIVE_USER_SESSION);
    renderOfficerCouponRequests();
    showSuccessModal(order.userName, order.reqId, `${order.qty} Coupons auto-approved after Razorpay payment!`);
  });
}

window.manualApproveCouponRequest = async function(reqId) {
  const item = GLOBAL_COUPON_REQUESTS.find(r => r.reqId === reqId);
  if (!item || String(item.status || "").startsWith("APPROVED")) return;

  item.status = "APPROVED_MANUAL";
  await pushToGoogleSheets("UPDATE_COUPON_REQUEST_STATUS", { reqId, status: "APPROVED_MANUAL" });

  const targetUser = GLOBAL_USERS.find(u => u.userId === item.userId);
  if (targetUser) {
    targetUser.coupons = Number(targetUser.coupons || 0) + Number(item.qty || 0);
    await pushToGoogleSheets("UPDATE_USER_COUPONS", { userId: targetUser.userId, coupons: targetUser.coupons });
  }

  await logPortalActivity(ACTIVE_USER_SESSION?.userId || "OFFICER", "OFFICER", "Manually Approved Coupon Request", `${item.reqId} (+${item.qty} Pcs to ${item.userId})`);
  renderOfficerCouponRequests();
  renderOfficerDistributorList();
  renderOfficerRetailerList();
  updateDashboardKpis();
  showToast(`Approved ${item.qty} coupons for ${item.userId}!`, "success");
};

window.manualRejectCouponRequest = async function(reqId) {
  const item = GLOBAL_COUPON_REQUESTS.find(r => r.reqId === reqId);
  if (!item) return;
  item.status = "REJECTED";
  await pushToGoogleSheets("UPDATE_COUPON_REQUEST_STATUS", { reqId, status: "REJECTED" });
  renderOfficerCouponRequests();
  showToast(`Rejected coupon request ${reqId}.`, "error");
};

function renderOfficerCouponRequests() {
  const container = document.getElementById("officerCouponRequestsList");
  const badge = document.getElementById("couponReqCountBadge");
  if (!container) return;

  if (badge) badge.innerText = `${GLOBAL_COUPON_REQUESTS.length} Requests`;

  if (!GLOBAL_COUPON_REQUESTS.length) {
    container.innerHTML = `<p class="text-secondary text-center" style="padding:16px;">No coupon requests yet.</p>`;
    return;
  }

  container.innerHTML = GLOBAL_COUPON_REQUESTS.map(r => {
    const isApp = String(r.status || "").startsWith("APPROVED");
    const isRej = r.status === "REJECTED";
    const bg = isApp ? "#dcfce7" : (isRej ? "#fee2e2" : "#fef3c7");
    const col = isApp ? "#15803d" : (isRej ? "#b91c1c" : "#b45309");

    return `
      <div style="padding:12px; border:1px solid var(--border-color); border-radius:10px; background:#fff; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
        <div>
          <strong>${r.userName}</strong> • <code class="font-bold">${r.userId}</code> (${r.role}) • Req: <code>${r.reqId}</code><br>
          <span style="font-size:11.5px; color:var(--text-secondary);">Portal: <b>${r.portal || "UTIITSL"}</b> | Coupons: <b class="text-success">${r.qty} Pcs</b> | Amount: <b>₹${r.amount}</b></span>
        </div>
        <div style="display:flex; align-items:center; gap:6px;">
          <span class="status-badge-inline" style="background:${bg}; color:${col};">${r.status}</span>
          ${!isApp && !isRej ? `
            <button type="button" class="btn-mini-action" style="background:#10b981; color:#fff; border:none;" onclick="manualApproveCouponRequest('${r.reqId}')">Approve</button>
            <button type="button" class="btn-mini-action" style="background:#ef4444; color:#fff; border:none;" onclick="manualRejectCouponRequest('${r.reqId}')">Reject</button>
          ` : ""}
        </div>
      </div>
    `;
  }).join("");
}

// ================= SEPARATE CONFIG FORMS (SHEET, RAZORPAY, WHATSAPP) =================
function initGoogleSheetsConfigEngine() {
  const form = document.getElementById("googleSheetsConfigForm");
  const scriptInput = document.getElementById("setAppsScriptUrl");
  if (scriptInput) scriptInput.value = APPS_SCRIPT_URL;

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const urlVal = scriptInput.value.trim();
    if (!urlVal.startsWith("https://script.google.com/")) {
      return showToast("Please enter a valid Google Apps Script Web App URL.", "error");
    }
    APPS_SCRIPT_URL = urlVal;
    showToast("Connecting to Google Sheet...", "success");
    await syncFromGoogleSheets();
  });

  const rzpForm = document.getElementById("razorpayLinkSettingsForm");
  const rzpInput = document.getElementById("setRazorpayPaymentLink");
  if (rzpInput) rzpInput.value = RAZORPAY_PAYMENT_LINK || GLOBAL_SETTINGS.razorpay_payment_link || "";

  rzpForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const linkVal = rzpInput.value.trim();
    RAZORPAY_PAYMENT_LINK = linkVal;
    GLOBAL_SETTINGS.razorpay_payment_link = linkVal;
    await pushToGoogleSheets("UPDATE_SETTINGS", { razorpay_payment_link: linkVal });
    showToast("Razorpay Payment Link saved!", "success");
  });

  const waForm = document.getElementById("whatsappQueueLinkForm");
  const waInput = document.getElementById("setWhatsappApiUrl");
  if (waInput) waInput.value = WHATSAPP_API_URL || GLOBAL_SETTINGS.whatsapp_api_url || "";

  waForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const waVal = waInput.value.trim();
    WHATSAPP_API_URL = waVal;
    GLOBAL_SETTINGS.whatsapp_api_url = waVal;
    await pushToGoogleSheets("UPDATE_SETTINGS", { whatsapp_api_url: waVal });
    showToast("WhatsApp Queue Link saved!", "success");
  });
}

// ================= OFFICER-ONLY PSA PHOTO & SIGN STUDIO =================
let PSA_STATE = {
  formImg: null,
  rawPhotoImg: null,
  rawSignImg: null,
  cleanSignImg: null,
  activeLayer: "SIGN_BOTTOM",
  draggingLayer: null,
  dragOffsetX: 0,
  dragOffsetY: 0,
  photoLeft: { x: 42, y: 155, w: 92, h: 112 },
  photoRight: { x: 460, y: 155, w: 92, h: 112 },
  signCross: { x: 46, y: 222, w: 84, h: 32 },
  signBottom: { x: 410, y: 710, w: 140, h: 44 }
};

window.openPsaFormEditorModal = function() {
  if (!ACTIVE_USER_SESSION || (ACTIVE_USER_SESSION.role !== "SUPER_OFFICER" && ACTIVE_USER_SESSION.role !== "SUB_OFFICER")) {
    return alert("ACCESS DENIED: PSA Photo & Sign Tool is only available for authorized Officers.");
  }
  document.getElementById("psaFormEditorModal")?.classList.add("open");
  initPsaCanvasEvents();
  renderPsaStudioCanvas();
};

window.closePsaFormEditorModal = function() {
  document.getElementById("psaFormEditorModal")?.classList.remove("open");
};

window.addExtraPsaDocumentRow = function() {
  const container = document.getElementById("psaExtraDocsContainer");
  if (!container) return;
  const row = document.createElement("div");
  row.className = "flex-align-center";
  row.style.gap = "8px";
  row.innerHTML = `
    <input type="file" class="psa-extra-doc-file" accept="image/jpeg,image/png,application/pdf" style="flex:1; font-size:11px;">
    <button type="button" class="btn-mini-action text-danger" onclick="this.parentElement.remove()">✕</button>
  `;
  container.appendChild(row);
};

function loadImageFromFile(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function removeSignatureBackground(img) {
  if (!img) return null;
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0);

  const imgData = ctx.getImageData(0, 0, c.width, c.height);
  const d = imgData.data;

  for (let i = 0; i < d.length; i += 4) {
    const brightness = (d[i] + d[i + 1] + d[i + 2]) / 3;
    if (brightness > 210) {
      d[i + 3] = 0;
    } else if (brightness > 165) {
      d[i + 3] = Math.round(((210 - brightness) / 45) * 255);
    }
  }
  ctx.putImageData(imgData, 0, 0);

  const outImg = new Image();
  outImg.src = c.toDataURL("image/png");
  return outImg;
}

window.handlePsaFormUpload = async function(inputEl) {
  if (!inputEl.files || !inputEl.files[0]) return;
  const file = inputEl.files[0];
  if (file.type === "application/pdf") {
    PSA_STATE.formImg = null;
    renderPsaStudioCanvas();
    showToast("PDF form attached! Will be included in merged PDF.", "success");
    return;
  }
  const img = await loadImageFromFile(file);
  if (img) {
    PSA_STATE.formImg = img;
    renderPsaStudioCanvas();
    showToast("PSA Form loaded! Upload Photo & Signature.", "success");
  }
};

window.handlePsaPhotoUpload = async function(inputEl) {
  if (!inputEl.files || !inputEl.files[0]) return;
  const img = await loadImageFromFile(inputEl.files[0]);
  if (img) {
    PSA_STATE.rawPhotoImg = img;
    PSA_STATE.activeLayer = "PHOTO_RIGHT";
    syncSlidersFromActiveLayer();
    renderPsaStudioCanvas();
    showToast("2 Photos placed on left & right!", "success");
  }
};

window.handlePsaSignUpload = async function(inputEl) {
  if (!inputEl.files || !inputEl.files[0]) return;
  const img = await loadImageFromFile(inputEl.files[0]);
  if (img) {
    PSA_STATE.rawSignImg = img;
    PSA_STATE.cleanSignImg = removeSignatureBackground(img);
    PSA_STATE.activeLayer = "SIGN_BOTTOM";
    syncSlidersFromActiveLayer();
    setTimeout(renderPsaStudioCanvas, 80);
    showToast("Signature background removed & 2 signatures placed!", "success");
  }
};

window.reprocessPsaSignatureBg = function() {
  const chk = document.getElementById("psaRemoveSignBgChk")?.checked;
  if (PSA_STATE.rawSignImg) {
    PSA_STATE.cleanSignImg = chk ? removeSignatureBackground(PSA_STATE.rawSignImg) : PSA_STATE.rawSignImg;
    setTimeout(renderPsaStudioCanvas, 80);
  }
};

window.setActivePsaLayer = function(layerKey) {
  PSA_STATE.activeLayer = layerKey;
  document.getElementById("psaActiveTargetLabel").innerText = layerKey;
  syncSlidersFromActiveLayer();
  renderPsaStudioCanvas();
};

window.resetPsaLayerTransforms = function() {
  PSA_STATE.photoLeft = { x: 42, y: 155, w: 92, h: 112 };
  PSA_STATE.photoRight = { x: 460, y: 155, w: 92, h: 112 };
  PSA_STATE.signCross = { x: 46, y: 222, w: 84, h: 32 };
  PSA_STATE.signBottom = { x: 410, y: 710, w: 140, h: 44 };
  syncSlidersFromActiveLayer();
  renderPsaStudioCanvas();
};

function getLayerObj(key) {
  if (key === "PHOTO_LEFT") return PSA_STATE.photoLeft;
  if (key === "PHOTO_RIGHT") return PSA_STATE.photoRight;
  if (key === "SIGN_CROSS") return PSA_STATE.signCross;
  return PSA_STATE.signBottom;
}

function syncSlidersFromActiveLayer() {
  const canvas = document.getElementById("psaInteractiveCanvas");
  if (!canvas) return;
  const target = getLayerObj(PSA_STATE.activeLayer);
  const pctX = Math.round((target.x / canvas.width) * 100);
  const pctY = Math.round((target.y / canvas.height) * 100);
  const baseW = PSA_STATE.activeLayer.startsWith("PHOTO") ? 92 : (PSA_STATE.activeLayer === "SIGN_CROSS" ? 84 : 140);
  const scalePct = Math.round((target.w / baseW) * 100);

  if (document.getElementById("psaPosXRange")) document.getElementById("psaPosXRange").value = pctX;
  if (document.getElementById("psaPosYRange")) document.getElementById("psaPosYRange").value = pctY;
  if (document.getElementById("psaScaleRange")) document.getElementById("psaScaleRange").value = scalePct;
  if (document.getElementById("psaPosXVal")) document.getElementById("psaPosXVal").innerText = `${pctX}%`;
  if (document.getElementById("psaPosYVal")) document.getElementById("psaPosYVal").innerText = `${pctY}%`;
  if (document.getElementById("psaScaleVal")) document.getElementById("psaScaleVal").innerText = `${scalePct}%`;
}

window.updatePsaLayerFromSliders = function() {
  const canvas = document.getElementById("psaInteractiveCanvas");
  if (!canvas) return;
  const pctX = Number(document.getElementById("psaPosXRange")?.value || 72);
  const pctY = Number(document.getElementById("psaPosYRange")?.value || 78);
  const scalePct = Number(document.getElementById("psaScaleRange")?.value || 100);

  if (document.getElementById("psaPosXVal")) document.getElementById("psaPosXVal").innerText = `${pctX}%`;
  if (document.getElementById("psaPosYVal")) document.getElementById("psaPosYVal").innerText = `${pctY}%`;
  if (document.getElementById("psaScaleVal")) document.getElementById("psaScaleVal").innerText = `${scalePct}%`;

  const factor = scalePct / 100;
  const target = getLayerObj(PSA_STATE.activeLayer);
  const baseW = PSA_STATE.activeLayer.startsWith("PHOTO") ? 92 : (PSA_STATE.activeLayer === "SIGN_CROSS" ? 84 : 140);
  const baseH = PSA_STATE.activeLayer.startsWith("PHOTO") ? 112 : (PSA_STATE.activeLayer === "SIGN_CROSS" ? 32 : 44);

  target.x = Math.round((pctX / 100) * canvas.width);
  target.y = Math.round((pctY / 100) * canvas.height);
  target.w = Math.round(baseW * factor);
  target.h = Math.round(baseH * factor);
  renderPsaStudioCanvas();
};

function renderPsaStudioCanvas() {
  const canvas = document.getElementById("psaInteractiveCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (PSA_STATE.formImg) {
    ctx.drawImage(PSA_STATE.formImg, 0, 0, canvas.width, canvas.height);
  } else {
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 2;
    ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);
    ctx.fillStyle = "#64748b";
    ctx.font = "bold 13px Arial";
    ctx.textAlign = "center";
    ctx.fillText("Upload PSA Form (JPG/PNG/PDF), Photo & Signature", canvas.width / 2, 95);
    ctx.textAlign = "left";
  }

  if (PSA_STATE.rawPhotoImg) {
    const pl = PSA_STATE.photoLeft;
    const pr = PSA_STATE.photoRight;
    ctx.drawImage(PSA_STATE.rawPhotoImg, pl.x, pl.y, pl.w, pl.h);
    ctx.drawImage(PSA_STATE.rawPhotoImg, pr.x, pr.y, pr.w, pr.h);

    if (PSA_STATE.activeLayer === "PHOTO_LEFT") {
      ctx.strokeStyle = "#2563eb"; ctx.lineWidth = 2; ctx.strokeRect(pl.x, pl.y, pl.w, pl.h);
    }
    if (PSA_STATE.activeLayer === "PHOTO_RIGHT") {
      ctx.strokeStyle = "#2563eb"; ctx.lineWidth = 2; ctx.strokeRect(pr.x, pr.y, pr.w, pr.h);
    }
  }

  const useClean = document.getElementById("psaRemoveSignBgChk")?.checked !== false;
  const signSource = useClean && PSA_STATE.cleanSignImg ? PSA_STATE.cleanSignImg : PSA_STATE.rawSignImg;
  if (signSource) {
    const sc = PSA_STATE.signCross;
    const sb = PSA_STATE.signBottom;

    ctx.save();
    ctx.translate(sc.x + sc.w / 2, sc.y + sc.h / 2);
    ctx.rotate(-0.14);
    ctx.drawImage(signSource, -sc.w / 2, -sc.h / 2, sc.w, sc.h);
    ctx.restore();

    ctx.drawImage(signSource, sb.x, sb.y, sb.w, sb.h);

    if (PSA_STATE.activeLayer === "SIGN_CROSS") {
      ctx.strokeStyle = "#10b981"; ctx.lineWidth = 2; ctx.strokeRect(sc.x, sc.y, sc.w, sc.h);
    }
    if (PSA_STATE.activeLayer === "SIGN_BOTTOM") {
      ctx.strokeStyle = "#10b981"; ctx.lineWidth = 2; ctx.strokeRect(sb.x, sb.y, sb.w, sb.h);
    }
  }
}

let psaEventsBound = false;
function initPsaCanvasEvents() {
  if (psaEventsBound) return;
  const canvas = document.getElementById("psaInteractiveCanvas");
  if (!canvas) return;
  psaEventsBound = true;

  const getPointerPos = (evt) => {
    const rect = canvas.getBoundingClientRect();
    const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
    const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height)
    };
  };

  const hitTest = (pos, box) => pos.x >= box.x && pos.x <= box.x + box.w && pos.y >= box.y && pos.y <= box.y + box.h;

  const onDown = (evt) => {
    const pos = getPointerPos(evt);
    const layers = [
      { key: "SIGN_BOTTOM", box: PSA_STATE.signBottom },
      { key: "SIGN_CROSS", box: PSA_STATE.signCross },
      { key: "PHOTO_RIGHT", box: PSA_STATE.photoRight },
      { key: "PHOTO_LEFT", box: PSA_STATE.photoLeft }
    ];

    for (const item of layers) {
      if (hitTest(pos, item.box)) {
        PSA_STATE.activeLayer = item.key;
        PSA_STATE.draggingLayer = item.key;
        PSA_STATE.dragOffsetX = pos.x - item.box.x;
        PSA_STATE.dragOffsetY = pos.y - item.box.y;
        document.getElementById("psaActiveTargetLabel").innerText = item.key;
        syncSlidersFromActiveLayer();
        renderPsaStudioCanvas();
        return;
      }
    }
  };

  const onMove = (evt) => {
    if (!PSA_STATE.draggingLayer) return;
    evt.preventDefault();
    const pos = getPointerPos(evt);
    const target = getLayerObj(PSA_STATE.draggingLayer);
    target.x = Math.max(0, Math.min(canvas.width - target.w, Math.round(pos.x - PSA_STATE.dragOffsetX)));
    target.y = Math.max(0, Math.min(canvas.height - target.h, Math.round(pos.y - PSA_STATE.dragOffsetY)));
    syncSlidersFromActiveLayer();
    renderPsaStudioCanvas();
  };

  const onUp = () => { PSA_STATE.draggingLayer = null; };

  canvas.addEventListener("mousedown", onDown);
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
  canvas.addEventListener("touchstart", onDown, { passive: false });
  window.addEventListener("touchmove", onMove, { passive: false });
  window.addEventListener("touchend", onUp);
}

window.downloadPsaAdjustedPdf = async function() {
  const canvas = document.getElementById("psaInteractiveCanvas");
  if (!canvas || !window.jspdf || !window.jspdf.jsPDF) {
    return showToast("PDF engine unavailable.", "error");
  }
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, 210, 297);

  const extraInputs = document.querySelectorAll(".psa-extra-doc-file");
  for (const inp of extraInputs) {
    if (inp.files && inp.files[0]) {
      const f = inp.files[0];
      if (f.type.startsWith("image/")) {
        const dataUrl = await readFileAsDataUrl(inp);
        if (dataUrl) {
          pdf.addPage();
          const fmt = f.type.includes("png") ? "PNG" : "JPEG";
          pdf.addImage(dataUrl, fmt, 15, 15, 180, 260);
        }
      }
    }
  }

  pdf.save("PSA_Form_Complete.pdf");
  showToast("Downloaded PSA_Form_Complete.pdf", "success");
};

window.downloadPsaAdjustedImage = function() {
  const canvas = document.getElementById("psaInteractiveCanvas");
  if (!canvas) return;
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/jpeg", 0.95);
  a.download = "PSA_Form_Photo_Signature.jpg";
  a.click();
  showToast("Downloaded PSA_Form_Photo_Signature.jpg", "success");
};

// ================= DIRECT LOGIN INTO ANY USER ACCOUNT =================
window.cpanelDirectLoginAsUser = async function(targetUserId) {
  if (!ACTIVE_USER_SESSION || (ACTIVE_USER_SESSION.role !== "SUPER_OFFICER" && ACTIVE_USER_SESSION.role !== "SUB_OFFICER")) {
    return alert("ACCESS DENIED: Only an authorized Officer can directly access user accounts.");
  }

  const targetUser = GLOBAL_USERS.find(u => u.userId === targetUserId);
  if (!targetUser) return showToast("User account not found!", "error");

  const sessionUser = Object.assign({}, targetUser, {
    userStatus: "APPROVED",
    isFirstLogin: false,
    impersonatedByOfficer: ACTIVE_USER_SESSION.userId
  });

  document.getElementById("appContainer").style.display = "none";
  document.getElementById("kycPendingScreen").style.display = "none";

  await logPortalActivity(ACTIVE_USER_SESSION.userId, "OFFICER", "Direct Account Login", `Logged into ${targetUser.role} ${targetUser.name} (${targetUser.userId})`);
  grantUserDashboardAccess(sessionUser);
};

// ================= PROFESSIONAL DISTRIBUTOR OFFLINE KYC FORM =================
window.downloadDistributorOfflineForm = function() {
  const brand = GLOBAL_SETTINGS.brand_title || "BISWAS DIGITAL";
  const sub = GLOBAL_SETTINGS.brand_sub || "Enterprise Smart Portal";
  const phone = GLOBAL_SETTINGS.company_phone || "+91 9876543210";
  const email = GLOBAL_SETTINGS.company_email || "biswascybercafe88@gmail.com";
  const logoHtml = GLOBAL_SETTINGS.brand_logo
    ? `<img src="${GLOBAL_SETTINGS.brand_logo}" style="width:54px; height:54px; border-radius:12px; object-fit:cover; border:2px solid #fff;">`
    : `<div style="width:54px; height:54px; border-radius:12px; background:#ffffff; color:#1d4ed8; font-size:26px; font-weight:900; display:flex; align-items:center; justify-content:center;">${brand.charAt(0)}</div>`;

  const printWin = window.open("", "_blank");
  if (!printWin) return alert("Please allow pop-ups to open the Distributor Offline KYC Form.");

  printWin.document.write(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>${brand} - Distributor Offline KYC Form</title>
      <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
      <style>
        * { box-sizing: border-box; font-family: 'Plus Jakarta Sans', Arial, sans-serif; }
        body { background: #e2e8f0; margin: 0; padding: 20px; color: #0f172a; }
        .toolbar { max-width: 820px; margin: 0 auto 14px; background: #0f172a; color: #fff; padding: 12px 18px; border-radius: 12px; display: flex; justify-content: space-between; align-items: center; }
        .btn-print { background: #2563eb; color: #fff; border: none; padding: 9px 18px; border-radius: 8px; font-weight: 700; font-size: 13px; cursor: pointer; }
        .sheet { max-width: 820px; margin: 0 auto; background: #ffffff; border-radius: 14px; overflow: hidden; box-shadow: 0 12px 30px rgba(15, 23, 42, 0.14); border: 1px solid #cbd5e1; }
        .hero-banner { background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); color: #ffffff; padding: 20px 26px; display: flex; justify-content: space-between; align-items: center; }
        .brand-left { display: flex; align-items: center; gap: 14px; }
        .brand-left h1 { margin: 0; font-size: 21px; font-weight: 800; }
        .brand-left p { margin: 2px 0 0; font-size: 11.5px; color: #dbeafe; }
        .form-tag { background: rgba(255,255,255,0.16); border: 1px solid rgba(255,255,255,0.35); padding: 6px 12px; border-radius: 8px; font-size: 11px; font-weight: 700; text-align: right; }
        .content { padding: 22px 26px 28px; }
        .top-meta-row { display: flex; justify-content: space-between; gap: 18px; margin-bottom: 16px; }
        .meta-fields { flex: 1; display: flex; flex-direction: column; justify-content: space-between; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 16px; font-size: 12px; }
        .photo-frame { width: 132px; height: 156px; border: 2px dashed #3b82f6; background: #eff6ff; border-radius: 10px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; font-size: 11px; font-weight: 700; color: #1d4ed8; padding: 8px; }
        .sec-title { background: #f1f5f9; color: #0f172a; font-size: 12.5px; font-weight: 800; padding: 8px 12px; border-radius: 8px; border-left: 4px solid #2563eb; margin: 16px 0 10px; text-transform: uppercase; }
        table.form-grid { width: 100%; border-collapse: collapse; font-size: 12px; }
        table.form-grid td { border: 1px solid #cbd5e1; padding: 9px 12px; }
        table.form-grid td.lbl { width: 32%; background: #f8fafc; font-weight: 700; color: #334155; }
        .q-card { border: 1px solid #e2e8f0; border-radius: 10px; padding: 11px 14px; margin-bottom: 10px; background: #ffffff; font-size: 12px; }
        .q-card strong { display: block; color: #1e293b; margin-bottom: 6px; }
        .opt-wrap { display: flex; flex-wrap: wrap; gap: 18px; color: #334155; }
        .chk { display: inline-block; width: 14px; height: 14px; border: 1.8px solid #2563eb; border-radius: 3px; margin-right: 6px; vertical-align: middle; }
        .decl-box { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 10px; padding: 12px 14px; font-size: 11px; color: #475569; line-height: 1.6; margin-top: 12px; }
        .sig-footer { display: flex; justify-content: space-between; margin-top: 42px; padding-top: 8px; }
        .sig-line { width: 220px; border-top: 1.5px solid #0f172a; text-align: center; padding-top: 6px; font-size: 11.5px; font-weight: 700; color: #0f172a; }
        @media print {
          body { background: #fff; padding: 0; }
          .toolbar { display: none; }
          .sheet { box-shadow: none; border: none; border-radius: 0; }
        }
      </style>
    </head>
    <body>
      <div class="toolbar">
        <span style="font-size:12.5px; font-weight:600;">Print or Save as PDF → Paste Passport Photo → Tick Answers → Sign & Upload</span>
        <button class="btn-print" onclick="window.print()">Print / Save as PDF</button>
      </div>

      <div class="sheet">
        <div class="hero-banner">
          <div class="brand-left">
            ${logoHtml}
            <div>
              <h1>${brand}</h1>
              <p>${sub} • Authorized Distributor Onboarding Form</p>
              <p>Helpline: ${phone} | Email: ${email}</p>
            </div>
          </div>
          <div class="form-tag">DISTRIBUTOR KYC<br>FORM CODE: DST-01</div>
        </div>

        <div class="content">
          <div class="top-meta-row">
            <div class="meta-fields">
              <div><strong>Application Date:</strong> &nbsp; ____ / ____ / 202____</div>
              <div><strong>Requested Territory PIN Codes:</strong> &nbsp; ______________________________________</div>
              <div><strong>Reference / Registration No:</strong> &nbsp; ______________________________________</div>
            </div>
            <div class="photo-frame">
              PASTE RECENT<br>PASSPORT SIZE<br>PHOTOGRAPH<br><br><span style="font-size:9.5px; font-weight:500;">(Sign Across Photo)</span>
            </div>
          </div>

          <div class="sec-title">1. Applicant & Enterprise Information</div>
          <table class="form-grid">
            <tr><td class="lbl">Applicant Full Legal Name</td><td></td></tr>
            <tr><td class="lbl">Father's / Guardian's Name</td><td></td></tr>
            <tr><td class="lbl">Date of Birth & Gender</td><td>DOB: ____ / ____ / ________ &nbsp;&nbsp;&nbsp;&nbsp; <span class="chk"></span> Male &nbsp;&nbsp; <span class="chk"></span> Female &nbsp;&nbsp; <span class="chk"></span> Other</td></tr>
            <tr><td class="lbl">Shop / Agency Name</td><td></td></tr>
            <tr><td class="lbl">WhatsApp Mobile Number</td><td></td></tr>
            <tr><td class="lbl">Official Email Address</td><td></td></tr>
            <tr><td class="lbl">PAN Card Number</td><td></td></tr>
            <tr><td class="lbl">ID Number</td><td></td></tr>
            <tr><td class="lbl">Complete Shop / Office Address</td><td><br><br>PIN Code: ______________ &nbsp;&nbsp; District: ________________ &nbsp;&nbsp; State: ________________</td></tr>
          </table>

          <div class="sec-title">2. Business Verification Questionnaire (Tick Appropriate Box)</div>
          <div class="q-card">
            <strong>A) Shop / Office Premises Ownership:</strong>
            <div class="opt-wrap">
              <span><span class="chk"></span> Own Shop / Property</span>
              <span><span class="chk"></span> Rented Shop</span>
              <span><span class="chk"></span> Home-Based Digital Center</span>
            </div>
          </div>

          <div class="q-card">
            <strong>B) Estimated Annual Business Income (Yearly Turnover):</strong>
            <div class="opt-wrap">
              <span><span class="chk"></span> Below ₹1,50,000</span>
              <span><span class="chk"></span> ₹1,50,000 – ₹3,00,000</span>
              <span><span class="chk"></span> ₹3,00,000 – ₹5,00,000</span>
              <span><span class="chk"></span> Above ₹5,00,000</span>
            </div>
          </div>

          <div class="q-card">
            <strong>C) Available Hardware & Center Infrastructure:</strong>
            <div class="opt-wrap">
              <span><span class="chk"></span> Desktop / Laptop</span>
              <span><span class="chk"></span> Color Printer & Scanner</span>
              <span><span class="chk"></span> Biometric Device</span>
              <span><span class="chk"></span> Broadband Internet</span>
            </div>
          </div>

          <div class="q-card">
            <strong>D) Experience in PAN Card / Fintech / Cyber Cafe Services:</strong>
            <div class="opt-wrap">
              <span><span class="chk"></span> Less than 1 Year</span>
              <span><span class="chk"></span> 1 to 3 Years</span>
              <span><span class="chk"></span> More than 3 Years</span>
            </div>
          </div>

          <div class="decl-box">
            <strong>DECLARATION:</strong> I hereby declare that the particulars furnished above and the enclosed KYC documents are true, complete, and correct to the best of my knowledge. I agree to abide by all rules of <strong>${brand}</strong>.
          </div>

          <div class="sig-footer">
            <div class="sig-line">Applicant Signature with Stamp</div>
            <div class="sig-line">Authorized Officer Approval (${brand})</div>
          </div>
        </div>
      </div>
    </body>
    </html>
  `);
  printWin.document.close();
};

// ================= DUPLICATE ACCOUNT VALIDATION =================
function findDuplicateUserField(phone, email, aadhaar, excludeUserId = "") {
  const cleanPhone = String(phone || "").trim();
  const cleanEmail = String(email || "").trim().toLowerCase();
  const cleanAadhaar = String(aadhaar || "").trim();

  for (const u of GLOBAL_USERS) {
    if (excludeUserId && u.userId === excludeUserId) continue;
    if (cleanPhone && String(u.phone).trim() === cleanPhone) {
      return `Mobile Number (${cleanPhone}) is already registered under ${u.name} (${u.userId}).`;
    }
    if (cleanEmail && String(u.email).trim().toLowerCase() === cleanEmail) {
      return `Email ID (${cleanEmail}) is already registered under ${u.name} (${u.userId}).`;
    }
    if (cleanAadhaar && String(u.aadhaar).trim() === cleanAadhaar) {
      return `ID (${cleanAadhaar}) is already registered under ${u.name} (${u.userId}).`;
    }
  }
  return "";
}

// ================= 90-DAY AUTO-INACTIVITY CHECKER & REACTIVATION =================
async function checkAndEnforceUserInactivity() {
  const ninetyDaysMs = INACTIVITY_LIMIT_DAYS * 24 * 60 * 60 * 1000;
  const now = Date.now();

  for (const user of GLOBAL_USERS) {
    if (user.userStatus === "APPROVED" && user.lastActiveAt) {
      const lastActiveTime = new Date(user.lastActiveAt).getTime();
      if (!isNaN(lastActiveTime) && (now - lastActiveTime) > ninetyDaysMs) {
        user.userStatus = "INACTIVE";
        user.rejectionReason = "Auto-deactivated due to 90 days of inactivity.";
        await pushToGoogleSheets("UPDATE_USER_DETAILS", user);
      }
    }
  }
}

async function touchUserLastActive(userId) {
  const user = GLOBAL_USERS.find(u => u.userId === userId);
  if (!user) return;
  user.lastActiveAt = new Date().toISOString();
  await pushToGoogleSheets("UPDATE_USER_DETAILS", { userId: user.userId, lastActiveAt: user.lastActiveAt });
}

window.reactivateUserAccount = async function(targetUserId) {
  if (!ACTIVE_USER_SESSION || (ACTIVE_USER_SESSION.role !== "SUPER_OFFICER" && ACTIVE_USER_SESSION.role !== "SUB_OFFICER")) {
    return alert("Only an Officer can reactivate accounts.");
  }

  const targetUser = GLOBAL_USERS.find(u => u.userId === targetUserId);
  if (!targetUser) return;

  targetUser.userStatus = "APPROVED";
  targetUser.rejectionReason = "";
  targetUser.lastActiveAt = new Date().toISOString();

  await pushToGoogleSheets("UPDATE_USER_DETAILS", targetUser);
  await logPortalActivity(ACTIVE_USER_SESSION.userId, "OFFICER", "Reactivated Account", `Reactivated ${targetUser.role}: ${targetUser.name} (${targetUserId})`);

  const msg = `*Account Reactivated!* ✅\n\nHello *${targetUser.name}*,\nYour *${targetUser.role}* ID (*${targetUser.userId}*) has been reactivated.\n\nYou can sign in and resume work immediately.\nThank you,\n*${GLOBAL_SETTINGS.brand_title}*`;
  await sendDirectWhatsAppMessage(targetUser.phone, msg);

  renderOfficerDistributorList();
  renderOfficerRetailerList();
  populateTopupDropdown();
  updateDashboardKpis();
  showToast(`Account ${targetUser.name} (${targetUserId}) is now ACTIVE!`, "success");
};

// ================= INSPECT DISTRIBUTOR'S DOWNLINE RETAILERS =================
window.openDistRetailersInspector = function(distUserId) {
  const dist = GLOBAL_USERS.find(u => u.userId === distUserId && u.role === "DISTRIBUTOR");
  if (!dist) return;

  const downlineRetailers = GLOBAL_USERS.filter(u => u.role === "RETAILER" && u.parentId === distUserId);

  document.getElementById("inspectorDistTitle").innerText = `${dist.name} (${dist.userId}) — Downline Retailers`;
  document.getElementById("inspectorDistMetaBox").innerHTML = `
    <div class="flex-between">
      <span>Mobile: <b>${dist.phone}</b> | Stock: <b class="text-success">${dist.coupons} Pcs</b></span>
      <span>Total Retailers: <b>${downlineRetailers.length}</b></span>
    </div>
    <div class="mt-1">Allocated PIN Codes: <b style="color:var(--primary-accent);">${dist.territoryValue || "None"}</b></div>
  `;

  const listContainer = document.getElementById("inspectorDistRetailersList");
  if (!downlineRetailers.length) {
    listContainer.innerHTML = `<p class="text-secondary text-center" style="padding:20px;">No retailers are mapped under this Distributor yet.</p>`;
  } else {
    listContainer.innerHTML = downlineRetailers.map(r => {
      const isApp = r.userStatus === "APPROVED";
      const isInact = r.userStatus === "INACTIVE";
      const bg = isApp ? "#dcfce7" : (isInact ? "#f1f5f9" : "#fef3c7");
      const col = isApp ? "#15803d" : (isInact ? "#475569" : "#b45309");

      return `
        <div style="padding:12px; border:1px solid var(--border-color); border-radius:10px; background:#ffffff;">
          <div class="flex-between">
            <div>
              <strong>${r.name}</strong> • <code class="font-bold">${r.userId}</code>
              <span class="status-badge-inline" style="margin-left:6px; background:${bg}; color:${col};">${r.userStatus}</span>
            </div>
            <strong class="font-mono text-success">${r.coupons} Pcs</strong>
          </div>
          <div style="font-size:11.5px; color:var(--text-secondary); margin-top:5px;">
            Mobile: <b>${r.phone}</b> | Email: ${r.email}<br>
            PAN: <b>${r.pan || "N/A"}</b> | Last Active: <b>${r.lastActiveAt ? new Date(r.lastActiveAt).toLocaleDateString() : "New Account"}</b>
          </div>
        </div>
      `;
    }).join("");
  }

  document.getElementById("distRetailersInspectorModal")?.classList.add("open");
};

window.closeDistRetailersModal = function() {
  document.getElementById("distRetailersInspectorModal")?.classList.remove("open");
};

// ================= MOBILE SIDEBAR & NAVIGATION HELPERS =================
window.toggleMobileSidebar = function(sidebarId) {
  document.getElementById(sidebarId)?.classList.toggle("mobile-open");
  document.getElementById("sidebarBackdrop")?.classList.toggle("open");
};

window.closeMobileSidebars = function() {
  document.querySelectorAll(".portal-sidebar").forEach(s => s.classList.remove("mobile-open"));
  document.getElementById("sidebarBackdrop")?.classList.remove("open");
};

window.openOfficerPane = function(target, title) {
  document.querySelectorAll(".service-screen-pane").forEach(p => p.classList.remove("active-pane"));
  document.getElementById(target)?.classList.add("active-pane");
  document.getElementById("homeAppView").style.display = "none";
  document.getElementById("serviceWorkspaceArea").style.display = "block";
  const activeTitleEl = document.getElementById("activeServiceTitle");
  if (activeTitleEl) activeTitleEl.innerText = title || "Workspace";

  if (target === "coupon-req-view") renderOfficerCouponRequests();
  if (target === "channel-reg-view") renderChannelRegistrationsQueue();
  if (target === "inbox-view") { renderAdminAppQueue(); renderPublicCouponsList(); }
  if (target === "distributors-view") renderOfficerDistributorList();
  if (target === "retailers-view") { renderOfficerRetailerList(); populateMappingDropdowns(); }
  if (target === "activity-view") renderOfficerActivityFeeds();
  if (target === "officers-mgmt-view") renderSubOfficersList();
  if (target === "complaint-view") renderOfficerComplaintList();
  if (target === "settings-view") { renderOfficerCustomIdList(); populateSettingsFormValues(); }
  if (target === "network-view") { populateTopupDropdown(); populateCreateUserDistDropdown(); toggleOfficerTerritoryInputs(); }
};

window.triggerDistSection = function(cardId) {
  if (!ensureKycApprovedOrBlock()) return;
  showDistributorSection(cardId);
};

window.returnDistributorHome = function() {
  document.getElementById("chainWorkArea").style.display = "none";
  document.getElementById("chainAppGrid").style.display = "block";
};

function updateDashboardKpis() {
  const dists = GLOBAL_USERS.filter(u => u.role === "DISTRIBUTOR");
  const rets = GLOBAL_USERS.filter(u => u.role === "RETAILER");
  const pendingUsers = GLOBAL_USERS.filter(u => u.userStatus === "KYC_PENDING").length;
  const pendingRegs = GLOBAL_CHANNEL_REGISTRATIONS.filter(r => r.status === "PENDING").length;
  const pendingCoupons = GLOBAL_COUPON_REQUESTS.filter(r => r.status === "PENDING_MANUAL").length;

  const offDistEl = document.getElementById("offKpiDistCount");
  const offRetEl = document.getElementById("offKpiRetCount");
  const offPendEl = document.getElementById("offKpiPendingCount");
  const offAppsEl = document.getElementById("offKpiAppsCount");
  if (offDistEl) offDistEl.innerText = dists.length;
  if (offRetEl) offRetEl.innerText = rets.length;
  if (offPendEl) offPendEl.innerText = pendingUsers + pendingRegs + pendingCoupons;
  if (offAppsEl) offAppsEl.innerText = GLOBAL_APPLICATIONS.length;

  if (ACTIVE_USER_SESSION) {
    const live = GLOBAL_USERS.find(u => u.userId === ACTIVE_USER_SESSION.userId) || ACTIVE_USER_SESSION;
    if (live.role === "RETAILER") {
      const myApps = GLOBAL_APPLICATIONS.filter(a => a.retailerId === live.userId);
      const retCoup = document.getElementById("retKpiCoupons");
      const retHero = document.getElementById("retHeroBalance");
      const retApps = document.getElementById("retKpiTotalApps");
      if (retCoup) retCoup.innerText = `${live.coupons || 0} Pcs`;
      if (retHero) retHero.innerText = `${live.coupons || 0} Pcs`;
      if (retApps) retApps.innerText = myApps.length;
    } else if (live.role === "DISTRIBUTOR") {
      const myRets = GLOBAL_USERS.filter(u => u.parentId === live.userId && u.role === "RETAILER");
      const distCoup = document.getElementById("distKpiCoupons");
      const distHero = document.getElementById("distHeroBalance");
      const distRets = document.getElementById("distKpiRetailers");
      const distPins = document.getElementById("distKpiPins");
      if (distCoup) distCoup.innerText = `${live.coupons || 0} Pcs`;
      if (distHero) distHero.innerText = `${live.coupons || 0} Pcs`;
      if (distRets) distRets.innerText = myRets.length;
      if (distPins) distPins.innerText = live.territoryValue || "Not Set";
    }
  }
}

// ================= MANUAL APP LOGO & BRAND NAME ENGINE =================
window.previewManualBrandLogo = function(inputEl) {
  if (!inputEl.files || !inputEl.files[0]) return;
  const file = inputEl.files[0];
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, 128, 128);
      TEMP_UPLOADED_LOGO_DATA = canvas.toDataURL("image/png", 0.9);
      const prevImg = document.getElementById("brandLogoPreviewImg");
      const prevTxt = document.getElementById("brandLogoPreviewTxt");
      if (prevImg) {
        prevImg.src = TEMP_UPLOADED_LOGO_DATA;
        prevImg.style.display = "block";
      }
      if (prevTxt) prevTxt.innerText = "New Logo Ready (Click Save to Publish)";
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
};

function initBrandLogoSettingsEngine() {
  document.getElementById("brandLogoSettingsForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const newTitle = document.getElementById("setBrandTitle")?.value.trim();
    const newSub = document.getElementById("setBrandSub")?.value.trim();
    const urlInput = document.getElementById("setBrandLogoUrl")?.value.trim();

    if (newTitle) GLOBAL_SETTINGS.brand_title = newTitle;
    if (newSub) GLOBAL_SETTINGS.brand_sub = newSub;

    if (TEMP_UPLOADED_LOGO_DATA) {
      GLOBAL_SETTINGS.brand_logo = TEMP_UPLOADED_LOGO_DATA;
      TEMP_UPLOADED_LOGO_DATA = "";
    } else if (urlInput) {
      GLOBAL_SETTINGS.brand_logo = urlInput;
    }

    await pushToGoogleSheets("UPDATE_SETTINGS", GLOBAL_SETTINGS);
    await logPortalActivity(ACTIVE_USER_SESSION?.userId || "ADMIN", "OFFICER", "Updated App Branding", `Brand: ${GLOBAL_SETTINGS.brand_title}`);
    applyGlobalSettingsToDOM();
    showToast("App Name & Logo Saved!", "success");
  });
}

function populateSettingsFormValues() {
  if (document.getElementById("setAppsScriptUrl")) document.getElementById("setAppsScriptUrl").value = APPS_SCRIPT_URL || "";
  if (document.getElementById("setRazorpayPaymentLink")) document.getElementById("setRazorpayPaymentLink").value = RAZORPAY_PAYMENT_LINK || GLOBAL_SETTINGS.razorpay_payment_link || "";
  if (document.getElementById("setWhatsappApiUrl")) document.getElementById("setWhatsappApiUrl").value = WHATSAPP_API_URL || GLOBAL_SETTINGS.whatsapp_api_url || "";
  if (document.getElementById("setBrandTitle")) document.getElementById("setBrandTitle").value = GLOBAL_SETTINGS.brand_title || "";
  if (document.getElementById("setBrandSub")) document.getElementById("setBrandSub").value = GLOBAL_SETTINGS.brand_sub || "";
  if (document.getElementById("setBrandLogoUrl") && GLOBAL_SETTINGS.brand_logo && !GLOBAL_SETTINGS.brand_logo.startsWith("data:")) {
    document.getElementById("setBrandLogoUrl").value = GLOBAL_SETTINGS.brand_logo;
  }
  const prevImg = document.getElementById("brandLogoPreviewImg");
  const prevTxt = document.getElementById("brandLogoPreviewTxt");
  if (GLOBAL_SETTINGS.brand_logo && prevImg) {
    prevImg.src = GLOBAL_SETTINGS.brand_logo;
    prevImg.style.display = "block";
    if (prevTxt) prevTxt.innerText = "Active Custom App Logo";
  }

  if (document.getElementById("setApkDownloadUrl")) document.getElementById("setApkDownloadUrl").value = GLOBAL_SETTINGS.apk_download_url || "";
  if (document.getElementById("setHeroTitle")) document.getElementById("setHeroTitle").value = GLOBAL_SETTINGS.hero_title || "";
  if (document.getElementById("setHeroDesc")) document.getElementById("setHeroDesc").value = GLOBAL_SETTINGS.hero_desc || "";
  if (document.getElementById("setBroadcastNote")) document.getElementById("setBroadcastNote").value = GLOBAL_SETTINGS.broadcast_notice || "";
  if (document.getElementById("setBusinessWhatsApp")) document.getElementById("setBusinessWhatsApp").value = GLOBAL_SETTINGS.business_whatsapp || "";
  if (document.getElementById("setCompanyPhone")) document.getElementById("setCompanyPhone").value = GLOBAL_SETTINGS.company_phone || "";
  if (document.getElementById("setCompanyEmail")) document.getElementById("setCompanyEmail").value = GLOBAL_SETTINGS.company_email || "";
}

// ================= OPTIONAL RETAILER -> DISTRIBUTOR MAPPING ENGINE =================
function populateMappingDropdowns() {
  const retSel = document.getElementById("mapRetailerSelect");
  const distSel = document.getElementById("mapDistributorSelect");
  const retailers = GLOBAL_USERS.filter(u => u.role === "RETAILER");
  const distributors = GLOBAL_USERS.filter(u => u.role === "DISTRIBUTOR");

  if (retSel) {
    retSel.innerHTML = retailers.length
      ? retailers.map(r => `<option value="${r.userId}">${r.name} (${r.userId}) [Current: ${r.parentId && r.parentId !== "ADMIN" ? r.parentId : "Direct Admin"}]</option>`).join("")
      : `<option value="">No Retailers Available</option>`;
  }

  if (distSel) {
    const distOptions = distributors.map(d => `<option value="${d.userId}">${d.name} (${d.userId}) • PINs: ${d.territoryValue || "None"}</option>`).join("");
    distSel.innerHTML = `<option value="ADMIN">Direct Admin (No Distributor Mapping)</option>${distOptions}`;
  }
}

function populateCreateUserDistDropdown() {
  const sel = document.getElementById("offNewUserParentSelect");
  if (!sel) return;
  const distributors = GLOBAL_USERS.filter(u => u.role === "DISTRIBUTOR");
  const distOptions = distributors.map(d => `<option value="${d.userId}">${d.name} (${d.userId}) • PINs: ${d.territoryValue || "None"}</option>`).join("");
  sel.innerHTML = `<option value="ADMIN">Direct Admin (No Distributor Mapping)</option>${distOptions}`;
}

function initRetailerMappingEngine() {
  document.getElementById("quickMapRetailerForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const retId = document.getElementById("mapRetailerSelect")?.value;
    const newParentId = document.getElementById("mapDistributorSelect")?.value;
    if (!retId || !newParentId) return showToast("Please select both Retailer and Mapping option.", "error");

    const retailer = GLOBAL_USERS.find(u => u.userId === retId && u.role === "RETAILER");
    if (!retailer) return;

    const oldParent = retailer.parentId || "ADMIN";
    retailer.parentId = newParentId;

    await pushToGoogleSheets("UPDATE_USER_DETAILS", retailer);
    await logPortalActivity(
      ACTIVE_USER_SESSION?.userId || "ADMIN",
      "OFFICER",
      "Updated Retailer Mapping",
      `Retailer ${retailer.name} (${retId}) mapped from ${oldParent} → ${newParentId}`
    );

    renderOfficerRetailerList();
    renderOfficerDistributorList();
    populateMappingDropdowns();
    showToast(`Retailer ${retailer.name} mapping updated!`, "success");
  });
}

// ================= SINGLE WHATSAPP QUEUE DISPATCH VIA GOOGLE SHEET =================
async function sendDirectWhatsAppMessage(recipientPhone, messageText) {
  const cleanPhone = String(recipientPhone || "").replace(/[^0-9]/g, "");
  if (!cleanPhone) return;
  const formattedPhone = cleanPhone.length === 10 ? "91" + cleanPhone : cleanPhone;
  const waUrl = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(messageText)}`;

  await pushToGoogleSheets("SEND_WHATSAPP", {
    sender: GLOBAL_SETTINGS.business_whatsapp,
    to: formattedPhone,
    message: messageText
  });

  showToast(`Saved to WhatsAppQueue in Sheet! Opening WhatsApp for +${formattedPhone}...`, "success");
  const opened = window.open(waUrl, "_blank");
  if (!opened) {
    window.location.href = waUrl;
  }
}

// ================= CENTRALIZED ACTIVITY LOGGER =================
async function logPortalActivity(actorId, actorRole, actionTitle, details) {
  const entry = {
    time: new Date().toLocaleString(),
    actorId: actorId || "PUBLIC_WEB",
    actorRole: actorRole || "VISITOR",
    actionTitle,
    details
  };
  GLOBAL_ACTIVITY_LOGS.unshift(entry);
  renderOfficerActivityFeeds();
  await pushToGoogleSheets("ADD_ACTIVITY", entry);
}

function renderOfficerActivityFeeds() {
  const homeContainer = document.getElementById("officerHomeActivityList");
  const fullContainer = document.getElementById("officerFullActivityList");

  const markup = GLOBAL_ACTIVITY_LOGS.length ? GLOBAL_ACTIVITY_LOGS.map(log => `
    <div style="padding:10px 12px; border-bottom:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:flex-start; gap:8px; background:#fff;">
      <div>
        <strong style="font-size:11.5px; color:var(--primary-accent);">${log.actionTitle}</strong> • <code>${log.actorId}</code> (${log.actorRole})<br>
        <span style="font-size:11.5px; color:var(--text-primary);">${log.details}</span>
      </div>
      <span style="font-size:10px; color:var(--text-muted); white-space:nowrap;">${log.time}</span>
    </div>
  `).join("") : `<p class="text-secondary text-center" style="padding:16px;">No recent portal activities logged yet.</p>`;

  if (homeContainer) homeContainer.innerHTML = markup;
  if (fullContainer) fullContainer.innerHTML = markup;
}

// ================= NSDL / UTIITSL EXACT IMAGE AUTO-FORMATTER =================
function autoFormatPanImage(fileInput, portal, mediaType) {
  return new Promise((resolve) => {
    if (!fileInput || !fileInput.files || !fileInput.files[0]) {
      resolve("");
      return;
    }

    const file = fileInput.files[0];
    const isNSDL = portal === "NSDL";

    const targetW = mediaType === "PHOTO" ? (isNSDL ? 200 : 213) : 400;
    const targetH = mediaType === "PHOTO" ? (isNSDL ? 200 : 213) : 200;
    const maxBytes = mediaType === "PHOTO" ? (isNSDL ? 50 * 1024 : 30 * 1024) : (isNSDL ? 50 * 1024 : 60 * 1024);

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, targetW, targetH);
        ctx.drawImage(img, 0, 0, targetW, targetH);

        let quality = 0.92;
        let dataUrl = canvas.toDataURL("image/jpeg", quality);
        while (Math.round((dataUrl.length * 3) / 4) > maxBytes && quality > 0.2) {
          quality -= 0.08;
          dataUrl = canvas.toDataURL("image/jpeg", quality);
        }
        resolve(dataUrl);
      };
      img.onerror = () => resolve(event.target.result);
      img.src = event.target.result;
    };
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
}

window.previewAutoFormatStatus = async function(inputEl, formType, mediaType) {
  const portal = formType === "CORR"
    ? (document.querySelector('input[name="corrPortalChoice"]:checked')?.value || "NSDL")
    : (document.querySelector('input[name="unifiedPortalChoice"]:checked')?.value || "NSDL");

  const statusId = formType === "CORR"
    ? (mediaType === "PHOTO" ? "statusCorrPhoto" : "statusCorrSign")
    : (mediaType === "PHOTO" ? "statusNewPhoto" : "statusNewSign");

  const statusEl = document.getElementById(statusId);
  if (!inputEl.files || !inputEl.files[0]) {
    if (statusEl) statusEl.innerText = "";
    return;
  }

  const formattedDataUrl = await autoFormatPanImage(inputEl, portal, mediaType);
  const sizeKB = Math.round(((formattedDataUrl.length * 3) / 4) / 1024);
  const dims = mediaType === "PHOTO" ? (portal === "NSDL" ? "200×200px" : "213×213px") : "400×200px";

  if (statusEl) {
    statusEl.innerText = `Auto-Formatted for ${portal}: ${dims} (${sizeKB} KB)`;
  }
};

window.validateDocFileSize = function(inputEl) {
  if (!inputEl.files || !inputEl.files[0]) return;
  const fileSizeKB = Math.round(inputEl.files[0].size / 1024);
  if (fileSizeKB > 2048) {
    showToast(`File too large (${fileSizeKB} KB). Please upload under 2 MB.`, "error");
    inputEl.value = "";
  } else {
    showToast(`Document verified (${fileSizeKB} KB)`, "success");
  }
};

function readFileAsDataUrl(fileInput) {
  return new Promise((resolve) => {
    if (!fileInput || !fileInput.files || !fileInput.files[0]) {
      resolve("");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => resolve("");
    reader.readAsDataURL(fileInput.files[0]);
  });
}

// ================= CLOUD ENGINE =================
async function pushToGoogleSheets(action, payload) {
  if (!APPS_SCRIPT_URL) return null;
  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, payload })
    });
    return await res.json();
  } catch (err) {
    console.warn("Cloud sync warning:", err);
    return null;
  }
}

window.syncFromGoogleSheets = async function() {
  if (!APPS_SCRIPT_URL) {
    showToast("Paste your Web App URL in Config first!", "error");
    return;
  }

  showToast("Syncing live database...", "success");
  try {
    const res = await fetch(`${APPS_SCRIPT_URL}?action=GET_ALL&t=${Date.now()}`);
    const data = await res.json();

    if (data) {
      if (Array.isArray(data.users)) {
        GLOBAL_USERS = data.users.filter(u => u.role === "DISTRIBUTOR" || u.role === "RETAILER");
      }
      if (Array.isArray(data.applications)) GLOBAL_APPLICATIONS = data.applications;
      if (Array.isArray(data.registrations)) GLOBAL_CHANNEL_REGISTRATIONS = data.registrations;
      if (Array.isArray(data.couponRequests)) GLOBAL_COUPON_REQUESTS = data.couponRequests;
      if (Array.isArray(data.complaints)) GLOBAL_COMPLAINTS = data.complaints;
      if (Array.isArray(data.activities)) GLOBAL_ACTIVITY_LOGS = data.activities;
      if (Array.isArray(data.officers) && data.officers.length) {
        const superAdmin = GLOBAL_OFFICERS[0];
        GLOBAL_OFFICERS = [superAdmin, ...data.officers.filter(o => o.userId !== superAdmin.userId)];
      }
      if (Array.isArray(data.configuredIds) && data.configuredIds.length) {
        OFFICER_CONFIGURED_IDS = data.configuredIds;
        renderOfficerCustomIdList();
      }
      if (data.publicCoupons && typeof data.publicCoupons === "object") PUBLIC_MOBILE_COUPONS = data.publicCoupons;
      if (data.settings && Object.keys(data.settings).length) {
        GLOBAL_SETTINGS = { ...GLOBAL_SETTINGS, ...data.settings };
        if (GLOBAL_SETTINGS.whatsapp_api_url) WHATSAPP_API_URL = GLOBAL_SETTINGS.whatsapp_api_url;
        if (GLOBAL_SETTINGS.razorpay_payment_link) RAZORPAY_PAYMENT_LINK = GLOBAL_SETTINGS.razorpay_payment_link;
        applyGlobalSettingsToDOM();
      }

      purgeOldRejectedRegistrations();
      await checkAndEnforceUserInactivity();

      renderAdminAppQueue();
      renderChannelRegistrationsQueue();
      renderOfficerCouponRequests();
      renderOfficerDistributorList();
      renderOfficerRetailerList();
      renderOfficerComplaintList();
      renderUserOwnTickets("retMyTicketsList");
      renderUserOwnTickets("distMyTicketsList");
      renderOfficerActivityFeeds();
      renderPublicCouponsList();
      renderRetailerHistory();
      renderSubOfficersList();
      populateTopupDropdown();
      populateMappingDropdowns();
      populateCreateUserDistDropdown();
      updateSessionWalletUI();
      updateDashboardKpis();

      if (ACTIVE_USER_SESSION && ACTIVE_USER_SESSION.role === "DISTRIBUTOR") {
        setupDistributorConsoleView(ACTIVE_USER_SESSION);
      }

      showToast("Database Synced Successfully!", "success");
    }
  } catch (err) {
    console.error("Cloud Fetch Error:", err);
    showToast("Could not connect to backend URL.", "error");
  }
};

// ================= UNIFIED REJECTION MODAL WITH MANUAL REASON =================
window.openRejectionModal = function(targetType, targetId, displayLabel) {
  if (!ACTIVE_USER_SESSION || (ACTIVE_USER_SESSION.role !== "SUPER_OFFICER" && ACTIVE_USER_SESSION.role !== "SUB_OFFICER")) {
    return alert("Only an Officer can reject requests.");
  }
  document.getElementById("rejectTargetType").value = targetType;
  document.getElementById("rejectTargetId").value = targetId;
  document.getElementById("rejectTargetDisplay").value = displayLabel || targetId;
  document.getElementById("rejectReasonInput").value = "";
  document.getElementById("rejectionReasonModal")?.classList.add("open");
};

window.closeRejectionModal = function() {
  document.getElementById("rejectionReasonModal")?.classList.remove("open");
};

function initRejectionEngine() {
  document.getElementById("rejectionReasonForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const targetType = document.getElementById("rejectTargetType").value;
    const targetId = document.getElementById("rejectTargetId").value;
    const reason = document.getElementById("rejectReasonInput").value.trim();

    if (!reason || reason.length < 3) {
      return showToast("Please write a clear rejection reason.", "error");
    }

    if (targetType === "USER_KYC") {
      const user = GLOBAL_USERS.find(u => u.userId === targetId);
      if (user) {
        user.userStatus = "REJECTED";
        user.rejectionReason = reason;
        await pushToGoogleSheets("UPDATE_USER_DETAILS", user);
        await logPortalActivity(ACTIVE_USER_SESSION.userId, "OFFICER", "Rejected Account", `Rejected ${user.role}: ${user.name} (${targetId}) • Reason: ${reason}`);

        const msg = `*Account Rejected* ❌\n\nHello *${user.name}*,\nYour *${user.role}* ID (*${user.userId}*) has been rejected.\n\n*Rejection Reason:* ${reason}\n\nPlease contact support for assistance.`;
        await sendDirectWhatsAppMessage(user.phone, msg);

        renderOfficerDistributorList();
        renderOfficerRetailerList();
        populateTopupDropdown();
        updateDashboardKpis();
        showToast(`Rejected ${user.name} with reason!`, "error");
      }
    } else if (targetType === "CHANNEL_REG") {
      const reg = GLOBAL_CHANNEL_REGISTRATIONS.find(x => x.regId === targetId);
      if (reg) {
        reg.status = "REJECTED";
        reg.rejectedAt = new Date().toISOString();
        reg.rejectionReason = reason;
        await pushToGoogleSheets("UPDATE_REGISTRATION_STATUS", { regId: targetId, status: "REJECTED", rejectedAt: reg.rejectedAt, rejectionReason: reason });
        await logPortalActivity(ACTIVE_USER_SESSION.userId, "OFFICER", "Rejected Channel ID", `Rejected ${reg.applicantName} (${targetId}) • Reason: ${reason}`);

        const msg = `*Channel ID Registration Rejected* ⚠️\n\nHello *${reg.applicantName}*,\nYour registration for *${reg.appName}* (${reg.regId}) was rejected.\n\n*Rejection Reason:* ${reason}\n\nNote: This record will automatically purge in 3 days.`;
        await sendDirectWhatsAppMessage(reg.phone, msg);

        renderChannelRegistrationsQueue();
        updateDashboardKpis();
        showToast("Registration rejected with reason.", "error");
      }
    } else if (targetType === "PAN_APP") {
      const app = GLOBAL_APPLICATIONS.find(a => a.appId === targetId);
      if (app) {
        app.status = "REJECTED_DOC_ERROR";
        app.rejectionReason = reason;
        app.officialAck = "REJECTED";
        await pushToGoogleSheets("UPDATE_APPLICATION_STATUS", {
          appId: targetId,
          status: app.status,
          officialAck: app.officialAck,
          rejectionReason: app.rejectionReason
        });
        await logPortalActivity(ACTIVE_USER_SESSION.userId, "OFFICER", "Rejected PAN Application", `Token ${targetId} Rejected • Reason: ${reason}`);

        renderAdminAppQueue();
        renderRetailerHistory();
        showToast("PAN Application rejected with reason.", "error");
      }
    }

    closeRejectionModal();
  });
}

// ================= OFFICER-ONLY DELETE ID =================
window.deleteUserAccountByOfficer = async function(targetUserId) {
  if (!ACTIVE_USER_SESSION || (ACTIVE_USER_SESSION.role !== "SUPER_OFFICER" && ACTIVE_USER_SESSION.role !== "SUB_OFFICER")) {
    alert("ACCESS DENIED: Only an authorized Officer can delete Retailer or Distributor IDs.");
    return;
  }

  const targetUser = GLOBAL_USERS.find(u => u.userId === targetUserId);
  if (!targetUser) return;

  if (Number(targetUser.coupons || 0) > 0) {
    alert(`DELETION BLOCKED:\n${targetUser.name} (${targetUserId}) still holds ${targetUser.coupons} unused coupons.`);
    return;
  }

  if (targetUser.role === "DISTRIBUTOR") {
    const downlineRetailers = GLOBAL_USERS.filter(u => u.role === "RETAILER" && u.parentId === targetUserId);
    if (downlineRetailers.length > 0) {
      alert(`DELETION BLOCKED:\nDistributor ${targetUser.name} still has ${downlineRetailers.length} Retailer(s) assigned under them.`);
      return;
    }
  }

  const reason = prompt(`Enter mandatory reason for permanently deleting ${targetUser.role} "${targetUser.name}" (${targetUserId}):`);
  if (reason === null) return;
  if (reason.trim().length < 4) {
    alert("Deletion cancelled: You must enter a valid deletion reason (minimum 4 characters).");
    return;
  }

  GLOBAL_USERS = GLOBAL_USERS.filter(u => u.userId !== targetUserId);
  await pushToGoogleSheets("DELETE_USER", { userId: targetUserId });

  await logPortalActivity(
    ACTIVE_USER_SESSION.userId,
    "OFFICER",
    "Deleted Account",
    `Deleted ${targetUser.role}: ${targetUser.name} (${targetUserId}) • Reason: ${reason.trim()}`
  );

  renderOfficerDistributorList();
  renderOfficerRetailerList();
  populateTopupDropdown();
  populateMappingDropdowns();
  updateDashboardKpis();
  showToast(`Account ${targetUserId} permanently deleted!`, "success");
};

// ================= OFFICER KYC APPROVAL ACTION =================
window.approveUserKyc = async function(targetUserId) {
  if (!ACTIVE_USER_SESSION || (ACTIVE_USER_SESSION.role !== "SUPER_OFFICER" && ACTIVE_USER_SESSION.role !== "SUB_OFFICER")) {
    return alert("Only an Officer can approve KYC.");
  }

  const targetUser = GLOBAL_USERS.find(u => u.userId === targetUserId);
  if (!targetUser) return;

  if (!targetUser.name || !targetUser.phone || !targetUser.pan) {
    return alert("Cannot approve KYC: User profile is missing Name, Mobile, or PAN.");
  }
  if (targetUser.role === "DISTRIBUTOR" && !targetUser.territoryValue) {
    return alert("Cannot approve Distributor KYC: Please assign PIN codes via Edit first.");
  }

  targetUser.userStatus = "APPROVED";
  targetUser.rejectionReason = "";
  targetUser.lastActiveAt = new Date().toISOString();

  await pushToGoogleSheets("UPDATE_USER_DETAILS", targetUser);
  await logPortalActivity(ACTIVE_USER_SESSION.userId, "OFFICER", "Approved KYC", `Approved KYC for ${targetUser.role}: ${targetUser.name} (${targetUserId})`);

  const msg = `*Account Approved & Unlocked!* ✅\n\nHello *${targetUser.name}*,\nYour *${targetUser.role}* account has been verified and approved.\n\n👤 *User ID:* ${targetUser.userId}\n🔑 *Temporary Password:* ${targetUser.password}\n\nSign in and set your new password on first login.\nThank you,\n*${GLOBAL_SETTINGS.brand_title}*`;
  await sendDirectWhatsAppMessage(targetUser.phone, msg);

  renderOfficerDistributorList();
  renderOfficerRetailerList();
  populateTopupDropdown();
  updateDashboardKpis();
  showToast(`Approved ${targetUser.name} & dispatched credentials!`, "success");
};

// ================= OFFICER EDIT / UPGRADE / CHANGE MAPPING MODAL =================
window.openEditUpgradeModal = function(userId) {
  const user = GLOBAL_USERS.find(u => u.userId === userId);
  if (!user) return;

  document.getElementById("editTargetUserId").value = user.userId;
  document.getElementById("editUserIdDisp").value = `${user.userId} (${user.role})`;
  document.getElementById("editUserRoleSelect").value = user.role;
  document.getElementById("editUserPins").value = user.territoryValue || "";
  document.getElementById("editUserName").value = user.name || "";
  document.getElementById("editUserPhone").value = user.phone || "";
  document.getElementById("editUserEmail").value = user.email || "";
  document.getElementById("editUserPan").value = user.pan || "";
  document.getElementById("editUserKycSelect").value = user.userStatus || "KYC_PENDING";

  const uplineSel = document.getElementById("editUserUplineSelect");
  if (uplineSel) {
    const distributors = GLOBAL_USERS.filter(u => u.role === "DISTRIBUTOR");
    const opts = distributors.map(d => `<option value="${d.userId}">${d.name} (${d.userId}) • PINs: ${d.territoryValue || "None"}</option>`).join("");
    uplineSel.innerHTML = `<option value="ADMIN">Direct Admin (No Distributor Mapping)</option>${opts}`;
    uplineSel.value = user.parentId || "ADMIN";
  }

  toggleEditModalPinBox();
  document.getElementById("editUpgradeUserModal")?.classList.add("open");
};

window.closeEditUpgradeModal = function() {
  document.getElementById("editUpgradeUserModal")?.classList.remove("open");
};

window.toggleEditModalPinBox = function() {
  const role = document.getElementById("editUserRoleSelect")?.value;
  const box = document.getElementById("editPinCodeGroup");
  const uplineBox = document.getElementById("editUplineDistGroup");
  if (box) box.style.display = role === "DISTRIBUTOR" ? "block" : "none";
  if (uplineBox) uplineBox.style.display = role === "RETAILER" ? "block" : "none";
};

function initEditUpgradeEngine() {
  document.getElementById("editUpgradeUserForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const userId = document.getElementById("editTargetUserId").value;
    const user = GLOBAL_USERS.find(u => u.userId === userId);
    if (!user) return;

    const newRole = document.getElementById("editUserRoleSelect").value;
    const newPins = document.getElementById("editUserPins").value.trim();
    const newUpline = document.getElementById("editUserUplineSelect")?.value || "ADMIN";
    const newName = document.getElementById("editUserName").value.trim().toUpperCase();
    const newPhone = document.getElementById("editUserPhone").value.trim();
    const newEmail = document.getElementById("editUserEmail").value.trim();
    const newPan = document.getElementById("editUserPan").value.trim().toUpperCase();
    const newKyc = document.getElementById("editUserKycSelect").value;

    const dupMsg = findDuplicateUserField(newPhone, newEmail, "", user.userId);
    if (dupMsg) return alert(`Duplicate Conflict:\n${dupMsg}`);

    if (user.role === "RETAILER" && newRole === "DISTRIBUTOR") {
      if (newKyc !== "APPROVED") {
        return alert("UPGRADE CRITERIA FAILED:\nUser KYC must be APPROVED before upgrading a Retailer to Distributor.");
      }
      if (!newPins) {
        return alert("UPGRADE CRITERIA FAILED:\nYou must assign at least one 6-digit PIN Code for the new Distributor.");
      }
    }

    if (newRole === "DISTRIBUTOR") {
      if (!newPins) return alert("Please enter at least one 6-digit PIN code for Distributor.");
      const check = checkMultiTerritoryAvailability("PINCODE", newPins, user.userId);
      if (check.conflicts.length > 0) {
        return alert(`PIN Code Conflict!\n${check.conflicts.map(c => `'${c.token}' is already assigned to ${c.name} (${c.bookedBy})`).join("\n")}`);
      }
    }

    const oldRole = user.role;
    user.role = newRole;
    user.name = newName || user.name;
    user.phone = newPhone || user.phone;
    user.email = newEmail || user.email;
    user.pan = newPan || user.pan;
    user.userStatus = newKyc;
    if (newKyc === "APPROVED") {
      user.lastActiveAt = new Date().toISOString();
      user.rejectionReason = "";
    }
    user.territoryType = newRole === "DISTRIBUTOR" ? "PINCODE" : "NONE";
    user.territoryValue = newRole === "DISTRIBUTOR" ? newPins : "";
    user.parentId = newRole === "DISTRIBUTOR" ? "ADMIN" : newUpline;

    await pushToGoogleSheets("UPDATE_USER_DETAILS", user);
    await logPortalActivity(
      ACTIVE_USER_SESSION?.userId || "ADMIN",
      "OFFICER",
      oldRole !== newRole ? `Upgraded Role (${oldRole} → ${newRole})` : "Updated Account & Mapping",
      `${user.name} (${user.userId}) • Mapping: ${user.parentId} • Status: ${newKyc}`
    );

    closeEditUpgradeModal();
    renderOfficerDistributorList();
    renderOfficerRetailerList();
    populateTopupDropdown();
    populateMappingDropdowns();
    updateDashboardKpis();
    showToast(`Account ${user.userId} updated!`, "success");
  });
}

// ================= KYC PENDING / INACTIVE LOCK CHECK =================
window.checkLiveKycApprovalStatus = async function() {
  await syncFromGoogleSheets();
  if (!ACTIVE_USER_SESSION) return;
  const freshUser = GLOBAL_USERS.find(u => u.userId === ACTIVE_USER_SESSION.userId);
  if (freshUser && freshUser.userStatus === "APPROVED") {
    document.getElementById("kycPendingScreen").style.display = "none";
    grantUserDashboardAccess(freshUser);
  } else {
    showToast("Your account is still awaiting Officer approval or reactivation.", "error");
  }
};

function ensureKycApprovedOrBlock() {
  if (!ACTIVE_USER_SESSION) return false;
  if (ACTIVE_USER_SESSION.role === "SUPER_OFFICER" || ACTIVE_USER_SESSION.role === "SUB_OFFICER") return true;
  if (ACTIVE_USER_SESSION.impersonatedByOfficer) return true;
  const live = GLOBAL_USERS.find(u => u.userId === ACTIVE_USER_SESSION.userId) || ACTIVE_USER_SESSION;
  if (live.userStatus !== "APPROVED") {
    alert("Your account is not active! All portal options remain locked until the Officer approves or activates your account.");
    return false;
  }
  return true;
}

// ================= PIN CODE AVAILABILITY CHECKER =================
window.verifyPincodeAvailability = function(inputId, resultBoxId) {
  const pin = document.getElementById(inputId)?.value.trim();
  const resultBox = document.getElementById(resultBoxId);
  if (!resultBox) return;

  if (!pin || pin.length !== 6 || isNaN(pin)) {
    resultBox.innerHTML = `<span style="color:#dc2626; font-weight:700;">Please enter a valid 6-digit PIN code.</span>`;
    return;
  }

  const occupant = GLOBAL_USERS.find(u => {
    if (u.role !== "DISTRIBUTOR" || !u.territoryValue) return false;
    const allocatedPins = String(u.territoryValue).split(",").map(p => p.trim());
    return allocatedPins.includes(pin);
  });

  if (occupant) {
    resultBox.innerHTML = `
      <div style="background:#fef2f2; border:1px solid #fca5a5; color:#991b1b; padding:10px 12px; border-radius:8px; margin-top:6px;">
        <strong>PIN Code ${pin} is OCCUPIED</strong><br>
        <span style="font-size:11px;">Distributor: <b>${occupant.name}</b> (<code>${occupant.userId}</code>) • Mobile: <b>${occupant.phone}</b></span>
      </div>
    `;
  } else {
    resultBox.innerHTML = `
      <div style="background:#ecfdf5; border:1px solid #6ee7b7; color:#065f46; padding:10px 12px; border-radius:8px; margin-top:6px;">
        <strong>PIN Code ${pin} is AVAILABLE</strong><br>
        <span style="font-size:11px;">No Distributor is assigned to this PIN code yet.</span>
      </div>
    `;
  }
};

// ================= LIVE POSTAL PIN CODE AUTO-FILL =================
window.handlePincodeLookup = async function(pincode, stateId, distId, townId) {
  const pin = String(pincode || "").trim();
  if (pin.length !== 6 || isNaN(pin)) return;

  try {
    const res = await fetch(`https://api.postalpincode.in/pincode/${pin}`);
    const data = await res.json();
    if (data && data[0] && data[0].Status === "Success" && data[0].PostOffice?.length) {
      const po = data[0].PostOffice[0];
      if (stateId && document.getElementById(stateId)) document.getElementById(stateId).value = po.State || "";
      if (distId && document.getElementById(distId)) document.getElementById(distId).value = po.District || "";
      if (townId && document.getElementById(townId)) document.getElementById(townId).value = po.Block !== "NA" ? po.Block : (po.Name || "");
      showToast(`Location Loaded: ${po.District}, ${po.State}`, "success");
      return;
    }
  } catch (err) {
    console.warn("Postal API fallback", err);
  }

  if (stateId && document.getElementById(stateId)) document.getElementById(stateId).value = "West Bengal";
  if (distId && document.getElementById(distId)) document.getElementById(distId).value = "Jalpaiguri";
  if (townId && document.getElementById(townId)) document.getElementById(townId).value = "Maynaguri";
};

// ================= GLOBAL MODAL CONTROLS =================
window.openPanCorrectionModal = function(context = "PUBLIC") {
  if (context === "RETAILER" && !ensureKycApprovedOrBlock()) return;
  const modal = document.getElementById("panCorrectionModal");
  const ctxInput = document.getElementById("corrContext");
  if (ctxInput) ctxInput.value = context;

  const publicBox = document.getElementById("publicCorrMobileCheckSection");
  if (publicBox) publicBox.style.display = context === "PUBLIC" ? "block" : "none";

  onCorrPortalChanged();
  if (modal) modal.classList.add("open");
};

window.closePanCorrectionModal = function() {
  document.getElementById("panCorrectionModal")?.classList.remove("open");
  document.getElementById("panCorrectionForm")?.reset();
  toggleRepresentativeAssessee();
  VERIFIED_CORR_PUBLIC_MOBILE = null;
};

window.verifyPublicCorrMobileCoupon = function() {
  const mobile = document.getElementById("publicCorrVerifyMobile")?.value.trim();
  const statusTxt = document.getElementById("publicCorrCouponStatusText");

  if (!mobile || mobile.length !== 10) return showToast("Enter a valid 10-digit mobile number", "error");

  const count = PUBLIC_MOBILE_COUPONS[mobile] || 0;
  if (count > 0) {
    VERIFIED_CORR_PUBLIC_MOBILE = mobile;
    statusTxt.style.color = "#15803d";
    statusTxt.innerHTML = `Mobile Verified! Available Coupons: <b>${count} Pcs</b>.`;
    document.getElementById("corrMobile").value = mobile;
  } else {
    statusTxt.style.color = "#b91c1c";
    statusTxt.innerHTML = `No Coupons found for ${mobile}! Please contact Admin to get coupon stock.`;
  }
};

window.openLoginModal = function() { document.getElementById("loginModal")?.classList.add("open"); };
window.closeLoginModal = function() { document.getElementById("loginModal")?.classList.remove("open"); };
window.openPublicRegModal = function() {
  populatePublicRegistrationDropdowns();
  document.getElementById("publicRegModal")?.classList.add("open");
};
window.closePublicRegModal = function() { document.getElementById("publicRegModal")?.classList.remove("open"); };

window.showSuccessModal = function(name, ackNo, customSubtext = "") {
  document.getElementById("successApplicantName").innerText = name || "Valued Applicant";
  document.getElementById("successAckNo").innerText = ackNo || "N/A";
  const subEl = document.getElementById("successModalSubtext");
  if (subEl) {
    subEl.innerText = customSubtext || "Pending Officer approval.";
  }
  document.getElementById("successPopupModal")?.classList.add("open");
};
window.closeSuccessPopupModal = function() { document.getElementById("successPopupModal")?.classList.remove("open"); };

// ================= UNIVERSAL PROFILE MODAL =================
window.openProfileModal = function(portalRole) {
  const user = ACTIVE_USER_SESSION || (portalRole === "OFFICER" ? GLOBAL_OFFICERS[0] : null);
  if (!user) return showToast("Please sign in to view profile", "error");

  const live = GLOBAL_USERS.find(u => u.userId === user.userId) || user;

  document.getElementById("modalProfName").innerText = live.name || "Enterprise User";
  document.getElementById("modalProfId").innerText = live.userId || "-";
  document.getElementById("modalProfRole").innerText = (live.role || portalRole).replace("_", " ");
  document.getElementById("modalProfPhone").innerText = live.phone || "Not Set";
  document.getElementById("modalProfCoupons").innerText = (live.role === "SUPER_OFFICER" || live.role === "SUB_OFFICER") ? "UNLIMITED" : `${live.coupons || 0} Pcs`;
  document.getElementById("modalProfStatus").innerText = live.userStatus || "APPROVED";

  const uplineSec = document.getElementById("modalUplineSection");
  const uplineLbl = document.getElementById("modalUplineLabel");
  const uplineNameEl = document.getElementById("modalUplineName");
  const uplinePhoneEl = document.getElementById("modalUplinePhone");

  if (live.role === "RETAILER") {
    uplineSec.style.display = "flex";
    uplineLbl.innerText = "MAPPED UPLINE DISTRIBUTOR";
    const dist = GLOBAL_USERS.find(u => u.userId === live.parentId);
    if (dist) {
      uplineNameEl.innerText = `${dist.name} (${dist.userId})`;
      uplinePhoneEl.innerText = dist.phone || GLOBAL_SETTINGS.company_phone;
    } else {
      uplineNameEl.innerText = "Direct Admin (Super Officer)";
      uplinePhoneEl.innerText = GLOBAL_SETTINGS.company_phone;
    }
  } else if (live.role === "DISTRIBUTOR") {
    uplineSec.style.display = "flex";
    uplineLbl.innerText = "SUPER OFFICER";
    uplineNameEl.innerText = "Debajit Biswas (Super Officer)";
    uplinePhoneEl.innerText = GLOBAL_SETTINGS.company_phone;
  } else {
    uplineSec.style.display = "none";
  }

  document.getElementById("modalCompanyPhone").innerText = GLOBAL_SETTINGS.company_phone;
  document.getElementById("modalCompanyEmail").innerText = GLOBAL_SETTINGS.company_email;

  document.getElementById("userProfileModal")?.classList.add("open");
};

window.closeProfileModal = function() { document.getElementById("userProfileModal")?.classList.remove("open"); };

// ================= UNIVERSAL COMPLAINT & TICKET ENGINE =================
window.openComplaintModal = function() {
  if (!ACTIVE_USER_SESSION) return showToast("Please sign in first", "error");
  if (!ensureKycApprovedOrBlock()) return;
  document.getElementById("universalComplaintModal")?.classList.add("open");
};
window.closeComplaintModal = function() {
  document.getElementById("universalComplaintModal")?.classList.remove("open");
  document.getElementById("globalComplaintForm")?.reset();
};

function renderUserOwnTickets(containerId) {
  const container = document.getElementById(containerId);
  if (!container || !ACTIVE_USER_SESSION) return;

  const myTickets = GLOBAL_COMPLAINTS.filter(c => String(c.senderId) === String(ACTIVE_USER_SESSION.userId));
  if (!myTickets.length) {
    container.innerHTML = `<p class="text-secondary text-center" style="padding:12px;">No support tickets submitted yet.</p>`;
    return;
  }

  container.innerHTML = myTickets.map(t => {
    const isResolved = t.status === "RESOLVED";
    const bg = isResolved ? "#dcfce7" : "#fef3c7";
    const col = isResolved ? "#15803d" : "#b45309";
    return `
      <div style="padding:12px; border:1px solid var(--border-color); border-radius:10px; background:#fff; margin-bottom:8px;">
        <div class="flex-between">
          <div><strong>${t.subject}</strong> • <code class="font-bold">${t.ticketId}</code></div>
          <span class="status-badge-inline" style="background:${bg}; color:${col};">${t.status || "OPEN"}</span>
        </div>
        <div style="font-size:11.5px; color:var(--text-secondary); margin-top:4px;">
          Message: ${t.message} • Date: ${t.date || "-"}
        </div>
        ${t.adminReply ? `
          <div style="margin-top:8px; padding:8px 10px; background:#eff6ff; border-left:3px solid #2563eb; border-radius:6px; font-size:11.5px; color:#1e3a8a;">
            <strong>Officer Reply:</strong> ${t.adminReply}
          </div>
        ` : `<div style="margin-top:6px; font-size:11px; color:#64748b;">Status: Awaiting Officer review...</div>`}
      </div>
    `;
  }).join("");
}

window.updateTicketStatusByOfficer = async function(ticketId, newStatus) {
  const ticket = GLOBAL_COMPLAINTS.find(c => c.ticketId === ticketId);
  if (!ticket) return;
  const replyText = prompt(`Enter reply/note for ticket ${ticketId} (${newStatus}):`, ticket.adminReply || "");
  if (replyText === null) return;

  ticket.status = newStatus;
  ticket.adminReply = replyText.trim();

  await pushToGoogleSheets("UPDATE_COMPLAINT_STATUS", {
    ticketId: ticket.ticketId,
    senderId: ticket.senderId,
    status: ticket.status,
    adminReply: ticket.adminReply
  });

  renderOfficerComplaintList();
  renderUserOwnTickets("retMyTicketsList");
  renderUserOwnTickets("distMyTicketsList");
  showToast(`Ticket ${ticketId} updated to ${newStatus}`, "success");
};

function initComplaintEngine() {
  document.getElementById("globalComplaintForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const ticketId = "TCK" + generateRandomDigits(6);
    const subject = document.getElementById("compSubject")?.value.trim();
    const message = document.getElementById("compMessage")?.value.trim();

    const newTicket = {
      ticketId,
      senderId: ACTIVE_USER_SESSION ? ACTIVE_USER_SESSION.userId : "DIRECT_USER",
      senderRole: ACTIVE_USER_SESSION ? ACTIVE_USER_SESSION.role : "AGENT",
      subject,
      message,
      date: new Date().toLocaleDateString(),
      status: "OPEN",
      adminReply: ""
    };

    GLOBAL_COMPLAINTS.unshift(newTicket);
    await pushToGoogleSheets("ADD_COMPLAINT", newTicket);
    await logPortalActivity(newTicket.senderId, newTicket.senderRole, "Raised Complaint", `${subject} (${ticketId})`);

    closeComplaintModal();
    renderOfficerComplaintList();
    renderUserOwnTickets("retMyTicketsList");
    renderUserOwnTickets("distMyTicketsList");
    showToast(`Complaint Logged! Ticket: ${ticketId}`, "success");
  });
}

function renderOfficerComplaintList() {
  const container = document.getElementById("officerComplaintListContainer");
  if (!container) return;
  if (!GLOBAL_COMPLAINTS.length) {
    container.innerHTML = `<p class="text-secondary text-center" style="padding:16px;">No complaints logged yet.</p>`;
    return;
  }
  container.innerHTML = GLOBAL_COMPLAINTS.map(c => `
    <div style="padding:12px; border-bottom:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center; background:#fff; flex-wrap:wrap; gap:8px;">
      <div>
        <strong>${c.subject}</strong> • <code class="font-bold">${c.ticketId}</code> (${c.senderId})<br>
        <span style="font-size:11.5px; color:var(--text-secondary);">${c.message}</span>
        ${c.adminReply ? `<br><span style="font-size:11px; color:#1d4ed8; font-weight:700;">Reply: ${c.adminReply}</span>` : ""}
      </div>
      <div style="display:flex; align-items:center; gap:6px;">
        <span class="status-badge-inline" style="background:${c.status === 'RESOLVED' ? '#dcfce7' : '#fef3c7'}; color:${c.status === 'RESOLVED' ? '#15803d' : '#b45309'};">${c.status}</span>
        <button type="button" class="btn-mini-action" style="background:#eff6ff; color:#1d4ed8;" onclick="updateTicketStatusByOfficer('${c.ticketId}', 'IN_PROGRESS')">In Progress</button>
        <button type="button" class="btn-mini-action" style="background:#dcfce7; color:#15803d;" onclick="updateTicketStatusByOfficer('${c.ticketId}', 'RESOLVED')">Resolve</button>
      </div>
    </div>
  `).join("");
}

// ================= REAL VIEW & DOWNLOAD ACTIONS =================
window.downloadDocumentFile = function(fileUrl, fileName) {
  if (!fileUrl) return showToast("File not available", "error");
  if (fileUrl.startsWith("http")) {
    window.open(fileUrl, "_blank");
    return;
  }
  const a = document.createElement("a");
  a.href = fileUrl;
  a.download = fileName || "Document.pdf";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showToast(`Downloading: ${fileName}`, "success");
};

window.previewDocumentFile = function(fileUrl, docName) {
  if (!fileUrl) return showToast("File not available", "error");
  if (fileUrl.startsWith("http")) {
    window.open(fileUrl, "_blank");
    return;
  }
  const newWin = window.open();
  if (newWin) {
    newWin.document.write(`
      <html>
        <head><title>Preview - ${docName}</title></head>
        <body style="margin:0; background:#0f172a; display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh;">
          <iframe src="${fileUrl}" style="border:none; width:100%; height:100%;" allowfullscreen></iframe>
        </body>
      </html>
    `);
  }
};

// ================= DOM CONTENT LOADED =================
document.addEventListener("DOMContentLoaded", () => {
  populateDobProofDropdowns();
  initUnifiedLogin();
  initDistributorConsole();
  initOfficerAppGrid();
  initOfficerModal();
  initRejectionEngine();
  initEditUpgradeEngine();
  initRetailerMappingEngine();
  initBrandLogoSettingsEngine();
  initGoogleSheetsConfigEngine();
  initCouponRequestEngine();
  initRetailerSelfRegistration();
  initInstantLogout();
  initGlobalSettingsEngine();
  initCustomIdManager();
  applyGlobalSettingsToDOM();
  initPublicTracking();
  initPublicRegistrationSystem();
  initComprehensivePanEngine();
  initPanCorrectionEngine();
  initOfficerManagementEngine();
  initComplaintEngine();
  renderOfficerActivityFeeds();

  if (APPS_SCRIPT_URL) {
    syncFromGoogleSheets();
  }
});

function purgeOldRejectedRegistrations() {
  const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  GLOBAL_CHANNEL_REGISTRATIONS = GLOBAL_CHANNEL_REGISTRATIONS.filter(r => {
    if (r.status === "REJECTED" && r.rejectedAt) {
      return (now - new Date(r.rejectedAt).getTime()) < threeDaysMs;
    }
    return true;
  });
}

function generateRandomDigits(length) {
  let result = "";
  for (let i = 0; i < length; i++) result += Math.floor(Math.random() * 10);
  return result;
}

function generate9DigitUserId(role) {
  const digits = generateRandomDigits(9);
  if (role === "DISTRIBUTOR") return `D${digits}`;
  if (role === "OFFICER") return `OFC${digits}`;
  return `R${digits}`;
}

function generateAutoPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let pass = "";
  for (let i = 0; i < 8; i++) pass += chars.charAt(Math.floor(Math.random() * chars.length));
  return pass;
}

function populateDobProofDropdowns() {
  document.querySelectorAll(".dob-proof-dropdown").forEach(sel => {
    const currentVal = sel.value;
    sel.innerHTML = DOB_PROOF_OPTIONS.map((opt, idx) => {
      const val = idx === 0 ? "" : opt;
      return `<option value="${val}">${opt}</option>`;
    }).join("");
    if (DOB_PROOF_OPTIONS.includes(currentVal)) sel.value = currentVal;
  });
}

// ================= PAN CORRECTION (CSF) ENGINE =================
window.onCorrPortalChanged = function() {
  const portal = document.querySelector('input[name="corrPortalChoice"]:checked')?.value || "NSDL";
  populateDobProofDropdowns();

  const motherLabel = document.getElementById("corrMotherLabel");
  const motherInput = document.getElementById("corrMotherName");
  const specBanner = document.getElementById("corrSpecBanner");
  const photoLbl = document.getElementById("lblCorrPhotoSpec");
  const signLbl = document.getElementById("lblCorrSignSpec");

  if (portal === "NSDL") {
    if (motherLabel) motherLabel.innerText = "Mother's Full Name (Mandatory for NSDL) *";
    if (motherInput) motherInput.required = true;
    if (specBanner) specBanner.innerText = "NSDL Spec: Photo 200×200px (≤50KB) | Signature 400×200px (≤50KB)";
    if (photoLbl) photoLbl.innerText = "Photo (200×200px) *";
    if (signLbl) signLbl.innerText = "Signature (400×200px) *";
  } else {
    if (motherLabel) motherLabel.innerText = "Mother's Full Name (Optional for UTIITSL)";
    if (motherInput) motherInput.required = false;
    if (specBanner) specBanner.innerText = "UTIITSL Spec: Photo 213×213px (≤30KB) | Signature 400×200px (≤60KB)";
    if (photoLbl) photoLbl.innerText = "Photo (213×213px) *";
    if (signLbl) signLbl.innerText = "Signature (400×200px) *";
  }
};

window.toggleRepresentativeAssessee = function() {
  const val = document.getElementById("corrCategorySelect")?.value;
  const box = document.getElementById("representativeAssesseeBox");
  const isMinor = val === "MINOR";
  if (box) box.style.display = isMinor ? "block" : "none";
  document.querySelectorAll(".ra-dynamic-req").forEach(el => { el.required = isMinor; });
};

function initPanCorrectionEngine() {
  document.getElementById("panCorrectionForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const portal = document.querySelector('input[name="corrPortalChoice"]:checked')?.value || "NSDL";
    const context = document.getElementById("corrContext")?.value;

    const prefix = portal === "NSDL" ? "NC" : "UC";
    const token = `${prefix}${generateRandomDigits(9)}`;
    const applicantName = document.getElementById("corrApplicantName").value.trim().toUpperCase();

    if (context === "PUBLIC") {
      if (!VERIFIED_CORR_PUBLIC_MOBILE || (PUBLIC_MOBILE_COUPONS[VERIFIED_CORR_PUBLIC_MOBILE] || 0) < 1) {
        return alert("Coupon verification failed or zero coupons remaining on this mobile!");
      }
      PUBLIC_MOBILE_COUPONS[VERIFIED_CORR_PUBLIC_MOBILE] -= 1;
      await pushToGoogleSheets("UPDATE_PUBLIC_COUPON", { mobile: VERIFIED_CORR_PUBLIC_MOBILE, count: PUBLIC_MOBILE_COUPONS[VERIFIED_CORR_PUBLIC_MOBILE] });
    } else {
      if (!ensureKycApprovedOrBlock()) return;
      const liveUser = GLOBAL_USERS.find(u => u.userId === ACTIVE_USER_SESSION?.userId);
      if (!liveUser || liveUser.coupons < 1) return alert("Zero Coupons in Retailer Inventory!");
      liveUser.coupons -= 1;
      await touchUserLastActive(liveUser.userId);
      updateSessionWalletUI();
      updateDashboardKpis();
      await pushToGoogleSheets("UPDATE_USER_COUPONS", { userId: liveUser.userId, coupons: liveUser.coupons });
    }

    const submitBtn = document.getElementById("btnSubmitCorrForm");
    if (submitBtn) { submitBtn.disabled = true; submitBtn.innerText = "Formatting & Uploading..."; }

    const correctionTypes = [];
    document.querySelectorAll("input[name='corrOptions']:checked").forEach(cb => correctionTypes.push(cb.value));

    const aadhaarFrontUrl = await readFileAsDataUrl(document.getElementById("fileCorrAadhaarFront"));
    const aadhaarBackUrl = await readFileAsDataUrl(document.getElementById("fileCorrAadhaarBack"));
    const dobUrl = await readFileAsDataUrl(document.getElementById("fileCorrDob"));
    const photoUrl = await autoFormatPanImage(document.getElementById("fileCorrPhoto"), portal, "PHOTO");
    const signUrl = await autoFormatPanImage(document.getElementById("fileCorrSign"), portal, "SIGN");
    const panUrl = await readFileAsDataUrl(document.getElementById("fileCorrPanCopy"));

    const sourceLabel = context === "RETAILER" && ACTIVE_USER_SESSION ? ACTIVE_USER_SESSION.userId : `DIRECT_PUBLIC (${VERIFIED_CORR_PUBLIC_MOBILE || "WEB"})`;
    const fullAddr = `${document.getElementById("corrFlatNo").value}, ${document.getElementById("corrBuilding").value}, ${document.getElementById("corrStreet").value}, ${document.getElementById("corrArea").value}, ${document.getElementById("corrTown").value}, ${document.getElementById("corrDistrict").value}, ${document.getElementById("corrState").value} - ${document.getElementById("corrPinCode").value}`;

    const newCorrRecord = {
      date: new Date().toLocaleDateString(),
      appId: token,
      serviceType: `${portal}_CORRECTION`,
      name: applicantName,
      panNumber: document.getElementById("corrPanNumber").value.trim().toUpperCase(),
      fatherName: document.getElementById("corrFatherName").value.trim().toUpperCase(),
      motherName: document.getElementById("corrMotherName").value.trim().toUpperCase(),
      dob: document.getElementById("corrDob").value,
      gender: document.getElementById("corrGender").value,
      phone: document.getElementById("corrMobile").value.trim(),
      email: document.getElementById("corrEmail").value.trim(),
      aadhaar: document.getElementById("corrAadhaar").value.trim(),
      pin: document.getElementById("corrPinCode").value.trim(),
      fullAddress: fullAddr,
      proofDob: document.getElementById("corrProofDob").value,
      category: document.getElementById("corrCategorySelect").value,
      corrections: correctionTypes.join(", "),
      status: "UNDER_VERIFICATION",
      officialAck: "",
      rejectionReason: "",
      retailerId: sourceLabel,
      files: {
        fileAadhaarFront: aadhaarFrontUrl,
        fileAadhaarBack: aadhaarBackUrl,
        fileDob: dobUrl,
        filePhoto: photoUrl,
        fileSignature: signUrl,
        filePan: panUrl
      }
    };

    const cloudRes = await pushToGoogleSheets("ADD_APPLICATION", newCorrRecord);
    if (cloudRes && cloudRes.fileLinks) {
      newCorrRecord.files = { ...newCorrRecord.files, ...cloudRes.fileLinks };
    }

    GLOBAL_APPLICATIONS.unshift(newCorrRecord);
    await logPortalActivity(sourceLabel, context, `PAN Correction Submitted (${portal})`, `Applicant: ${applicantName} • Token: ${token}`);

    if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = "Submit PAN Correction Application"; }
    closePanCorrectionModal();
    renderRetailerHistory();
    renderAdminAppQueue();
    updateDashboardKpis();

    showSuccessModal(applicantName, token, "Your PAN correction application has been submitted for Officer verification.");
  });
}

// ================= NEW PAN APPLICATION (49A) ENGINE =================
window.onPanPortalRadioChanged = function() {
  const portal = document.querySelector('input[name="unifiedPortalChoice"]:checked')?.value || "NSDL";
  const portalInput = document.getElementById("panSelectedPortal");
  if (portalInput) portalInput.value = portal;

  populateDobProofDropdowns();

  const motherLabel = document.getElementById("panMotherLabel");
  const motherInput = document.getElementById("panMotherName");
  const specBanner = document.getElementById("newPanSpecBanner");
  const photoLbl = document.getElementById("lblNewPanPhotoSpec");
  const signLbl = document.getElementById("lblNewPanSignSpec");

  if (portal === "NSDL") {
    if (motherLabel) motherLabel.innerText = "Mother's Legal Name (Mandatory for NSDL) *";
    if (motherInput) motherInput.required = true;
    if (specBanner) specBanner.innerText = "NSDL Spec: Photo 200×200px (≤50KB) | Signature 400×200px (≤50KB)";
    if (photoLbl) photoLbl.innerText = "Applicant Photo (200×200px) *";
    if (signLbl) signLbl.innerText = "Applicant Signature (400×200px) *";
  } else {
    if (motherLabel) motherLabel.innerText = "Mother's Legal Name (Optional for UTIITSL)";
    if (motherInput) motherInput.required = false;
    if (specBanner) specBanner.innerText = "UTIITSL Spec: Photo 213×213px (≤30KB) | Signature 400×200px (≤60KB)";
    if (photoLbl) photoLbl.innerText = "Applicant Photo (213×213px) *";
    if (signLbl) signLbl.innerText = "Applicant Signature (400×200px) *";
  }
};

window.openPublicPanModal = function() {
  const modal = document.getElementById("unifiedPanModal");
  document.getElementById("panApplicantContext").value = "PUBLIC";
  document.getElementById("panModalTitle").innerText = "Direct Public PAN Card Application (Form 49A)";
  document.getElementById("publicPanMobileCheckSection").style.display = "block";
  document.getElementById("comprehensivePanForm").style.display = "none";

  document.getElementById("newPanTabNsdl").style.display = "block";
  document.getElementById("newPanTabUti").style.display = "block";
  onPanPortalRadioChanged();
  modal?.classList.add("open");
};

window.launchRetailerPanForm = function(portalType) {
  if (!ensureKycApprovedOrBlock()) return;
  const liveUser = GLOBAL_USERS.find(u => u.userId === ACTIVE_USER_SESSION?.userId);
  if (!liveUser || liveUser.coupons < 1) return showToast("No coupons available in Retailer wallet!", "error");

  const modal = document.getElementById("unifiedPanModal");
  document.getElementById("panApplicantContext").value = "RETAILER";
  document.getElementById("panModalTitle").innerText = `${portalType} Application Terminal (Retailer)`;
  document.getElementById("publicPanMobileCheckSection").style.display = "none";
  document.getElementById("comprehensivePanForm").style.display = "block";

  const tabNsdl = document.getElementById("newPanTabNsdl");
  const tabUti = document.getElementById("newPanTabUti");
  if (portalType === "UTIITSL") {
    if (tabNsdl) tabNsdl.style.display = "none";
    if (tabUti) tabUti.style.display = "block";
  } else {
    if (tabNsdl) tabNsdl.style.display = "block";
    if (tabUti) tabUti.style.display = "none";
  }

  const radios = document.getElementsByName("unifiedPortalChoice");
  radios.forEach(r => { if (r.value === portalType) r.checked = true; });
  onPanPortalRadioChanged();

  modal?.classList.add("open");
};

window.closeUnifiedPanModal = function() {
  document.getElementById("unifiedPanModal")?.classList.remove("open");
  document.getElementById("comprehensivePanForm")?.reset();
  VERIFIED_PUBLIC_MOBILE = null;
};

window.verifyPublicMobileCoupon = function() {
  const mobile = document.getElementById("publicPanVerifyMobile")?.value.trim();
  const statusTxt = document.getElementById("publicCouponStatusText");

  if (!mobile || mobile.length !== 10) return showToast("Enter a valid 10-digit mobile number", "error");

  const count = PUBLIC_MOBILE_COUPONS[mobile] || 0;
  if (count > 0) {
    VERIFIED_PUBLIC_MOBILE = mobile;
    statusTxt.style.color = "#15803d";
    statusTxt.innerHTML = `Mobile Verified! Available Coupons: <b>${count} Pcs</b>.`;
    document.getElementById("comprehensivePanForm").style.display = "block";
    document.getElementById("panMobile").value = mobile;
  } else {
    statusTxt.style.color = "#b91c1c";
    statusTxt.innerHTML = `No Coupons found for ${mobile}! Please contact Admin to get coupon stock.`;
  }
};

function initComprehensivePanEngine() {
  document.getElementById("comprehensivePanForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const context = document.getElementById("panApplicantContext").value;
    const portal = document.getElementById("panSelectedPortal").value;

    const prefix = portal === "NSDL" ? "N" : "U";
    const token = `${prefix}${generateRandomDigits(9)}`;
    const applicantName = document.getElementById("panApplicantName").value.trim().toUpperCase();

    if (context === "PUBLIC") {
      if (!VERIFIED_PUBLIC_MOBILE || (PUBLIC_MOBILE_COUPONS[VERIFIED_PUBLIC_MOBILE] || 0) < 1) {
        return alert("Coupon verification failed or zero coupons remaining!");
      }
      PUBLIC_MOBILE_COUPONS[VERIFIED_PUBLIC_MOBILE] -= 1;
      await pushToGoogleSheets("UPDATE_PUBLIC_COUPON", { mobile: VERIFIED_PUBLIC_MOBILE, count: PUBLIC_MOBILE_COUPONS[VERIFIED_PUBLIC_MOBILE] });
    } else {
      if (!ensureKycApprovedOrBlock()) return;
      const liveUser = GLOBAL_USERS.find(u => u.userId === ACTIVE_USER_SESSION?.userId);
      if (!liveUser || liveUser.coupons < 1) return alert("Zero Coupons in Retailer Inventory!");
      liveUser.coupons -= 1;
      await touchUserLastActive(liveUser.userId);
      updateSessionWalletUI();
      updateDashboardKpis();
      await pushToGoogleSheets("UPDATE_USER_COUPONS", { userId: liveUser.userId, coupons: liveUser.coupons });
    }

    const submitBtn = document.getElementById("btnSubmitNewPanForm");
    if (submitBtn) { submitBtn.disabled = true; submitBtn.innerText = "Formatting & Uploading..."; }

    const frontUrl = await readFileAsDataUrl(document.getElementById("fileAadhaarFront"));
    const backUrl = await readFileAsDataUrl(document.getElementById("fileAadhaarBack"));
    const dobUrl = await readFileAsDataUrl(document.getElementById("fileDobFront"));
    const photoUrl = await autoFormatPanImage(document.getElementById("filePhoto"), portal, "PHOTO");
    const signUrl = await autoFormatPanImage(document.getElementById("fileSignature"), portal, "SIGN");

    const sourceLabel = context === "RETAILER" ? ACTIVE_USER_SESSION.userId : `DIRECT_PUBLIC (${VERIFIED_PUBLIC_MOBILE})`;
    const fullAddr = `${document.getElementById("panFlatNo").value}, ${document.getElementById("panBuilding").value}, ${document.getElementById("panStreet").value}, ${document.getElementById("panArea").value}, ${document.getElementById("panTownInput").value}, ${document.getElementById("panDistrictInput").value}, ${document.getElementById("panStateInput").value} - ${document.getElementById("panPinCode").value}`;

    const newPanRecord = {
      date: new Date().toLocaleDateString(),
      appId: token,
      serviceType: portal,
      name: applicantName,
      fatherName: document.getElementById("panFatherName").value.trim().toUpperCase(),
      motherName: document.getElementById("panMotherName").value.trim().toUpperCase(),
      dob: document.getElementById("panDob").value,
      gender: document.getElementById("panGender").value,
      phone: document.getElementById("panMobile").value.trim(),
      email: document.getElementById("panEmail").value.trim(),
      aadhaar: document.getElementById("panAadhaarNo").value.trim(),
      pin: document.getElementById("panPinCode").value.trim(),
      fullAddress: fullAddr,
      proofDob: document.getElementById("panProofDob").value,
      applicantContext: context,
      retailerId: sourceLabel,
      status: "UNDER_VERIFICATION",
      officialAck: "",
      rejectionReason: "",
      files: {
        fileAadhaarFront: frontUrl,
        fileAadhaarBack: backUrl,
        fileDob: dobUrl,
        filePhoto: photoUrl,
        fileSignature: signUrl
      }
    };

    const cloudRes = await pushToGoogleSheets("ADD_APPLICATION", newPanRecord);
    if (cloudRes && cloudRes.fileLinks) {
      newPanRecord.files = { ...newPanRecord.files, ...cloudRes.fileLinks };
    }

    GLOBAL_APPLICATIONS.unshift(newPanRecord);
    await logPortalActivity(sourceLabel, context, `New PAN Applied (${portal})`, `Applicant: ${applicantName} • Token: ${token}`);

    if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = "Submit PAN Application"; }
    closeUnifiedPanModal();
    renderRetailerHistory();
    renderAdminAppQueue();
    updateDashboardKpis();

    showSuccessModal(applicantName, token, "Your PAN application has been submitted for Officer verification.");
  });

  document.getElementById("publicMobileCouponForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const mobile = document.getElementById("pubCouponMobileInput")?.value.trim();
    const count = Number(document.getElementById("pubCouponCountInput")?.value);
    if (!mobile || mobile.length !== 10) return showToast("Enter valid 10-digit mobile", "error");

    PUBLIC_MOBILE_COUPONS[mobile] = (PUBLIC_MOBILE_COUPONS[mobile] || 0) + count;
    await pushToGoogleSheets("UPDATE_PUBLIC_COUPON", { mobile, count: PUBLIC_MOBILE_COUPONS[mobile] });

    showToast(`Allocated ${count} Coupons to Mobile: ${mobile}`, "success");
    document.getElementById("publicMobileCouponForm").reset();
    renderPublicCouponsList();
  });
}

function renderPublicCouponsList() {
  const container = document.getElementById("publicCouponsListDisplay");
  if (!container) return;
  const keys = Object.keys(PUBLIC_MOBILE_COUPONS);
  if (!keys.length) {
    container.innerHTML = `<span class="text-secondary">No public coupon numbers allocated yet.</span>`;
    return;
  }
  container.innerHTML = keys.map(mob => `
    <div style="display:flex; justify-content:space-between; padding:5px 0; border-bottom:1px solid #e2e8f0; font-size:11.5px;">
      <span>Mobile: <b>${mob}</b></span>
      <span style="color:#059669; font-weight:800;">${PUBLIC_MOBILE_COUPONS[mob]} Pcs</span>
    </div>
  `).join("");
}

// ================= MANUAL ID MANAGER & PUBLIC REGISTRATION =================
function initCustomIdManager() {
  document.getElementById("addCustomIdForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const code = document.getElementById("newIdCode")?.value.trim().toUpperCase();
    const appName = document.getElementById("newAppName")?.value.trim();
    if (!code || !appName) return;

    OFFICER_CONFIGURED_IDS.push({ idCode: code, appName });
    await pushToGoogleSheets("UPDATE_CONFIGURED_IDS", OFFICER_CONFIGURED_IDS);
    renderOfficerCustomIdList();
    document.getElementById("addCustomIdForm").reset();
    showToast("ID added to registration dropdown!", "success");
  });
  renderOfficerCustomIdList();
}

function renderOfficerCustomIdList() {
  const container = document.getElementById("officerConfiguredIdList");
  if (!container) return;
  if (!OFFICER_CONFIGURED_IDS.length) {
    container.innerHTML = `<span class="text-secondary">No IDs configured. Add one above.</span>`;
    return;
  }
  container.innerHTML = OFFICER_CONFIGURED_IDS.map((item, idx) => `
    <div style="display:flex; justify-content:space-between; align-items:center; background:#f8fafc; padding:8px 12px; border-radius:8px; font-size:11.5px; border:1px solid var(--border-color);">
      <div><strong class="font-mono">${item.idCode}</strong> — <span>${item.appName}</span></div>
      <button type="button" class="btn-mini-action text-danger" onclick="deleteCustomId(${idx})">Remove</button>
    </div>
  `).join("");
}

window.deleteCustomId = async function(idx) {
  OFFICER_CONFIGURED_IDS.splice(idx, 1);
  await pushToGoogleSheets("UPDATE_CONFIGURED_IDS", OFFICER_CONFIGURED_IDS);
  renderOfficerCustomIdList();
  showToast("ID removed", "success");
};

function populatePublicRegistrationDropdowns() {
  const idSelect = document.getElementById("regSelectIdCode");
  if (idSelect) {
    if (!OFFICER_CONFIGURED_IDS.length) {
      idSelect.innerHTML = `<option value="">No ID configured by officer</option>`;
      document.getElementById("regAppNameDisplay").value = "";
    } else {
      idSelect.innerHTML = OFFICER_CONFIGURED_IDS.map(item => `<option value="${item.idCode}" data-app="${item.appName}">${item.idCode}</option>`).join("");
      onSelectIdChanged();
    }
  }
}

window.onSelectIdChanged = function() {
  const select = document.getElementById("regSelectIdCode");
  const selectedOpt = select.options[select.selectedIndex];
  const appName = selectedOpt ? selectedOpt.getAttribute("data-app") : "";
  const nameInput = document.getElementById("regAppNameDisplay");
  if (nameInput) nameInput.value = appName || "";
};

function initPublicRegistrationSystem() {
  document.getElementById("publicChannelRegForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const accountRole = document.getElementById("regAccountRoleChoice")?.value || "RETAILER";
    const regId = "REG" + generateRandomDigits(9);
    const applicantName = document.getElementById("regApplicantName")?.value.trim().toUpperCase();
    const phone = document.getElementById("regMobile")?.value.trim();
    const email = document.getElementById("regEmail")?.value.trim();
    const shop = document.getElementById("regShopName")?.value.trim();
    const idCode = document.getElementById("regSelectIdCode")?.value;
    const appName = document.getElementById("regAppNameDisplay")?.value;
    const pincode = document.getElementById("regPinCode")?.value.trim();
    const state = document.getElementById("regStateInput")?.value.trim();
    const district = document.getElementById("regDistrictInput")?.value.trim();
    const town = document.getElementById("regTownInput")?.value.trim();
    const address = document.getElementById("regFullAddress")?.value.trim();
    const aadhaar = document.getElementById("regAadhaar")?.value.trim();
    const pan = document.getElementById("regPan")?.value.trim().toUpperCase();

    const dupMsg = findDuplicateUserField(phone, email, aadhaar);
    if (dupMsg) return alert(`Duplicate Account Blocked:\n${dupMsg}`);

    const newRecord = {
      regId,
      date: new Date().toLocaleDateString(),
      accountRole,
      applicantName,
      phone,
      email,
      shop,
      idCode,
      appName,
      pincode,
      state,
      district,
      town,
      address,
      aadhaar,
      pan,
      status: "PENDING",
      rejectionReason: ""
    };

    await pushToGoogleSheets("ADD_REGISTRATION", newRecord);
    GLOBAL_CHANNEL_REGISTRATIONS.unshift(newRecord);
    await logPortalActivity(phone, "PUBLIC", `${accountRole} Registration`, `${applicantName} applied for ${appName} (${regId})`);

    document.getElementById("publicChannelRegForm").reset();
    closePublicRegModal();
    updateDashboardKpis();

    showSuccessModal(applicantName, regId, "Your registration request has been sent for Officer approval.");
  });
}

// ================= DISTRIBUTOR & RETAILER LISTS =================
window.renderOfficerDistributorList = function() {
  const container = document.getElementById("officerDistributorListContainer");
  const badge = document.getElementById("distCountBadge");
  if (!container) return;

  const query = (document.getElementById("distSearchInput")?.value || "").trim().toLowerCase();
  const allDistributors = GLOBAL_USERS.filter(u => u.role === "DISTRIBUTOR");
  if (badge) badge.innerText = `${allDistributors.length} Distributors`;

  const distributors = query
    ? allDistributors.filter(d =>
        String(d.userId).toLowerCase().includes(query) ||
        String(d.name).toLowerCase().includes(query) ||
        String(d.phone).includes(query) ||
        String(d.territoryValue || "").toLowerCase().includes(query)
      )
    : allDistributors;

  if (!distributors.length) {
    container.innerHTML = `<p class="text-secondary text-center" style="padding:16px;">No matching Distributors found.</p>`;
    return;
  }

  container.innerHTML = distributors.map(d => {
    const retCount = GLOBAL_USERS.filter(u => u.role === "RETAILER" && u.parentId === d.userId).length;
    const isApproved = d.userStatus === "APPROVED";
    const isInactive = d.userStatus === "INACTIVE";
    const isRejected = d.userStatus === "REJECTED";
    const badgeBg = isApproved ? "#dcfce7" : (isRejected ? "#fee2e2" : (isInactive ? "#e2e8f0" : "#fef3c7"));
    const badgeColor = isApproved ? "#15803d" : (isRejected ? "#b91c1c" : (isInactive ? "#334155" : "#b45309"));

    return `
      <div style="padding:14px; border:1px solid var(--border-color); background:#ffffff; margin-bottom:10px; border-radius:12px;">
        <div class="flex-between">
          <div>
            <strong style="font-size:13.5px;">${d.name}</strong> • <code class="font-bold">${d.userId}</code>
            <span class="status-badge-inline" style="margin-left:6px; background:${badgeBg}; color:${badgeColor};">${d.userStatus}</span>
          </div>
          <strong class="font-mono text-success">${d.coupons} Pcs</strong>
        </div>
        <div style="font-size:11.5px; color:var(--text-secondary); margin-top:5px;">
          Mobile: <b>${d.phone}</b> | Email: ${d.email} | Mapped Retailers: <b>${retCount}</b><br>
          PIN Codes: <b style="color:var(--primary-accent);">${d.territoryValue || "Not Assigned"}</b>
          ${(isRejected || isInactive) && d.rejectionReason ? `<br><span style="color:#dc2626; font-weight:700;">Reason: ${d.rejectionReason}</span>` : ""}
        </div>
        <div class="flex-between mt-2 pt-2" style="border-top:1px dashed var(--border-color); flex-wrap:wrap; gap:6px;">
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            ${!isApproved && !isRejected && !isInactive ? `<button type="button" class="btn-mini-action" style="background:#10b981; color:#fff; border:none;" onclick="approveUserKyc('${d.userId}')">Approve</button>` : ""}
            ${!isApproved && !isRejected && !isInactive ? `<button type="button" class="btn-mini-action" style="background:#ef4444; color:#fff; border:none;" onclick="openRejectionModal('USER_KYC', '${d.userId}', '${d.name} (${d.userId})')">Reject</button>` : ""}
            ${isInactive ? `<button type="button" class="btn-mini-action" style="background:#10b981; color:#fff; border:none;" onclick="reactivateUserAccount('${d.userId}')">Activate</button>` : ""}
            <button type="button" class="btn-mini-action" style="background:#0f172a; color:#fff; border:none;" onclick="cpanelDirectLoginAsUser('${d.userId}')">Login</button>
            <button type="button" class="btn-mini-action" style="background:#dbeafe; color:#1d4ed8; border-color:#93c5fd;" onclick="openDistRetailersInspector('${d.userId}')">Retailers (${retCount})</button>
            <button type="button" class="btn-mini-action" style="background:#f8fafc; color:#0f172a;" onclick="openEditUpgradeModal('${d.userId}')">Edit</button>
          </div>
          <button type="button" class="btn-mini-action text-danger" style="border-color:#fca5a5; background:#fef2f2;" onclick="deleteUserAccountByOfficer('${d.userId}')">Delete</button>
        </div>
      </div>
    `;
  }).join("");
};

window.renderOfficerRetailerList = function() {
  const container = document.getElementById("officerRetailerListContainer");
  const badge = document.getElementById("retCountBadge");
  if (!container) return;

  const query = (document.getElementById("retSearchInput")?.value || "").trim().toLowerCase();
  const allRetailers = GLOBAL_USERS.filter(u => u.role === "RETAILER");
  if (badge) badge.innerText = `${allRetailers.length} Retailers`;

  const retailers = query
    ? allRetailers.filter(r =>
        String(r.userId).toLowerCase().includes(query) ||
        String(r.name).toLowerCase().includes(query) ||
        String(r.phone).includes(query) ||
        String(r.pan || "").toLowerCase().includes(query)
      )
    : allRetailers;

  if (!retailers.length) {
    container.innerHTML = `<p class="text-secondary text-center" style="padding:16px;">No matching Retailers found.</p>`;
    return;
  }

  container.innerHTML = retailers.map(r => {
    const upline = GLOBAL_USERS.find(u => u.userId === r.parentId);
    const uplineTxt = upline ? `${upline.name} (${upline.userId})` : "Direct Admin (Unmapped)";
    const isApproved = r.userStatus === "APPROVED";
    const isInactive = r.userStatus === "INACTIVE";
    const isRejected = r.userStatus === "REJECTED";
    const badgeBg = isApproved ? "#dcfce7" : (isRejected ? "#fee2e2" : (isInactive ? "#e2e8f0" : "#fef3c7"));
    const badgeColor = isApproved ? "#15803d" : (isRejected ? "#b91c1c" : (isInactive ? "#334155" : "#b45309"));

    return `
      <div style="padding:14px; border:1px solid var(--border-color); background:#ffffff; margin-bottom:10px; border-radius:12px;">
        <div class="flex-between">
          <div>
            <strong style="font-size:13.5px;">${r.name}</strong> • <code class="font-bold">${r.userId}</code>
            <span class="status-badge-inline" style="margin-left:6px; background:${badgeBg}; color:${badgeColor};">${r.userStatus}</span>
          </div>
          <strong class="font-mono text-success">${r.coupons} Pcs</strong>
        </div>
        <div style="font-size:11.5px; color:var(--text-secondary); margin-top:5px;">
          Mobile: <b>${r.phone}</b> | Email: ${r.email} | PAN: <b>${r.pan || "N/A"}</b><br>
          Mapping: <b style="color:var(--primary-accent);">${uplineTxt}</b>
          ${(isRejected || isInactive) && r.rejectionReason ? `<br><span style="color:#dc2626; font-weight:700;">Reason: ${r.rejectionReason}</span>` : ""}
        </div>
        <div class="flex-between mt-2 pt-2" style="border-top:1px dashed var(--border-color); flex-wrap:wrap; gap:6px;">
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            ${!isApproved && !isRejected && !isInactive ? `<button type="button" class="btn-mini-action" style="background:#10b981; color:#fff; border:none;" onclick="approveUserKyc('${r.userId}')">Approve</button>` : ""}
            ${!isApproved && !isRejected && !isInactive ? `<button type="button" class="btn-mini-action" style="background:#ef4444; color:#fff; border:none;" onclick="openRejectionModal('USER_KYC', '${r.userId}', '${r.name} (${r.userId})')">Reject</button>` : ""}
            ${isInactive ? `<button type="button" class="btn-mini-action" style="background:#10b981; color:#fff; border:none;" onclick="reactivateUserAccount('${r.userId}')">Activate</button>` : ""}
            <button type="button" class="btn-mini-action" style="background:#0f172a; color:#fff; border:none;" onclick="cpanelDirectLoginAsUser('${r.userId}')">Login</button>
            <button type="button" class="btn-mini-action" style="background:#eff6ff; color:#2563eb;" onclick="openEditUpgradeModal('${r.userId}')">Map / Edit</button>
          </div>
          <button type="button" class="btn-mini-action text-danger" style="border-color:#fca5a5; background:#fef2f2;" onclick="deleteUserAccountByOfficer('${r.userId}')">Delete</button>
        </div>
      </div>
    `;
  }).join("");
};

function populateTopupDropdown() {
  const topupSelect = document.getElementById("officerTopupUserSelect");
  if (topupSelect) {
    const approvedAgents = GLOBAL_USERS.filter(u => u.userStatus === "APPROVED");
    topupSelect.innerHTML = approvedAgents.length
      ? approvedAgents.map(u => `<option value="${u.userId}">${u.name} [${u.userId}] (${u.role} - ${u.coupons} Pcs)</option>`).join("")
      : `<option value="">No Active Agents Available</option>`;
  }
}

// ================= OFFICER APPLICATIONS QUEUE =================
function renderAdminAppQueue() {
  const container = document.getElementById("adminAppQueueContainer");
  if (!container) return;

  if (!GLOBAL_APPLICATIONS.length) {
    container.innerHTML = `<p class="text-secondary text-center" style="padding:16px;">No applications staged yet.</p>`;
    return;
  }

  container.innerHTML = GLOBAL_APPLICATIONS.map(a => {
    const isRejected = a.status === "REJECTED_DOC_ERROR";
    const isApproved = a.status === "PROCESSED_SUCCESS" || a.status === "DISPATCHED";

    return `
      <div style="padding: 12px; border: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; background:#ffffff; margin-bottom:8px; border-radius:10px; flex-wrap:wrap; gap:8px;">
        <div>
          <strong>${a.name}</strong> • <code class="font-mono font-bold">${a.appId}</code>
          <br><span style="font-size: 11px; color: var(--text-secondary);">${a.serviceType} | Source: <b>${a.retailerId || "N/A"}</b> | Status: <b>${a.status}</b> | Official: <b style="color:var(--primary-accent);">${a.officialAck || "Pending"}</b></span>
          ${a.rejectionReason ? `<br><span style="font-size:11px; color:#dc2626; font-weight:700;">Reason: ${a.rejectionReason}</span>` : ""}
        </div>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          <button class="btn-mini-action" style="background:#eff6ff; color:#2563eb;" onclick="inspectApplicationDocs('${a.appId}')">Docs</button>
          ${!isApproved && !isRejected ? `<button class="btn-mini-action" style="background:#10b981; color:#fff; border:none;" onclick="openOfficerActionModal('${a.appId}', '${a.name}', '${a.serviceType}')">Approve</button>` : ""}
          ${!isRejected && !isApproved ? `<button class="btn-mini-action" style="background:#ef4444; color:#fff; border:none;" onclick="openRejectionModal('PAN_APP', '${a.appId}', '${a.name} (${a.appId})')">Reject</button>` : ""}
        </div>
      </div>
    `;
  }).join("");
}

window.toggleAppModalRejectionField = function() {
  const statusVal = document.getElementById("modalStateSelect")?.value;
  const isReject = statusVal === "REJECTED_DOC_ERROR";
  const rejBox = document.getElementById("modalAppRejectReasonGroup");
  const rejInput = document.getElementById("modalAppRejectReason");
  if (rejBox) rejBox.style.display = isReject ? "block" : "none";
  if (rejInput) rejInput.required = isReject;
};

function openOfficerActionModal(appId, name, sType) {
  const modal = document.getElementById("officerUpdateModal");
  document.getElementById("modalTargetAppId").value = appId;
  document.getElementById("modalAppIdDisplay").value = `${appId} (${name})`;
  document.getElementById("modalAckLabel").innerText = sType.includes("NSDL") ? "Assign NSDL Acknowledgement (15 Digits) *" : "Assign UTI Coupon (e.g. R...) *";
  document.getElementById("modalStateSelect").value = "PROCESSED_SUCCESS";
  toggleAppModalRejectionField();
  modal?.classList.add("open");
}

function initOfficerModal() {
  const modal = document.getElementById("officerUpdateModal");
  document.getElementById("closeOfficerModalBtn")?.addEventListener("click", () => modal.classList.remove("open"));

  document.getElementById("officerStatusForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const appId = document.getElementById("modalTargetAppId")?.value;
    const officialCode = document.getElementById("modalOfficialAckInput")?.value.trim().toUpperCase();
    const newState = document.getElementById("modalStateSelect")?.value;

    const app = GLOBAL_APPLICATIONS.find(a => a.appId === appId);
    if (app) {
      app.status = newState;
      app.officialAck = officialCode;
      app.rejectionReason = "";
      await pushToGoogleSheets("UPDATE_APPLICATION_STATUS", {
        appId,
        status: newState,
        officialAck: officialCode,
        rejectionReason: ""
      });
      await logPortalActivity(
        ACTIVE_USER_SESSION?.userId || "ADMIN",
        "OFFICER",
        "Approved PAN Application",
        `Token ${appId} → ${newState} (${officialCode})`
      );
    }

    showToast("Decision Updated!", "success");
    modal.classList.remove("open");
    renderAdminAppQueue();
  });
}

// ================= PUBLIC TRACKING =================
function initPublicTracking() {
  document.getElementById("btnPublicTrack")?.addEventListener("click", () => {
    const input = document.getElementById("publicTrackInput")?.value.trim().toUpperCase();
    const resultBox = document.getElementById("publicTrackResult");
    if (!input) return showToast("Please enter an Application Token or Registration ID!", "error");

    resultBox.style.display = "block";

    const app = GLOBAL_APPLICATIONS.find(a => a.appId === input);
    if (app) {
      const isRej = app.status === "REJECTED_DOC_ERROR";
      resultBox.innerHTML = `
        <div style="background: ${isRej ? '#fef2f2' : '#ecfdf5'}; border: 1px solid ${isRej ? '#fca5a5' : '#6ee7b7'}; color: ${isRej ? '#991b1b' : '#065f46'}; padding: 14px; border-radius: 8px;">
          <div class="flex-between">
            <h4 style="font-size: 14px;">${app.name}</h4>
            <span class="status-badge-inline">${app.status}</span>
          </div>
          <p class="mt-1" style="font-size: 11px;">Token: <code>${app.appId}</code> (${app.serviceType})</p>
          ${isRej && app.rejectionReason
            ? `<p style="font-size: 12px; margin-top:4px; font-weight:700;">Rejection Reason: ${app.rejectionReason}</p>`
            : `<p style="font-size: 12px; margin-top:4px;">Official ACK / Coupon: <b style="color:#2563eb; font-size:13px;">${app.officialAck || "Processing by Officer"}</b></p>`}
        </div>
      `;
      return;
    }

    const reg = GLOBAL_CHANNEL_REGISTRATIONS.find(r => r.regId === input);
    if (reg) {
      const isRej = reg.status === "REJECTED";
      resultBox.innerHTML = `
        <div style="background: ${isRej ? '#fef2f2' : '#eff6ff'}; border: 1px solid ${isRej ? '#fca5a5' : '#bfdbfe'}; color: ${isRej ? '#991b1b' : '#1e40af'}; padding: 14px; border-radius: 8px;">
          <div class="flex-between">
            <h4 style="font-size: 14px;">${reg.applicantName}</h4>
            <span class="status-badge-inline">${reg.status}</span>
          </div>
          <p class="mt-1" style="font-size: 11px;">Registration ID: <code>${reg.regId}</code> (${reg.appName})</p>
          <p style="font-size: 12px; margin-top:4px;">Status: <b style="color:${isRej ? '#dc2626' : '#059669'}; font-size:13px;">${reg.status === 'APPROVED' ? 'Approved & Credentials Dispatched' : (isRej ? `Rejected (${reg.rejectionReason || 'Verification Failed'})` : 'Under Officer Verification')}</b></p>
        </div>
      `;
      return;
    }

    resultBox.innerHTML = `
      <div style="background: #fef2f2; border: 1px solid #f87171; color: #991b1b; padding: 12px; border-radius: 8px;">
        <strong>Reference Not Found:</strong> No record matches reference code <code>${input}</code>.
      </div>
    `;
  });
}

// ================= UNIFIED LOGIN =================
function initUnifiedLogin() {
  const form = document.getElementById("singleLoginForm");
  const forceForm = document.getElementById("forcePasswordForm");
  const loginModal = document.getElementById("loginModal");

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const identifier = document.getElementById("loginUserId")?.value.trim().toUpperCase();
    const passInput = document.getElementById("loginPassword")?.value.trim();

    const matchedOfficer = GLOBAL_OFFICERS.find(o => {
      const idMatch = o.userId.toUpperCase() === identifier;
      const phoneMatch = String(o.phone || "").trim() === identifier;
      const adminAlias = identifier === "ADMIN" && passInput === DEFAULT_PIN && o.role === "SUPER_OFFICER";
      return idMatch || phoneMatch || adminAlias;
    });

    if (matchedOfficer) {
      const validPass = matchedOfficer.password === passInput || (identifier === "ADMIN" && passInput === DEFAULT_PIN && matchedOfficer.role === "SUPER_OFFICER");
      if (!validPass) return showToast("Incorrect Password!", "error");

      if (matchedOfficer.isFirstLogin) {
        PENDING_FIRST_LOGIN_USER = matchedOfficer;
        loginModal?.classList.remove("open");
        document.getElementById("forceUserIdDisplay").value = matchedOfficer.userId;
        document.getElementById("forcePasswordModal")?.classList.add("open");
        return;
      }

      grantOfficerDashboardAccess(matchedOfficer);
      return;
    }

    await checkAndEnforceUserInactivity();

    const matchedUser = GLOBAL_USERS.find(u =>
      u.userId.toUpperCase() === identifier || String(u.phone || "").trim() === identifier
    );

    if (!matchedUser) return showToast("Account not found with this ID or Mobile!", "error");
    if (matchedUser.password !== passInput) return showToast("Incorrect Password!", "error");

    if (matchedUser.userStatus !== "APPROVED") {
      grantUserDashboardAccess(matchedUser);
      return;
    }

    await touchUserLastActive(matchedUser.userId);

    if (matchedUser.isFirstLogin) {
      PENDING_FIRST_LOGIN_USER = matchedUser;
      loginModal?.classList.remove("open");
      document.getElementById("forceUserIdDisplay").value = matchedUser.userId;
      document.getElementById("forcePasswordModal")?.classList.add("open");
      return;
    }

    grantUserDashboardAccess(matchedUser);
  });

  forceForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const newPass = document.getElementById("forceNewPass").value.trim();
    const confPass = document.getElementById("forceConfirmPass").value.trim();

    if (newPass !== confPass) return alert("Passwords do not match!");
    if (newPass.length < 5) return alert("Password must be at least 5 characters long!");

    if (PENDING_FIRST_LOGIN_USER) {
      PENDING_FIRST_LOGIN_USER.password = newPass;
      PENDING_FIRST_LOGIN_USER.isFirstLogin = false;

      if (PENDING_FIRST_LOGIN_USER.role === "SUB_OFFICER" || PENDING_FIRST_LOGIN_USER.role === "SUPER_OFFICER") {
        await pushToGoogleSheets("UPDATE_OFFICER_PASSWORD", { userId: PENDING_FIRST_LOGIN_USER.userId, password: newPass });
        document.getElementById("forcePasswordModal")?.classList.remove("open");
        showToast("New password set! Welcome.", "success");
        grantOfficerDashboardAccess(PENDING_FIRST_LOGIN_USER);
      } else {
        await pushToGoogleSheets("UPDATE_USER_PASSWORD", { userId: PENDING_FIRST_LOGIN_USER.userId, password: newPass });
        document.getElementById("forcePasswordModal")?.classList.remove("open");
        showToast("New password set successfully!", "success");
        grantUserDashboardAccess(PENDING_FIRST_LOGIN_USER);
      }
      PENDING_FIRST_LOGIN_USER = null;
    }
  });
}

function grantOfficerDashboardAccess(officer) {
  ACTIVE_USER_SESSION = officer;
  document.getElementById("loginModal")?.classList.remove("open");
  document.getElementById("loginScreen").style.display = "none";
  document.getElementById("kycPendingScreen").style.display = "none";
  document.getElementById("appContainer").style.display = "flex";
  document.getElementById("officerTitleDisplay").innerText = `${officer.name}`;
  document.getElementById("offSidebarUserName").innerText = officer.name;
  showToast(`Welcome, ${officer.name}!`, "success");

  renderOfficerEnginesForSession(officer);
  renderOfficerDistributorList();
  renderOfficerRetailerList();
  populateTopupDropdown();
  populateMappingDropdowns();
  populateCreateUserDistDropdown();
  renderChannelRegistrationsQueue();
  renderOfficerCouponRequests();
  renderAdminAppQueue();
  renderPublicCouponsList();
  renderOfficerComplaintList();
  renderOfficerActivityFeeds();
  updateDashboardKpis();
  if (APPS_SCRIPT_URL) syncFromGoogleSheets();
}

function grantUserDashboardAccess(matchedUser) {
  ACTIVE_USER_SESSION = matchedUser;
  document.getElementById("loginScreen").style.display = "none";
  document.getElementById("loginModal")?.classList.remove("open");

  if (matchedUser.userStatus !== "APPROVED") {
    document.getElementById("retailerPortalContainer").style.display = "none";
    document.getElementById("chainPortalContainer").style.display = "none";
    document.getElementById("kycPendingScreen").style.display = "flex";
    document.getElementById("kycPendingUserName").innerText = matchedUser.name;
    document.getElementById("kycPendingUserId").innerText = matchedUser.userId;
    document.getElementById("kycPendingUserRole").innerText = matchedUser.role;
    document.getElementById("kycPendingUserPhone").innerText = matchedUser.phone;
    document.getElementById("kycPendingStatusLabel").innerText = matchedUser.userStatus;

    const isRej = matchedUser.userStatus === "REJECTED";
    const isInact = matchedUser.userStatus === "INACTIVE";
    const rejBox = document.getElementById("kycRejectionReasonBox");
    const rejTxt = document.getElementById("kycRejectionReasonText");
    document.getElementById("kycLockIcon").innerText = isRej ? "❌" : (isInact ? "💤" : "⏳");
    document.getElementById("kycLockBadge").innerText = isRej ? "APPLICATION REJECTED" : (isInact ? "ACCOUNT INACTIVE" : "VERIFICATION REQUIRED");
    document.getElementById("kycLockTitle").innerText = isRej ? "Your Account Was Rejected" : (isInact ? "Your Account is Inactive" : "Your KYC is Pending");
    document.getElementById("kycLockTitle").style.color = isRej ? "#dc2626" : (isInact ? "#475569" : "#b45309");
    document.getElementById("kycPendingStatusLabel").style.color = isRej ? "#dc2626" : (isInact ? "#475569" : "#d97706");

    if ((isRej || isInact) && matchedUser.rejectionReason) {
      rejBox.style.display = "block";
      rejTxt.innerText = matchedUser.rejectionReason;
    } else {
      rejBox.style.display = "none";
    }
    return;
  }

  document.getElementById("kycPendingScreen").style.display = "none";

  if (matchedUser.role === "RETAILER") {
    document.getElementById("retailerPortalContainer").style.display = "flex";
    document.getElementById("retailerNameTitle").innerText = `${matchedUser.name}`;
    document.getElementById("retSidebarUserName").innerText = matchedUser.name;
    document.getElementById("retSidebarUserId").innerText = matchedUser.userId;
    showToast(`Welcome Retailer: ${matchedUser.name}`, "success");
    renderRetailerHistory();
    renderUserOwnTickets("retMyTicketsList");
  } else if (matchedUser.role === "DISTRIBUTOR") {
    document.getElementById("chainPortalContainer").style.display = "flex";
    document.getElementById("chainPortalTitle").innerText = `${matchedUser.name}`;
    document.getElementById("distSidebarUserName").innerText = matchedUser.name;
    document.getElementById("distSidebarUserId").innerText = matchedUser.userId;
    setupDistributorConsoleView(matchedUser);
    renderUserOwnTickets("distMyTicketsList");
    showToast(`Welcome Distributor: ${matchedUser.name}`, "success");
  }

  updateSessionWalletUI();
  updateDashboardKpis();
}

function updateSessionWalletUI() {
  if (!ACTIVE_USER_SESSION) return;
  const live = GLOBAL_USERS.find(u => u.userId === ACTIVE_USER_SESSION.userId);
  const count = live ? live.coupons : 0;
  const retDisp = document.getElementById("retCouponDisplay");
  const chainDisp = document.getElementById("chainCouponDisplay");
  if (retDisp) retDisp.innerText = `${count} Pcs`;
  if (chainDisp) chainDisp.innerText = `${count} Pcs`;
}

function renderRetailerHistory() {
  const container = document.getElementById("retailerHistoryContainer");
  if (!container || !ACTIVE_USER_SESSION) return;

  const filtered = GLOBAL_APPLICATIONS.filter(a => a.retailerId === ACTIVE_USER_SESSION.userId);
  const counter = document.getElementById("retAppCounter");
  if (counter) counter.innerText = `${filtered.length} Records`;

  if (!filtered.length) {
    container.innerHTML = `<p class="text-secondary text-center" style="padding:16px;">No applications staged yet.</p>`;
    return;
  }

  container.innerHTML = filtered.map(a => `
    <div style="padding: 10px 12px; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; background:#fff; gap:8px;">
      <div>
        <strong>${a.name}</strong> • <code>${a.appId}</code><br>
        <span style="font-size:11px; color:var(--text-secondary);">${a.serviceType} | Code: <b style="color:var(--primary-accent);">${a.officialAck || "Processing"}</b></span>
        ${a.rejectionReason ? `<br><span style="font-size:11px; color:#dc2626; font-weight:700;">Reason: ${a.rejectionReason}</span>` : ""}
      </div>
      <span class="status-badge-inline">${a.status}</span>
    </div>
  `).join("");
}

// ================= OFFICER GLOBAL NAV & CREATE USER =================
function initOfficerAppGrid() {
  document.getElementById("backToHomeBtn")?.addEventListener("click", returnOfficerHome);

  document.getElementById("officerTopupForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const receiverId = document.getElementById("officerTopupUserSelect")?.value;
    const count = Number(document.getElementById("officerTopupAmt")?.value || 0);
    if (!receiverId || count < 1) return showToast("Select a valid active agent and coupon count.", "error");

    const receiver = GLOBAL_USERS.find(u => u.userId === receiverId);
    if (receiver) {
      if (receiver.userStatus !== "APPROVED") {
        return alert("Cannot issue coupons: Agent account is not active!");
      }
      receiver.coupons += count;
      await pushToGoogleSheets("UPDATE_USER_COUPONS", { userId: receiver.userId, coupons: receiver.coupons });
      await logPortalActivity(ACTIVE_USER_SESSION?.userId || "ADMIN", "OFFICER", "Issued Coupons", `Sent ${count} Pcs to ${receiver.name} (${receiverId})`);
    }
    showToast(`${count} Coupons Sent to ${receiverId}`, "success");
    document.getElementById("officerTopupForm").reset();
    renderOfficerDistributorList();
    renderOfficerRetailerList();
    populateTopupDropdown();
  });

  document.getElementById("officerCreateUserForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const role = document.getElementById("offNewUserRole")?.value;
    const tVal = document.getElementById("offTerritoryValue")?.value.trim();
    const name = document.getElementById("offNewUserName")?.value.trim().toUpperCase();
    const phone = document.getElementById("offNewUserPhone")?.value.trim();
    const email = document.getElementById("offNewUserEmail")?.value.trim();
    const aadhaar = document.getElementById("offNewUserAadhaar")?.value.trim();
    const pan = document.getElementById("offNewUserPan")?.value.trim().toUpperCase();
    const parentId = document.getElementById("offNewUserParentSelect")?.value || "ADMIN";

    if (!name || name.length < 3) return showToast("Enter valid Legal Name (min 3 chars).", "error");
    if (!phone || !/^[0-9]{10}$/.test(phone)) return showToast("Enter valid 10-digit WhatsApp Mobile.", "error");
    if (!email || !email.includes("@")) return showToast("Enter valid Email ID.", "error");
    if (!aadhaar || !/^[0-9]{12}$/.test(aadhaar)) return showToast("Enter valid 12-digit ID Number.", "error");
    if (!pan || !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan)) return showToast("Enter valid 10-character PAN Number.", "error");

    const dupMsg = findDuplicateUserField(phone, email, aadhaar);
    if (dupMsg) {
      return alert(`Duplicate Account Blocked:\n${dupMsg}`);
    }

    if (role === "DISTRIBUTOR") {
      if (!tVal) return showToast("Allocated PIN Codes are mandatory for Distributor!", "error");
      const check = checkMultiTerritoryAvailability("PINCODE", tVal);
      if (check.conflicts.length > 0) {
        return alert(`Territory Booking Conflict!\n${check.conflicts.map(c => `'${c.token}' booked by ${c.bookedBy}`).join("\n")}`);
      }
    }

    const autoId = generate9DigitUserId(role);
    const autoPass = generateAutoPassword();
    const nowIso = new Date().toISOString();

    const newUser = {
      userId: autoId,
      password: autoPass,
      name,
      role,
      coupons: 0,
      parentId: role === "DISTRIBUTOR" ? "ADMIN" : parentId,
      phone,
      email,
      aadhaar,
      pan,
      userStatus: "KYC_PENDING",
      rejectionReason: "",
      lastActiveAt: nowIso,
      isFirstLogin: true,
      territoryType: role === "DISTRIBUTOR" ? "PINCODE" : "NONE",
      territoryValue: role === "DISTRIBUTOR" ? tVal : ""
    };

    GLOBAL_USERS.push(newUser);
    await pushToGoogleSheets("ADD_USER", newUser);

    let summaryText = `Created ${role}: ${name} (${autoId})`;

    if (role === "DISTRIBUTOR") {
      const linkedRetailerId = generate9DigitUserId("RETAILER");
      const linkedRetailer = {
        userId: linkedRetailerId,
        password: autoPass,
        name,
        role: "RETAILER",
        coupons: 0,
        parentId: autoId,
        phone,
        email,
        aadhaar,
        pan,
        userStatus: "KYC_PENDING",
        rejectionReason: "",
        lastActiveAt: nowIso,
        isFirstLogin: true,
        territoryType: "NONE",
        territoryValue: ""
      };
      GLOBAL_USERS.push(linkedRetailer);
      await pushToGoogleSheets("ADD_USER", linkedRetailer);
      summaryText = `Created Distributor (${autoId}) + Auto Linked Retailer (${linkedRetailerId}) for ${name}`;
    }

    await logPortalActivity(ACTIVE_USER_SESSION?.userId || "ADMIN", "OFFICER", `Created ${role} (KYC Pending)`, summaryText);

    renderOfficerDistributorList();
    renderOfficerRetailerList();
    populateTopupDropdown();
    populateMappingDropdowns();
    populateCreateUserDistDropdown();
    updateDashboardKpis();

    showSuccessModal(name, autoId, role === "DISTRIBUTOR"
      ? "Distributor ID & Linked Retailer ID created as KYC Pending."
      : "Retailer ID created as KYC Pending. Approve from Retailer List to activate.");

    document.getElementById("officerCreateUserForm").reset();
    toggleOfficerTerritoryInputs();
    returnOfficerHome();
  });
}

window.returnOfficerHome = function() {
  document.getElementById("serviceWorkspaceArea").style.display = "none";
  document.getElementById("homeAppView").style.display = "block";
};

// ================= SUB-OFFICERS & RBAC =================
function initOfficerManagementEngine() {
  document.getElementById("createOfficerForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("newOfficerName")?.value.trim();
    const phone = document.getElementById("newOfficerPhone")?.value.trim();
    const email = document.getElementById("newOfficerEmail")?.value.trim();

    if (!name || !/^[0-9]{10}$/.test(phone) || !email) {
      return showToast("Please fill all Officer details properly.", "error");
    }

    const selectedPerms = [];
    document.querySelectorAll("input[name='officerPerms']:checked").forEach(cb => selectedPerms.push(cb.value));

    const autoId = generate9DigitUserId("OFFICER");
    const autoPass = generateAutoPassword();

    const newOfficer = {
      userId: autoId,
      password: autoPass,
      name,
      phone,
      email,
      role: "SUB_OFFICER",
      permissions: selectedPerms,
      userStatus: "APPROVED",
      isFirstLogin: true
    };

    GLOBAL_OFFICERS.push(newOfficer);
    await pushToGoogleSheets("ADD_OFFICER", newOfficer);
    await logPortalActivity("ADMIN", "SUPER_OFFICER", "Appointed Sub-Officer", `${name} (${autoId})`);

    const msg = `*${GLOBAL_SETTINGS.brand_title} - Officer Appointment* 👮\n\nHello *${name}*,\nYou have been appointed as an Officer.\n\n👤 *User ID:* ${autoId}\n🔑 *Temporary Password:* ${autoPass}\n\nPlease sign in and set your new password.`;
    await sendDirectWhatsAppMessage(phone, msg);

    showSuccessModal(name, autoId, "Sub-Officer appointed and credentials dispatched.");
    document.getElementById("createOfficerForm").reset();
    renderSubOfficersList();
  });
}

function renderSubOfficersList() {
  const container = document.getElementById("officersListContainer");
  if (!container) return;

  const subOfficers = GLOBAL_OFFICERS.filter(o => o.role === "SUB_OFFICER");
  if (!subOfficers.length) {
    container.innerHTML = `<p class="text-secondary text-center" style="padding:16px;">No sub-officers appointed yet.</p>`;
    return;
  }

  container.innerHTML = subOfficers.map(o => `
    <div style="padding:10px 12px; border-bottom:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center; background:#fff;">
      <div>
        <strong>${o.name}</strong> • <code>${o.userId}</code><br>
        <span style="font-size:11px; color:var(--text-secondary);">Phone: ${o.phone} | Duties: <b>${o.permissions.length}</b> Granted</span>
      </div>
      <button class="btn-mini-action text-danger" onclick="removeSubOfficer('${o.userId}')">Revoke</button>
    </div>
  `).join("");
}

window.removeSubOfficer = async function(userId) {
  if (!confirm(`Are you sure you want to revoke officer ${userId}?`)) return;
  GLOBAL_OFFICERS = GLOBAL_OFFICERS.filter(o => o.userId !== userId);
  await pushToGoogleSheets("REMOVE_OFFICER", { userId });
  renderSubOfficersList();
  showToast(`Officer ${userId} access revoked.`, "success");
};

function renderOfficerEnginesForSession(user) {
  const grid = document.getElementById("officerEnginesGrid");
  if (!grid) return;

  const isSuper = user.role === "SUPER_OFFICER" || user.userId === "admin" || (user.userId && user.userId.toLowerCase() === "admin");
  const perms = user.permissions || [];

  const allTiles = [
    { target: "coupon-req-view", label: "Coupon Requests", desc: "Razorpay Auto & Manual Approve", icon: "🎫", color: "green", perm: "PERM_NETWORK_COUPONS" },
    { target: "inbox-view", label: "PAN Applications Queue", desc: "Approve, Reject & View Docs", icon: "📥", color: "blue", perm: "PERM_PAN_PROCESS" },
    { target: "distributors-view", label: "Distributor List", desc: "Search, View Retailers & Login", icon: "🏢", color: "purple", perm: "PERM_NETWORK_COUPONS" },
    { target: "retailers-view", label: "Retailer List & Mapping", desc: "Search, Login & Optional Mapping", icon: "🏪", color: "amber", perm: "PERM_NETWORK_COUPONS" },
    { target: "network-view", label: "Create ID & Issue Coupons", desc: "Add Distributor/Retailer & Stock", icon: "➕", color: "blue", perm: "PERM_NETWORK_COUPONS" },
    { target: "channel-reg-view", label: "Channel Registrations", desc: "Approve / Reject Requests", icon: "📝", color: "green", perm: "PERM_CHANNEL_REG" },
    { target: "activity-view", label: "Live Activity & Audit Log", desc: "All Home, Dist & Ret Actions", icon: "📡", color: "purple", perm: "PERM_PAN_PROCESS" },
    { target: "officers-mgmt-view", label: "Officer Team & Roles", desc: "Delegate Duties & Permissions", icon: "👮", color: "amber", perm: "PERM_OFFICERS_MGMT", superOnly: true },
    { target: "settings-view", label: "Config, Razorpay & Logo", desc: "Razorpay Link, Sheet & App Logo", icon: "⚙️", color: "rose", perm: "PERM_SETTINGS" },
    { target: "complaint-view", label: "Support & Complaints", desc: "Downline Ticket Tracker", icon: "📢", color: "rose", perm: "PERM_COMPLAINTS" }
  ];

  const allowed = allTiles.filter(t => {
    if (isSuper) return true;
    if (t.superOnly) return false;
    return perms.includes(t.perm);
  });

  grid.innerHTML = allowed.map(tile => `
    <div class="portal-boxed-card ${tile.color}" data-target="${tile.target}" data-title="${tile.label}">
      <div class="boxed-icon">${tile.icon}</div>
      <div class="boxed-title">${tile.label}</div>
      <div class="boxed-desc">${tile.desc}</div>
    </div>
  `).join("");

  grid.querySelectorAll(".portal-boxed-card").forEach(tile => {
    tile.addEventListener("click", () => {
      const target = tile.getAttribute("data-target");
      const title = tile.getAttribute("data-title") || "Workspace";
      if (target) openOfficerPane(target, title);
    });
  });
}

// ================= TERRITORY CHECK HELPER =================
window.toggleOfficerTerritoryInputs = function() {
  const role = document.getElementById("offNewUserRole")?.value;
  const box = document.getElementById("offTerritoryBox");
  const distBox = document.getElementById("offParentDistBox");
  const offlineBox = document.getElementById("offOfflineFormUploadBox");
  const pinInput = document.getElementById("offTerritoryValue");
  if (box) box.style.display = role === "DISTRIBUTOR" ? "block" : "none";
  if (offlineBox) offlineBox.style.display = role === "DISTRIBUTOR" ? "block" : "none";
  if (distBox) distBox.style.display = role === "RETAILER" ? "block" : "none";
  if (pinInput) pinInput.required = role === "DISTRIBUTOR";
};

function checkMultiTerritoryAvailability(type, rawVal, excludeUserId = "") {
  const tokens = String(rawVal || "").toUpperCase().split(",").map(s => s.trim()).filter(Boolean);
  const conflicts = [];
  const available = [];

  tokens.forEach(tok => {
    const match = GLOBAL_USERS.find(u => {
      if (u.userId === excludeUserId) return false;
      if (u.role !== "DISTRIBUTOR" || u.territoryType !== type || !u.territoryValue) return false;
      const userTokens = String(u.territoryValue).toUpperCase().split(",").map(s => s.trim()).filter(Boolean);
      return userTokens.includes(tok);
    });

    if (match) conflicts.push({ token: tok, bookedBy: match.userId, name: match.name });
    else available.push(tok);
  });

  return { conflicts, available };
}

// ================= CHANNEL REGISTRATIONS QUEUE =================
function renderChannelRegistrationsQueue() {
  const container = document.getElementById("channelRegListContainer");
  const countBadge = document.getElementById("channelRegCountBadge");

  if (!container) return;
  if (countBadge) countBadge.innerText = `${GLOBAL_CHANNEL_REGISTRATIONS.length} Records`;

  if (!GLOBAL_CHANNEL_REGISTRATIONS.length) {
    container.innerHTML = `<p class="text-secondary text-center" style="padding:16px;">No registration applications queued.</p>`;
    return;
  }

  container.innerHTML = GLOBAL_CHANNEL_REGISTRATIONS.map(r => {
    const isApproved = r.status === "APPROVED";
    const isRejected = r.status === "REJECTED";
    const roleLabel = r.accountRole || "RETAILER";

    return `
      <div style="padding:14px; border:1px solid var(--border-color); background:#ffffff; margin-bottom:10px; border-radius:10px;">
        <div class="flex-between">
          <div>
            <strong style="font-size:13.5px;">${r.applicantName}</strong> • <code class="font-bold">${r.regId}</code>
            <span class="status-badge-inline" style="margin-left:6px; background:#eff6ff; color:#1d4ed8;">${roleLabel}</span>
            <span style="font-size:11px; color:var(--text-secondary); display:block;">Shop: <b>${r.shop}</b> | App: <b>${r.appName}</b> (${r.idCode})</span>
          </div>
          <span class="status-badge-inline" style="background:${isApproved ? '#dcfce7' : (isRejected ? '#fee2e2' : '#fef3c7')}; color:${isApproved ? '#15803d' : (isRejected ? '#b91c1c' : '#b45309')};">${r.status}</span>
        </div>

        <div style="font-size:11.5px; color:var(--text-secondary); margin-top:6px; line-height:1.6;">
          Mobile: <b>${r.phone}</b> | Email: ${r.email}<br>
          Location: <b>${r.town || ""} ${r.district || ""} ${r.state || ""}</b> (PIN: ${r.pincode})<br>
          Address: ${r.address}<br>
          PAN: <b>${r.pan}</b>
          ${isRejected && r.rejectionReason ? `<br><span style="color:#dc2626; font-weight:700;">Rejection Reason: ${r.rejectionReason}</span>` : ""}
        </div>

        <div class="flex-between mt-2 pt-2" style="border-top:1px dashed var(--border-color); flex-wrap:wrap; gap:6px;">
          <span style="font-size:10.5px; color:var(--text-muted);">Date: ${r.date} ${isRejected ? '• (Purges in 3 days)' : ''}</span>
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            ${!isApproved && !isRejected ? `
              <button type="button" class="btn-mini-action" style="background:#10b981; color:#fff; border:none; padding:6px 12px; font-weight:700;" onclick="approveChannelRegistration('${r.regId}')">
                Approve & Queue ID
              </button>
              <button type="button" class="btn-mini-action" style="background:#ef4444; color:#fff; border:none; padding:6px 12px; font-weight:700;" onclick="openRejectionModal('CHANNEL_REG', '${r.regId}', '${r.applicantName} (${r.regId})')">
                Reject
              </button>
            ` : `<span style="font-size:11.5px; font-weight:700; color:${isApproved ? '#15803d' : '#b91c1c'};">${isApproved ? 'Approved & Queued' : 'Rejected'}</span>`}
          </div>
        </div>
      </div>
    `;
  }).join("");
}

window.approveChannelRegistration = async function(regId) {
  const reg = GLOBAL_CHANNEL_REGISTRATIONS.find(x => x.regId === regId);
  if (!reg) return;

  const targetRole = reg.accountRole === "DISTRIBUTOR" ? "DISTRIBUTOR" : "RETAILER";
  const autoAssignedId = generate9DigitUserId(targetRole);
  const autoAssignedPass = generateAutoPassword();
  const nowIso = new Date().toISOString();

  const newAccount = {
    userId: autoAssignedId,
    password: autoAssignedPass,
    name: reg.applicantName,
    role: targetRole,
    coupons: 0,
    parentId: reg.assignedParentId || "ADMIN",
    phone: reg.phone,
    email: reg.email,
    aadhaar: reg.aadhaar || "",
    pan: reg.pan,
    userStatus: "APPROVED",
    rejectionReason: "",
    lastActiveAt: nowIso,
    isFirstLogin: true,
    territoryType: targetRole === "DISTRIBUTOR" ? "PINCODE" : "NONE",
    territoryValue: targetRole === "DISTRIBUTOR" ? reg.pincode : ""
  };

  GLOBAL_USERS.push(newAccount);
  await pushToGoogleSheets("ADD_USER", newAccount);

  reg.status = "APPROVED";
  reg.assignedId = autoAssignedId;
  reg.assignedPass = autoAssignedPass;
  await pushToGoogleSheets("UPDATE_REGISTRATION_STATUS", { regId, status: "APPROVED", assignedId: autoAssignedId });

  const msg = `*${targetRole} ID Approved!* ✅\n\nHello *${reg.applicantName}*,\nYour ID for *${reg.appName}* has been approved.\n\n👤 *User ID:* ${autoAssignedId}\n🔑 *Temporary Password:* ${autoAssignedPass}\n\nSign in and set your new password on first login.\nThank you,\n*${GLOBAL_SETTINGS.brand_title}*`;

  await sendDirectWhatsAppMessage(reg.phone, msg);
  await logPortalActivity(ACTIVE_USER_SESSION?.userId || "ADMIN", "OFFICER", `Approved ${targetRole} Registration`, `${reg.applicantName} (${regId}) → ${autoAssignedId}`);

  renderChannelRegistrationsQueue();
  renderOfficerDistributorList();
  renderOfficerRetailerList();
  updateDashboardKpis();
};

// ================= FULL APPLICATION FORM DETAILS & DOCUMENT VIEWER =================
window.inspectApplicationDocs = function(appId) {
  const app = GLOBAL_APPLICATIONS.find(a => a.appId === appId);
  if (!app) return;

  const modal = document.getElementById("documentViewerModal");
  const title = document.getElementById("docViewAppTitle");
  const detailsBox = document.getElementById("docViewerFormDetailsBox");
  const list = document.getElementById("docViewerContentList");

  title.innerText = `${app.name} (${app.appId}) — Complete Form & Files`;

  if (detailsBox) {
    detailsBox.innerHTML = `
      <div class="grid-two">
        <div><strong>Applicant Name:</strong> ${app.name || "-"}</div>
        <div><strong>Service Type:</strong> ${app.serviceType || "-"}</div>
        <div><strong>Father's Name:</strong> ${app.fatherName || "-"}</div>
        <div><strong>Mother's Name:</strong> ${app.motherName || "-"}</div>
        <div><strong>Date of Birth:</strong> ${app.dob || "-"}</div>
        <div><strong>Gender:</strong> ${app.gender || "-"}</div>
        <div><strong>Mobile Number:</strong> ${app.phone || "-"}</div>
        <div><strong>Email ID:</strong> ${app.email || "-"}</div>
        <div><strong>ID Number:</strong> ${app.aadhaar || "-"}</div>
        <div><strong>Existing PAN (If Corr):</strong> ${app.panNumber || "N/A"}</div>
      </div>
      <div class="mt-2"><strong>DOB Proof Selected:</strong> ${app.proofDob || "-"}</div>
      ${app.corrections ? `<div><strong>Requested Corrections:</strong> ${app.corrections}</div>` : ""}
      <div><strong>Complete Address:</strong> ${app.fullAddress || app.pin || "-"}</div>
      <div><strong>Submitted By:</strong> <code>${app.retailerId || "PUBLIC"}</code> on ${app.date || "-"}</div>
    `;
  }

  const files = app.files || {};
  const docs = [
    { label: "ID Front Copy", data: files.fileAadhaarFront, name: `${app.appId}_ID_Front` },
    { label: "ID Back Copy", data: files.fileAadhaarBack, name: `${app.appId}_ID_Back` },
    { label: "DOB Proof Document", data: files.fileDob, name: `${app.appId}_DOB_Proof` },
    { label: "Applicant Photo (Auto-Sized)", data: files.filePhoto, name: `${app.appId}_Photo.jpg` },
    { label: "Applicant Signature (Auto-Sized)", data: files.fileSignature, name: `${app.appId}_Signature.jpg` }
  ];

  if (app.panNumber || files.filePan) {
    docs.push({ label: "Existing PAN Copy", data: files.filePan, name: `${app.appId}_Existing_PAN` });
  }

  list.innerHTML = docs.map(d => {
    const hasFile = Boolean(d.data);
    return `
      <div style="padding:12px; background:var(--bg-subtle); border:1px solid var(--border-color); border-radius:8px; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <strong style="font-size:12px; display:block;">${d.label}</strong>
          <span style="font-size:10px; color:var(--text-secondary);">${hasFile ? d.name : "Not Uploaded"}</span>
        </div>
        <div style="display:flex; gap:6px;">
          ${hasFile ? `
            <button type="button" class="btn-mini-action" style="background:#eff6ff; color:#2563eb;" onclick="previewDocumentFile('${d.data}', '${d.name}')">View</button>
            <button type="button" class="btn-mini-action" style="background:#ecfdf5; color:#059669;" onclick="downloadDocumentFile('${d.data}', '${d.name}')">Download</button>
          ` : `<span style="font-size:10px; color:var(--text-muted);">Empty</span>`}
        </div>
      </div>
    `;
  }).join("");

  modal?.classList.add("open");
};

window.closeDocumentViewerModal = function() { document.getElementById("documentViewerModal")?.classList.remove("open"); };

// ================= DISTRIBUTOR CONSOLE =================
function initDistributorConsole() {
  document.getElementById("tileChainTransfer")?.addEventListener("click", () => {
    if (!ensureKycApprovedOrBlock()) return;
    showDistributorSection("chainTransferCard");
  });
  document.getElementById("tileChainCreateUser")?.addEventListener("click", () => {
    if (!ensureKycApprovedOrBlock()) return;
    showDistributorSection("chainCreateUserCard");
  });
  document.getElementById("tileChainRetailers")?.addEventListener("click", () => {
    if (!ensureKycApprovedOrBlock()) return;
    showDistributorSection("chainDirectoryCard");
  });

  document.getElementById("chainBackHomeBtn")?.addEventListener("click", returnDistributorHome);

  document.getElementById("chainTransferForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!ensureKycApprovedOrBlock()) return;

    const targetId = document.getElementById("chainDownlineSelect").value;
    const amt = Number(document.getElementById("chainTransferAmt").value);
    const liveUser = GLOBAL_USERS.find(u => u.userId === ACTIVE_USER_SESSION.userId);

    if (!liveUser || liveUser.coupons < amt) return alert("Insufficient coupons in your account!");

    const receiver = GLOBAL_USERS.find(u => u.userId === targetId);
    if (receiver) {
      if (receiver.userStatus !== "APPROVED") {
        return alert("Cannot transfer coupons: Retailer account is not active!");
      }
      liveUser.coupons -= amt;
      receiver.coupons += amt;
      await touchUserLastActive(liveUser.userId);
      await pushToGoogleSheets("UPDATE_USER_COUPONS", { userId: liveUser.userId, coupons: liveUser.coupons });
      await pushToGoogleSheets("UPDATE_USER_COUPONS", { userId: receiver.userId, coupons: receiver.coupons });
      await logPortalActivity(liveUser.userId, "DISTRIBUTOR", "Transferred Coupons", `Sent ${amt} Pcs to Retailer ${receiver.name} (${receiver.userId})`);
      updateSessionWalletUI();
      updateDashboardKpis();
      setupDistributorConsoleView(liveUser);
      showToast(`Transferred ${amt} coupons to ${receiver.name}`, "success");
      document.getElementById("chainTransferForm").reset();
    }
  });

  document.getElementById("chainCreateUserForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!ensureKycApprovedOrBlock()) return;

    const name = document.getElementById("chainNewName").value.trim().toUpperCase();
    const phone = document.getElementById("chainNewPhone").value.trim();
    const email = document.getElementById("chainNewEmail").value.trim();
    const aadhaar = document.getElementById("chainNewAadhaar").value.trim();
    const pan = document.getElementById("chainNewPan").value.trim().toUpperCase();

    if (!name || name.length < 3) return showToast("Enter valid Legal Name.", "error");
    if (!/^[0-9]{10}$/.test(phone)) return showToast("Enter valid 10-digit WhatsApp Mobile.", "error");
    if (!email || !email.includes("@")) return showToast("Enter valid Email ID.", "error");
    if (!/^[0-9]{12}$/.test(aadhaar)) return showToast("Enter valid 12-digit ID Number.", "error");
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan)) return showToast("Enter valid 10-character PAN Number.", "error");

    const dupMsg = findDuplicateUserField(phone, email, aadhaar);
    if (dupMsg) {
      return alert(`Duplicate Account Blocked:\n${dupMsg}`);
    }

    const autoId = generate9DigitUserId("RETAILER");
    const autoPass = generateAutoPassword();

    const newRetailer = {
      userId: autoId,
      password: autoPass,
      name,
      role: "RETAILER",
      coupons: 0,
      parentId: ACTIVE_USER_SESSION.userId,
      phone,
      email,
      aadhaar,
      pan,
      userStatus: "KYC_PENDING",
      rejectionReason: "",
      lastActiveAt: new Date().toISOString(),
      isFirstLogin: true,
      territoryType: "NONE",
      territoryValue: ""
    };

    GLOBAL_USERS.push(newRetailer);
    await touchUserLastActive(ACTIVE_USER_SESSION.userId);
    await pushToGoogleSheets("ADD_USER", newRetailer);
    await logPortalActivity(ACTIVE_USER_SESSION.userId, "DISTRIBUTOR", "Registered Retailer (KYC Pending)", `Created Retailer ${name} (${autoId}) • Phone: ${phone}`);
    setupDistributorConsoleView(ACTIVE_USER_SESSION);
    updateDashboardKpis();

    showSuccessModal(name, autoId, "Retailer submitted for Officer KYC approval. Credentials will be dispatched once approved.");
    document.getElementById("chainCreateUserForm").reset();
  });
}

function showDistributorSection(cardId) {
  document.getElementById("chainAppGrid").style.display = "none";
  document.getElementById("chainWorkArea").style.display = "block";

  ["chainTransferCard", "chainCreateUserCard", "chainDirectoryCard"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = id === cardId ? "block" : "none";
  });
}

function setupDistributorConsoleView(user) {
  const myRetailers = GLOBAL_USERS.filter(u => u.parentId === user.userId && u.role === "RETAILER");
  const countEl = document.getElementById("chainDownlineCount");
  if (countEl) countEl.innerText = `${myRetailers.length} Retailers`;

  const select = document.getElementById("chainDownlineSelect");
  if (select) {
    const approvedRetailers = myRetailers.filter(r => r.userStatus === "APPROVED");
    select.innerHTML = approvedRetailers.length
      ? approvedRetailers.map(d => `<option value="${d.userId}">${d.name} (${d.userId})</option>`).join("")
      : `<option value="">No Active Retailers Yet</option>`;
  }

  const listEl = document.getElementById("chainDownlineSummaryList");
  const dirEl = document.getElementById("chainFullDirectoryList");

  const htmlMarkup = myRetailers.length ? myRetailers.map(r => {
    const isApproved = r.userStatus === "APPROVED";
    const isInactive = r.userStatus === "INACTIVE";
    const isRejected = r.userStatus === "REJECTED";
    const badgeBg = isApproved ? "#dcfce7" : (isRejected ? "#fee2e2" : (isInactive ? "#e2e8f0" : "#fef3c7"));
    const badgeColor = isApproved ? "#15803d" : (isRejected ? "#b91c1c" : (isInactive ? "#334155" : "#b45309"));

    return `
      <div style="padding:12px; border-bottom:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center; background:#fff;">
        <div>
          <strong>${r.name}</strong> • <code>${r.userId}</code>
          <span class="status-badge-inline" style="margin-left:6px; background:${badgeBg}; color:${badgeColor};">${r.userStatus}</span><br>
          <span style="font-size:11px; color:var(--text-secondary);">Mobile: <b>${r.phone}</b> | Coupons: <b class="text-success">${r.coupons} Pcs</b></span>
          ${(isRejected || isInactive) && r.rejectionReason ? `<br><span style="font-size:11px; color:#dc2626; font-weight:700;">Reason: ${r.rejectionReason}</span>` : ""}
        </div>
        <span style="font-size:11px; color:var(--text-muted); font-weight:700;">${isApproved ? "Active" : (isInactive ? "Inactive" : (isRejected ? "Rejected" : "Awaiting Officer"))}</span>
      </div>
    `;
  }).join("") : `<p class="text-secondary text-center" style="padding:16px;">No retailers mapped under your ID yet.</p>`;

  if (listEl) listEl.innerHTML = htmlMarkup;
  if (dirEl) dirEl.innerHTML = htmlMarkup;
}

// ================= GLOBAL CMS, LOGO, NAME & APK DOWNLOAD LINK SETTINGS =================
function applyGlobalSettingsToDOM() {
  const bTitle = GLOBAL_SETTINGS.brand_title || "BISWAS DIGITAL";
  const bSub = GLOBAL_SETTINGS.brand_sub || "Enterprise Smart Portal";
  const bLogo = GLOBAL_SETTINGS.brand_logo || "";

  if (document.getElementById("pageDocTitle")) document.getElementById("pageDocTitle").innerText = `${bTitle} - ${bSub}`;
  if (document.getElementById("webBrandTitle")) document.getElementById("webBrandTitle").innerText = bTitle;
  if (document.getElementById("webBrandSub")) document.getElementById("webBrandSub").innerText = bSub;
  if (document.getElementById("footerCompanyName")) document.getElementById("footerCompanyName").innerText = bTitle;
  if (document.getElementById("footerCopyrightBrand")) document.getElementById("footerCopyrightBrand").innerText = bTitle;

  document.querySelectorAll(".dynamic-app-brand-name").forEach(el => {
    el.innerText = bTitle;
  });

  const pubLogoWrap = document.getElementById("publicBrandLogoWrap");
  if (pubLogoWrap && bLogo) {
    pubLogoWrap.innerHTML = `<img src="${bLogo}" alt="Logo" style="width:100%; height:100%; object-fit:cover; border-radius:10px;">`;
  }
  ["retSidebarLogo", "distSidebarLogo", "offSidebarLogo"].forEach(id => {
    const el = document.getElementById(id);
    if (el && bLogo) {
      el.innerHTML = `<img src="${bLogo}" alt="Logo" style="width:100%; height:100%; object-fit:cover; border-radius:10px;">`;
    }
  });

  const heroT = document.getElementById("webHeroTitle");
  const heroD = document.getElementById("webHeroDesc");
  if (heroT) heroT.innerText = GLOBAL_SETTINGS.hero_title;
  if (heroD) heroD.innerText = GLOBAL_SETTINGS.hero_desc;

  const apkUrl = GLOBAL_SETTINGS.apk_download_url || "BiswasDigital.apk";
  ["btnNavDownloadApk", "btnHeroDownloadApk", "btnCardDownloadApk", "btnFooterDownloadApk"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.href = apkUrl;
  });

  const noticeTxt = GLOBAL_SETTINGS.broadcast_notice || "Welcome to Biswas Digital Portal!";
  ["retailerNoticeMarquee", "chainNoticeMarquee", "officerNoticeMarquee", "publicNoticeMarquee"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerText = noticeTxt;
  });

  const cleanPhone = (GLOBAL_SETTINGS.business_whatsapp || "919876543210").replace(/[^0-9]/g, "");
  const defaultMsg = GLOBAL_SETTINGS.whatsapp_pre_msg || "Hello Debajit Sir, I want to inquire about PAN Services.";
  const waDirectUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(defaultMsg)}`;

  ["btnNavWhatsApp", "btnFooterWhatsApp", "floatingWhatsAppBtn"].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.href = waDirectUrl;
  });

  if (document.getElementById("footerCompanyPhone")) document.getElementById("footerCompanyPhone").innerText = GLOBAL_SETTINGS.company_phone;
  if (document.getElementById("footerCompanyEmail")) document.getElementById("footerCompanyEmail").innerText = GLOBAL_SETTINGS.company_email;
}

function initGlobalSettingsEngine() {
  document.getElementById("globalSettingsForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (document.getElementById("setApkDownloadUrl")?.value.trim()) GLOBAL_SETTINGS.apk_download_url = document.getElementById("setApkDownloadUrl").value.trim();
    if (document.getElementById("setHeroTitle")?.value.trim()) GLOBAL_SETTINGS.hero_title = document.getElementById("setHeroTitle").value.trim();
    if (document.getElementById("setHeroDesc")?.value.trim()) GLOBAL_SETTINGS.hero_desc = document.getElementById("setHeroDesc").value.trim();
    if (document.getElementById("setBroadcastNote")?.value.trim()) GLOBAL_SETTINGS.broadcast_notice = document.getElementById("setBroadcastNote").value.trim();
    if (document.getElementById("setBusinessWhatsApp")?.value.trim()) GLOBAL_SETTINGS.business_whatsapp = document.getElementById("setBusinessWhatsApp").value.trim();
    if (document.getElementById("setCompanyPhone")?.value.trim()) GLOBAL_SETTINGS.company_phone = document.getElementById("setCompanyPhone").value.trim();
    if (document.getElementById("setCompanyEmail")?.value.trim()) GLOBAL_SETTINGS.company_email = document.getElementById("setCompanyEmail").value.trim();

    await pushToGoogleSheets("UPDATE_SETTINGS", GLOBAL_SETTINGS);
    applyGlobalSettingsToDOM();
    showToast("Settings & APK Link Published!", "success");
    returnOfficerHome();
  });
}

function initInstantLogout() {
  document.querySelectorAll(".instant-logout-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      closeMobileSidebars();
      ACTIVE_USER_SESSION = null;
      document.getElementById("appContainer").style.display = "none";
      document.getElementById("retailerPortalContainer").style.display = "none";
      document.getElementById("chainPortalContainer").style.display = "none";
      document.getElementById("kycPendingScreen").style.display = "none";
      document.getElementById("loginScreen").style.display = "flex";
      showToast("Logged out successfully!", "success");
    });
  });
}

window.togglePassVisibility = function(inputId) {
  const input = document.getElementById(inputId);
  if (input) input.type = input.type === "password" ? "text" : "password";
};

function showToast(msg, type) {
  const toast = document.getElementById("statusToast");
  if (!toast) return;
  toast.className = `toast-popup ${type}`;
  toast.innerText = msg;
  setTimeout(() => { toast.className = "toast-popup"; }, 3400);
}
