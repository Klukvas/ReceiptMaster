import { useEffect } from 'react';
import { LandingPage } from './LandingPage';

export const HomePage = () => {
  useEffect(() => {
    // Add smooth scroll behavior
    document.documentElement.style.scrollBehavior = 'smooth';
    
    return () => {
      document.documentElement.style.scrollBehavior = 'auto';
    };
  }, []);

  return <LandingPage />;
};