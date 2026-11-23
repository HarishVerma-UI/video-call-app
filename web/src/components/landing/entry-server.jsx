// Build-time only (see vite.config.ts → prerenderLanding): renders each public
// landing page to static HTML so search engines and link previews get the full
// content without running JavaScript. The browser then renders the same page
// with React as usual.
import { renderToString } from 'react-dom/server';
import Landing, { FAQ_ITEMS } from './Landing.jsx';
import { LANDING_ROUTES } from './routes.js';

export { FAQ_ITEMS, LANDING_ROUTES };

export function render(path) {
  return renderToString(<Landing initialPath={path} />);
}
