// 部门工作台 · 应用逻辑
// 云服务配置来自 activate 返回的 publicConfig（前端可安全携带）

const PUBLIC_CONFIG = {
  endpoint: "https://dept-workspace-27153.app.workbuddy.host",
  oauthRelayBaseUrl: "https://www.workbuddy.cn/v2/as/genie-baas/oauth",
  publishableKey: "wbpk_Pbzwea2gOhMuGtuUFOXDLn_TWi3GnuJpUfMniGxW2gI4ncmv9WZcoZE",
};

// ===== 云服务客户端 =====
let cloud = null;
function initCloud() {
  if (typeof WorkBuddyCloud === "undefined") {
    setServiceStatus(false, "SDK 加载失败");
    return false;
  }
  try {
    cloud = WorkBuddyCloud.createWorkBuddyCloud({
      endpoint: PUBLIC_CONFIG.endpoint,
      oauthRelayBaseUrl: PUBLIC_CONFIG.oauthRelayBaseUrl,
      publishableKey: PUBLIC_CONFIG.publishableKey,
    });
    setServiceStatus(true, "服务已连接");
    return true;
  } catch (e) {
    setServiceStatus(false, "初始化失败");
    return false;
  }
}

// ===== 视图导航 =====
const VIEW_NAMES = {
  overview: "概览",
  reminders: "活动提醒",
  templates: "公文模板",
  scores: "加减分",
  guide: "使用指南",
};

function switchView(view) {
  document.querySelectorAll(".view").forEach((v) => (v.hidden = true));
  const target = document.getElementById("view-" + view);
  if (target) target.hidden = false;
  document.querySelectorAll(".nav-item[data-view]").forEach((n) => {
    n.classList.toggle("active", n.dataset.view === view);
  });
  document.getElementById("page-name").textContent = VIEW_NAMES[view] || view;
  // 移动端收起侧栏
  document.body.classList.remove("sidebar-open");
  // 切到公文模板页时刷新数据
  if (view === "templates") {
    loadTemplates();
    loadTemplateOptions();
  }
  // 切到活动提醒页时刷新数据
  if (view === "reminders") {
    loadActivities();
    checkReminderPermission();
  }
  // 切到加减分页时刷新数据
  if (view === "scores") {
    loadScores();
    loadMemberOptions();
    loadMemberList();
    loadAdminList();
  }
}

// ===== 侧栏收起 =====
document.getElementById("toggle-sidebar").addEventListener("click", () => {
  if (window.innerWidth <= 760) {
    document.body.classList.toggle("sidebar-open");
  } else {
    document.body.classList.toggle("sidebar-collapsed");
  }
});

// ===== 导航绑定 =====
document.querySelectorAll(".nav-item[data-view], .button[data-view]").forEach((el) => {
  el.addEventListener("click", () => switchView(el.dataset.view));
});

// ===== 服务状态 =====
function setServiceStatus(ok, text) {
  const dot = document.querySelector(".status-dot");
  const statusEl = document.getElementById("service-status");
  if (dot) dot.classList.toggle("offline", !ok);
  if (statusEl) statusEl.textContent = text;
}

// ===== 登录逻辑 =====
const authDialog = document.getElementById("auth-dialog");
const authTab = "phone"; // 当前登录方式：phone | email
let pendingOtp = null; // { phone|email, verificationId, isExistingUser }
let countdownTimer = null;

const loginBtn = document.getElementById("login-btn");
const topAvatar = document.getElementById("top-avatar");

loginBtn.addEventListener("click", () => openAuthDialog());
document.getElementById("auth-close").addEventListener("click", () => authDialog.close());

// 点击侧栏用户区 / 顶部头像 → 打开个人账号页
const workspaceUser = document.querySelector(".workspace-user");
if (workspaceUser) workspaceUser.addEventListener("click", () => openProfileDialog());
topAvatar.addEventListener("click", () => openProfileDialog());

function openAuthDialog() {
  authDialog.showModal();
}

// 登录方式切换
document.querySelectorAll(".auth-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".auth-tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    const mode = tab.dataset.tab;
    const input = document.getElementById("auth-input");
    const label = document.getElementById("auth-field-label");
    if (mode === "phone") {
      input.placeholder = "请输入手机号";
      label.textContent = "手机号";
      input.value = "";
    } else {
      input.placeholder = "请输入邮箱";
      label.textContent = "邮箱";
      input.value = "";
    }
    document.getElementById("auth-error").textContent = "";
    document.getElementById("auth-code").value = "";
    pendingOtp = null;
  });
});

function currentMode() {
  return document.querySelector(".auth-tab.active").dataset.tab;
}

function showAuthError(msg) {
  document.getElementById("auth-error").textContent = msg || "";
}

// 获取验证码
document.getElementById("auth-send").addEventListener("click", async () => {
  if (!cloud) { showAuthError("服务未连接，请刷新重试"); return; }
  const mode = currentMode();
  const val = document.getElementById("auth-input").value.trim();
  showAuthError("");

  if (mode === "phone") {
    if (!/^1\d{10}$/.test(val)) { showAuthError("请输入正确的 11 位手机号"); return; }
  } else {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) { showAuthError("请输入正确的邮箱地址"); return; }
  }

  const sendBtn = document.getElementById("auth-send");
  sendBtn.disabled = true;

  const sent = await cloud.auth.sendOtp(mode === "phone" ? { phone: val } : { email: val });
  if (sent.error) {
    showAuthError(sent.error.message || "验证码发送失败");
    sendBtn.disabled = false;
    return;
  }
  pendingOtp = {
    [mode]: val,
    verificationId: sent.data.verificationId,
    isExistingUser: sent.data.isExistingUser,
  };
  startCountdown(sendBtn);
});

function startCountdown(btn) {
  let n = 60;
  btn.textContent = `${n}s`;
  clearInterval(countdownTimer);
  countdownTimer = setInterval(() => {
    n--;
    if (n <= 0) {
      clearInterval(countdownTimer);
      btn.textContent = "获取验证码";
      btn.disabled = false;
    } else {
      btn.textContent = `${n}s`;
    }
  }, 1000);
}

// 登录/注册
document.getElementById("auth-submit").addEventListener("click", async () => {
  if (!cloud) { showAuthError("服务未连接"); return; }
  const mode = currentMode();
  const val = document.getElementById("auth-input").value.trim();
  const code = document.getElementById("auth-code").value.trim();
  showAuthError("");

  if (!pendingOtp || pendingOtp[mode] !== val) {
    showAuthError("请先获取验证码");
    return;
  }
  if (!code) { showAuthError("请输入验证码"); return; }

  const completed = await cloud.auth.verifyOtp({
    [mode]: pendingOtp[mode],
    verificationId: pendingOtp.verificationId,
    isExistingUser: pendingOtp.isExistingUser,
    token: code,
  });
  if (completed.error) {
    showAuthError(completed.error.message || "验证失败");
    return;
  }
  pendingOtp = null;
  authDialog.close();
  await refreshUser();
});

// WorkBuddy 登录
document.getElementById("auth-workbuddy").addEventListener("click", async () => {
  if (!cloud) { showAuthError("服务未连接"); return; }
  showAuthError("");
  const back = new URL(location.href);
  back.pathname = "/";
  for (const key of ["code", "state", "provider"]) back.searchParams.delete(key);
  const { data, error } = await cloud.auth.signInWithOAuth({
    provider: "workbuddy",
    redirectTo: back.toString(),
  });
  if (error) {
    showAuthError(error.message || "登录失败");
    return;
  }
  location.assign(data.url);
});

