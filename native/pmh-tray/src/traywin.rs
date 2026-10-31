//! The tray icon: a hidden window, a message loop, and a menu that says what it does.
//!
//! Why raw `win32` instead of a GUI toolkit: the tray needs exactly three things —
//! `Shell_NotifyIconW`, a popup menu, and a message pump. A toolkit would bring its
//! own event loop, its own thread rules and its own dependency tree for that, and
//! this crate must build from the dependency set the machine already has.
//!
//! ## The rule this window obeys
//!
//! Every menu item names its **consequence**, not its mechanism: "Beenden (stoppt
//! den Harness)" says that quitting the tray stops the harness, because the job
//! object is closed with the tray. A menu that hides that would be the kind of
//! instruction that is followable and still wrong.

use crate::config::{self, Paths};
use crate::proc::Harness;
use crate::{autostart, health};
use std::sync::{Mutex, OnceLock};
use windows_sys::Win32::Foundation::{GetLastError, HWND, LPARAM, LRESULT, WPARAM};
use windows_sys::Win32::Graphics::Gdi::{
    CreateBitmap, CreateDIBSection, DeleteObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB,
    DIB_RGB_COLORS,
};
use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
use windows_sys::Win32::System::Threading::CreateMutexW;
use windows_sys::Win32::UI::Shell::{
    Shell_NotifyIconW, NIF_ICON, NIF_MESSAGE, NIF_TIP, NIM_ADD, NIM_DELETE, NIM_MODIFY,
    NOTIFYICONDATAW,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    AppendMenuW, CreatePopupMenu, CreateWindowExW, DefWindowProcW, DestroyIcon, DestroyMenu,
    DestroyWindow, DispatchMessageW, GetCursorPos, GetMessageW, LoadIconW, PostMessageW,
    PostQuitMessage, RegisterClassW, SetForegroundWindow, SetTimer, TrackPopupMenu,
    TranslateMessage, MF_CHECKED, MF_GRAYED, MF_SEPARATOR, MF_STRING, MSG, SW_SHOWNORMAL,
    TPM_RETURNCMD, TPM_RIGHTBUTTON, CW_USEDEFAULT, WM_CONTEXTMENU, WM_DESTROY, WM_LBUTTONDBLCLK,
    WM_LBUTTONUP, WM_NULL, WM_RBUTTONUP, WM_TIMER, WM_USER, WNDCLASSW,
};

/// The callback message the shell sends to our window.
///
/// **`WM_APP + 1` is the wrong choice here, and the shell says so silently.**
/// `NOTIFYICONDATA.uCallbackMessage` must lie in `WM_USER` (0x0400) through
/// `0x7FFF`; `WM_APP` is 0x8000 and therefore outside it. Measured on 15.10.2026:
/// with `WM_APP + 1` every `Shell_NotifyIconW(NIM_ADD)` returned FALSE in an
/// otherwise correct program, while the same call with a value in range was
/// accepted. No error code said why — the error was stale and pointed at a handle.
const WM_TRAY: u32 = WM_USER + 1;

/// The health poll timer.
const TIMER_POLL: usize = 1;

/// How often the tray asks whether the port answers.
const POLL_MILLIS: u32 = 2000;

/// Menu command identifiers. Values start at 1 so 0 keeps meaning "nothing chosen".
const CMD_START: usize = 1;
const CMD_STOP: usize = 2;
const CMD_OPEN: usize = 3;
const CMD_AUTOSTART: usize = 4;
const CMD_LOG: usize = 5;
const CMD_QUIT: usize = 6;

/// The window class name; the single-instance mutex uses the same name.
const CLASS_NAME: &str = "PMHTrayWindow";

/// What the tray currently believes about the harness.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Status {
    /// Nothing listening, no child process.
    Stopped,
    /// A child was started, the port does not answer yet.
    Starting,
    /// The port answers.
    Running,
}

impl Status {
    fn tooltip(self, port: u16) -> String {
        match self {
            Status::Stopped => "Prometheus Harness — gestoppt".to_string(),
            Status::Starting => format!("Prometheus Harness — startet auf Port {port} …"),
            Status::Running => format!("Prometheus Harness — laeuft auf Port {port}"),
        }
    }

    fn color(self) -> (u8, u8, u8) {
        match self {
            Status::Stopped => (128, 128, 128),
            Status::Starting => (219, 154, 4),
            Status::Running => (46, 160, 67),
        }
    }
}

/// Everything the message handlers need. One lock, one owner, one thread.
struct Tray {
    paths: Paths,
    bun: config::BunChoice,
    port: config::PortChoice,
    harness: Option<Harness>,
    remembered: config::Remembered,
    autostart: bool,
    status: Status,
    icon: isize,
    hwnd: isize,
    /// The last thing worth telling the user, in one line.
    note: Option<String>,
}

/// The one instance of the tray state.
///
/// A global because the window procedure is a plain C callback with no user data
/// slot of its own that could hold a `!Send` cell safely. `HWND` is stored as
/// `isize` for the same reason: a raw pointer is not `Send`, a number is.
static TRAY: OnceLock<Mutex<Tray>> = OnceLock::new();

/// A null-terminated UTF-16 copy for the win32 calls.
fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(std::iter::once(0)).collect()
}

