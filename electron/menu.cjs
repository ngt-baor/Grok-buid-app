/**
 * Application menu (vi / en labels).
 * Top-level: File · Edit · View · Help (no Window).
 *
 * Hybrid titlebar: application menu is installed for accelerators only.
 * Window menu bar is kept hidden; renderer draws labels and pops submenus.
 */
const { Menu, shell, BrowserWindow, app } = require("electron");

/** @type {Electron.Menu | null} */
let installedMenu = null;
/** @type {object} */
let lastHandlers = {};
/** @type {"vi"|"en"} */
let currentLocale = "vi";

/**
 * @param {"vi"|"en"|string} locale
 */
function labelsFor(locale) {
  const en = String(locale || "").toLowerCase().startsWith("en");
  if (en) {
    return {
      file: "File",
      edit: "Edit",
      view: "View",
      help: "Help",
      newTask: "New task",
      openProject: "Open project…",
      usage: "Usage",
      settings: "Settings…",
      quit: "Quit",
      closeWindow: "Close window",
      undo: "Undo",
      redo: "Redo",
      cut: "Cut",
      copy: "Copy",
      paste: "Paste",
      selectAll: "Select all",
      reload: "Reload",
      forceReload: "Force reload",
      actualSize: "Actual size",
      zoomIn: "Zoom in",
      zoomOut: "Zoom out",
      fullscreen: "Toggle fullscreen",
      toggleLeft: "Toggle left sidebar",
      toggleRight: "Toggle right panel",
      toggleBottom: "Toggle bottom panel",
      terminal: "External terminal",
      devTools: "Developer tools",
      palette: "Command palette",
      docs: "Grok docs",
      about: "About Grok Build",
      hide: "Hide",
      hideOthers: "Hide others",
      unhide: "Show all",
    };
  }
  return {
    file: "Tệp",
    edit: "Chỉnh sửa",
    view: "Xem",
    help: "Trợ giúp",
    newTask: "Tác vụ mới",
    openProject: "Mở project…",
    usage: "Mức sử dụng",
    settings: "Cài đặt…",
    quit: "Thoát",
    closeWindow: "Đóng cửa sổ",
    undo: "Hoàn tác",
    redo: "Làm lại",
    cut: "Cắt",
    copy: "Sao chép",
    paste: "Dán",
    selectAll: "Chọn tất cả",
    reload: "Tải lại",
    forceReload: "Tải lại cứng",
    actualSize: "Thu phóng thực",
    zoomIn: "Phóng to",
    zoomOut: "Thu nhỏ",
    fullscreen: "Toàn màn hình",
    toggleLeft: "Hiện / ẩn sidebar trái",
    toggleRight: "Hiện / ẩn panel phải",
    toggleBottom: "Hiện / ẩn panel dưới",
    terminal: "Terminal ngoài",
    devTools: "Công cụ phát triển",
    palette: "Command palette",
    docs: "Tài liệu Grok",
    about: "Giới thiệu Grok Build",
    hide: "Ẩn",
    hideOthers: "Ẩn cái khác",
    unhide: "Hiện tất cả",
  };
}

/**
 * @param {object} handlers
 * @param {"vi"|"en"|string} [locale]
 */
