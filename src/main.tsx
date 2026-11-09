import '@fontsource-variable/atkinson-hyperlegible-next';
import '@fontsource-variable/newsreader/opsz.css';
import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.cburnett.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/board.css';
import './styles/app.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