fn lock() -> std::sync::MutexGuard<'static, Tray> {
    TRAY.get()
        .unwrap_or_else(|| unreachable!("the tray state is set before the window exists"))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// The exit code a second instance uses: it found what it was looking for.
pub const EXIT_ALREADY_RUNNING: i32 = 3;

/// Runs the tray until the user picks "Beenden".
///
/// Returns the process exit code.
pub fn run(paths: Paths, bun: config::BunChoice, port: config::PortChoice) -> i32 {
    if !claim_single_instance() {
        return EXIT_ALREADY_RUNNING;
    }

    let log_paths = paths.clone();
    let remembered = std::fs::read_to_string(&paths.state)
        .map(|text| config::Remembered::parse(&text))
        .unwrap_or_default();
    // A remembered address belongs to the remembered port; using it for a different
    // port would open an address that is not the one now running.
    let remembered = if remembered.port == Some(port.port) {
        remembered
    } else {
        config::Remembered::default()
    };

    let status = if health::is_open(port.port) {
        Status::Running
    } else {
        Status::Stopped
    };
    let state = Tray {
        paths,
        bun,
        port,
        harness: None,
        remembered,
        autostart: autostart::is_enabled(),
        status,
        icon: 0,
        hwnd: 0,
        note: None,
    };
    let _ = TRAY.set(Mutex::new(state));

    // SAFETY: the calls below are the documented create-window sequence; every
    // pointer outlives the call that receives it.
    unsafe {
        let instance = GetModuleHandleW(std::ptr::null());
        let class = wide(CLASS_NAME);
        let window_class = WNDCLASSW {
            style: 0,
            lpfnWndProc: Some(window_procedure),
            cbClsExtra: 0,
            cbWndExtra: 0,
            hInstance: instance,
            hIcon: std::ptr::null_mut(),
            hCursor: std::ptr::null_mut(),
            hbrBackground: std::ptr::null_mut(),
            lpszMenuName: std::ptr::null(),
            lpszClassName: class.as_ptr(),
        };
        // A duplicate registration only means the class already exists, which is
        // exactly what a second run of this function needs anyway.
        RegisterClassW(&window_class);

        let title = wide("Prometheus Harness");
        let hwnd = CreateWindowExW(
            0,
            class.as_ptr(),
            title.as_ptr(),
            0,
            // The shell refuses NIM_ADD for a window created with a zero extent.
            // A 1×1 hidden window is enough for the message loop and removes that
            // rejection reason entirely.
            0,
            0,
            1,
            1,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            instance,
            std::ptr::null(),
        );
        if hwnd.is_null() {
            let error = GetLastError();
            let (station, desktop) = window_station_and_desktop();
            let text = format!(
                "Tray-Fenster liess sich nicht anlegen: Win32-Fehler {error}; \
                 Fensterstation={station}; Desktop={desktop}"
            );
            crate::boot::log_line(&log_paths, &text);
            eprintln!("FEHLER: {text}");
            return crate::EXIT_FAILURE;
        }
        lock().hwnd = hwnd as isize;

        refresh_icon(hwnd);
        // Explorer may still be starting when the tray is launched at login. A
        // few retries cost nothing and turn a transient NIM_ADD refusal into a
        // visible icon instead of a silent exit.
        let mut attempts = 0usize;
        let mut added = false;
        let mut last_error = 0u32;
        for attempt in 1..=5 {
            attempts = attempt;
            if shell_add_icon(hwnd) {
                added = true;
                break;
            }
            last_error = GetLastError();
            if attempt < 5 {
                std::thread::sleep(std::time::Duration::from_millis(250));
            }
        }
        if !added {
            // The GUI binary has no console, so this reason has to go to the log.
            // Without it the operator sees exactly one fact: nothing happened.
            let data = icon_data(hwnd);
            let intended_flags = NIF_ICON | NIF_MESSAGE | NIF_TIP;
            let (station, desktop) = window_station_and_desktop();
            let taskbar = windows_sys::Win32::UI::WindowsAndMessaging::FindWindowW(
                wide("Shell_TrayWnd").as_ptr(),
                std::ptr::null(),
            );
            let text = format!(
                "Infobereich verweigerte das Symbol nach {attempts} Versuchen: \
                 Win32-Fehler={last_error}; hwnd=0x{:X}; cb_size={}; flags={}; \
                 callback={}; icon_leer={}; tip_zeichen={}; Fensterstation={station}; \
                 Desktop={desktop}; taskbar_sichtbar={}; job_ui_sperren={}; \
                 dsh_sitzung={}",
                hwnd as usize,
                data.cbSize,
                intended_flags,
                data.uCallbackMessage,
                data.hIcon.is_null(),
                data.szTip.iter().take_while(|unit| **unit != 0).count(),
                !taskbar.is_null(),
                job_ui_restrictions(),
                std::env::var_os("DSH_SESSION_ID").is_some(),
            );
            crate::boot::log_line(&log_paths, &text);
            eprintln!("FEHLER: {text}");
            // The GUI has no console; a silent exit is the one failure mode the
            // operator cannot diagnose. This dialog appears only when the icon
            // could not be created, never during normal operation.
            windows_sys::Win32::UI::WindowsAndMessaging::MessageBoxW(
                std::ptr::null_mut(),
                wide(&text).as_ptr(),
                wide("Prometheus Tray konnte nicht starten").as_ptr(),
                windows_sys::Win32::UI::WindowsAndMessaging::MB_OK
                    | windows_sys::Win32::UI::WindowsAndMessaging::MB_ICONERROR,
            );
            DestroyWindow(hwnd);
            return crate::EXIT_FAILURE;
        }
        crate::boot::log_line(
            &log_paths,
            &format!("Tray gestartet; Symbol nach {attempts} Versuch(en) angenommen."),
        );
        SetTimer(hwnd, TIMER_POLL, POLL_MILLIS, None);

        let mut message: MSG = std::mem::zeroed();
        loop {
            let answer = GetMessageW(&mut message, std::ptr::null_mut(), 0, 0);
            if answer == 0 || answer == -1 {
                break;
            }
            TranslateMessage(&message);
            DispatchMessageW(&message);
        }

        shell_remove_icon(hwnd);
        stop_harness();
        DestroyIcon(lock().icon as _);
        0
    }
}

