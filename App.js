import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';

// Layout Components
import Sidebar from './components/Layout/Sidebar';
import TopBar from './components/Layout/TopBar';
import VoiceAssistant from './components/Layout/VoiceAssistant';

// Auth Pages
import Login from './components/Auth/Login';
import Register from './components/Auth/Register';

// Main Pages
import Dashboard from './components/Pages/Dashboard';
import Inventory from './components/Pages/Inventory';
import Warehouses from './components/Pages/Warehouses';
import SmartReceive from './components/Pages/SmartReceive';
import SmartShip from './components/Pages/SmartShip';
import AddProduct from './components/Pages/AddProduct';
import AddWarehouse from './components/Pages/AddWarehouse';
import Movements from './components/Pages/Movements';
import Reports from './components/Pages/Reports';
import Users from './components/Pages/Users';
import AuditLog from './components/Pages/AuditLog';
import QualityCheck from './components/Pages/QualityCheck';
import InspectionLog from './components/Pages/InspectionLog';
import AIAssistant from './components/Pages/AIAssistant';
import './App.css';

const PrivateRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen">Loading...</div>;
  return user ? children : <Navigate to="/login" />;
};

// ✅ Layout with TopBar (Only for Dashboard)
const LayoutWithTopBar = ({ children }) => {
  return (
    <div className="app-layout">
      <Sidebar />
      <div className="main-content">
        <TopBar />
        {children}
        <VoiceAssistant />
      </div>
    </div>
  );
};

// ✅ Layout WITHOUT TopBar (For all other pages)
const LayoutWithoutTopBar = ({ children }) => {
  return (
    <div className="app-layout">
      <Sidebar />
      <div className="main-content">
        {children}
        <VoiceAssistant />
      </div>
    </div>
  );
};

function App() {
  return (
    <Router>
      <AuthProvider>
        <NotificationProvider>
          <Routes>
            {/* Public Routes - No Sidebar */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            
            {/* Dashboard - WITH TopBar */}
            <Route path="/dashboard" element={
              <PrivateRoute>
                <LayoutWithTopBar><Dashboard /></LayoutWithTopBar>
              </PrivateRoute>
            } />
            
            {/* All Other Pages - WITHOUT TopBar */}
            <Route path="/inventory" element={
              <PrivateRoute>
                <LayoutWithoutTopBar><Inventory /></LayoutWithoutTopBar>
              </PrivateRoute>
            } />
            <Route path="/warehouses" element={
              <PrivateRoute>
                <LayoutWithoutTopBar><Warehouses /></LayoutWithoutTopBar>
              </PrivateRoute>
            } />
            <Route path="/movements" element={
              <PrivateRoute>
                <LayoutWithoutTopBar><Movements /></LayoutWithoutTopBar>
              </PrivateRoute>
            } />
            <Route path="/reports" element={
              <PrivateRoute>
                <LayoutWithoutTopBar><Reports /></LayoutWithoutTopBar>
              </PrivateRoute>
            } />
            <Route path="/receive" element={
              <PrivateRoute>
                <LayoutWithoutTopBar><SmartReceive /></LayoutWithoutTopBar>
              </PrivateRoute>
            } />
            <Route path="/ship" element={
              <PrivateRoute>
                <LayoutWithoutTopBar><SmartShip /></LayoutWithoutTopBar>
              </PrivateRoute>
            } />
            <Route path="/add-product" element={
              <PrivateRoute>
                <LayoutWithoutTopBar><AddProduct /></LayoutWithoutTopBar>
              </PrivateRoute>
            } />
            <Route path="/add-warehouse" element={
              <PrivateRoute>
                <LayoutWithoutTopBar><AddWarehouse /></LayoutWithoutTopBar>
              </PrivateRoute>
            } />
            <Route path="/users" element={
              <PrivateRoute>
                <LayoutWithoutTopBar><Users /></LayoutWithoutTopBar>
              </PrivateRoute>
            } />
            <Route path="/audit" element={
              <PrivateRoute>
                <LayoutWithoutTopBar><AuditLog /></LayoutWithoutTopBar>
              </PrivateRoute>
            } />
            <Route path="/quality-check" element={
              <PrivateRoute>
                <LayoutWithoutTopBar><QualityCheck /></LayoutWithoutTopBar>
              </PrivateRoute>
            } />
            <Route path="/inspection-log" element={
              <PrivateRoute>
                <LayoutWithoutTopBar><InspectionLog /></LayoutWithoutTopBar>
              </PrivateRoute>
            } />
            <Route path="/ai-assistant" element={
              <PrivateRoute>
                <LayoutWithoutTopBar><AIAssistant /></LayoutWithoutTopBar>
              </PrivateRoute>
            } />
            
            {/* Default Route */}
            <Route path="/" element={<Navigate to="/dashboard" />} />
          </Routes>
        </NotificationProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;