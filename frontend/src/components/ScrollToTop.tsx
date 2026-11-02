import { useEffect } from"react";
import { useLocation } from"react-router-dom";

export const ScrollToTop: React.FC = () => {
 const { pathname } = useLocation();

 useEffect(() => {
 // "instant": the stylesheet's `scroll-behavior: smooth` would make this a glide that can
 // still be running when a hash target (the landing sections) has already been jumped to,
 // ending the page back at the top.
 window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
 }, [pathname]);

 return null;
};