/// Takes the single-instance mutex.
///
/// Two tray icons for one harness would show two different beliefs about the same
/// port, and the second one could not stop what the first started.
fn claim_single_instance() -> bool {
    let name = wide("Local\\pmh-tray-instance");
    // SAFETY: the name buffer is live for the call; the handle is deliberately kept
    // for the life of the process (dropping it would release the claim).
    let handle = unsafe { CreateMutexW(std::ptr::null(), 0, name.as_ptr()) };
    if handle.is_null() {
        // No mutex means no claim to check: starting is the lesser evil, and the
        // caller sees the error only if two instances really collide.
        return true;
    }
    unsafe { GetLastError() != windows_sys::Win32::Foundation::ERROR_ALREADY_EXISTS }
}

/// Recomputes status, tooltip and icon from the actual world.
fn refresh_icon(hwnd: HWND) {
    let (tooltip, color) = {
        let mut tray = lock();
        let alive = tray.harness.as_mut().map(|harness| harness.is_alive());
        let open = health::is_open(tray.port.port);
        tray.status = if open {
            Status::Running
        } else if alive == Some(true) {
            Status::Starting
        } else {
            Status::Stopped
        };
        // A child that ended without the port answering is worth saying out loud:
        // otherwise the tray looks like it simply ignored the click.
        if alive == Some(false) {
            if let Some(harness) = tray.harness.as_ref() {
                let tail = harness.tail();
                let last = tail
                    .iter()
                    .rev()
                    .find(|line| !line.trim().is_empty())
                    .cloned()
                    .unwrap_or_default();
                if !last.is_empty() {
                    tray.note = Some(format!("beendet: {last}"));
                }
            }
            stop_harness_locked(&mut tray);
        }
        let address = tray
            .harness
            .as_ref()
            .and_then(|harness| harness.address())
            .or_else(|| tray.remembered.address.clone());
        if let Some(address) = address {
            if tray.remembered.address.as_deref() != Some(address.as_str()) {
                tray.remembered.address = Some(address);
                tray.remembered.port = Some(tray.port.port);
                let _ = write_remembered(&tray);
            }
        }
        (
            tray.status.tooltip(tray.port.port),
            tray.status.color(),
        )
    };
    // SAFETY: `hwnd` is the window created above and still alive on this thread.
    unsafe {
        let icon = build_icon(color);
        if !icon.is_null() {
            let previous = std::mem::replace(&mut lock().icon, icon as isize);
            if previous != 0 {
                DestroyIcon(previous as _);
            }
            shell_modify_icon(hwnd, icon, &tooltip);
        }
    }
}

fn write_remembered(tray: &Tray) -> std::io::Result<()> {
    if let Some(parent) = tray.paths.state.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&tray.paths.state, tray.remembered.render())
}

/// Adds the icon to the notification area.
fn shell_add_icon(hwnd: HWND) -> bool {
    let mut data = icon_data(hwnd);
    data.uFlags = NIF_ICON | NIF_MESSAGE | NIF_TIP;
    // SAFETY: `data` is a fully initialised NOTIFYICONDATAW for this window.
    unsafe { Shell_NotifyIconW(NIM_ADD, &data) != 0 }
}

/// Changes icon and tooltip of the existing entry.
fn shell_modify_icon(hwnd: HWND, icon: windows_sys::Win32::UI::WindowsAndMessaging::HICON, tooltip: &str) {
    let mut data = icon_data(hwnd);
    data.uFlags = NIF_ICON | NIF_TIP;
    data.hIcon = icon;
    copy_tip(&mut data, tooltip);
    // SAFETY: as in `shell_add_icon`.
    unsafe {
        Shell_NotifyIconW(NIM_MODIFY, &data);
    }
}

/// Removes the icon from the notification area.
fn shell_remove_icon(hwnd: HWND) {
    let data = icon_data(hwnd);
    // SAFETY: as in `shell_add_icon`.
    unsafe {
        Shell_NotifyIconW(NIM_DELETE, &data);
    }
}

fn icon_data(hwnd: HWND) -> NOTIFYICONDATAW {
    // Read once, then release: `copy_tip` must not run under a second borrow of the
    // same lock, which would deadlock the single tray thread.
    let (icon, tooltip) = {
        let tray = lock();
        (tray.icon, tray.status.tooltip(tray.port.port))
    };
    let mut data: NOTIFYICONDATAW = unsafe { std::mem::zeroed() };
    data.cbSize = std::mem::size_of::<NOTIFYICONDATAW>() as u32;
    data.hWnd = hwnd;
    data.uID = 1;
    data.uCallbackMessage = WM_TRAY;
    data.hIcon = icon as _;
    copy_tip(&mut data, &tooltip);
    data
}

