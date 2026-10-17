import { useEffect, useMemo, useState } from 'react';
import { pollWithBackoff } from '../hooks/pollWithBackoff.js';
import Icon from './Icon.jsx';
import '../styles/reminders.css';

function formatClockTime(date) {
  return date.toTimeString().slice(0, 8);
}

function formatClockDate(date) {
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
}

function toLocalDateString(dateObj) {
  const d = new Date(dateObj);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function RemindersPanel({ compact = false }) {
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [overview, setOverview] = useState({ reminders: [], ringingReminders: [], calendarEvents: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [syncingCalendar, setSyncingCalendar] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [category, setCategory] = useState('reminder');
  const [repeat, setRepeat] = useState('none');

  // Filter & Navigation
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'reminders' | 'calendar'
  const [selectedDate, setSelectedDate] = useState(null); // 'YYYY-MM-DD' or null
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());
  const [calYear, setCalYear] = useState(() => new Date().getFullYear());

  // 1. Clock ticker
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 2. Poll schedule overview
  const fetchOverview = async (signal, refresh = false) => {
    const url = refresh ? '/api/schedule/overview?refresh=1' : '/api/schedule/overview';
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`Schedule unavailable (${res.status})`);
    const data = await res.json();
    setOverview({
      reminders: Array.isArray(data.reminders) ? data.reminders : [],
      ringingReminders: Array.isArray(data.ringingReminders) ? data.ringingReminders : [],
      calendarEvents: Array.isArray(data.calendarEvents) ? data.calendarEvents : []
    });
    setError('');
  };

  useEffect(() => {
    return pollWithBackoff(
      (signal) => fetchOverview(signal),
      { connectedMs: 5000, errorMs: 15000, onError: (err) => setError(err.message) }
    );
  }, []);

  // 3. Quick timer action
  const handleQuickTimer = async (minutes) => {
    setBusy(true);
    setError('');
    const target = new Date(Date.now() + minutes * 60_000).toISOString();
    try {
      const res = await fetch('/api/schedule/reminders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: `${minutes}m Timer`,
          dueAt: target,
          category: 'timer',
          repeat: 'none'
        })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to set timer');
      await fetchOverview(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // 4. Create custom reminder / timer / alarm
  const handleCreate = async (e) => {
    e.preventDefault();
    if (!title.trim() || !dueAt) return;
    setBusy(true);
    setError('');
    try {
      const targetIso = new Date(dueAt).toISOString();
      const res = await fetch('/api/schedule/reminders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          dueAt: targetIso,
          category,
          repeat
        })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to create reminder');
      setTitle('');
      setDueAt('');
      await fetchOverview(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // 5. Update reminder state (complete, dismiss, snooze)
  const handleAction = async (id, action, snoozeMinutes = 10) => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/schedule/reminders/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, snoozeMinutes })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Action failed');
      await fetchOverview(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // 6. Delete reminder
  const handleDelete = async (id) => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/schedule/reminders/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Delete failed');
      await fetchOverview(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // 7. Sync Google Calendar
  const handleSyncCalendar = async () => {
    setSyncingCalendar(true);
    setError('');
    try {
      await fetchOverview(null, true);
    } catch (err) {
      setError(`Sync failed: ${err.message}`);
    } finally {
      setSyncingCalendar(false);
    }
  };

  // Calendar dates computation
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(calYear, calMonth, 1).getDay();

  const prevMonth = () => {
    if (calMonth === 0) {
      setCalMonth(11);
      setCalYear((y) => y - 1);
    } else {
      setCalMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (calMonth === 11) {
      setCalMonth(0);
      setCalYear((y) => y + 1);
    } else {
      setCalMonth((m) => m + 1);
    }
  };

  const goToToday = () => {
    const today = new Date();
    setCalMonth(today.getMonth());
    setCalYear(today.getFullYear());
    setSelectedDate(toLocalDateString(today));
  };

  // Map events to date strings
  const eventDatesMap = useMemo(() => {
    const map = new Map();
    for (const r of overview.reminders) {
      if (r.dueAt) {
        const dStr = toLocalDateString(r.dueAt);
        map.set(dStr, { ...(map.get(dStr) || {}), hasReminder: true });
      }
    }
    for (const ev of overview.calendarEvents) {
      const start = ev.start?.dateTime || ev.start?.date || ev.startTime;
      if (start) {
        const dStr = toLocalDateString(start);
        map.set(dStr, { ...(map.get(dStr) || {}), hasCalendar: true });
      }
    }
    return map;
  }, [overview.reminders, overview.calendarEvents]);

  // Unified items list
  const unifiedItems = useMemo(() => {
    const list = [];
    const showReminders = activeTab === 'all' || activeTab === 'reminders';
    const showCalendar = activeTab === 'all' || activeTab === 'calendar';

    if (showReminders) {
      for (const r of overview.reminders) {
        const itemDateStr = r.dueAt ? toLocalDateString(r.dueAt) : null;
        if (selectedDate && itemDateStr !== selectedDate) continue;
        list.push({
          id: r.id,
          title: r.title,
          time: r.dueAt ? new Date(r.dueAt).getTime() : 0,
          dueAtStr: r.dueAt ? new Date(r.dueAt).toLocaleString() : '',
          category: r.category || 'reminder',
          repeat: r.repeat || 'none',
          status: r.status,
          ringing: Boolean(r.ringing),
          type: 'reminder',
          raw: r
        });
      }
    }

    if (showCalendar) {
      for (const ev of overview.calendarEvents) {
        const start = ev.start?.dateTime || ev.start?.date || ev.startTime;
        const itemDateStr = start ? toLocalDateString(start) : null;
        if (selectedDate && itemDateStr !== selectedDate) continue;
        list.push({
          id: ev.id || `cal-${Math.random()}`,
          title: ev.summary || ev.title || 'Untitled Event',
          time: start ? new Date(start).getTime() : 0,
          dueAtStr: start ? new Date(start).toLocaleString() : '',
          category: 'calendar',
          repeat: 'none',
          status: 'event',
          ringing: false,
          type: 'calendar',
          description: ev.description || '',
          raw: ev
        });
      }
    }

    list.sort((a, b) => a.time - b.time);
    return list;
  }, [overview.reminders, overview.calendarEvents, activeTab, selectedDate]);

  const todayStr = toLocalDateString(currentTime);

  return (
    <section className={`reminders-hub ${compact ? 'compact' : ''}`} aria-label="Reminders and Calendar Hub">
      {/* 1. Ringing Reminders Banner */}
      {overview.ringingReminders.length > 0 && (
        <div className="ringing-banner" role="alert">
          <div className="ringing-info">
            <span className="ringing-icon">🔔</span>
            <div>
              <div className="ringing-title">{overview.ringingReminders[0].title}</div>
              <span className="ringing-badge">
                {overview.ringingReminders[0].category || 'Reminder'} Ringing
              </span>
            </div>
          </div>
          <div className="ringing-actions">
            <button
              type="button"
              className="btn-dismiss"
              disabled={busy}
              onClick={() => handleAction(overview.ringingReminders[0].id, 'dismiss')}
            >
              Dismiss
            </button>
            <button
              type="button"
              className="btn-snooze"
              disabled={busy}
              onClick={() => handleAction(overview.ringingReminders[0].id, 'snooze', 10)}
            >
              Snooze 10m
            </button>
          </div>
        </div>
      )}

      {/* 2. Hero Clock & Quick Timers */}
      <div className="reminders-hero">
        <div className="reminders-hero-top">
          <div>
            <div className="reminders-hero-clock">{formatClockTime(currentTime)}</div>
            <div className="reminders-hero-date">{formatClockDate(currentTime)}</div>
          </div>
        </div>

        <div className="quick-timers-wrap">
          <span className="quick-timers-label">Quick Timers:</span>
          <button type="button" className="quick-timer-btn" disabled={busy} onClick={() => handleQuickTimer(5)}>+5m</button>
          <button type="button" className="quick-timer-btn" disabled={busy} onClick={() => handleQuickTimer(15)}>+15m</button>
          <button type="button" className="quick-timer-btn" disabled={busy} onClick={() => handleQuickTimer(30)}>+30m</button>
          <button type="button" className="quick-timer-btn" disabled={busy} onClick={() => handleQuickTimer(60)}>+1h</button>
        </div>
      </div>

      {/* 3. Mini Month Calendar */}
      {!compact && (
        <div className="mini-calendar">
          <div className="cal-header">
            <span className="cal-title">{MONTH_NAMES[calMonth]} {calYear}</span>
            <div className="cal-nav">
              <button type="button" onClick={prevMonth} title="Previous Month">&lt;</button>
              <button type="button" onClick={goToToday} title="Go to Today">Today</button>
              <button type="button" onClick={nextMonth} title="Next Month">&gt;</button>
              {selectedDate && (
                <button type="button" onClick={() => setSelectedDate(null)} title="Clear filter">All Dates</button>
              )}
            </div>
          </div>

          <div className="cal-grid">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
              <div key={d} className="cal-day-header">{d}</div>
            ))}

            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} className="cal-cell empty" />
            ))}

            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const isToday = dateStr === todayStr;
              const isSelected = dateStr === selectedDate;
              const dayEvents = eventDatesMap.get(dateStr);
              const hasEvents = dayEvents?.hasReminder;
              const hasCalendar = dayEvents?.hasCalendar;

              return (
                <div
                  key={day}
                  className={`cal-cell ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''} ${hasEvents ? 'has-events' : ''} ${hasCalendar ? 'has-calendar' : ''}`}
                  onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                  title={`${dateStr}${hasEvents ? ' (Reminders)' : ''}${hasCalendar ? ' (Calendar)' : ''}`}
                >
                  {day}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. New Reminder / Timer / Alarm Form */}
      <form className="reminder-form" onSubmit={handleCreate}>
        <div className="form-row">
          <div className="form-group" style={{ flex: 2 }}>
            <label>Title</label>
            <input
              value={title}
              maxLength={300}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Call team, Check oven, Wake up"
              required
            />
          </div>
          <div className="form-group" style={{ flex: 1.5 }}>
            <label>When</label>
            <input
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="reminder">Reminder</option>
              <option value="timer">Timer</option>
              <option value="alarm">Alarm</option>
            </select>
          </div>

          <div className="form-group">
            <label>Repeat</label>
            <select value={repeat} onChange={(e) => setRepeat(e.target.value)}>
              <option value="none">None</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </div>

          <div className="form-group" style={{ justifyContent: 'flex-end' }}>
            <button type="submit" disabled={busy}>Add to Schedule</button>
          </div>
        </div>
      </form>

      {error && <p role="alert" style={{ color: '#ff6b6b', fontSize: '12px' }}>{error}</p>}

      {/* 5. Unified List & Filters */}
      <div className="schedule-list-header">
        <div className="schedule-tabs">
          <button
            type="button"
            className={`schedule-tab ${activeTab === 'all' ? 'active' : ''}`}
            onClick={() => setActiveTab('all')}
          >
            All
          </button>
          <button
            type="button"
            className={`schedule-tab ${activeTab === 'reminders' ? 'active' : ''}`}
            onClick={() => setActiveTab('reminders')}
          >
            Reminders ({overview.reminders.length})
          </button>
          <button
            type="button"
            className={`schedule-tab ${activeTab === 'calendar' ? 'active' : ''}`}
            onClick={() => setActiveTab('calendar')}
          >
            Google Calendar ({overview.calendarEvents.length})
          </button>
        </div>

        <button
          type="button"
          className="sync-cal-btn"
          disabled={syncingCalendar || busy}
          onClick={handleSyncCalendar}
          title="Force refresh Google Calendar from Composio"
        >
          <Icon name="calendar" />
          {syncingCalendar ? 'Syncing...' : 'Sync Calendar'}
        </button>
      </div>

      {selectedDate && (
        <div style={{ fontSize: '11px', color: '#92b6dc', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>Filtered to: <b>{selectedDate}</b></span>
          <button
            type="button"
            style={{ background: 'none', border: 'none', color: '#5597eb', cursor: 'pointer', padding: 0 }}
            onClick={() => setSelectedDate(null)}
          >
            (Show all dates)
          </button>
        </div>
      )}

      {/* 6. Unified Schedule Items */}
      <div className="schedule-items">
        {unifiedItems.length === 0 ? (
          <div className="empty-state">
            No scheduled reminders or calendar events{selectedDate ? ` on ${selectedDate}` : ''}.
          </div>
        ) : (
          unifiedItems.map((item) => (
            <div
              key={item.id}
              className={`schedule-item ${item.type} ${item.status === 'due' ? 'due' : ''}`}
            >
              <div className="item-left">
                <div className="item-title-row">
                  <span className="item-title">{item.title}</span>
                  <span className={`item-badge badge-${item.category}`}>
                    {item.category}
                  </span>
                  {item.repeat !== 'none' && (
                    <span className="item-badge" style={{ background: 'rgba(255,255,255,0.1)' }}>
                      {item.repeat}
                    </span>
                  )}
                </div>
                <div className="item-meta">
                  {item.dueAtStr}
                  {item.description ? ` · ${item.description}` : ''}
                </div>
              </div>

              {item.type === 'reminder' && (
                <div className="item-actions">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleAction(item.id, 'complete')}
                    title="Mark done"
                  >
                    Done
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleAction(item.id, 'snooze', 10)}
                    title="Snooze 10 minutes"
                  >
                    Snooze 10m
                  </button>
                  <button
                    type="button"
                    className="btn-del"
                    disabled={busy}
                    onClick={() => handleDelete(item.id)}
                    title="Delete"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
