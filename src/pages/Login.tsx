import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  // Get the location to redirect to after login, default to home
  const from = location.state?.from?.pathname || "/";

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(''); // Clear previous errors

    // --- CLIENT-SIDE AUTH SIMULATION ---
    // !! WARNING: This is NOT secure. Real apps need server validation. !!
    // For POC, we accept any non-empty username/password
    // and assume a 'registered' user exists in localStorage (or just make one up).

    if (!username || !password) {
      setError('Please enter username and password.');
      return;
    }

    // Simulate successful login. In a real app, you'd fetch this from a server.
    // We'll retrieve the full name from localStorage if the user registered,
    // otherwise, we'll just make one up for the demo.
    let fullName = "Demo User"; // Default
    try {
      const potentialUser = localStorage.getItem(`user_${username}`);
      if (potentialUser) {
        const userData = JSON.parse(potentialUser);
        // Basic check if it looks like our stored user data
        if (userData && userData.fullName && userData.password === password) {
             fullName = userData.fullName;
        } else if (potentialUser && password === 'password') { // Fallback for simple demo
            fullName = "Demo User"; // Or parse if stored differently
        } else {
             // If user exists but password doesn't match (for demo)
             setError('Invalid username or password (demo).');
             return;
        }
      } else if (password !== 'password') {
          // If user doesn't exist in storage and password isn't the generic 'password'
          setError('User not found or invalid password (demo).');
          return;
      }
       // If user not in storage, but used generic 'password', allow login as Demo User
       // Or if user was found and password matched

    } catch (e) {
      console.error("Error accessing user storage during login simulation:", e);
      setError('An error occurred during login simulation.');
      return;
    }

    // Call the login function from AuthContext
    login({ fullName: fullName, username: username });

    // Redirect to the page the user originally tried to access, or home
    navigate(from, { replace: true });
    // --- END SIMULATION ---
  };

  return (
    <div className="form-container">
      <h2>Login</h2>
      <form onSubmit={handleSubmit}>
        {error && <p className="error-message">{error}</p>}
        <div className="form-group">
          <label htmlFor="username">Username</label>
          <input
            type="text"
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="password">Password</label>
          <input
            type="password"
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <button type="submit">Login</button>
      </form>
    </div>
  );
};

export default Login;