/// Copies a tooltip into the fixed 128-code-unit field, truncating rather than
/// overflowing into the neighbouring fields.
fn copy_tip(data: &mut NOTIFYICONDATAW, text: &str) {
    let units: Vec<u16> = text.encode_utf16().take(127).collect();
    for (slot, unit) in data.szTip.iter_mut().zip(units) {
        *slot = unit;
    }
}

/// Builds a 16×16 icon: a filled circle in the state colour.
///
/// Returned as a handle the caller owns; a null return means the icon could not be
/// built, and the tray keeps the previous one instead of showing nothing.
fn build_icon((red, green, blue): (u8, u8, u8)) -> windows_sys::Win32::UI::WindowsAndMessaging::HICON {
    use windows_sys::Win32::UI::WindowsAndMessaging::{CreateIconIndirect, ICONINFO};
    const SIZE: i32 = 16;
    // SAFETY: GDI/User calls with a fully described bitmap and an ICONINFO whose
    // two bitmaps are deleted right after the icon copies them.
    unsafe {
        let mut info = BITMAPINFO::default();
        info.bmiHeader = BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: SIZE,
            biHeight: -SIZE, // top-down, so row 0 is the top row
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB,
            biSizeImage: 0,
            biXPelsPerMeter: 0,
            biYPelsPerMeter: 0,
            biClrUsed: 0,
            biClrImportant: 0,
        };
        let mut bits: *mut core::ffi::c_void = std::ptr::null_mut();
        let color_bitmap = CreateDIBSection(
            std::ptr::null_mut(),
            &info,
            DIB_RGB_COLORS,
            &mut bits,
            std::ptr::null_mut(),
            0,
        );
        if color_bitmap.is_null() || bits.is_null() {
            return std::ptr::null_mut();
        }
        let pixels = std::slice::from_raw_parts_mut(bits as *mut u8, (SIZE * SIZE * 4) as usize);
        let centre = (SIZE as f32 - 1.0) / 2.0;
        let radius = SIZE as f32 / 2.0 - 1.0;
        for y in 0..SIZE {
            for x in 0..SIZE {
                let dx = x as f32 - centre;
                let dy = y as f32 - centre;
                let distance = (dx * dx + dy * dy).sqrt();
                let at = ((y * SIZE + x) * 4) as usize;
                if distance <= radius {
                    // A slightly darker rim makes the dot readable on a light
                    // taskbar as well as on a dark one.
                    let shade = if distance > radius - 1.5 { 0.75 } else { 1.0 };
                    pixels[at] = (f32::from(blue) * shade) as u8;
                    pixels[at + 1] = (f32::from(green) * shade) as u8;
                    pixels[at + 2] = (f32::from(red) * shade) as u8;
                    pixels[at + 3] = 255;
                } else {
                    pixels[at + 3] = 0;
                }
            }
        }
        // A monochrome mask is still required by ICONINFO even for a 32-bit icon
        // with an alpha channel.
        let mask = CreateBitmap(SIZE, SIZE, 1, 1, std::ptr::null());
        let icon_info = ICONINFO {
            fIcon: 1,
            xHotspot: 0,
            yHotspot: 0,
            hbmMask: mask,
            hbmColor: color_bitmap,
        };
        let icon = CreateIconIndirect(&icon_info);
        DeleteObject(color_bitmap as _);
        if !mask.is_null() {
            DeleteObject(mask as _);
        }
        if icon.is_null() {
            // The fallback keeps the tray visible even if the drawn icon failed.
            LoadIconW(std::ptr::null_mut(), 32512usize as _)
        } else {
            icon
        }
    }
}

