import React from 'react';
import './App.css';
import Canvas from './Canvas';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';

function App() {
  return (
    <Box className="App">
      <AppBar position="static" className="AppBar">
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            React Canvas Drawing App
          </Typography>
          <Button color="inherit" className="App-button">
            Help
          </Button>
        </Toolbar>
      </AppBar>
      <Container className="Canvas-container">
        <Typography variant="h5" className="Canvas-title" gutterBottom>
          Start Drawing!
        </Typography>
        <Canvas />
      </Container>
    </Box>
  );
}

export default App;
