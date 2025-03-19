import React, { useEffect, useState } from 'react';
import './App.css';
import { useTheme } from '@mui/material/styles';
import Canvas from './Canvas';
import { AppBar, Box, Grid, Toolbar, Typography, Button, Container, Dialog, DialogActions, DialogContent, DialogTitle, DialogContentText, TextField, Paper, List, ListItem, ListItemButton, ListItemText, Divider, useMediaQuery, Avatar } from '@mui/material';
import HelpIcon from '@mui/icons-material/Help';
import PeopleIcon from '@mui/icons-material/People';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
// import { useNavigate } from 'react-router-dom';

function App() {
  const [helpOpen, setHelpOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);　// default true
  const [currentUsername, setCurrentUsername] = useState("")
  const [selectedUser, setSelectedUser] = useState("")
  const [userList, setUserList] = useState([])
  const [usernameError, setUsernameError] = useState("");
  const [rulesOpen, setRulesOpen] = useState(false);

  const theme = useTheme();
  // const navigate = useNavigate();

  const handleHelpOpen = () => {
    setHelpOpen(true);
  };

  const handleHelpClose = () => {
    setHelpOpen(false);
  };

  const handleRedirect = () => {
    // Using React Router
    // navigate('/new-page');
    // Or: 
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

  return (
    <Box className="App" sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppBar position="static" sx={{ flexShrink: 0 }}>
        <Box
          sx={{
            minHeight: '100px',
            backgroundImage: "url('/toolbar/toolbar-bg.jpeg')",
            backgroundColor: 'lightgray',
            backgroundPosition: 'center',
            backgroundSize: 'cover',
            backgroundRepeat: 'no-repeat',
            display: 'flex',
            alignItems: 'center',
            paddingLeft: 2, // adds some left spacing
          }}
          >
          {currentUsername !== "" &&
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Avatar sx={{ bgcolor: 'secondary.main' }}>
                {currentUsername.split("|")[0].charAt(0).toUpperCase()}
              </Avatar>
              <Typography variant="h6" component="div">
                Hello, {currentUsername.split("|")[0]}
              </Typography>
            </Box>
          }
          <img src="../logo.png" alt="ResCanvas Logo" style={{ height: '60px' }} />
        </Box>
      </AppBar>

      {/* Main Content Area */}
      <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <Container maxWidth="xl" sx={{ paddingY: 2, height: '100%' }}>
          <Grid container spacing={2} sx={{ height: '100%' }}>
            {/* Canvas Area */}
            <Grid item xs={12} md={1} sx={{ height: '100%' }}>
              <Paper elevation={3} className="user-list"
                sx={{ 
                  height: '100%', 
                  borderRadius: 7, 
                  padding: 2, 
                  overflowY: 'auto',
                  background: '#25D8C5'
                  }}>
                <Box display="flex" alignItems="center" mb={1}
                  sx={{
                    borderRadius: '20px 20px 0 0', // top-left, top-right, bottom-right, bottom-left
                    overflow: 'hidden',
                    minHeight: '70px',
                    backgroundImage: "url('/toolbar/toolbar-bg.jpeg')",
                    backgroundPosition: 'center',
                    backgroundSize: 'cover',
                    backgroundRepeat: 'no-repeat',
                    display: 'flex',
                    alignItems: 'center'
                  }} >
                </Box>
              </Paper>
            </Grid>
            <Grid item xs={12} md={9} sx={{ height: '100%' }}>
              <Paper elevation={3} 
                sx={{ 
                  height: '100%', 
                  display: 'flex', 
                  flexDirection: 'column', 
                  borderRadius: 2,
                  background: '#25D8C5',
                  padding: 2 }}>
                <Box sx={{ flex: 1, overflow: 'auto', position: 'relative' }}>
                  <Canvas currentUser={currentUsername} setUserList={setUserList} selectedUser={selectedUser} setSelectedUser={setSelectedUser} />
                </Box>
              </Paper>
            </Grid>

            {/* User List */}
            <Grid item xs={12} md={2} sx={{ height: '100%' }}>
              <Paper elevation={3} className="user-list"
                sx={{ 
                  height: '100%', 
                  borderRadius: 7, 
                  padding: 2, 
                  overflowY: 'auto',
                  background: '#25D8C5'
                  }}>
                <Box display="flex" alignItems="center" mb={1}
                  sx={{
                    borderRadius: '20px 20px 0 0', // top-left, top-right, bottom-right, bottom-left
                    overflow: 'hidden',
                    minHeight: '70px',
                    backgroundImage: "url('/toolbar/toolbar-bg.jpeg')",
                    backgroundPosition: 'center',
                    backgroundSize: 'cover',
                    backgroundRepeat: 'no-repeat',
                    display: 'flex',
                    alignItems: 'center'
                  }} >
                </Box>
                <List>
                  {userList && userList.map((user, index) => {
                    const username = user.split("|")[0];
                    const isSelected = selectedUser === user;
                    return (
                      <ListItem key={index} disablePadding>
                        <ListItemButton
                          onClick={() => setSelectedUser(isSelected ? "" : user)}
                          selected={isSelected}
                          sx={{
                            borderRadius: 1,
                            '&.Mui-selected': {
                              backgroundColor: theme.palette.action.hover
                            }
                          }}
                        >
                          <Avatar sx={{ bgcolor: theme.palette.primary.light, mr: 2 }}>
                            {username.charAt(0).toUpperCase()}
                          </Avatar>
                          <ListItemText primary={username} />
                        </ListItemButton>
                      </ListItem>
                    );
                  })}
                </List>
              </Paper>
            </Grid>
          </Grid>
        </Container>
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
          <Avatar sx={{ m: 1, bgcolor: 'primary.main', width: 56, height: 56 }}>
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
            <Button onClick={() => setRulesOpen(true)} color="primary">Username Requirements</Button>
          </DialogContent>
          <DialogActions sx={{ justifyContent: 'center', mt: 1 }}>
            <Button variant="contained" type="submit" sx={{ px: 4 }} onClick={handleLoginSubmit}>
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
              <Button onClick={() => setRulesOpen(false)} color="primary">Close</Button>
            </DialogActions>
          </Dialog>
        </Box>
      </Dialog>
      <Dialog open={helpOpen} onClose={handleHelpClose} aria-labelledby="help-dialog-title">
        <DialogTitle id="help-dialog-title">How to Use the Drawing App</DialogTitle>
        <DialogContent>
          <Typography variant="body1" gutterBottom>
            Overview of our application:
          </Typography>
          <ul>
            <li>Click and drag on the canvas to draw.</li>
            <li>The drawn stroke will be saved into ResDB upon mouse button release.</li>
            <li>Use the color and line width options to customize your drawing.</li>
            <li>Push the clear canvas button to clear your drawing.</li>
            <li>To learn more about our decentralized drawing app, visit our blog <a href="http://67.181.112.179:10008/blog" target="_blank" rel="noopener noreferrer">here</a>.</li>
          </ul>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleHelpClose} color="primary" variant="contained">
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
          }}
        >
          {/* Left side content */}
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Typography variant="h6" component="div" sx={{ fontWeight: 'bold', color: '#fff', marginRight: 2 }}>
              ResCanvas
            </Typography>
            <Button color="inherit" startIcon={<HelpIcon />} onClick={handleHelpOpen}>
              Help
            </Button>
            <Button color="inherit" onClick={handleRedirect} sx={{ marginLeft: 2 }}>
              Blog
            </Button>
          </Box>

          {/* Right side logo */}
          <Box>
            <img src="../resdb_logo.png" alt="ResilientDB Logo" style={{ height: '60px' }} />
          </Box>
        </Box>
      </AppBar>
    </Box>
  );
}

export default App;
