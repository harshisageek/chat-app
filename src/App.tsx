import React from 'react';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './hooks/useAuth';
import { LoginPage } from './components/LoginPage';
import { ChatApp } from './components/ChatApp';
import './App.css';

const AppRouter: React.FC = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ height: '100vh', width: '100vw', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a' }}>
         <div className="animate-spin" style={{ width: 40, height: 40, border: '4px solid rgba(255,255,255,0.1)', borderTopColor: '#6366f1', borderRadius: '50%' }} />
      </div>
    );
  }

  return user ? <ChatApp /> : <LoginPage />;
};

function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
}

export default App;
