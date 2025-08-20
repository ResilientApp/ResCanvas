import React, { useState } from 'react';
import './App.css';

import theme from './theme';
import { ThemeProvider } from '@mui/material/styles';
import {
  AppBar,
  Avatar,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import { Link as RouterLink } from "react-router-dom";

import HelpIcon from '@mui/icons-material/Help';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DescriptionIcon from '@mui/icons-material/Description';
import AnalyticsIcon from '@mui/icons-material/Analytics';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';

import Canvas from './Canvas';
import { listRooms, createRoom } from './canvasBackend';
// import { useNavigate } from 'react-router-dom';


function App() {
  const [helpOpen, setHelpOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(true); // default true
  const [currentUsername, setCurrentUsername] = useState("");
  const [selectedUser, setSelectedUser] = useState("");
  const [userList, setUserList] = useState([]);
  const [expandedGroups, setExpandedGroups] = useState([]);
  const [usernameError, setUsernameError] = useState("");
  const [rulesOpen, setRulesOpen] = useState(false);
  const [showUserList, setShowUserList] = useState(true);
  const [hovering, setHovering] = useState(false);
  const [currentRoomId, setCurrentRoomId] = useState(null);
  const [roomsOpen, setRoomsOpen] = useState(false);
  const [rooms, setRooms] = useState([]);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomType, setNewRoomType] = useState('public');
  // const theme = useTheme();
  // const navigate = useNavigate();

  const handleHelpOpen = () => {
    setHelpOpen(true);
  };

  const handleHelpClose = () => {
    setHelpOpen(false);
  };

  const toggleGroup = (periodStart) => {
    setExpandedGroups(prev => {
      if (prev.includes(periodStart)) return prev.filter(p => p !== periodStart);
      return [...prev, periodStart];
    });
  };

  const formatDateMs = (ms) => {
    if (!ms) return "";

    const d = new Date(ms);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const year = d.getFullYear();

    let hour = d.getHours();
    const minute = String(d.getMinutes()).padStart(2, '0');
    const ampm = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12;

    if (hour === 0) hour = 12;

    const hourStr = String(hour).padStart(2, '0');
    return `${month}/${day}/${year} ${hourStr}:${minute} ${ampm}`;
  };

  const handleRedirect = () => {
    window.location.href = '/blog';
  };

  const validateUsername = (username) => {
    const usernameRegex = /^[a-zA-Z0-9_]{6,20}$/;
    return usernameRegex.test(username);
  };

  const handleLoginSubmit = (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget.form);
    const username = formData.get("username").trim();
    
    if (!validateUsername(username)) {
      setUsernameError("Username must be 6-20 characters long and contain only letters, numbers, and underscores.");
      return;
    }
    setUsernameError("");
    setCurrentUsername(username + "|" + Date.now());
    setLoginOpen(false);
  };


  const fetchRooms = async () => {
    try {
      const res = await listRooms(currentUsername);
      if (res && res.rooms) setRooms(res.rooms);
    } catch (e) { console.error(e); }
  };
  const openRooms = async () => {
    await fetchRooms();
    setRoomsOpen(true);
  };
  const handleCreateRoom = async () => {
    if (!newRoomName) return;
    const res = await createRoom({ name: newRoomName, type: newRoomType, currentUser: currentUsername });
    if (res && res.status === 'ok' && res.room) {
      setCurrentRoomId(res.room.id);
      setNewRoomName('');
      setNewRoomType('public');
      await fetchRooms();
    }
  };
  const handleSelectRoom = (rid) => {
    setCurrentRoomId(rid);
    setRoomsOpen(false);
  };
return (
    <ThemeProvider theme={theme}>
      <Box className="App" sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        <AppBar position="static" sx={{ flexShrink: 0}} >
          <Box
            sx={{
              minHeight: '100px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between', // Space between logo and greeting
              paddingLeft: 2,
              paddingRight: 3, 
              backgroundImage: `
                linear-gradient(rgba(0, 0, 0, 0.3), rgba(0, 0, 0, 0.3)),
                url('/toolbar/toolbar-bg.jpeg')
              `,
              backgroundPosition: 'center',
              backgroundSize: 'cover',
              backgroundRepeat: 'no-repeat',
              boxShadow: '0 6px 12px rgba(0, 0, 0, 0.3)', 
              zIndex: 10, // Optional but can help if content is overlapping
            }}
          >
            <img src="../logo.png" alt="ResCanvas Logo" style={{ height: '60px' }} />

            {currentUsername !== "" && (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  backgroundColor: 'rgba(0, 0, 0, 0.3)', // translucent dark background
                  padding: '18px 12px',
                  borderRadius: '20px',
                }}
              >
                <Avatar sx={{ bgcolor: 'secondary.main' }}>
                  {currentUsername.split("|")[0].charAt(0).toUpperCase()}
                </Avatar>
                <Typography variant="h6" component="div" color="white" sx={{fontWeight: 'bold'}}>
                  Hello, {currentUsername.split("|")[0]}
                </Typography>
                <Button variant="contained" color="secondary" onClick={openRooms} sx={{ ml: 2 }}>Rooms</Button>
              </Box>
            )}
          </Box>
        </AppBar>


        {/* Main Content Area */}
        <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {/* Main Content Fills the Entire Area */}
          <Box sx={{ 
            width: '100%', 
            height: '100%',
            overflow: 'auto'
          }}>
            <Canvas currentUser={currentUsername} setUserList={setUserList} selectedUser={selectedUser} setSelectedUser={setSelectedUser} currentRoomId={currentRoomId} />
          </Box>
          
          {/* Floating User List Sidebar */}
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
                  ? <ChevronRightIcon fontSize="small"/>
                  : <ChevronLeftIcon fontSize="small"/>}
              </IconButton>
            </Box>


            {/* Your existing Paper/List only when expanded */}
            {showUserList && (
              <Paper
                elevation={3}
                sx={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  borderRadius: '20px 0 0 20px',
                  overflow: 'hidden',
                  background: '#25D8C5',
                  pointerEvents: 'all',                 // reactivate clicks
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
                                <ListItemText primary={label} primaryTypographyProps={{ color: '#17635a', fontWeight: 'bold' }} />
                              </ListItemButton>
                            </ListItem>
                            {expanded && group.users.map((user, uidx) => {
                              const username = user.split("|")[0];
                              const isSelected = selectedUser && ((typeof selectedUser === 'string' && selectedUser === user) || (typeof selectedUser === 'object' && selectedUser.user === user && selectedUser.periodStart === group.periodStart));
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
                                    <ListItemText primary={username} primaryTypographyProps={{ color: '#17635a' }} />
                                  </ListItemButton>
                                </ListItem>
                              );
                            })}
                          </div>
                        );
                      } else {
                        // backward-compatible single user entries (fallback)
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
                              <ListItemText primary={username} primaryTypographyProps={{ color: '#17635a' }} />
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

        <Dialog
          open={loginOpen}
          onClose={() => { }}
          aria-labelledby="login-dialog"
          PaperProps={{
            component: 'form',
            onSubmit: (event) => {
              event.preventDefault();
              const formData = new FormData(event.currentTarget);
              const formJson = Object.fromEntries(formData.entries());
              const username = formJson.username.trim();
              // Only proceed if username is not empty
              if (username) {
                setCurrentUsername(username + "|" + Date.now());
                setLoginOpen(false);
              }
            },
            sx: { borderRadius: 2, p: 3, width: '100%', maxWidth: 400 }
          }}
        >
          <Box
            display="flex"
            flexDirection="column"
            alignItems="center"
            justifyContent="center"
          >
            <Avatar sx={{ m: 1, bgcolor: '#25D8C5', width: 56, height: 56 }}>
              <AccountCircleIcon sx={{ fontSize: 40 }} />
            </Avatar>
            <DialogTitle sx={{ fontWeight: 'bold', textAlign: 'center' }}>
              Set Your Username
            </DialogTitle>
            <DialogContent>
              <DialogContentText sx={{ textAlign: 'center', mb: 2 }}>
                Choose a username to identify your drawings. This will be associated with all your work for this session.
              </DialogContentText>
              <TextField
                autoFocus
                required
                margin="normal"
                id="name"
                name="username"
                label="Username"
                type="text"
                fullWidth
                variant="outlined"
                error={!!usernameError}
                helperText={usernameError}
              />
              <Button
                onClick={() => setRulesOpen(true)}
                sx={{
                  color: '#25D8C5',
                  '&:hover': { backgroundColor: 'rgba(37, 216, 197, 0.1)' },
                }}
              >Username Requirements</Button>
            </DialogContent>
            <DialogActions sx={{ justifyContent: 'center', mt: 1 }}>
              <Button variant="contained" type="submit" sx={{ px: 4, bgcolor: '#25D8C5' }} onClick={handleLoginSubmit}>
                Login
              </Button>
            </DialogActions>
            <Dialog open={rulesOpen} onClose={() => setRulesOpen(false)}>
              <DialogTitle>Username Requirements</DialogTitle>
              <DialogContent>
                <DialogContentText>
                  - Must be between 6 and 20 characters long.
                  <br />- Only letters, numbers, and underscores are allowed.
                  <br />- No spaces or special characters except underscores (_).
                  <br />- Usernames are case-sensitive.
                </DialogContentText>
              </DialogContent>
              <DialogActions>
                <Button onClick={() => setRulesOpen(false)} sx={{
                  color: '#25D8C5',
                  '&:hover': { backgroundColor: 'rgba(37, 216, 197, 0.1)' },
                }}>Close</Button>
              </DialogActions>
            </Dialog>
          </Box>
        </Dialog>
        <Dialog open={helpOpen} onClose={handleHelpClose} aria-labelledby="help-dialog-title">
          <DialogTitle id="help-dialog-title">
            How to Use the Drawing App</DialogTitle>
          <DialogContent>
            <Typography gutterBottom>
              Overview of our application:
            </Typography>
            <ul>
              <li>Click and drag on the canvas to draw.</li>
              <li>The drawn stroke will be saved into ResDB upon mouse button release.</li>
              <li>Use the color and line width options to customize your drawing.</li>
              <li>Push the clear canvas button to clear your drawing.</li>
              <li>To learn more about our decentralized drawing app,  <Button color="inherit" startIcon={<DescriptionIcon />} onClick={handleRedirect} sx={{ color:'inherit', marginLeft: 2}}>
              Visit our Blog
              </Button></li>
            </ul>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleHelpClose} sx={{ px: 4, bgcolor: '#25D8C5' }} variant="contained">
              Close
            </Button>
          </DialogActions>
        </Dialog>

        {/* Bottom Bar */}
        <AppBar position="static" sx={{ marginBottom: 0 }}>
          <Box
            sx={{
              minHeight: '85px',
              backgroundColor: '#1E232E',
              backgroundPosition: 'center',
              backgroundSize: 'cover',
              backgroundRepeat: 'no-repeat',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingX: 2,
              boxShadow: '0 -6px 12px rgba(0, 0, 0, 0.3)', 
              zIndex: 10, // Optional but can help if content is overlapping
            }}
          >
            {/* Left side content */}
            <Box sx={{ display: 'flex', alignItems: 'center', fontWeight: 'bold', color: '#25D8C5', marginRight: 2}}>
              <Button color="inherit" startIcon={<HelpIcon />} onClick={handleHelpOpen} sx={{color:'inherit'}}>
                Help
              </Button>
              <Button color="inherit" startIcon={<DescriptionIcon />} onClick={handleRedirect} sx={{ color:'inherit', marginLeft: 2}}>
                Blog
              </Button>

              <Button color="inherit" startIcon={<AnalyticsIcon />} component={RouterLink} to="/metrics" sx={{ color:'inherit', marginLeft: 2}}>
                Metrics
              </Button>
            </Box>

            {/* Right side logo */}
            <Box>
              <img src="../resdb_logo.png" alt="ResilientDB Logo" style={{ height: '60px' }} />
            </Box>
          </Box>
        </AppBar>
      </Box>

      <Dialog open={roomsOpen} onClose={() => setRoomsOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Canvas Rooms</DialogTitle>
        <DialogContent>
          <DialogContentText>Pick a room or create a new one.</DialogContentText>
          <Box sx={{ my: 2 }}>
            <Typography variant="subtitle2">Your Rooms</Typography>
            <List>
              {rooms.map(r => (
                <ListItem key={r.id} disablePadding secondaryAction={
                  <Button size="small" onClick={() => handleSelectRoom(r.id)}>Open</Button>
                }>
                  <ListItemText primary={`${r.name} • ${r.type}`} secondary={`Owner: ${r.owner}`} />
                </ListItem>
              ))}
              {rooms.length === 0 && <ListItem><ListItemText primary="No rooms yet." /></ListItem>}
            </List>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <TextField fullWidth label="New room name" value={newRoomName} onChange={(e)=>setNewRoomName(e.target.value)} />
            <FormControl sx={{ minWidth: 140 }}>
              <InputLabel id="room-type-label">Type</InputLabel>
              <Select labelId="room-type-label" label="Type" value={newRoomType} onChange={(e)=>setNewRoomType(e.target.value)}>
                <MenuItem value="public">Public</MenuItem>
                <MenuItem value="private">Private</MenuItem>
                <MenuItem value="secure">Secure</MenuItem>
              </Select>
            </FormControl>
            <Button onClick={handleCreateRoom} variant="contained">Create</Button>
          </Box>
          {currentRoomId && (
            <Box sx={{ mt:2 }}>
              <Typography variant="body2">Active room: <strong>{currentRoomId}</strong></Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={()=>setRoomsOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

    </ThemeProvider>
  );
}

export default App;