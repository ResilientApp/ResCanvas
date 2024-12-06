import React, { useState } from 'react';
import './App.css';
import Canvas from './Canvas';
import {AppBar, Box, Grid, Toolbar, Typography, Button, Container, Dialog, DialogActions, DialogContent, DialogTitle, DialogContentText, TextField, Paper, List, ListItem, ListItemButton, ListItemText} from '@mui/material';

function App() {
  const [helpOpen, setHelpOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(true);
  const [currentUsername, setCurrentUsername] = useState("")

  const [selectedUser, setSelectedUser] = useState("")

  const [userList, setUserList] = useState([])

  const handleHelpOpen = () => {
    setHelpOpen(true);
  };

  const handleHelpClose = () => {
    setHelpOpen(false);
  };

  return (
    <Box className="App">
      <AppBar position="static" className="AppBar">
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            React Canvas Drawing App
          </Typography>
          <Button color="inherit" className="App-button" onClick={handleHelpOpen}>
            Help
          </Button>
        </Toolbar>
      </AppBar>
      <Container className='main-container'>
        <Canvas currentUser={currentUsername} setUserList={setUserList} selectedUser={selectedUser}/>
        {/* <div className='Canvas-container' >
          <div>User List</div>
          {userList && userList.map((user) => <div>{user.split("|")[0]}</div> )}
        </div> */}
        <Paper elevation={3} style={{ padding: '16px', margin: 'auto', borderRadius: "12px" }}>
          <Typography variant="h5" gutterBottom>
            User List
          </Typography>
          <List>
            {userList && userList.map((user, index) => (
              <ListItem key={index} disablePadding>
                <ListItemButton onClick={() => setSelectedUser(selectedUser === user ? "" : user)} selected={selectedUser === user}>
                  <ListItemText primary={user.split("|")[0]} />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Paper>
      </Container>
      <Dialog 
        open={loginOpen} 
        onClose={()=>{}} 
        aria-labelledby="login-dialog"
        PaperProps={{
          component: 'form',
          onSubmit: (event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            const formJson = Object.fromEntries(formData.entries());
            const username = formJson.username;
            console.log(username  + "|" + Date.now());
            setCurrentUsername(username + "|" + Date.now());
            setLoginOpen(false)
          },
        }}
      >
      <DialogTitle>Username</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Add a username to associate your drawings to you
          </DialogContentText>
          <TextField
            autoFocus
            required
            margin="dense"
            id="name"
            name="username"
            label="Username"
            type="text"
            fullWidth
            variant="standard"
          />
        </DialogContent>
        <DialogActions>
          <Button type="submit">Login</Button>
        </DialogActions>
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
            <li>To learn more about our decentralized drawing app, visit our blog here: .</li>
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