// ===== 会话恢复与用户信息 =====
// 当前登录用户的完整信息缓存（含自定义昵称/头像）
let currentUserInfo = null;

async function refreshUser() {
  if (!cloud) return;
  const { data: session, error } = await cloud.auth.getSession();
  const nameEl = document.getElementById("user-name");
  const avatarEls = [document.getElementById("user-avatar"), document.getElementById("top-avatar")];

  if (error || !session) {
    currentUserInfo = null;
    nameEl.textContent = "未登录";
    avatarEls.forEach((a) => (a.textContent = "访"));
    document.getElementById("env-pill").textContent = "未登录";
    return;
  }

  const user = session.user || {};
  let name = user.name || "";
  let phone = user.phone || "";
  let email = user.email || "";
  let avatarUrl = user.avatarUrl || "";
  let uid = user.id || user.sub || "";
  // OTP 登录时 session.user 无 name/phone，需用 getUser() 获取
  try {
    const u = await cloud.auth.getUser();
    name = name || u.data?.name || "";
    phone = phone || u.data?.phone || "";
    email = email || u.data?.email || "";
    avatarUrl = avatarUrl || u.data?.avatarUrl || "";
    uid = uid || u.data?.id || u.data?.sub || "";
  } catch (e) {
    // 忽略，使用 session 内已有字段
  }

  // 读取自定义资料（昵称/头像），优先展示用户自己设置的
  let custom = { name: "", avatarUrl: "" };
  if (uid && cloud.database) {
    try {
      const { data } = await cloud.database.from("profiles").select("name, avatar_url").eq("uid", uid).maybeSingle();
      if (data) custom = { name: data.name || "", avatarUrl: data.avatar_url || "" };
    } catch (e) {
      // profiles 表可能不存在或无权访问，忽略
    }
  }

  const displayName = custom.name || name || phone || email || "已登录";
  currentUserInfo = {
    uid, name, phone, email, avatarUrl,
    customName: custom.name, customAvatarUrl: custom.avatarUrl,
    displayName,
  };

  nameEl.textContent = displayName;
  const initial = (displayName || "用").charAt(0);
  applyAvatar(avatarEls, custom.avatarUrl, initial);
  document.getElementById("env-pill").textContent = "已登录";

  // 登录后自动认领负责人身份：若自己的手机号在 admins 表但尚未绑定 uid，则补上（用于数据库 RLS 判定管理员）
  claimAdminIfNeeded();
}

// 给头像元素设置显示：有自定义头像则用图片，否则用首字母
function applyAvatar(els, avatarUrl, initial) {
  els.forEach((a) => {
    if (avatarUrl) {
      a.innerHTML = `<img src="${escapeHtml(avatarUrl)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;" />`;
    } else {
      a.textContent = initial;
    }
  });
}

async function claimAdminIfNeeded() {
  if (!cloud) return;
  try {
    const u = await cloud.auth.getUser();
    const phone = u.data?.phone ? normalizePhone(u.data.phone) : "";
    if (!phone) return;
    const { data } = await cloud.database.from("admins").select("id, uid").eq("phone", phone);
    const rec = data && data[0];
    if (rec && !rec.uid) {
      // 该手机号已设为负责人但还没绑定 uid，补上
      await cloud.database.rpc("claim_admin", { phone_input: phone });
    }
  } catch (e) {
    // 忽略认领失败，不影响正常使用
  }
}

// ===== 个人账号 =====
const profileDialog = document.getElementById("profile-dialog");
let pendingAvatarFile = null; // 待上传的头像文件

// 打开个人账号弹窗
function openProfileDialog() {
  if (!cloud) { alert("服务未连接，请刷新重试"); return; }
  if (!currentUserInfo) {
    // 未登录，引导登录
    openAuthDialog();
    return;
  }
  renderProfile();
  profileDialog.showModal();
}

// 渲染个人账号信息
function renderProfile() {
  const info = currentUserInfo;
  const name = info.customName || info.name || info.phone || info.email || "已登录";
  const avatarUrl = info.customAvatarUrl || info.avatarUrl || "";

  document.getElementById("profile-name").textContent = name;
  document.getElementById("profile-name-input").value = name;

  // 手机号/邮箱脱敏显示
  const contact = info.phone ? maskPhone(info.phone) : (info.email ? maskEmail(info.email) : "未绑定手机/邮箱");
  document.getElementById("profile-phone").textContent = contact;

  // 头像
  const av = document.getElementById("profile-avatar");
  if (avatarUrl) {
    av.innerHTML = `<img src="${escapeHtml(avatarUrl)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;" />`;
  } else {
    av.textContent = (name || "用").charAt(0);
  }

  document.getElementById("profile-error").textContent = "";
  pendingAvatarFile = null;
}

function maskPhone(p) {
  const s = normalizePhone(p);
  if (s.length >= 11) return s.slice(0, 3) + "****" + s.slice(-4);
  return p;
}
function maskEmail(e) {
  const [local, domain] = String(e).split("@");
  if (!domain) return e;
  const head = local.slice(0, 2) + "***";
  return head + "@" + domain;
}

// 保存昵称
document.getElementById("profile-save").addEventListener("click", async () => {
  const errEl = document.getElementById("profile-error");
  errEl.textContent = "";
  const name = document.getElementById("profile-name-input").value.trim();
  if (!name) { errEl.textContent = "昵称不能为空"; return; }

  const uid = currentUserInfo.uid;
  if (!uid || !cloud.database) { errEl.textContent = "当前账号不支持保存昵称"; return; }

  try {
    // upsert 到 profiles 表
    await cloud.database.from("profiles").upsert(
      { uid, name, updated_at: new Date().toISOString() },
      { onConflict: "uid" }
    );
    // 上传头像（若有待上传文件）
    if (pendingAvatarFile) {
      const path = cloud.storage.userPath(uid, "avatar");
      const { error: upErr } = await cloud.storage.upload(path, pendingAvatarFile, {
        contentType: pendingAvatarFile.type || "image/png",
        upsert: true,
      });
      if (upErr) { errEl.textContent = "头像上传失败：" + (upErr.message || upErr); return; }
      // 生成签名 URL 存到 profiles
      const { data: urlData } = await cloud.storage.createSignedUrl(path, 31536000);
      const avatarUrl = urlData?.url || urlData?.signedUrl || urlData || "";
      if (avatarUrl) {
        await cloud.database.from("profiles").upsert(
          { uid, avatar_url: avatarUrl },
          { onConflict: "uid" }
        );
      }
    }
    errEl.textContent = "";
    profileDialog.close();
    await refreshUser();
  } catch (e) {
    errEl.textContent = "保存失败：" + (e.message || "请稍后重试");
  }
});

// 选择头像文件
document.getElementById("profile-upload-avatar").addEventListener("click", () => {
  document.getElementById("profile-avatar-file").click();
});
document.getElementById("profile-avatar-file").addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  // 限制大小 2MB
  if (file.size > 2 * 1024 * 1024) {
    document.getElementById("profile-error").textContent = "图片不能超过 2MB";
    e.target.value = "";
    return;
  }
  pendingAvatarFile = file;
  // 本地预览
  const reader = new FileReader();
  reader.onload = () => {
    const av = document.getElementById("profile-avatar");
    av.innerHTML = `<img src="${reader.result}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;" />`;
  };
  reader.readAsDataURL(file);
});

