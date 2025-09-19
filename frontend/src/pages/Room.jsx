import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Box, Typography, CircularProgress, Stack, Button } from '@mui/material';
import Canvas from '../Canvas';
import { getRoomStrokes, postRoomStroke, getRoomDetails } from '../api/rooms';
import { getSocket } from '../socket';

export default function Room({ auth }){
  const { id } = useParams();
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [strokes, setStrokes] = useState([]);
  const roomId = id;
  const socketRef = useRef(null);

  async function load(){
    setLoading(true);
    const detail = await getRoomDetails(auth.token, roomId);
    setInfo(detail);
    const s = await getRoomStrokes(auth.token, roomId);
    setStrokes(s);
    setLoading(false);
  }

  useEffect(()=>{
    load();
  }, [roomId]);

  useEffect(()=>{
    if (!auth?.token) return;
    const sock = getSocket(auth.token);
    socketRef.current = sock;
    sock.emit("join_room", { roomId });
    const onStroke = (payload)=>{
      if (payload?.roomId === roomId && payload.stroke){
        setStrokes(prev => [...prev, payload.stroke]);
      }
    };
    sock.on("stroke", onStroke);
    return ()=>{ try { sock.off("stroke", onStroke); sock.emit("leave_room", { roomId }); } catch(_){}};
  }, [roomId, auth?.token]);

  if (loading) return <Box sx={{p:3}}><CircularProgress /></Box>;
  const viewOnly = (info?.myRole || 'editor') === 'viewer';

  return (
    <Box sx={{p:2}}>
      <Typography variant="h6">{info?.name} {viewOnly && <Typography component="span" color="text.secondary">(view-only)</Typography>}</Typography>
      <Canvas
        initialStrokes={strokes}
        onPostStroke={async (stroke)=>{
          // post to backend; server will re-broadcast
          await postRoomStroke(auth.token, roomId, stroke);
        }}
        viewOnly={viewOnly}
        currentUser={auth?.user?.username}
      />
    </Box>
  );
}
