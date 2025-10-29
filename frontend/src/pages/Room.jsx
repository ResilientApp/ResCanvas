import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box, Paper, Typography, Button, CircularProgress, IconButton,
  List, ListItem, ListItemButton, ListItemText, Avatar, AppBar, ThemeProvider,
  Link, Dialog, DialogTitle, DialogContent, DialogActions
} from '@mui/material';
import { useParams, useNavigate } from 'react-router-dom';
import { getRoomDetails, getRoomStrokes } from '../api/rooms';
import { getUsername } from '../utils/getUsername';
import Canvas from '../components/Canvas';
import WalletConnector from '../components/WalletConnector';
import { handleAuthError } from '../utils/authUtils';
import { formatErrorMessage } from '../utils/errorHandling';
import { getSocket, setSocketToken } from '../services/socket';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import SettingsIcon from '@mui/icons-material/Settings';
import theme from '../config/theme';

export default function Room({ auth }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const roomId = id;
  const socketRef = useRef(null);

  const [selectedUser, setSelectedUser] = useState("");
  const [userList, setUserList] = useState([]);
  const [expandedGroups, setExpandedGroups] = useState([]);
  const [showUserList, setShowUserList] = useState(true);
  const [hovering, setHovering] = useState(false);

  const [helpOpen, setHelpOpen] = useState(false);
  const [blogOpen, setBlogOpen] = useState(false);
  const [forbiddenOpen, setForbiddenOpen] = useState(false);
  const [forbiddenMessage, setForbiddenMessage] = useState('Access denied');
  const [forbiddenRedirect, setForbiddenRedirect] = useState('/dashboard');
  const [forbiddenTitle, setForbiddenTitle] = useState('Access denied');

  const [walletConnected, setWalletConnected] = useState(false);
  const [walletPublicKey, setWalletPublicKey] = useState(null);

  const formatDateMs = (epochMs) => {
    const d = new Date(epochMs);
    return d.toLocaleDateString() + " " + d.toLocaleTimeString();
  };

  const toggleGroup = (periodStart) => {
    if (expandedGroups.includes(periodStart)) {
      setExpandedGroups(expandedGroups.filter(p => p !== periodStart));
    } else {
      setExpandedGroups([...expandedGroups, periodStart]);
    }
  };

  const handleReturnToMaster = () => {
    navigate('/dashboard');
  };

  const handleWalletConnected = (publicKey) => {
    setWalletConnected(true);
    setWalletPublicKey(publicKey);
    console.log('Wallet connected:', publicKey);
  };

  const handleWalletDisconnected = () => {
    setWalletConnected(false);
    setWalletPublicKey(null);
    console.log('Wallet disconnected');
  };

  const load = useCallback(async () => {
    if (!auth?.token) {
      console.error('No auth token available for room loading');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const detail = await getRoomDetails(auth.token, roomId);
      setInfo(detail);
      const s = await getRoomStrokes(auth.token, roomId);
      // strokes are now handled directly by Canvas component
      console.log('Room strokes loaded:', s.length, 'strokes');
    } catch (error) {
      console.error('Failed to load room details:', error);
      if (!handleAuthError(error)) {
        const errorMessage = formatErrorMessage(error);
        if (error?.status === 403 || (error?.message && error.message.toLowerCase().includes('forbidden'))) {
          setForbiddenTitle('Access Denied');
          setForbiddenMessage(errorMessage);
          setForbiddenRedirect('/dashboard');
          setForbiddenOpen(true);
        } else if (error?.status === 404) {
          setForbiddenTitle('Room Not Found');
          setForbiddenMessage(errorMessage);
          setForbiddenRedirect('/dashboard');
          setForbiddenOpen(true);
        } else {
          setForbiddenTitle('Error Loading Room');
          setForbiddenMessage(errorMessage);
          setForbiddenRedirect('/dashboard');
          setForbiddenOpen(true);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [auth?.token, roomId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!auth?.token) return;
    setSocketToken(auth.token);
    const sock = getSocket(auth.token);
    socketRef.current = sock;
    sock.emit("join_room", { roomId });
    const onStroke = (payload) => {
      if (payload?.roomId === roomId && payload.stroke) {
        console.log('Received real-time stroke for room:', roomId);
      }
    };
    sock.on("stroke", onStroke);
    return () => { try { sock.off("stroke", onStroke); sock.emit("leave_room", { roomId }); } catch (_) { } };
  }, [roomId, auth?.token]);

  if (loading) return <Box sx={{ p: 3 }}><CircularProgress /></Box>;
  // If the room is archived, only the owner should be able to edit; others view-only
  // Archived rooms are view-only for everyone. Also treat explicit 'viewer' role as view-only.
  const viewOnly = (() => {
    const role = info?.myRole || 'editor';
    if (info?.archived) return true;
    return role === 'viewer';
  })();

  const isOwner = (() => {
    try {
      if (!info) return false;
      const role = info.myRole || null;
      if (role === 'owner') return true;
      try {
        const uname = getUsername(auth);
        if (uname && info.ownerName && uname === info.ownerName) return true;
      } catch (e) { }
      return false;
      return false;
    } catch (e) { return false; }
  })();

  return (
    <ThemeProvider theme={theme}>
      <Box className="App" sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Room page relies on the floating Canvas header for room title and Return to Master */}

        <Box sx={{ height: 'calc(100vh - 200px)', position: 'relative', overflow: 'hidden' }}>
          {/* Wallet Connector for Secure Rooms */}
          {info?.type === 'secure' && (
            <Box sx={{
              position: 'absolute',
              top: 80,
              left: 20,
              zIndex: 1200,
            }}>
              <WalletConnector
                roomType={info?.type}
                onConnected={handleWalletConnected}
                onDisconnected={handleWalletDisconnected}
              />
            </Box>
          )}

          {/* Floating settings button removed - settings are available in the left toolbar */}
          {/* Main Canvas Content Fills the Entire Area */}
          <Box sx={{
            width: '100%',
            height: '100%',
            overflow: 'hidden',
          }}>
            <Canvas
              auth={auth}
              currentRoomId={roomId}
              currentRoomName={info?.name || `Room ${roomId}`}
              setUserList={setUserList}
              selectedUser={selectedUser}
              setSelectedUser={setSelectedUser}
              onExitRoom={handleReturnToMaster}
              canvasRefreshTrigger={0}
              viewOnly={viewOnly}
              isOwner={isOwner}
              roomType={info?.type || 'public'}
              walletConnected={walletConnected}
              templateId={info?.templateId}
              onOpenSettings={((info && ((info.myRole || 'editor') !== 'viewer')) ? (() => navigate(`/rooms/${roomId}/settings`)) : null)}
            />
          </Box>

          {/* Floating Drawing History Sidebar - Right side */}
          <Box
            sx={{
              position: 'absolute',
              top: 20,
              right: 0,
              bottom: 20,
              width: showUserList ? 240 : 20,
              transition: 'width 0.3s ease',
              pointerEvents: 'none',
            }}
            onMouseEnter={() => setHovering(true)}
            onMouseLeave={() => setHovering(false)}
          >
            {/* Toggle button on the left edge */}
            <Box
              onClick={() => setShowUserList(v => !v)}
              sx={{
                position: 'absolute',
                left: 0,
                top: '50%',
                transform: 'translateY(-50%)',
                width: 20,
                height: 60,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'all',
                opacity: hovering ? 1 : 0,
                transition: 'opacity 0.2s',
                bgcolor: 'rgba(0,0,0,0.1)',
                cursor: 'pointer',
                zIndex: 1100,
              }}
            >
              <IconButton size="small" sx={{ p: 0, color: 'white' }}>
                {showUserList
                  ? <ChevronRightIcon fontSize="small" />
                  : <ChevronLeftIcon fontSize="small" />}
              </IconButton>
            </Box>

            {/* Drawing History Panel */}
            {showUserList && (
              <Paper
                elevation={3}
                className="history-panel"
                sx={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  borderRadius: '20px 0 0 20px',
                  overflow: 'hidden',
                  background: '#25D8C5',
                  pointerEvents: 'all',
                }}
              >
                {/* Fixed Header */}
                <Box
                  sx={{
                    height: 70,
                    backgroundImage: `
                      linear-gradient(rgba(0, 0, 0, 0.3), rgba(0, 0, 0, 0.3)),
                      url('/toolbar/toolbar-bg.jpeg')
                    `,
                    backgroundPosition: 'center',
                    backgroundSize: 'cover',
                    backgroundRepeat: 'no-repeat',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontWeight: 'bold',
                    fontFamily: 'Comic Sans MS, cursive',
                    flexShrink: 0,
                  }}
                >
                  Drawing History
                </Box>

                {/* Scrollable User List */}
                <Box
                  sx={{
                    flexGrow: 1,
                    overflowY: 'auto',
                    backdropFilter: 'blur(4px)',
                    padding: 1,
                  }}
                >
                  <List dense>
                    {userList && userList.map((group, index) => {
                      // group is expected to be { periodStart, users: [...] }
                      if (group && group.periodStart !== undefined) {
                        const label = formatDateMs(group.periodStart);
                        const expanded = expandedGroups.includes(group.periodStart);
                        return (
                          <div key={group.periodStart}>
                            <ListItem disablePadding>
                              <ListItemButton onClick={() => toggleGroup(group.periodStart)}>
                                <ListItemText
                                  primary={label}
                                  primaryTypographyProps={{ color: '#17635a', fontWeight: 'bold' }}
                                />
                              </ListItemButton>
                            </ListItem>
                            {expanded && group.users.map((user, uidx) => {
                              const username = user.split("|")[0];
                              const isSelected = selectedUser && (
                                (typeof selectedUser === 'string' && selectedUser === user) ||
                                (typeof selectedUser === 'object' && selectedUser.user === user && selectedUser.periodStart === group.periodStart)
                              );
                              return (
                                <ListItem key={`${group.periodStart}-${uidx}`} disablePadding sx={{ pl: 2 }}>
                                  <ListItemButton
                                    onClick={() => setSelectedUser(isSelected ? "" : { user: user, periodStart: group.periodStart })}
                                    selected={Boolean(isSelected)}
                                    sx={{
                                      borderRadius: 1,
                                      '&.Mui-selected': {
                                        backgroundColor: theme.palette.action.hover,
                                        '&:hover': {
                                          backgroundColor: theme.palette.action.selected
                                        }
                                      }
                                    }}
                                  >
                                    <Avatar sx={{ bgcolor: theme.palette.primary.light, mr: 2 }}>
                                      {username.charAt(0).toUpperCase()}
                                    </Avatar>
                                    <ListItemText
                                      primary={username}
                                      primaryTypographyProps={{ color: '#17635a' }}
                                    />
                                  </ListItemButton>
                                </ListItem>
                              );
                            })}
                          </div>
                        );
                      } else {
                        const user = group;
                        const username = (user || '').split("|")[0];
                        const isSelected = selectedUser === user;
                        return (
                          <ListItem key={index} disablePadding>
                            <ListItemButton
                              onClick={() => setSelectedUser(isSelected ? "" : user)}
                              selected={Boolean(isSelected)}
                              sx={{
                                borderRadius: 1,
                                '&.Mui-selected': {
                                  backgroundColor: theme.palette.action.hover,
                                  '&:hover': {
                                    backgroundColor: theme.palette.action.selected
                                  }
                                }
                              }}
                            >
                              <Avatar sx={{ bgcolor: theme.palette.primary.light, mr: 2 }}>
                                {username.charAt(0).toUpperCase()}
                              </Avatar>
                              <ListItemText
                                primary={username}
                                primaryTypographyProps={{ color: '#17635a' }}
                              />
                            </ListItemButton>
                          </ListItem>
                        );
                      }
                    })}
                  </List>
                </Box>
              </Paper>
            )}
          </Box>
        </Box>

        {/* Legacy per-room footer removed; Layout provides the global footer now. */}

        {/* Help Dialog */}
        <Dialog open={helpOpen} onClose={() => setHelpOpen(false)} maxWidth="md" fullWidth>
          <DialogTitle sx={{ bgcolor: 'primary.main', color: 'white' }}>
            ResCanvas Help
          </DialogTitle>
          <DialogContent sx={{ pt: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
              <img
                src="../help_screen.png"
                alt="ResCanvas Help Screen"
                style={{ maxWidth: '100%', height: 'auto' }}
              />
            </Box>
            <Typography variant="h6" gutterBottom>Welcome to ResCanvas!</Typography>
            <Typography paragraph>
              ResCanvas is a collaborative drawing platform that uses ResilientDB to ensure your artwork is securely stored in a decentralized manner.
            </Typography>
            <Typography variant="h6" gutterBottom>How to Use:</Typography>
            <Typography component="div">
              <ul>
                <li><strong>Left Toolbar:</strong> Access drawing tools, colors, and brush sizes</li>
                <li><strong>Drawing History:</strong> View and filter drawings by user and time period</li>
                <li><strong>Real-time Collaboration:</strong> See other users' drawings appear instantly</li>
                <li><strong>History Recall:</strong> Load drawings from specific time periods</li>
                <li><strong>Undo/Redo:</strong> Use the toolbar buttons to undo or redo actions</li>
                <li><strong>Room Management:</strong> Create and join different drawing rooms</li>
              </ul>
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setHelpOpen(false)} color="primary" variant="contained">
              Got it!
            </Button>
          </DialogActions>
        </Dialog>

        {/* Blog Dialog */}
        <Dialog open={blogOpen} onClose={() => setBlogOpen(false)} maxWidth="lg" fullWidth>
          <DialogTitle sx={{ bgcolor: 'primary.main', color: 'white' }}>
            ResCanvas Blog
          </DialogTitle>
          <DialogContent sx={{ pt: 2 }}>
            <Typography variant="h4" gutterBottom>
              Introducing ResCanvas: Decentralized Collaborative Drawing
            </Typography>
            <Typography paragraph>
              ResCanvas represents a breakthrough in web-based drawing platforms that utilizes ResilientDB to ensure that user's drawings are securely stored, allowing for multiple users to collaborate and create new works of art and express ideas freely without any limits, tracking, or censorship.
            </Typography>
            <Typography variant="h5" gutterBottom>Key Features</Typography>
            <Typography component="div">
              <ul>
                <li>Real-time collaborative drawing with multiple users</li>
                <li>Persistent, secure storage of drawing data in ResilientDB allowing for censorship free expression</li>
                <li>Individual stroke-by-stroke caching using Redis for optimal performance</li>
                <li>Advanced drawing tools including shapes, colors, and brush sizes</li>
                <li>History recall functionality to view drawings from specific time periods</li>
                <li>Room-based access control for private and secure drawing sessions</li>
                <li>Decentralized architecture ensuring no single point of failure</li>
              </ul>
            </Typography>
            <Typography variant="h5" gutterBottom>Technology Stack</Typography>
            <Typography paragraph>
              ResCanvas combines cutting-edge blockchain technology with modern web frameworks:
            </Typography>
            <Typography component="div">
              <ul>
                <li><strong>Frontend:</strong> React.js with Material-UI for responsive design</li>
                <li><strong>Backend:</strong> Python Flask with Socket.IO for real-time communication</li>
                <li><strong>Database:</strong> ResilientDB for decentralized, secure data storage</li>
                <li><strong>Cache:</strong> Redis for high-performance stroke caching</li>
                <li><strong>Authentication:</strong> JWT tokens with ResVault integration</li>
              </ul>
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setBlogOpen(false)} color="primary" variant="contained">
              Close
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
      <Dialog open={forbiddenOpen} onClose={() => { setForbiddenOpen(false); navigate(forbiddenRedirect); }}>
        <DialogTitle>{forbiddenTitle}</DialogTitle>
        <DialogContent>
          <Typography>{forbiddenMessage}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setForbiddenOpen(false); navigate(forbiddenRedirect); }} autoFocus>OK</Button>
        </DialogActions>
      </Dialog>
    </ThemeProvider>
  );
}