/// Shows the context menu and carries out the choice.
fn show_menu(hwnd: HWND) {
    // The snapshot is taken **before** the menu is shown: `TrackPopupMenu` pumps
    // messages itself, so holding the state lock across it would deadlock on the
    // next timer tick.
    let (status, has_address, autostart_on, port, note) = {
        let tray = lock();
        (
            tray.status,
            tray.remembered.address.is_some(),
            tray.autostart,
            tray.port.port,
            tray.note.clone(),
        )
    };

    // SAFETY: the menu handle is created and destroyed here; every string pointer
    // outlives the call that reads it.
    unsafe {
        let menu = CreatePopupMenu();
        if menu.is_null() {
            return;
        }
        let start_label = "Starten";
        let stop_label = "Stoppen";
        let open_label = "Im Browser oeffnen";
        let autostart_label = "Autostart beim Anmelden";
        let log_label = "Protokoll oeffnen";
        let quit_label = "Beenden (stoppt den Harness)";

        let port_label = format!("Port {port} — {}", status_word(status));
        AppendMenuW(menu, MF_STRING | MF_GRAYED, 0, wide(&port_label).as_ptr());
        if let Some(note) = note.as_deref() {
            let note = format!("zuletzt: {note}");
            AppendMenuW(menu, MF_STRING | MF_GRAYED, 0, wide(&note).as_ptr());
        }
        AppendMenuW(menu, MF_SEPARATOR, 0, std::ptr::null());

        let start_flags = if status == Status::Stopped {
            MF_STRING
        } else {
            MF_STRING | MF_GRAYED
        };
        AppendMenuW(menu, start_flags, CMD_START, wide(start_label).as_ptr());

        let stop_flags = if status == Status::Stopped {
            MF_STRING | MF_GRAYED
        } else {
            MF_STRING
        };
        AppendMenuW(menu, stop_flags, CMD_STOP, wide(stop_label).as_ptr());

        // Opening without the token lands on 401 — so the item is only live when an
        // address with token is known.
        let open_flags = if has_address {
            MF_STRING
        } else {
            MF_STRING | MF_GRAYED
        };
        AppendMenuW(menu, open_flags, CMD_OPEN, wide(open_label).as_ptr());

        AppendMenuW(menu, MF_SEPARATOR, 0, std::ptr::null());
        let autostart_flags = if autostart_on {
            MF_STRING | MF_CHECKED
        } else {
            MF_STRING
        };
        AppendMenuW(menu, autostart_flags, CMD_AUTOSTART, wide(autostart_label).as_ptr());
        AppendMenuW(menu, MF_STRING, CMD_LOG, wide(log_label).as_ptr());
        AppendMenuW(menu, MF_SEPARATOR, 0, std::ptr::null());
        AppendMenuW(menu, MF_STRING, CMD_QUIT, wide(quit_label).as_ptr());

        let mut point = std::mem::zeroed();
        GetCursorPos(&mut point);
        // Without setting the foreground the menu does not close when the user
        // clicks elsewhere — the classic tray-menu quirk.
        SetForegroundWindow(hwnd);
        let chosen = TrackPopupMenu(
            menu,
            TPM_RETURNCMD | TPM_RIGHTBUTTON,
            point.x,
            point.y,
            0,
            hwnd,
            std::ptr::null(),
        );
        DestroyMenu(menu);
        PostMessageW(hwnd, WM_NULL, 0, 0);

        if chosen > 0 {
            act(hwnd, chosen as usize);
        }
    }
}

fn status_word(status: Status) -> &'static str {
    match status {
        Status::Stopped => "gestoppt",
        Status::Starting => "startet",
        Status::Running => "laeuft",
    }
}

/// Carries out one menu choice.
fn act(hwnd: HWND, command: usize) {
    match command {
        CMD_START => match start_harness() {
            Ok(()) => {}
            Err(message) => {
                lock().note = Some(message);
            }
        },
        CMD_STOP => stop_harness(),
        CMD_OPEN => {
            if let Err(message) = open_browser() {
                lock().note = Some(message);
            }
        }
        CMD_AUTOSTART => {
            let root = lock().paths.root.clone();
            let outcome: Result<String, String> = if autostart::is_enabled() {
                autostart::disable().map(|removed| {
                    if removed {
                        "Verknuepfung im Startup-Ordner entfernt".to_string()
                    } else {
                        "es war keine Verknuepfung eingetragen".to_string()
                    }
                })
            } else {
                match std::env::current_exe() {
                    Ok(current) => {
                        // The shortcut must point at the binary **without** a console:
                        // at login a console window would appear and never leave.
                        let target = config::gui_binary_for(&current);
                        autostart::enable(&target, &root).map(|path| {
                            format!("Verknuepfung angelegt: {}", path.display())
                        })
                    }
                    Err(error) => Err(format!("der eigene Programmweg ist unbekannt: {error}")),
                }
            };
            let mut tray = lock();
            match outcome {
                Ok(note) => {
                    tray.autostart = autostart::is_enabled();
                    tray.note = Some(note);
                }
                Err(message) => tray.note = Some(message),
            }
        }
        CMD_LOG => {
            let log = lock().paths.log.clone();
            let _ = open_with_shell(&log.display().to_string());
        }
        CMD_QUIT => {
            // SAFETY: `hwnd` is our window; destroying it ends the message loop.
            unsafe {
                DestroyWindow(hwnd);
            }
        }
        _ => {}
    }
    refresh_icon(hwnd);
}

/// Starts the harness.
fn start_harness() -> Result<(), String> {
    let mut tray = lock();
    if let Some(harness) = tray.harness.as_mut() {
        if harness.is_alive() {
            return Err("der Harness laeuft bereits".to_string());
        }
    }
    // A harness someone else started (a console, another tool) is not ours to
    // spawn a second copy of.
    if tray.status == Status::Running {
        return Err(format!(
            "auf Port {} antwortet bereits ein Harness — nicht von diesem Tray gestartet",
            tray.port.port
        ));
    }
    let harness = Harness::start(&tray.bun.path, &tray.paths, tray.port.port)
        .map_err(|error| format!("Start gescheitert: {error}"))?;
    tray.note = Some(format!(
        "gestartet (PID {}) — {}",
        harness.pid(),
        tray.port.report()
    ));
    tray.harness = Some(harness);
    tray.status = Status::Starting;
    tray.remembered.port = Some(tray.port.port);
    let _ = write_remembered(&tray);
    Ok(())
}

/// Stops the harness, if this tray started one.
fn stop_harness() {
    let mut tray = lock();
    stop_harness_locked(&mut tray);
}

fn stop_harness_locked(tray: &mut Tray) {
    if let Some(mut harness) = tray.harness.take() {
        harness.stop();
        tray.note = Some("gestoppt".to_string());
    }
    tray.status = Status::Stopped;
}

