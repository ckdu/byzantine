import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const Register: React.FC = () => {
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    // --- CLIENT-SIDE REGISTRATION SIMULATION ---
    // !! WARNING: This is NOT secure. Stores data in localStorage. !!
    if (!fullName || !username || !password) {
      setError('Please fill in all fields.');
      return;
    }

    try {
        // Check if username already exists (simple check)
        if (localStorage.getItem(`user_${username}`)) {
            setError('Username already taken (demo).');
            return;
        }
        // Store user data. In a real app, send to server.
        const userData = { fullName, username, password }; // Storing password here is VERY INSECURE, only for POC
        localStorage.setItem(`user_${username}`, JSON.stringify(userData));

        console.log('Simulated registration successful:', userData);
        // Redirect to login page after registration
        navigate('/login');

    } catch (e) {
        console.error("Error during registration simulation:", e);
        setError('An error occurred during registration simulation.');
    }
    // --- END SIMULATION ---
  };

  return (
    <div className="form-container">
      <h2>Register</h2>
      <form onSubmit={handleSubmit}>
        {error && <p className="error-message">{error}</p>}
        <div className="form-group">
          <label htmlFor="fullName">Full Name</label>
          <input
            type="text"
            id="fullName"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
          />
        </div>
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
        <button type="submit">Register</button>
      </form>
    </div>
  );
};

export default Register;