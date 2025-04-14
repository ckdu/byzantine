import React, { createContext, useState, useContext, ReactNode, useEffect } from 'react';

interface User {
  fullName: string;
  username: string;
}

interface AuthContextType {
  user: User | null;
  login: (user: User) => void;
  logout: () => void;
  isLoading: boolean; // To handle initial loading from localStorage
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// !! IMPORTANT !!
// This uses localStorage for the POC to persist login across refreshes.
// This is NOT secure for a real application. Authentication MUST be handled server-side.
const LOCAL_STORAGE_KEY = 'byzantine_auth_user';

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true); // Start loading

  useEffect(() => {
    // Try to load user from localStorage on initial mount
    try {
        const storedUser = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (storedUser) {
          setUser(JSON.parse(storedUser));
        }
    } catch (error) {
        console.error("Failed to parse user from localStorage", error);
        localStorage.removeItem(LOCAL_STORAGE_KEY); // Clear invalid data
    } finally {
        setIsLoading(false); // Finished loading attempt
    }
  }, []);

  const login = (loggedInUser: User) => {
    setUser(loggedInUser);
    try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(loggedInUser));
    } catch (error) {
        console.error("Failed to save user to localStorage", error);
    }
  };

  const logout = () => {
    setUser(null);
    try {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
    } catch (error) {
        console.error("Failed to remove user from localStorage", error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};