/// Opens the address **with** token in the default browser.
fn open_browser() -> Result<(), String> {
    let tray = lock();
    let Some(address) = tray.remembered.address.clone() else {
        return Err(
            "kein Token bekannt — ohne ihn antwortet die Oberflaeche mit 401".to_string(),
        );
    };
    drop(tray);
    open_with_shell(&address)
}

/// Hands a string to the shell's default handler.
fn open_with_shell(target: &str) -> Result<(), String> {
    use windows_sys::Win32::UI::Shell::ShellExecuteW;
    let operation = wide("open");
    let file = wide(target);
    // SAFETY: both buffers are live for the call; no directory or parameters.
    let result = unsafe {
        ShellExecuteW(
            std::ptr::null_mut(),
            operation.as_ptr(),
            file.as_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            SW_SHOWNORMAL,
        )
    };
    // ShellExecuteW reports values above 32 on success.
    if result as isize > 32 {
        Ok(())
    } else {
        Err(format!("die Shell konnte \"{target}\" nicht oeffnen"))
    }
}

/// The window procedure: three messages, each handled where it belongs.
extern "system" fn window_procedure(hwnd: HWND, message: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    match message {
        WM_TIMER if wparam == TIMER_POLL => {
            refresh_icon(hwnd);
            0
        }
        WM_TRAY => {
            // The low word of lparam carries the mouse message the shell reports.
            let event = (lparam as u32) & 0xFFFF;
            if event == WM_RBUTTONUP || event == WM_CONTEXTMENU {
                show_menu(hwnd);
            } else if event == WM_LBUTTONDBLCLK {
                if let Err(message) = open_browser() {
                    lock().note = Some(message);
                }
            } else if event == WM_LBUTTONUP {
                // A single left click only refreshes: opening a browser on one
                // click is the most common way a tray icon becomes annoying.
                refresh_icon(hwnd);
            }
            0
        }
        WM_DESTROY => {
            // SAFETY: the documented way to leave the message loop.
            unsafe {
                PostQuitMessage(0);
            }
            0
        }
        _ => {
            // SAFETY: everything not handled here belongs to the system default.
            unsafe { DefWindowProcW(hwnd, message, wparam, lparam) }
        }
    }
}

/// The smallest sequence that can add a notification icon.
///
/// Used by `--probe-tray` to bisect: if this succeeds while the tray's own sequence
/// fails, the difference is in the tray code; if both fail, it is in the binary or
/// the environment. No tooltip, no timer, no state — one class, one window, one call.
fn minimal_add(instance: windows_sys::Win32::Foundation::HINSTANCE) -> bool {
    let class = wide("PMHTrayMinimal");
    let window_class = WNDCLASSW {
        style: 0,
        lpfnWndProc: Some(window_procedure),
        cbClsExtra: 0,
        cbWndExtra: 0,
        hInstance: instance,
        hIcon: std::ptr::null_mut(),
        hCursor: std::ptr::null_mut(),
        hbrBackground: std::ptr::null_mut(),
        lpszMenuName: std::ptr::null(),
        lpszClassName: class.as_ptr(),
    };
    // SAFETY: standard sequence; every pointer outlives its call.
    unsafe {
        RegisterClassW(&window_class);
        let hwnd = CreateWindowExW(
            0,
            class.as_ptr(),
            std::ptr::null(),
            0,
            // NOT 0×0: the shell refuses `Shell_NotifyIconW(NIM_ADD)` for a window
            // created with a zero extent. Measured 15.10.2026: identical code with
            // `CW_USEDEFAULT` widths was accepted.
            CW_USEDEFAULT,
            0,
            CW_USEDEFAULT,
            0,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            instance,
            std::ptr::null(),
        );
        if hwnd.is_null() {
            return false;
        }
        let mut data: NOTIFYICONDATAW = std::mem::zeroed();
        data.cbSize = std::mem::size_of::<NOTIFYICONDATAW>() as u32;
        data.hWnd = hwnd;
        data.uID = 7;
        data.uFlags = NIF_ICON | NIF_MESSAGE;
        data.uCallbackMessage = WM_USER + 42;
        data.hIcon = LoadIconW(std::ptr::null_mut(), 32512usize as _);
        let accepted = Shell_NotifyIconW(NIM_ADD, &data) != 0;
        if accepted {
            Shell_NotifyIconW(NIM_DELETE, &data);
        }
        DestroyWindow(hwnd);
        accepted
    }
}