// 恢复默认头像
document.getElementById("profile-remove-avatar").addEventListener("click", async () => {
  const errEl = document.getElementById("profile-error");
  errEl.textContent = "";
  const uid = currentUserInfo?.uid;
  if (!uid || !cloud.database) { errEl.textContent = "当前账号不支持修改头像"; return; }
  try {
    await cloud.database.from("profiles").upsert({ uid, avatar_url: "" }, { onConflict: "uid" });
    pendingAvatarFile = null;
    const name = document.getElementById("profile-name-input").value.trim() || "用";
    document.getElementById("profile-avatar").textContent = name.charAt(0);
    await refreshUser();
    errEl.textContent = "";
  } catch (e) {
    errEl.textContent = "操作失败：" + (e.message || "");
  }
});

// 退出登录
document.getElementById("profile-logout").addEventListener("click", async () => {
  if (!cloud) return;
  if (!confirm("确定要退出登录吗？")) return;
  try {
    await cloud.auth.signOut();
    profileDialog.close();
    currentUserInfo = null;
    await refreshUser();
  } catch (e) {
    alert("退出失败：" + (e.message || "请重试"));
  }
});

document.getElementById("profile-close").addEventListener("click", () => profileDialog.close());

// ===== 启动 =====
async function bootstrap() {
  const ok = initCloud();
  if (ok) {
    await refreshUser();
    // 预加载模板
    loadTemplates();
    loadTemplateOptions();
    // 预加载活动指标 + 检测到点提醒
    updateReminderMetric();
    checkDueReminders();
    // 处理 OAuth 回调
    const url = new URL(location.href);
    if (url.searchParams.has("code") || url.searchParams.has("error")) {
      const provider = url.searchParams.get("provider");
      if (provider === "workbuddy" && typeof cloud.auth.handleWorkBuddyCallback === "function") {
        const { data: session, error } = await cloud.auth.handleWorkBuddyCallback.call(cloud.auth);
        if (error) {
          showAuthError(error.message || "登录失败");
          openAuthDialog();
        } else if (session) {
          for (const key of ["code", "state", "provider"]) url.searchParams.delete(key);
          history.replaceState(null, "", url.pathname + url.search + url.hash);
          await refreshUser();
        }
      }
    }
  }
}

// ===== 公文模板模块 =====
const CATEGORY_LABELS = {
  notice: "通知类",
  post: "推文宣传类",
  format: "格式要求",
};

// 子标签切换
document.querySelectorAll(".sub-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".sub-tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    const target = tab.dataset.subtab;
    document.getElementById("subtab-template-lib").hidden = target !== "template-lib";
    document.getElementById("subtab-generate").hidden = target !== "generate";
    if (target === "template-lib") loadTemplates();
    if (target === "generate") loadTemplateOptions();
  });
});

// 模板弹窗
const templateDialog = document.getElementById("template-dialog");
let editingTemplateId = null;

document.getElementById("btn-add-template").addEventListener("click", () => {
  editingTemplateId = null;
  document.getElementById("template-dialog-title").textContent = "上传模板/格式";
  document.getElementById("template-name").value = "";
  document.getElementById("template-content").value = "";
  document.getElementById("template-category").value = "notice";
  document.getElementById("template-error").textContent = "";
  templateDialog.showModal();
});
document.getElementById("template-close").addEventListener("click", () => templateDialog.close());

document.getElementById("template-save").addEventListener("click", async () => {
  if (!cloud) { showTemplateError("服务未连接"); return; }
  const session = await cloud.auth.getSession();
  if (session.error || !session.data) {
    showTemplateError("请先登录后再上传模板");
    return;
  }
  const name = document.getElementById("template-name").value.trim();
  const category = document.getElementById("template-category").value;
  const content = document.getElementById("template-content").value.trim();
  showTemplateError("");

  if (!name) { showTemplateError("请填写模板名称"); return; }
  if (!content) { showTemplateError("请填写模板/格式内容"); return; }

  const payload = {
    title: name,
    category,
    content,
    owner_name: session.data.user?.name ?? null,
  };

  if (editingTemplateId) {
    const { error } = await cloud.database
      .from("templates")
      .update(payload)
      .eq("id", editingTemplateId);
    if (error) { showTemplateError("保存失败：" + (error.message || "")); return; }
  } else {
    const { error } = await cloud.database.from("templates").insert(payload);
    if (error) { showTemplateError("保存失败：" + (error.message || "")); return; }
  }
  templateDialog.close();
  await loadTemplates();
});

function showTemplateError(msg) {
  document.getElementById("template-error").textContent = msg || "";
}

// 加载模板列表
async function loadTemplates() {
  if (!cloud) return;
  const listEl = document.getElementById("template-list");
  const emptyEl = document.getElementById("template-empty");

  const { data, error } = await cloud.database
    .from("templates")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    listEl.innerHTML = "";
    emptyEl.hidden = false;
    return;
  }

  if (!data || data.length === 0) {
    listEl.innerHTML = "";
    emptyEl.hidden = false;
    return;
  }

  emptyEl.hidden = true;
  listEl.innerHTML = data
    .map((t) => {
      const cat = CATEGORY_LABELS[t.category] || t.category || "其他";
      const catClass = t.category === "post" ? "post" : t.category === "format" ? "format" : "";
      return `
        <div class="card template-card" data-id="${t.id}">
          <div class="template-card-top">
            <span class="template-cat ${catClass}">${cat}</span>
            <span class="template-card-foot" style="border:0;padding:0;gap:6px;">
              <small>${t.owner_name || ""}</small>
            </span>
          </div>
          <h3>${escapeHtml(t.title)}</h3>
          <pre>${escapeHtml(t.content)}</pre>
          <div class="template-card-foot">
            <small>${formatDate(t.created_at)}</small>
            <button class="template-del" data-id="${t.id}">删除</button>
          </div>
        </div>`;
    })
    .join("");

  listEl.querySelectorAll(".template-del").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("确定删除这个模板吗？")) return;
      const { error } = await cloud.database
        .from("templates")
        .delete()
        .eq("id", btn.dataset.id);
      if (!error) await loadTemplates();
    });
  });
}

// 加载生成页的模板下拉选项
async function loadTemplateOptions() {
  if (!cloud) return;
  const select = document.getElementById("gen-template-select");
  const { data, error } = await cloud.database
    .from("templates")
    .select("id, title, category, content")
    .order("created_at", { ascending: false });

  if (error || !data) {
    select.innerHTML = '<option value="">不使用模板（用通用格式）</option>';
    return;
  }

  const options = data
    .map((t) => `<option value="${t.id}">${escapeHtml(t.title)}（${CATEGORY_LABELS[t.category] || "其他"}）</option>`)
    .join("");
  select.innerHTML = '<option value="">不使用模板（用通用格式）</option>' + options;
}

// 生成类型切换
let genType = "notice";
document.querySelectorAll(".gen-type").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".gen-type").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    genType = btn.dataset.type;
  });
});

// ===== 图片资料上传 =====
const MAX_IMAGES = 4;              // 图片数量上限
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 单图大小上限 5MB
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
let genImages = []; // [{ dataUrl, name }]

const imageDrop = document.getElementById("gen-image-drop");
const imageInput = document.getElementById("gen-image-input");
const imageList = document.getElementById("gen-image-list");
const imageError = document.getElementById("gen-image-error");

function showImageError(msg) { imageError.textContent = msg || ""; }

imageDrop.addEventListener("click", () => imageInput.click());
imageInput.addEventListener("change", () => {
  addImages([...imageInput.files]);
  imageInput.value = "";
});

// 拖拽
imageDrop.addEventListener("dragover", (e) => { e.preventDefault(); imageDrop.classList.add("dragover"); });
imageDrop.addEventListener("dragleave", () => imageDrop.classList.remove("dragover"));
imageDrop.addEventListener("drop", (e) => {
  e.preventDefault();
  imageDrop.classList.remove("dragover");
  addImages([...e.dataTransfer.files]);
});

