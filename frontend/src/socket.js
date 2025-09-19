import { io } from "socket.io-client";
const WS_BASE = "http://127.0.0.1:10010";

let socket = null;
let listeners = new Set();

export function getSocket(token){
  if (socket) return socket;
  socket = io(WS_BASE, { transports: ["websocket"], auth: { token }, query: { token } });
  socket.on("connected", (msg)=>{
    // console.log("WS connected", msg);
  });
  socket.on("notification", (n)=>{
    listeners.forEach(fn => { try { fn(n); } catch(_){} });
  });
  socket.on("stroke", (payload)=>{
    // Consumers may add their own stroke listeners via socket.on in their scope
  });
  return socket;
}

export function onNotification(cb){
  listeners.add(cb);
  return ()=>listeners.delete(cb);
}
