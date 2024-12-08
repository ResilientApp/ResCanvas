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
  const [loginOpen, setLoginOpen] = useState(true);
  const [currentUsername, setCurrentUsername] = useState("")
  const [selectedUser, setSelectedUser] = useState("")
  const [userList, setUserList] = useState([])
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

  return (
    <Box className="App">
      <AppBar position="static" sx={{ marginBottom: 2 }}>
        <Toolbar sx={{ display: 'flex', alignItems: 'center' }}>
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

          {/* Center Section: App Title */}
          <Typography
            variant="h6"
            component="div"
            sx={{
              flexGrow: 1,
              textAlign: 'center',
              fontWeight: 'bold'
            }}
          >
            ResCanvas
          </Typography>

          {/* Right Section: Help Button */}
          <Button
            color="inherit"
            startIcon={<HelpIcon />}
            onClick={handleHelpOpen}
          >
            Help
          </Button>

          {/* New Redirect Button */}
          <Button
            color="inherit"
            onClick={handleRedirect}
            sx={{ marginLeft: 2 }}
          >
            Blog
          </Button>
        </Toolbar>
      </AppBar>
      <Container maxWidth="xl" sx={{ paddingY: 2 }}>
        <Grid container spacing={2}>
          {/* Canvas Area */}
          <Grid item xs={12} md={9} p={0}>
            <Paper elevation={3} sx={{ borderRadius: 2, padding: 2, display: 'flex', flexDirection: 'column' }}>
              <Typography variant="h5" gutterBottom>
                Drawing Area
              </Typography>
              <Divider />
              <Box sx={{ flexGrow: 1, overflow: 'auto', position: 'relative' }}>
                <Canvas currentUser={currentUsername} setUserList={setUserList} selectedUser={selectedUser} setSelectedUser={setSelectedUser} />
              </Box>
            </Paper>
          </Grid>

          {/* User List */}
          <Grid item xs={12} md={3}>
            <Paper
              elevation={3}
              sx={{ borderRadius: 2, padding: 2, maxHeight: '80vh', overflowY: 'auto' }}
              className="scrollable-paper"
            >
              <Box display="flex" alignItems="center" mb={1}>
                <PeopleIcon sx={{ mr: 1 }} />
                <Typography variant="h6" gutterBottom>
                  User List
                </Typography>
              </Box>
              <Divider sx={{ mb: 1 }} />
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
            />
          </DialogContent>
          <DialogActions sx={{ justifyContent: 'center', mt: 1 }}>
            <Button variant="contained" type="submit" sx={{ px: 4 }}>
              Login
            </Button>
          </DialogActions>
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
    </Box>
  );
}

export default App;
