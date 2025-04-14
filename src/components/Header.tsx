import React from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import styles from './Header.module.css'; // We'll create this CSS module

const Header: React.FC = () => {
  const { user, logout, isLoading } = useAuth();

  // Don't show auth-dependent links until loading is complete
  const showAuthLinks = !isLoading;

  return (
    <header className={styles.header}>
      <div className={styles.container}>
        <Link to="/" className={styles.logo}>
          BYZANTINE MELODY
        </Link>
        <nav className={styles.nav}>
          <ul>
            {showAuthLinks && !user && (
              <>
                <li><NavLink to="/login" className={({ isActive }) => isActive ? styles.active : ''}>Login</NavLink></li>
                <li><NavLink to="/register" className={({ isActive }) => isActive ? styles.active : ''}>Register</NavLink></li>
              </>
            )}
             {/* Always show Psalms link, access is controlled by ProtectedRoute */}
            <li><NavLink to="/psalms" className={({ isActive }) => isActive ? styles.active : ''}>Psalms</NavLink></li>

            {showAuthLinks && user && (
              <li>
                <button onClick={logout} className={styles.logoutButton}>Logout ({user.username})</button>
              </li>
            )}
          </ul>
        </nav>
      </div>
    </header>
  );
};

export default Header;