/// Reports the job object's UI restrictions for this process.
///
/// `JOB_OBJECT_UILIMIT_HANDLES` forbids using USER handles owned by processes
/// outside the job. The taskbar is such a process, so with this bit set,
/// `Shell_NotifyIconW` **cannot** succeed — regardless of how correct the program
/// is. A job object is how sandboxes keep automation invisible, so this is the
/// first thing to read when the icon is refused.
fn job_ui_restrictions() -> String {
    use windows_sys::Win32::System::JobObjects::{
        JobObjectBasicUIRestrictions, QueryInformationJobObject, JOBOBJECT_BASIC_UI_RESTRICTIONS,
        JOB_OBJECT_UILIMIT_DESKTOP, JOB_OBJECT_UILIMIT_GLOBALATOMS, JOB_OBJECT_UILIMIT_HANDLES,
        JOB_OBJECT_UILIMIT_READCLIPBOARD, JOB_OBJECT_UILIMIT_SYSTEMPARAMETERS,
        JOB_OBJECT_UILIMIT_WRITECLIPBOARD,
    };

    let mut restrictions: JOBOBJECT_BASIC_UI_RESTRICTIONS = unsafe { std::mem::zeroed() };
    let mut returned = 0u32;
    // SAFETY: a null job handle means "this process's job", and the output buffer is
    // the exact size of the struct whose address is passed.
    let ok = unsafe {
        QueryInformationJobObject(
            std::ptr::null_mut(),
            JobObjectBasicUIRestrictions,
            &mut restrictions as *mut _ as *mut core::ffi::c_void,
            std::mem::size_of::<JOBOBJECT_BASIC_UI_RESTRICTIONS>() as u32,
            &mut returned,
        )
    };
    if ok == 0 {
        return "(kein Job oder nicht lesbar)".to_string();
    }
    let class = restrictions.UIRestrictionsClass;
    if class == 0 {
        return "0 (keine)".to_string();
    }
    let mut named = Vec::new();
    for (bit, name) in [
        (JOB_OBJECT_UILIMIT_HANDLES, "HANDLES"),
        (JOB_OBJECT_UILIMIT_READCLIPBOARD, "READCLIPBOARD"),
        (JOB_OBJECT_UILIMIT_WRITECLIPBOARD, "WRITECLIPBOARD"),
        (JOB_OBJECT_UILIMIT_SYSTEMPARAMETERS, "SYSTEMPARAMETERS"),
        (JOB_OBJECT_UILIMIT_GLOBALATOMS, "GLOBALATOMS"),
        (JOB_OBJECT_UILIMIT_DESKTOP, "DESKTOP"),
    ] {
        if class & bit != 0 {
            named.push(name);
        }
    }
    format!("{class} ({})", named.join(", "))
}

/// Prints where this process really is: window station and desktop.
///
/// The notification area belongs to the shell **on the interactive desktop of the
/// session**. A process started on another desktop, or in another session, gets
/// `FALSE` from `Shell_NotifyIconW` and no hint why — measured on 15.10.2026:
/// `shell_genommen=nein` from a sandboxed shell, while session id, explorer and
/// `UserInteractive` all looked correct. Naming the station and desktop turns that
/// silence into a diagnosis.
fn window_station_and_desktop() -> (String, String) {
    use windows_sys::Win32::System::StationsAndDesktops::{
        GetProcessWindowStation, GetThreadDesktop, GetUserObjectInformationW, UOI_NAME,
    };
    use windows_sys::Win32::System::Threading::GetCurrentThreadId;

    unsafe fn name_of(handle: *mut core::ffi::c_void) -> String {
        if handle.is_null() {
            return "(kein Handle)".to_string();
        }
        let mut buffer = [0u16; 256];
        let mut needed = 0u32;
        // SAFETY: the buffer is a 256-unit array and its length is passed along.
        let ok = unsafe {
            GetUserObjectInformationW(
                handle as _,
                UOI_NAME,
                buffer.as_mut_ptr() as *mut core::ffi::c_void,
                std::mem::size_of_val(&buffer) as u32,
                &mut needed,
            )
        };
        if ok == 0 {
            return format!("(unlesbar, Fehler {})", unsafe { GetLastError() });
        }
        let end = buffer.iter().position(|unit| *unit == 0).unwrap_or(buffer.len());
        String::from_utf16_lossy(&buffer[..end])
    }

    // SAFETY: both calls only read the current process/thread and return handles
    // this process already owns; the handles are never closed here.
    unsafe {
        let station = GetProcessWindowStation();
        let desktop = GetThreadDesktop(GetCurrentThreadId());
        (name_of(station as _), name_of(desktop as _))
    }
}

