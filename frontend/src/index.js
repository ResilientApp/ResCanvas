import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import RoomSettings from './pages/RoomSettings';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import reportWebVitals from './reportWebVitals';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Blog from './Blog';
import MetricsDashboard from './MetricsDashboard'
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<App />} /> {/* 默认页面 */}
      <Route path="/blog" element={<Blog />} /> {/* 新页面 */}
      <Route path="/metrics" element={<MetricsDashboard />} />

    
      <Route path="/login" element={<Login/>} />
      <Route path="/register" element={<Register/>} />
      <Route path="/dashboard" element={<Dashboard/>} />
</Routes>
  </BrowserRouter>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
