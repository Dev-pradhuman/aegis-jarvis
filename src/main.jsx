import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles/variables.css';
import './styles/reset.css';
import './styles/typography.css';
import './styles/hud.css';
import './styles/animations.css';
import './styles/layout.css';
import './styles/responsive.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
