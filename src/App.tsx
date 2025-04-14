import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import Header from './components/Header';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import Psalms from './pages/Psalms';
import ProtectedRoute from './components/ProtectedRoute';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
            <Route path="/*" element={<MainLayout />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

// Helper component to include Header on specific routes
const MainLayout = () => (
  <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
    <Header />
    <main className="container">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/psalms"
          element={
            <ProtectedRoute>
              <Psalms />
            </ProtectedRoute>
          }
        />
        {/* Add a 404 or redirect route if needed inside MainLayout */}
         <Route path="*" element={<div>404 Not Found</div>} />
      </Routes>
    </main>
    {/* Optional Footer could go here */}
  </div>
);


export default App;