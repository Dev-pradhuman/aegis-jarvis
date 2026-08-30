import Icon from './Icon.jsx';
import '../styles/footer.css';

export default function StatusBar() {
  return (
    <footer className="statusbar hud-panel">
      <div className="sb-item">
        <span className="dot green"></span>
        <span className="lbl">SECURE MODE:</span>
        <span className="v" style={{ color: 'var(--green)' }}>ENABLED</span>
      </div>
      <div className="sb-item">
        <Icon name="lock" stroke="var(--orange)" />
        <span className="lbl">DATA PROTECTION:</span>
        <span className="v" style={{ color: 'var(--orange)' }}>ON</span>
      </div>
      <div className="sb-item">
        <Icon name="shield" stroke="var(--green)" />
        <span className="lbl">THREAT LEVEL:</span>
        <span className="v" style={{ color: 'var(--green)' }}>LOW</span>
      </div>
      <div className="sb-item">
        <Icon name="spark" stroke="var(--orange)" />
        <span className="lbl">AUTONOMY MODE:</span>
        <span className="v" style={{ color: 'var(--orange)' }}>ASSISTED</span>
      </div>
      <div className="sb-spacer"></div>
      <div className="sb-item" style={{ borderRight: 'none' }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2">
          <path d="M17 16a4 4 0 000-8 5 5 0 00-9.6-1A4.5 4.5 0 007 16h10z" />
          <path d="M3 3l18 18" stroke="var(--red)" />
        </svg>
        <span className="lbl">LOCAL SYSTEM:</span>
        <span className="v" style={{ color: 'var(--text-secondary)' }}>NO CLOUD SYNC</span>
      </div>
      <div className="sb-chevron">&raquo;</div>
    </footer>
  );
}
