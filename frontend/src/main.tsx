import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './lib/i18n'
import App from './App.tsx'
import { AppErrorBoundary } from './components/common/AppErrorBoundary'
import { preloadPrerenderedPage } from './prerender/takeover'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('index.html has no #root element to mount the app into')

// The app replaces the root's content on its first commit, so a prerendered page (the blog)
// is kept until that commit can already show the live page.
void preloadPrerenderedPage(rootElement, window.location.pathname).then(() => {
 createRoot(rootElement).render(
 <StrictMode>
 <AppErrorBoundary>
 <App />
 </AppErrorBoundary>
 </StrictMode>,
 )
})
