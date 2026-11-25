import { useEffect, useRef } from"react";
import { useLocation } from"react-router-dom";

export const ScrollToTop: React.FC = () => {
 const { pathname } = useLocation();
 const previousPathname = useRef(pathname);

 useEffect(() => {
 // Only on navigation. On first load the position is the browser's: a prerendered page can
 // already be scrolled by the time the app mounts, and must not jump back to the top.
 if (previousPathname.current === pathname) return;
 previousPathname.current = pathname;
 // "instant": the stylesheet's `scroll-behavior: smooth` would make this a glide that can
 // still be running when a hash target (the landing sections) has already been jumped to,
 // ending the page back at the top.
 window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
 }, [pathname]);

 return null;
};