// 粘贴
document.addEventListener("paste", (e) => {
  // 仅当生成子页可见时才处理粘贴图片
  const genView = document.getElementById("subtab-generate");
  if (genView.hidden) return;
  const items = [...(e.clipboardData?.items || [])];
  const files = items
    .filter((it) => it.kind === "file" && ALLOWED_IMAGE_TYPES.includes(it.type))
    .map((it) => it.getAsFile());
  if (files.length) addImages(files);
});

function addImages(files) {
  showImageError("");
  const room = MAX_IMAGES - genImages.length;
  const toAdd = files.slice(0, room);
  if (files.length > room) {
    showImageError(`图片最多 ${MAX_IMAGES} 张，已忽略多余的 ${files.length - room} 张`);
  }
  for (const f of toAdd) {
    if (!ALLOWED_IMAGE_TYPES.includes(f.type)) {
      showImageError(`不支持的文件格式：${f.name || f.type}（仅支持 jpg / png / webp）`);
      continue;
    }
    if (f.size > MAX_IMAGE_SIZE) {
      showImageError(`图片「${f.name}」超过 5MB，已跳过`);
      continue;
    }
    const reader = new FileReader();
    reader.onload = () => {
      genImages.push({ dataUrl: reader.result, name: f.name });
      renderImages();
    };
    reader.readAsDataURL(f);
  }
}

function renderImages() {
  imageList.innerHTML = genImages
    .map((img, i) => `
      <div class="gen-image-item" data-idx="${i}">
        <img src="${img.dataUrl}" alt="${escapeHtml(img.name)}" />
        <span class="gen-image-index">${i + 1}</span>
        <button class="gen-image-del" data-idx="${i}" title="删除">×</button>
      </div>`)
    .join("");
  imageList.querySelectorAll(".gen-image-del").forEach((btn) => {
    btn.addEventListener("click", () => {
      genImages.splice(Number(btn.dataset.idx), 1);
      renderImages();
      showImageError("");
    });
  });
}

document.getElementById("btn-clear").addEventListener("click", () => {
  document.getElementById("gen-material").value = "";
  document.getElementById("gen-error").textContent = "";
});

// 生成公文
document.getElementById("btn-generate").addEventListener("click", async () => {
  if (!cloud) { showGenError("服务未连接"); return; }
  const session = await cloud.auth.getSession();
  if (session.error || !session.data) {
    showGenError("请先登录后再使用生成功能");
    return;
  }

  const material = document.getElementById("gen-material").value.trim();
  showGenError("");
  if (!material) { showGenError("请先填写资料内容"); return; }

  // 获取选中的模板
  const templateId = document.getElementById("gen-template-select").value;
  let templateContent = "";
  if (templateId) {
    const { data } = await cloud.database
      .from("templates")
      .select("content, title")
      .eq("id", templateId)
      .maybeSingle();
    templateContent = data ? `${data.title}：\n${data.content}` : "";
  }

  // 显示加载态
  const resultEmpty = document.getElementById("gen-result-empty");
  const resultText = document.getElementById("gen-result-text");
  const resultActions = document.getElementById("gen-result-actions");
  resultEmpty.innerHTML = '<div class="gen-loading">AI 正在生成，请稍候…</div>';
  resultEmpty.hidden = false;
  resultText.hidden = true;
  resultActions.hidden = true;

  try {
    // 获取模型列表；有图片时必须选支持图片的模型
    const models = await cloud.llm.models.list();
    const hasImages = genImages.length > 0;
    let model = models.find((m) => {
      if (m.disabled === true) return false;
      return hasImages ? m.supportsImages === true : true;
    });
    if (!model) {
      showGenError(hasImages ? "暂无可处理图片的 AI 模型" : "暂无可用的 AI 模型");
      resultEmpty.innerHTML = '<div class="empty-icon"><i data-icon="spark"></i></div><p>生成的通知或推文会显示在这里。</p>';
      return;
    }

    // 构建 prompt
    const systemPrompt = buildSystemPrompt(genType);
    const userPrompt = buildUserPrompt(genType, material, templateContent, genImages.length);

    // 构建多模态消息：有图片时用 content 数组
    let messages;
    if (hasImages) {
      const contentParts = [{ type: "text", text: userPrompt }];
      for (const img of genImages) {
        contentParts.push({ type: "image_url", image_url: { url: img.dataUrl } });
      }
      messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: contentParts },
      ];
    } else {
      messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ];
    }

    let answer = "";
    for await (const chunk of cloud.llm.chat.completions.create({
      model: model.id,
      messages,
      stream: true,
    })) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) answer += delta;
    }

    if (!answer.trim()) {
      showGenError("生成结果为空，请重试");
      resultEmpty.hidden = false;
      resultEmpty.innerHTML = '<div class="empty-icon"><i data-icon="spark"></i></div><p>生成的通知或推文会显示在这里。</p>';
      return;
    }

    resultEmpty.hidden = true;
    resultText.hidden = false;
    resultText.textContent = answer.trim();
    resultActions.hidden = false;
  } catch (e) {
    showGenError("生成失败：" + (e?.error?.message || e?.message || "未知错误"));
    resultEmpty.hidden = false;
    resultEmpty.innerHTML = '<div class="empty-icon"><i data-icon="spark"></i></div><p>生成的通知或推文会显示在这里。</p>';
  }
});

function buildSystemPrompt(type) {
  if (type === "notice") {
    return "你是一位资深的学院公文写作专家，擅长撰写正式、规范的部门通知。你会严格遵循用户提供的模板或格式要求，信息完整、措辞得体、格式规范。输出纯文本，可直接复制粘贴到聊天群。";
  }
  return "你是一位资深的学院宣传文案专家，擅长撰写生动、有温度的推文。你会严格遵循用户提供的模板或格式要求，内容具体、有感染力、正能量。输出纯文本，可直接复制粘贴到聊天群。";
}

function buildUserPrompt(type, material, templateContent, imageCount) {
  const typeName = type === "notice" ? "通知" : "推文";
  let prompt = `请根据以下资料，撰写一篇${typeName}。\n\n`;
  if (templateContent) {
    prompt += `【需要遵循的模板/格式要求】\n${templateContent}\n\n`;
  } else {
    prompt += "【格式要求】\n请使用标准公文体格式，标题、称谓、正文、落款完整。\n\n";
  }
  prompt += `【资料】\n${material}\n\n`;
  if (imageCount && imageCount > 0) {
    prompt += `【图片资料】\n本消息附带了 ${imageCount} 张图片（按顺序为第 1 张到第 ${imageCount} 张）。请仔细阅读每张图片中的信息（文字、时间、地点、人物、数据等），并把图片里的关键信息纳入成品正文。\n\n`;
    if (type === "post") {
      prompt += "【配图标注要求】\n由于这是推文，请在成品的合适位置用「【配图N：说明】」标注对应图片（N 为图片序号，说明为该图内容的一两句话概括），让读者知道哪里该插入第 N 张图。\n\n";
    }
  }
  prompt += "要求：\n1. 严格遵循上述模板/格式\n2. 信息来自资料和图片，不要编造\n3. 资料或图片中缺失的关键信息（如具体日期、部门名称）用【】标注占位\n4. 直接输出成品，不要解释说明";
  return prompt;
}

function showGenError(msg) {
  document.getElementById("gen-error").textContent = msg || "";
}

