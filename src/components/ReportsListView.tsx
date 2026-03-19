import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

interface Report {
  id: string;
  name: string | null;
  description: string | null;
  locked: boolean;
  createdAt: number;
}

const terminalStyles = {
  container: {
    backgroundColor: '#0a0a0a',
    color: '#00ff41',
    fontFamily: '"SF Mono", "Fira Code", "Cascadia Code", Menlo, Consolas, monospace',
    minHeight: '100vh',
    padding: '2rem',
    fontSize: '14px',
    lineHeight: '1.6',
  },
  dim: { color: '#555' },
  muted: { color: '#888' },
  green: { color: '#00ff41' },
  link: {
    color: '#00ff41',
    textDecoration: 'none',
  },
  linkHover: {
    textDecoration: 'underline',
  },
} as const;

function formatDate(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function ReportsListView() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => {
      document.head.removeChild(meta);
    };
  }, []);

  useEffect(() => {
    fetch('/api/reports')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: Report[]) => {
        setReports(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  return (
    <div style={terminalStyles.container}>
      <div style={{ maxWidth: '960px' }}>
        <pre style={{ margin: 0, ...terminalStyles.dim }}>
{`┌──────────────────────────────────────┐
│  wattprofit.ie // reports            │
└──────────────────────────────────────┘`}
        </pre>

        <div style={{ marginTop: '1.5rem', ...terminalStyles.muted }}>
          <span>$ wattprofit reports --list --sort=newest</span>
        </div>

        {loading && (
          <div style={{ marginTop: '1rem', ...terminalStyles.muted }}>
            <span>Fetching reports...</span>
            <span style={{ animation: 'blink 1s step-end infinite' }}> █</span>
          </div>
        )}

        {error && (
          <div style={{ marginTop: '1rem' }}>
            <div style={{ color: '#ff4444' }}>
              Error: {error}
            </div>
            <div style={{ marginTop: '0.5rem', ...terminalStyles.muted }}>
              $ █
            </div>
          </div>
        )}

        {!loading && !error && (
          <div style={{ marginTop: '0.75rem' }}>
            <div style={{ marginBottom: '0.25rem', ...terminalStyles.dim }}>
              total {reports.length}
            </div>

            <div style={{ whiteSpace: 'pre', overflowX: 'auto' }}>
              <div style={terminalStyles.muted}>
                {'ID                     DATE         NAME                            STATUS'}
              </div>
              <div style={terminalStyles.dim}>
                {'─'.repeat(80)}
              </div>

              {reports.length === 0 && (
                <div style={{ marginTop: '0.5rem', ...terminalStyles.muted }}>
                  No reports found.
                </div>
              )}

              {reports.map((report) => {
                const id = report.id.padEnd(23);
                const date = formatDate(report.createdAt);
                const name = (report.name || 'Untitled').slice(0, 30).padEnd(32);
                const status = report.locked ? '🔒 locked ' : 'unlocked';

                return (
                  <div
                    key={report.id}
                    style={{
                      display: 'flex',
                      gap: '0',
                      whiteSpace: 'pre',
                      marginBottom: '2px',
                    }}
                  >
                    <span style={terminalStyles.dim}>{id}</span>
                    <span style={terminalStyles.muted}>{date}   </span>
                    <span style={terminalStyles.green}>{name}</span>
                    <span style={terminalStyles.muted}>{status}</span>
                  </div>
                );
              })}
            </div>

            {reports.length > 0 && (
              <div style={{ marginTop: '1.5rem' }}>
                <div style={terminalStyles.muted}>
                  $ wattprofit reports --links
                </div>
                <div style={{ marginTop: '0.75rem' }}>
                  {reports.map((report) => (
                    <div key={report.id} style={{ marginBottom: '0.75rem' }}>
                      <div style={terminalStyles.dim}>
                        {report.name || 'Untitled'}
                      </div>
                      <div style={{ display: 'flex', gap: '1.5rem' }}>
                        <span style={terminalStyles.dim}>├── view </span>
                        <Link to={`/r/${report.id}`} style={terminalStyles.link}>
                          /r/{report.id}
                        </Link>
                      </div>
                      <div style={{ display: 'flex', gap: '1.5rem' }}>
                        <span style={terminalStyles.dim}>└── admin</span>
                        <Link to={`/r/${report.id}?mode=admin`} style={terminalStyles.link}>
                          /r/{report.id}?mode=admin
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginTop: '2rem', ...terminalStyles.dim }}>
              <span>$ █</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