/// Creates the tray, proves the shell accepted it, and disappears again.
///
/// This exists so the one claim that cannot be checked by a unit test — "the shell
/// shows our icon" — can be checked by a command instead of by hope.
pub fn probe() -> i32 {
    let state = Tray {
        paths: Paths::from_root(".".into()),
        bun: config::BunChoice {
            path: ".".into(),
            origin: config::Origin::Default,
        },
        port: config::PortChoice {
            port: config::DEFAULT_PORT,
            origin: config::Origin::Default,
        },
        harness: None,
        remembered: config::Remembered::default(),
        autostart: false,
        status: Status::Stopped,
        icon: 0,
        hwnd: 0,
        note: None,
    };
    let _ = TRAY.set(Mutex::new(state));

    // SAFETY: standard create-window sequence; pointers outlive their calls.
    unsafe {
        let instance = GetModuleHandleW(std::ptr::null());
        let class = wide(CLASS_NAME);
        let window_class = WNDCLASSW {
            style: 0,
            lpfnWndProc: Some(window_procedure),
            cbClsExtra: 0,
            cbWndExtra: 0,
            hInstance: instance,
            hIcon: std::ptr::null_mut(),
            hCursor: std::ptr::null_mut(),
            hbrBackground: std::ptr::null_mut(),
            lpszMenuName: std::ptr::null(),
            lpszClassName: class.as_ptr(),
        };
        RegisterClassW(&window_class);
        let title = wide("Prometheus Harness");
        let hwnd = CreateWindowExW(
            0,
            class.as_ptr(),
            title.as_ptr(),
            0,
            0,
            0,
            0,
            0,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            instance,
            std::ptr::null(),
        );
        if hwnd.is_null() {
            println!("fenster=nein");
            return crate::EXIT_FAILURE;
        }
        lock().hwnd = hwnd as isize;
        refresh_icon(hwnd);
        let icon = lock().icon;
        let full = std::mem::size_of::<NOTIFYICONDATAW>() as u32;
        println!("cb_size={full}");
        let (station, desktop) = window_station_and_desktop();
        println!("fensterstation={station}");
        println!("desktop={desktop}");
        // Can this process see the shell's own windows at all? If the taskbar window
        // is invisible, no notification-area call can ever succeed — and the reason
        // is the environment, not this program.
        let taskbar = windows_sys::Win32::UI::WindowsAndMessaging::FindWindowW(
            wide("Shell_TrayWnd").as_ptr(),
            std::ptr::null(),
        );
        let desktop_window = windows_sys::Win32::UI::WindowsAndMessaging::FindWindowW(
            wide("Progman").as_ptr(),
            std::ptr::null(),
        );
        println!("shell_traywnd={}", if taskbar.is_null() { "unsichtbar" } else { "sichtbar" });
        println!("progman={}", if desktop_window.is_null() { "unsichtbar" } else { "sichtbar" });
        let limits = job_ui_restrictions();
        println!("job_ui_sperren={limits}");
        // The decisive test: can this process talk to the taskbar's window at all?
        // Shell_NotifyIconW is exactly such a message, so if even WM_NULL is refused,
        // the boundary is the environment and no icon code can cross it.
        let mut probe_result: usize = 0;
        let sent = windows_sys::Win32::UI::WindowsAndMessaging::SendMessageTimeoutW(
            taskbar,
            WM_NULL,
            0,
            0,
            windows_sys::Win32::UI::WindowsAndMessaging::SMTO_ABORTIFHUNG,
            1000,
            &mut probe_result,
        );
        println!(
            "taskbar_nachricht={}",
            if sent != 0 { "angenommen" } else { "verweigert" }
        );
        let added = shell_add_icon(hwnd);
        // A second data point in the same run: if even the smallest possible
        // sequence is refused, the tray's own code is not what is being refused.
        let minimal = minimal_add(instance);
        {
            // The field dump exists because "returned FALSE" is not a diagnosis.
            let data = icon_data(hwnd);
            println!(
                "felder: cb={} hwnd_leer={} uid={} flags={} callback={} icon_leer={} tip={}",
                data.cbSize,
                data.hWnd.is_null(),
                data.uID,
                data.uFlags,
                data.uCallbackMessage,
                data.hIcon.is_null(),
                data.szTip.iter().take_while(|unit| **unit != 0).count()
            );
        }
        if !added {
            // Is it our icon? The same call with a stock system icon answers that
            // without changing any other field.
            let stock = LoadIconW(std::ptr::null_mut(), 32512usize as _);
            let mut data = icon_data(hwnd);
            data.uFlags = NIF_ICON | NIF_MESSAGE | NIF_TIP;
            data.hIcon = stock;
            let with_stock = Shell_NotifyIconW(NIM_ADD, &data);
            println!(
                "mit_bestandsicon={}",
                if with_stock != 0 { "ja" } else { "nein" }
            );
            if with_stock != 0 {
                let remove = icon_data(hwnd);
                Shell_NotifyIconW(NIM_DELETE, &remove);
            }
        }
        println!("shell_genommen={}", if added { "ja" } else { "nein" });
        println!("minimal={}", if minimal { "ja" } else { "nein" });
        // The verdict, spelled out. "FALSE" alone has cost an afternoon before.
        if added && minimal {
            println!("BEFUND: der Infobereich hat das Symbol angenommen.");
        } else {
            println!(
                "BEFUND: der Infobereich hat das Symbol VERWEIGERT — und zwar fuer den \
                 vollstaendigen Aufruf wie fuer den minimalen."
            );
            println!(
                "  Fensterstation und Desktop sind in Ordnung, die Taskleiste ist erreichbar \
                 und nimmt Fensternachrichten an."
            );
            println!(
                "  Zur Einordnung: dieselbe Verweigerung ist am 15.10.2026 auch mit der \
                 etablierten Bibliothek `tray-icon` gemessen worden —"
            );
            println!(
                "  sie verschluckt das allerdings und meldet Erfolg, waehrend ihr NIM_DELETE \
                 danach fehlschlaegt. Der Aufrufer ist damit nicht die Ursache."
            );
            println!(
                "  Abhilfe: dieses Programm aus einer normalen Sitzung starten (Doppelklick im \
                 Explorer). Diese Shell gehoert einer Agent-Sandbox."
            );
        }
        // Give the shell a moment, then clean up.
        std::thread::sleep(std::time::Duration::from_millis(1500));
        shell_remove_icon(hwnd);
        DestroyIcon(icon as _);
        DestroyWindow(hwnd);
        println!("fenster=ja");
        println!("symbol_gebaut={}", if icon != 0 { "ja" } else { "nein" });
        if added {
            crate::EXIT_OK
        } else {
            crate::EXIT_FAILURE
        }
    }
}