// 复制结果
document.getElementById("btn-copy-result").addEventListener("click", async () => {
  const text = document.getElementById("gen-result-text").textContent;
  try {
    await navigator.clipboard.writeText(text);
    const btn = document.getElementById("btn-copy-result");
    const old = btn.innerHTML;
    btn.innerHTML = "已复制 ✓";
    setTimeout(() => (btn.innerHTML = old), 1500);
  } catch (e) {
    // 降级方案
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    const btn = document.getElementById("btn-copy-result");
    const old = btn.innerHTML;
    btn.innerHTML = "已复制 ✓";
    setTimeout(() => (btn.innerHTML = old), 1500);
  }
});

// 工具函数
function escapeHtml(str) {
  return (str || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ===== 加减分模块 =====
const BASE_SCORE = 85; // 基础分
const EXCLUDED_MEMBERS = ["孙诗琪", "范佳宁"]; // 不参与考核（负责人本人）
const SUPER_ADMIN_PHONE = "15086653768"; // 唯一能清空记录的人

// 子标签切换（加减分页）
document.querySelectorAll('#view-scores .sub-tab').forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll('#view-scores .sub-tab').forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    const target = tab.dataset.subtab;
    document.getElementById("subtab-ranking").hidden = target !== "ranking";
    document.getElementById("subtab-score-entry").hidden = target !== "score-entry";
    document.getElementById("subtab-member-mgmt").hidden = target !== "member-mgmt";
    if (target === "ranking") { loadScores(); checkScorePermission(); }
    if (target === "score-entry") { loadMemberOptions(); checkScorePermission(); }
    if (target === "member-mgmt") { loadMemberList(); loadAdminList(); }
  });
});

// 当前登录用户是否负责人（可记账）
let isAdminUser = false;
let currentUserPhone = null;

// 规范化手机号：去掉 +86、空格、连字符等，便于与 admins 表匹配
function normalizePhone(p) {
  if (!p) return "";
  return String(p).replace(/^\+86/, "").replace(/[\s\-()]/g, "");
}

async function checkScorePermission() {
  if (!cloud) return;
  const session = await cloud.auth.getSession();
  if (!session.data) { isAdminUser = false; renderScorePermission(); return; }
  // OTP 登录时 session.user 没有 phone 字段，需用 getUser() 获取
  let phone = session.data.user?.phone || "";
  if (!phone) {
    try {
      const u = await cloud.auth.getUser();
      phone = u.data?.phone || u.data?.email || "";
    } catch (e) {
      phone = "";
    }
  }
  phone = normalizePhone(phone);
  currentUserPhone = phone;
  // 用规范化后的手机号匹配，同时兼容表里可能存的带/不带 +86 两种格式
  const { data } = await cloud.database.from("admins").select("phone");
  const admins = data || [];
  isAdminUser = admins.some((a) => normalizePhone(a.phone) === phone && phone !== "");
  renderScorePermission();
}

function renderScorePermission() {
  const hint = document.getElementById("score-permission-hint");
  if (isAdminUser) {
    hint.textContent = "你是负责人，可以记账。";
  } else {
    hint.textContent = "你当前是只读身份，仅负责人可以记账。";
  }
  document.getElementById("btn-score-save").disabled = !isAdminUser;
  // 清空记录按钮：仅超级管理员可见
  const clearBtn = document.getElementById("btn-clear-records");
  if (clearBtn) clearBtn.hidden = !(normalizePhone(currentUserPhone || "") === SUPER_ADMIN_PHONE);
}

// 加载成员下拉（记分用，排除停用成员和负责人）
async function loadMemberOptions() {
  if (!cloud) return;
  const select = document.getElementById("score-member");
  const { data } = await cloud.database.from("member_meta").select("name, status, role").order("name");
  const actives = (data || []).filter((m) => m.status !== "disabled" && !EXCLUDED_MEMBERS.includes(m.name));
  select.innerHTML = actives
    .map((m) => `<option value="${escapeHtml(m.name)}">${escapeHtml(m.name)}${m.role ? "（" + escapeHtml(m.role) + "）" : ""}</option>`)
    .join("");
}

// 加载成员名单（管理用）
async function loadMemberList() {
  if (!cloud) return;
  const listEl = document.getElementById("member-list");
  // 权限：仅管理员可增删改成员
  await checkScorePermission();
  document.getElementById("btn-add-member").hidden = !isAdminUser;
  const { data } = await cloud.database.from("member_meta").select("name, role, status").order("name");
  if (!data || data.length === 0) {
    listEl.innerHTML = '<div class="empty-state"><p>暂无成员，点击右上角「添加成员」。</p></div>';
    return;
  }
  listEl.innerHTML = data
    .map((m) => {
      const disabled = m.status === "disabled";
      const actions = isAdminUser
        ? `<div class="member-item-actions">
          <button data-act="edit" data-name="${escapeHtml(m.name)}">编辑</button>
          <button data-act="toggle" data-name="${escapeHtml(m.name)}">${disabled ? "启用" : "停用"}</button>
        </div>`
        : "";
      return `
      <div class="member-item ${disabled ? "disabled" : ""}">
        <span class="member-item-name">${escapeHtml(m.name)}</span>
        <span class="member-item-role">${escapeHtml(m.role || "")}</span>
        ${disabled ? '<span class="member-item-status">已停用</span>' : ""}
        ${actions}
      </div>`;
    })
    .join("");
  listEl.querySelectorAll("[data-act]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!isAdminUser) return;
      const name = btn.dataset.name;
      if (btn.dataset.act === "edit") {
        openMemberDialog(name);
      } else {
        const { data } = await cloud.database.from("member_meta").select("status").eq("name", name).maybeSingle();
        const next = data?.status === "disabled" ? "active" : "disabled";
        await cloud.database.from("member_meta").update({ status: next }).eq("name", name);
        await loadMemberList();
        await loadMemberOptions();
      }
    });
  });
}

// 添加/编辑成员
const memberDialog = document.getElementById("member-dialog");
let editingMemberName = null;

document.getElementById("btn-add-member").addEventListener("click", () => {
  editingMemberName = null;
  document.getElementById("member-dialog-title").textContent = "添加成员";
  document.getElementById("member-name").value = "";
  document.getElementById("member-role").value = "";
  document.getElementById("member-email").value = "";
  document.getElementById("member-error").textContent = "";
  memberDialog.showModal();
});
document.getElementById("member-close").addEventListener("click", () => memberDialog.close());

async function openMemberDialog(name) {
  editingMemberName = name;
  document.getElementById("member-dialog-title").textContent = "编辑成员";
  const { data } = await cloud.database.from("member_meta").select("name, role, email").eq("name", name).maybeSingle();
  document.getElementById("member-name").value = data?.name || name;
  document.getElementById("member-role").value = data?.role || "";
  document.getElementById("member-email").value = data?.email || "";
  document.getElementById("member-error").textContent = "";
  memberDialog.showModal();
}

