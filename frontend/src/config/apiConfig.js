const envBase = typeof process !== 'undefined' && process.env && process.env.REACT_APP_API_BASE;
function defaultLocalBase() {
  try {
    const loc = window && window.location;
    if (!loc) return 'http://127.0.0.1:10010';
    const hostname = loc.hostname;
    return `${loc.protocol}//${hostname}:10010`;
  } catch (err) {
    return 'http://127.0.0.1:10010';
  }
}

export const API_BASE = process.env.REACT_APP_API_BASE || defaultLocalBase();

console.log("API Base at Config", API_BASE);

export default {
  API_BASE
};