function buildTemplate(handlers = {}, locale = currentLocale) {
  const L = labelsFor(locale);
  const send = (channel, data) => {
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) win.webContents.send(channel, data);
  };

  /** @type {Electron.MenuItemConstructorOptions[]} */
  const template = [
    {
      label: L.file,
      id: "menu-file",
      submenu: [
        {
          label: L.newTask,
          accelerator: "CmdOrCtrl+N",
          click: () => {
            if (handlers.onNewChat) handlers.onNewChat();
            else send("menu:new-chat");
          },
        },
        {
          label: L.openProject,
          accelerator: "CmdOrCtrl+O",
          click: () => {
            if (handlers.onOpenProject) handlers.onOpenProject();
            else send("menu:open-project");
          },
        },
        { type: "separator" },
        {
          label: L.usage,
          click: () => {
            if (handlers.onUsage) handlers.onUsage();
            else send("menu:usage");
          },
        },
        {
          label: L.settings,
          accelerator: "CmdOrCtrl+,",
          click: () => {
            if (handlers.onSettings) handlers.onSettings();
            else send("menu:settings");
          },
        },
        { type: "separator" },
        {
          label: process.platform === "darwin" ? L.closeWindow : L.quit,
          accelerator: process.platform === "darwin" ? "Cmd+W" : "Alt+F4",
          role: process.platform === "darwin" ? "close" : "quit",
        },
      ],
    },
    {
      label: L.edit,
      id: "menu-edit",
      submenu: [
        { label: L.undo, role: "undo" },
        { label: L.redo, role: "redo" },
        { type: "separator" },
        { label: L.cut, role: "cut" },
        { label: L.copy, role: "copy" },
        { label: L.paste, role: "paste" },
        { label: L.selectAll, role: "selectAll" },
      ],
    },
    {
      label: L.view,
      id: "menu-view",
      submenu: [
        { label: L.reload, accelerator: "CmdOrCtrl+R", role: "reload" },
        {
          label: L.forceReload,
          accelerator: "CmdOrCtrl+Shift+R",
          role: "forceReload",
        },
        { type: "separator" },
        { label: L.actualSize, role: "resetZoom" },
        { label: L.zoomIn, role: "zoomIn" },
        { label: L.zoomOut, role: "zoomOut" },
        { type: "separator" },
        { label: L.fullscreen, role: "togglefullscreen" },
        {
          label: L.toggleLeft,
          accelerator: "CmdOrCtrl+B",
          click: () => send("menu:toggle-left"),
        },
        {
          label: L.toggleRight,
          accelerator: "Ctrl+Alt+B",
          click: () => {
            if (handlers.onToggleRight) handlers.onToggleRight();
            else send("menu:toggle-right");
          },
        },
        {
          label: L.toggleBottom,
          accelerator: "Ctrl+J",
          click: () => send("menu:toggle-bottom"),
        },
        {
          label: L.terminal,
          accelerator: "Ctrl+`",
          click: () => {
            if (handlers.onTerminal) handlers.onTerminal();
            else send("menu:terminal");
          },
        },
        { type: "separator" },
        {
          label: L.devTools,
          accelerator: process.platform === "darwin" ? "Alt+Cmd+I" : "Ctrl+Shift+I",
          role: "toggleDevTools",
        },
      ],
    },
    {
      label: L.help,
      id: "menu-help",
      submenu: [
        {
          label: L.palette,
          accelerator: "CmdOrCtrl+K",
          click: () => send("menu:palette"),
        },
        {
          label: L.docs,
          click: () => {
            void shell.openExternal("https://docs.x.ai/");
          },
        },
        {
          label: "xAI / Grok",
          click: () => {
            void shell.openExternal("https://x.ai/");
          },
        },
        { type: "separator" },
        {
          label: L.about,
          click: () => send("menu:about"),
        },
      ],
    },
  ];

  if (process.platform === "darwin") {
    template.unshift({
      label: app.name || "Grok Build",
      id: "menu-app",
      submenu: [
        { label: L.about, click: () => send("menu:about") },
        { type: "separator" },
        {
          label: L.settings,
          accelerator: "Cmd+,",
          click: () => send("menu:settings"),
        },
        { type: "separator" },
        { role: "hide", label: L.hide },
        { role: "hideOthers", label: L.hideOthers },
        { role: "unhide", label: L.unhide },
        { type: "separator" },
        { role: "quit", label: L.quit },
      ],
    });
  }

  return template;
}

function buildAppMenu(handlers = {}, locale = currentLocale) {
  return Menu.buildFromTemplate(buildTemplate(handlers, locale));
}

/**
 * @param {object} handlers
 * @param {"vi"|"en"|string} [locale]
 */
function installAppMenu(handlers = {}, locale) {
  if (handlers && Object.keys(handlers).length) lastHandlers = handlers;
  if (locale) {
    currentLocale = String(locale).toLowerCase().startsWith("en") ? "en" : "vi";
  }
  const menu = buildAppMenu(lastHandlers, currentLocale);
  installedMenu = menu;
  Menu.setApplicationMenu(menu);
  return menu;
}

/**
 * Rebuild menu labels after language change (keeps same handlers).
 * @param {"vi"|"en"|string} locale
 */
function setMenuLocale(locale) {
  currentLocale = String(locale || "vi").toLowerCase().startsWith("en") ? "en" : "vi";
  return installAppMenu(lastHandlers, currentLocale);
}

const MENU_IDS = {
  file: "menu-file",
  edit: "menu-edit",
  view: "menu-view",
  help: "menu-help",
  app: "menu-app",
  tep: "menu-file",
  chinh_sua: "menu-edit",
  xem: "menu-view",
  tro_giup: "menu-help",
};

function popupMenuAt(key, opts = {}) {
  const menu = installedMenu || Menu.getApplicationMenu();
  if (!menu) return false;

  const id = MENU_IDS[key] || key;
  const item = menu.getMenuItemById(id);
  if (!item || !item.submenu) return false;

  const win =
    opts.window ||
    BrowserWindow.getFocusedWindow() ||
    BrowserWindow.getAllWindows()[0] ||
    null;

  item.submenu.popup({
    window: win && !win.isDestroyed() ? win : undefined,
    x: typeof opts.x === "number" ? Math.round(opts.x) : undefined,
    y: typeof opts.y === "number" ? Math.round(opts.y) : undefined,
  });
  return true;
}

module.exports = {
  buildAppMenu,
  installAppMenu,
  setMenuLocale,
  popupMenuAt,
  MENU_IDS,
};