document.getElementById("member-save").addEventListener("click", async () => {
  if (!cloud) { document.getElementById("member-error").textContent = "服务未连接"; return; }
  const name = document.getElementById("member-name").value.trim();
  const role = document.getElementById("member-role").value.trim();
  const email = document.getElementById("member-email").value.trim();
  if (!name) { document.getElementById("member-error").textContent = "请填写姓名"; return; }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    document.getElementById("member-error").textContent = "请输入正确的邮箱地址";
    return;
  }

  if (editingMemberName) {
    // 改名：需同步 members 表和 member_meta 表、scores 表的 member 字段
    await cloud.database.from("members").update({ name }).eq("name", editingMemberName);
    await cloud.database.from("scores").update({ member: name }).eq("member", editingMemberName);
    const { data: meta } = await cloud.database.from("member_meta").select("id").eq("name", editingMemberName).maybeSingle();
    if (meta) {
      await cloud.database.from("member_meta").update({ name, role, email }).eq("name", editingMemberName);
    }
  } else {
    const { data: exists } = await cloud.database.from("member_meta").select("id").eq("name", name).maybeSingle();
    if (exists) { document.getElementById("member-error").textContent = "该成员已存在"; return; }
    await cloud.database.from("members").insert({ name });
    await cloud.database.from("member_meta").insert({ name, role: role || "成员", status: "active", email: email || null });
  }
  memberDialog.close();
  await loadMemberList();
  await loadMemberOptions();
});

// 负责人管理
async function loadAdminList() {
  if (!cloud) return;
  const listEl = document.getElementById("admin-list");
  // 权限：仅管理员可管理负责人
  await checkScorePermission();
  const adminAddRow = document.getElementById("admin-add-row");
  if (adminAddRow) adminAddRow.hidden = !isAdminUser;
  const { data } = await cloud.database.from("admins").select("phone, name").order("created_at");
  if (!data || data.length === 0) {
    listEl.innerHTML = '<p class="card-heading-p">暂无负责人账号。</p>';
    return;
  }
  listEl.innerHTML = data
    .map((a) => {
      const delBtn = isAdminUser
        ? `<button data-phone="${escapeHtml(a.phone)}">取消负责人</button>`
        : "";
      return `
      <div class="admin-item">
        <span class="admin-item-phone">${escapeHtml(a.phone)}</span>
        <span class="admin-item-name">${escapeHtml(a.name || "")}</span>
        ${delBtn}
      </div>`;
    })
    .join("");
  listEl.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!isAdminUser) return;
      await cloud.database.from("admins").delete().eq("phone", btn.dataset.phone);
      await loadAdminList();
    });
  });
}

document.getElementById("btn-add-admin").addEventListener("click", async () => {
  if (!cloud) return;
  if (!isAdminUser) { alert("仅管理员可授权负责人"); return; }
  const phone = document.getElementById("admin-phone").value.trim();
  if (!/^1\d{10}$/.test(phone)) { alert("请输入正确的 11 位手机号"); return; }
  const { data: exists } = await cloud.database.from("admins").select("id").eq("phone", phone).maybeSingle();
  if (!exists) {
    await cloud.database.from("admins").insert({ phone });
  }
  document.getElementById("admin-phone").value = "";
  await loadAdminList();
});

// 记一笔
let scoreDir = "add"; // add | sub
document.querySelectorAll('#subtab-score-entry .gen-type[data-dir]').forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll('#subtab-score-entry .gen-type[data-dir]').forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    scoreDir = btn.dataset.dir;
  });
});

// 快捷分值
let scoreVal = 1;
document.querySelectorAll(".score-quick-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".score-quick-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    scoreVal = Number(btn.dataset.val);
    document.getElementById("score-value").value = "";
  });
});
document.getElementById("score-value").addEventListener("input", (e) => {
  if (e.target.value !== "") {
    document.querySelectorAll(".score-quick-btn").forEach((b) => b.classList.remove("active"));
    scoreVal = Number(e.target.value);
  }
});

// 默认日期今天
document.getElementById("score-date").value = new Date().toISOString().slice(0, 10);

function showScoreError(msg) { document.getElementById("score-error").textContent = msg || ""; }

document.getElementById("btn-score-save").addEventListener("click", async () => {
  if (!cloud) { showScoreError("服务未连接"); return; }
  if (!isAdminUser) { showScoreError("仅负责人可以记账"); return; }
  showScoreError("");

  const member = document.getElementById("score-member").value;
  const reason = document.getElementById("score-reason").value.trim();
  const date = document.getElementById("score-date").value;
  const quickActive = document.querySelector(".score-quick-btn.active");
  let val;
  const customVal = document.getElementById("score-value").value.trim();
  if (customVal !== "") {
    val = Number(customVal);
  } else if (quickActive) {
    val = Number(quickActive.dataset.val);
  } else {
    val = scoreVal;
  }

  // 校验
  if (!member) { showScoreError("请选择成员"); return; }
  if (!reason) { showScoreError("请填写事由（加分/扣分理由）"); return; }
  if (!Number.isInteger(val) || val === 0) { showScoreError("分值必须是非零整数"); return; }

  const delta = scoreDir === "add" ? Math.abs(val) : -Math.abs(val);

  // 记录人（OTP 登录时 session.user 无 name/phone，需用 getUser()）
  let recorder = currentUserPhone || "未知";
  try {
    const u = await cloud.auth.getUser();
    recorder = u.data?.name || u.data?.phone || currentUserPhone || "未知";
  } catch (e) {
    recorder = currentUserPhone || "未知";
  }

  const { error } = await cloud.database.from("scores").insert({
    member,
    delta,
    reason,
    owner_name: recorder,
  });
  if (error) { showScoreError("保存失败：" + (error.message || "")); return; }

  // 清空事由，刷新排行
  document.getElementById("score-reason").value = "";
  document.getElementById("score-value").value = "";
  await loadScores();
});

// 汇总与排行
async function loadScores() {
  if (!cloud) return;
  const rankingEl = document.getElementById("score-ranking");
  const emptyEl = document.getElementById("score-ranking-empty");

  const { data: members } = await cloud.database.from("member_meta").select("name, role, status").order("name");
  const { data: scores } = await cloud.database.from("scores").select("member, delta, reason, owner_name, created_at").order("created_at", { ascending: true });

  const memberList = members || [];
  const scoreList = scores || [];

  // 计算每人累计分
  const totalMap = {};
  const detailMap = {};
  memberList.forEach((m) => {
    totalMap[m.name] = 0;
    detailMap[m.name] = [];
  });
  scoreList.forEach((s) => {
    if (!(s.member in totalMap)) totalMap[s.member] = 0;
    totalMap[s.member] += s.delta;
    if (!detailMap[s.member]) detailMap[s.member] = [];
    detailMap[s.member].push(s);
  });

  const ranking = memberList.map((m) => ({
    name: m.name,
    role: m.role,
    status: m.status,
    delta: totalMap[m.name] || 0,
    total: BASE_SCORE + (totalMap[m.name] || 0),
  }));

  // 只显示 active 成员，且排除负责人（不参与考核）
  const activeRanking = ranking
    .filter((r) => r.status !== "disabled" && !EXCLUDED_MEMBERS.includes(r.name))
    .sort((a, b) => b.total - a.total);

  if (activeRanking.length === 0) {
    rankingEl.innerHTML = "";
    emptyEl.hidden = false;
    return;
  }
  emptyEl.hidden = true;

  rankingEl.innerHTML = activeRanking
    .map((r, i) => {
      const numClass = i === 0 ? "top1" : i === 1 ? "top2" : i === 2 ? "top3" : "";
      const deltaStr = r.delta > 0 ? `+${r.delta}` : `${r.delta}`;
      return `
      <div class="score-rank-item" data-name="${escapeHtml(r.name)}">
        <span class="score-rank-num ${numClass}">${i + 1}</span>
        <div class="score-rank-info">
          <span class="score-rank-name">${escapeHtml(r.name)}</span>
          <span class="score-rank-role">${escapeHtml(r.role || "")}</span>
        </div>
        <span class="score-rank-delta">${deltaStr}</span>
        <span class="score-rank-total">${r.total}</span>
      </div>`;
    })
    .join("");

  // 点击看明细
  rankingEl.querySelectorAll(".score-rank-item").forEach((item) => {
    item.addEventListener("click", () => openMemberDetail(item.dataset.name, detailMap, memberList));
  });

  // 更新概览页活跃成员指标（本月有过加减分记录的成员数）
  updateActiveMemberMetric(scoreList);
}

