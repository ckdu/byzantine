import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactElement;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    // Show a loading indicator or null while checking auth status
    // This prevents redirecting before auth state is confirmed
    return <div className="loading-message">Loading authentication...</div>;
  }

  if (!user) {
    // Redirect them to the /login page, but save the current location they were
    // trying to go to. This allows us to send them back after login.
    // Pass the current path as state to the login route.
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // If the user is logged in (and not loading), render the children components (the protected page)
  return children;
};

export default ProtectedRoute;