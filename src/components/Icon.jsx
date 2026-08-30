// Icon paths are kept as raw SVG markup strings (mirroring the original
// vanilla-JS build) so the whole icon set can live in one small table
// instead of dozens of near-identical JSX files.
export const ICONS = {
  overview: '<path d="M3 12l9-9 9 9M5 10v10h14V10"/>',
  chat: '<path d="M4 5h16v11H8l-4 4V5z"/>',
  brain:
    '<path d="M9 3a3 3 0 00-3 3 3 3 0 00-2 5 3 3 0 002 5 3 3 0 003 3M15 3a3 3 0 013 3 3 3 0 012 5 3 3 0 01-2 5 3 3 0 01-3 3M9 3v16M15 3v16"/>',
  tasks: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  approvals: '<path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6l8-4z"/><path d="M9 12l2 2 4-4"/>',
  connections:
    '<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8 6h8M8 18h8M6 8v8M18 8v8"/>',
  workflows: '<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8 6h6a4 4 0 014 4v4"/>',
  goals: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  agents: '<circle cx="12" cy="8" r="3"/><path d="M5 21c0-4 3-6 7-6s7 2 7 6"/>',
  skills: '<path d="M12 2l2.5 6.5L21 11l-6.5 2.5L12 20l-2.5-6.5L3 11l6.5-2.5z"/>',
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 00-.2-1.6l2-1.5-2-3.4-2.3.9a7 7 0 00-2.8-1.6L13.3 2h-4l-.4 2.8A7 7 0 006.1 6.4l-2.3-.9-2 3.4 2 1.5A7 7 0 003.6 12c0 .5 0 1 .2 1.6l-2 1.5 2 3.4 2.3-.9c.8.7 1.8 1.3 2.8 1.6l.4 2.8h4l.4-2.8a7 7 0 002.8-1.6l2.3.9 2-3.4-2-1.5c.1-.5.2-1 .2-1.6z"/>',
  send: '<path d="M4 12h15M13 6l6 6-6 6"/>',
  newTask: '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M12 8v8M8 12h8"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/>',
  code: '<path d="M8 8l-4 4 4 4M16 8l4 4-4 4"/>',
  terminal: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M7 9l3 3-3 3M13 15h4"/>',
  files: '<path d="M3 7h6l2 2h10v10H3V7z"/>',
  notes: '<path d="M6 3h9l5 5v13H6V3z"/><path d="M14 3v5h5"/>',
  scan: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
  voice: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/>',
  screenshot: '<rect x="3" y="6" width="18" height="13" rx="1"/><path d="M8 6l2-2h4l2 2"/><circle cx="12" cy="12.5" r="3.5"/>',
  shield: '<path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6l8-4z"/>',
  shieldCheck: '<path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6l8-4z"/><path d="M9 12l2 2 4-4"/>',
  lock: '<rect x="5" y="10" width="14" height="10" rx="1"/><path d="M8 10V7a4 4 0 018 0v3"/>',
  spark: '<path d="M12 2l2.5 6.5L21 11l-6.5 2.5L12 20l-2.5-6.5L3 11l6.5-2.5z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M3 6l9 6 9-6"/>',
  circleCheck: '<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>',
  noCloud: '<path d="M17 16a4 4 0 000-8 5 5 0 00-9.6-1A4.5 4.5 0 007 16h10z"/><path d="M3 3l18 18"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="1"/><path d="M8 3v4M16 3v4M4 10h16"/>',
};

export default function Icon({ name, className, stroke = 'currentColor', strokeWidth = 1.8 }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: ICONS[name] || '' }}
    />
  );
}