async function openMemberDetail(name, detailMap, memberList) {
  const title = document.getElementById("member-detail-title");
  const summary = document.getElementById("member-detail-summary");
  const listEl = document.getElementById("member-detail-list");
  const meta = memberList.find((m) => m.name === name) || {};
  const detail = detailMap[name] || [];

  title.textContent = `${name} 的明细`;
  const total = BASE_SCORE + (detail.reduce((s, d) => s + d.delta, 0));
  summary.innerHTML = `职务：${escapeHtml(meta.role || "—")} ｜ 基础分 85 ｜ 当前总分 <b>${total}</b> ｜ 共 ${detail.length} 条记录`;

  if (detail.length === 0) {
    listEl.innerHTML = '<p class="card-heading-p">暂无加减分记录。</p>';
  } else {
    listEl.innerHTML = detail
      .slice()
      .reverse()
      .map((d) => {
        const pos = d.delta > 0;
        return `
        <div class="member-detail-item">
          <span class="member-detail-delta ${pos ? "pos" : "neg"}">${pos ? "+" : ""}${d.delta}</span>
          <span class="member-detail-reason">${escapeHtml(d.reason || "")}</span>
          <span class="member-detail-meta">${escapeHtml(d.owner_name || "")}<br>${formatDate(d.created_at)}</span>
        </div>`;
      })
      .join("");
  }
  document.getElementById("member-detail-dialog").showModal();
}
document.getElementById("member-detail-close").addEventListener("click", () => document.getElementById("member-detail-dialog").close());

// 概览页活跃成员指标（本月有过加减分记录的成员数）
function updateActiveMemberMetric(scoreList) {
  const el = document.getElementById("metric-members");
  if (!el) return;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const activeSet = new Set();
  scoreList.forEach((s) => {
    const d = new Date(s.created_at);
    if (d >= monthStart) activeSet.add(s.member);
  });
  el.textContent = activeSet.size;
}

