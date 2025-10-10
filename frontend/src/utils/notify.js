// Lightweight notifier helper.
// Dispatches a DOM CustomEvent 'rescanvas:notify' with { message, duration }.
// The top-level Layout listens for this event and shows a themed Snackbar.
export default function notify(msg, duration = 4000) {
  try {
    const detail = { message: String(msg), duration };
    const ev = new CustomEvent('rescanvas:notify', { detail });
    if (window && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(ev);
      return;
    }
  } catch (e) {
  }
  console.warn('NOTIFY:', msg);
}