// ===== 导出 Excel =====
document.getElementById("btn-export-excel").addEventListener("click", async () => {
  if (!cloud) return;
  const { data: members } = await cloud.database.from("member_meta").select("name, role, status").order("name");
  const { data: scores } = await cloud.database.from("scores").select("member, delta, reason, owner_name, created_at").order("created_at", { ascending: true });

  const memberList = (members || []).filter((m) => !EXCLUDED_MEMBERS.includes(m.name));
  const scoreList = scores || [];

  // 汇总 sheet：每人基础分85 + 累计
  const summaryRows = memberList.map((m) => {
    const sum = scoreList.filter((s) => s.member === m.name).reduce((acc, s) => acc + s.delta, 0);
    return {
      排名: 0,
      姓名: m.name,
      职务: m.role || "",
      状态: m.status === "disabled" ? "已停用" : "正常",
      基础分: BASE_SCORE,
      累计加减分: sum,
      当前总分: BASE_SCORE + sum,
    };
  });
  summaryRows.sort((a, b) => b["当前总分"] - a["当前总分"]);
  summaryRows.forEach((r, i) => (r["排名"] = i + 1));

  // 明细 sheet
  const detailRows = scoreList.map((s) => ({
    姓名: s.member,
    类型: s.delta > 0 ? "加分" : "扣分",
    分值: s.delta,
    理由: s.reason || "",
    记录人: s.owner_name || "",
    时间: formatDateTime(s.created_at),
  }));

  const summaryData = [
    ["排名", "姓名", "职务", "状态", "基础分", "累计加减分", "当前总分"],
    ...summaryRows.map((r) => [r["排名"], r["姓名"], r["职务"], r["状态"], r["基础分"], r["累计加减分"], r["当前总分"]]),
  ];
  const detailData = [
    ["姓名", "类型", "分值", "理由", "记录人", "时间"],
    ...detailRows.map((r) => [r["姓名"], r["类型"], r["分值"], r["理由"], r["记录人"], r["时间"]]),
  ];

  // 优先用 SheetJS 生成真正的 .xlsx（两个 sheet）；未加载则降级 CSV
  if (typeof XLSX !== "undefined") {
    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.aoa_to_sheet(summaryData);
    const ws2 = XLSX.utils.aoa_to_sheet(detailData);
    // 设置列宽
    ws1["!cols"] = [{ wch: 6 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 10 }];
    ws2["!cols"] = [{ wch: 10 }, { wch: 6 }, { wch: 8 }, { wch: 40 }, { wch: 12 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws1, "积分汇总");
    XLSX.utils.book_append_sheet(wb, ws2, "加减分明细");
    XLSX.writeFile(wb, `成员积分_${new Date().toISOString().slice(0, 10)}.xlsx`);
  } else {
    // 降级：CSV（含 BOM，Excel 可打开）
    const summaryCSV = toCSV(summaryData);
    const detailCSV = toCSV(detailData);
    const content = "\uFEFF" + "成员积分汇总（基础分85）\n" + summaryCSV + "\n\n成员加减分明细\n" + detailCSV;
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `成员积分_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
});

function toCSV(rows) {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          let s = cell == null ? "" : String(cell);
          if (s.includes(",") || s.includes('"') || s.includes("\n")) {
            s = '"' + s.replace(/"/g, '""') + '"';
          }
          return s;
        })
        .join(",")
    )
    .join("\n");
}

function formatDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// ===== 清空记录（仅超级管理员） =====
document.getElementById("btn-clear-records").addEventListener("click", async () => {
  if (!cloud) return;
  const phone = normalizePhone(currentUserPhone || "");
  if (phone !== SUPER_ADMIN_PHONE) {
    alert("你没有权限执行此操作。");
    return;
  }
  const confirmed = confirm("确定要清空所有加减分记录吗？\n\n此操作将删除全部加分/扣分记录，所有成员积分回到初始状态（基础分 85），且不可恢复。\n\n确定继续？");
  if (!confirmed) return;
  // 删除全部记录（id 自增从 1 起，neq id 0 为恒真条件；RLS 已授权超级管理员可删全部）
  const { data, error } = await cloud.database.from("scores").delete().neq("id", 0).select();
  if (error) { alert("清空失败：" + (error.message || "")); return; }
  const removed = Array.isArray(data) ? data.length : 0;
  alert(`已清空 ${removed} 条记录，回到初始状态。`);
  await loadScores();
  updateActiveMemberMetric([]);
});

// ===== 活动提醒模块 =====
const REPEAT_LABELS = { none: "仅一次", monthly: "每月重复" };

// 当前用户是否管理员（可增删活动、设提醒时间）
let isActivityAdmin = false;

async function checkReminderPermission() {
  if (!cloud) return;
  const session = await cloud.auth.getSession();
  const btnAdd = document.getElementById("btn-add-activity");
  const hint = document.getElementById("reminder-permission-hint");
  if (!session.data) {
    isActivityAdmin = false;
    if (btnAdd) btnAdd.hidden = true;
    if (hint) hint.textContent = "";
    renderActivityAdminControls();
    return;
  }
  // 复用加减分模块的负责人判定逻辑（admins 白名单）
  let phone = session.data.user?.phone || "";
  if (!phone) {
    try {
      const u = await cloud.auth.getUser();
      phone = u.data?.phone || u.data?.email || "";
    } catch (e) {
      phone = "";
    }
  }
  phone = normalizePhone(phone);
  const { data } = await cloud.database.from("admins").select("phone");
  const admins = data || [];
  isActivityAdmin = admins.some((a) => normalizePhone(a.phone) === phone && phone !== "");
  if (btnAdd) btnAdd.hidden = !isActivityAdmin;
  if (hint) hint.textContent = isActivityAdmin ? "（你是管理员，可增删活动）" : "（只读，仅管理员可增删活动）";
  renderActivityAdminControls();
}

// 活动列表项里的操作按钮是否可见（增删/编辑仅管理员）
function renderActivityAdminControls() {
  document.querySelectorAll(".activity-item-actions").forEach((el) => {
    el.hidden = !isActivityAdmin;
  });
}

// 加载活动列表
async function loadActivities() {
  if (!cloud) return;
  const listEl = document.getElementById("activity-list");
  const emptyEl = document.getElementById("activity-empty");

  const { data, error } = await cloud.database
    .from("activities")
    .select("*")
    .order("remind_at", { ascending: true });

  if (error || !data || data.length === 0) {
    listEl.innerHTML = "";
    emptyEl.hidden = false;
    return;
  }
  emptyEl.hidden = true;

  const now = new Date();
  listEl.innerHTML = data
    .map((a) => {
      const due = a.remind_at ? new Date(a.remind_at) : null;
      const overdue = due && due < now;
      const repeatTag = a.repeat_rule && a.repeat_rule !== "none"
        ? `<span class="activity-repeat-tag">${REPEAT_LABELS[a.repeat_rule] || a.repeat_rule}</span>`
        : "";
      return `
      <div class="activity-item ${overdue ? "overdue" : ""}" data-id="${a.id}">
        <div class="activity-icon"><i data-icon="bell"></i></div>
        <div class="activity-main">
          <div class="activity-title">${escapeHtml(a.title)}</div>
          <div class="activity-meta">${repeatTag}<span>${escapeHtml(a.owner_name || "")}</span></div>
          ${a.note ? `<div class="activity-note">${escapeHtml(a.note)}</div>` : ""}
        </div>
        <div class="activity-due">
          ${formatActivityTime(a.remind_at)}<small>提醒时间</small>
        </div>
        <div class="activity-item-actions">
          <button data-act="edit" data-id="${a.id}">编辑</button>
          <button data-act="del" data-id="${a.id}" class="del">删除</button>
        </div>
      </div>`;
    })
    .join("");

  listEl.querySelectorAll("[data-act]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!isActivityAdmin) return;
      const id = btn.dataset.id;
      if (btn.dataset.act === "edit") {
        openActivityDialog(id);
      } else {
        if (!confirm("确定删除这个活动吗？")) return;
        const { error } = await cloud.database.from("activities").delete().eq("id", id);
        if (error) { alert("删除失败：" + (error.message || "")); return; }
        await loadActivities();
        updateReminderMetric();
      }
    });
  });

  renderActivityAdminControls();
  updateReminderMetric();
}

function formatActivityTime(iso) {
  if (!iso) return "未设置";
  const d = new Date(iso);
  if (isNaN(d)) return "未设置";
  const md = `${d.getMonth() + 1}月${d.getDate()}日`;
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${md} ${hm}`;
}

// 活动弹窗
const activityDialog = document.getElementById("activity-dialog");
let editingActivityId = null;

document.getElementById("btn-add-activity").addEventListener("click", () => {
  if (!isActivityAdmin) return;
  editingActivityId = null;
  document.getElementById("activity-dialog-title").textContent = "添加活动";
  document.getElementById("activity-title").value = "";
  document.getElementById("activity-remind").value = "";
  document.getElementById("activity-repeat").value = "none";
  document.getElementById("activity-note").value = "";
  document.getElementById("activity-error").textContent = "";
  activityDialog.showModal();
});
document.getElementById("activity-close").addEventListener("click", () => activityDialog.close());

async function openActivityDialog(id) {
  editingActivityId = id;
  document.getElementById("activity-dialog-title").textContent = "编辑活动";
  const { data } = await cloud.database.from("activities").select("*").eq("id", id).maybeSingle();
  document.getElementById("activity-title").value = data?.title || "";
  document.getElementById("activity-remind").value = data?.remind_at ? toLocalInput(data.remind_at) : "";
  document.getElementById("activity-repeat").value = data?.repeat_rule || "none";
  document.getElementById("activity-note").value = data?.note || "";
  document.getElementById("activity-error").textContent = "";
  activityDialog.showModal();
}

// 把 ISO 时间转成 datetime-local 输入框的值（本地时区）
function toLocalInput(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

document.getElementById("activity-save").addEventListener("click", async () => {
  if (!cloud) { document.getElementById("activity-error").textContent = "服务未连接"; return; }
  if (!isActivityAdmin) { document.getElementById("activity-error").textContent = "仅管理员可操作"; return; }
  const title = document.getElementById("activity-title").value.trim();
  const remindLocal = document.getElementById("activity-remind").value;
  const repeatRule = document.getElementById("activity-repeat").value;
  const note = document.getElementById("activity-note").value.trim();
  const errEl = document.getElementById("activity-error");
  errEl.textContent = "";

  if (!title) { errEl.textContent = "请填写活动名称"; return; }
  if (!remindLocal) { errEl.textContent = "请选择提醒时间"; return; }
  // 转成 ISO 字符串（本地时区按北京时间处理）
  const remindAt = new Date(remindLocal).toISOString();

  const payload = {
    title,
    remind_at: remindAt,
    repeat_rule: repeatRule,
    note: note || null,
  };

  if (editingActivityId) {
    const { error } = await cloud.database.from("activities").update(payload).eq("id", editingActivityId);
    if (error) { errEl.textContent = "保存失败：" + (error.message || ""); return; }
  } else {
    const session = await cloud.auth.getSession();
    payload.owner_name = session.data?.user?.name || null;
    const { error } = await cloud.database.from("activities").insert(payload);
    if (error) { errEl.textContent = "保存失败：" + (error.message || ""); return; }
  }
  activityDialog.close();
  await loadActivities();
});

// 概览页「即将到来的活动」指标
function updateReminderMetric() {
  const el = document.getElementById("metric-reminders");
  if (!el || !cloud) return;
  cloud.database.from("activities").select("id, remind_at").then(({ data }) => {
    const now = new Date();
    const upcoming = (data || []).filter((a) => a.remind_at && new Date(a.remind_at) >= now).length;
    el.textContent = upcoming;
  }).catch(() => {});
}

// 打开网页时检测到点活动，弹提醒
let reminderNotified = new Set();
async function checkDueReminders() {
  if (!cloud) return;
  const session = await cloud.auth.getSession();
  if (!session.data) return; // 未登录不弹
  const { data } = await cloud.database.from("activities").select("id, title, remind_at").order("remind_at", { ascending: true });
  if (!data || data.length === 0) return;
  const now = new Date();
  const due = data.filter((a) => {
    if (!a.remind_at) return false;
    const t = new Date(a.remind_at);
    // 已到提醒时间，且不超过提醒时间后 1 小时（避免一整天都反复提醒），且本次会话未提醒过
    return t <= now && (now - t) < 60 * 60 * 1000 && !reminderNotified.has(a.id);
  });
  if (due.length === 0) return;
  due.forEach((a) => reminderNotified.add(a.id));
  const names = due.map((a) => a.title).join("、");
  alert(`⏰ 活动提醒\n\n以下活动已到提醒时间：\n${names}`);
}

document.addEventListener("DOMContentLoaded", bootstrap);
